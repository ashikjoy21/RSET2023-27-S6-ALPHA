from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import queue
from urllib.request import Request, urlopen

import numpy as np  # type: ignore[import]
import sounddevice as sd  # type: ignore[import]
import webrtcvad  # type: ignore[import]
from faster_whisper import WhisperModel  # type: ignore[import]

from nlp.nlp_gloss import english_to_isl_gloss_hybrid

SAMPLE_RATE = 16000
# Small blocks so we can detect silence quickly (every 200 ms)
BLOCK_SECONDS = 0.2
BLOCK_FRAMES = int(SAMPLE_RATE * BLOCK_SECONDS)
# 20 ms frames for webrtcvad (must be 10, 20, or 30 ms)
VAD_FRAME_MS = 20
VAD_FRAME_SAMPLES = int(SAMPLE_RATE * VAD_FRAME_MS / 1000)
# How many consecutive silent blocks before we consider "speaker stopped"
SILENCE_BLOCKS_THRESHOLD = 2  # 4 * 0.2 s = 0.8 s of silence
# Min fraction of speech frames in a block to count as "speech"
SPEECH_RATIO_THRESHOLD = 0.25
# Max utterance length (seconds) to avoid huge buffers
MAX_UTTERANCE_SECONDS = 30


def _block_speech_ratio(audio_float: np.ndarray, vad: webrtcvad.Vad) -> float:
    """Return fraction of 20 ms frames in this block that VAD marks as speech."""
    audio_int16 = (np.clip(audio_float, -1.0, 1.0) * 32767).astype(np.int16)
    n_frames = 0
    speech_frames = 0
    for i in range(0, len(audio_int16) - VAD_FRAME_SAMPLES + 1, VAD_FRAME_SAMPLES):
        frame = audio_int16[i : i + VAD_FRAME_SAMPLES].tobytes()
        if vad.is_speech(frame, SAMPLE_RATE):
            speech_frames += 1
        n_frames += 1
    return speech_frames / n_frames if n_frames else 0.0


def _float_audio_to_pcm16_bytes(audio_float: np.ndarray) -> bytes:
    audio_int16 = (np.clip(audio_float, -1.0, 1.0) * 32767).astype(np.int16)
    return audio_int16.tobytes()


def _google_stt_transcribe(full_audio_float: np.ndarray, language: str = "en-US") -> str:
    """
    Transcribe using the unofficial Google Web Speech API via SpeechRecognition.
    Requires `pip install SpeechRecognition` and an internet connection.
    """
    try:
        import speech_recognition as sr  # type: ignore[import]
    except Exception as e:
        raise RuntimeError(
            "Google STT selected but SpeechRecognition is not installed. "
            "Install it with: pip install SpeechRecognition"
        ) from e

    r = sr.Recognizer()
    audio_bytes = _float_audio_to_pcm16_bytes(full_audio_float)
    audio_data = sr.AudioData(audio_bytes, SAMPLE_RATE, 2)
    try:
        return r.recognize_google(audio_data, language=language).strip()
    except sr.UnknownValueError:
        return ""


def _ensure_whisper_model(model: WhisperModel | None, language: str) -> WhisperModel:
    """
    Lazily load the Whisper model the first time we actually need it.
    """
    if model is None:
        print("Loading Whisper model (small, CPU, int8)…")
        model = WhisperModel("small", device="cpu", compute_type="int8")
    return model


def _transcribe_utterance(
    full_audio: np.ndarray, args: argparse.Namespace, model: WhisperModel | None
) -> tuple[str, str, WhisperModel | None]:
    """
    Transcribe one utterance using the requested STT mode.

    Returns (transcript, backend_used, updated_model).
    """
    transcript = ""
    backend = ""

    # 1) AUTO or GOOGLE: try Google first
    used_google = False
    if args.stt in {"auto", "google"}:
        google_lang = "en-US" if args.language.lower().startswith("en") else args.language
        try:
            transcript = _google_stt_transcribe(full_audio, language=google_lang)
            used_google = bool(transcript)
        except Exception as e:
            print(f"[warn] Google STT failed: {e}", file=sys.stderr)
            transcript = ""

    # 2) If we got nothing from Google and mode allows Whisper, fall back
    if (not transcript) and args.stt in {"auto", "whisper"}:
        model = _ensure_whisper_model(model, args.language)
        segments, _ = model.transcribe(
            full_audio,
            language=args.language,
            beam_size=5,
            vad_filter=True,
        )
        texts = [seg.text.strip() for seg in segments if seg.text.strip()]
        transcript = " ".join(texts).strip()

    if not transcript:
        return "", "", model

    backend = "Google" if used_google else "Whisper"
    return transcript, backend, model


def _should_stop_asr(webapp_url: str) -> bool:
    """
    Check the web app's ASR control flag; return True if ASR should stop.
    """
    control_url = f"{webapp_url.rstrip('/')}/api/asr_control"
    try:
        from urllib.request import urlopen as _urlopen  # local import to avoid top-level noise

        with _urlopen(control_url, timeout=1) as resp:  # type: ignore[call-arg]
            data = json.loads(resp.read().decode("utf-8"))
        return str(data.get("state", "")).lower() == "stopped"
    except Exception:
        # If control endpoint is unavailable, keep ASR running.
        return False


def _publisher_worker(q: "queue.Queue[dict]", webapp_url: str) -> None:
    while True:
        item = q.get()
        if item is None:
            return
        try:
            body = json.dumps(item).encode("utf-8")
            req = Request(
                f"{webapp_url.rstrip('/')}/api/publish",
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urlopen(req, timeout=3) as _:
                pass
        except Exception:
            # Don't crash ASR if web app isn't running.
            pass


def _parse_args(argv: list[str]) -> argparse.Namespace:
    """
    Keep CLI backwards-compatible with ad-hoc flags (e.g. `--mic`)
    by parsing only the options we care about and ignoring unknowns.
    """
    p = argparse.ArgumentParser(add_help=False)
    p.add_argument("--webapp-url", default=None)
    p.add_argument("--no-publish", action="store_true", default=False)
    # auto = try Google first, fall back to Whisper if unavailable/fails
    p.add_argument("--stt", choices=["auto", "whisper", "google"], default="auto")
    p.add_argument("--language", default="en")
    args, _unknown = p.parse_known_args(argv[1:])
    return args


def main() -> None:
    """
    Entry point: run microphone ASR, gloss the transcript, and optionally publish to the web app.
    """
    args = _parse_args(sys.argv)

    # --- Configure STT backend -------------------------------------------------
    model: WhisperModel | None = None
    if args.stt == "whisper":
        # Explicit Whisper mode – load eagerly so startup logs are clear.
        model = _ensure_whisper_model(model, args.language)
        print("STT mode: whisper (local faster-whisper).")
    elif args.stt == "google":
        print("STT mode: google (SpeechRecognition / recognize_google).")
    else:
        print("STT mode: auto (Google first, then Whisper fallback).")

    # --- Voice activity detection (when to cut utterances) --------------------
    vad = webrtcvad.Vad(2)  # 0=quality, 3=aggressive; 2 is a middle ground

    # --- Optional publishing to web_app.py ------------------------------------
    webapp_url = args.webapp_url or os.getenv("WEBAPP_URL", "http://127.0.0.1:8000")
    publish_enabled = not args.no_publish

    pub_q: "queue.Queue[dict] | None" = None
    if publish_enabled:
        pub_q = queue.Queue(maxsize=5)
        pub_thread = threading.Thread(
            target=_publisher_worker, args=(pub_q, webapp_url), daemon=True
        )
        pub_thread.start()
        print(f"Publishing ASR events to {webapp_url.rstrip('/')}/api/publish")
    else:
        print("Publishing disabled (--no-publish).")

    # --- Streaming microphone state ------------------------------------------
    utterance_buffer: list[np.ndarray] = []
    silence_block_count = 0

    print("Starting microphone ASR. Speak; we transcribe when you pause (silence).")
    print("Press Ctrl+C to stop.\n")

    def callback(indata, frames, time_info, status):
        nonlocal model, utterance_buffer, silence_block_count

        if status:
            print(f"[audio status] {status}", file=sys.stderr)

        audio_block = indata[:, 0].copy()
        speech_ratio = _block_speech_ratio(audio_block, vad)

        # Speech present: keep growing the current utterance.
        if speech_ratio >= SPEECH_RATIO_THRESHOLD:
            utterance_buffer.append(audio_block.copy())
            silence_block_count = 0

            # Cap buffer to avoid unbounded growth.
            total_samples = sum(b.size for b in utterance_buffer)#trim the buffer for ecent blocks
            if total_samples > SAMPLE_RATE * MAX_UTTERANCE_SECONDS:
                utterance_buffer = utterance_buffer[
                    -int(SAMPLE_RATE * MAX_UTTERANCE_SECONDS / audio_block.size) :
                ]
            return

        # No speech; if we have an active utterance, count silence.
        if not utterance_buffer:
            return

        silence_block_count += 1
        if silence_block_count < SILENCE_BLOCKS_THRESHOLD:
            return

        # Speaker stopped – finalize utterance and transcribe.
        full_audio = np.concatenate(utterance_buffer)
        utterance_buffer.clear()
        silence_block_count = 0

        # Let the web UI stop ASR cleanly (Stop button).
        if _should_stop_asr(webapp_url):
            raise KeyboardInterrupt

        transcript, backend, model = _transcribe_utterance(full_audio, args, model)
        if not transcript:
            return

        print(f"> ASR ({backend}) :", transcript)
        gloss_result = english_to_isl_gloss_hybrid(transcript)
        print("  GLOSS (ISL rules):", " ".join(gloss_result.gloss_tokens))

        # Publish to the web app (so it can auto-play videos).
        if pub_q is not None:
            try:
                pub_q.put_nowait(
                    {
                        "transcript": transcript,
                        "gloss_tokens": gloss_result.gloss_tokens,
                    }
                )
            except queue.Full:
                pass

    with sd.InputStream(
        channels=1,
        samplerate=SAMPLE_RATE,
        dtype="float32",
        blocksize=BLOCK_FRAMES,
        callback=callback,
    ):
        try:
            while True:
                sd.sleep(1000)
        except KeyboardInterrupt:
            print("\nStopping.")
        finally:
            if pub_q is not None:
                try:
                    pub_q.put_nowait(None)  # type: ignore[arg-type]
                except Exception:
                    pass


if __name__ == "__main__":
    main()

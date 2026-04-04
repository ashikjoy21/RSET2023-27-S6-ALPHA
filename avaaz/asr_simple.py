from __future__ import annotations

"""
Beginner-friendly ASR pipeline used by run_avaaz.sh.

Flow:
1) Read microphone audio in small chunks
2) Detect end-of-speech using VAD
3) Transcribe chunk (Whisper or Google STT)
4) Convert transcript -> gloss tokens (NLP)
5) Optionally publish event to web backend
"""

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
SILENCE_BLOCKS_THRESHOLD = 6  # 6 * 0.2 s = 1.2 s of silence (better context)
# Min fraction of speech frames in a block to count as "speech"
SPEECH_RATIO_THRESHOLD = 0.2
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
    p.add_argument("--stt", choices=["whisper", "google"], default="whisper")
    p.add_argument("--language", default="en")
    p.add_argument("--translate-to-english", action="store_true", default=False)
    p.add_argument("--beam-size", type=int, default=8)
    p.add_argument("--silence-blocks", type=int, default=SILENCE_BLOCKS_THRESHOLD)
    p.add_argument("--speech-ratio", type=float, default=SPEECH_RATIO_THRESHOLD)
    args, _unknown = p.parse_known_args(argv[1:])
    return args


def _is_english_language(lang: str) -> bool:
    """Return True if a language code represents English."""
    norm = (lang or "").strip().lower()
    return norm in {"en", "en-us", "en-gb"} or norm.startswith("en-")


def _translate_to_english(text: str, source_language: str) -> str:
    """
    Translate source text to English using deep-translator (Google Translate).
    Install once: pip install deep-translator
    """
    try:
        from deep_translator import GoogleTranslator  # type: ignore[import]
    except Exception as e:
        raise RuntimeError(
            "Translation requested but deep-translator is not installed. "
            "Install with: pip install deep-translator"
        ) from e

    # deep-translator expects simple language codes like 'ml', 'en'
    src = source_language.split("-")[0].lower()
    if src == "en":
        return text
    translated = GoogleTranslator(source=src, target="en").translate(text)
    return translated.strip() if translated else text


def _transcribe_audio(
    full_audio: np.ndarray, args: argparse.Namespace, model: WhisperModel | None
) -> str:
    """Transcribe one utterance using the selected STT backend."""
    if args.stt == "whisper":
        assert model is not None
        segments, _ = model.transcribe(
            full_audio,
            language=args.language,
            beam_size=max(1, args.beam_size),
            vad_filter=True,
            condition_on_previous_text=True,
            temperature=0.0,
        )
        texts = [seg.text.strip() for seg in segments if seg.text.strip()]
        return " ".join(texts).strip()

    # Google expects locale codes like en-US; map minimal cases.
    google_lang = "en-US" if args.language.lower().startswith("en") else args.language
    return _google_stt_transcribe(full_audio, language=google_lang)


def main():
    args = _parse_args(sys.argv)

    model: WhisperModel | None = None
    if args.stt == "whisper":
        # Use locally downloaded faster-whisper model snapshot to avoid HF Hub calls.
        model_path = (
            "models/faster-whisper-small/"
            "models--Systran--faster-whisper-small/"
            "snapshots/536b0662742c02347bc0e980a01041f333bce120"
        )
        print(f"Loading Whisper model from {model_path} (small, CPU, int8)…")
        model = WhisperModel(model_path, device="cpu", compute_type="int8")
    else:
        print("Using Google STT (SpeechRecognition / recognize_google)…")

    vad = webrtcvad.Vad(2)  # 0=quality, 3=aggressive; 2 is a middle ground

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

    buffer: list[np.ndarray] = []
    silence_blocks = 0

    print("Starting microphone ASR. Speak; we transcribe when you pause (silence).")
    print(
        f"ASR params: beam_size={max(1, args.beam_size)}, "
        f"silence_blocks={max(1, args.silence_blocks)}, "
        f"speech_ratio={args.speech_ratio:.2f}"
    )
    print("Press Ctrl+C to stop.\n")

    def callback(indata, frames, time_info, status):
        nonlocal buffer, silence_blocks
        if status:
            print(f"[audio status] {status}", file=sys.stderr)

        audio = indata[:, 0].copy()
        ratio = _block_speech_ratio(audio, vad)

        speech_ratio_threshold = max(0.01, min(1.0, args.speech_ratio))
        silence_blocks_threshold = max(1, args.silence_blocks)

        if ratio >= speech_ratio_threshold:
            buffer.append(audio.copy())
            silence_blocks = 0
            # Cap buffer to avoid unbounded growth
            total_samples = sum(b.size for b in buffer)
            if total_samples > SAMPLE_RATE * MAX_UTTERANCE_SECONDS:
                buffer = buffer[-int(SAMPLE_RATE * MAX_UTTERANCE_SECONDS / audio.size) :]
        else:
            if buffer:
                silence_blocks += 1
                if silence_blocks >= silence_blocks_threshold:
                    # Speaker stopped – transcribe accumulated audio
                    full_audio = np.concatenate(buffer)
                    buffer.clear()
                    silence_blocks = 0

                    transcript = _transcribe_audio(full_audio, args, model)

                    if not transcript:
                        return

                    gloss_input_text = transcript
                    if args.translate_to_english and not _is_english_language(args.language):
                        try:
                            gloss_input_text = _translate_to_english(transcript, args.language)
                        except Exception as e:
                            print(f"[translation warning] {e}", file=sys.stderr)
                            gloss_input_text = transcript

                    print("> ASR :", transcript)
                    if gloss_input_text != transcript:
                        print("> EN  :", gloss_input_text)
                    gloss_result = english_to_isl_gloss_hybrid(gloss_input_text)
                    print("  GLOSS (ISL rules):", " ".join(gloss_result.gloss_tokens))

                    # Publish to the web app (so it can auto-play videos)
                    if pub_q is not None:
                        try:
                            pub_q.put_nowait(
                                {
                                    "transcript": gloss_input_text,
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
            try:
                if pub_q is not None:
                    pub_q.put_nowait(None)  # type: ignore[arg-type]
            except Exception:
                pass


if __name__ == "__main__":
    main()
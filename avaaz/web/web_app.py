from __future__ import annotations

"""
Flask backend for Avaaz web demo.

Responsibilities:
- Serve frontend HTML
- Convert English -> gloss (`/api/gloss`)
- Map gloss tokens -> video URLs (`/api/sequence`)
- Accept live ASR events and store latest (`/api/publish`, `/api/latest`)
- Expose ASR control state for UI stop/start behavior
"""

import json
import os
from pathlib import Path
from urllib.parse import quote

from flask import Flask, jsonify, request, send_from_directory  # type: ignore[import]

from nlp.nlp_gloss import english_to_isl_gloss_hybrid


APP_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = APP_DIR / "web" / "web_static"

# Default: use the dataset folder inside the repo root
DEFAULT_VIDEO_DIR = APP_DIR / "INDIAN SIGN LANGUAGE ANIMATED VIDEOS "
VIDEO_DIR = Path(os.getenv("ISL_VIDEO_DIR", str(DEFAULT_VIDEO_DIR))).expanduser().resolve()

LEXICON_PATH = APP_DIR / "nlp" / "isl_lexicon.json"


def load_gloss_to_asset() -> dict[str, str]:
    data = json.loads(LEXICON_PATH.read_text(encoding="utf-8"))
    gloss_to_asset: dict[str, str] = {}
    for row in data:
        gloss = str(row.get("gloss", "")).strip().upper()
        asset = str(row.get("asset", "")).strip()
        if gloss and asset:
            gloss_to_asset[gloss] = asset
    return gloss_to_asset


GLOSS_TO_ASSET = load_gloss_to_asset()

app = Flask(__name__)

# In-memory “latest event” store for Live mode
LATEST_EVENT: dict[str, object] = {"id": 0}

# Simple ASR control flag so the UI can ask the ASR process to stop.
ASR_CONTROL: dict[str, str] = {"state": "running"}  # "running" or "stopped"


def _expand_tokens_with_fingerspelling(tokens: list[str]) -> tuple[list[str], list[str]]:
    """
    Expand gloss tokens so unknown alphabetic tokens are replaced by letters.

    Example:
      ["SO", "MY", "NAME", "ASHIK"] ->
        expanded_tokens: ["SO","MY","NAME","A","S","H","I","K"]
        missing: []   (assuming A..Z exist in the lexicon)

    Unknown non-alphabetic tokens are reported in missing but not expanded.
    """
    expanded: list[str] = []
    missing: list[str] = []

    for tok in tokens:
        t = tok.strip().upper()
        if not t:
            continue

        if t in GLOSS_TO_ASSET:
            expanded.append(t)
            continue

        if t.isalpha() and len(t) > 1:
            # Fingerspell as letters, but only if all letters exist.
            letters_ok = True
            for ch in t:
                if ch not in GLOSS_TO_ASSET:
                    letters_ok = False
                    break
            if letters_ok:
                expanded.extend(list(t))
                continue

        # At this point we don't know how to realize this token.
        missing.append(t)

    return expanded, missing


def _tokens_to_video_urls(tokens: list[str]) -> list[str]:
    """Convert gloss tokens to served video URLs using the loaded lexicon."""
    urls: list[str] = []
    for token in tokens:
        asset = GLOSS_TO_ASSET.get(token)
        if not asset:
            continue
        # URL-encode filenames (handles spaces like "Thank You.mp4")
        urls.append(f"/videos/{quote(asset)}")
    return urls


@app.get("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.get("/health")
def health():
    return jsonify(
        {
            "ok": True,
            "video_dir": str(VIDEO_DIR),
            "video_dir_exists": VIDEO_DIR.exists(),
            "lexicon_entries": len(GLOSS_TO_ASSET),
        }
    )


@app.post("/api/gloss")
def api_gloss():
    payload = request.get_json(silent=True) or {}
    text = str(payload.get("text", "")).strip()
    result = english_to_isl_gloss_hybrid(text)
    return jsonify(result.to_dict())


@app.post("/api/sequence")
def api_sequence():
    payload = request.get_json(silent=True) or {}
    tokens_in = payload.get("gloss_tokens") or []
    if not isinstance(tokens_in, list):
        return jsonify({"error": "gloss_tokens must be a list"}), 400

    tokens_raw = [str(t).strip().upper() for t in tokens_in if str(t).strip()]
    expanded_tokens, missing = _expand_tokens_with_fingerspelling(tokens_raw)

    urls = _tokens_to_video_urls(expanded_tokens)

    return jsonify(
        {
            "gloss_tokens": tokens_raw,
            "video_urls": urls,
            "missing": missing,
        }
    )


@app.post("/api/publish")
def api_publish():
    """
    Receive transcript and/or gloss tokens from an external producer (ASR script),
    map gloss -> videos, and store as the latest event for the web UI to consume.

    Payload examples:
      - {"transcript": "..."}  (server computes ISL gloss using rules)
      - {"transcript": "...", "gloss_tokens": ["HELLO","HOW","YOU"]}
      - {"gloss_tokens": ["HELLO","HOW","YOU"]}
    """
    global LATEST_EVENT
    payload = request.get_json(silent=True) or {}

    transcript = str(payload.get("transcript", "")).strip()
    tokens_in = payload.get("gloss_tokens") or []

    if transcript and not tokens_in:
        gloss_result = english_to_isl_gloss_hybrid(transcript)
        tokens = gloss_result.gloss_tokens
        gloss_meta = gloss_result.to_dict().get("meta", {})
    else:
        if not isinstance(tokens_in, list):
            return jsonify({"error": "gloss_tokens must be a list"}), 400
        tokens = [str(t).strip().upper() for t in tokens_in if str(t).strip()]
        gloss_meta = {"rules_applied": ["ExternalPublish"], "confidence": 1.0}

    expanded_tokens, missing = _expand_tokens_with_fingerspelling(tokens)

    urls = _tokens_to_video_urls(expanded_tokens)

    event_id = int(LATEST_EVENT.get("id", 0)) + 1
    LATEST_EVENT = {
        "id": event_id,
        "transcript": transcript,
        "gloss_tokens": tokens,
        "gloss_meta": gloss_meta,
        "video_urls": urls,
        "missing": missing,
    }
    return jsonify(LATEST_EVENT)


@app.get("/api/latest")
def api_latest():
    return jsonify(LATEST_EVENT)


@app.get("/api/asr_control")
def api_asr_control_get():
    """Return current ASR control state."""
    return jsonify(ASR_CONTROL)


@app.post("/api/asr_control")
def api_asr_control_set():
    """Update ASR control state (e.g. {"state": "stopped"})."""
    global ASR_CONTROL
    payload = request.get_json(silent=True) or {}
    state = str(payload.get("state", "")).strip().lower()
    if state not in {"running", "stopped"}:
        return jsonify({"error": "state must be 'running' or 'stopped'"}), 400
    ASR_CONTROL = {"state": state}
    return jsonify(ASR_CONTROL)


@app.get("/videos/<path:filename>")
def serve_video(filename: str):
    # Flask already path-normalizes; serve only from configured dir
    return send_from_directory(VIDEO_DIR, filename)


if __name__ == "__main__":
    if not STATIC_DIR.exists():
        raise SystemExit(f"Missing static dir: {STATIC_DIR}")
    port = int(os.getenv("PORT", "8000"))
    # Disable reloader to avoid watchdog/fsevents issues on some setups.
    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)


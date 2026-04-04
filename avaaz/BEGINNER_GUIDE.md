# Avaaz Beginner Guide

This project turns spoken English into ISL-style gloss tokens and then plays matching sign videos.

## Runtime Path (What actually runs)

1. Start with `run_avaaz.sh`
2. It launches:
   - `web/web_app.py` (Flask backend + frontend host)
   - `asr_simple.py` (microphone ASR pipeline)
3. Core NLP lives in:
   - `nlp/nlp_gloss.py` (rules + hybrid ML fallback)
   - `nlp/ml_gloss.py` (T5 model adapter)
4. Video lookup data:
   - `nlp/isl_lexicon.json`
   - `INDIAN SIGN LANGUAGE ANIMATED VIDEOS /`

## File Responsibilities

- `asr_simple.py`
  - Records mic audio
  - Detects sentence boundaries (VAD)
  - Transcribes speech
  - Converts transcript to gloss
  - Publishes latest event to backend

- `web/web_app.py`
  - Serves UI (`/`)
  - Maps gloss -> video URLs (`/api/sequence`)
  - Receives ASR events (`/api/publish`)
  - Provides latest event for live UI polling (`/api/latest`)

- `web/web_static/index.html`
  - UI and player logic
  - Live polling and playback queue
  - Fallback letter-by-letter playback for unknown names/place words

- `nlp/nlp_gloss.py`
  - Rule-based glossing for common phrases
  - Lexical fallback for unknown patterns
  - Optional ML fallback for better coverage

## Typical Debug Order

1. ASR text wrong? -> check `asr_simple.py`
2. Gloss tokens odd? -> check `nlp/nlp_gloss.py`
3. Missing videos? -> check `nlp/isl_lexicon.json` + backend mapping in `web_app.py`
4. Playback/UI issues? -> check `web/web_static/index.html`

#!/usr/bin/env bash

# Simple helper script to run Avaaz end-to-end:
#   1) Start web_app.py (Flask) on a given PORT
#   2) Start asr_simple.py pointing to that web app
#
# Usage:
#   chmod +x run_avaaz.sh
#   ./run_avaaz.sh
# or with a custom port:
#   PORT=8002 ./run_avaaz.sh

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-8000}"
WEBAPP_URL="${WEBAPP_URL:-http://127.0.0.1:${PORT}}"

echo "========================================"
echo " Avaaz – end-to-end demo launcher"
echo "----------------------------------------"
echo " Web app URL : ${WEBAPP_URL}"
echo " ASR backend : Whisper (local)"
echo "----------------------------------------"
echo " Hint: open ${WEBAPP_URL} in your browser."
echo "       Press Ctrl+C here to stop ASR."
echo "========================================"
echo

echo "[1/2] Starting web app (Flask) on port ${PORT} ..."
PORT="${PORT}" python -m web.web_app &
WEBAPP_PID=$!

sleep 3

echo "[2/2] Starting microphone ASR (asr_simple.py) with WEBAPP_URL=${WEBAPP_URL} ..."
WEBAPP_URL="${WEBAPP_URL}" python asr_simple.py
echo
echo "Shutting down web app (PID ${WEBAPP_PID}) ..."
kill "${WEBAPP_PID}" 2>/dev/null || true


#!/usr/bin/env bash
# Start the CosyVoice web demo on a Linux/AutoDL instance.
#
# Usage:
#   ./start_cloud.sh              # http://0.0.0.0:6006
#   PORT=6007 ./start_cloud.sh    # custom port
#   VENV=/path/to/venv ./start_cloud.sh
#
# The server runs inside a detached `screen` session so it survives SSH
# disconnects. Re-running the script is safe: it refuses to start twice.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="${VENV:-/root/autodl-tmp/.venv-cosyvoice311}"
PORT="${PORT:-6006}"
SESSION="${SESSION:-tts_app}"
LOG="${LOG:-/root/autodl-tmp/tts_app.log}"

if [ ! -x "$VENV/bin/python" ]; then
    echo "[start] python not found in VENV=$VENV" >&2
    exit 1
fi
if [ ! -f "$ROOT/models/CosyVoice3-0.5B/llm.pt" ]; then
    echo "[start] model missing under $ROOT/models/CosyVoice3-0.5B" >&2
    exit 1
fi

export TTS_PROJECT_ROOT="$ROOT"
export COSYVOICE_DIR="$ROOT/CosyVoice"
export MATCHA_TTS_DIR="$ROOT/third_party/Matcha-TTS"
export COSYVOICE_MODEL_DIR="${COSYVOICE_MODEL_DIR:-$ROOT/models/CosyVoice3-0.5B}"
export PYTHONPATH="$COSYVOICE_DIR:$MATCHA_TTS_DIR"

if screen -ls 2>/dev/null | grep -q "\.${SESSION}[[:space:]]"; then
    echo "[start] screen session '${SESSION}' already running; nothing to do."
    exit 0
fi

# `screen` inherits the exported environment above.
screen -dmS "$SESSION" bash -lc "cd '$ROOT/app' && source '$VENV/bin/activate' && exec python -m uvicorn main:app --host 0.0.0.0 --port '$PORT' > '$LOG' 2>&1"

echo "[start] launched: screen='${SESSION}' port='${PORT}' log='${LOG}'"
echo "[start] tail -f '$LOG'   # to watch the log"

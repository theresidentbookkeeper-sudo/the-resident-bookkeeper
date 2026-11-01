#!/usr/bin/env bash
# Check (and on first run, install) everything awa-video-reel needs. Prints READY, or a NEED_* line saying what is missing.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
FX="$SKILL/effects"; [ -d "$FX/scripts" ] || FX="$HOME/.claude/skills/effects"   # bundled engine, else a separate install

command -v ffmpeg > /dev/null && command -v ffprobe > /dev/null || { echo "NEED_FFMPEG: winget install ffmpeg (Mac: brew install ffmpeg)"; exit 1; }
command -v node > /dev/null || { echo "NEED_NODE: install Node.js 20+ from nodejs.org"; exit 1; }
[ -d "$HERE/../recorder/node_modules/puppeteer-core" ] && [ -d "$HERE/../recorder/node_modules/@xterm/xterm" ] || (cd "$HERE/../recorder" && npm install --silent)
[ -d "$FX/scripts" ] || { echo "NEED_EFFECTS: the effects folder is missing from this skill. Download awa-video-reel again and copy the whole folder."; exit 1; }
[ -f "$FX/scripts/fx_private.py" ] || { echo "NEED_ADAPTER: fx_private.py (the landscape adapter) is missing from $FX/scripts"; exit 1; }

# the effects skill's own setup.sh assumes .venv/bin; on Windows the venv keeps python in .venv/Scripts
PY="$FX/.venv/Scripts/python.exe"; [ -x "$PY" ] || PY="$FX/.venv/bin/python"
if ! [ -x "$PY" ] || ! "$PY" -c "import mediapipe, cv2, PIL, numpy, faster_whisper" 2> /dev/null; then
  if ! [ -x "$PY" ]; then
    for v in python3.12 python3.11 python3 python py; do command -v "$v" > /dev/null && SYS="$v" && break; done
    [ -n "${SYS:-}" ] || { echo "NEED_PYTHON: install Python 3.11 or 3.12"; exit 1; }
    "$SYS" -m venv "$FX/.venv"
    PY="$FX/.venv/Scripts/python.exe"; [ -x "$PY" ] || PY="$FX/.venv/bin/python"
  fi
  "$PY" -m pip install -q -r "$FX/requirements.txt" faster-whisper
fi
[ -d "$HERE/../remotion/node_modules" ] || (cd "$HERE/../remotion" && npm install --silent)
echo READY

#!/usr/bin/env bash
# First step of an awa-video-reel job: check the tools, look at the video and transcribe it.
#   bash prepare.sh <video>
# Creates a job folder with probe.json and words.json, and prints the transcript and the folder.
# Jobs live in a work folder so Downloads only gets finished files: $EDIT_REEL_JOBS, else the path in the skill's
# jobs-folder.txt (a local setting, not shipped), else ~/Videos/awa-video-reel. Each job is <work folder>/<video-name>/.
set -euo pipefail
SRC="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$HERE/setup.sh" > /dev/null
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
FX="$SKILL/effects"; [ -d "$FX/scripts" ] || FX="$HOME/.claude/skills/effects"   # bundled engine, else a separate install
PY="$FX/.venv/Scripts/python.exe"; [ -x "$PY" ] || PY="$FX/.venv/bin/python"
WS="${EDIT_REEL_JOBS:-}"
[ -n "$WS" ] || { [ -f "$HERE/../jobs-folder.txt" ] && WS="$(head -1 "$HERE/../jobs-folder.txt" | tr -d '\r')"; } || true
[ -n "$WS" ] || WS="$HOME/Videos/awa-video-reel"
JOB="$WS/$(basename "${SRC%.*}")"
mkdir -p "$JOB"

"$PY" -I "$HERE/probe.py" "$SRC" "$JOB/probe.json" 2> /dev/null
# words.py writes <video>.words.json next to the video; small.en is accurate enough for captions
WHISPER_MODEL="${WHISPER_MODEL:-small.en}" "$PY" -I "$FX/scripts/words.py" "$SRC" > "$JOB/words.txt"
mv "${SRC%.*}.words.json" "$JOB/words.json"
cat "$JOB/words.txt"
echo "JOB=$JOB"

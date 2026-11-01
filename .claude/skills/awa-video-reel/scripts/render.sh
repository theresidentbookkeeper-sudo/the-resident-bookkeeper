#!/usr/bin/env bash
# Render an awa-video-reel job: face-tracked effects -> HyperFrames captions and cards -> Remotion intro/end cards -> one MP4.
#   bash render.sh <job_dir>
# The job dir holds probe.json and words.json (from prepare.sh) plus the plan Claude wrote and the person approved:
#   fx.json     {"effects": [...]}            effects skill plan (may be empty)
#   edit.json   {"captions": {...}, "cards": [...]}   see hf_build.py
#   cards.json  {"intro": {...} | null, "end": {...} | null}   Remotion props (text only; size and fps are filled in here)
# Output: <job_dir>/final.mp4, copied to Downloads as <video-name>_edited.mp4.
set -euo pipefail
JOB="$(cd "$1" && pwd)"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
FX="$SKILL/effects"; [ -d "$FX/scripts" ] || FX="$HOME/.claude/skills/effects"   # bundled engine, else a separate install
PY="$FX/.venv/Scripts/python.exe"; [ -x "$PY" ] || PY="$FX/.venv/bin/python"
HF="npx -y hyperframes@0.8.222"
j() { "$PY" -c "import json,sys; d=json.load(open(sys.argv[1])); print(eval(sys.argv[2]))" "$@"; }

SRC=$(j "$JOB/probe.json" "d['path']")
NAME=$(basename "${SRC%.*}")
FPS=$(j "$JOB/probe.json" "min(30, round(d['fps']))")

# 1. effects (or a plain resize to a 1080 short side when the plan has none). SKIP_FX=1 reuses stage1_fx.mp4
#    when only captions, cards or the Remotion cards changed.
if [ "${SKIP_FX:-0}" = 1 ] && [ -f "$JOB/stage1_fx.mp4" ]; then
  echo "== reusing stage1_fx.mp4"
elif [ "$(j "$JOB/fx.json" "len(d.get('effects', d) if isinstance(d, dict) else d)")" -gt 0 ]; then
  echo "== effects"
  "$PY" -I "$FX/scripts/fx.py" --width 1080 --plan "$JOB/fx.json" "$SRC" "$JOB/stage1_fx.mp4"
else
  echo "== no effects, resizing"
  ffmpeg -v error -y -i "$SRC" -vf "scale='if(lt(iw,ih),1080,-2)':'if(lt(iw,ih),-2,1080)',fps=$FPS" \
    -c:v libx264 -crf 17 -preset medium -pix_fmt yuv420p -c:a aac -b:a 192k "$JOB/stage1_fx.mp4"
fi
IFS=, read -r W H < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$JOB/stage1_fx.mp4")
[ -n "${H:-}" ] || { echo "could not read the size of stage1_fx.mp4" >&2; exit 1; }

# cinematic style: a film look on the footage (teal shadows, warm highlights, a touch less colour, soft vignette, fine grain)
FOOTAGE="$JOB/stage1_fx.mp4"
if [ "$(j "$JOB/edit.json" "d.get('style', 'clean')")" = cinematic ]; then
  if [ "${SKIP_HF:-0}" != 1 ] || [ ! -f "$JOB/stage1_look.mp4" ]; then
    echo "== cinematic grade"
    ffmpeg -v error -y -i "$JOB/stage1_fx.mp4" -vf "eq=contrast=1.08:saturation=0.88:gamma=0.97,colorbalance=rs=-0.03:gs=-0.005:bs=0.04:rh=0.04:gh=0.01:bh=-0.035,vignette=angle=0.55,noise=alls=5:allf=t+u" \
      -c:v libx264 -crf 16 -preset medium -pix_fmt yuv420p -c:a copy "$JOB/stage1_look.mp4"
  fi
  FOOTAGE="$JOB/stage1_look.mp4"
fi

# 2. website b-roll (only when the plan has some, which means the person asked for it), then HyperFrames captions and cards
if [ "$(j "$JOB/edit.json" "len([b for b in d.get('broll', []) if not (b.get('image') or b.get('video'))])")" -gt 0 ]; then
  echo "== capturing b-roll"
  "$PY" -I "$HERE/broll.py" "$JOB"
fi
# SKIP_HF=1 reuses stage2_overlay.mp4 when only cards.json (intro/end cards) or the music and sound changed
if [ "${SKIP_HF:-0}" = 1 ] && [ -f "$JOB/stage2_overlay.mp4" ] && [ -f "$JOB/hf/cues.json" ]; then
  echo "== reusing stage2_overlay.mp4"
else
  echo "== captions and cards"
  "$PY" -I "$HERE/hf_build.py" "$JOB/hf" "$FOOTAGE" "$JOB/words.json" "$JOB/edit.json" "$JOB/probe.json"
  $HF check "$JOB/hf" --json > "$JOB/hf_check.json" 2>/dev/null || true
  "$PY" -c "import json,sys; c=json.load(open(sys.argv[1])); l=c.get('lint',{}); sys.exit(0 if l.get('errorCount',0)==0 else 'HyperFrames check found errors, see hf_check.json')" "$JOB/hf_check.json"
  # one retry: the renderer occasionally fails while closing its browser
  $HF render "$JOB/hf" -o "$JOB/stage2_overlay.mp4" --fps "$FPS" --quiet || $HF render "$JOB/hf" -o "$JOB/stage2_overlay.mp4" --fps "$FPS" --quiet
fi

# 3. Remotion intro / end cards at the same size and fps
PARTS=()
card() {  # card <IntroCard|EndCard> <key> <out>
  local props
  props=$("$PY" -c "
import json,sys
c=json.load(open(sys.argv[1])).get(sys.argv[2])
accent=json.load(open(sys.argv[6])).get('theme',{}).get('accent')
if c and accent: c.setdefault('accent', accent)
print('' if not c else json.dumps(dict(c, width=int(sys.argv[3]), height=int(sys.argv[4]), fps=int(sys.argv[5]))))" \
    "$JOB/cards.json" "$2" "$W" "$H" "$FPS" "$JOB/edit.json")
  [ -n "$props" ] || return 1
  echo "== $1"
  bash "$HERE/../remotion/render.sh" "$1" "$3" "$props" > /dev/null
}
card IntroCard intro "$JOB/intro.mp4" && PARTS+=("$JOB/intro.mp4")
PARTS+=("$JOB/stage2_overlay.mp4")
card EndCard end "$JOB/end.mp4" && PARTS+=("$JOB/end.mp4")

# 4. join, re-encoding through the concat filter so profiles and timebases never clash
echo "== joining ${#PARTS[@]} part(s)"
ARGS=(); FILT=""
for i in "${!PARTS[@]}"; do
  ARGS+=(-i "${PARTS[$i]}")
  FILT+="[$i:v]scale=$W:$H,fps=$FPS,format=yuv420p,setsar=1[v$i];[$i:a]aresample=48000,aformat=channel_layouts=stereo[a$i];"
done
for i in "${!PARTS[@]}"; do FILT+="[v$i][a$i]"; done
FILT+="concat=n=${#PARTS[@]}:v=1:a=1[v][a]"
ffmpeg -v error -y "${ARGS[@]}" -filter_complex "$FILT" -map "[v]" -map "[a]" \
  -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "$JOB/joined.mp4"

# 5. sound: music ducked under the voice, effects on every visual beat, loudness for social; plus a no-music copy
echo "== mixing sound"
INTRO=0; [ -f "$JOB/intro.mp4" ] && [[ " ${PARTS[*]} " == *" $JOB/intro.mp4 "* ]] && \
  INTRO=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$JOB/intro.mp4")
"$PY" -I "$HERE/mix.py" "$JOB" "$JOB/joined.mp4" "$INTRO"

DL="${USERPROFILE:-$HOME}/Downloads"
cp "$JOB/final.mp4" "$DL/${NAME}_edited.mp4"
cp "$JOB/final_nomusic.mp4" "$DL/${NAME}_edited_nomusic.mp4"
[ -f "$JOB/MUSIC-CREDIT.txt" ] && echo "Music credit to add to the caption: $(cat "$JOB/MUSIC-CREDIT.txt")"
echo "Done: $DL/${NAME}_edited.mp4 (and ${NAME}_edited_nomusic.mp4)"

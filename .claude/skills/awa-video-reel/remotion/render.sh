#!/usr/bin/env bash
# Render one awa-video-reel card.
#   bash render.sh <IntroCard|EndCard> <out.mp4> '<props json>'
# MP4 output: H.264 yuv420p (BT.709) at the size and fps in the props, plus a silent
# stereo AAC track at 48 kHz, so it concats cleanly with a talking-head clip.
# A .png output path renders a still of the last frame instead.
# Props (all optional): width, height, fps, durationInFrames or seconds, accent (hex), and the card's text props.
#   IntroCard: kicker, word, claudeLogo     EndCard: line1, handle, sub
set -euo pipefail

usage() {
	echo "usage: bash render.sh <IntroCard|EndCard> <out.mp4|out.png> '<props json>'" >&2
	exit 1
}

[ $# -ge 2 ] || usage
COMP="$1"
OUT="$2"
PROPS="${3:-}"
[ -n "$PROPS" ] || PROPS='{}'
case "$COMP" in
	IntroCard | EndCard) ;;
	*) echo "error: composition must be IntroCard or EndCard, got '$COMP'" >&2 && usage ;;
esac

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Accept Windows paths (C:\...) as well as POSIX ones in Git Bash.
if command -v cygpath > /dev/null 2>&1; then OUT="$(cygpath -u "$OUT")"; fi
mkdir -p "$(dirname "$OUT")"
OUT_ABS="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"

cd "$HERE"
[ -d node_modules/remotion ] || npm install --no-audit --no-fund

# Props go through a file: JSON on a Windows command line gets its quotes mangled.
TMP=".render-tmp/$$-$RANDOM"
mkdir -p "$TMP"
trap 'rm -rf "$TMP"; rmdir .render-tmp 2>/dev/null || true' EXIT
printf '%s' "$PROPS" > "$TMP/props.json"

# Validate the JSON and the copy rules before spending time on a render.
node - "$TMP/props.json" <<'JS'
const fs = require('fs');
let p;
try {
	p = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
} catch (e) {
	console.error('error: props are not valid JSON: ' + e.message);
	process.exit(1);
}
if (!p || typeof p !== 'object' || Array.isArray(p)) {
	console.error('error: props must be a JSON object');
	process.exit(1);
}
for (const k of ['width', 'height', 'fps', 'durationInFrames', 'seconds']) {
	if (k in p && !(typeof p[k] === 'number' && p[k] > 0)) {
		console.error(`error: ${k} must be a positive number`);
		process.exit(1);
	}
}
for (const [k, v] of Object.entries(p)) {
	if (typeof v === 'string' && /[—;]/.test(v)) {
		console.error(`error: ${k} contains an em dash or semicolon, which are not allowed on screen: "${v}"`);
		process.exit(1);
	}
}
if ('accent' in p && !(typeof p.accent === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(p.accent))) {
	console.error('error: accent must be a hex color like "#FFD60A"');
	process.exit(1);
}
for (const k of ['width', 'height']) {
	if (k in p && Math.round(p[k] / 2) * 2 !== p[k]) console.error(`warning: ${k} ${p[k]} is odd, rounded to an even number for H.264`);
}
JS

START=$(date +%s%N)
case "$OUT_ABS" in
*.png | *.PNG)
	npx remotion still src/index.ts "$COMP" "$TMP/still.png" --props="$TMP/props.json" --frame=-1 --image-format=png --log=error
	cp "$TMP/still.png" "$OUT_ABS"
	;;
*)
	npx remotion render src/index.ts "$COMP" "$TMP/video.mp4" --props="$TMP/props.json" \
		--codec=h264 --pixel-format=yuv420p --color-space=bt709 --crf=16 --image-format=png --muted --log=error
	# Silent stereo AAC at 48 kHz, cut to the exact video length.
	DUR=$(ffprobe -v error -select_streams v:0 -show_entries stream=duration -of csv=p=0 "$TMP/video.mp4")
	ffmpeg -y -v error -i "$TMP/video.mp4" -f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=48000" \
		-map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 -t "$DUR" -movflags +faststart "$OUT_ABS"
	;;
esac
END=$(date +%s%N)
ELAPSED=$(awk "BEGIN {printf \"%.1f\", ($END - $START) / 1e9}")

case "$OUT_ABS" in
*.png | *.PNG)
	SIZE=$(ffprobe -v error -show_entries stream=width,height -of csv=s=x:p=0 "$OUT_ABS")
	echo "done: $OUT_ABS ($COMP last frame, $SIZE, ${ELAPSED}s)"
	;;
*)
	V=$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,pix_fmt,width,height,r_frame_rate,nb_frames -of csv=p=0 "$OUT_ABS")
	A=$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,sample_rate,channels -of csv=p=0 "$OUT_ABS")
	echo "done: $OUT_ABS ($COMP, video $V, audio $A, ${ELAPSED}s)"
	;;
esac

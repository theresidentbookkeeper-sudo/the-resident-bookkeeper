"""Look at a video before editing it: size, shape, length, fps, audio, and whether (and where) a person is on camera.

usage: python probe.py <video> [out.json]
Prints JSON. "face" is the median face box over 12 sampled frames as fractions of the frame (cx, cy, w),
or null when no face shows in at least 3 of them. "shape" is portrait, tall (4:5), square or landscape.
"""
import json, os, subprocess, sys
import numpy as np
import cv2

_SKILL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FX = os.path.join(_SKILL, 'effects')   # bundled engine, else a separate install
if not os.path.isdir(os.path.join(FX, 'scripts')): FX = os.path.join(os.path.expanduser('~'), '.claude', 'skills', 'effects')
MAX_SECONDS = 60


def ffprobe(path):
    j = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,r_frame_rate:format=duration',
                                   '-of', 'json', path], capture_output=True, text=True, check=True).stdout)
    v = next(s for s in j['streams'] if s['codec_type'] == 'video')
    n, d = v['r_frame_rate'].split('/')
    return float(j['format']['duration']), float(n) / float(d or 1), any(s['codec_type'] == 'audio' for s in j['streams'])


def frame_at(path, t, w=540):
    """One decoded frame (ffmpeg applies rotation metadata, so this is the real display shape)."""
    png = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{t:.2f}', '-i', path, '-frames:v', '1', '-vf', f'scale={w}:-2',
                          '-f', 'image2pipe', '-vcodec', 'png', '-'], capture_output=True).stdout
    return cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_COLOR) if png else None


def main():
    src = sys.argv[1]
    dur, fps, audio = ffprobe(src)
    full = frame_at(src, 0, -1)
    H, W = full.shape[:2]
    r = W / H
    shape = 'portrait' if r < 0.7 else 'tall' if r < 0.9 else 'square' if r <= 1.1 else 'landscape'
    fd = None; boxes = []
    for k in range(12):
        im = frame_at(src, dur * (k + 0.5) / 12)
        if im is None: continue
        h, w = im.shape[:2]
        if fd is None: fd = cv2.FaceDetectorYN.create(os.path.join(FX, 'models', 'yunet.onnx'), '', (w, h), 0.6, 0.3, 20)
        fd.setInputSize((w, h))
        _, f = fd.detect(im)
        if f is not None and len(f):
            b = max(f, key=lambda b: b[2] * b[3] * b[-1])
            boxes.append(((b[0] + b[2] / 2) / w, (b[1] + b[3] / 2) / h, b[2] / w))
    face = [round(float(v), 3) for v in np.median(np.array(boxes), axis=0)] if len(boxes) >= 3 else None
    out = {'path': os.path.abspath(src), 'width': W, 'height': H, 'shape': shape, 'duration': round(dur, 2),
           'fps': round(fps, 3), 'audio': audio, 'person': face is not None, 'face': face,
           'face_frames': f'{len(boxes)}/12', 'too_long': dur > MAX_SECONDS + 0.5}
    s = json.dumps(out, indent=1)
    if len(sys.argv) > 2: open(sys.argv[2], 'w').write(s)
    print(s)


if __name__ == '__main__':
    main()

"""Make b-roll (only ever run when the person asked for it).

usage: python broll.py <job_dir>
Reads edit.json "broll": [...]. Each entry is one of
  a recording of the site being used:  {"url": "...", "start": s, "end": e, "steps": [ ...recorder steps... ]}
  their own recording or a result:     {"start": s, "end": e, "file": "C:/path/video.mp4", "label": "...",
                                        "from": 0, "speed": 1.5}   (from/speed optional: default fits it to the slot)
  a scrolling screenshot:              {"url": "...", "start": s, "end": e, "skip_top": 0}
  Claude Code being given a prompt:    {"start": s, "end": e, "claude": {"prompt": "...", "extra": "...", "type_at": t}}
Site recordings run recorder/record.mjs in the installed Chrome (real clicks, scrolls and a visible cursor) at the size of
the split-screen window, then are sped up or slowed down to fill the b-roll's slot. Screenshots use
`npx hyperframes capture`. A Claude Code entry runs recorder/claude_session.mjs: a real Claude Code session in a terminal
that pastes the prompt, types the "extra" line (the person's own details) from type_at on the video's clock, and presses
Enter. It never approves anything and stops as Claude starts. recorder/render_cast.mjs replays it at the window's size.
Writes "video" or "image" plus "label" (and "frame") back into edit.json for hf_build.py.
"""
import json, os, re, subprocess, sys
from urllib.parse import urlparse
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__))
HF = ['npx', '-y', 'hyperframes@0.8.222']
sys.path.insert(0, HERE)


def viewport(job):
    """Recording size that matches the browser window hf_build draws (desktop-width page, same aspect)."""
    from hf_build import Layout, broll_geometry, ffprobe
    probe = json.load(open(os.path.join(job, 'probe.json')))
    src = os.path.join(job, 'stage1_fx.mp4')
    W, H = (ffprobe(src)[:2] if os.path.exists(src) else (probe['width'], probe['height']))
    L = Layout(W, H, probe)
    (_, _, pw, ph), _ = broll_geometry(L)
    u = L.u; m = 28 * u; bar = 70 * u
    vw, vh = pw - 2 * m, ph - 2 * m - bar
    width = 1200 if vw / vh > 1.1 else 1000
    return [width, int(round(width * vh / vw / 2) * 2)]


def view_size(job):
    """Inner size of the b-roll window hf_build draws, in output pixels."""
    from hf_build import Layout, broll_geometry, ffprobe
    probe = json.load(open(os.path.join(job, 'probe.json')))
    src = os.path.join(job, 'stage1_fx.mp4')
    W, H = (ffprobe(src)[:2] if os.path.exists(src) else (probe['width'], probe['height']))
    L = Layout(W, H, probe)
    (_, _, pw, ph), _ = broll_geometry(L)
    u = L.u; m = 28 * u; bar = 70 * u
    return int(round((pw - 2 * m) / 2) * 2), int(round((ph - 2 * m - bar) / 2) * 2)


def claude_broll(b, c, rec, vid, job, fps):
    """Record Claude Code being given the prompt (cached in rec/), then replay it to fill the slot: the paste lands just
    after the window opens, the typing runs from type_at, and Enter plus Claude starting close the slot."""
    REC = os.path.join(HERE, '..', 'recorder')
    ev_p = os.path.join(rec, 'events.json')
    if not os.path.exists(ev_p):
        cwd = c.get('cwd') or ('C:/claude-demo' if os.name == 'nt' else os.path.expanduser('~/claude-demo'))
        cfg = {'cwd': cwd, 'out_dir': os.path.abspath(rec), 'prompt': c['prompt'], 'extra': c.get('extra', ''),
               'cols': c.get('cols', 54), 'rows': c.get('rows', 22), 'work_seconds': 3,
               'args': ['--append-system-prompt', 'Work on your own without asking questions.']}
        os.makedirs(rec, exist_ok=True)
        json.dump(cfg, open(os.path.join(rec, 'session.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        r = subprocess.run(['node', os.path.join(REC, 'claude_session.mjs'), os.path.join(rec, 'session.json')],
                           capture_output=True, text=True)
        if r.returncode or not os.path.exists(ev_p): sys.exit(f'Claude Code recording failed: {r.stdout[-600:]} {r.stderr[-600:]}')
    ev = json.load(open(ev_p))
    if ev.get('email_on_screen'): print('WARNING: an email address shows in the Claude Code window. Check the frames before posting.')
    slot = b['end'] - b['start']
    P, S, E, N = ev['paste'], ev['type_start'], ev['type_end'], ev['enter']
    ta = min(max(0.9, float(c.get('type_at', b['start'] + slot * 0.35)) - b['start']), slot - 1.2)
    plan = {'fps': fps, 'bg': '#0C0C0C', 'segments': [
                [0.0, 0.25, P - 0.3, P - 0.05], [0.25, ta, P, S], [ta, slot - 0.55, S, E],
                [slot - 0.55, slot - 0.35, E, N - 0.05], [slot - 0.35, slot, N - 0.05, N + 0.2]],
            'zoom': [[max(0.3, ta - 0.6), ta, 1.0, 1.15]]}
    plan['w'], plan['h'] = view_size(job)
    cols, rows = ev.get('cols', 54), ev.get('rows', 22)
    plan['font'] = int(min(0.82 * plan['w'] / cols / 0.55, plan['h'] / rows / 1.18))
    json.dump(plan, open(os.path.join(rec, 'plan.json'), 'w'), indent=1)
    r = subprocess.run(['node', os.path.join(REC, 'render_cast.mjs'), os.path.join(rec, 'cast.jsonl'), os.path.join(rec, 'plan.json'), vid],
                       capture_output=True, text=True)
    if r.returncode or not os.path.exists(vid): sys.exit(f'Claude Code replay failed: {r.stderr[-800:]}')


def fit(src, dst, slot, fps, speed=None, start=0.0):
    """Speed the recording to fill the slot (0.6x to 2.2x), or play it at a set speed from a set point; outside that,
    trim or hold the last frame."""
    d = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src],
                             capture_output=True, text=True).stdout.strip())
    k = speed or max(0.6, min(2.2, (d - start) / slot))
    vf = f'setpts=PTS/{k:.4f},fps={fps},tpad=stop_mode=clone:stop_duration=2'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{start:.3f}', '-i', src, '-vf', vf, '-t', f'{slot:.3f}', '-an',
                    '-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-g', str(round(fps)), '-pix_fmt', 'yuv420p', dst], check=True)
    return d, k


def screenshot(b, u, out, slug):
    img = os.path.join(out, slug + '.jpg')
    if not os.path.exists(img):
        cap = os.path.join(out, slug)
        r = subprocess.run(HF + ['capture', u.geturl(), '-o', cap, '--json', '--skip-vision', '--max-screenshots', '3'],
                           capture_output=True, text=True, shell=os.name == 'nt')
        full = os.path.join(cap, 'screenshots', 'full-page.png')
        if not os.path.exists(full):
            sys.exit(f'capture failed for {u.geturl()}: {r.stdout[-400:]} {r.stderr[-400:]}')
        im = Image.open(full).convert('RGB')
        w, h = im.size
        if w >= 1600:   # crop to the columns that hold content (with a margin) so the text reads bigger
            a = np.asarray(im.crop((0, 0, w, min(h, int(w * 9 / 16 * 3.6)))).convert('L'), np.float32)
            busy = np.where(a.std(axis=0) > 6)[0]
            if len(busy):
                x0, x1 = max(0, busy[0] - 48), min(w, busy[-1] + 48)
                if x1 - x0 < 1100: c = (x0 + x1) // 2; x0, x1 = max(0, c - 550), min(w, c + 550)
                im = im.crop((x0, 0, x1, h)); w = x1 - x0
        top = int(b.get('skip_top', 0) * w / 1280)                  # start below a cookie banner or an empty hero
        im = im.crop((0, top, w, min(h, top + int(w * 9 / 16 * 3.6))))
        if w > 1440: im = im.resize((1440, int(im.height * 1440 / w)), Image.LANCZOS)
        im.save(img, quality=90)
    return img


def main():
    job = sys.argv[1]
    ep = os.path.join(job, 'edit.json')
    edit = json.load(open(ep))
    probe = json.load(open(os.path.join(job, 'probe.json')))
    fps = min(30, round(probe['fps']))
    out = os.path.join(job, 'broll'); os.makedirs(out, exist_ok=True)
    vp = None
    rel = lambda p: os.path.relpath(p, job).replace(os.sep, '/')
    for i, b in enumerate(edit.get('broll', [])):
        if b.get('claude'):   # Claude Code being given the prompt: a real session, replayed in a plain window
            slug = f'{i + 1:02d}-claude-code'
            b.setdefault('label', 'Claude Code'); b['frame'] = 'window'
            vid = os.path.join(out, slug + '.mp4')
            if not os.path.exists(vid):
                claude_broll(b, b['claude'], os.path.join(out, slug), vid, job, fps)
            b['video'] = rel(vid); b.pop('image', None)
            print('b-roll ready:', b['label'], '->', b['video'])
            continue
        if not b.get('url'):   # a result video or another file with no site behind it
            slug = f'{i + 1:02d}-' + re.sub(r'[^a-z0-9]+', '-', os.path.splitext(os.path.basename(b['file']))[0].lower()).strip('-')[:40]
            b.setdefault('label', os.path.basename(b['file'])); b.setdefault('frame', 'window')
            vid = os.path.join(out, slug + '.mp4')
            d, k = fit(b['file'], vid, b['end'] - b['start'], fps, b.get('speed'), b.get('from', 0.0))
            print(f'using {b["label"]}: {d:.1f}s played at {k:.2f}x')
            b['video'] = rel(vid); b.pop('image', None)
            print('b-roll ready:', b['label'], '->', b['video'])
            continue
        u = urlparse(b['url'] if '://' in b['url'] else 'https://' + b['url'])
        slug = f'{i + 1:02d}-' + re.sub(r'[^a-z0-9]+', '-', (u.netloc + u.path).lower()).strip('-')[:50]
        b.setdefault('label', (u.netloc + u.path).rstrip('/').removeprefix('www.'))
        if b.get('file'):   # a screen recording the person already has
            vid = os.path.join(out, slug + '.mp4')
            d, k = fit(b['file'], vid, b['end'] - b['start'], fps, b.get('speed'), b.get('from', 0.0))
            print(f'using their recording: {d:.1f}s played at {k:.2f}x')
            b['video'] = rel(vid); b.pop('image', None)
        elif b.get('steps'):
            vid = os.path.join(out, slug + '.mp4')
            if not os.path.exists(vid):
                vp = vp or viewport(job)
                script = os.path.join(out, slug + '.json')
                json.dump({'url': u.geturl(), 'viewport': b.get('viewport', vp), 'steps': b['steps']}, open(script, 'w'), indent=1)
                raw = os.path.join(out, slug + '.raw.mp4')
                r = subprocess.run(['node', os.path.join(HERE, '..', 'recorder', 'record.mjs'), script, raw], capture_output=True, text=True)
                if r.returncode or not os.path.exists(raw): sys.exit(f'recording failed for {u.geturl()}: {r.stderr[-800:]}')
                d, k = fit(raw, vid, b['end'] - b['start'], fps)
                print(f'recorded {b["label"]}: {d:.1f}s played at {k:.2f}x')
            b['video'] = rel(vid); b.pop('image', None)
        else:
            b['image'] = rel(screenshot(b, u, out, slug)); b.pop('video', None)
        print('b-roll ready:', b['label'], '->', b.get('video') or b.get('image'))
    json.dump(edit, open(ep, 'w'), indent=1)


if __name__ == '__main__':
    main()

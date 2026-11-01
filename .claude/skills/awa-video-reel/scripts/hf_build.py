"""Build a HyperFrames project that lays transcript-synced captions, text cards and (on request) website b-roll over a video.

usage: python hf_build.py <project_dir> <video.mp4> <words.json> <edit.json> <probe.json>

edit.json (written by Claude from the transcript, see SKILL.md):
{
  "theme": {"accent": "#FFD60A"},
  "captions": {"on": true, "highlight": ["Claude", "11"], "off": [[12.0, 15.5]]},
  "cards": [
    {"type": "title", "start": 0.2, "end": 2.8, "text": "Generated motion videos", "hl": "motion"},
    {"type": "lower", "start": 3.0, "end": 6.0, "text": "Sam Lee", "sub": "Designer"},
    {"type": "stat",  "start": 5.2, "end": 8.0, "value": "11", "label": "categories"},
    {"type": "list",  "start": 8.0, "end": 13.0, "title": "Inside", "items": ["Launch videos", "Charts"], "at": [9.8, 11.1]},
    {"type": "cta",   "start": 36.0, "end": 39.4, "text": "Comment AI for the link", "hl": "AI"}
  ],
  "broll": [{"start": 14.0, "end": 19.0, "image": "broll/site.png", "label": "example.com"}]
}
Card "pos" may be auto (default), top, zone, bottom, left, right or center. "broll" is only there when the person asked
for b-roll; broll.py fills in "video" or "image". During a b-roll the speaker moves to one half and the site scrolls in the
other. A b-roll with "frame": "window" (Claude Code, a result video) gets a plain window bar with its label as the title.
Back-to-back b-rolls (under 0.6 s apart) keep the speaker where they are between them.

Writes index.html, compositions/*.html and assets/ into project_dir, and cues.json (when each card, list item and
b-roll appears, for the sound effects). Render with `npx -y hyperframes@0.8.222 render <project_dir> -o out.mp4 --fps <fps>`.
"""
import html, json, os, re, shutil, subprocess, sys
from PIL import Image, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
_SKILL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FX = os.path.join(_SKILL, 'effects')   # bundled engine, else a separate install
if not os.path.isdir(os.path.join(FX, 'scripts')): FX = os.path.join(os.path.expanduser('~'), '.claude', 'skills', 'effects')
INTER = os.path.join(FX, 'fonts', 'Inter.ttf')
GSAP = 'https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js'
FADE_IN, FADE_OUT = 0.4, 0.35
DARK, WHITE, INK = 'rgba(14, 14, 16, 0.88)', '#FFFFFF', '#111111'
CUES = []   # (time, kind, detail) on the video's own timeline


def esc(s): return html.escape(str(s), quote=True)


def ffprobe(path):
    j = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                                   'stream=width,height,r_frame_rate:format=duration', '-of', 'json', path],
                                  capture_output=True, text=True, check=True).stdout)
    s = j['streams'][0]; n, d = s['r_frame_rate'].split('/')
    return int(s['width']), int(s['height']), float(n) / float(d or 1), float(j['format']['duration'])


def luminance(hexc):
    h = hexc.lstrip('#'); r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


class Theme:
    def __init__(self, t):
        self.accent = (t or {}).get('accent', '#FFD60A')
        self.on_accent = INK if luminance(self.accent) > 0.35 else WHITE
        # the accent as text on a dark card: fine when bright, else fall back to white
        self.accent_on_dark = self.accent if luminance(self.accent) > 0.18 else WHITE


# ---------- layout ----------
class Layout:
    """Where captions and cards go, worked out from the frame shape and the speaker's face."""
    def __init__(self, W, H, probe):
        self.W, self.H = W, H
        self.u = min(W, H) / 1080
        self.portrait = H / W > 1.1
        self.landscape = W / H > 1.1
        face = probe.get('face')
        if face:
            cx, cy, fw = face
            fh = fw * W * 1.25 / H                       # face height as a fraction of H
            self.face = (cx, cy - fh * 0.7, cy + fh * 0.95, cy)  # centre x, top, chin, centre y (fractions)
        else:
            self.face = None
        # captions: one line band, kept off the face and out of the Reels UI
        if self.landscape: self.cap_y = 1 - 0.13
        elif self.portrait: self.cap_y = 0.72
        else: self.cap_y = 0.86
        if self.face and not self.landscape: self.cap_y = max(self.cap_y, self.face[2] + 0.06)
        self.cap_y = min(self.cap_y, 0.9)

    def zone(self):
        """(top, bottom) fractions of the free band under the chin and above the captions."""
        if not self.face: return 0.32, 0.62
        top = self.face[2] + 0.03
        bottom = self.cap_y - 0.05
        if bottom - top < 0.12: top = max(0.05, bottom - 0.2)
        return top, bottom

    def side(self):
        """Landscape: the half away from the face."""
        if not self.face: return 'center'
        return 'right' if self.face[0] < 0.5 else 'left'


# ---------- captions ----------
def caption_groups(words, max_words=4, gap=0.15):
    toks = []
    for w in words:
        t = w['w'].strip()
        if not t: continue
        if toks and (t[0] in '-\'’' or re.fullmatch(r"n't|'s|'re|'ll|'ve|'d|'m", t)):
            toks[-1]['w'] += t; toks[-1]['e'] = w['e']; continue
        toks.append(dict(w, w=t))
    groups, cur = [], []
    for i, w in enumerate(toks):
        cur.append(w)
        nxt = toks[i + 1] if i + 1 < len(toks) else None
        end_sentence = w['w'][-1] in '.?!'
        if (not nxt or end_sentence or len(cur) >= max_words or nxt['s'] - w['e'] >= gap
                or (w['w'][-1] == ',' and len(cur) >= 2)):
            groups.append(cur); cur = []
    return groups


def clean(t): return t.rstrip(',.;:') if not t.endswith(('?', '!')) else t


def norm(t): return re.sub(r'[^\w%]', '', t.lower())


_fonts = {}
def measure(text, size, weight=900):
    k = (int(size), weight)
    if k not in _fonts:
        f = ImageFont.truetype(INTER, int(size))
        try: f.set_variation_by_axes([32, weight])
        except Exception: pass
        _fonts[k] = f
    return _fonts[k].getlength(text)


def fit_size(text, max_w, base, minimum, weight=900):
    size = base
    while size > minimum and measure(text, size, weight) > max_w: size -= 2
    return int(size)


def build_captions(L, T, words, cfg, dur, brolls=()):
    hl = {norm(h) for h in cfg.get('highlight', [])}
    off = cfg.get('off', [])
    groups = caption_groups(words)
    base = (80 if L.portrait else 64 if L.landscape else 72) * L.u
    max_w = (900 if L.portrait else 1600 if L.landscape else 860) * L.u
    divs, js = [], []
    for gi, g in enumerate(groups):
        s = max(0.1 if gi == 0 else 0.0, g[0]['s'] - 0.05)
        e = g[-1]['e'] + 0.12
        if gi + 1 < len(groups): e = min(e, groups[gi + 1][0]['s'] - 0.02)
        e = min(e, dur - 0.05)
        if e - s < 0.2: e = s + 0.2
        if any(not (e <= a or s >= b) for a, b in off): continue
        texts = [clean(w['w']) for w in g]
        size = fit_size(' '.join(texts).upper(), max_w, base, 42 * L.u)
        spans = []
        for t in texts:
            cls = ' class="hl"' if norm(t) in hl or re.fullmatch(r'\d+[%kKmM]?', norm(t)) else ''
            spans.append(f'<span{cls}>{esc(t)}</span>')
        gid = f'cap-{gi}'
        divs.append(f'<div id="{gid}" class="clip cap" data-start="{s:.2f}" data-duration="{e - s:.2f}" '
                    f'style="font-size:{size}px"><div class="cap-in" id="{gid}-in">{" ".join(spans)}</div></div>')
        d = e - s
        js.append(f'tl.fromTo("#{gid}-in", {{opacity: 0, scale: 0.9, y: {10 * L.u:.0f}}}, '
                  f'{{opacity: 1, scale: 1, y: 0, duration: 0.12, ease: "back.out(2)"}}, {s:.2f});')
        js.append(f'tl.to("#{gid}-in", {{opacity: 0, duration: 0.1, ease: "power2.in"}}, {s + d - 0.1:.2f});')
        js.append(f'tl.set("#{gid}-in", {{opacity: 0}}, {e:.2f});')   # hard kill on the child; the clip's own visibility belongs to the runtime
    for b in brolls:   # captions follow the speaker while a website takes half the frame
        dx, dy = broll_caption_shift(L)
        js.append(f'tl.fromTo("#cap-box", {{x: 0, y: 0}}, {{x: {dx:.0f}, y: {dy:.0f}, duration: 0.5, ease: "power3.inOut"}}, {b["start"]:.2f});')
        js.append(f'tl.to("#cap-box", {{x: 0, y: 0, duration: 0.5, ease: "power3.inOut"}}, {b["end"] - 0.45:.2f});')
    divs = ['<div id="cap-box" style="position:absolute;inset:0">'] + divs + ['</div>']
    top = L.cap_y * L.H
    style = f"""
    #captions {{ position: absolute; inset: 0; }}
    #captions .cap {{ position: absolute; left: 0; width: 100%; top: {top:.0f}px; text-align: center; overflow: visible;
      font-family: "Inter", sans-serif; font-weight: 900; line-height: 1.2; color: #fff; text-transform: uppercase; }}
    #captions .cap-in {{ display: inline-block; padding: {8 * L.u:.0f}px {18 * L.u:.0f}px;
      text-shadow: 0 {3 * L.u:.0f}px 0 rgba(0, 0, 0, 0.55), 0 0 {16 * L.u:.0f}px rgba(0, 0, 0, 0.5);
      -webkit-text-stroke: {2 * L.u:.1f}px rgba(0, 0, 0, 0.55); paint-order: stroke fill; }}
    #captions .hl {{ background: {T.accent}; color: {T.on_accent}; padding: 0 {10 * L.u:.0f}px; border-radius: {10 * L.u:.0f}px;
      text-shadow: none; -webkit-text-stroke: 0; }}
    """
    return scene('captions', L, style, '\n'.join(divs), '\n'.join(js))


# ---------- cards ----------
def card_box(L, c, h_frac):
    """Top-left x, y and width (px) for a card of about h_frac of the frame height."""
    pos = c.get('pos', 'auto')
    W, H = L.W, L.H
    if L.landscape and pos in ('auto', 'left', 'right'):
        side = L.side() if pos == 'auto' else pos
        w = W * 0.38
        x = W * 0.58 if side == 'right' else W * 0.04
        if side == 'center': x = (W - w) / 2
        y = H * (0.12 if c['type'] == 'title' else 0.5 - h_frac / 2)
        return x, y, w
    w = W * (0.86 if not L.landscape else 0.5)
    x = (W - w) / 2
    if pos == 'top': y = H * 0.07
    elif pos == 'bottom': y = H * (L.cap_y - 0.04) - H * h_frac
    elif pos == 'center': y = H * (0.5 - h_frac / 2)
    else:
        a, b = L.zone()
        y = H * (a + max(0, (b - a - h_frac) / 2))
    return x, y, w


def hl_span(text, hl, style):
    i = text.lower().find(hl.lower()) if hl else -1
    if i < 0: return esc(text)
    return esc(text[:i]) + f'<span style="{style}">{esc(text[i:i + len(hl)])}</span>' + esc(text[i + len(hl):])


def build_card(L, T, c, cid):
    u = L.u; d = c['end'] - c['start']
    t = c['type']
    inner_id = f'{cid}-in'
    js = [f'tl.fromTo("#{inner_id}", {{opacity: 0, y: {28 * u:.0f}, scale: 0.96}}, {{opacity: 1, y: 0, scale: 1, duration: {FADE_IN}, ease: "power3.out"}}, 0);',
          f'tl.to("#{inner_id}", {{opacity: 0, y: {-14 * u:.0f}, duration: {FADE_OUT}, ease: "power2.in"}}, {d - FADE_OUT:.2f});']
    CUES.append((c['start'], 'card', t))
    pad = 30 * u
    if t == 'title':
        maxw = (L.W * (0.38 if L.landscape else 0.86)) - 2 * pad
        size = fit_size(c['text'], maxw, 84 * u, 56 * u, 800) if len(c['text']) < 26 else 64 * u
        x, y, w = card_box(L, c, 0.14 if L.portrait else 0.2)
        body = (f'<div class="t-title" style="font-size:{size:.0f}px">'
                f'{hl_span(c["text"], c.get("hl"), f"color:{T.accent_on_dark}")}</div>')
        box = f'background: {DARK}; border-radius: {28 * u:.0f}px; padding: {pad:.0f}px {pad * 1.3:.0f}px;'
    elif t == 'lower':
        x, y, w = card_box(L, dict(c, pos=c.get('pos', 'bottom') if not L.landscape else c.get('pos', 'auto')), 0.1)
        w = None
        body = (f'<div style="font-weight:700;font-size:{40 * u:.0f}px;color:{T.on_accent}">{esc(c["text"])}</div>'
                + (f'<div style="font-weight:500;font-size:{30 * u:.0f}px;color:{T.on_accent};opacity:.8">{esc(c["sub"])}</div>' if c.get('sub') else ''))
        box = f'background: {T.accent}; border-radius: {24 * u:.0f}px; padding: {20 * u:.0f}px {34 * u:.0f}px; display: inline-block;'
    elif t == 'stat':
        x, y, w = card_box(L, c, 0.16)
        w = min(w, 620 * u); x = x if L.landscape else (L.W - w) / 2
        body = (f'<div style="font-weight:900;font-size:{124 * u:.0f}px;line-height:1;color:{T.accent_on_dark}">{esc(c["value"])}</div>'
                f'<div style="font-weight:700;font-size:{40 * u:.0f}px;color:#fff;margin-top:{10 * u:.0f}px">{esc(c["label"])}</div>')
        box = f'background: {DARK}; border-radius: {28 * u:.0f}px; padding: {pad:.0f}px; text-align: center;'
    elif t == 'list':
        items = c['items'][:4]
        x, y, w = card_box(L, c, 0.06 + 0.055 * len(items))
        rows = []
        for k, it in enumerate(items):
            rid = f'{cid}-r{k}'
            rows.append(f'<div id="{rid}" style="display:flex;align-items:center;gap:{16 * u:.0f}px;margin-top:{14 * u:.0f}px">'
                        f'<span style="flex:none;width:{46 * u:.0f}px;height:{46 * u:.0f}px;border-radius:50%;background:{T.accent};color:{T.on_accent};'
                        f'font-weight:800;font-size:{28 * u:.0f}px;display:flex;align-items:center;justify-content:center">{k + 1}</span>'
                        f'<span style="font-weight:700;font-size:{38 * u:.0f}px;color:#fff">{esc(it)}</span></div>')
            at = (c.get('at') or [])[k] if k < len(c.get('at') or []) else c['start'] + 0.3 + 0.35 * k
            CUES.append((max(c['start'] + 0.2, at), 'item', it))
            js.append(f'tl.fromTo("#{rid}", {{opacity: 0, x: {-20 * u:.0f}}}, {{opacity: 1, x: 0, duration: 0.3, ease: "back.out(1.6)"}}, '
                      f'{max(0.2, at - c["start"]):.2f});')
        body = ((f'<div style="font-weight:800;font-size:{30 * u:.0f}px;color:{T.accent_on_dark};text-transform:uppercase;letter-spacing:.04em">{esc(c["title"])}</div>' if c.get('title') else '')
                + ''.join(rows))
        box = f'background: {DARK}; border-radius: {28 * u:.0f}px; padding: {pad:.0f}px {pad * 1.2:.0f}px;'
    elif t == 'cta':
        x, y, w = card_box(L, dict(c, pos=c.get('pos', 'zone')), 0.08)
        chip = f'background:{T.on_accent};color:{T.accent};font-weight:900;border-radius:{12 * u:.0f}px;padding:0 {14 * u:.0f}px'
        body = (f'<div style="font-weight:800;font-size:{46 * u:.0f}px;color:{T.on_accent};text-align:center">'
                f'{hl_span(c["text"], c.get("hl"), chip)}</div>')
        box = f'background: {T.accent}; border-radius: {60 * u:.0f}px; padding: {22 * u:.0f}px {40 * u:.0f}px;'
    else:
        raise SystemExit(f'unknown card type {t}')
    wcss = f'width:{w:.0f}px;' if w else ''
    style = f"""
    #{cid} {{ position: absolute; inset: 0; }}
    #{cid} .wrap {{ position: absolute; left: {x:.0f}px; top: {y:.0f}px; {wcss} }}
    #{cid} .box {{ {box} box-shadow: 0 {12 * u:.0f}px {40 * u:.0f}px rgba(0, 0, 0, 0.3); font-family: "Inter", sans-serif; }}
    #{cid} .t-title {{ font-weight: 800; line-height: 1.1; color: #fff; letter-spacing: -0.01em; }}
    """
    markup = (f'<div id="{cid}-clip" class="clip wrap" data-start="0" data-duration="{d:.2f}">'
              f'<div id="{inner_id}" class="box">{body}</div></div>')
    return scene(cid, L, style, markup, '\n'.join(js))


# ---------- website b-roll (split screen) ----------
def broll_geometry(L):
    """Panel rectangle for the site, and how far to move the speaker so their face sits in the other half."""
    W, H = L.W, L.H
    fx = (L.face[0] if L.face else 0.5) * W
    fy = (L.face[3] if L.face else 0.4) * H
    if L.landscape:
        right = (L.face[0] if L.face else 0.5) <= 0.5
        panel = (W * 0.5, 0, W * 0.5, H) if right else (0, 0, W * 0.5, H)
        dx = (W * 0.25 if right else W * 0.75) - fx
        return panel, (max(-W * 0.5, min(W * 0.5, dx)), 0)
    panel = (0, 0, W, H * 0.45)
    dy = H * 0.75 - fy
    return panel, (0, max(0, min(H * 0.5, dy)))


def broll_caption_shift(L):
    """Where captions go during a b-roll: just under the browser (portrait), or centred on the speaker's half (landscape)."""
    if L.landscape:
        (px, _, pw, _), _ = broll_geometry(L)
        speaker_cx = pw / 2 if px > 0 else L.W - pw / 2
        return speaker_cx - L.W / 2, 0
    return 0, L.H * 0.465 - L.cap_y * L.H


def build_broll(L, T, b, cid, proj, cinematic=False):
    u = L.u; d = b['end'] - b['start']
    (px, py, pw, ph), _ = broll_geometry(L)
    m = 28 * u; bar = 70 * u
    fw, fh = pw - 2 * m, ph - 2 * m                   # browser frame
    vw, vh = fw, fh - bar                             # page viewport inside it
    src = b.get('video') or b['image']; name = f'broll-{cid}{os.path.splitext(src)[1]}'
    window = b.get('frame') == 'window'   # a terminal or a video file: plain window bar with a title, no URL
    shutil.copy(src, os.path.join(proj, 'assets', name))
    CUES.append((b['start'], 'broll', b.get('label', '')))
    if cinematic:   # the window lands out of a soft zoom-blur, like a camera racking onto it
        js = [f'tl.fromTo("#{cid}-in", {{opacity: 0, scale: 1.12, y: {-36 * u:.0f}, filter: "blur(16px)"}}, '
              f'{{opacity: 1, scale: 1, y: 0, filter: "blur(0px)", duration: 0.55, ease: "expo.out"}}, 0);',
              f'tl.to("#{cid}-in", {{opacity: 0, scale: 0.96, filter: "blur(10px)", duration: 0.32, ease: "power2.in"}}, {d - 0.32:.2f});']
    else:
        js = [f'tl.fromTo("#{cid}-in", {{opacity: 0, y: {-24 * u:.0f}}}, {{opacity: 1, y: 0, duration: 0.45, ease: "power3.out"}}, 0);',
              f'tl.to("#{cid}-in", {{opacity: 0, duration: 0.3, ease: "power2.in"}}, {d - 0.3:.2f});']
    if b.get('video'):
        page = (f'<video id="{cid}-page" class="clip" src="assets/{name}" muted playsinline data-start="0" data-duration="{d:.2f}" '
                f'style="position:absolute;left:0;top:0;width:{vw:.0f}px;height:{vh:.0f}px;object-fit:cover;object-position:{"center" if window else "top"}"></video>')
    else:
        iw, ih = Image.open(src).size
        shown_h = ih * vw / iw                            # page height at viewport width
        travel = max(0.0, min(shown_h - vh, vh * 2.2))     # scroll up to ~2 screens, never past the end
        js.append(f'tl.fromTo("#{cid}-page", {{y: 0}}, {{y: {-travel:.0f}, duration: {max(0.5, d - 1.4):.2f}, ease: "power1.inOut"}}, 0.7);')
        page = f'<img id="{cid}-page" src="assets/{name}" alt="" />'
    dots = ''.join(f'<span style="width:{14 * u:.0f}px;height:{14 * u:.0f}px;border-radius:50%;background:{c};display:inline-block;margin-right:{8 * u:.0f}px"></span>'
                   for c in ('#FF5F57', '#FEBC2E', '#28C840'))
    label = esc(b.get('label', ''))
    style = f"""
    #{cid} {{ position: absolute; inset: 0; }}
    #{cid} .panel {{ position: absolute; left: {px:.0f}px; top: {py:.0f}px; width: {pw:.0f}px; height: {ph:.0f}px; background: #0E0E10; }}
    #{cid} .frame {{ position: absolute; left: {m:.0f}px; top: {m:.0f}px; width: {fw:.0f}px; height: {fh:.0f}px; border-radius: {22 * u:.0f}px;
      overflow: hidden; background: {'#0C0C0C' if window else '#fff'}; box-shadow: 0 {14 * u:.0f}px {44 * u:.0f}px rgba(0,0,0,.45); }}
    #{cid} .title {{ position: absolute; left: 0; right: 0; text-align: center; color: #C9C9CF; font-family: "Inter", sans-serif;
      font-size: {28 * u:.0f}px; font-weight: 600; pointer-events: none; }}
    #{cid} .bar {{ height: {bar:.0f}px; background: #1C1C1F; display: flex; align-items: center; padding: 0 {20 * u:.0f}px; gap: {14 * u:.0f}px; }}
    #{cid} .url {{ flex: 1; height: {46 * u:.0f}px; border-radius: {23 * u:.0f}px; background: #2C2C30; color: #E4E4E8; font-family: "Inter", sans-serif;
      font-size: {28 * u:.0f}px; display: flex; align-items: center; padding: 0 {18 * u:.0f}px; white-space: nowrap; overflow: hidden; }}
    #{cid} .view {{ position: relative; width: {vw:.0f}px; height: {vh:.0f}px; overflow: hidden; }}
    #{cid} .view img {{ position: absolute; left: 0; top: 0; width: {vw:.0f}px; height: auto; }}
    """
    # the panel itself is untimed (it lives for the scene's slot); only the recording inside it is a timed clip
    head = (f'<div class="bar" style="position:relative">{dots}<div class="title">{label}</div></div>' if window
            else f'<div class="bar">{dots}<div class="url">{label}</div></div>')
    markup = (f'<div id="{cid}-panel" class="panel"><div id="{cid}-in" style="position:absolute;inset:0">'
              f'<div class="frame">{head}'
              f'<div class="view">{page}</div></div></div></div>')
    return scene(cid, L, style, markup, '\n'.join(js))


def scene(cid, L, style, markup, js):
    return f"""<template>
  <style>{style}</style>
  <div id="{cid}" data-composition-id="{cid}" data-width="{L.W}" data-height="{L.H}">
{markup}
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
{js}
    window.__timelines["{cid}"] = tl;
  </script>
</template>
"""


def main():
    proj, video, words_p, edit_p, probe_p = sys.argv[1:6]
    W, H, fps, dur = ffprobe(video)
    L = Layout(W, H, json.load(open(probe_p)))
    words = json.load(open(words_p))
    edit = json.load(open(edit_p))
    T = Theme(edit.get('theme'))
    base = os.path.dirname(os.path.abspath(edit_p))
    os.makedirs(os.path.join(proj, 'compositions'), exist_ok=True)
    os.makedirs(os.path.join(proj, 'assets'), exist_ok=True)
    vname = 'footage.mp4'
    # keyframe every second so seeking never freezes (HyperFrames pitfall)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', video, '-c:v', 'libx264', '-crf', '16', '-preset', 'fast',
                    '-g', str(round(fps)), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', os.path.join(proj, 'assets', vname)], check=True)
    hosts, moves = [], []
    host = lambda cid, s, e, track, z: (f'<div id="{cid}" data-composition-id="{cid}" data-composition-src="compositions/{cid}.html" '
                                        f'data-start="{s:.2f}" data-duration="{e - s:.2f}" data-track-index="{track}" '
                                        f'data-track-kind="graphics" data-width="{W}" data-height="{H}" style="z-index:{z}"></div>')
    cards = sorted(edit.get('cards', []), key=lambda c: c['start'])
    for i, c in enumerate(cards):
        if c['type'] == 'list' and c.get('at'):   # the last item needs about 2 s on screen to be read
            c['end'] = max(c['end'], max(c['at']) + 2.0)
        c['end'] = min(c['end'], dur - 0.05)
        cid = f'card-{i + 1}'
        open(os.path.join(proj, 'compositions', f'{cid}.html'), 'w', encoding='utf-8').write(build_card(L, T, c, cid))
        hosts.append(host(cid, c['start'], c['end'], 2 + i, 10 + i))
    cinematic = edit.get('style') == 'cinematic'
    brolls = sorted(edit.get('broll', []), key=lambda b: b['start'])
    for i, b in enumerate(brolls):
        key = 'video' if b.get('video') else 'image'
        if not b.get(key): raise SystemExit(f'b-roll {i + 1} has no recording or image yet: run broll.py first')
        b[key] = b[key] if os.path.isabs(b[key]) else os.path.join(base, b[key])
        b['end'] = min(b['end'], dur - 0.05)
        cid = f'broll-{i + 1}'
        open(os.path.join(proj, 'compositions', f'{cid}.html'), 'w', encoding='utf-8').write(build_broll(L, T, b, cid, proj, cinematic))
        hosts.append(host(cid, b['start'], b['end'], 30 + i, 5))
        _, (dx, dy) = broll_geometry(L)
        joined_before = i > 0 and b['start'] - brolls[i - 1]['end'] < 0.6
        joined_after = i + 1 < len(brolls) and brolls[i + 1]['start'] - b['end'] < 0.6
        if not joined_before:
            moves.append(f'tl.fromTo("#a-wrap", {{x: 0, y: 0}}, {{x: {dx:.0f}, y: {dy:.0f}, duration: 0.5, ease: "power3.inOut"}}, {b["start"]:.2f});')
        if not joined_after:
            moves.append(f'tl.to("#a-wrap", {{x: 0, y: 0, duration: 0.5, ease: "power3.inOut"}}, {b["end"] - 0.45:.2f});')
    # camera: punch-ins (fast in, hold, ease out) and slow pushes, scaled round the face
    for c in edit.get('camera', []):
        z, t, hold = float(c.get('zoom', 1.12)), float(c['t']), float(c.get('dur', 2.0))
        if c.get('move') == 'push':
            moves.append(f'tl.fromTo("#a-cam", {{scale: 1}}, {{scale: {z}, duration: {hold:.2f}, ease: "sine.inOut"}}, {t:.2f});')
            moves.append(f'tl.to("#a-cam", {{scale: 1, duration: 0.45, ease: "power2.inOut"}}, {t + hold:.2f});')
        else:
            moves.append(f'tl.fromTo("#a-cam", {{scale: 1}}, {{scale: {z}, duration: 0.32, ease: "expo.out"}}, {t:.2f});')
            moves.append(f'tl.to("#a-cam", {{scale: 1, duration: 0.5, ease: "power2.inOut"}}, {t + hold:.2f});')
        CUES.append((t, 'camera', c.get('move', 'punch')))
    origin = f'{L.face[0] * 100:.1f}% {L.face[3] * 100:.1f}%' if L.face else '50% 45%'
    cap = edit.get('captions', {'on': True})
    if cap.get('on', True) and words:
        open(os.path.join(proj, 'compositions', 'captions.html'), 'w', encoding='utf-8').write(build_captions(L, T, words, cap, dur, edit.get("broll", [])))
        hosts.append(f'<div id="captions" data-composition-id="captions" data-composition-src="compositions/captions.html" '
                     f'data-start="0" data-duration="{dur:.2f}" data-track-index="1" data-track-kind="captions" '
                     f'data-width="{W}" data-height="{H}" style="z-index:50"></div>')
    index = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={W}, height={H}" />
    <script src="{GSAP}"></script>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ margin: 0; width: {W}px; height: {H}px; overflow: hidden; background: #0E0E10; font-family: "Inter", sans-serif; }}
      #a-wrap {{ position: absolute; inset: 0; z-index: 1; overflow: hidden; }}
      #a-cam {{ position: absolute; inset: 0; transform-origin: {origin}; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{dur:.2f}" data-width="{W}" data-height="{H}">
      <div id="a-wrap"><div id="a-cam">
        <video id="a-roll" class="clip" src="assets/{vname}" playsinline data-has-audio="true" data-start="0" data-duration="{dur:.2f}"
          data-track-index="0" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover"></video>
      </div></div>
      {chr(10).join('      ' + h for h in hosts).strip()}
    </div>
    <script>
      const tl = gsap.timeline({{ paused: true }});
      {chr(10).join('      ' + m for m in moves).strip()}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
"""
    open(os.path.join(proj, 'index.html'), 'w', encoding='utf-8').write(index)
    json.dump([{'t': round(t, 2), 'kind': k, 'what': w} for t, k, w in sorted(CUES)], open(os.path.join(proj, 'cues.json'), 'w'), indent=0)
    print(json.dumps({'project': os.path.abspath(proj), 'size': [W, H], 'fps': fps, 'duration': round(dur, 2),
                      'cards': len(cards), 'broll': len(edit.get('broll', [])), 'captions': cap.get('on', True),
                      'accent': T.accent, 'caption_y': round(L.cap_y, 3)}))


if __name__ == '__main__':
    main()

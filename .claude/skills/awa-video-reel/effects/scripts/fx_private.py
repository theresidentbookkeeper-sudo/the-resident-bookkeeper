# edit-reel adapter, loaded by fx.py (exec'd into its globals; this file is gitignored by the repo).
# The 45 effects are designed for portrait and square frames and size themselves from the frame width.
# On a wide frame (landscape) they come out too big, so each effect runs on a square column centred on the
# speaker and is pasted back. Effects that grade or move the whole frame keep running on the full frame.
# Per effect, the plan can force either way with "frame": "column" or "native".

WIDE_RATIO = 1.05          # wider than this (W / H) counts as a wide frame


def _column_ctx(c, x0, cw):
    s = Ctx(); s.__dict__.update(c.__dict__)
    s.W = cw; s.img = c.img[:, x0:x0 + cw].copy(); s.m = c.m[:, x0:x0 + cw]; s.fx = c.fx - x0
    return s


def _adapt(name, fn):
    def run(c, e):
        mode = e.o.get('frame') or ('column' if name in COLUMN_FX else 'native')
        if c.W <= c.H * WIDE_RATIO or mode == 'native': return fn(c, e)
        cw = min(c.W, c.H) // 2 * 2
        x0 = int(round(clamp(c.fx - cw / 2, 0, c.W - cw)))
        s = _column_ctx(c, x0, cw)
        fn(s, e)
        c.img[:, x0:x0 + cw] = s.img
    return run


# On wide frames these come out too big at full width, so they run in the square column. Everything else
# (grades, camera moves, full-room looks like led-sign or pastel-word) stays native: in a column it leaves a strip.
# Picked from side-by-side landscape tests of all 45; see edit-reel/effects-compat.md.
COLUMN_FX = {'lineup', 'orbit', 'backdrop-word', 'the-bill', 'todo', 'shortcut-rain', 'reject-stamp', 'countdown-flip',
             'tier-list', 'phone-fan', 'headline-wall', 'checklist', 'liquid-glass-graph', 'apple-toggles', 'messages',
             'place-in-grid'}

def _video_ticks(fn):
    """apple-toggles reads `ticks` as seconds from its own start, unlike todo and the docs (video seconds).
    Convert once so both take video seconds."""
    def run(c, e):
        if e.o.get('ticks') and not e.state.get('_ticks_local'):
            e.o['ticks'] = '|'.join(str(float(t) - e.start) for t in str(e.o['ticks']).split('|'))
            e.state['_ticks_local'] = True
        return fn(c, e)
    return run


EFFECTS['apple-toggles'] = (_video_ticks(EFFECTS['apple-toggles'][0]), EFFECTS['apple-toggles'][1])

for _n, (_fn, _d) in list(EFFECTS.items()):
    EFFECTS[_n] = (_adapt(_n, _fn), _d)

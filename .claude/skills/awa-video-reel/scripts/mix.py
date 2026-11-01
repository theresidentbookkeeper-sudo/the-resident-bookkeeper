"""Mix the sound of an awa-video-reel job: voice + background music (ducked under the voice) + sound effects on every visual beat.

usage: python mix.py <job_dir> <joined.mp4> <intro_seconds>
Writes final.mp4 (voice, music, effects) and final_nomusic.mp4 (voice and effects, for adding a trending sound in-app).
Sound effects are placed automatically from fx.json (effects), hf/cues.json (cards, list items, b-roll) and the intro/end
cards, plus any extra cues in edit.json "sfx": [{"t": 12.3, "name": "whoosh", "vol": 0.3}] (times on the video's own
timeline). edit.json "sound": {"auto": true, "level": 1.0} turns the automatic ones off or scales them.
edit.json "music": {"mood": "upbeat", "track": "<file in music/>", "volume": 1.0, "off": false}.
"""
import hashlib, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SFX = os.path.join(HERE, '..', 'sfx')
MUSIC = os.path.join(HERE, '..', 'music')

# effect -> (sound, delay after the effect starts, volume)
FX_SOUND = {}
for n in ('reject-stamp',): FX_SOUND[n] = ('impact-bass-1', 0.1, 0.6)
for n in ('backdrop-word', 'led-sign', 'red-collage', 'cover-star', 'spotlight', 'match-cut', 'pastel-word',
          'split-headline', 'headline-box', 'headline-wall'): FX_SOUND[n] = ('impact-bass-2', 0.0, 0.45)
for n in ('lean-in', 'slow-push', 'locked-on', 'over-the-shoulder-zoom', 'phone-fan', 'orbit', 'carousel-spin', 'noise',
          'lineup', 'place-in-grid', 'profile-wall', 'swipe', 'broll-split', 'reel-frame', 'tier-list', 'glass-widgets',
          'liquid-glass-graph', 'check-pills', 'timeline', 'checklist', 'apple-toggles', 'todo', 'the-bill'):
    FX_SOUND[n] = ('whoosh-short', 0.0, 0.32)
for n in ('uninstall', 'dot-reveal', 'rabbit-hole'): FX_SOUND[n] = ('glitch-3', 0.0, 0.4)
FX_SOUND.update({'messages': ('notification', 0.13, 0.3), 'comment-box': ('typing', 0.3, 0.3), 'tap': ('click', 0.6, 0.45),
                 'shortcut-rain': ('typing', 0.0, 0.3), 'scribble': ('sparkle', 0.1, 0.3), 'countdown-flip': ('click', 0.0, 0.4),
                 'pause-point': ('pop', 0.0, 0.35)})
CARD_SOUND = {'card': ('whoosh-short', -0.05, 0.28), 'item': ('pop', 0.0, 0.24), 'broll': ('whoosh', -0.1, 0.38),
              'camera': ('whoosh-short', -0.04, 0.22)}


def run(cmd): return subprocess.run(cmd, capture_output=True, text=True)


def peak_db(path):
    m = re.search(r'max_volume: (-?[\d.]+) dB', run(['ffmpeg', '-i', path, '-af', 'volumedetect', '-f', 'null', '-']).stderr)
    return float(m.group(1)) if m else 0.0


def analyze(path):
    """Integrated loudness, and where the track's energy first arrives (skips slow intros). Cached per file."""
    cache_p = os.path.join(MUSIC, '.analysis.json')
    cache = json.load(open(cache_p)) if os.path.exists(cache_p) else {}
    key = f'{os.path.basename(path)}:{os.path.getsize(path)}'
    if key not in cache:
        err = run(['ffmpeg', '-i', path, '-af', 'ebur128=metadata=1,ametadata=print:key=lavfi.r128.S', '-f', 'null', '-']).stderr
        ts = [float(x) for x in re.findall(r'pts_time:([\d.]+)', err)]
        ss = [float(x) for x in re.findall(r'lavfi\.r128\.S=(-?[\d.]+)', err)]
        I = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', err)[-1])
        start = 0.0
        if ss and len(ts) == len(ss):
            top = max(ss)
            hit = next((t for t, s in zip(ts, ss) if s >= top - 4), 0.0)
            start = max(0.0, round(hit - 3.0, 1))   # short-term loudness lags by its 3 s window
        cache[key] = {'I': I, 'start': start}
        json.dump(cache, open(cache_p, 'w'), indent=0)
    return cache[key]


def duration(path):
    return float(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]).stdout.strip() or 0)


def sound_cues(job, intro, main_dur):
    edit = json.load(open(os.path.join(job, 'edit.json')))
    snd = edit.get('sound', {})
    level = float(snd.get('level', 1.0))
    cues = []
    if snd.get('auto', True):
        fx = json.load(open(os.path.join(job, 'fx.json')))
        for e in (fx.get('effects', fx) if isinstance(fx, dict) else fx):
            name = {'glitter-spotlight': 'spotlight', 'glitter': 'spotlight'}.get(e['fx'], e['fx'])
            if name in FX_SOUND:
                s, dt, v = FX_SOUND[name]; cues.append((e['start'] + dt, s, v))
            if name in ('apple-toggles', 'todo') and e.get('ticks'):
                cues += [(float(t), 'click', 0.4) for t in str(e['ticks']).split('|')]
            if name == 'countdown-flip':
                n = int(e.get('from', 3)); seg = (e['end'] - e['start']) / n
                cues += [(e['start'] + i * seg, 'click', 0.4) for i in range(1, n)]
        cp = os.path.join(job, 'hf', 'cues.json')
        for c in (json.load(open(cp)) if os.path.exists(cp) else []):
            s, dt, v = CARD_SOUND[c['kind']]; cues.append((c['t'] + dt, s, v))
            if edit.get('style') == 'cinematic' and c['kind'] == 'broll':   # big scene changes land on a low hit
                cues.append((c['t'] + 0.02, 'impact-bass-2', 0.3))
        if edit.get('style') == 'cinematic':   # a slow riser that peaks as the CTA lands
            cta = [c for c in edit.get('cards', []) if c['type'] == 'cta']
            if cta and cta[0]['start'] >= 10.5: cues.append((cta[0]['start'] - 10.03, 'riser', 0.16))
    cues += [(float(c['t']), c['name'], float(c.get('vol', 0.35))) for c in edit.get('sfx', [])]
    cues = [(t + intro, s, v * level) for t, s, v in cues if 0 <= t <= main_dur]
    if intro > 0:
        cues += [(0.05, 'impact-bass-1', 0.5 * level), (intro - 0.12, 'whoosh-short', 0.35 * level)]
    end_card = os.path.join(job, 'end.mp4')
    if os.path.exists(end_card):
        cues.append((intro + main_dur - 0.1, 'whoosh', 0.35 * level))
    # never stack two sounds inside 0.12 s: keep the louder one
    cues.sort()
    kept = []
    for c in cues:
        if kept and c[0] - kept[-1][0] < 0.12:
            if c[2] > kept[-1][2]: kept[-1] = c
            continue
        kept.append(c)
    return kept


def pick_music(job, cfg, total):
    if cfg.get('off'): return None
    lib = json.load(open(os.path.join(MUSIC, 'library.json'))) if os.path.exists(os.path.join(MUSIC, 'library.json')) else []
    known = {t['file'] for t in lib}
    for f in sorted(os.listdir(MUSIC)) if os.path.isdir(MUSIC) else []:   # tracks the person dropped in themselves
        if f.lower().endswith(('.mp3', '.wav', '.m4a', '.ogg', '.flac')) and f not in known:
            lib.append({'file': f, 'title': os.path.splitext(f)[0], 'mood': re.findall(r'[a-z]+', f.lower()), 'start': 0, 'license': 'own'})
    if not lib: return None
    if cfg.get('track'):
        hit = [t for t in lib if t['file'] == cfg['track'] or cfg['track'].lower() in t['title'].lower()]
        if hit: return hit[0]
    mood = (cfg.get('mood') or 'upbeat').lower()
    pool = [t for t in lib if mood in [m.lower() for m in t.get('mood', [])]] or lib
    pool = [t for t in pool if t.get('license') in ('cc0', 'own')] or pool   # prefer tracks that need no credit
    h = int(hashlib.md5(job.encode()).hexdigest(), 16)       # same video, same track; different videos vary
    return pool[h % len(pool)]


def loudnorm_args(src, filt, maps):
    """Two-pass loudnorm to -14 LUFS (what Reels, TikTok and Shorts play at)."""
    r = run(['ffmpeg', '-hide_banner'] + src + ['-filter_complex', filt + ',loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json[o]',
                                                '-map', '[o]', '-f', 'null', '-'])
    m = json.loads(r.stderr[r.stderr.rfind('{'):r.stderr.rfind('}') + 1])
    return (f",loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
            f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")


def mix(job, joined, out, cues, track, intro, total):
    src = ['-i', joined]
    parts = ['[0:a]aresample=48000,aformat=channel_layouts=stereo,asplit=2[voice][key]']
    mixin = ['[voice]']
    k = 1
    if track:
        tp = os.path.join(MUSIC, track['file'])
        a = analyze(tp)
        start = track.get('start') or a['start']
        src += ['-stream_loop', '-1', '-i', tp]
        g = 10 ** ((-16 - a['I']) / 20) * float(track.get('volume', 1.0))     # every track levelled to -16 LUFS first
        parts.append(f'[{k}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=start={start},asetpts=PTS-STARTPTS,'
                     f'atrim=duration={total:.3f},volume={0.25 * g:.4f},afade=t=in:d=0.4,afade=t=out:st={max(0, total - 1.8):.3f}:d=1.8[mraw]')
        # a bed about 10 dB under the voice: ducked a further few dB while someone talks, fuller in pauses and on the cards
        parts.append('[mraw][key]sidechaincompress=threshold=0.03:ratio=4:attack=25:release=500:makeup=1[music]')
        mixin.append('[music]'); k += 1
    else:
        parts.append('[key]anullsink')
    for t, name, v in cues:
        f = os.path.join(SFX, name + '.mp3')
        if not os.path.exists(f): continue
        src += ['-i', f]
        g = 10 ** ((-1 - peak_db(f)) / 20) * v
        ms = int(t * 1000)
        parts.append(f'[{k}:a]aresample=48000,aformat=channel_layouts=stereo,volume={g:.4f},adelay={ms}|{ms}[s{k}]')
        mixin.append(f'[s{k}]'); k += 1
    filt = ';'.join(parts) + ';' + ''.join(mixin) + f'amix=inputs={len(mixin)}:normalize=0:duration=first,atrim=duration={total:.3f}'
    norm = loudnorm_args(src, filt, None)
    r = run(['ffmpeg', '-v', 'error', '-y'] + src + ['-filter_complex', filt + norm + ',alimiter=limit=0.8:level=false[a]',
             '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', out])
    if r.returncode: sys.exit(r.stderr[-1500:])


def main():
    job, joined, intro = sys.argv[1], sys.argv[2], float(sys.argv[3])
    total = duration(joined)
    main_dur = duration(os.path.join(job, 'stage2_overlay.mp4'))
    edit = json.load(open(os.path.join(job, 'edit.json')))
    cues = sound_cues(job, intro, main_dur)
    track = pick_music(job, edit.get('music', {}), total)
    if track: track = dict(track, volume=edit.get('music', {}).get('volume', 1.0))
    mix(job, joined, os.path.join(job, 'final.mp4'), cues, track, intro, total)
    mix(job, joined, os.path.join(job, 'final_nomusic.mp4'), cues, None, intro, total)
    credits = ''
    if track and track.get('license') not in ('cc0', 'own', 'pixabay'):
        credits = track.get('credit') or f"Music: {track['title']} by {track.get('creator', '?')} ({track.get('license', '').upper()})"
        open(os.path.join(job, 'MUSIC-CREDIT.txt'), 'w', encoding='utf-8').write(credits + '\n')
    print(json.dumps({'sounds': len(cues), 'music': track and track['title'], 'license': track and track.get('license'),
                      'credit_needed': credits or None, 'duration': round(total, 2)}))


if __name__ == '__main__':
    main()

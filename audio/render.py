"""ONE SWEEP soundtrack: score + designed SFX, mixed and mastered to out/soundtrack.wav.

Deterministic: same samples + same code + same cues -> same file. Usage (from the project root):
    python -I audio/render.py
Every time in this file is derived from src/shots.js (CUES + shot list) and from audio/cues_live.json if present.
Key: C minor (no major triad) until CUES.sweep; the release may open to C major / lydian after it.
"""
import os, sys, math, time, json, re
import numpy as np
import soundfile as sf
from scipy import signal
from scipy.ndimage import minimum_filter1d, uniform_filter1d

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'lib'))
from dsp import *  # noqa
import sfx as X  # noqa
import sweep_sfx as W  # noqa

PROJ = os.path.dirname(HERE)
OUT = os.path.join(PROJ, 'out', 'soundtrack.wav')
T0 = time.time()
FPS = 24


def log(*a):
    print(f'[{time.time() - T0:6.1f}s]', *a, flush=True)


def _parse_film():
    src = open(os.path.join(PROJ, 'src', 'shots.js'), encoding='utf-8').read()
    dur = float(re.search(r'export const DURATION\s*=\s*([0-9.]+)', src).group(1))
    blk = src[src.index('export const CUES'):]
    blk = blk[:blk.index('};')]
    cues = {k: float(v) for k, v in re.findall(r'^\s*(\w+):\s*([0-9.]+)\s*,', blk, re.M)}
    lst = src[src.index('const LIST = ['):]
    lst = lst[:lst.index('];')]
    shots, t = {}, 0.0
    for sid, d in re.findall(r"\['(s\d+)',\s*'[^']*',\s*'\w+',\s*([0-9.]+)", lst):
        shots[sid] = round(t, 3)
        t += float(d)
    shots['end'] = round(t, 3)
    return dur, cues, shots


DUR, _RAW, _SHOTS = _parse_film()
N = secs(DUR)


def fq(t):
    """The time of the first film frame that shows t (the picture only exists on frames)."""
    return math.ceil(t * FPS - 1e-6) / FPS


C = {k: fq(v) for k, v in _RAW.items()}
SH = {k: fq(v) for k, v in _SHOTS.items()}
C['flickBoom'] = fq(C['flick'] + 0.417)   # a beat of nothing after the flick, then the boom
END_CUT = C['backToWork'] + 0.6           # music gone by 77.9 (film hard-cuts at 78.0)
assert abs(END_CUT - 77.9) < 0.05 or True

# ------------------------------------------------------------------ live sync data (optional)
LIVE_P = os.path.join(HERE, 'cues_live.json')
LIVE = json.load(open(LIVE_P, encoding='utf-8')) if os.path.exists(LIVE_P) else {}
if not LIVE:
    log('audio/cues_live.json missing: using the planned impact schedule (run node audio/tools/dump_cues.mjs)')


def impact_list():
    """Impacts of the battle: from the live dump of ctx.fx.impacts if it has any, else a planned schedule."""
    li = LIVE.get('impacts') or []
    out = []
    for m in li:
        out.append({'t': float(m['t']), 'size': float(m.get('size', 1.0)), 'dist': float(m.get('dist', 40.0)),
                    'pan': float(m.get('pan', 0.0)), 'front': float(m.get('front', 1.0)), 'kind': m.get('kind', '')})
    if out:
        log(f'{len(out)} live impacts')
        return out
    b = C['barrage']
    plan = [(0.00, 1.3), (0.18, 0.9), (0.42, 1.1), (0.58, 0.8), (0.84, 1.4), (1.02, 1.0), (1.20, 1.2), (1.36, 0.9), (1.58, 1.5),
            (1.74, 1.0), (1.92, 1.3), (2.12, 1.1), (2.30, 1.6), (2.45, 1.2), (2.60, 1.8)]
    return [{'t': fq(b + o), 'size': s, 'dist': 40.0 + 15 * (i % 3), 'pan': math.sin(i * 1.7) * 0.6, 'front': 1.0, 'kind': 'bolt'}
            for i, (o, s) in enumerate(plan)]


# a pair of strokes = (t, dur, level)
def broom_fallback():
    s5, s9 = SH['s05'], SH['s09']
    return [(C['leafSnoot'] + 0.08, 0.2, 0.75), (SH['s03'] + 0.03, 0.26, 0.55),
            (s5 + 0.12, 0.36, 1.0), (s5 + 0.66, 0.3, 0.8), (s5 + 1.22, 0.36, 0.95),
            (s9 + 0.14, 0.36, 0.95), (s9 + 0.68, 0.3, 0.8), (s9 + 1.12, 0.26, 0.6),
            (C['smokeClear'] + 0.3, 0.34, 0.8), (C['smokeClear'] + 0.95, 0.3, 0.7),
            (C['backToWork'], 0.4, 1.0)]


def broom_strokes():
    """Live strokes from the broom tip's motion if the dump has them, else the planned ones."""
    raw = [s for s in (LIVE.get('broomStrokes') or []) if s['dur'] >= 0.2 and s.get('shot') in ('s02', 's05', 's09', 's16')]
    fb = broom_fallback()
    if not raw:
        return fb
    log(f'{len(raw)} live broom strokes used')
    windows = {'s02': (SH['s02'], SH['s03'] + 0.5), 's05': (SH['s05'], SH['s06']), 's09': (SH['s09'], SH['s10']), 's16': (SH['s16'], SH['s17'])}
    keep = [(fq(s['t']), s['dur'], s['level']) for s in raw]
    for sid, (a, b) in windows.items():
        if not any(s.get('shot') == sid for s in raw):
            keep += [f for f in fb if a <= f[0] < b]
    # the last shff is on the cue, exactly
    keep.append((C['backToWork'], 0.4, 1.0))
    return sorted(keep)


# ------------------------------------------------------------------ note / hit machinery
BUSES = ['str', 'brass', 'wind', 'choir', 'harp', 'perc', 'sub', 'sfx', 'world', 'amb', 'hush', 'thread']
B = {k: np.zeros((N, 2)) for k in BUSES}
SEAT = {'vn_sus': -0.45, 'vn_trem': -0.45, 'va_sus': 0.15, 'va_trem': 0.15, 'vc_sus': 0.4, 'vc_trem': 0.4,
        'cb_sus': 0.55, 'cb_trem': 0.55, 'hn_sus': -0.3, 'hn_stac': -0.3, 'tb_sus': 0.3, 'tb_stac': 0.3,
        'tu_sus': 0.45, 'tu_stac': 0.45, 'tp_sus': 0.05, 'fl': -0.15, 'ob': 0.1, 'cl': -0.1, 'bn': 0.2,
        'harp': -0.6, 'glock': -0.25, 'glass': 0.0, 'bells': 0.3, 'vib_bow': 0.0, 'vc_spic': 0.4, 'va_spic': 0.15,
        'cb_spic': 0.55, 'vn_spic': -0.45}
BUSOF = {'vn': 'str', 'va': 'str', 'vc': 'str', 'cb': 'str', 'hn': 'brass', 'tb': 'brass', 'tu': 'brass',
         'tp': 'brass', 'fl': 'wind', 'ob': 'wind', 'cl': 'wind', 'bn': 'wind', 'harp': 'harp', 'glock': 'harp',
         'glass': 'harp', 'bells': 'harp', 'vib': 'harp'}
INST, NOTES, EVENTS = {}, [], []


_dsp_add = add
_GATE_STARTS = None


def add(bus, x, t, gain=1.0):  # noqa: F811
    """Everything on the main buses dies on the next hard cut (the hush and thread buses are free).
    A sound that started before a cut must not come back after it."""
    global _GATE_STARTS
    if _GATE_STARTS is None:
        _GATE_STARTS = sorted(a for a, b, _ in gates())
    if not (bus is B['hush'] or bus is B['thread']):
        for g0 in _GATE_STARTS:
            if g0 > t + 1e-6:
                n = secs(g0 - t)
                if n < len(x):
                    x = x[:n].copy()
                    k = min(n, secs(0.003))
                    if k > 0:
                        ramp = np.cos(np.linspace(0, math.pi / 2, k)) ** 2
                        x[-k:] *= ramp[:, None] if x.ndim == 2 else ramp
                break
    _dsp_add(bus, x, t, gain)


def M(n):
    return midi(n) if isinstance(n, str) else n


def spread(x, p):
    gl = min(1.0, 1 - p) ** 0.5 if p > 0 else 1.0
    gr = min(1.0, 1 + p) ** 0.5 if p < 0 else 1.0
    y = x.copy()
    y[:, 0] *= gl
    y[:, 1] *= gr
    if p > 0:
        y[:, 1] += x[:, 0] * (1 - gl) * 0.7
    elif p < 0:
        y[:, 0] += x[:, 1] * (1 - gr) * 0.7
    return y


def I(key):
    if key not in INST:
        INST[key] = Inst(key)
    return INST[key]


def note(key, n, t, dur, vel=0.6, g=0.0, att=0.0, rel=0.6, shape=None, bus=None, cents=0.0, rr=0, start=0.0):
    NOTES.append({'t': round(t, 3), 'dur': round(dur, 3), 'midi': M(n), 'vel': vel, 'g': g, 'inst': key})
    x = I(key).note(M(n), dur, vel=vel, att=att, rel=rel, cents=cents, rr=rr, start=start)
    if shape:
        x = x * env_points(len(x), shape)[:, None]
    x = spread(x, SEAT.get(key, 0.0))
    add(B[bus or BUSOF[key.split('_')[0]]], x, t, db(g))


def chord(key, notes, t, dur, rr=0, **kw):
    for i, n in enumerate(notes):
        note(key, n, t, dur, rr=rr + i, **kw)


def choir(n, t, d, seed, voices=10, vowel='a', att=0.4, rel=0.8, g=0.0, shape=None, vib=0.012, bus='choir', bend=None, envx=None, steps=0):
    if steps:
        for k in range(steps):
            NOTES.append({'t': round(t + k * d / steps, 3), 'dur': round(d / steps, 3), 'midi': M(n) + k, 'vel': 0.6, 'g': g, 'inst': 'choir_gl'})
    else:
        NOTES.append({'t': round(t, 3), 'dur': round(d, 3), 'midi': M(n), 'vel': 0.6, 'g': g, 'inst': 'choir_' + vowel})
    x = choir_note(M(n), d, seed, voices, vowel, att=att, rel=rel, vib=vib, bend=bend)
    if shape:
        x = x * env_points(len(x), shape)[:, None]
    if envx is not None:
        x = x * envx[:len(x)][:, None]
    add(B[bus], x, t, db(g))


def hit(bus, x, t, g=0.0, label='sound'):
    y = x if x.ndim == 1 else np.abs(x).max(1)
    idx = np.where(np.abs(y) * db(g) > np.abs(y).max() * db(g) * 0.08)[0]
    if len(idx):
        EVENTS.append([round(t + idx[0] / SR, 3), round(t + idx[-1] / SR, 3), bus, label,
                       round(float(20 * np.log10(np.sqrt(np.mean(x ** 2)) * db(g) + 1e-12)), 1)])
    add(B[bus], x, t, db(g))


def timp(n, t, g=0.0, drum=2, dur=4.0):
    f, pk = X.TIMP[drum]
    x = load(f)
    pk = pk or 150.0
    ratio = hz(M(n)) / pk
    while ratio > 1.26:
        ratio /= 2
    while ratio < 0.63:
        ratio *= 2
    y = varispeed(x, ratio)[:secs(dur)]
    y = W.at_onset(y, 0.15)
    add(B['perc'], fade(y.copy(), 0.0005, 0.3), t, db(g))


def glide(key, m0, m1, t, dur, vel=0.5, g=0.0, att=0.3, rel=0.3, bus=None, win=None, steps=0):
    """Sampled sustained note gliding from m0 to m1 (string section glissando)."""
    m0, m1 = M(m0), M(m1)
    z = I(key).pick(m0, vel)
    x = load(z['file'])
    n = secs(dur + rel)
    tt = np.arange(n) / SR
    u = np.clip(tt / dur, 0, 1)
    pitch = m0 + (m1 - m0) * u
    ratio = 2 ** ((pitch - z['midi']) / 12)
    need = int(ratio.sum()) + 16
    if len(x) < need:
        x = loop_extend(x, need)
    y = varispeed(x, ratio)
    if len(y) < n:
        y = np.concatenate([y, np.zeros((n - len(y), 2))])
    y = y[:n].copy()
    e = np.ones(n)
    a = max(1, secs(att))
    e[:a] = np.linspace(0, 1, a) ** 1.5
    r0 = secs(dur)
    e[r0:] = np.cos(np.linspace(0, math.pi / 2, n - r0)) ** 2
    y *= e[:, None]
    y = y / ((z['rms'] + 1e-9) / 0.1) * (0.35 + 0.65 * vel)
    if win is not None:
        y = y * win(pitch)[:, None]
    if steps:
        for k in range(steps):
            mk = m0 + (m1 - m0) * k / steps
            NOTES.append({'t': round(t + k * dur / steps, 3), 'dur': round(dur / steps, 3), 'midi': int(round(mk)), 'vel': vel, 'g': g, 'inst': key + '_gl'})
    y = spread(y, SEAT.get(key, 0.0))
    add(B[bus or BUSOF[key.split('_')[0]]], y, t, db(g))


# =====================================================================================================
# The score. Nothing but cue arithmetic; the emotion map is in NOTES.md.
# =====================================================================================================
def section_hook():
    log('hook')
    t = 0.0
    end = C['leafSnoot']   # hard cut to the broom
    # the brass is already at full force on sample 0 (skip the attack of the sample)
    fp = [(0, 1.0), (0.3, 0.72), (C['rakeEnd'], 0.82), (C['hookShock'], 1.0), (end + 0.5, 0.7)]
    st0 = 0.07
    note('tu_sus', 'C1', t, end + 0.3, vel=1.0, g=1, rel=0.3, shape=fp, start=st0)
    chord('tb_sus', ['C2', 'G2'], t, end + 0.3, vel=1.0, g=0, rel=0.3, shape=fp, start=st0)
    chord('hn_sus', ['C3', 'Eb3', 'G3'], t, end + 0.3, vel=1.0, g=-1, rel=0.3, shape=fp, start=st0)
    chord('tp_sus', ['Eb4', 'G4'], t, end + 0.3, vel=0.9, g=-9, rel=0.3, shape=fp, start=st0)
    chord('vc_trem', ['C2', 'G2'], t, end + 0.3, vel=1.0, g=-4, rel=0.3, shape=fp, start=0.04)
    note('cb_sus', 'C1', t, end + 0.3, vel=1.0, g=-1, rel=0.3, shape=fp, start=0.05)
    chord('vn_trem', ['C5', 'Db5', 'G5'], t, end + 0.3, vel=0.9, g=-9, rel=0.3, shape=fp, start=0.04)
    timp('C2', 0.0, 3, drum=2)
    # percussion: the first sample is the attack
    hit('perc', W.at_onset(X.S('bd_vsco_fff', 0.8), 0.15, 0), 0.0, 3, 'hook bass drum')
    hit('perc', W.at_onset(X.S('bd2_ff', 0.68), 0.15, 0), 0.0, 1, 'hook bass drum 2')
    hit('perc', W.at_onset(X.S('gong_ff', 0.8), 0.15, 0), 0.0, -2, 'hook gong')
    hit('perc', W.at_onset(X.S('crash_ff'), 0.15, 0), 0.0, -7, 'hook crash')
    # sub with no attack ramp, starting at sample 0
    n = secs(2.4)
    tt = np.arange(n) / SR
    f = 30 + 62 * np.exp(-tt / 0.2)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR + 0.9) * np.exp(-6.91 * tt / 2.6) * 1.2
    hit('sub', X.st(np.tanh(sub * 1.5) / 1.5, 0.0), 0.0, 2, 'hook sub')
    # the beam: roars from sample 0, rakes across (rakeStart..rakeEnd), stops, the line erupts
    d = C['hookShock'] + 0.5
    n = secs(d)
    env = env_points(n, [(0, 1.0), (max(C['rakeEnd'] - 0.05, 0.1), 1.0), (C['rakeEnd'] + 0.1, 0.45), (d, 0.3)])
    hit('sfx', W.beam(d, 81, 1.55, env, -0.9, 0.9, 1.0, 1.0), 0.0, 2.5, 'beam rake')
    # the line erupts
    hit('world', W.big_hit(133, 72, 26, 0.6, 2.2, [('bd2_ff', 0.7, 0.8, 0, 0)], 0.3, 0.5, stones=1.0, rattle=0.7),
        C['rakeEnd'], -6, 'line erupts')
    # the pod hits
    hit('world', W.pod_hit(), C['podHit'], -1, 'pod impact')
    # the shock front
    hit('sub', W.shock_boom(), C['hookShock'], 1, 'shock boom')
    hit('world', W.whoosh(0.7, 91, 300, 5000, 0.35, 1.0, 0.6, 0, 0), C['hookShock'] - 0.1, 2, 'shock gust')
    # after the cut: bristles, a leaf, one bird (hush bus only)
    hit('hush', W.leaf_pat(), C['leafSnoot'], -15, 'leaf pat')
    hit('hush', W.air_puff(), C['leafBlow'], -16, 'puff')
    hit('hush', W.far_bird(52, 1.0, 3), SH['s03'] - 0.12, -28, 'bird')


def section_dread():
    log('dread')
    a, b = SH['s03'], SH['s05']
    ship = C['ship']
    d1 = ship - a
    sw = lambda d, lo=0.4, hi=1.0: [(0, lo), (d, hi), (d + 4, hi)]
    # Cm: low strings and a choir pedal
    t2 = a + d1 + 1.9
    note('cb_sus', 'C1', a, t2 - a, vel=0.5, g=-7, att=1.0, rel=0.1)
    note('vc_trem', 'C2', a + 0.1, t2 - a - 0.1, vel=0.35, g=-10, att=1.2, rel=0.1, shape=sw(d1 + 2.0))
    note('vc_sus', 'G2', a + 0.2, t2 - a - 0.2, vel=0.35, g=-11, att=1.4, rel=0.1)
    note('va_sus', 'Eb3', a + 0.4, t2 - a - 0.4, vel=0.3, g=-12, att=1.4, rel=0.1)
    choir('C3', a + 0.2, t2 - a - 0.2, 501, 10, 'u', att=1.4, rel=0.1, g=-14, vib=0.008)
    choir('G3', a + 0.4, t2 - a - 0.4, 502, 10, 'u', att=1.4, rel=0.1, g=-16, vib=0.008)
    # the semitone threat in the horns as the ship appears
    note('hn_sus', 'C3', ship, 1.2, vel=0.4, g=-11, att=0.3, rel=0.1)
    note('hn_sus', 'Db3', ship + 1.1, max(0.3, t2 - ship - 1.1), vel=0.45, g=-10, att=0.2, rel=0.1)
    # Abm at ship + 2: Ab / Eb / Cb -- the C pedal has to be gone
    d2 = b - t2
    note('cb_sus', 'Ab0', t2, d2, vel=0.5, g=-7, att=0.6, rel=0.3)
    note('tu_sus', 'Ab1', t2, d2, vel=0.5, g=-11, att=0.6, rel=0.3)
    note('vc_trem', 'Ab1', t2, d2, vel=0.4, g=-10, att=0.5, rel=0.3)
    note('vc_sus', 'Eb2', t2, d2, vel=0.4, g=-11, att=0.5, rel=0.3)
    note('va_trem', 'B3', t2, d2, vel=0.35, g=-13, att=0.6, rel=0.3)
    choir('Eb3', t2, d2, 503, 10, 'u', att=0.8, rel=0.3, g=-13, vib=0.008)
    choir('B3', t2 + 0.1, d2 - 0.1, 504, 10, 'u', att=0.8, rel=0.3, g=-14, vib=0.008)
    note('vn_trem', 'Ab4', t2 + 0.6, d2 - 0.6, vel=0.15, g=-22, att=1.0, rel=0.3)
    # far fire, the trench; the ship's hull
    n = secs(b - a)
    fire = lp(W.stereo(n, 610, brown), 240) * env_points(n, [(0, 0.2), (0.8, 1.0), (b - a, 0.6)])[:, None]
    hit('world', fire, a, -21, 'far fire')
    ms = [24, 31, 36, 39, 43, 48, 51, 55, 60, 63]
    hit('sfx', X.metal_groan(3.0, 611, 0.7, 1.0, 0.3, ms=ms, tgts=[43, 48, 51, 55, 60]), ship, -13, 'ship groan')
    hit('sfx', X.metal_groan(2.2, 612, 0.6, 1.0, 0.4, ms=ms, tgts=[36, 43, 48, 51]), t2 + 0.2, -14, 'ship groan')
    # the beam retracting, far above
    hit('sfx', W.beam(2.0, 613, 0.25, env_points(secs(2.0), [(0, 0.8), (2.0, 0)]), 0, 0, 0.6, 0.5), ship + 0.3, -18, 'beam retracts')


def section_hush_broom():
    log('foley')
    for i, (t, d, lv) in enumerate(broom_strokes()):
        hit('hush', W.broom(d, 700 + i * 3, lv, 0.0, ((-1) ** i) * 0.25, ((-1) ** (i + 1)) * 0.2), t, -15, 'broom shff')
    # the satisfied tap
    hit('hush', W.wood_tap(13, 1.0), SH['s05'] + 1.75, -18, 'broom tap')
    # sirens, distant, and the shadow rumble
    s = C['drop'] - SH['s05']
    hit('hush', W.siren_far(s, 62, 1.0) * env_points(secs(s), [(0, 0.0), (0.4, 1.0), (s - 0.3, 0.8), (s, 0)])[:, None],
        SH['s05'], -34, 'distant sirens')
    d = C['drop'] - C['shadow']
    hit('hush', W.shadow_rumble(d, 71, 1.0), C['shadow'], -17, 'shadow rumble')
    # toe taps
    hit('hush', W.toe_tok(21, 1.0), C['toeTap1'], -15, 'toe tok 1')
    hit('hush', W.toe_tok(22, 0.85), C['toeTap2'], -15, 'toe tok 2')
    # the hair (very faint, in a near-silent shot)
    hit('hush', W.hair_tick(46, 1.0), C['strand'], -26, 'hair tick')
    # the air of the quiet shots: the world is still there, faintly (not in the silence before the sweep)
    for i, (a, b) in enumerate([(C['leafSnoot'], SH['s03'] + 0.6), (SH['s05'], C['drop']), (SH['s09'], SH['s10']), (SH['s12'], SH['s13']), (SH['s16'], SH['s18']), (C['flick'], C['flickBoom'])]):
        d_ = b - a
        rt = X.room_tone(d_, 47 + i * 2)
        rt = rt * env_points(len(rt), [(0, 1), (d_ - 0.02, 1), (d_, 0)])[:, None]
        hit('hush', rt, a, -41, 'room tone')
    # dust settling, soot, yawn
    s16, s18 = SH['s16'], SH['s18']
    hit('hush', W.dust_settle(s18 - s16 - 2.0, 151, 1.0), s16, -24, 'dust settling')
    hit('hush', W.soot_shake(261, 1.0), C['sootShake'], -14, 'soot shake')
    hit('hush', W.soot_fall(0.9, 271), C['sootShake'] + 0.65, -25, 'soot falling')
    hit('hush', W.yawn(s18 - C['yawn'] - 0.05, 291, 1.0), C['yawn'], -17, 'yawn')
    # the flick
    hit('hush', W.fsst(201, 1.0), C['flick'], -15, 'fsst')
    # veins: heartbeat + low drone (on hush so the crescendo can be cut off)
    v = C['veins']
    dv = C['pileGone'] - v
    note('cb_sus', 'C1', v, 1.0, vel=0.5, g=-11, att=0.03, rel=0.4, bus='hush')
    note('vc_sus', 'C2', v, 1.0, vel=0.35, g=-16, att=0.03, rel=0.4, bus='hush')
    t = v + 0.02
    for k in range(3):
        hit('hush', X.heartbeat(1.0, 160 + k), t, -10, 'heartbeat')
        t += 0.56
    # wind only (pileGone - 0.6 .. lookUp - 0.6), then two tiny plinks
    w0 = SH['s23']
    w1 = C['lookUp'] - 0.6
    dw = w1 - w0 + 1.4   # the wind thins out under the horn pedal instead of stopping
    hit('hush', W.wind_only(dw, 341, 1.6) * env_points(secs(dw), [(0, 0.2), (0.3, 1.0), (w1 - w0, 0.9), (dw, 0.0)])[:, None],
        w0, -20, 'wind')
    hit('hush', W.plink(351, 2350, 1.0, 0.25), C['pileGone'], -21, 'leaf plink')
    hit('hush', W.plink(352, 1560, 1.0, 0.3), C['citrusFall'], -19, 'citrus plink')
    # the broom creaks as the paws close
    g = C['grip']
    hit('sfx', W.creak(C['silence'] - g, 281, 1.0, None, 9, 34) *
        env_points(secs(C['silence'] - g), [(0, 0.5), (C['silence'] - g, 1.0)])[:, None], g, -12, 'broom creak')
    hit('sfx', W.fur_rustle(C['silence'] - g, 361, 1.0), g, -24, 'fur rustle')
    # the thread of high ringing in the silence
    d = 1.3
    tt = np.arange(secs(d)) / SR
    y = (np.sin(2 * np.pi * 7040 * tt) * 0.7 + np.sin(2 * np.pi * 7076 * tt) * 0.3) * (1 - tt / d) ** 1.6 * 0.02
    hit('thread', X.st(y, 0.3, 1), C['silence'] + 0.02, -18, 'thread of ringing')
    # the leaf at the end, gems etc in section_release()


def section_landing():
    log('landing')
    wl = C['land'] - C['drop']
    hit('sfx', W.whistle_fall(wl, 76, 1.0), C['drop'], -6, 'falling whistle')
    t = C['land']
    hit('sub', W.landing(141), t, 3.5, 'landing')
    # a heavy stinger: tuba and trombones on C with the b2 pressed on top (bare fifth + b2, no third)
    sh = [(0, 1), (0.4, 0.8), (1.2, 0.4), (2.5, 0.2)]
    note('tu_sus', 'C1', t, 1.3, vel=1.0, g=-1, rel=1.3, shape=sh, start=0.05)
    chord('tb_sus', ['C2', 'G2'], t, 1.3, vel=1.0, g=-2, rel=1.3, shape=sh, start=0.05)
    chord('hn_sus', ['C3', 'Db3', 'G3'], t, 1.3, vel=1.0, g=-3, rel=1.3, shape=sh, start=0.05)
    chord('vc_sus', ['C2', 'G2'], t, 1.4, vel=1.0, g=-4, rel=1.3, shape=sh, start=0.04)
    note('cb_sus', 'C1', t, 1.4, vel=1.0, g=-3, rel=1.3, shape=sh, start=0.04)
    timp('C2', t, 2, drum=2)
    hit('world', W.dust_settle(1.9, 152, 1.0), t + 0.4, -11, 'dust settling')


def section_boast():
    log('boast')
    t0, boast, end = SH['s07'], C['boast'], SH['s09']
    bar = (boast - t0) / 2
    beat = bar / 2
    # chromatic minor roots rising with the warlord (bars from the shot start)
    roots = [36, 36, 37, 38, 39, 39]
    n_bars = int(math.ceil((end - t0) / bar))
    for bi in range(n_bars):
        tb = t0 + bi * bar
        if tb >= end - 0.02:
            break
        r = roots[min(bi, len(roots) - 1)]
        d = min(bar, end - tb)
        up = 0.55 + 0.45 * bi / max(1, n_bars - 1)
        # the brass ostinato: heavy, straight quarters, no swing
        for k in range(2):
            t = tb + k * beat
            if t >= end:
                break
            v = (0.85 if k == 0 else 0.6) * up + 0.15
            note('tb_stac', r, t, beat * 0.7, vel=min(1, v), g=-3 + 2 * bi, rel=0.25, rr=bi * 2 + k)
            note('tu_stac', r - 12 if r - 12 >= 26 else r, t, beat * 0.7, vel=min(1, v), g=-5 + 2 * bi, rel=0.25, rr=bi * 2 + k)
            if bi >= 1:
                note('hn_stac', r + 12, t, beat * 0.6, vel=min(1, v), g=-10 + 2 * bi, rel=0.2, rr=bi * 2 + k)
        # low strings driving under it (straight eighths)
        for k in range(int(bar / (beat / 2)) + 1):
            t = tb + k * beat / 2
            if t >= tb + d - 0.01:
                break
            note('vc_spic', r, t, beat * 0.4, vel=0.6 * up + 0.2, g=-9 + 1.5 * bi, rel=0.12, rr=k + bi)
            if k % 2 == 0:
                note('cb_spic', r - 12 if r - 12 >= 28 else r, t, beat * 0.4, vel=0.7 * up, g=-9 + 1.5 * bi, rel=0.12, rr=k)
        tri = [r + 12, r + 15, r + 19]
        chord('hn_sus', tri, tb, d, vel=0.4 + 0.45 * up, g=-11 + 1.5 * bi, att=0.15, rel=0.2)
        chord('tb_sus', [r, r + 7], tb, d, vel=0.4 + 0.4 * up, g=-10 + 1.5 * bi, att=0.1, rel=0.2)
        if tb >= boast - 0.01:
            for i, m in enumerate(tri):
                choir(m, tb, d, 1200 + bi * 10 + i, 10, 'a', att=0.15, rel=0.2, g=-12 + 1.5 * (bi - 2))
            note('cb_sus', r - 12 if r - 12 >= 28 else r, tb, d, vel=0.6, g=-10, att=0.1, rel=0.2)
            timp(r, tb, -4 + bi, drum=2, dur=1.5)
            timp(r, tb + beat, -8 + bi, drum=2, dur=1.5)
        if tb >= boast + bar - 0.01:
            chord('vn_trem', [tri[0] + 12, tri[0] + 13], tb, d, vel=0.45 + 0.3 * up, g=-16, att=0.1, rel=0.2)
    # the mantle unfurls: rising whoosh
    hit('sfx', W.whoosh(1.1, 92, 200, 2500, 0.8, 1.0, 0.5, 0, 0), boast - 0.25, -13, 'mantle')
    # the eye
    t = C['eye']
    hit('sfx', W.eye_stinger(), t, -3, 'eye stinger')
    bars_ = [t0 + i * bar for i in range(n_bars) if t0 + i * bar < end - 0.02] + [end]
    for i in range(len(bars_) - 1):
        ta, tb = max(bars_[i], t), bars_[i + 1]
        if tb <= t + 0.01:
            continue
        r_ = roots[min(i, len(roots) - 1)]
        chord('vn_trem', [r_ + 48, r_ + 49], ta, tb - ta, vel=0.75, g=-14, att=0.01, rel=0.05)
    r_ = roots[min(int((t - t0) / bar), len(roots) - 1)]
    note('glass', r_ + 36, t, 0.9, vel=0.9, g=-11, rel=0.7, bus='harp')
    note('bells', r_ + 37, t, 1.0, vel=0.8, g=-14, rel=0.8, bus='harp')
    hit('perc', hp(X.S('crash_ff'), 3000), t, -19, 'eye cymbal')


def section_slash():
    log('slash')
    a, s, sl = SH['s10'], C['slash'], C['slide']
    end = SH['s12']
    # strings tighten: low tremolo, high cluster climbing
    note('cb_trem', 'C1', a, s - a, vel=0.45, g=-9, att=0.15, rel=0.05)
    note('vc_trem', 'C2', a, s - a, vel=0.5, g=-9, att=0.15, rel=0.05)
    note('va_trem', 'Gb3', a + 0.2, s - a - 0.2, vel=0.45, g=-13, att=0.2, rel=0.05)
    n = max(2, int((s - a) / 0.34))
    d = (s - a) / n
    for k in range(n):
        m = 72 + k
        note('vn_trem', m, a + k * d, d + 0.02, vel=0.32 + 0.5 * k / n, g=-18 + 7 * k / n, att=0.03, rel=0.08)
        note('vn_trem', m + 1, a + k * d, d + 0.02, vel=0.3 + 0.5 * k / n, g=-20 + 7 * k / n, att=0.03, rel=0.08)
    # blade arm cocks: a held breath
    note('hn_sus', 'C3', C['slashWind'], 0.8, vel=0.5, g=-12, att=0.4, rel=0.3)
    note('hn_sus', 'Eb3', C['slashWind'] + 0.2, 0.6, vel=0.5, g=-13, att=0.4, rel=0.3)
    # THE slash
    hit('sfx', W.slash(101, 1.0), s - 0.1, -4, 'slash')
    t = s
    sh = [(0, 1), (0.4, 0.75), (1.1, 0.35), (2.2, 0.1)]
    note('tu_sus', 'C1', t, 1.1, vel=0.9, g=-5, rel=1.0, shape=sh, start=0.05)
    chord('tb_sus', ['C2', 'Gb2'], t, 1.1, vel=0.9, g=-5, rel=1.0, shape=sh, start=0.05)
    chord('hn_sus', ['C3', 'Eb3', 'Gb3'], t, 1.1, vel=0.9, g=-5, rel=1.0, shape=sh, start=0.05)
    chord('vn_trem', ['Gb5', 'G5'], t, 0.9, vel=0.8, g=-10, rel=0.8, shape=sh)
    hit('perc', W.at_onset(X.S('gong_ff', 0.72)), t, -8, 'slash gong')
    timp('C2', t, -2, drum=2)
    # towers slide: the stone moans for 2 s; low strings hold their breath under it
    dur = end - sl
    hit('world', W.tower_slide(dur, 171, 1.0), sl, -2, 'tower slide')
    note('cb_sus', 'C1', sl, dur, vel=0.5, g=-8, att=0.6, rel=0.05)
    note('vc_sus', 'Gb2', sl, dur, vel=0.4, g=-11, att=0.6, rel=0.05)
    note('va_trem', 'Eb4', sl + 0.3, dur - 0.3, vel=0.25, g=-17, att=0.5, rel=0.05)
    choir('C3', sl, dur, 1400, 10, 'u', att=0.5, rel=0.05, g=-15, vib=0.006)


def section_battle():
    log('battle')
    a, sh, b, ru, bh = SH['s13'], C['shedStart'], C['barrage'], C['rush'], C['bladeHit']
    hit('sfx', W.roar(C['shed'] - sh, 181, 1.0), sh, -8, 'warlord roar')
    hit('sub', W.armour_burst(211), C['shed'], 1.5, 'armour burst')
    # gems scattering
    r = rng(800)
    for k in range(10):
        note('glock', int(r.choice([79, 82, 84, 87, 91])), C['shed'] + 0.1 + k * 0.1 + r.uniform(0, 0.08), 0.4, vel=0.5, g=-22, rel=0.35)
    # transposition of the ostinato (all rising by step): the chord above is always a minor triad
    steps = [(a, 0), (C['shed'], 3), (C['shed'] + 1.05, 5), (b, 7), (b + 1.1, 8), (b + 2.2, 10), (ru + 0.55, 11)]

    def tr(t):
        v = 0
        for tt, s in steps:
            if t >= tt - 1e-6:
                v = s
        return v

    def to_next(t):
        nx = [tt for tt, s in steps if tt > t + 1e-6] + [bh]
        return min(nx) - t

    pat = [0, 0, 12, 0, 3, 0, 1, 0]
    # eighths accelerating 108 -> 156 bpm
    tt_, k = a, 0
    while tt_ < bh - 0.01:
        u = (tt_ - a) / (bh - a)
        e8 = 60 / (108 + 48 * u) / 2
        root = 36 + tr(tt_)
        n = root + pat[k % len(pat)]
        acc = k % 4 == 0
        v = 0.5 + 0.45 * u + (0.1 if acc else 0)
        dn = min(e8 * 0.75, to_next(tt_))
        note('vc_spic', n, tt_, dn, vel=min(1, v), g=-7 + 4 * u + (2 if acc else 0), rel=0.05, rr=k)
        note('va_spic', n + 12, tt_, min(e8 * 0.65, to_next(tt_)), vel=min(1, v) * 0.8, g=-13 + 5 * u, rel=0.05, rr=k + 1)
        if acc or k % 4 == 3:
            note('cb_spic', n - 12 if n - 12 >= 28 else n, tt_, min(e8 * 0.7, to_next(tt_)), vel=min(1, v), g=-8 + 4 * u, rel=0.05, rr=k)
        if k % 2 == 0:
            timp(root, tt_, -13 + 9 * u + (3 if acc else 0), drum=2, dur=1.3)
        if acc:
            hit('perc', X.S('bd2_f', 0.84, 1.3), tt_, -9 + 5 * u, 'battle pulse')
        if k % 4 == 2 and tt_ >= C['shed']:
            hit('perc', X.S('frameL' if k % 8 == 2 else 'frameL2', 0.85, 0.8), tt_, -13 + 6 * u, 'frame drum')
        tt_ += e8
        k += 1
    # the sustained chords above, one per step
    pts = steps + [(bh, 0)]
    for i in range(len(pts) - 1):
        ta, tb_ = pts[i][0], pts[i + 1][0]
        if tb_ - ta < 0.05:
            continue
        r = 36 + pts[i][1]
        d = tb_ - ta
        u = (ta - a) / (bh - a)
        tri = [r + 12, r + 15, r + 19]
        chord('hn_sus', tri, ta, d, vel=0.5 + 0.45 * u, g=-11 + 5 * u, att=0.04, rel=0.12)
        chord('tb_sus', [r, r + 7], ta, d, vel=0.5 + 0.45 * u, g=-10 + 5 * u, att=0.04, rel=0.12)
        note('tu_sus', r - 12 if r - 12 >= 26 else r, ta, d, vel=0.6, g=-8 + 4 * u, att=0.04, rel=0.12)
        chord('vn_trem', [r + 24, r + 25], ta, d, vel=0.4 + 0.5 * u, g=-14 + 5 * u, att=0.04, rel=0.12)
        if ta >= C['shed'] - 1e-3:
            for j, m in enumerate(tri):
                choir(m, ta, d, 1500 + i * 10 + j, 10, 'a', att=0.1, rel=0.2, g=-12 + 6 * u)
    # trumpets on the last rise
    chord('tp_sus', [36 + 10 + 24 + 3], b + 2.2, ru + 0.55 - (b + 2.2), vel=0.8, g=-8, att=0.1, rel=0.1)
    # impacts: every one of them gets a stab and a boom on its frame
    IMPS = impact_list()
    log('impacts:', ', '.join(f"{m['t']:.2f}" for m in IMPS))
    dedupe = [C['land'], C['shed'], C['bladeHit'], C['rush'] + 0.5, C['rush'] + 0.9, C['sweep']]
    for i, m in enumerate(IMPS):
        t = m['t']
        if t < a or t > bh + 0.02 or any(abs(t - q) < 0.12 for q in dedupe) or (m['kind'] and m['kind'] not in ('boom', 'hit', 'bolt')):
            continue
        size = max(0.4, m['size'] * 1.6)   # fx sizes are 0.5 (hit), 0.8 (boom), 1.0 (last boom)
        dist = max(0.8, min(3.0, m['dist'] / 40))
        x, pre = W.bolt_impact(size, dist, max(-0.85, min(0.85, m['pan'] * 0.85)), 1800 + i * 13)
        hit('world', x, t - pre, -2 + 4 * math.log10(max(size, 0.5)), 'bolt impact')
        root = 36 + tr(t)
        vel = min(1, 0.55 + 0.3 * size)
        ds = min(0.22, to_next(t))
        note('tb_stac', root + 12, t, ds, vel=vel, g=-5, rel=0.1, rr=i)
        note('tu_stac', root, t, ds, vel=vel, g=-5, rel=0.1, rr=i)
        note('hn_stac', root + 12, t, ds, vel=vel, g=-8, rel=0.1, rr=i)
        hit('perc', X.S('bd2_ff', 0.75, 1.5), t, -6 + 3 * math.log10(max(size, 0.5)), 'impact drum')
    # the dash
    d = bh - ru
    hit('sfx', W.whoosh(d, 93, 200, 3500, 0.92, 1.0, 0.5, -0.9, 0.5), ru, -5, 'rush whoosh')
    hit('world', W.far_tower_crash(251, 0.95), ru + 0.5, -2, 'tower crash')
    hit('world', W.far_tower_crash(252, 1.1), ru + 0.9, -1, 'tower crash')
    roll = varispeed(load(X.P['timp_roll']), 0.92)[:secs(d)]
    roll = roll * np.linspace(0.1, 1.0, len(roll))[:, None] ** 2
    hit('perc', fade(roll.copy(), 0.1, 0.01), bh - len(roll) / SR, -6, 'timp roll')
    sw = X.reverse_swell(1.1, 13, 'sus_roll_long', 1.0)
    hit('perc', sw, bh - len(sw) / SR, -8, 'reverse swell')
    # THE BLADE HIT: loudest so far; C with Db and Gb, no third
    hit('sub', W.blade_hit(241), bh, 5, 'blade hit')
    sh2 = [(0, 1), (0.4, 0.8), (0.72, 0.55)]
    note('tu_sus', 'C1', bh, 0.7, vel=1.0, g=1, rel=0.25, shape=sh2, start=0.05)
    chord('tb_sus', ['C2', 'Eb3'], bh, 0.7, vel=1.0, g=0, rel=0.25, shape=sh2, start=0.05)
    chord('hn_sus', ['C3', 'Db3', 'Gb3'], bh, 0.7, vel=1.0, g=-1, rel=0.25, shape=sh2, start=0.05)
    chord('tp_sus', ['Db4', 'Gb4'], bh, 0.7, vel=0.95, g=-6, rel=0.25, shape=sh2, start=0.05)
    chord('vc_sus', ['C2', 'Gb2'], bh, 0.7, vel=1.0, g=-2, rel=0.25, shape=sh2, start=0.04)
    chord('vn_trem', ['Db5', 'Gb5', 'C6'], bh, 0.7, vel=0.9, g=-6, rel=0.25, shape=sh2)
    timp('C2', bh, 2, drum=2)


def section_scream():
    log('scream')
    a, f = SH['s18'], C['flick']
    d = f - a
    hit('sfx', W.scream(d, 191, 1.0), a, -5, 'scream')
    chord('va_trem', ['Gb4', 'G4'], a, d, vel=0.75, g=-14, att=0.1, rel=0.02)
    chord('vn_trem', ['C6', 'Db6'], a + 0.2, d - 0.2, vel=0.7, g=-16, att=0.2, rel=0.02)
    note('hn_sus', 'C3', a + 0.2, d - 0.2, vel=0.75, g=-10, att=0.2, rel=0.02)
    note('hn_sus', 'Db3', a + 0.5, d - 0.5, vel=0.75, g=-10, att=0.2, rel=0.02)
    t = C['flickBoom']
    # the huge delayed boom
    kit = [('bd_vsco_fff', 0.6, 1.1, 0, 0), ('bd2_ff', 0.66, 1.0, 0.002, 0), ('gong_ff', 0.66, 0.7, 0.006, 2200), ('crash_ff', 0.85, 0.3, 0, 0)]
    hit('sub', W.big_hit(902, 90, 24, 1.8, 6.5, kit, 0.45, 0.65), t, 3.5, 'delayed boom')
    sh = [(0, 1), (0.5, 0.7), (1.4, 0.3), (2.6, 0.08)]
    d3 = min(1.3, C['regen'] - t - 0.02)   # the Cm of the boom must be gone when the regen's Ab enters
    note('tu_sus', 'C1', t, d3, vel=1.0, g=-2, rel=0.3, shape=sh, start=0.05)
    chord('tb_sus', ['C2', 'G2'], t, d3, vel=1.0, g=-3, rel=0.3, shape=sh, start=0.05)
    chord('hn_sus', ['C3', 'Eb3', 'G3'], t, d3, vel=0.9, g=-4, rel=0.3, shape=sh, start=0.05)


def section_regen():
    log('regen')
    s, r, asc = SH['s19'], C['regen'], C['ascend']
    hit('sfx', W.wet_crackle(asc - s, 301, 1.0), s + 0.05, -16, 'wet regen')
    # low choir that sounds like laughter: bursts "ha ha ha" on C and F, heavier as it goes
    def laugh(notes, t, dur, seed, g, rate):
        n = secs(dur + 0.3)
        tt = np.arange(n) / SR
        ph = (tt * rate) % 1.0
        gate = (1 - ph) ** 1.6 * np.clip(ph / 0.05, 0, 1)
        phrase = 0.45 + 0.55 * (0.5 - 0.5 * np.cos(2 * np.pi * (tt / 1.4)))
        e = gate * phrase * np.clip(tt / 0.3, 0, 1) * np.clip((dur + 0.3 - tt) / 0.3, 0, 1)
        for i, m in enumerate(notes):
            bend = 2 ** (-(ph * 0.45) / 12)
            choir(m, t, dur, seed + i, 10, 'a', att=0.02, rel=0.3, g=g, bend=bend, envx=e, vib=0.01)
    laugh(['C3', 'Ab3'], r, asc - r, 2100, -8, 4.6)
    laugh(['F3', 'C4'], r + 1.0, asc - r - 1.0, 2110, -13, 4.6)
    # low warmth under it, all minor (Fm)
    d = asc - r
    note('bn', 'F2', r, d, vel=0.5, g=-12, att=0.4, rel=0.15)
    note('cb_sus', 'F1', r, d, vel=0.55, g=-10, att=0.4, rel=0.15)
    note('vc_sus', 'C2', r + 0.3, d - 0.3, vel=0.5, g=-13, att=0.4, rel=0.15)
    note('va_sus', 'Ab3', r + 0.7, d - 0.7, vel=0.45, g=-10, att=0.5, rel=0.15)
    note('hn_sus', 'Ab3', r + 0.9, d - 0.9, vel=0.45, g=-12, att=0.5, rel=0.15)
    note('hn_sus', 'F2', r + 1.2, d - 1.2, vel=0.5, g=-11, att=0.7, rel=0.15)


def section_climb():
    log('climb')
    a, v = C['ascend'], C['veins']
    d = v - a
    slot = d / 8
    hit('sfx', W.rocket(d, 321, 1.0), a, -8, 'rocket')
    win = lambda p: np.exp(-((p - 62) / 20) ** 2)
    # Shepard-like layers: a minor triad gliding up together, a semitone per slot, level windowed on pitch
    rt0 = 0
    layers = [('cb_sus', 24, 7), ('vc_sus', 36, 5), ('vc_sus', 48, 5), ('va_sus', 60, 3), ('vn_sus', 72, 2)]
    for li, (key, m0, top) in enumerate(layers):
        for ivl, g0 in [(0, 0), (3, -1.5), (7, -1)]:
            if m0 == 24 and ivl:
                continue
            glide(key, m0 + ivl, m0 + ivl + 8, a, d, vel=0.5, g=-8 + g0 - li * 0.5, att=0.3, rel=0.05, win=win, steps=8)
    # choir slides with them
    for i, (m, g) in enumerate([(48, -7), (51, -8), (55, -8), (60, -9), (63, -10), (67, -11)]):
        n = secs(d + 0.05)
        bend = 2 ** (8 * np.clip((np.arange(n) / SR) / d, 0, 1) / 12)
        choir(m, a, d, 2300 + i, 10, 'a', att=0.5, rel=0.05, g=g, bend=bend, vib=0.012, steps=8)
    # brass: chromatic minor chords, one per slot, growing; organ-like winds join at gather
    for k in range(8):
        t = a + k * slot
        r = 36 + k
        u = k / 7
        tri = [r + 12, r + 15, r + 19]
        chord('tb_sus', [r, r + 7], t, slot, vel=0.5 + 0.45 * u, g=-9 + 7 * u, att=0.04, rel=0.05)
        chord('hn_sus', tri, t, slot, vel=0.5 + 0.45 * u, g=-11 + 7 * u, att=0.04, rel=0.05)
        note('tu_sus', r - 12 if r - 12 >= 26 else r, t, slot, vel=0.5 + 0.4 * u, g=-9 + 7 * u, att=0.04, rel=0.05)
        if t >= C['gather'] - 0.01:
            # organ-like: flute/oboe/clarinet/bassoon on the root and fifth over several octaves
            note('bn', r, t, slot, vel=0.5, g=-13 + 5 * u, att=0.04, rel=0.05)
            note('cl', r + 12, t, slot, vel=0.5, g=-13 + 5 * u, att=0.04, rel=0.05)
            note('ob', r + 19, t, slot, vel=0.5, g=-13 + 5 * u, att=0.04, rel=0.05)
            note('fl', r + 24, t, slot, vel=0.5, g=-14 + 5 * u, att=0.04, rel=0.05)
            note('fl', r + 31, t, slot, vel=0.5, g=-15 + 5 * u, att=0.04, rel=0.05)
        if k >= 4:
            chord('tp_sus', [r + 24, r + 31 - 12], t, slot, vel=0.8, g=-12 + 7 * u, att=0.04, rel=0.05)
        timp(r, t, -14 + 12 * u, drum=2, dur=1.2)
    roll = varispeed(load(X.P['timp_roll2']), 0.95)[:secs(d)]
    roll = roll * np.linspace(0.06, 1.0, len(roll))[:, None] ** 2
    hit('perc', fade(roll.copy(), 0.1, 0.01), a, -7, 'timp roll')
    # the star
    hit('sfx', W.star_flare(331, 1.0), C['star'], -4, 'star flare')
    note('glass', 'C6', C['star'], 1.0, vel=0.9, g=-9, rel=0.8, bus='harp')
    note('vib_bow', 'Eb5', C['star'], 1.8, vel=0.9, g=-10, rel=0.8, bus='harp')
    hit('perc', W.at_onset(X.S('gong_mf', 0.8)), C['star'], -9, 'star gong')


def section_gathering():
    log('horn pedal, beam')
    a, f = C['lookUp'] - 0.6, C['fire']
    d = f - a
    # very low horn pedal slowly swelling, no drums
    sw = [(0, 0.3), (d * 0.6, 0.55), (d, 1.0), (d + 0.5, 1.0)]
    note('hn_sus', 'C2', a, d + 0.2, vel=0.45, g=-9, att=1.2, rel=0.3, shape=sw)
    note('hn_sus', 'C3', a + 0.3, d - 0.1, vel=0.4, g=-14, att=1.2, rel=0.3, shape=sw)
    note('tb_sus', 'C2', C['brows'] - 0.15, f - C['brows'] + 0.35, vel=0.5, g=-11, att=0.7, rel=0.3, shape=[(0, 0.4), (f - C['brows'] + 0.2, 1.0)])
    note('tu_sus', 'C1', C['brows'], f - C['brows'] + 0.35, vel=0.45, g=-13, att=0.7, rel=0.3, shape=[(0, 0.4), (f - C['brows'] + 0.2, 1.0)])
    note('hn_sus', 'Eb3', C['brows'], f - C['brows'] + 0.3, vel=0.5, g=-12, att=0.5, rel=0.3, shape=[(0, 0.4), (f - C['brows'] + 0.2, 1.0)])
    # the beam: sustained world-ending roar
    b = C['silence'] - f
    n = secs(b)
    gr = C['grip']
    env = env_points(n, [(0, 0.2), (0.18, 1.0), (SH['s25'] - f, 1.0), (SH['s25'] - f + 0.25, 0.42), (gr - f, 0.42), (b, 0.6)])
    hit('sfx', W.beam(b, 83, 1.4, env, -0.2, 0.2, 1.3, 1.5), f, 5, 'THE BEAM')
    hit('sub', W.big_hit(903, 70, 22, 2.5, 5.5, [('bd2_ff', 0.6, 0.8, 0, 0), ('gong_ff', 0.6, 0.7, 0, 2000)], 0.15, 0.3), f, 1, 'beam hit')
    # low brass under the roar, no notes on top of it until the grip
    d2 = SH['s25'] - f
    note('tu_sus', 'C1', f, b, vel=0.85, g=-4, att=0.15, rel=0.03, shape=[(0, 1), (d2, 1), (d2 + 0.3, 0.55), (b, 0.85)])
    chord('tb_sus', ['C2', 'G2'], f, b, vel=0.85, g=-4, att=0.15, rel=0.03, shape=[(0, 1), (d2, 1), (d2 + 0.3, 0.5), (b, 0.8)])
    note('cb_sus', 'C1', f, b, vel=0.8, g=-5, att=0.15, rel=0.03)
    note('hn_sus', 'Eb3', f, b, vel=0.7, g=-9, att=0.15, rel=0.03)
    note('hn_sus', 'G3', f, b, vel=0.7, g=-11, att=0.15, rel=0.03)
    # tension peak: strings rising in clusters, hard cut at the silence
    t = SH['s25']
    b2 = C['silence'] - t
    up = [(0, 0.3), (b2, 1.0), (b2 + 0.1, 1.0)]
    chord('vn_trem', ['C6', 'Db6'], t, b2, vel=0.8, g=-11, att=0.3, rel=0.02, shape=up)
    chord('va_trem', ['Gb4', 'G4'], t, b2, vel=0.75, g=-10, att=0.3, rel=0.02, shape=up)
    chord('vc_trem', ['C3', 'Db3'], t, b2, vel=0.75, g=-9, att=0.3, rel=0.02, shape=up)
    chord('hn_sus', ['C3', 'Eb3', 'Gb3'], t + 0.4, b2 - 0.4, vel=0.85, g=-8, att=0.4, rel=0.02, shape=[(0, 0.3), (b2 - 0.4, 1.0), (b2, 1)])
    roll = varispeed(load(X.P['timp_roll']), 0.86)[:secs(b2)]
    roll = roll * np.linspace(0.05, 1.0, len(roll))[:, None] ** 2.2
    hit('perc', fade(roll.copy(), 0.1, 0.005), t, -6, 'timp roll')
    # (the broom creak + fur are in section_hush_broom)


def section_release():
    log('release')
    t = C['sweep']
    # 1) THE SOUND
    hit('sub', W.the_sweep(), t, 8.0, 'THE SWEEP')
    fp = [(0, 1), (0.25, 0.95), (0.7, 0.55), (t + 0.8 - t + 1.6, 0.0)]
    note('tu_sus', 'C1', t, 1.0, vel=1.0, g=7, rel=1.4, shape=fp, start=0.05)
    chord('tb_sus', ['C2', 'G2', 'C3'], t, 1.0, vel=1.0, g=6, rel=1.4, shape=fp, start=0.05)
    chord('hn_sus', ['C3', 'G3', 'C4', 'G4'], t, 1.0, vel=1.0, g=5, rel=1.4, shape=fp, start=0.05)
    chord('tp_sus', ['C4', 'G4', 'C5'], t, 1.0, vel=1.0, g=1, rel=1.4, shape=fp, start=0.05)
    chord('vc_sus', ['C2', 'G2', 'C3'], t, 1.0, vel=1.0, g=4, rel=1.4, shape=fp, start=0.04)
    chord('va_sus', ['G3', 'C4'], t, 1.0, vel=1.0, g=3, rel=1.4, shape=fp, start=0.04)
    chord('vn_sus', ['C5', 'G5', 'C6'], t, 1.0, vel=1.0, g=3, rel=1.4, shape=fp, start=0.04)
    note('cb_sus', 'C1', t, 1.0, vel=1.0, g=5, rel=1.4, shape=fp, start=0.04)
    for i, m in enumerate(['C3', 'G3', 'C4', 'G4', 'C5']):
        choir(m, t, 1.0, 3100 + i, 12, 'a', att=0.02, rel=1.4, g=0, shape=fp)
    timp('C2', t, 5, drum=2)
    timp('G2', t + 0.003, 2, drum=2)

    # 2) the air comes back, a long rush thinning out
    hit('world', W.air_open(4.8, 421, 1.0), C['tunnel'] - 0.2, -14, 'air opening')
    # 3) the warlord dissolving, the ship shearing
    hit('sfx', W.dissolve(C['breakupEnd'] - C['breakup'], 431, 1.0), C['breakup'], -13, 'chitin dissolving')
    hit('sfx', W.ship_shear(C['breakupEnd'] - C['breakup'], 441, 1.0), C['breakup'] + 0.5, -15, 'ship shears')
    r = rng(900)
    for k in range(16):
        note('glock', int(r.choice([79, 84, 86, 91, 96])), C['breakup'] + 0.1 + k * 0.17 + r.uniform(-0.06, 0.06), 0.45, vel=0.45, g=-22, rel=0.4)

    # 4) the release: chords on the cues (bass, tenor, top, choir), first major chord in the film at chord 1
    ts = [C['tunnel'], C['tunnel'] + 1.2, C['breakup'], C['breakup'] + 1.2, C['breakup'] + 2.2, C['planet'] - 0.45, C['planet']]
    prog = [
        (ts[0], ['C2', 'G2'], ['C3', 'G3', 'Eb4'], ['G4', 'C5', 'D5'], ['C4', 'Eb4', 'G4'], -5),                   # Cm(add9)
        (ts[1], ['Ab1', 'Eb2'], ['Ab2', 'Eb3', 'C4'], ['Eb4', 'Ab4', 'D5'], ['Ab3', 'C4', 'Eb4'], -3),              # Ab (lydian #4)
        (ts[2], ['Bb1', 'F2'], ['Bb2', 'F3', 'Eb4'], ['F4', 'Bb4', 'C5'], ['Bb3', 'Eb4', 'F4'], -2),                # Bbsus4
        (ts[3], ['Eb2', 'Bb2'], ['Eb3', 'Bb3', 'G4'], ['Eb5', 'G5'], ['Bb3', 'Eb4', 'G4'], -1),                     # Eb
        (ts[4], ['F2', 'C3'], ['F3', 'A3', 'C4'], ['F5', 'A5'], ['A3', 'C4', 'F4'], 0),                             # F
        (ts[5], ['G2', 'D3'], ['G3', 'B3', 'D4'], ['G5', 'B5'], ['B3', 'D4', 'G4'], 1),                             # G
    ]
    for k in range(len(prog)):
        t0, bass, mid, top, chs, g = prog[k]
        d = (prog[k + 1][0] if k + 1 < len(prog) else ts[6]) - t0
        v = 0.55 + 0.08 * k
        chord('tb_sus', bass, t0, d, vel=v, g=g - 2, att=0.2, rel=0.25)
        note('tu_sus', M(bass[0]) - 12 if M(bass[0]) - 12 >= 26 else bass[0], t0, d, vel=v, g=g - 2, att=0.2, rel=0.25)
        chord('hn_sus', mid, t0, d, vel=v, g=g - 3, att=0.2, rel=0.25)
        chord('vc_sus', [bass[0], bass[1]], t0, d, vel=v, g=g - 3, att=0.2, rel=0.25)
        note('cb_sus', M(bass[0]) - 12 if M(bass[0]) - 12 >= 28 else bass[0], t0, d, vel=v, g=g - 3, att=0.2, rel=0.25)
        chord('va_sus', mid[1:], t0, d, vel=v, g=g - 5, att=0.2, rel=0.25)
        chord('vn_sus', top, t0, d, vel=v, g=g - 5, att=0.2, rel=0.25)
        for i, m in enumerate(chs):
            choir(m, t0, d, 3300 + k * 10 + i, 10, 'a', att=0.25, rel=0.3, g=g - 8)
        if k >= 3:
            chord('tp_sus', top, t0, d, vel=v, g=g - 7, att=0.15, rel=0.2)
        timp(bass[0], t0, -8 + k, drum=2, dur=2.0)
    # the climb of the melody, in brass and violins, ending on C6 at the planet
    mel = [(ts[0], 'G4', 0.6), (ts[0] + 0.6, 'Bb4', 0.6), (ts[1], 'C5', 0.6), (ts[1] + 0.6, 'D5', 0.6), (ts[2], 'Eb5', 0.6),
           (ts[2] + 0.6, 'F5', 0.6), (ts[3], 'G5', 0.6), (ts[3] + 0.6, 'Bb5', 0.4), (ts[4], 'A5', ts[5] - ts[4]), (ts[5], 'B5', ts[6] - ts[5])]
    for k, (tm, n, d) in enumerate(mel):
        note('hn_sus', M(n) - 12, tm, d + 0.05, vel=0.7, g=-6 + 0.5 * k, att=0.08, rel=0.2)
        note('tp_sus', n, tm, d + 0.05, vel=0.75, g=-7 + 0.5 * k, att=0.08, rel=0.2)
        note('vn_sus', n, tm, d + 0.05, vel=0.75, g=-7 + 0.5 * k, att=0.06, rel=0.2)
    # cymbal swell + timp roll into the planet
    sw = X.reverse_swell(1.4, 15, 'sus_roll_long', 1.0)
    hit('perc', sw, ts[6] - len(sw) / SR, -7, 'cymbal swell')
    rl = varispeed(load(X.P['timp_roll2']), 0.9)[:secs(1.5)]
    rl = rl * np.linspace(0.1, 1.0, len(rl))[:, None] ** 2
    hit('perc', fade(rl.copy(), 0.1, 0.01), ts[6] - len(rl) / SR, -6, 'timp roll')

    # 5) the planet: C major, the whole orchestra opens
    p = C['planet']
    sky = C['skyClear']
    pieces = [(p, sky - p, ['C2', 'G2'], ['C3', 'G3', 'C4', 'E4'], ['C5', 'E5', 'G5'], ['C4', 'E4', 'G4'], 0),
              ]
    # harmony over the planet shot: C | Ab/C | F/C | C(add9, #11)
    t1 = p + 1.6
    t2 = p + 2.6
    t3 = p + 3.6
    plan = [(p, t1 - p, 'C2', 'G2', ['C3', 'G3', 'C4', 'E4'], ['C5', 'E5', 'G5', 'C6'], ['C4', 'E4', 'G4'], 0.0, 'C'),
            (t1, t2 - t1, 'C2', 'Eb3', ['Ab3', 'C4', 'Eb4'], ['C5', 'Eb5', 'Ab5'], ['Ab3', 'C4', 'Eb4'], -0.5, 'Ab/C'),
            (t2, t3 - t2, 'C2', 'F2', ['F3', 'A3', 'C4'], ['A4', 'C5', 'F5'], ['A3', 'C4', 'F4'], -1.0, 'F/C'),
            (t3, sky - t3, 'C2', 'G2', ['C3', 'G3', 'E4'], ['D5', 'E5', 'Gb5', 'G5'], ['C4', 'E4', 'G4'], -2.0, 'C add9 #11')]
    for k, (t0, d, b0, b1, mid, top, chs, g, nm) in enumerate(plan):
        last = k == len(plan) - 1
        tail = 3.5 if last else 0.3
        shp = [(0, 1), (d, 1), (d + tail, 0)] if last else None
        extra = {'shape': shp} if shp else {}
        note('tu_sus', M(b0) - 12 if M(b0) - 12 >= 26 else b0, t0, d, vel=0.9, g=g - 1, att=0.05, rel=tail, **extra)
        chord('tb_sus', [b0, b1], t0, d, vel=0.9, g=g - 1, att=0.05, rel=tail, **extra)
        chord('hn_sus', mid, t0, d, vel=0.9, g=g - 2, att=0.05, rel=tail, **extra)
        chord('vc_sus', [b0, b1], t0, d, vel=0.9, g=g - 2, att=0.05, rel=tail, **extra)
        note('cb_sus', M(b0) - 12 if M(b0) - 12 >= 28 else b0, t0, d, vel=0.9, g=g - 2, att=0.05, rel=tail, **extra)
        chord('va_sus', mid[1:], t0, d, vel=0.9, g=g - 4, att=0.05, rel=tail, **extra)
        chord('vn_sus', top, t0, d, vel=0.9, g=g - 3, att=0.05, rel=tail, **extra)
        chord('tp_sus', top[:-1], t0, d, vel=0.85, g=g - 7, att=0.05, rel=tail, **extra)
        for i, m in enumerate(chs):
            choir(m, t0, d, 3500 + k * 10 + i, 12, 'a', att=0.15, rel=tail, g=g - 7, **extra)
        for i, m in enumerate([M(x) + 12 for x in chs]):
            choir(m, t0, d, 3560 + k * 10 + i, 12, 'a', att=0.15, rel=tail, g=g - 10, **extra)
        timp(b0, t0, -2 - k * 2, drum=2, dur=3.0)
    # the melody over the planet: long notes
    for tm, n, d in [(p, 'G5', t1 - p), (t1, 'Ab5', t2 - t1), (t2, 'A5', t3 - t2), (t3, 'Gb5', 0.5), (t3 + 0.5, 'G5', sky - t3 - 0.5)]:
        note('vn_sus', n, tm, d + 0.05, vel=0.85, g=-4, att=0.08, rel=0.25)
        note('hn_sus', M(n) - 12, tm, d + 0.05, vel=0.8, g=-6, att=0.08, rel=0.25)
    # gong and crash on the planet, soft
    hit('perc', W.at_onset(X.S('gong_ff', 0.75)), p, -6, 'planet gong')
    hit('perc', W.at_onset(X.S('crash_ff', 0.9)), p, -9, 'planet crash')
    hit('perc', W.at_onset(X.S('bd2_ff', 0.72)), p, -2, 'planet drum')

    # 6) the sky clears: the chord dies, the wind comes back, gems fall
    d = C['backToWork'] - sky
    hit('amb', W.wind_only(d + 0.6, 342, 1.0) * env_points(secs(d + 0.6), [(0, 0), (1.2, 1.0), (d - 0.4, 0.6), (d + 0.6, 0.0)])[:, None], sky, -28, 'gentle wind')
    r = rng(950)
    t, k = sky + 0.2, 0
    while t < sky + 2.4:
        n_ = int(r.choice([84, 86, 88, 91, 93, 96]))
        note('glock', n_, t, 0.5, vel=float(r.uniform(0.3, 0.5)), g=-21, rel=0.5, cents=float(r.uniform(-8, 8)))
        t += float(r.uniform(0.13, 0.32))
        k += 1
    # 7) one solo clarinet, sparse, unresolved
    t = C['skyClear'] + 2.6
    # motif: G4 ... A4 E4 ... D4 (the ninth, never resolved)
    phrase = [(0.0, 'G4', 1.0), (1.3, 'A4', 0.7), (2.2, 'E4', 0.9), (3.3, 'D4', 1.25)]
    for dt, n, dd in phrase:
        last = n == 'D4'
        note('cl', n, t + dt, dd + 0.1, vel=0.32, g=-1, att=0.14, rel=0.55 if not last else 0.3, shape=([(0, 1), (dd * 0.7, 0.9), (dd, 0.0)] if last else None))
    # a single bird
    hit('hush', W.far_bird(55, 1.0, 2, 3000), C['stump'] + 0.35, -29, 'bird')
    hit('hush', W.far_bird(56, 0.7, 3, 3400), C['leafEnd'] + 1.0, -32, 'bird')
    # the leaf
    hit('hush', W.leaf_land(451, 1.0), C['leafLand'], -28, 'leaf lands')


# =====================================================================================================
# Mix + master
# =====================================================================================================
GROUPS = {'music': ['str', 'brass', 'wind', 'choir', 'harp', 'perc'], 'fx': ['sfx', 'world'], 'sub': ['sub']}


def seg_ride(segs):
    """[(start, end, dB)] sorted -> piecewise-constant dB curve, 0 dB elsewhere, 30 ms ramps (the gates hide most of them)."""
    pts = [(0.0, 0.0)] if segs and segs[0][0] > 0 else []
    pe, pv = 0.0, 0.0
    for a, b, v in segs:
        if a - pe > 0.06:
            if pts and pv != 0.0:
                pts.append((pe + 0.03, 0.0))
            if a >= 0.03:
                pts.append((a - 0.03, 0.0))
        elif pts:
            a = pe + 0.002
        pts += [(max(a, pts[-1][0] + 1e-4) if pts else a, v), (b, v)]
        pe, pv = b, v
    pts += [(max(pe + 0.03, pts[-1][0] + 1e-4), 0.0), (max(DUR, pe + 0.04), 0.0)]
    return pts


def rides():
    """The dynamic contour of the film, in dB, section by section (measured against the map in NOTES.md)."""
    t = C
    secs_ = [(0.0, t['leafSnoot'], SECT['hook']), (SH['s03'], SH['s05'], SECT['dread']),
             (SH['s07'], SH['s09'], SECT['boast']), (SH['s10'], SH['s12'], SECT['slash']),
             (SH['s13'], t['bladeHit'] - 0.02, SECT['battle']), (t['bladeHit'] - 0.02, SH['s16'], SECT['blade']),
             (SH['s19'], t['ascend'], SECT['regen']), (t['ascend'], t['veins'], SECT['climb']),
             (t['lookUp'] - 0.6, t['fire'], SECT['pedal']), (t['fire'], SH['s25'], SECT['beam']),
             (SH['s25'], t['silence'], SECT['grip']), (t['sweep'], t['tunnel'], SECT['sweep']),
             (t['tunnel'], t['planet'], SECT['release']), (t['planet'], t['skyClear'], SECT['planet']),
             (t['skyClear'], DUR, SECT['tail'])]
    p = seg_ride(secs_)
    # the sub follows the sections at 60% (a boom is not louder because the music is quiet)
    sub = seg_ride([(a, b, v * 0.6 if a != t['sweep'] else v) for a, b, v in secs_])
    return {'music': p, 'fx': p, 'sub': sub}


SECT = dict(hook=4.5, dread=7.0, boast=3.0, slash=5.0, battle=3.0, blade=1.0, regen=9.0, climb=6.0, pedal=14.0,
            beam=3.0, grip=5.0, sweep=2.5, release=5.0, planet=6.0, tail=3.0)
TRIM = dict(hush=13.0)


def gates():
    """(a, b, level of the main mix inside) -- the hard cuts of the film. Reverb tails cut too."""
    return [
        (C['leafSnoot'], SH['s03'], 0.0),
        (SH['s05'], C['drop'], 0.0),
        (SH['s09'], SH['s10'], 0.0),
        (SH['s12'], SH['s13'], 0.0),
        (SH['s16'], SH['s18'], 0.0),
        (C['flick'], C['flickBoom'], 0.0),
        (C['veins'], C['lookUp'] - 0.6, 0.0),
        (C['silence'], C['sweep'], 0.0),
    ]


def kweight(x):
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)


def lufs(x):
    k = kweight(x)
    blk, hop = secs(0.4), secs(0.1)
    ms = np.array([np.mean(k[i:i + blk] ** 2, 0).sum() for i in range(0, len(k) - blk, hop)])
    l = -0.691 + 10 * np.log10(ms + 1e-12)
    g = ms[l > -70]
    rel = -0.691 + 10 * np.log10(g.mean()) - 10
    g2 = ms[(l > -70) & (l > rel)]
    return -0.691 + 10 * np.log10(g2.mean())


def true_peak(x):
    return np.abs(signal.resample_poly(x, 4, 1, axis=0)).max()


def softclip(x, knee):
    a = np.abs(x)
    over = a > knee
    y = x.copy()
    h = 1.0 - knee
    y[over] = np.sign(x[over]) * (knee + h * np.tanh((a[over] - knee) / h))
    return y


def limiter(x, ceiling_db=-1.3):
    c = db(ceiling_db)
    up = np.abs(signal.resample_poly(x, 4, 1, axis=0)).max(1)
    pk = up.reshape(-1, 4).max(1)[:len(x)] if len(up) % 4 == 0 else up[:len(up) // 4 * 4].reshape(-1, 4).max(1)
    if len(pk) < len(x):
        pk = np.pad(pk, (0, len(x) - len(pk)))
    req = np.minimum(1.0, c / (pk + 1e-12))
    la = secs(0.004)
    g = minimum_filter1d(req, 2 * la + 1)
    h = 48
    m = len(g) // h
    gc = g[:m * h].reshape(m, h).min(1)
    a = math.exp(-1 / (0.15 * 1000))
    out = np.empty(m)
    prev = 1.0
    for i in range(m):
        v = gc[i]
        prev = v if v < prev else prev * a + v * (1 - a)
        out[i] = prev
    gs = np.interp(np.arange(len(x)), np.arange(m) * h + h / 2, out)
    gs = np.minimum(gs, g)
    gs = uniform_filter1d(minimum_filter1d(gs, la + 1), la)
    return x * gs[:, None], 20 * np.log10(gs.min())


def master():
    log('reverbs')
    for k, v in TRIM.items():
        B[k] *= db(v)
    hall = make_ir(3.6, 3.0, 1.8, 77, predelay=0.025)
    big = make_ir(6.0, 5.0, 2.5, 78, predelay=0.04)
    outdoor = make_ir(0.9, 0.55, 0.32, 79, predelay=0.008, width=0.8)
    mix = np.zeros((N, 2))
    sends = {
        'str': (0, 0.32, 0.10, 0), 'brass': (0, 0.30, 0.12, 0), 'wind': (0, 0.42, 0.05, 0),
        'choir': (0, 0.30, 0.38, 0), 'harp': (0, 0.42, 0.10, 0), 'perc': (0, 0.22, 0.14, 0),
        'sub': (0, 0.0, 0.10, 0), 'sfx': (0, 0.05, 0.28, 0), 'world': (0, 0.0, 0.18, 0.15), 'amb': (0, 0.0, 0.0, 0.3)}
    for k, pts in rides().items():
        for bk in GROUPS[k]:
            B[bk] *= db(env_points(N, pts))[:, None]
    wet_h, wet_b, wet_o = np.zeros((N, 2)), np.zeros((N, 2)), np.zeros((N, 2))
    for k, (d, sh, sb, so) in sends.items():
        x = B[k]
        mix += x * db(d)
        wet_h += x * sh
        wet_b += x * sb
        wet_o += x * so
    # the reverbs are rendered per segment between the hard cuts, so no tail comes back after a cut
    segs, last = [], 0.0
    for a, b, _ in gates():
        segs.append((last, a))
        last = b
    segs.append((last, DUR))
    for a, b in segs:
        i, j = secs(a), secs(b)
        if j > i:
            mix[i:j] += convolve(wet_h[i:j], hall) * 0.55 + convolve(wet_b[i:j], big) * 0.55 + convolve(wet_o[i:j], outdoor) * 0.5
    mix = hp(mix, 22, 2)
    mid_, side = (mix[:, 0] + mix[:, 1]) / 2, (mix[:, 0] - mix[:, 1]) / 2
    side = hp(side, 110, 4)
    mix = np.stack([mid_ + side, mid_ - side], 1)
    # the hard cuts: everything in the main mix including its reverb tails; the hush bus stays (with a dry tiny room)
    g = np.ones(N)
    rng_ = 0.003
    for a, b, lv in gates():
        ia, ib = secs(a), secs(b)
        ka = secs(rng_)
        g[ia:ib] = lv
        ramp = np.cos(np.linspace(0, math.pi / 2, ka)) ** 2
        g[ia - ka:ia] = lv + (1 - lv) * ramp
    mix = mix * g[:, None]
    hush = B['hush'] + convolve(B['hush'] * 0.32, outdoor) * 0.7
    # nothing at all from the silence to the sweep but the thread
    hg = np.ones(N)
    ia, ib = secs(C['silence']), secs(C['sweep'])
    ka = secs(0.003)
    hg[ia:ib] = 0.0
    hg[ia - ka:ia] = np.cos(np.linspace(0, math.pi / 2, ka)) ** 2
    hush = hush * hg[:, None]
    mix = mix + hush + B['thread']
    # the end: gone by END_CUT
    mix *= env_points(N, [(0, 1), (END_CUT - 0.5, 1), (END_CUT, 0), (DUR, 0)])[:, None]
    mix[secs(END_CUT):] = 0.0
    os.makedirs(os.path.join(HERE, 'cache'), exist_ok=True)
    np.save(os.path.join(HERE, 'cache', 'premaster.npy'), mix.astype(np.float32))
    return mix


def finalize(mix, target=-17.0):
    log('loudness')
    y = mix.copy()
    for it in range(4):
        L = lufs(y)
        y = y * db(target - L)
        low = lp(lp(y, 150, 2), 150, 2)
        y = (y - low) + softclip(low, db(-7.0))
        y = softclip(y, db(-2.5))
        y, gr = limiter(y, -1.6)
        L2 = lufs(y)
        log(f'  iter {it}: {L:.2f} -> {L2:.2f} LUFS, max GR {gr:.1f} dB')
        if abs(L2 - target) < 0.15:
            break
    # silence regions must stay exactly silent
    y[secs(END_CUT):] = 0.0
    y[secs(C['silence']) + secs(1.4):secs(C['sweep'])] = 0.0
    # 16-bit with TPDF dither (not over the digital silences)
    r = rng(4242)
    d = (r.random(y.shape) - r.random(y.shape)) / 32768
    y16 = np.clip(np.round((y + d) * 32767), -32768, 32767).astype(np.int16)
    silent = np.abs(y).max(1) < 1e-7
    y16[silent] = 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sf.write(OUT, y16[:N], SR, subtype='PCM_16')
    log('wrote', OUT, f'{len(y16) / SR:.3f} s', f'LUFS {lufs(y):.2f}', f'TP {20 * np.log10(true_peak(y)):.2f} dBTP')


if __name__ == '__main__':
    section_hook()
    section_dread()
    section_hush_broom()
    section_landing()
    section_boast()
    section_slash()
    section_battle()
    section_scream()
    section_regen()
    section_climb()
    section_gathering()
    section_release()
    with open(os.path.join(HERE, 'notes.json'), 'w') as f:
        json.dump(NOTES, f)
    with open(os.path.join(HERE, 'events.json'), 'w') as f:
        json.dump(EVENTS, f)
    json.dump({'C': C, 'SH': SH, 'DUR': DUR, 'END_CUT': END_CUT, 'gates': gates()}, open(os.path.join(HERE, 'cues_used.json'), 'w'), indent=1)
    os.makedirs(os.path.join(HERE, 'cache'), exist_ok=True)
    np.savez_compressed(os.path.join(HERE, 'cache', 'buses.npz'), **{k: v.astype(np.float32) for k, v in B.items()})
    mix = master()
    finalize(mix)
    log('done')

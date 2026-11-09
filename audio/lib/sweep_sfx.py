"""Designed sound effects for ONE SWEEP. Every function returns a stereo (n, 2) float array whose first sample is the
event (see at_onset), deterministic by seed. Real samples first (ocean drum beads = bristles, gongs, drums, brake drum);
oscillators and noise only where there is no such thing as a real recording (plasma beams, shock fronts)."""
import math
import numpy as np
from scipy import signal
from dsp import (SR, secs, white, pink, brown, smooth_noise, lp, hp, bp, reson, pan, env_points, db, load, varispeed,
                 modal, sine_sweep, rng, fade, sweep_lp, hz, formant, polyblep_saw)
import sfx as X
from sfx import S, st, thump, grains, add_at, expenv, debris_rattle, stone_crunch, grinding_crack, flaps, norm

P = dict(X.P)
OCEAN = 'vcsl/Membranophones/Other Membranophones/Ocean Drum/OceanDrum_Sus_1_Mid.wav'


def at_onset(x, thr=0.2, pre=8):
    """Cut the pre-roll so that the transient lands exactly on the first sample."""
    a = np.abs(x).max(1) if x.ndim == 2 else np.abs(x)
    k = int(np.argmax(a > thr * a.max()))
    return x[max(0, k - pre):]


def stereo(n, seed, fn=pink):
    return np.stack([fn(n, seed), fn(n, seed + 1)], 1)


def rms_norm(x, level=0.1):
    return x / (np.sqrt(np.mean(x ** 2)) + 1e-12) * level


def pan_path(x, path):
    """Mono x -> stereo along per-sample pan path in [-1, 1]."""
    a = (path + 1) * math.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], 1)


def comb(x, f, g=0.9):
    D = max(2, int(round(SR / f)))
    a = np.zeros(D + 1)
    a[0] = 1.0
    a[D] = -g
    return signal.lfilter([1 - g], a, x, axis=0)


# ------------------------------------------------------------------ the broom (real bristles on stone)
def broom(dur=0.4, seed=1, level=1.0, light=0.0, pan0=-0.2, pan1=0.2, tail=0.05):
    """One stroke of a straw broom on honed stone tiles.
    a) real grains: the ocean drum recording (beads rolling on skin) band-passed into the bristle band,
    b) many straw tips flicking off the surface (very short resonant ticks), driven by the stroke speed,
    c) the body of the push (a soft broadband 'shh' with flutter),
    d) a tiny tick each time the bristles cross a grout line."""
    n = secs(dur + tail)
    r = rng(seed)
    tt = np.arange(n) / SR
    # speed profile: quick start, long push, lift
    pts = [(0, 0), (dur * 0.10, 0.9), (dur * 0.42, 1.0), (dur * 0.78, 0.55), (dur, 0.12), (dur + tail, 0)]
    spd = env_points(n, pts)
    spd = np.maximum(0, spd * (1 + 0.22 * smooth_noise(n, 22, seed + 1)))
    tg, vg = tt[::240], spd[::240]
    # a) real ocean drum grains
    oc = load(OCEAN)
    off = int(r.integers(secs(0.5), max(secs(0.6), len(oc) - n - secs(0.5))))
    a = oc[off:off + n].copy()
    if len(a) < n:
        a = np.pad(a, ((0, n - len(a)), (0, 0)))
    a = hp(bp(a, 1400, 12000, 2), 900)
    a = rms_norm(a, 0.1) * (spd ** 1.2)[:, None]
    # b) straw tips
    density = 1500 * (1 - 0.5 * light)
    b = grains(dur + tail, lambda u: max(30.0, density * float(np.interp(u, tg, vg))), seed + 2, 2000, 11500,
               (0.0005, 0.0025), (2, 7), 0.75)
    b = rms_norm(b, 0.1)
    # c) body
    c = stereo(n, seed + 3)
    c = bp(c, 450, 4800, 2) * ((0.7 + 0.5 * np.abs(smooth_noise(n, 60, seed + 5))) * spd ** 1.4)[:, None]
    c = rms_norm(c, 0.1)
    # d) grout ticks (promenade tiles ~ 12 per second of stroke)
    d = np.zeros((n, 2))
    t = 0.04
    while t < dur * 0.9:
        m = secs(0.02)
        g = hp(white(m, seed + 7 + int(t * 1000)), 900) * np.exp(-np.arange(m) / secs(0.0035))
        g = reson(g, r.uniform(900, 1700), 4) * 2.2
        add_at(d, pan(g * r.uniform(0.4, 1.0) * float(np.interp(t, tg, vg)), r.uniform(-0.4, 0.4)), t)
        t += r.uniform(0.06, 0.1)
    d = rms_norm(d, 0.1)
    y = a * 0.95 + b * 0.85 + c * (0.55 - 0.15 * light) + d * 0.35
    y = lp(hp(y, 180, 2), 14500, 2)
    # the stroke travels a little across the frame
    p = np.interp(tt, [0, dur], [pan0, pan1])
    gl, gr = np.cos((p + 1) * math.pi / 4) * 1.414, np.sin((p + 1) * math.pi / 4) * 1.414
    y = np.stack([y[:, 0] * gl, y[:, 1] * gr], 1)
    return fade(rms_norm(y, 0.1), 0.002, tail * 0.7) * level


def wood_tap(seed=11, level=1.0, low=1.0):
    """Broom head tapped on stone (the 'satisfied tap'): wood handle + straw slap."""
    n = secs(0.5)
    r = rng(seed)
    exc = np.zeros(n)
    exc[:secs(0.0025)] = white(secs(0.0025), seed)
    body = modal(exc, np.array([310, 540, 960, 1630, 2700]) * r.uniform(0.96, 1.04) * low,
                 [0.09, 0.07, 0.05, 0.03, 0.02], [1, .9, .6, .35, .2])
    body = rms_norm(body, 0.1)
    straw = grains(0.09, lambda u: 900, seed + 1, 2500, 9000, (0.0006, 0.002), (2, 6), 0.8)
    straw = rms_norm(straw, 0.05)
    out = st(body, 0.2, seed)
    add_at(out, straw, 0.001)
    return out * level


def toe_tok(seed=20, level=1.0):
    """19.0 / 19.5: 'tok': broom handle on hollow chitin (dry, hollow, tiny)."""
    n = secs(0.35)
    r = rng(seed)
    exc = np.zeros(n)
    exc[:secs(0.002)] = white(secs(0.002), seed)
    f = np.array([740, 1180, 1960, 3300, 4700]) * r.uniform(0.985, 1.015)
    b = modal(exc, f, [0.055, 0.045, 0.03, 0.02, 0.012], [1, .85, .55, .3, .15])
    b = rms_norm(b, 0.1)
    return st(b, 0.15, seed) * level


# ------------------------------------------------------------------ tiny foley
def leaf_pat(seed=30, level=1.0):
    """A leaf slaps onto a wet nose: tiny dry 'pt' + crackle."""
    n = secs(0.09)
    a = hp(white(n, seed), 500) * np.exp(-np.arange(n) / secs(0.012))
    b = grains(0.06, lambda u: 600, seed + 1, 1500, 6000, (0.001, 0.004), (2, 6), 0.6)
    y = np.zeros((secs(0.25), 2))
    add_at(y, st(reson(a, 1200, 1.2) * 1.2, 0.2, seed), 0)
    add_at(y, b, 0.005)
    return rms_norm(y, 0.1) * level


def air_puff(dur=0.22, seed=40, level=1.0):
    """He puffs the leaf off: lips + a soft jet."""
    n = secs(dur + 0.08)
    e = env_points(n, [(0, 0), (0.02, 1.0), (dur * 0.5, 0.75), (dur, 0.1), (dur + 0.08, 0)]) ** 1.2
    y = stereo(n, seed)
    y = reson(bp(y, 500, 7000), 1700, 1.3) * e[:, None]
    return rms_norm(y, 0.1) * level


def hair_tick(seed=45, level=1.0):
    n = secs(0.12)
    exc = np.zeros(n)
    exc[:48] = white(48, seed)
    y = modal(exc, [3900, 6120, 8700], [0.05, 0.03, 0.02], [1, .6, .3])
    return st(rms_norm(y, 0.1), 0.1, seed) * level


def far_bird(seed=50, level=1.0, n_chirps=3, f0=3400):
    """One distant bird (2-3 chirps), band-limited."""
    r = rng(seed)
    out = np.zeros((secs(1.6), 2))
    t = 0.02
    for c in range(n_chirps):
        ch = X.bird_chirp(int(r.integers(1 << 30)), f0 * r.uniform(0.95, 1.08), int(r.integers(3)))
        add_at(out, pan(ch * r.uniform(0.7, 1.0), 0.25), t)
        t += len(ch) / SR + r.uniform(0.06, 0.14)
    return lp(rms_norm(out, 0.1), 6500) * level


def siren_far(dur, seed=60, level=1.0):
    """Two distant sirens, wailing out of phase, heavily band-limited and a long way off."""
    n = secs(dur)
    tt = np.arange(n) / SR
    out = np.zeros((n, 2))
    for k, (f0, f1, rate, ph, p) in enumerate([(430, 640, 0.42, 0.0, -0.55), (390, 590, 0.37, 1.7, 0.6)]):
        f = f0 + (f1 - f0) * (0.5 + 0.5 * np.sin(2 * np.pi * rate * tt + ph)) ** 1.3
        f = f * (1 + 0.004 * smooth_noise(n, 3, seed + k))
        phi = np.cumsum(f) / SR * 2 * np.pi
        s = np.sin(phi) + 0.5 * np.sin(2 * phi + 1) + 0.22 * np.sin(3 * phi + 2)
        s = lp(s, 1300, 2) * (0.75 + 0.25 * smooth_noise(n, 0.7, seed + 10 + k))
        out += pan(s, p)
    return rms_norm(out, 0.1) * level


def shadow_rumble(dur, seed=70, level=1.0):
    """The shadow sliding over: very low air, growing."""
    n = secs(dur)
    e = env_points(n, [(0, 0), (dur * 0.4, 0.45), (dur, 1.0)])
    y = lp(stereo(n, seed, brown), 95, 2)
    y = y * (e * (1 + 0.15 * smooth_noise(n, 2.5, seed + 2)))[:, None]
    return rms_norm(y, 0.1) * level


def whistle_fall(dur=0.31, seed=75, level=1.0):
    """10.8 -> 11.1: a body falling fast: air tearing, pitch collapsing into the impact (ends at sample n-1)."""
    n = secs(dur)
    tt = np.arange(n) / SR
    u = tt / dur
    f = 3600 * (0.11 / 1.0) ** (u ** 1.15)
    seg, hop = secs(0.05), secs(0.025)
    win = np.hanning(seg)
    nz = white(n + seg, seed)
    wh = np.zeros(n + seg)
    for i in range(0, n, hop):
        fi = f[min(n - 1, i + seg // 2)]
        ch = reson(nz[max(0, i - 1500):i + seg], fi, 22)[-seg:]
        wh[i:i + seg] += ch * win
    wh = wh[:n]
    a = lp(stereo(n, seed + 4, pink), 2600) * (u ** 1.8)[:, None]
    y = st(rms_norm(wh, 0.1), 0.3, seed) * (u ** 1.3)[:, None] * 1.3 + rms_norm(a, 0.06)
    return lp(y, 7000) * level


# ------------------------------------------------------------------ energy
def beam(dur, seed=80, tear=1.0, env=None, p0=-0.75, p1=0.75, hum=1.0, roar=1.0):
    """A plasma beam: hum on C (comb-filtered noise), body roar, tearing air and crackle."""
    n = secs(dur)
    if env is None:
        env = np.ones(n)
    tt = np.arange(n) / SR
    base = stereo(n, seed, brown) + 0.3 * stereo(n, seed + 2, pink)
    h = comb(base, hz(36), 0.93)
    h = hp(lp(h, 900, 2), 28, 2)
    h = rms_norm(h, 0.1)
    h2 = comb(base[::-1], hz(43), 0.9)
    h2 = rms_norm(hp(lp(h2, 1200, 2), 40, 2), 0.1)
    body = stereo(n, seed + 4, brown)
    body = lp(body, 210, 2) * (1 + 0.45 * smooth_noise(n, 6, seed + 6))[:, None]
    body = rms_norm(body, 0.14)
    # tearing: pink noise chopped by a fast irregular gate (stick-slip of air)
    gate = np.abs(smooth_noise(n, 70, seed + 7)) ** 0.7
    tr = bp(stereo(n, seed + 8), 700, 10500) * (0.28 + 0.9 * gate)[:, None]
    tr = rms_norm(tr, 0.12)
    cr = grains(dur, lambda u: 520, seed + 10, 1500, 10500, (0.0006, 0.0035), (3, 10), 0.9)
    cr = rms_norm(cr, 0.05)
    mono_tr = tr.mean(1)
    side = tr - mono_tr[:, None]
    mv = np.interp(tt, [0, dur], [p0, p1])
    t2 = pan_path(mono_tr, mv) * 1.4 + side * 0.35
    y = (h * 0.8 + h2 * 0.5) * hum + body * roar + t2 * tear + cr * tear
    return y * env[:, None]


def whoosh(dur, seed=90, f0=400, f1=6000, peak=0.6, level=1.0, width=0.5, p0=-0.5, p1=0.5):
    """Moving-band air swish; the band follows the envelope. peak = position of the top in 0..1."""
    n = secs(dur)
    pk = dur * peak
    e = env_points(n, [(0, 0), (pk * 0.75, 0.75), (pk, 1.0), (dur * 0.85, 0.15), (dur, 0)])
    nz = stereo(n, seed)
    f = f0 + (f1 - f0) * e ** 1.4
    y = sweep_lp(hp(nz, f0 * 0.6), f)
    y = y * e[:, None] ** 1.1
    mono = y.mean(1)
    pth = np.interp(np.arange(n) / SR, [0, pk, dur], [p0, 0.5 * (p0 + p1), p1])
    y = pan_path(mono, pth) * 1.4 + (y - mono[:, None]) * width
    return rms_norm(y, 0.12) * level


def slash(seed=100, level=1.0):
    """21.9 THE SLASH: a blade of energy: air swish + lime zing."""
    dur = 0.5
    n = secs(dur + 0.3)
    out = np.zeros((n, 2))
    add_at(out, whoosh(dur, seed, 500, 9000, 0.55, 1.1, 0.7, -0.8, 0.8), 0)
    tt = np.arange(n) / SR
    f = 7000 * np.exp(-tt / 0.25) + 900
    s = sine_sweep(f, seed + 1) + 0.4 * sine_sweep(f * 1.51, seed + 2)
    e = np.clip(tt / 0.012, 0, 1) * np.exp(-tt / 0.16)
    out += st(s * e * 0.12, 0.6, seed)
    cr = grains(0.5, lambda u: 500 * math.exp(-u / 0.15) + 20, seed + 3, 2500, 11000, (0.0008, 0.004), (3, 9), 0.9)
    add_at(out, cr * 0.5, 0.02)
    return out * level


def zap(dur=0.09, seed=110, level=1.0):
    """Bolt leaving / arriving: an electric snap."""
    n = secs(dur)
    tt = np.arange(n) / SR
    buzz = (np.sin(2 * np.pi * 123 * tt) > 0.1).astype(float) * 0.7 + 0.3
    y = hp(white(n, seed), 1800) * buzz * expenv(n, 0.001, dur * 0.7)
    return st(y, 0.7, seed) * level


# ------------------------------------------------------------------ impacts
def big_hit(seed=120, f0=90, f1=24, T=2.2, dur=8.0, kit=(), noise=0.55, body=0.7, stones=0.0, rattle=0.0):
    """Generic huge impact built from real drums + a designed sub. kit = [(sample, ratio, gain, delay s, lowpass or 0)]."""
    n = secs(dur)
    out = st(thump(f0, f1, T, dur, seed) * 1.3, 0.0)
    for k, ratio, g, dl, lpf in kit:
        x = S(k, ratio)
        x = at_onset(x)
        if lpf:
            x = lp(x, lpf)
        add_at(out, x * g, dl)
    if noise:
        m = secs(1.3)
        w = hp(stereo(m, seed + 1, white), 1400) * expenv(m, 0.001, 0.32)[:, None]
        add_at(out, w * noise, 0)
    if body:
        b = lp(stereo(n, seed + 3, brown), 900) * expenv(n, 0.004, T * 1.7)[:, None]
        out += b * body
    if stones:
        add_at(out, stone_crunch(2.2, seed + 5, stones), 0.015)
    if rattle:
        add_at(out, debris_rattle(3.5, seed + 6, rattle, 1.2), 0.3)
    return out


def shock_boom(seed=130):
    return big_hit(seed, 80, 28, 1.0, 3.0, [('bd_vsco_fff', 0.7, 1.0, 0.0, 0), ('bd2_ff', 0.72, 0.9, 0.003, 0)], 0.55, 0.7)


def landing(seed=140):
    """11.1: nine metres of chitin lands next to him."""
    kit = [('bd_vsco_fff2', 0.55, 1.2, 0, 0), ('bd2_ff', 0.6, 1.1, 0.002, 0), ('bd_vsco_fff', 0.78, 0.8, 0.006, 0),
           ('gong_smack_low', 0.7, 0.8, 0.005, 2200), ('crash_ff', 0.85, 0.32, 0.0, 0)]
    out = big_hit(seed, 92, 24, 2.0, 7.0, kit, 0.55, 0.7, stones=1.15, rattle=0.85)
    add_at(out, grinding_crack(1.7, seed + 7, 0.8), 0.08)
    return out


def pod_hit(seed=145):
    """1.75: a sky-tram pod plants nose-first next to him: heavy metal body + crunch."""
    kit = [('bd2_ff', 0.66, 0.95, 0, 0), ('brake_hammer', 0.55, 0.7, 0.0, 3600), ('anvil', 0.4, 0.55, 0.002, 3600)]
    return big_hit(seed, 86, 30, 0.7, 2.5, kit, 0.35, 0.45, stones=0.8, rattle=0.5)


def dust_settle(dur, seed=150, level=1.0):
    n = secs(dur)
    e = env_points(n, [(0, 1), (dur * 0.5, 0.45), (dur, 0)])
    y = bp(stereo(n, seed), 500, 5200) * e[:, None] ** 1.2
    g = grains(dur, lambda u: 90 * (1 - u / dur) ** 2 + 4, seed + 2, 1500, 9000, (0.001, 0.005), (3, 9), 0.7)
    return (rms_norm(y, 0.08) + rms_norm(g, 0.05)) * level


def eye_stinger(seed=160):
    """16.2: lime lightning inside the gem: high cluster + sharp glass + an electric arc."""
    n = secs(1.5)
    out = np.zeros((n, 2))
    tt = np.arange(n) / SR
    arc = hp(white(n, seed), 2500) * (0.3 + 0.7 * (np.abs(smooth_noise(n, 90, seed + 1)) > 0.45)) * np.exp(-tt / 0.45)
    out += st(arc * 0.5, 0.8, seed)
    f = np.array([3136.0, 3322.4, 4698.6]) * (1 + 0.003 * np.sin(2 * np.pi * 11 * tt)[:, None])
    s = (np.sin(2 * np.pi * np.cumsum(f, 0) / SR)).sum(1) * np.clip(tt / 0.012, 0, 1) * np.exp(-tt / 0.9)
    out += st(s * 0.05, 0.7, seed + 2)
    return out


def tower_slide(dur=2.0, seed=170, level=1.0):
    """22.9: the groan of immense towers sliding: stone moaning (stick-slip through stone + a brake drum dropped by 3 oct)."""
    n = secs(dur)
    r = rng(seed)
    tt = np.arange(n) / SR
    rate = 6 + 9 * (tt / dur) + 4 * smooth_noise(n, 1.1, seed + 1)
    ph = np.cumsum(np.maximum(2.0, rate) / SR)
    imp = np.zeros(n)
    idx = np.searchsorted(ph, np.arange(1, int(ph[-1])))
    imp[idx[idx < n]] = r.uniform(0.4, 1.0, len(idx[idx < n]))
    ms = np.array([24, 31, 36, 39, 43, 48, 51])
    body = modal(imp, hz(ms) * 2 ** (r.uniform(-0.1, 0.1, len(ms)) / 12), [1.8, 1.4, 1.2, 1.0, 0.8, 0.5, 0.3],
                 [1, .85, .7, .55, .4, .3, .15])
    body = lp(body, 1300)
    b = S('brake_bowed2')
    ratio = np.interp(tt, [0, dur], [0.26, 0.19])
    bb = varispeed(b, ratio)
    m = min(n, len(bb))
    y = st(rms_norm(body, 0.1), 0.9, seed)
    y[:m] += rms_norm(bb[:m], 0.1) * 0.9
    gr = grinding_crack(dur, seed + 3, 1.0)
    gr = lp(gr, 2600)
    y = y * 1.0 + rms_norm(gr, 0.07)
    e = env_points(n, [(0, 0), (0.22, 0.7), (dur * 0.5, 1.0), (dur * 0.9, 0.85), (dur, 0.0)])
    grit = grains(dur, lambda u: 18 + 90 * (u / dur), seed + 5, 700, 6000, (0.002, 0.012), (3, 9), 0.8)
    return (y * e[:, None] + rms_norm(grit, 0.04) * e[:, None]) * level


def roar(dur=1.2, seed=180, level=1.0, f0=112, fend=78):
    """Warlord's roar: low saw voice through a stretched vocal tract with a rattling insect growl (no words)."""
    n = secs(dur)
    tt = np.arange(n) / SR
    env = env_points(n, [(0, 0), (0.1, 0.8), (dur * 0.35, 1.0), (dur * 0.8, 0.75), (dur, 0)])
    f = f0 * np.exp(np.interp(tt, [0, dur], [0, math.log(fend / f0)]))
    f = f * (1 + 0.02 * smooth_noise(n, 16, seed))
    v = sum(polyblep_saw(f * (1 + d), seed + i) for i, d in enumerate([-.012, 0, .011, .5, 1.5]))
    growl = 0.35 + np.abs(np.sin(2 * np.pi * 31 * tt)) ** 0.5
    v = v * growl
    t1 = formant(lp(v, 3500, 2), 'o_m', 0.72)
    t2 = formant(lp(v, 3500, 2), 'a_m', 0.65)
    y = np.stack([t1 * 0.6 + t2 * 0.4, t1 * 0.4 + t2 * 0.6], 1)
    y = y * env[:, None] + hp(stereo(n, seed + 2), 3000) * (0.05 * env)[:, None]
    return rms_norm(y, 0.12) * level


def scream(dur=1.1, seed=190, level=1.0):
    """40.0 -> 41.1 the warlord screams in his face: shrill insect voice, climbing, with a fast flutter."""
    n = secs(dur)
    tt = np.arange(n) / SR
    f = 300 * np.exp(np.interp(tt, [0, dur], [0, math.log(2.1)])) * (1 + 0.015 * smooth_noise(n, 22, seed))
    v = sum(polyblep_saw(f * (1 + d), seed + i) for i, d in enumerate([-.018, -.007, 0, .009, .021]))
    v2 = polyblep_saw(f / 3.03, seed + 8) + polyblep_saw(f * 1.5, seed + 9) * 0.6
    fl = 0.45 + 0.55 * (0.5 + 0.5 * np.sin(2 * np.pi * 37 * tt)) ** 0.6
    a = formant(lp(v * fl, 6500, 1), 'a_f', 1.2) + 0.5 * formant(lp(v2 * fl, 4500, 1), 'a_m', 1.05)
    a = st(a, 0.5, seed)
    h = bp(stereo(n, seed + 11), 2000, 11000) * (fl * 0.3)[:, None]
    env = env_points(n, [(0, 0), (0.07, 0.6), (dur * 0.6, 0.9), (dur, 1.0)])
    return rms_norm((a + h) * env[:, None], 0.12) * level


def fsst(seed=200, level=1.0):
    """41.1: tiny lazy flick of straw and air."""
    n = secs(0.2)
    e = env_points(n, [(0, 0), (0.012, 1.0), (0.09, 0.45), (0.2, 0)])
    a = bp(stereo(n, seed), 3200, 11000) * e[:, None]
    g = grains(0.12, lambda u: 900, seed + 2, 3000, 11000, (0.0005, 0.002), (2, 6), 0.7)
    out = rms_norm(a, 0.1)
    add_at(out, rms_norm(g, 0.08), 0.005)
    return out * level


def armour_burst(seed=210):
    """27.2: plates tearing, metal crash, gems scattering, outward wind."""
    kit = [('bd_vsco_fff', 0.62, 1.1, 0, 0), ('bd2_ff', 0.66, 0.9, 0.002, 0),
           ('crash_fff', 0.9, 0.5, 0.0, 0), ('brake_hammer', 0.55, 0.55, 0.0, 3000), ('anvil', 0.42, 0.42, 0.004, 3800)]
    out = big_hit(seed, 88, 28, 1.25, 5.0, kit, 0.5, 0.55, stones=0.4)
    b = S('brake_bowed1')
    k = secs(1.8)
    sh = hp(varispeed(b, np.interp(np.arange(k), [0, k], [1.8, 0.55]))[:k], 400) * \
        env_points(k, [(0, 0), (0.05, 1), (1.0, 0.5), (1.8, 0)])[:, None]
    add_at(out, sh * 0.8, 0.02)
    add_at(out, whoosh(1.4, seed + 3, 300, 3500, 0.35, 0.9, 0.5, 0, 0), 0.05)
    return out


def bolt_impact(size=1.0, dist=1.0, pn=0.0, seed=220):
    """Barrage bolt arriving: 70 ms zap ending at t=0.07, then a boom. Returns (audio, preroll seconds)."""
    pre = 0.07
    r = rng(seed)
    n = secs(pre + 3.2)
    out = np.zeros((n, 2))
    add_at(out, zap(pre + 0.02, seed, 0.5), 0.0)
    imp = big_hit(seed + 1, r.uniform(78, 96), r.uniform(26, 34), 0.5 + 0.35 * size, 2.8,
                  [('bd2_f' if seed % 2 else 'bd_vsco_ff', r.uniform(0.66, 0.8), 0.9, 0, 0)], 0.38, 0.5, stones=0.7)
    if size > 1.2:
        add_at(imp, S('crash_ff', r.uniform(0.82, 0.95)) * 0.22, 0)
    imp = lp(imp, 9500 / dist) * (1 + 0.0) / dist
    out[:, :] = out
    add_at(out, st_pan(imp, pn), pre)
    return out, pre


def st_pan(x, p):
    gl = min(1.0, 1 - p) ** 0.5 if p > 0 else 1.0
    gr = min(1.0, 1 + p) ** 0.5 if p < 0 else 1.0
    y = x.copy()
    y[:, 0] *= gl
    y[:, 1] *= gr
    return y


def blade_hit(seed=240):
    """33.7: loudest moment so far."""
    kit = [('bd_vsco_fff2', 0.52, 1.25, 0, 0), ('bd2_ff', 0.58, 1.1, 0.002, 0), ('bd_vsco_fff', 0.75, 0.9, 0.006, 0),
           ('gong2_fff', 0.58, 0.85, 0.01, 2800), ('crash_fff', 0.9, 0.5, 0, 0), ('anvil', 0.36, 0.5, 0.003, 3500)]
    out = big_hit(seed, 96, 24, 2.3, 8.0, kit, 0.6, 0.8, stones=1.05, rattle=0.85)
    b = S('brake_bowed2')
    k = secs(1.6)
    ratio = np.interp(np.arange(k), [0, k * 0.2, k], [2.0, 1.6, 0.6])
    sh = hp(varispeed(b, ratio)[:k], 500) * env_points(k, [(0, 0), (0.06, 1), (0.9, 0.5), (1.6, 0)])[:, None]
    add_at(out, sh * 0.8, 0.03)
    return out


def far_tower_crash(seed=250, level=1.0):
    """32.6/33.0: the warlord going straight through a tower: a heavy crunch."""
    out = big_hit(seed, 74, 30, 0.55, 3.0, [('bd2_ff', 0.68, 0.8, 0, 0), ('crash_ff', 0.8, 0.2, 0.0, 0)], 0.3, 0.5,
                  stones=0.9, rattle=0.5)
    return out * level


def soot_shake(seed=260, level=1.0):
    """36.5: wet-dog shake: rapid fur flaps, ears flapping out at the end, soot puffing out."""
    dur = 0.95
    n = secs(dur + 0.3)
    r = rng(seed)
    out = np.zeros((n, 2))
    # the shake: ~20 flaps/s, accelerating, then decaying
    t, k = 0.0, 0
    while t < dur - 0.08:
        L = r.uniform(0.018, 0.04)
        m = secs(L) * 3
        g = bp(white(m, seed + 3 + k), 500, r.uniform(2800, 5200)) * expenv(m, 0.001, L)
        add_at(out, pan(g * r.uniform(0.6, 1.0) * (1 - 0.35 * (t / dur)), ((-1) ** k) * r.uniform(0.2, 0.7)), t)
        t += 0.052 - 0.008 * min(1.0, t * 3)
        k += 1
    # two ear flaps at the very end
    for tt, g in [(dur, 1.0), (dur + 0.12, 0.7)]:
        m = secs(0.05)
        f = bp(white(m, seed + 900 + int(tt * 100)), 300, 2400) * expenv(m, 0.002, 0.03)
        add_at(out, pan(f * g * 1.4, 0.3 * (-1) ** int(tt * 10)), tt)
    # soot puffing out
    pf = hp(stereo(n, seed + 950), 1500) * env_points(n, [(0, 0), (0.15, 0.5), (0.9, 0.3), (1.25, 0)])[:, None]
    return rms_norm(out, 0.1) * level + rms_norm(pf, 0.03) * level


def soot_fall(dur=0.8, seed=270, level=1.0):
    g = grains(dur, lambda u: 80 * (1 - u / dur) + 4, seed, 2000, 9500, (0.001, 0.004), (3, 9), 0.7)
    return rms_norm(g, 0.05) * level


def creak(dur, seed=280, level=1.0, f_body=None, rate0=8, rate1=30):
    """Stick-slip on wood: a door hinge / a broom handle under load."""
    n = secs(dur)
    r = rng(seed)
    tt = np.arange(n) / SR
    rate = rate0 + (rate1 - rate0) * (tt / dur) + 5 * smooth_noise(n, 3, seed + 1)
    ph = np.cumsum(np.maximum(2.0, rate) / SR)
    imp = np.zeros(n)
    idx = np.searchsorted(ph, np.arange(1, int(ph[-1])))
    idx = idx[idx < n]
    imp[idx] = r.uniform(0.2, 1.0, len(idx))
    body = modal(imp, f_body or [240, 520, 860, 1480, 2450], [0.08, 0.06, 0.05, 0.03, 0.02], [1, .9, .7, .4, .25])
    return st(rms_norm(body, 0.1), 0.3, seed) * level


def yawn(dur=1.8, seed=290, level=1.0):
    """38.2: huge slow yawn: jaw hinge creak + breath in / out through an open throat (no voice)."""
    n = secs(dur)
    # breath: inhale (first 55%) -> sigh out
    br = stereo(n, seed + 3)
    # tract moves from 'o' to 'a' and back (formant bank on noise)
    src = hp(br, 150) * env_points(n, [(0, 0), (dur * 0.22, 0.55), (dur * 0.55, 1.0), (dur * 0.62, 0.5), (dur, 0)])[:, None]
    a = formant(src, 'o_m', 0.8) * 0.6 + formant(src, 'a_m', 0.9) * 0.6
    a = lp(a, 2600)
    jaw = creak(dur * 0.65, seed, 1.0, [150, 340, 590, 980, 1600], 7, 19)
    jaw2 = creak(dur * 0.3, seed + 1, 0.6, [150, 340, 590, 980, 1600], 13, 6)
    out = rms_norm(a, 0.1)
    add_at(out, rms_norm(jaw, 0.1), 0.0)
    add_at(out, rms_norm(jaw2, 0.07), dur * 0.68)
    return out * level


def wet_crackle(dur, seed=300, level=1.0):
    """Flesh and chitin boiling and re-forming: bubbles + squelch + brittle crackle."""
    n = secs(dur)
    r = rng(seed)
    out = np.zeros((n, 2))
    t = 0.0
    while t < dur:
        t += r.exponential(0.018)
        if t >= dur:
            break
        L = r.uniform(0.01, 0.05)
        m = secs(L)
        u = np.arange(m) / m
        f = r.uniform(160, 640) * (1 + r.uniform(0.3, 1.2) * u)
        b = np.sin(np.cumsum(f) / SR * 2 * np.pi) * np.exp(-u * 3.5) * np.sin(np.pi * np.minimum(1, u * 7))
        add_at(out, pan(b * r.uniform(0.2, 1.0), r.uniform(-0.8, 0.8)), t)
    sq = bp(stereo(n, seed + 1), 120, 1500) * (np.abs(smooth_noise(n, 11, seed + 3)) ** 2)[:, None]
    cr = grains(dur, lambda u: 80 + 200 * (u / dur), seed + 5, 1200, 9500, (0.001, 0.005), (2, 7), 1.0)
    return (rms_norm(out, 0.1) + rms_norm(sq, 0.07) + rms_norm(cr, 0.06)) * level


def rocket(dur=4.8, seed=320, level=1.0):
    """45.6: it rockets up and burns: a jet climbing away, its roar rising in pitch and pressure."""
    n = secs(dur)
    tt = np.arange(n) / SR
    e = env_points(n, [(0, 0), (0.2, 0.8), (dur * 0.5, 0.7), (dur, 1.0)])
    r = stereo(n, seed, brown)
    r = lp(r, 380) * (1 + 0.4 * smooth_noise(n, 6, seed + 2))[:, None]
    h = sweep_lp(hp(stereo(n, seed + 3), 500), 2200 + 4800 * (tt / dur))
    return (rms_norm(r, 0.11) + rms_norm(h, 0.04)) * e[:, None] * level


def star_flare(seed=330, level=1.0):
    """48.0: a star igniting: cold glass ring + bright rushing air."""
    n = secs(2.4)
    tt = np.arange(n) / SR
    s = sum(np.sin(2 * np.pi * f * tt) * a for f, a in [(1046.5, 1), (1244.5, 0.7), (1568, 0.8), (2093, 0.5), (3136, 0.3)])
    s = s * (1 + 0.25 * np.sin(2 * np.pi * 9 * tt)) * np.clip(tt / 0.02, 0, 1) * np.exp(-tt / 0.8)
    h = sweep_lp(hp(stereo(n, seed), 700), 9000 * np.exp(-tt / 1.0) + 800) * np.exp(-tt / 0.7)[:, None]
    return (st(rms_norm(s, 0.1), 0.6, seed) + rms_norm(h, 0.05)) * level


def wind_only(dur, seed=340, level=1.0, gust=None):
    """A clean wind, thin, with a whistle through the broom's bristles and rising gusts."""
    n = secs(dur)
    tt = np.arange(n) / SR
    nz = stereo(n, seed)
    c = 650 + 500 * smooth_noise(n, 0.6, seed + 2) + 500 * ((tt / dur) if gust is None else gust)
    y = sweep_lp(hp(nz, 170), np.maximum(200, c))
    y = y * (0.65 + 0.35 * smooth_noise(n, 0.9, seed + 3))[:, None]
    wh = bp(stereo(n, seed + 5), 1100, 3400) * (0.25 + 0.75 * np.abs(smooth_noise(n, 0.5, seed + 7)))[:, None]
    return (rms_norm(y, 0.1) + rms_norm(wh, 0.025)) * level


def plink(seed=350, f=2200, level=1.0, dur=0.25):
    """A tiny dry plink (a leaf letting go; a citrus falling onto a tile)."""
    n = secs(dur)
    exc = np.zeros(n)
    exc[:64] = white(64, seed)
    y = modal(exc, [f, f * 1.73, f * 2.71], [0.09, 0.05, 0.03], [1, .5, .25])
    return st(rms_norm(y, 0.1), 0.2, seed) * level


def fur_rustle(dur, seed=360, level=1.0):
    n = secs(dur)
    e = env_points(n, [(0, 0), (dur * 0.2, 0.7), (dur * 0.6, 1.0), (dur, 0.6)])
    y = hp(stereo(n, seed), 3500) * (e * (0.5 + 0.5 * np.abs(smooth_noise(n, 14, seed + 2))))[:, None]
    return rms_norm(y, 0.1) * level


def the_sweep(seed=400):
    """62.2. THE biggest sound. Everything at once, starting on the first sample."""
    n = secs(11.0)
    out = st(thump(104, 20, 3.4, 11.0, seed) * 1.85, 0.0)
    kit = [('bd_vsco_fff2', 0.5, 1.35, 0, 0), ('bd2_ff', 0.55, 1.25, 0.0015, 0), ('bd_vsco_fff', 0.72, 1.0, 0.004, 0),
           ('bd_muted_ff', 0.6, 0.8, 0.0, 0), ('gong2_fff', 0.52, 1.1, 0.0, 3200), ('gong_fff', 0.62, 0.8, 0.003, 2600),
           ('crash_fff', 0.9, 0.8, 0.0, 0), ('crash_ff', 0.82, 0.55, 0.002, 0), ('anvil', 0.33, 0.6, 0.002, 3500),
           ('brake_hammer', 0.45, 0.55, 0, 3200)]
    for k, ratio, g, dl, lpf in kit:
        x = at_onset(S(k, ratio))
        if lpf:
            x = lp(x, lpf)
        add_at(out, x * g, dl)
    # the white-out crack
    m = secs(1.5)
    w = hp(stereo(m, seed + 1, white), 1000) * expenv(m, 0.0005, 0.42)[:, None]
    out[:m] += w * 1.0
    b = lp(stereo(n, seed + 3, brown), 1100) * expenv(n, 0.003, 4.4)[:, None]
    out += b * 1.05
    # the air tearing across the frame, left to right (the broom)
    t = beam(2.6, seed + 5, 1.8, env_points(secs(2.6), [(0, 1.0), (0.25, 0.8), (2.6, 0)]), -1.0, 1.0, 0.3, 0.3)
    add_at(out, t * 1.05, 0.0)
    add_at(out, stone_crunch(2.8, seed + 7, 1.25), 0.02)
    add_at(out, debris_rattle(4.8, seed + 8, 0.9, 1.6), 0.25)
    return out


def air_open(dur, seed=420, level=1.0):
    """63 on: the sky pouring back through the oculus, a long opening rush that thins away."""
    n = secs(dur)
    e = env_points(n, [(0, 1.0), (dur * 0.45, 0.85), (dur, 0)])
    y = sweep_lp(hp(stereo(n, seed), 90), 6500 * e + 500)
    return rms_norm(y * e[:, None], 0.1) * level


def dissolve(dur, seed=430, level=1.0):
    """65.4: chitin dissolving into lime ash: a long sizzle with brittle ticks."""
    n = secs(dur)
    e = env_points(n, [(0, 0), (0.2, 1.0), (dur * 0.7, 0.7), (dur, 0)])
    y = hp(stereo(n, seed), 2400) * (0.6 + 0.4 * np.abs(smooth_noise(n, 24, seed + 2)))[:, None]
    g = grains(dur, lambda u: 300 * (1 - 0.5 * u / dur), seed + 5, 2200, 11000, (0.0007, 0.003), (3, 9), 0.9)
    return (rms_norm(y, 0.07) * e[:, None] + rms_norm(g, 0.08) * e[:, None]) * level


def ship_shear(dur=3.0, seed=440, level=1.0):
    """65.4+: 7 km of chitin and bone shearing: a slow enormous tear in the bass."""
    n = secs(dur)
    y = X.metal_groan(dur, seed, 0.7, 1.0, 0.6, ms=[24, 31, 36, 39, 43, 48, 51, 55, 60, 67], tgts=[36, 43, 48, 51, 55])
    r = lp(stereo(n, seed + 2, brown), 150) * env_points(n, [(0, 0), (0.5, 1), (dur * 0.7, 0.8), (dur, 0)])[:, None]
    return (rms_norm(y, 0.1) + rms_norm(r, 0.1)) * level


def leaf_land(seed=450, level=1.0):
    n = secs(0.12)
    a = bp(white(n, seed), 1200, 7000) * expenv(n, 0.001, 0.02)
    return st(rms_norm(a, 0.1), 0.2, seed) * level

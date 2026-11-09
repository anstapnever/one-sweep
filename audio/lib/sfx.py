"""Designed sound effects for COLOSSUS. Each function returns a stereo (n, 2) array starting at its event time."""
import math
import numpy as np
from dsp import (SR, secs, white, pink, brown, smooth_noise, lp, hp, bp, reson, pan, env_points, db, load,
                 varispeed, modal, sine_sweep, rng, fade, sweep_lp)

P = {
    'bd_vsco_fff': 'vsco/VSCO 1 Percussion/drums/bass/bdrum_fff_1.wav',
    'bd_vsco_fff2': 'vsco/VSCO 1 Percussion/drums/bass/bdrum_fff_2.wav',
    'bd_vsco_ff': 'vsco/VSCO 1 Percussion/drums/bass/bdrum_ff_1.wav',
    'bd_vsco_mp': 'vsco/VSCO 1 Percussion/drums/bass/bdrum_mp_1.wav',
    'bd_muted_ff': 'vsco/VSCO 1 Percussion/drums/bass/bdrum_muted_ff_1.wav',
    'bd_muted_mf': 'vsco/VSCO 1 Percussion/drums/bass/bdrum_muted_mf_1.wav',
    'bd_muted_pp': 'vsco/VSCO 1 Percussion/drums/bass/bdrum_muted_pp_1.wav',
    'bd_roll': 'vsco/VSCO 1 Percussion/drums/bass/bdrum_roll_long1.wav',
    'bd2_ff': 'vcsl/Membranophones/Struck Membranophones/Bass Drum 2/bassdrum_hit_ff.wav',
    'bd2_f': 'vcsl/Membranophones/Struck Membranophones/Bass Drum 2/bassdrum_hit_f.wav',
    'bd2_mf': 'vcsl/Membranophones/Struck Membranophones/Bass Drum 2/bassdrum_hit_mf1.wav',
    'bd2_mp': 'vcsl/Membranophones/Struck Membranophones/Bass Drum 2/bassdrum_hit_mp1.wav',
    'bd2_roll_ff': 'vcsl/Membranophones/Struck Membranophones/Bass Drum 2/bassdrum_roll_ff.wav',
    'bd2_cresc': 'vcsl/Membranophones/Struck Membranophones/Bass Drum 2/bassdrum_cresc_med.wav',
    'gong_fff': 'vsco/VSCO 1 Percussion/varMetal/Gong/gong_hit_fff.wav',
    'gong_ff': 'vsco/VSCO 1 Percussion/varMetal/Gong/gong_hit_ff_hard.wav',
    'gong_mf': 'vsco/VSCO 1 Percussion/varMetal/Gong/gong_hit_mf.wav',
    'gong_p': 'vsco/VSCO 1 Percussion/varMetal/Gong/gong_hit_p.wav',
    'gong_roll': 'vsco/VSCO 1 Percussion/varMetal/Gong/gong_roll_long_ff.wav',
    'gong_scrape1': 'vsco/VSCO 1 Percussion/varMetal/Gong/gong_scrape_1.wav',
    'gong_scrape3': 'vsco/VSCO 1 Percussion/varMetal/Gong/gong_scrape_3.wav',
    'gong_smack_low': 'vsco/VSCO 1 Percussion/varMetal/Gong/gong_smack_low_1.wav',
    'gong2_fff': 'vcsl/Idiophones/Struck Idiophones/Gong 1/gong_fff.wav',
    'gong2_scrape': 'vcsl/Idiophones/Struck Idiophones/Gong 1/gong_scrape_mf.wav',
    'crash_fff': 'vsco/VSCO 1 Percussion/varMetal/Cymbals/clash/crash_hit_fff_loose.wav',
    'crash_ff': 'vsco/VSCO 1 Percussion/varMetal/Cymbals/clash/crash_hit_ff_loose.wav',
    'sus_cresc': 'vsco/VSCO 1 Percussion/varMetal/Cymbals/susp/susp_hit_softmall_roll2_cresc.wav',
    'sus_roll_long': 'vsco/VSCO 1 Percussion/varMetal/Cymbals/susp/susp_hit_softmall_roll4_fff_long.wav',
    'sus_roll_p': 'vsco/VSCO 1 Percussion/varMetal/Cymbals/susp/susp_hit_softmall_roll5_long_p.wav',
    'sus_scrape': 'vsco/VSCO 1 Percussion/varMetal/Cymbals/susp/susp_FX_scrape_continuous.wav',
    'brake_bowed1': 'vcsl/Idiophones/Struck Idiophones/Brake Drum/BrakeDrum1_Bowed_rr2_Mid.wav',
    'brake_bowed2': 'vcsl/Idiophones/Struck Idiophones/Brake Drum/BrakeDrum2_Bowed_rr1_Mid.wav',
    'brake_hammer': 'vcsl/Idiophones/Struck Idiophones/Brake Drum/BrakeDrum1_Hammer_v3_rr1_Mid.wav',
    'anvil': 'vcsl/Idiophones/Struck Idiophones/Anvil/Anvil_Hit2_v3_rr1_Mid.wav',
    'anvil_soft': 'vcsl/Idiophones/Struck Idiophones/Anvil/Anvil_Hit1_v1_rr1_Mid.wav',
    'ratchet_slow': 'vcsl/Idiophones/Struck Idiophones/Ratchet/Ratchet1_Slow_rr1_Mid.wav',
    'ocean': 'vcsl/Membranophones/Other Membranophones/Ocean Drum/OceanDrum_Sus_1_Mid.wav',
    'timp_roll': 'vsco/Percussion/Timpani/Rolls/Timpani1_Roll_v5_rr1_Sum.wav',
    'timp_roll2': 'vsco/Percussion/Timpani/Rolls/Timpani2_Roll_v5_rr1_Sum.wav',
    'timp_roll_soft': 'vsco/Percussion/Timpani/Rolls/Timpani1_Roll_v3_rr1_Sum.wav',
    'tomL': 'vcsl/Membranophones/Struck Membranophones/Tom 2/Mallet/TomL_HitM_v4_rr1_Mid.wav',
    'tomL2': 'vcsl/Membranophones/Struck Membranophones/Tom 2/Mallet/TomL_HitM_v4_rr2_Mid.wav',
    'tomL_m': 'vcsl/Membranophones/Struck Membranophones/Tom 2/Mallet/TomL_HitM_v3_rr1_Mid.wav',
    'tomH': 'vcsl/Membranophones/Struck Membranophones/Tom 1/Mallet/TomH_HitM_v4_rr1_Mid.wav',
    'tomH2': 'vcsl/Membranophones/Struck Membranophones/Tom 1/Mallet/TomH_HitM_v3_rr2_Mid.wav',
    'frameL': 'vcsl/Membranophones/Struck Membranophones/Frame Drum/HDrumL_Hit_v3_rr1_Sum.wav',
    'frameL2': 'vcsl/Membranophones/Struck Membranophones/Frame Drum/HDrumL_Hit_v3_rr2_Sum.wav',
}
TIMP = {  # file -> strongest spectral peak (Hz) measured from the sample
    1: ('vsco/Percussion/Timpani/Timpani1_Hit_v3_rr1_Sum.wav', None),
    2: ('vsco/Percussion/Timpani/Timpani2_Hit_v4_rr1_Sum.wav', 181.0),
    3: ('vsco/Percussion/Timpani/Timpani3_Hit_v4_rr1_Sum.wav', 212.0),
    4: ('vsco/Percussion/Timpani/Timpani4_Hit_v4_rr1_Sum.wav', 247.0),
}


def S(key, ratio=1.0, dur=None, gain=1.0):
    x = load(P[key])
    x = varispeed(x, ratio) if ratio != 1 else x
    if dur is not None:
        x = fade(x[:secs(dur)].copy(), 0.0005, min(0.5, dur / 3))
    return x * gain


def norm(x, peak=1.0):
    return x / (np.abs(x).max() + 1e-12) * peak


def st(x, w=1.0, seed=0):
    """Mono -> wide stereo using a tiny decorrelating delay."""
    d = 1 + int(rng(seed).integers(150, 500))
    l = x
    r = np.concatenate([np.zeros(d), x[:-d]]) if w > 0 else x
    m = (l + r) / 2
    return np.stack([m + (l - m) * w, m + (r - m) * w], 1)


def expenv(n, att, T):
    t = np.arange(n) / SR
    e = np.exp(-6.91 * np.maximum(0, t - att) / T)
    if att > 0:
        e *= np.clip(t / att, 0, 1)
    return e


# ------------------------------------------------------------------ grains: stones, debris, cracks
def grains(dur, rate_env, seed, flo=800, fhi=6000, glen=(0.003, 0.02), q=(4, 15), amp_sigma=0.8):
    """Granular debris: decaying noise grains through random resonators. rate_env(t) grains/s (callable)."""
    n = secs(dur)
    r = rng(seed)
    out = np.zeros((n, 2))
    t = 0.0
    k = 0
    while t < dur:
        rt = max(0.5, rate_env(t))
        t += r.exponential(1 / rt)
        if t >= dur:
            break
        L = r.uniform(*glen)
        m = max(32, secs(L) * 3)
        g = r.standard_normal(m) * np.exp(-np.arange(m) / max(1, secs(L)))
        f = math.exp(r.uniform(math.log(flo), math.log(fhi)))
        g = reson(g, f, r.uniform(*q)) * 3 + g * 0.3
        a = math.exp(r.normal(0, amp_sigma)) * 0.2
        add_at(out, pan(g * a, r.uniform(-0.8, 0.8)), t)
        k += 1
    return out


def add_at(buf, x, t):
    i = secs(t)
    n = min(len(buf) - i, len(x))
    if n > 0:
        buf[i:i + n] += x[:n]


def thump(f0=60, f1=32, T=0.5, dur=None, seed=0):
    dur = dur or T * 2.5
    n = secs(dur)
    tt = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-tt / (T * 0.35))
    s = sine_sweep(f, seed)
    e = expenv(n, 0.003, T)
    y = s * e
    return np.tanh(y * 1.6) / 1.6


# ------------------------------------------------------------------ the big ones
def thunder_bolt(seed=10):
    """20.3: electric snap + thunder crack + rolling rumble (≈5 s)."""
    n = secs(5.0)
    r = rng(seed)
    out = np.zeros((n, 2))
    # electric zap: noise gated by a 90 Hz buzz, 0.25 s
    m = secs(0.35)
    tt = np.arange(m) / SR
    buzz = (np.sin(2 * np.pi * 93 * tt) > 0.2).astype(float) * 0.7 + 0.3
    z = hp(white(m, seed), 1500) * buzz * expenv(m, 0.001, 0.18)
    out[:m] += st(z * 0.5, 0.6, seed)
    # crack: dense bright impulses over 0.3 s
    for i in range(18):
        t0 = abs(r.normal(0, 0.06)) + (0.0 if i == 0 else r.uniform(0, 0.25))
        L = secs(r.uniform(0.004, 0.03))
        g = hp(white(L * 4, seed + i), 900) * np.exp(-np.arange(L * 4) / L)
        add_at(out, pan(g * r.uniform(0.3, 1.0) * (1.6 if i == 0 else 1), r.uniform(-0.5, 0.5)), t0)
    # body of the crack
    c = bp(white(secs(1.0), seed + 50), 300, 5000) * expenv(secs(1.0), 0.002, 0.35)
    add_at(out, st(c * 0.9, 0.8, seed), 0.0)
    # rolling rumble
    rb = lp(brown(n, seed + 3), 260, 2) * expenv(n, 0.12, 3.2) * (1 + 0.6 * smooth_noise(n, 5, seed + 4))
    out += st(rb * 0.9, 1.0, seed + 5)
    return out


def flash_boom(seed=20):
    """21.0: the flash. Massive deep BOOM: sub drop + drums + gong + bright noise burst (≈9 s)."""
    n = secs(9.0)
    out = np.zeros((n, 2))
    sub = thump(75, 24, 2.4, 9.0, seed)
    out += st(sub * 1.4, 0.0)
    add_at(out, S('bd_vsco_fff', 0.62) * 1.1, 0.0)
    add_at(out, S('bd2_ff', 0.7) * 1.0, 0.004)
    add_at(out, lp(S('gong_fff', 0.6), 2500) * 0.9, 0.01)
    add_at(out, S('crash_fff', 0.85) * 0.35, 0.0)
    # bright white-noise burst (the white-out)
    m = secs(2.5)
    w = np.stack([white(m, seed + 1), white(m, seed + 2)], 1)
    w = hp(w, 1800) * expenv(m, 0.002, 0.9)[:, None]
    out[:m] += w * 0.55
    # thick mid-low body
    body = lp(np.stack([brown(n, seed + 3), brown(n, seed + 4)], 1), 700) * expenv(n, 0.005, 3.5)[:, None]
    out += body * 0.6
    return out


def reverse_swell(dur, seed, key='sus_cresc', ratio=0.8):
    """Sucked-in reverse whoosh ending at the event (place at t - dur)."""
    x = S(key, ratio)
    x = x[::-1].copy()
    x = x[-secs(dur):] if len(x) > secs(dur) else x
    e = np.linspace(0, 1, len(x)) ** 2.2
    nz = np.stack([pink(len(x), seed), pink(len(x), seed + 1)], 1)
    nz = sweep_lp(nz, 200 + 6000 * e ** 1.5) * 0.05
    return (x + nz * 0.5) * e[:, None]


def tinnitus(dur=3.6, seed=30):
    n = secs(dur)
    tt = np.arange(n) / SR
    e = np.exp(-tt / 1.15) * np.clip(tt / 0.05, 0, 1)
    y = np.sin(2 * np.pi * 6150 * tt) * 0.8 + np.sin(2 * np.pi * 6188 * tt) * 0.35 + np.sin(2 * np.pi * 4310 * tt) * 0.25
    y *= e * (1 + 0.1 * np.sin(2 * np.pi * 0.7 * tt))
    return st(y, 0.3, seed)


def shock_wave(seed=40):
    """22.0: the shock ring passes: low rumble swell + wind gust + laundry/awnings flapping (≈4 s)."""
    n = secs(4.5)
    out = np.zeros((n, 2))
    e = env_points(n, [(0, 0), (0.25, 1), (1.0, 0.7), (4.5, 0)])
    rb = lp(np.stack([brown(n, seed), brown(n, seed + 1)], 1), 180) * e[:, None]
    out += rb * 1.0
    g = np.stack([pink(n, seed + 2), pink(n, seed + 3)], 1)
    fenv = 300 + 2500 * env_points(n, [(0, 0), (0.3, 1), (1.5, 0.4), (4.5, 0.1)])
    g = sweep_lp(hp(g, 150), fenv) * env_points(n, [(0, 0), (0.2, 1), (1.2, 0.6), (4.5, 0)])[:, None]
    out += g * 0.55
    add_at(out, flaps(3.5, seed + 5, rate=11, level=0.5), 0.1)
    return out


def flaps(dur, seed, rate=8, level=0.3, start_env=None):
    """Cloth/awning flapping: irregular bursts of band-passed noise."""
    n = secs(dur)
    r = rng(seed)
    out = np.zeros((n, 2))
    t = 0.0
    while t < dur:
        t += r.exponential(1 / rate)
        if t >= dur:
            break
        L = r.uniform(0.02, 0.07)
        m = secs(L)
        g = bp(white(m * 3, int(r.integers(1 << 30))), 250, r.uniform(1500, 4000)) * expenv(m * 3, 0.002, L)
        a = level * (1 - t / dur) ** 0.7 * r.uniform(0.4, 1.0)
        add_at(out, pan(g * a, r.uniform(-0.7, 0.7)), t)
    return out


def debris_rattle(dur=2.5, seed=50, level=1.0, dense=1.0):
    """Tiles, shutters and pebbles rattling, dying away."""
    out = grains(dur, lambda t: dense * 140 * math.exp(-t / 0.6) + 8, seed, 900, 7000, (0.002, 0.012), (5, 20))
    out += grains(dur, lambda t: dense * 25 * math.exp(-t / 0.5) + 1, seed + 1, 250, 1200, (0.006, 0.03), (3, 8)) * 1.3
    return out * level


def steam_bed(n, seed, start, level_env):
    """Continuous steam hiss/roar bed (behind the wall), level_env per sample."""
    h = np.stack([white(n, seed), white(n, seed + 1)], 1)
    h = bp(h, 1800, 9000) * (1 + 0.5 * smooth_noise(n, 9, seed + 2))[:, None]
    roar = lp(np.stack([brown(n, seed + 3), brown(n, seed + 4)], 1), 450) * (1 + 0.4 * smooth_noise(n, 2, seed + 5))[:, None]
    return (h * 0.22 + roar * 0.6) * level_env[:, None]


def steam_burst(dur=2.2, seed=60, bright=1.0):
    n = secs(dur)
    e = env_points(n, [(0, 0), (0.06, 1), (0.4, 0.8), (dur, 0)]) ** 1.3
    h = np.stack([white(n, seed), white(n, seed + 1)], 1)
    fenv = 2500 + 6000 * e
    h = sweep_lp(hp(h, 600), fenv)
    w = lp(np.stack([brown(n, seed + 2), brown(n, seed + 3)], 1), 400)
    return (h * 0.5 * bright + w * 0.8) * e[:, None]


def metal_groan(dur, seed, base=1.0, level=1.0, bend=0.25, ms=None, tgts=None):
    """Huge distant metal creak/groan: stick-slip pulses through a modal metal body + bowed brake drum pitched way down."""
    n = secs(dur)
    r = rng(seed)
    tt = np.arange(n) / SR
    rate = 14 + 10 * smooth_noise(n, 0.8, seed) + 6 * np.sin(2 * np.pi * tt / dur * r.uniform(0.5, 1.5))
    ph = np.cumsum(np.maximum(3, rate) / SR)
    imp = np.zeros(n)
    idx = np.searchsorted(ph, np.arange(1, int(ph[-1])))
    imp[idx[idx < n]] = r.uniform(0.3, 1.0, len(idx[idx < n]))
    # modal body tuned to the scale of the film with slight detune -> dark, in-key metal
    ms = np.array(ms if ms is not None else [26, 33, 38, 39, 45, 50, 51, 53, 57, 62])
    freqs = 440 * 2 ** ((ms - 69) / 12) * 2 ** (r.uniform(-0.12, 0.12, len(ms)) / 12)
    body = modal(imp, freqs, [2.2, 1.8, 1.5, 1.3, 1.0, 0.9, 0.7, 0.5, 0.4, 0.3], [1, .9, .8, .7, .55, .45, .35, .25, .2, .12])
    body = lp(body, 2500)
    # bowed brake drum (strongest partial ~1050 Hz) pitched down onto D/Eb/A, with a slow bend
    b = S('brake_bowed1' if seed % 2 else 'brake_bowed2')
    want = 62 + 12 * math.log2(base)
    tgt = min(tgts if tgts is not None else [45, 50, 51, 57, 62, 63], key=lambda q: abs(q - want))
    r0 = 440 * 2 ** ((tgt - 69) / 12) / 1050.0
    ratio = r0 * (1 + bend * 0.25 * smooth_noise(n, 0.6, seed + 3))
    bb = varispeed(b, np.full(n, 1.0) * ratio)
    m = min(n, len(bb))
    out = np.zeros((n, 2))
    out[:m] += bb[:m] * 1.2
    out += st(body / (np.abs(body).max() + 1e-9) * 0.6, 0.9, seed)
    e = env_points(n, [(0, 0), (dur * 0.25, 1), (dur * 0.7, 0.8), (dur, 0)])
    return lp(out, 1800) * e[:, None] * level


def stone_crunch(dur=1.6, seed=70, level=1.0, low=1.0):
    """Stone crushing under a grip: dense low-mid grains + cracks + mass."""
    n = secs(dur)
    out = grains(dur, lambda t: 400 * math.exp(-t / 0.45) + 30, seed, 150, 2500, (0.005, 0.04), (2, 7), 0.7) * 1.2
    out += grains(dur, lambda t: 120 * math.exp(-t / 0.3) + 10, seed + 1, 1500, 8000, (0.002, 0.008), (6, 20)) * 0.8
    m = lp(np.stack([brown(n, seed + 2), brown(n, seed + 3)], 1), 300) * expenv(n, 0.005, dur * 0.4)[:, None]
    out += m * 0.9 * low
    return out * level


def grinding_crack(dur=2.2, seed=80, level=1.0):
    """A long tearing crack through masonry: accelerating crackle plus grinding."""
    n = secs(dur)
    out = grains(dur, lambda t: 40 + 300 * (t / dur) * math.exp(-max(0, t - dur * 0.6) * 3), seed, 300, 4000,
                 (0.003, 0.02), (3, 10))
    gr = bp(np.stack([white(n, seed + 1), white(n, seed + 2)], 1), 120, 900)
    gr *= (0.5 + 0.5 * np.abs(smooth_noise(n, 30, seed + 3)))[:, None]
    gr *= env_points(n, [(0, 0), (0.2, 0.6), (dur * 0.7, 1), (dur, 0)])[:, None]
    return (out + gr * 0.35) * level


def explosion(seed=90):
    """59.0: the kick. The biggest hit: sub drop, drums, gong, avalanche, metal shriek (≈10 s)."""
    n = secs(10.0)
    out = np.zeros((n, 2))
    out += st(thump(85, 22, 3.0, 10.0, seed) * 1.6, 0.0)
    add_at(out, S('bd_vsco_fff2', 0.55) * 1.2, 0.0)
    add_at(out, S('bd2_ff', 0.6) * 1.1, 0.003)
    add_at(out, S('bd_vsco_fff', 0.8) * 0.8, 0.008)
    add_at(out, lp(S('gong2_fff', 0.55), 3000) * 0.9, 0.01)
    add_at(out, S('crash_fff', 0.9) * 0.5, 0.0)
    m = secs(1.2)
    w = hp(np.stack([white(m, seed + 1), white(m, seed + 2)], 1), 1200) * expenv(m, 0.001, 0.35)[:, None]
    out[:m] += w * 0.6
    body = lp(np.stack([brown(n, seed + 3), brown(n, seed + 4)], 1), 900) * expenv(n, 0.004, 4.5)[:, None]
    out += body * 0.8
    # stone avalanche
    add_at(out, stone_crunch(4.0, seed + 5, 1.1), 0.02)
    add_at(out, debris_rattle(5.0, seed + 6, 0.8, 1.5), 0.4)
    # metal shriek: bowed brake drum pitched up then sliding down
    b = S('brake_bowed2')
    k = secs(2.2)
    ratio = np.interp(np.arange(k), [0, k * 0.15, k], [1.9, 1.6, 0.7])
    sh = varispeed(b, ratio)
    sh = hp(sh[:k], 500) * env_points(len(sh[:k]), [(0, 0), (0.05, 1), (1.4, 0.6), (2.2, 0)])[:, None]
    add_at(out, sh * 0.9, 0.05)
    return out


def boulder(dist=1.0, seed=100, whistle=1.0, big=1.0, pan_to=None):
    """One boulder: descending whistle (len w) then impact at t = w. Returns (audio, whistle_len)."""
    r = rng(seed)
    w = r.uniform(0.7, 1.15) * whistle
    n = secs(w + 3.5)
    out = np.zeros((n, 2))
    m = secs(w)
    tt = np.arange(m) / SR
    f = 2600 * (1 - 0.65 * (tt / w) ** 1.3)
    nz = white(m, seed)
    # narrow band whistle via resonator bank stepping along f
    # gliding band-pass: overlap-add of Hann-windowed resonator chunks (no seams between chunks)
    wh = np.zeros(m + secs(0.06))
    seg, hop = secs(0.05), secs(0.025)
    win = np.hanning(seg)
    nzp = np.concatenate([nz, np.zeros(seg)])
    for i in range(0, m, hop):
        fi = f[min(m - 1, i + seg // 2)]
        ch = reson(nzp[max(0, i - 2000):i + seg], fi, 18)[-seg:]
        wh[i:i + seg] += ch * win
    wh = wh[:m]
    wh = lp(wh, 4000) * (tt / w) ** 1.6
    p0 = r.uniform(-0.8, 0.8)
    p1 = p0 * 0.3 if pan_to is None else pan_to
    if pan_to is not None:
        p0 = p1 * 0.4
    pans = np.interp(tt, [0, w], [p0, p1])
    a = (pans + 1) * math.pi / 4
    out[:m, 0] += wh * np.cos(a) * 0.5
    out[:m, 1] += wh * np.sin(a) * 0.5
    imp = np.zeros((secs(3.5), 2))
    imp += st(thump(70, 30, 0.45 * big, 3.5, seed) * 1.1 * big, 0)
    add_at(imp, S('bd2_f' if seed % 2 else 'bd_vsco_ff', r.uniform(0.65, 0.8), 3.4) * 0.7 * big, 0.0)
    add_at(imp, stone_crunch(1.4, seed + 1, 0.9), 0.0)
    add_at(imp, debris_rattle(2.4, seed + 2, 0.5), 0.15)
    imp = lp(imp, 9000 / dist) / dist
    add_at(out, imp, w)
    return out, w


def collapse(seed=120):
    """61.6: a house facade torn away: several heavy impacts, splintering, a long debris cascade (≈5 s)."""
    n = secs(5.5)
    out = np.zeros((n, 2))
    for k, (t, g) in enumerate([(0.0, 1.0), (0.18, 0.7), (0.45, 0.8), (0.9, 0.6), (1.4, 0.5)]):
        add_at(out, st(thump(65, 30, 0.4, 2.0, seed + k) * g, 0), t)
        add_at(out, stone_crunch(1.2, seed + 10 + k, g * 0.9), t)
    add_at(out, grinding_crack(1.5, seed + 30, 0.9), 0.0)
    add_at(out, debris_rattle(4.5, seed + 31, 1.0, 1.8), 0.3)
    rb = lp(np.stack([brown(n, seed + 40), brown(n, seed + 41)], 1), 250) * expenv(n, 0.05, 2.5)[:, None]
    out += rb * 0.8
    return out


def dust_roar(dur=5.0, seed=130):
    n = secs(dur)
    e = env_points(n, [(0, 0), (1.2, 0.8), (2.2, 1), (dur - 1.2, 0.6), (dur, 0)])
    nz = np.stack([pink(n, seed), pink(n, seed + 1)], 1)
    nz = sweep_lp(nz, 250 + 2500 * e)
    rb = lp(np.stack([brown(n, seed + 2), brown(n, seed + 3)], 1), 160)
    gr = grains(dur, lambda t: 60, seed + 4, 400, 4000, (0.003, 0.012), (4, 10)) * 0.5
    return (nz * 0.5 + rb * 0.7 + gr) * e[:, None]


def footstep_far(seed=140, level=1.0):
    """A walker's heavy step far away: low thud, ground thump, faint metal clank."""
    n = secs(3.0)
    out = np.zeros((n, 2))
    out += st(thump(72, 40, 0.35, 3.0, seed) * 0.7, 0)
    out += lp(S('bd2_mf', 0.75, 3.0), 450) * 0.9
    add_at(out, lp(S('anvil_soft', 0.35), 900) * 0.12, 0.03)
    return out * level


def heartbeat(level=1.0, seed=150):
    n = secs(1.0)
    out = np.zeros((n, 2))
    for t, g in [(0.0, 1.0), (0.27, 0.65)]:
        add_at(out, st(thump(58, 36, 0.11, 0.6, seed) * g, 0), t)
        add_at(out, lp(S('bd_muted_mf', 0.5, 0.5), 220) * 0.5 * g, t)
    return out * level


# ------------------------------------------------------------------ ambience
def bird_chirp(seed, f0, kind):
    r = rng(seed)
    L = r.uniform(0.04, 0.12)
    m = secs(L)
    tt = np.arange(m) / SR
    u = tt / L
    if kind == 0:
        f = f0 * (1 + 0.35 * u)
    elif kind == 1:
        f = f0 * (1.25 - 0.4 * u)
    else:
        f = f0 * (1 + 0.15 * np.sin(np.pi * u * r.uniform(1, 3)))
    f = f * (1 + 0.02 * np.sin(2 * np.pi * r.uniform(30, 60) * tt))
    ph = np.cumsum(f) / SR * 2 * np.pi
    y = np.sin(ph) + 0.18 * np.sin(2 * ph) + 0.05 * np.sin(3 * ph)
    return y * np.sin(np.pi * u) ** 1.5


def birds(dur, seed, rate=0.8):
    """A few songbirds in the town, panned and at different distances."""
    n = secs(dur)
    out = np.zeros((n, 2))
    r = rng(seed)
    species = [(3600, 0, -0.6, 1.0), (4800, 1, 0.5, 0.7), (2700, 2, 0.1, 0.5), (5600, 0, 0.8, 0.4)]
    for si, (f0, kind, p, g) in enumerate(species):
        t = r.uniform(0, 1.5)
        while t < dur:
            k = int(r.integers(3, 8))
            tt = t
            for c in range(k):
                ch = bird_chirp(int(r.integers(1 << 30)), f0 * r.uniform(0.9, 1.1), kind)
                add_at(out, pan(ch * g * r.uniform(0.5, 1.0), p + r.uniform(-0.1, 0.1)), tt)
                tt += len(ch) / SR + r.uniform(0.03, 0.12)
            t = tt + r.uniform(1.8, 4.5) / rate
    return lp(out, 9000)


def water(dur, seed):
    """Canal water lapping at stone steps: low wavelets + bubbles."""
    n = secs(dur)
    tt = np.arange(n) / SR
    wav = np.clip(np.sin(2 * np.pi * 0.55 * tt + 2 * smooth_noise(n, 0.3, seed)), 0, 1) ** 2
    nz = np.stack([pink(n, seed + 1), pink(n, seed + 2)], 1)
    lap = bp(nz, 180, 1100) * (0.25 + wav)[:, None]
    out = lap * 0.5
    r = rng(seed + 3)
    t = 0.0
    while t < dur:
        t += r.exponential(0.09)
        if t >= dur:
            break
        L = r.uniform(0.008, 0.03)
        m = secs(L)
        u = np.arange(m) / m
        f = r.uniform(350, 1100) * (1 + 0.8 * u)
        b = np.sin(np.cumsum(f) / SR * 2 * np.pi) * np.exp(-u * 4) * np.sin(np.pi * np.minimum(1, u * 6))
        add_at(out, pan(b * r.uniform(0.05, 0.2), r.uniform(-0.6, 0.6)), t)
    return out


def wind(dur, seed, level_env=None):
    n = secs(dur)
    nz = np.stack([pink(n, seed), pink(n, seed + 1)], 1)
    c = 500 + 400 * smooth_noise(n, 0.25, seed + 2)
    y = sweep_lp(hp(nz, 120), c) * (0.6 + 0.4 * smooth_noise(n, 0.4, seed + 3))[:, None]
    if level_env is not None:
        y *= level_env[:, None]
    return y


def murmur(dur, seed, voices=14):
    """Distant town murmur: formant-filtered babble with syllable rhythm (no words)."""
    from dsp import polyblep_saw, formant
    n = secs(dur)
    out = np.zeros((n, 2))
    r = rng(seed)
    tt = np.arange(n) / SR
    for v in range(voices):
        f0 = r.uniform(100, 250)
        intn = f0 * (1 + 0.12 * smooth_noise(n, 2.5, int(r.integers(1 << 30))))
        s = polyblep_saw(intn, int(r.integers(1 << 30)))
        syl = np.clip(smooth_noise(n, 9, int(r.integers(1 << 30))), 0, 1) ** 1.5
        talk = np.clip(smooth_noise(n, 0.35, int(r.integers(1 << 30))) + 0.3, 0, 1)
        vow = ['a_m', 'o_m', 'a_f', 'o_f'][int(r.integers(4))]
        y = formant(s * syl * talk, vow)
        out += pan(y, r.uniform(-0.9, 0.9))
    out = lp(out, 1600) / math.sqrt(voices)
    return out / (np.sqrt(np.mean(out ** 2)) + 1e-9) * 0.1


def room_tone(dur, seed):
    n = secs(dur)
    return lp(np.stack([pink(n, seed), pink(n, seed + 1)], 1), 900) * 0.1

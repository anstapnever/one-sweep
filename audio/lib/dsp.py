"""DSP toolkit for the COLOSSUS soundtrack: sample instruments, synth voices, filters, reverb.

Everything is deterministic (seeded RNG). Sample rate 48 kHz, stereo float64 buffers shaped (n, 2).
"""
import os, re, json, math
import numpy as np
import soundfile as sf
from scipy import signal

SR = 48000
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .../audio
SAMPLES = os.path.join(ROOT, 'samples')

NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def midi(name):
    """'D#3' -> 51 (scientific pitch, C4 = 60)."""
    m = re.match(r'([A-Ga-g])([#b]?)(-?\d)$', name)
    n = NOTE[m.group(1).upper()] + (1 if m.group(2) == '#' else -1 if m.group(2) == 'b' else 0)
    return n + 12 * (int(m.group(3)) + 1)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def rng(seed):
    return np.random.default_rng(seed)


# ------------------------------------------------------------------ buffers
def secs(t):
    return int(round(t * SR))


def zeros(dur):
    return np.zeros((secs(dur), 2))


def add(bus, x, t, gain=1.0):
    """Mix stereo/mono x into bus at time t (seconds); clips at the bus ends."""
    if x.ndim == 1:
        x = np.stack([x, x], 1)
    i = secs(t)
    j0 = max(0, -i)
    i0 = max(0, i)
    n = min(len(bus) - i0, len(x) - j0)
    if n > 0:
        bus[i0:i0 + n] += x[j0:j0 + n] * gain


def pan(x, p):
    """Mono -> stereo with constant power pan p in [-1, 1]."""
    a = (p + 1) * math.pi / 4
    return np.stack([x * math.cos(a), x * math.sin(a)], 1)


def env_points(n, pts):
    """Piecewise-linear envelope (times in s) over n samples; pts = [(t, v), ...]."""
    t = np.arange(n) / SR
    ts, vs = zip(*pts)
    return np.interp(t, ts, vs)


def db(x):
    return 10 ** (x / 20)


def fade(x, fin=0.005, fout=0.05):
    n = len(x)
    e = np.ones(n)
    a = min(n, secs(fin))
    b = min(n, secs(fout))
    if a > 0:
        e[:a] = np.sin(np.linspace(0, math.pi / 2, a)) ** 2
    if b > 0:
        e[n - b:] *= np.cos(np.linspace(0, math.pi / 2, b)) ** 2
    return x * (e[:, None] if x.ndim == 2 else e)


# ------------------------------------------------------------------ filters
def _sos(kind, f, order=2, q=None):
    if kind == 'bp':
        return signal.butter(order, [max(10, f[0]), min(SR / 2 - 100, f[1])], 'bandpass', fs=SR, output='sos')
    return signal.butter(order, min(f, SR / 2 - 100), kind, fs=SR, output='sos')


def lp(x, f, order=2):
    return signal.sosfilt(_sos('lowpass', f, order), x, axis=0)


def hp(x, f, order=2):
    return signal.sosfilt(_sos('highpass', f, order), x, axis=0)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(_sos('bp', (lo, hi), order), x, axis=0)


def reson(x, f, q):
    """Constant-peak-gain resonator (biquad bandpass)."""
    b, a = signal.iirpeak(f, q, fs=SR)
    return signal.lfilter(b, a, x, axis=0)


def sweep_lp(x, f_env, steps=64):
    """Time-varying lowpass: crossfade between a ladder of lowpass versions (f_env per sample, Hz)."""
    fs = np.geomspace(max(40, f_env.min()), min(20000, max(f_env.max(), 41)), 8)
    vers = [lp(x, f, 2) for f in fs]
    lf = np.log(np.clip(f_env, fs[0], fs[-1]))
    pos = np.interp(lf, np.log(fs), np.arange(len(fs)))
    out = np.zeros_like(x)
    for k in range(len(fs)):
        w = np.clip(1 - np.abs(pos - k), 0, 1)
        out += vers[k] * (w[:, None] if x.ndim == 2 else w)
    return out


# ------------------------------------------------------------------ noise
def white(n, seed):
    return rng(seed).standard_normal(n)


def pink(n, seed):
    w = rng(seed).standard_normal(n)
    b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
    a = [1, -2.494956002, 2.017265875, -0.522189400]
    y = signal.lfilter(b, a, w)
    return y / (np.std(y) + 1e-12)


def brown(n, seed):
    w = rng(seed).standard_normal(n)
    y = signal.lfilter([1], [1, -0.998], w)
    y = hp(y, 15)
    return y / (np.std(y) + 1e-12)


def smooth_noise(n, rate_hz, seed):
    """Slow random control signal in [-1, 1]-ish, ~rate_hz bandwidth."""
    k = max(4, int(n / SR * rate_hz) + 4)
    pts = rng(seed).uniform(-1, 1, k)
    xs = np.linspace(0, n, k)
    from scipy.interpolate import CubicSpline
    return CubicSpline(xs, pts)(np.arange(n))


# ------------------------------------------------------------------ reverb
def make_ir(dur, decay_lo, decay_hi, seed, predelay=0.02, width=1.0, early=True):
    """Synthetic stereo hall IR: decorrelated noise with frequency-dependent exponential decay."""
    n = secs(dur)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    for ch in range(2):
        r = rng(seed + ch)
        nz = r.standard_normal(n)
        low = lp(nz, 500, 2)
        mid = bp(nz, 500, 4000, 2)
        high = hp(nz, 4000, 2)
        # T60 per band -> amplitude decay exp(-6.91 t / T60)
        e = lambda T: np.exp(-6.91 * t / T)
        y = low * e(decay_lo) + mid * e((decay_lo + decay_hi) / 2) + high * e(decay_hi) * 0.6
        if early:
            for k in range(14):
                d = r.uniform(0.008, 0.09)
                y[secs(d)] += r.uniform(-1, 1) * 2.5 * (1 - d * 8)
        out[:, ch] = y
    # soft attack of the tail
    att = np.clip(t / 0.03, 0, 1)
    out *= att[:, None]
    mid_ = out.mean(1, keepdims=True)
    out = mid_ + (out - mid_) * width
    out = np.concatenate([np.zeros((secs(predelay), 2)), out])
    return out / np.sqrt((out ** 2).sum() / 2)


def convolve(x, ir):
    """Stereo x (n,2) through stereo IR (true stereo-ish: L->L, R->R plus a little cross)."""
    yl = signal.fftconvolve(x[:, 0], ir[:, 0])[:len(x)]
    yr = signal.fftconvolve(x[:, 1], ir[:, 1])[:len(x)]
    cl = signal.fftconvolve(x[:, 1], ir[:, 0])[:len(x)]
    cr = signal.fftconvolve(x[:, 0], ir[:, 1])[:len(x)]
    return np.stack([yl + 0.3 * cl, yr + 0.3 * cr], 1)


# ------------------------------------------------------------------ samples
_cache = {}
_index = None


def index():
    global _index
    if _index is None:
        with open(os.path.join(SAMPLES, 'index.json')) as f:
            _index = json.load(f)
    return _index


def load(rel):
    """Load a sample (path relative to audio/samples) as stereo float at 48 kHz, leading silence trimmed."""
    if rel in _cache:
        return _cache[rel]
    x, sr = sf.read(os.path.join(SAMPLES, rel), always_2d=True)
    x = x[:, :2] if x.shape[1] >= 2 else np.repeat(x, 2, 1)
    if sr != SR:
        g = math.gcd(SR, sr)
        x = signal.resample_poly(x, SR // g, sr // g, axis=0)
    # trim leading silence (to -50 dB of peak)
    a = np.abs(x).max(1)
    pk = a.max() + 1e-12
    k = np.argmax(a > pk * db(-50))
    x = x[max(0, k - 48):]
    _cache[rel] = x
    return x


def varispeed(x, ratio):
    """Resample x by a pitch ratio (ratio > 1 = higher & shorter). ratio may be an array (per output sample)."""
    if np.isscalar(ratio):
        if abs(ratio - 1) < 1e-6:
            return x
        if ratio > 1:  # anti-alias before decimating
            x = lp(x, min(20000, 0.45 * SR / ratio), 4)
        n = int((len(x) - 2) / ratio)
        pos = np.arange(n) * ratio
    else:
        pos = np.cumsum(ratio) - ratio[0]
        pos = pos[pos < len(x) - 1]
    i = np.floor(pos).astype(int)
    f = (pos - i)
    if x.ndim == 2:
        f = f[:, None]
    return x[i] * (1 - f) + x[i + 1] * f


class Inst:
    """Multisampled instrument from index.json entries: {file, midi, rms, layer}."""

    def __init__(self, key, gain=1.0):
        self.key = key
        self.zones = index()[key]
        self.gain = gain

    def pick(self, m, vel):
        """Nearest root; among those, velocity layer by rank (vel 0..1)."""
        best = min(abs(z['midi'] - m) for z in self.zones)
        cands = [z for z in self.zones if abs(z['midi'] - m) == best]
        # prefer zones at or above target (pitching down sounds better than up)
        up = [z for z in cands if z['midi'] >= m]
        cands = up or cands
        cands.sort(key=lambda z: z['rms'])
        k = min(len(cands) - 1, int(vel * len(cands)))
        return cands[k]

    def note(self, m, dur, vel=0.6, att=0.0, rel=0.4, start=0.0, rr=0, normalize=True, cents=0.0):
        """Render one note of length dur (+rel tail). Long notes loop the sustain with crossfades."""
        z = self.pick(m, vel)
        if rr and len([zz for zz in self.zones if zz['midi'] == z['midi']]) > 1:
            same = [zz for zz in self.zones if zz['midi'] == z['midi']]
            same.sort(key=lambda q: q['file'])
            z = same[rr % len(same)]
        x = load(z['file'])
        ratio = 2 ** ((m - z['midi'] + cents / 100) / 12)
        x = varispeed(x, ratio)
        x = x[secs(start):]
        total = secs(dur + rel)
        if len(x) < total:
            x = loop_extend(x, total)
        x = x[:total].copy()
        n = len(x)
        e = np.ones(n)
        if att > 0:
            a = min(n, secs(att))
            e[:a] = np.linspace(0, 1, a) ** 1.5
        else:
            a = min(n, 64)
            e[:a] = np.linspace(0, 1, a)
        r0 = min(n, secs(dur))
        if n > r0:
            e[r0:] = np.cos(np.linspace(0, math.pi / 2, n - r0)) ** 2
        x *= e[:, None]
        g = self.gain
        if normalize:
            g /= (z['rms'] + 1e-9) / 0.1  # equalise layers to rms 0.1, vel then scales below
            g *= 0.35 + 0.65 * vel
        return x * g


def loop_extend(x, total):
    """Extend a sustained sample by crossfaded repeats of its middle section."""
    n = len(x)
    a = int(n * 0.3)
    b = int(n * 0.85)
    if b - a < secs(0.6):
        a, b = int(n * 0.1), n - 1
    seg = x[a:b]
    xf = min(secs(0.35), len(seg) // 3)
    out = [x[:b]]
    cur = np.concatenate(out)
    w = np.sin(np.linspace(0, math.pi / 2, xf))[:, None]
    flip = False
    while len(cur) < total:
        s = seg[::-1] if False else seg
        tail = cur[-xf:] * np.cos(np.linspace(0, math.pi / 2, xf))[:, None] + s[:xf] * w
        cur = np.concatenate([cur[:-xf], tail, s[xf:]])
        flip = not flip
    return cur


# ------------------------------------------------------------------ synth voices
def polyblep_saw(freq, seed=0, phase0=None):
    """Band-limited sawtooth from a per-sample frequency array."""
    dt = freq / SR
    ph = (np.cumsum(dt) + (rng(seed).random() if phase0 is None else phase0)) % 1.0
    y = 2 * ph - 1
    # polyBLEP correction around the wrap
    m1 = ph < dt
    t1 = ph[m1] / dt[m1]
    y[m1] -= t1 + t1 - t1 * t1 - 1
    m2 = ph > 1 - dt
    t2 = (ph[m2] - 1) / dt[m2]
    y[m2] -= t2 * t2 + t2 + t2 + 1
    return y


VOWELS = {  # formant (Hz, bandwidth, gain dB)
    'a_m': [(650, 80, 0), (1080, 90, -6), (2650, 120, -7), (2900, 130, -8), (3250, 140, -22)],
    'a_f': [(800, 80, 0), (1150, 90, -4), (2900, 120, -20), (3900, 130, -30), (4950, 140, -40)],
    'o_m': [(400, 70, 0), (800, 80, -10), (2600, 100, -20), (2800, 120, -20), (3000, 120, -36)],
    'o_f': [(450, 70, 0), (800, 80, -11), (2830, 100, -22), (3800, 130, -22), (4950, 120, -50)],
    'u_m': [(350, 60, 0), (600, 70, -20), (2400, 100, -32), (2675, 120, -28), (2950, 120, -36)],
    'u_f': [(325, 50, 0), (700, 60, -12), (2530, 170, -30), (3500, 180, -40), (4950, 200, -64)],
}


def formant(x, vowel, scale=1.0):
    y = np.zeros_like(x)
    for f, bw, g in VOWELS[vowel]:
        y += reson(x, f * scale, f * scale / bw) * db(g)
    return y


def choir_note(m, dur, seed, voices=10, vowel='a', att=1.2, rel=2.0, vib=0.012, detune=14, breath=0.08,
               bend=None):
    """Choir section note ('aah' / 'ooh'). Voices are split into three singer groups, each with its own formant
    positions (different vocal tracts), a glottal source tilted ~-12 dB/oct, a small pitch scoop and staggered
    entries, vibrato that blooms after the onset, breath noise. Returns stereo (dur+rel), RMS-normalised."""
    n = secs(dur + rel)
    f0 = hz(m)
    sex = 'm' if m < 60 else 'f'
    r = rng(seed)
    t = np.arange(n) / SR
    groups = [np.zeros((n, 2)) for _ in range(3)]
    for v in range(voices):
        cents = r.uniform(-detune, detune)
        rate = r.uniform(4.6, 6.0)
        dep = vib * r.uniform(0.6, 1.2)
        drift = smooth_noise(n, 1.5, int(r.integers(1 << 30))) * 0.004
        t_on = r.uniform(0.0, 0.09)
        vibe = np.clip((t - t_on - r.uniform(0.35, 0.9)) / 0.8, 0, 1)
        scoop = 1 - (1 - 2 ** (-r.uniform(15, 40) / 1200)) * np.exp(-np.maximum(0, t - t_on) / 0.07)
        fr = f0 * 2 ** (cents / 1200) * scoop * (1 + dep * vibe * np.sin(2 * np.pi * rate * t + r.uniform(0, 6.28)) + drift)
        if bend is not None:
            fr = fr * bend[:n]
        s = polyblep_saw(fr, int(r.integers(1 << 30)))
        amp = (1 + 0.12 * smooth_noise(n, 3, int(r.integers(1 << 30)))) * np.clip((t - t_on) / 0.04, 0, 1)
        groups[v % 3] += pan(s * amp, r.uniform(-0.85, 0.85))
    y = np.zeros((n, 2))
    for gi, (src, sc) in enumerate(zip(groups, (0.95, 1.0, 1.06))):
        src = lp(lp(src, 1400, 1), 7000, 1)  # glottal tilt (-12 dB/oct above ~1.4 kHz)
        nz = np.stack([pink(n, seed + 7 + gi * 2), pink(n, seed + 8 + gi * 2)], 1)
        src = src + nz * breath * 0.6
        y += formant(src, f'{vowel}_{sex}', sc)
    y = hp(y, 90)
    e = np.ones(n)
    a = max(1, secs(att))
    e[:a] = np.sin(np.linspace(0, math.pi / 2, a)) ** 2
    r0 = secs(dur)
    e[r0:] = np.cos(np.linspace(0, math.pi / 2, n - r0)) ** 2
    y *= e[:, None]
    return y / (np.sqrt(np.mean(y[:r0] ** 2)) + 1e-9) * 0.1


def sine_sweep(f_env, seed=0):
    ph = np.cumsum(f_env / SR) * 2 * np.pi
    return np.sin(ph + rng(seed).uniform(0, 6.28))


def modal(exc, freqs, decays, gains):
    """Excite a bank of decaying resonators (metal/stone bodies)."""
    y = np.zeros_like(exc)
    for f, T, g in zip(freqs, decays, gains):
        if f >= SR / 2 - 200:
            continue
        r = math.exp(-6.91 / (T * SR))
        w = 2 * math.pi * f / SR
        b = [1 - r]
        a = [1, -2 * r * math.cos(w), r * r]
        y += signal.lfilter(b, a, exc, axis=0) * g
    return y

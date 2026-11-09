"""Scan audio/samples, map each pitched folder to an instrument key, fix the octave convention by pitch
detection, measure RMS per file, and write audio/samples/index.json.
Usage: python -I audio/tools/build_index.py
"""
import os, re, sys, json
import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
from dsp import midi as note_midi  # noqa

ROOT = os.path.join(HERE, '..', 'samples')
PITCHED = {
    'vc_sus': 'vsco/Strings/Cello Section/susvib', 'vc_trem': 'vsco/Strings/Cello Section/trem',
    'va_sus': 'vsco/Strings/Viola Section/susvib', 'va_trem': 'vsco/Strings/Viola Section/trem',
    'vn_sus': 'vsco/Strings/Violin Section/susVib', 'vn_trem': 'vsco/Strings/Violin Section/Trem',
    'cb_trem': 'vsco/Strings/Solo Contrabass/Trem', 'cb_sus': 'vsco/Strings/Solo Contrabass/SusNV',
    'harp': 'vsco/Strings/Harp',
    'vc_spic': 'vsco/Strings/Cello Section/spic', 'cb_spic': 'vsco/Strings/Solo Contrabass/Spic',
    'va_spic': 'vsco/Strings/Viola Section/spic', 'vn_spic': 'vsco/Strings/Violin Section/Spic',
    'hn_sus': 'vsco/Brass/F Horn/sus', 'hn_stac': 'vsco/Brass/F Horn/stac',
    'tb_sus': 'vsco/Brass/Tenor Trombone/sus', 'tb_stac': 'vsco/Brass/Tenor Trombone/stac',
    'tu_sus': 'vsco/Brass/Tuba/sus', 'tu_stac': 'vsco/Brass/Tuba/stac', 'tp_sus': 'vsco/Brass/Trumpet/sus',
    'ob': 'vsco/Woodwinds/Oboe/Vib', 'fl': 'vsco/Woodwinds/Flute/susvib', 'cl': 'vsco/Woodwinds/Clarinet/susLong',
    'bn': 'vsco/Woodwinds/Bassoon/sus', 'glock': 'vsco/Percussion/Glock',
    'glass': 'vcsl/Idiophones/Friction Idiophones/Wine Glasses/Sustains/Slow',
    'bells': 'vcsl/Idiophones/Struck Idiophones/Tubular Bells 1',
    'vib_bow': 'vcsl/Idiophones/Struck Idiophones/Vibraphone/Bowed',
}


def detect(x, sr):
    """Median YIN-ish f0 over a few frames of the sustain."""
    x = x.mean(1) if x.ndim == 2 else x
    st = int(0.25 * sr)
    seg = x[st: st + int(1.2 * sr)]
    if len(seg) < 4096:
        seg = x[:min(len(x), int(1.2 * sr))]
    fs = []
    W = 4096
    for k in range(0, max(1, len(seg) - 2 * W), W // 2):
        f = seg[k:k + 2 * W]
        if len(f) < 2 * W:
            break
        d = np.array([np.sum((f[:W] - f[tau:tau + W]) ** 2) for tau in range(1, 1600)])
        cm = d * np.arange(1, 1600) / (np.cumsum(d) + 1e-12)
        idx = np.where(cm < 0.15)[0]
        if len(idx) == 0:
            continue
        i = idx[0]
        while i + 1 < len(cm) and cm[i + 1] < cm[i]:
            i += 1
        fs.append(sr / (i + 1))
    if not fs:
        return None
    return 69 + 12 * np.log2(np.median(fs) / 440)


idx = {}
for key, folder in PITCHED.items():
    files = sorted(f for f in os.listdir(os.path.join(ROOT, folder)) if f.lower().endswith('.wav'))
    zones, offs = [], []
    for fn in files:
        m = re.search(r'_([A-G]#?-?\d)(?=_|\.)', fn)
        if not m:
            continue
        x, sr = sf.read(os.path.join(ROOT, folder, fn), always_2d=True)
        a = np.abs(x).max(1)
        k0 = np.argmax(a > a.max() * 0.03)
        body = x[k0:k0 + int(2.0 * sr)]
        rms = float(np.sqrt(np.mean(body ** 2)))
        parsed = note_midi(m.group(1))
        if len(offs) < 40 and key not in ('bells', 'glass', 'vib_bow', 'glock'):
            d = detect(x[k0:], sr)
            if d is not None:
                offs.append(round((d - parsed) / 12))
        zones.append({'file': f'{folder}/{fn}', 'midi': parsed, 'rms': rms})
    off = int(np.median(offs)) * 12 if offs else 0
    for z in zones:
        z['midi'] += off
    idx[key] = zones
    rng_ = (min(z['midi'] for z in zones), max(z['midi'] for z in zones))
    print(f'{key:8s} {len(zones):3d} zones  octave offset {off:+d}  votes {np.bincount(np.array(offs) + 3) if offs else "-"}  range {rng_}')

with open(os.path.join(ROOT, 'index.json'), 'w') as f:
    json.dump(idx, f, indent=0)

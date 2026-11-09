"""Analyse out/soundtrack.wav against the film's cues: envelope, loudest moments, silence window, sample-0 check,
per-section spectrum and key, major-triad scan (score), events vs cues, plot.
Usage: python -I audio/tools/analyse.py   -> prints a report, writes audio/analysis.json and audio/sound_env.png
"""
import os, sys, json, site
sys.path.append(site.getusersitepackages())
import numpy as np
import soundfile as sf
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
AUD = os.path.dirname(HERE)
PROJ = os.path.dirname(AUD)
wav = sys.argv[1] if len(sys.argv) > 1 else os.path.join(PROJ, 'out', 'soundtrack.wav')
x, sr = sf.read(wav, always_2d=True)
mono = x.mean(1)
dur = len(x) / sr
U = json.load(open(os.path.join(AUD, 'cues_used.json')))
C, SH, DUR = U['C'], U['SH'], U['DUR']
sweep, silence = C['sweep'], C['silence']


def rms_db(seg):
    return 20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-10)


def win_rms(w, hop):
    n, h = int(w * sr), int(hop * sr)
    t = np.arange(0, len(x) - n + 1, h)
    return t / sr, np.array([rms_db(x[i:i + n]) for i in t])


rep = {'file': wav, 'duration': dur}
rep['sample_0_abs'] = float(np.abs(x[0]).max())
rep['first_10ms_peak_db'] = round(float(20 * np.log10(np.abs(x[:480]).max() + 1e-12)), 1)
ts, r1 = win_rms(1.0, 1.0)
rep['rms_per_second'] = [round(float(v), 1) for v in r1]
tq, rq = win_rms(0.4, 0.05)
_b1, _a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]
_b2, _a2 = [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]
kx = signal.lfilter(_b2, _a2, signal.lfilter(_b1, _a1, x, axis=0), axis=0)
_n, _h = int(0.4 * sr), int(0.05 * sr)
tm = np.arange(0, len(x) - _n + 1, _h) / sr
mom = np.array([-0.691 + 10 * np.log10(np.mean(kx[i:i + _n] ** 2, 0).sum() + 1e-12) for i in range(0, len(x) - _n + 1, _h)])


def peaks(tv, vv, k=8, gap=2.0):
    out = []
    for i in np.argsort(-vv):
        if all(abs(tv[i] - p) > gap for p, _ in out):
            out.append((round(float(tv[i] + 0.2), 2), round(float(vv[i]), 1)))
        if len(out) >= k:
            break
    return out


rep['loudest_momentary_lufs'] = peaks(tm, mom)
rep['loudest_0.4s_rms'] = peaks(tq, rq)
peak_t = rep['loudest_momentary_lufs'][0][0]
rep['loudest_is_sweep'] = abs(peak_t - sweep) < 0.7

# silence window
s0, s1 = int((silence + 0.01) * sr), int(sweep * sr)
s = x[s0:s1]
th = int((silence + 1.4) * sr)
rep['silence'] = {
    'window': [silence, sweep], 'rms_db': round(rms_db(s), 1), 'peak_db': round(float(20 * np.log10(np.abs(s).max() + 1e-10)), 1),
    'zero_after_thread': bool(np.all(x[th:s1] == 0)), 'zero_from_s': round(th / sr, 3), 'sound_right_after_sweep_peak_db': round(float(20 * np.log10(np.abs(x[s1:s1 + 480]).max() + 1e-10)), 1),
    'sample_before_sweep': float(np.abs(x[s1 - 1]).max()), 'sample_at_sweep': float(np.abs(x[s1:s1 + 8]).max()),
}
# the end
end_i = int(round(U['END_CUT'] * sr))
rep['end'] = {'END_CUT': U['END_CUT'], 'all_zero_after': bool(np.all(x[end_i:] == 0)), 'rms_last_400ms_before_cut_db': round(rms_db(x[end_i - int(.4 * sr):end_i]), 1)}

# gates: each hard cut really is one: level just before, level just after
gatr = []
for a, b, lv in U['gates']:
    ia = int(a * sr)
    gatr.append({'t': round(a, 3), 'before_db': round(rms_db(x[ia - 2400:ia - 120]), 1), 'after_db': round(rms_db(x[ia + 120:ia + 2400]), 1)})
rep['gates'] = gatr

# ---- key per section
MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']


def keycorr(ch):
    res = []
    for k in range(12):
        res.append((np.corrcoef(ch, np.roll(MAJ, k))[0, 1], NAMES[k] + ' major'))
        res.append((np.corrcoef(ch, np.roll(MIN, k))[0, 1], NAMES[k] + ' minor'))
    res.sort(reverse=True)
    return res[0], max(r for r in res if 'major' in r[1])


SECTIONS = [('hook', 0, C['leafSnoot']), ('dread', SH['s03'], SH['s05']), ('boast', SH['s07'], SH['s09']),
            ('slash', SH['s10'], SH['s12']), ('battle', SH['s13'], SH['s16']), ('regen', SH['s19'], C['ascend']),
            ('climb', C['ascend'], C['veins']), ('gather', C['lookUp'] - 0.6, C['silence']),
            ('release', C['tunnel'], C['planet']), ('planet', C['planet'], C['skyClear']), ('end', C['skyClear'], U['END_CUT'])]
notes = json.load(open(os.path.join(AUD, 'notes.json')))
rep['key_score'] = {}
for name, a, b in SECTIONS:
    ch = np.zeros(12)
    for nt in notes:
        ov = min(b, nt['t'] + nt['dur']) - max(a, nt['t'])
        if ov > 0:
            ch[nt['midi'] % 12] += ov * (10 ** (nt['g'] / 20)) * (0.35 + 0.65 * nt['vel'])
    if ch.sum() == 0:
        continue
    best, bmaj = keycorr(ch / ch.sum())
    rep['key_score'][name] = {'best': best[1], 'r': round(best[0], 2), 'best_major': bmaj[1], 'r_major': round(bmaj[0], 2),
                              'top': [NAMES[i] for i in np.argsort(-ch)[:5]]}

# same on the rendered music stems: harmonic-salience chroma (sub-harmonic summation, partials of a stronger lower pitch removed)
def salience_chroma(seg):
    f, t, Z = signal.stft(seg, sr, nperseg=32768, noverlap=24576)
    P = (np.abs(Z) ** 2).sum(1)
    mids = np.arange(24, 108)
    fm = 69 + 12 * np.log2(np.maximum(f, 1) / 440)
    A = np.sqrt(np.array([P[(fm >= m - 0.5) & (fm < m + 0.5)].sum() for m in mids]))
    S = np.zeros(len(mids))
    for i in range(len(mids)):
        for h in range(1, 9):
            j = i + int(round(12 * np.log2(h)))
            if j < len(mids):
                S[i] += 0.84 ** (h - 1) * A[j]
    S2 = S.copy()
    for i in np.argsort(-S):
        for h in (2, 3, 4, 5, 6):
            j = i + int(round(12 * np.log2(h)))
            if j < len(mids):
                S2[j] = max(0, S2[j] - 0.9 * S[i] * 0.84 ** (h - 1))
    ch = np.zeros(12)
    for i, m in enumerate(mids):
        ch[m % 12] += S2[i] ** 2
    return ch / (ch.sum() + 1e-12)


_stem = os.path.join(AUD, 'cache', 'buses.npz')
if os.path.exists(_stem):
    _d = np.load(_stem)
    _mus = sum(_d[k].astype(np.float64) for k in ('str', 'brass', 'wind', 'choir', 'harp')).mean(1)
    rep['key_music_stems'] = {}
    for name, a, b in SECTIONS:
        ch = salience_chroma(_mus[int(a * sr):int(b * sr)])
        best, bmaj = keycorr(ch)
        rep['key_music_stems'][name] = {'best': best[1], 'r': round(best[0], 2), 'best_major': bmaj[1], 'r_major': round(bmaj[0], 2)}

# major triads before the sweep (score, every 50 ms)
majs = []
for tt in np.arange(0, sweep, 0.05):
    w = np.zeros(12)
    for nt in notes:
        if nt['t'] <= tt < nt['t'] + nt['dur']:
            w[nt['midi'] % 12] += 10 ** (nt['g'] / 20) * (0.35 + 0.65 * nt['vel'])
    if w.sum() == 0:
        continue
    on = w > 0.12 * w.max()
    for r0 in range(12):
        if on[r0] and on[(r0 + 4) % 12] and on[(r0 + 7) % 12]:
            majs.append((round(float(tt), 2), NAMES[r0]))
spans = []
for tt, r0 in majs:
    if spans and spans[-1][2] == r0 and tt - spans[-1][1] < 0.08:
        spans[-1][1] = tt
    else:
        spans.append([tt, tt, r0])
rep['major_triads_before_sweep'] = [(a, round(b + 0.05, 2), r0 + ' major') for a, b, r0 in spans]

# first major triad and where the C major lands (planet)
rep['major_triads_after_sweep_first5'] = []
seen = []
for tt in np.arange(sweep, min(dur, sweep + 12), 0.1):
    w = np.zeros(12)
    for nt in notes:
        if nt['t'] <= tt < nt['t'] + nt['dur']:
            w[nt['midi'] % 12] += 10 ** (nt['g'] / 20) * (0.35 + 0.65 * nt['vel'])
    on = w > 0.12 * (w.max() + 1e-9)
    for r0 in range(12):
        if on[r0] and on[(r0 + 4) % 12] and on[(r0 + 7) % 12] and (not seen or seen[-1] != NAMES[r0]):
            seen.append(NAMES[r0])
            if len(rep['major_triads_after_sweep_first5']) < 5:
                rep['major_triads_after_sweep_first5'].append((round(float(tt), 1), NAMES[r0]))

# ---- spectrum per section: share of energy per band (dB rel.)
BANDS = [(0, 60), (60, 250), (250, 1000), (1000, 4000), (4000, 22000)]
rep['spectrum'] = {}
for name, a, b in SECTIONS + [('broom s05', SH['s05'] + 0.1, SH['s05'] + 1.6), ('broom end', C['backToWork'], C['backToWork'] + 0.45)]:
    seg = mono[int(a * sr):int(b * sr)]
    if len(seg) < 2048:
        continue
    F = np.abs(np.fft.rfft(seg * np.hanning(len(seg)))) ** 2
    fr = np.fft.rfftfreq(len(seg), 1 / sr)
    tot = F.sum() + 1e-20
    rep['spectrum'][name] = [round(float(10 * np.log10(F[(fr >= lo) & (fr < hi)].sum() / tot + 1e-9)), 1) for lo, hi in BANDS]

# ---- events vs cues
ev = json.load(open(os.path.join(AUD, 'events.json')))
CHECK = {'hook bass drum': 0, 'beam rake': 0, 'pod impact': 'podHit', 'shock boom': 'hookShock', 'leaf pat': 'leafSnoot', 'puff': 'leafBlow',
         'falling whistle': 'drop', 'landing': 'land', 'eye stinger': 'eye', 'toe tok 1': 'toeTap1', 'toe tok 2': 'toeTap2', 'tower slide': 'slide',
         'hair tick': 'strand', 'warlord roar': 'shedStart', 'armour burst': 'shed', 'blade hit': 'bladeHit', 'soot shake': 'sootShake',
         'yawn': 'yawn', 'fsst': 'flick', 'delayed boom': 'flickBoom', 'leaf plink': 'pileGone', 'citrus plink': 'citrusFall',
         'THE BEAM': 'fire', 'broom creak': 'grip', 'THE SWEEP': 'sweep', 'chitin dissolving': 'breakup', 'leaf lands': 'leafLand'}
chk = []
for lab, cue in CHECK.items():
    t = 0.0 if cue == 0 else C[cue]
    found = [e for e in ev if e[3] == lab]
    if not found:
        chk.append((lab, cue, None, 'MISSING'))
        continue
    dt = min(found, key=lambda e: abs(e[0] - t))
    chk.append((lab, cue, dt[0], round(dt[0] - t, 3)))
rep['events_vs_cues'] = chk
rep['last_broom_at'] = [e[0] for e in ev if e[3] == 'broom shff'][-1:]

# click scan
hpx = signal.sosfilt(signal.butter(4, 4000, 'highpass', fs=sr, output='sos'), mono)
env = np.sqrt(signal.lfilter([1 / 480], [1, -1 + 1 / 480], hpx ** 2))
spk = np.abs(hpx) > 10 * (np.concatenate([np.full(240, env[0]), env[:-240]]) + 10 ** (-60 / 20))
clicks = np.unique(np.round(np.where(spk)[0] / sr, 2))
rep['click_count'] = int(len(clicks))
rep['click_candidates'] = [float(c) for c in clicks[:60]]

print(json.dumps({k: v for k, v in rep.items() if k not in ('rms_per_second',)}, indent=1))
print('RMS per second (dBFS):')
for i, v in enumerate(r1):
    print(f'{i:3d}-{i + 1:<3d} {v:6.1f}  {"#" * max(0, int((v + 72) / 1.5))}')
json.dump(rep, open(os.path.join(AUD, 'analysis.json'), 'w'), indent=1)

try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(17, 5.5), dpi=110)
    ax.plot(tq + 0.2, rq, color='#2a6f97', lw=0.8, label='RMS 0.4 s (dBFS)')
    ax.plot(tm + 0.2, mom, color='#3a9d23', lw=0.8, alpha=0.8, label='momentary (LUFS)')
    ax.step(ts, r1, where='post', color='#d1495b', lw=1.5, label='RMS per second')
    for k in ('leafSnoot', 'land', 'eye', 'toeTap1', 'slash', 'shed', 'bladeHit', 'flick', 'veins', 'fire', 'silence', 'sweep', 'planet', 'skyClear', 'backToWork'):
        v = C[k]
        ax.axvline(v, color='#888', lw=0.7, ls='--')
        ax.text(v, -2, k, rotation=90, fontsize=7, va='top', ha='right', color='#444')
    ax.axvspan(silence, sweep, color='#f4d35e', alpha=0.4)
    ax.set_xlim(0, dur)
    ax.set_ylim(-90, 0)
    ax.set_xlabel('film time (s)')
    ax.set_title('ONE SWEEP soundtrack')
    ax.legend(loc='lower left', fontsize=8)
    ax.grid(alpha=0.25)
    fig.tight_layout()
    fig.savefig(os.path.join(AUD, 'sound_env.png'))
    print('plot -> audio/sound_env.png')
except ImportError:
    print('matplotlib missing: no plot')

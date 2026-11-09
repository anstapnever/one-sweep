"""Spectrogram of the delivered soundtrack (full film and optional zoom windows): audio/spectro_*.png
Usage: python -I audio/tools/spectro.py [a b ...]  (pairs of seconds for zoom images)"""
import os, sys, site
sys.path.append(site.getusersitepackages())
import numpy as np
import soundfile as sf
from scipy import signal
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

A = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJ = os.path.dirname(A)
x, sr = sf.read(os.path.join(PROJ, 'out', 'soundtrack.wav'), always_2d=True)
m = x.mean(1)


def spec(a, b, name, nper=4096, ymax=12000):
    seg = m[int(a * sr):int(b * sr)]
    f, t, Z = signal.stft(seg, sr, nperseg=nper, noverlap=nper * 3 // 4, boundary=None)
    D = 20 * np.log10(np.abs(Z) + 1e-7)
    fig, ax = plt.subplots(figsize=(16, 4.6), dpi=100)
    ax.pcolormesh(t + a, f, D, cmap='magma', vmin=-110, vmax=-20, shading='auto')
    ax.set_yscale('symlog', linthresh=200)
    ax.set_ylim(30, ymax)
    ax.set_title(f'{a}-{b}')
    fig.tight_layout()
    fig.savefig(os.path.join(A, name))
    plt.close(fig)


args = list(map(float, sys.argv[1:]))
if not args:
    spec(0, len(m) / sr, 'spectro_full.png', 8192)
for i in range(0, len(args), 2):
    a, b = args[i], args[i + 1]
    spec(a, b, f'spectro_{int(a):02d}_{int(b):02d}.png', 2048)

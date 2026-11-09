"""Second-by-second cue sheet from what render.py actually mixed (audio/notes.json + audio/events.json) and the
measured levels (audio/analysis.json). Prints a Markdown table; NOTES.md embeds it.
Usage: python -I audio/tools/cuesheet.py > audio/cuesheet.md
"""
import os, sys, json
sys.stdout.reconfigure(encoding="utf-8")
from collections import defaultdict

A = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
notes = json.load(open(os.path.join(A, 'notes.json')))
events = json.load(open(os.path.join(A, 'events.json')))
an = json.load(open(os.path.join(A, 'analysis.json')))
NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
INST = {'vn': 'vln', 'va': 'vla', 'vc': 'vc', 'cb': 'cb', 'hn': 'horns', 'tb': 'trb', 'tu': 'tuba', 'tp': 'tpt',
        'fl': 'flute', 'ob': 'oboe', 'bn': 'bsn', 'harp': 'harp', 'glass': 'glass', 'bells': 'bell', 'vib': 'bowed vib',
        'choir': 'choir'}
ART = {'sus': '', 'trem': ' trem', 'spic': ' spicc', 'stac': ' stacc', 'a': ' aah', 'u': ' ooh', 'bow': ''}
LABEL = {'timpani': 'timpani', 'heartbeat': 'heartbeat', 'tomL': 'toms', 'tomL2': 'toms', 'boulder': 'boulder (whistle+impact)',
         'bd2_f': 'big drum', 'bd2_ff': 'big drum', 'frameL': 'frame drum', 'footstep_far': 'walker footstep (far)',
         'metal_groan': 'metal groan', 'steam_burst': 'steam burst', 'reverse swell': 'reverse swell',
         'debris_rattle': 'debris rattle', 'X': 'sub thump', 'bd_vsco_fff': 'bass drum fff', 'bd_vsco_ff': 'bass drum',
         'gong_ff': 'gong', 'gong_mf': 'gong', 'gong_p': 'gong (soft)', 'gong2_fff': 'gong fff', 'crash_ff': 'cymbal crash',
         'grains': 'debris trickle', 'fade': 'drum/timp roll cresc.', 'wind': 'wind', 'thunder_bolt': 'THUNDER CRACK',
         'flash_boom': 'FLASH BOOM (sub drop, drums, gong, white burst)', 'tinnitus': 'tinnitus ring',
         'shock_wave': 'shock-wave rumble + gust + flapping', 'stone_crunch': 'stone crunch', 'anvil': 'anvil clank',
         'grinding_crack': 'grinding crack', 'whoosh': 'shadow whoosh', 'rb': 'ground rumble',
         'timpani roll (cresc.)': 'timpani roll cresc.', 'room tone': 'room tone', 'explosion': 'KICK EXPLOSION (sub, drums, gong, avalanche, metal shriek)',
         'collapse': 'house collapse', 'dust_roar': 'dust-wave roar', 'bed': 'debris rain', 'birds': 'birds',
         'canal water': 'canal water', 'town murmur': 'town murmur', 'flaps': 'laundry flapping', 'breeze (petals)': 'breeze',
         'fearful murmur': 'fearful murmur', 'steam_bed': 'steam hiss/roar bed', 'visor shimmer (sine cluster)': 'visor shimmer'}
FX_BUS = {'sfx', 'world', 'sub', 'tinn', 'hush'}


def nname(m):
    return f'{NAMES[m % 12]}{m // 12 - 1}'


def inst_name(k):
    head, _, tail = k.partition('_')
    return INST.get(head, head) + ART.get(tail, '' if not tail else ' ' + tail)


rows = []
rms = an['rms_per_second']
mom = an.get('momentary_lufs_max_per_second', [None] * len(rms))
for s in range(78):
    a, b = s, min(77.5, s + 1)
    if a >= 77.5:
        break
    mus = defaultdict(set)
    for n in notes:
        if a == 58 and n['inst'] != 'glass':
            continue
        if n['t'] < b and n['t'] + n['dur'] > a:
            mus[inst_name(n['inst'])].add(n['midi'])
    fx, amb = [], []
    for t0, t1, bus, lab, lvl in events:
        if a == 58 and bus != 'hush':
            continue  # the hard cut 57.5-59.0: only the hush layer passes
        if t0 < b and t1 > a and lvl > -75:
            name = LABEL.get(lab, lab)
            starts = a <= t0 < b
            item = (name + (f' @{t0:.1f}' if starts and name.isupper() is False and t0 - a > 0.05 else '')) if starts else name
            if bus == 'amb':
                amb.append(name)
            elif bus in FX_BUS:
                fx.append((item if starts else name, starts))
            else:
                mus[name].add(-1)
    order = sorted(mus.items(), key=lambda kv: min(kv[1]))
    mtxt = '; '.join(k + (' ' + ' '.join(nname(m) for m in sorted(v) if m >= 0) if any(m >= 0 for m in v) else '')
                     for k, v in order)
    seen, ftxt = set(), []
    for it, st in sorted(fx, key=lambda z: not z[1]):
        base = it.split(' @')[0]
        if base in seen:
            continue
        seen.add(base)
        ftxt.append(('**' + it + '**') if st else it)
    atxt = ', '.join(sorted(set(amb)))
    if a == 57:
        mtxt += ' — everything cut at 57.5'
    rows.append(f'| {a:>4.0f}-{b:<4g} | {rms[s] if s < len(rms) else "":>6} | {mom[s] if s < len(mom) else "":>6} | {mtxt} | {", ".join(ftxt)} | {atxt} |')

print('| sec | RMS dBFS | max mom. LUFS | music (instrument: sounding pitches) | SFX (**bold** = starts in this second) | ambience |')
print('|---|---|---|---|---|---|')
print('\n'.join(rows))

"""Download only the CC0 sample folders the score needs into audio/samples/<lib>/.

Sources (both CC0 1.0, Sam Gossner / Versilian Studios):
  VSCO-2-CE  https://github.com/sgossner/VSCO-2-CE
  VCSL       https://github.com/sgossner/VCSL
Files are treated as data only (wav/mp3 + license text); nothing from them is executed.
Usage:  python -I audio/tools/fetch_samples.py
"""
import json, os, sys, urllib.request, urllib.parse, concurrent.futures as cf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(ROOT, 'samples')

LIBS = {
    'vsco': ('sgossner/VSCO-2-CE', [
        'Strings/Cello Section/susvib/', 'Strings/Cello Section/trem/',
        'Strings/Viola Section/susvib/', 'Strings/Viola Section/trem/',
        'Strings/Violin Section/susVib/', 'Strings/Violin Section/Trem/',
        'Strings/Solo Contrabass/Trem/', 'Strings/Solo Contrabass/SusNV/',
        'Strings/Harp/',
        'Brass/F Horn/sus/', 'Brass/F Horn/stac/', 'Brass/Tenor Trombone/sus/', 'Brass/Tenor Trombone/stac/',
        'Brass/Tuba/sus/', 'Brass/Tuba/stac/', 'Brass/Trumpet/sus/',
        'Woodwinds/Oboe/Vib/', 'Woodwinds/Flute/susvib/', 'Woodwinds/Clarinet/susLong/', 'Woodwinds/Bassoon/sus/',
        'Percussion/Timpani/', 'Percussion/Glock/',
        'VSCO 1 Percussion/drums/bass/',
        'VSCO 1 Percussion/varMetal/Gong/gong_',
        'VSCO 1 Percussion/varMetal/Cymbals/',
        'LICENSE', 'README.md', 'Readme.txt',
    ]),
    'vcsl': ('sgossner/VCSL', [
        'Idiophones/Friction Idiophones/Wine Glasses/Sustains/',
        'Idiophones/Struck Idiophones/Anvil/', 'Idiophones/Struck Idiophones/Brake Drum/',
        'Idiophones/Struck Idiophones/Tubular Bells 1/', 'Idiophones/Struck Idiophones/Vibraphone/Bowed/',
        'Idiophones/Struck Idiophones/Ratchet/',
        'Idiophones/Struck Idiophones/Gong 1/',
        'Membranophones/Struck Membranophones/Bass Drum 2/', 'Membranophones/Struck Membranophones/Frame Drum/',
        'Membranophones/Struck Membranophones/Tom 1/Mallet/', 'Membranophones/Struck Membranophones/Tom 2/Mallet/',
        'Membranophones/Other Membranophones/Ocean Drum/',
        'LICENSE', 'README.md', 'License.txt', 'LICENSE.txt',
    ]),
}
OK_EXT = ('.wav', '.mp3', '.txt', '.md', 'LICENSE')


def tree(repo):
    url = f'https://api.github.com/repos/{repo}/git/trees/master?recursive=1'
    with urllib.request.urlopen(url) as r:
        return json.load(r)['tree']


def get(job):
    repo, path, out, size = job
    if os.path.exists(out) and (size is None or os.path.getsize(out) == size):
        return 0
    os.makedirs(os.path.dirname(out), exist_ok=True)
    url = f'https://raw.githubusercontent.com/{repo}/master/' + urllib.parse.quote(path)
    for _ in range(4):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                data = r.read()
            with open(out + '.part', 'wb') as f:
                f.write(data)
            os.replace(out + '.part', out)
            return len(data)
        except Exception as e:  # retry
            err = e
    print('FAILED', path, err)
    return 0


jobs = []
for lib, (repo, prefixes) in LIBS.items():
    for e in tree(repo):
        p = e['path']
        if e['type'] != 'blob' or not p.endswith(OK_EXT):
            continue
        if any(p == x or p.startswith(x) for x in prefixes):
            jobs.append((repo, p, os.path.join(DEST, lib, *p.split('/')), e.get('size')))
print(len(jobs), 'files', round(sum(j[3] or 0 for j in jobs) / 1e6), 'MB')
tot = 0
with cf.ThreadPoolExecutor(12) as ex:
    for n in ex.map(get, jobs):
        tot += n
print('downloaded', round(tot / 1e6), 'MB')

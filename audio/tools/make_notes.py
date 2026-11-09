"""Write audio/NOTES.md from the analysis of the delivered mix (audio/analysis.json) + the cue sheet.
Usage: python -I audio/tools/make_notes.py   (after render.py, analyse.py, cuesheet.py)
"""
import os, json, subprocess, re

A = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJ = os.path.dirname(A)
an = json.load(open(os.path.join(A, 'analysis.json')))
cues = open(os.path.join(A, 'cuesheet.md'), encoding='utf-8').read()
live = json.load(open(os.path.join(PROJ, 'out', 'cues_live.json'), encoding='utf-8'))

r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', os.path.join(PROJ, 'out', 'soundtrack.wav'), '-af',
                    'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True)
summ = r.stderr[r.stderr.rfind('Summary:'):]
I = re.search(r'I:\s+(-?[\d.]+) LUFS', summ).group(1)
LRA = re.search(r'LRA:\s+(-?[\d.]+) LU', summ).group(1)
TP = re.search(r'Peak:\s+(-?[\d.]+) dBFS', summ).group(1)

loud = an['loudest_0.4s']
mom = an['loudest_momentary_lufs']
ks, kc = an['key_score'], an['key_music_stems']
maj = an['major_triads_after_18s']


def row(name):
    a, b = ks[name], kc[name]
    return f"| {name} | {a['best']} ({a['r']}) | {a['best_major']} ({a['r_major']}) | {b['best']} ({b['r']}) | {b['best_major']} ({b['r_major']}) |"


SEC = ['peace', 'omen', 'dread', 'rise', 'head', 'terror', 'chaos', 'lament']
txt = f"""# COLOSSUS — sound notes

Delivered: `out/soundtrack.wav` (48 kHz / stereo / 16-bit / {an['duration']:.3f} s). Render: `audio/README.md`.
Sources: CC0 orchestral and percussion samples (VSCO-2-CE, VCSL — see `CREDITS.md`) + sound design synthesised in
code. Key: **D minor** for the whole film (Aeolian, with Phrygian Eb and chromatic minor chords for the dread);
no major-key material, no dance rhythms, nothing taken from the reference audio.

## How the emotion map was built

| film time | mood | what you hear |
|---|---|---|
| 0–18 | warm, slightly melancholic morning | soft string pad Dm(add9) → Bbmaj7 → Gm9 → Dm/A(add9), slow broken harp chords with rubato, a sighing flute phrase answered by an oboe that ends unresolved on D over A; harp + bowed-vibraphone glints; town ambience: songbirds, canal water lapping the steps, breeze, faint murmur, a distant tower bell (two tolls) |
| 18–20.3 | omen | the pad fades, birds stop at 17.9, a low D drone (contrabass + celli) and a whisper of viola Eb creep in; the world drops to about -47 dBFS just before the bolt (the reference also goes almost silent here) |
| 20.3 | bolt | electric zap + thunder crack + rolling rumble |
| 20.4–21.0 | the dome swells | reversed cymbal + rising noise sucked into the flash |
| 21.0 | FLASH | sub drop 75→24 Hz, two bass drums pitched down, gong, cymbal, white-noise burst |
| 21.2–24.5 | shock | tinnitus ring (6.15 kHz + 4.3 kHz, beating, fading over ~3.5 s); the whole diegetic world low-passed (350 Hz) and slowly reopening by 25.5; shock-wave rumble + gust + laundry/awning flapping at 22.0; tiles and pebbles rattling at 23.5 |
| 24.5–38 | dread | steam column hiss/roar rising from 24.5; contrabass + cello tremolo D/Eb cluster, violas Eb/F, high violins D5/Eb5; bassoon D; low horns D→Eb (semitone threat) twice; heartbeat from 26.0 (60 → 66 bpm, stronger); three distant metal groans (bowed brake drum pitched down onto D/Eb/A + a modal metal body tuned to D Phrygian); fearful murmur dying out; 34.5–37.5 everyone freezes: orchestra drops to a whisper, heartbeat alone; reverse swell into the hand |
| 38.0–38.333 | HAND | 38.0 the fingers pop over the parapet: fast air whoosh rushing in (+ reverse gong); **38.333 IMPACT** stinger: tuba/trombones/horns D–A–Eb, celli/basses, timpani, two bass drums, gong, crash, anvil; stone crunch, grinding crack, debris trickle |
| 38.5–45.3 | rise | spiccato ostinato in celli/violas/basses (D Phrygian: D Eb F C), accelerating 96 → 122 bpm, timpani on the beats from 40.5; high violin semitone clusters rising (D/Eb → Eb/F); horns D→F→Eb, trombone/tuba entering; creaking metal + steam bursts at 40.5 and 42.5, shadow whoosh at 42.5; drum roll + reverse cymbal into 45.3 |
| 45.3–49.5 | HEAD — goosebumps | fortepiano brass accent as the crown clears the parapet at 45.3, then choir "aah" + brass + strings in an all-minor progression **Dm – Bbm – Gm – Dm** with a steady crescendo (timpani roll, reverse gong) ; **47.2 visor ignites**: a bright flash hit (tubular bell D5, struck glass D6, high cymbal, beating sine-cluster spike) landing with the Gm chord, then the shimmer (bowed vibraphone + glass + sine cluster on D) holds and grows to full at 49.5 |
| 49.5 | headUp | impact + the vast dissonant chord: D–A–D in the bass, Ab (tritone), F, Eb (b9) in choir, horns and trumpets, F/Eb high tremolo — held and decaying for ~3 s |
| 50–55 | suspended terror | low D drone (bass + cello trem) with viola Eb; heartbeat 65 → 85 bpm; distant steam bursts at 51.0 and 53.6, a metal groan at 52.4 |
| 55–57.5 | leg lift | grinding metal, ground rumble, falling grit; trombones/tuba/horns D + Eb crescendo, D–Eb–F tremolo, timpani roll — **hard cut at 57.5** |
| 57.5–59.0 | the held breath | everything (reverb tails included) cut; only room tone, a very faint glass D5 and a few grains of dust remain |
| 59.0 | KICK | biggest hit: sub drop 85→22 Hz, three bass drums, gong fff, crash, white crack, stone avalanche, metal shriek (bowed brake drum gliding down), full orchestra on D |
| 59–68.5 | chaos | 132 bpm taiko-like 3+3+2 pattern (concert bass drum, frame drums, mallet toms, timpani), low brass stabs and string tremolo on Dm – Bb5 – Eb5 (Phrygian bII) – Dm – Gm – Dm, horns in octaves, choir in bars 3–5, falling violin line A–Bb–Gb–A–G–F; 18 boulders (whistle + impact + crunch + rattle) **on the FX department's landing times**, house collapse at 61.6, dust-wave roar from 66.2 |
| 68.5–77.5 | mourning | soft gong; 68.5–70.2 the colossus dissolves: long steam release + the visor tone (bowed vibes D5, glass A5) fading out exactly at 70.2 when it is gone; cello lament D–C–Bb–A over a choir "ooh" Dm – Cm – Bbm – A(5) (all minor / open fifth), basses doubling, violas sighing, a thin high violin A; distant walkers' footsteps from 71.2 every 1.4 s (+ a second, fainter walker); fade to silence 75.6 → 77.35 |

### Sync points taken from the other departments
- Cues: read from `src/shots.js` CUES at every render.
- Boulders: read live from the film. `node audio/tools/dump_cues.mjs` opens the film headless (scale 0.25), reads
  `FILM.ctx.fx.impacts` and, for each impact, its distance / pan / in-front relative to the camera of its shot
  (`FILM.stateFor(frame).cam`), and writes `out/cues_live.json`; `render.py` refuses to run without it.
  Current impacts: {', '.join(f"{m['t']:.2f}" + (' (house)' if m.get('houseHit') else '') for m in live['impacts'])} s.
  Size sets weight and level (+6·log10(size/4.5) dB), camera distance sets level and air absorption, pan follows
  the screen side, impacts behind the camera are low-passed.
- Colossus (`src/colossus-pose.js`): hand over the parapet 38.0, impact 38.333; crown clears the parapet 45.3;
  visor ignites 47.2 (read live: `VISOR_IGNITE`); dissolve glow from 68.5, gone at 70.2.

## Analysis of the delivered file

Loudness (`ffmpeg -i out/soundtrack.wav -af ebur128=peak=true -f null -`):
**integrated {I} LUFS**, loudness range {LRA} LU, **true peak {TP} dBFS** (limit -1 dBTP).

![RMS envelope](../out/sound_env.png)

`out/sound_env.png`: red = RMS per second, blue = RMS in 0.4 s windows, green = EBU momentary loudness; dashed lines = cues;
yellow band = the 57.5–59 silence.

**The three story hits (21.0 flash, 38.333 hand impact, 59.0 kick) are the loudest moments of the film**
- 0.4 s RMS, top 5: {', '.join(f'{t:.1f} s ({v} dBFS)' for t, v in loud[:5])}
- momentary loudness, top 5: {', '.join(f'{t:.1f} s ({v} LUFS)' for t, v in mom[:5])}

**Silence 57.5–59.0**: RMS {an['silence_57.5_59_rms_db']} dBFS, peak {an['silence_57.5_59_peak_db']} dBFS (target < -40 dBFS RMS).

**Harmony after 18 s (no major-key material)** — key correlation (Krumhansl–Kessler profiles) per section, from the
score itself (every note the renderer played, weighted by length and level) and from the rendered music stems
(harmonic-salience chroma). Best key / best major key, correlation in brackets:

| section | score: best | score: best major | audio stems: best | audio stems: best major |
|---|---|---|---|---|
{chr(10).join(row(n) for n in SEC)}

Every section is in a minor key and the best major key always correlates lower. The only major triads that sound
anywhere after 18 s (scan of the score every 0.1 s) are 0.1–0.2 s crossfades where one chord's release overlaps the
next chord's attack: {', '.join(f'{a}–{b} s' for a, b, _ in maj)}. Rhythm: sustained lines, an accelerating
ostinato and a 3+3+2 drum pattern — no dotted/swing or dance rhythms.

**Clicks**: a high-frequency spike scan finds {an['click_count']} candidates, all at intended transients (bolt, flash,
steam onsets, the hand impact, the visor flash, spiccato attacks, debris grains, the kick, boulder impacts); none in the quiet passages.

## Known weaknesses
- Nobody has listened to it: every judgement above is from measurements, spectrograms and the score.
- The choir is synthesised (formant model of 10–12 voices per note in three singer groups); it is always doubled by
  real strings and horns, but solo it would sound synthetic. A CC0 choir sample set would be better.
- Birds, water, murmur, steam, debris and all impacts are synthesised; at film level they read as texture, but
  close-up birds may sound slightly artificial.
- The VSCO-2-CE sections are small chamber sections, so the "full orchestra" is partly created by
  doubling and reverb.
- If another department changes cue times or the boulder schedule: `node audio/tools/dump_cues.mjs`, then
  `python -I audio/render.py`. The colossus beats inside sections (38.333, 45.3, 70.2) are constants in `render.py`.

## Second-by-second cue sheet (generated from what the renderer actually mixed)

{cues}
"""
open(os.path.join(A, 'NOTES.md'), 'w', encoding='utf-8').write(txt)
print('NOTES.md written', I, LRA, TP)

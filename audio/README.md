# ONE SWEEP — soundtrack (sound department)

Output: `out/soundtrack.wav`, 48 kHz stereo 16-bit, exactly `DURATION` seconds, -17 LUFS, true peak about -1.5 dBTP.

## Render (deterministic) from the project root
```
PY=python
node audio/tools/dump_cues.mjs   # optional but recommended: live fx.impacts + broom strokes -> audio/cues_live.json
$PY -I audio/render.py           # ~2 min: out/soundtrack.wav, audio/notes.json, audio/events.json, audio/cues_used.json
$PY -I audio/tools/analyse.py    # proofs: audio/analysis.json + audio/sound_env.png
$PY -I audio/tools/report.py     # compact view of the analysis
$PY -I audio/tools/spectro.py    # spectrogram: audio/spectro_full.png
ffmpeg -i out/soundtrack.wav -af ebur128=peak=true -f null -
```
Same samples + same cues + same `cues_live.json` = the same file (all randomness is seeded).

Every time in `render.py` is derived from `src/shots.js` (CUES + shot list, parsed at render) and quantised to the frame
the picture shows it on. If the timeline moves, just re-run. Without `cues_live.json` the render uses its planned
impact schedule and broom strokes; with it, barrage impacts (`ctx.fx.impacts` kinds `hit`/`boom`) and broom strokes
(real motion of the broom tip) drive the sound.

## Layout
| File | What |
|---|---|
| `render.py` | the score, one function per section, the section-level contour (`SECT`), gates (hard cuts), master |
| `lib/dsp.py` | sample instruments, filters, reverbs, formant choir |
| `lib/sfx.py` | generic designed SFX (from the previous film) |
| `lib/sweep_sfx.py` | this film's SFX: broom (ocean drum grains + straw flicks), beam, slash, roar, scream, yawn, wet regen, the sweep |
| `tools/dump_cues.mjs` | dumps fx.impacts + broom strokes from the live film |
| `tools/analyse.py`, `report.py`, `spectro.py` | proofs: envelope, loudest moments, silence, key per section, major triad scan, events vs cues |
| `NOTES.md` | the emotion map (written first) |

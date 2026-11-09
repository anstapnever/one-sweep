// Dump the live sync data the soundtrack needs from the film itself -> audio/cues_live.json
//   node audio/tools/dump_cues.mjs
// Reads window.FILM.ctx.fx.impacts (with distance / pan / in-front relative to the camera of the shot they land in) and
// derives the broom strokes from the real motion of ctx.capy.anchor('broomTip', v) (tip speed while it is on the tiles).
// Tolerant: whatever is not there yet is simply missing from the json, the render falls back to its planned schedule.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, serve, launch, openFilm } from '../../tools/env.mjs';

const OUT = path.join(ROOT, 'audio', 'cues_live.json');
const srv = await serve();
const browser = await launch();
try {
  const { page, errors } = await openFilm(browser, srv.url, 'scale=0.25');
  const ok = await page.evaluate(() => window.FILM_READY === true && !!window.FILM);
  if (!ok) throw new Error('FILM did not become ready');
  const data = await page.evaluate(async () => {
    const F = window.FILM;
    let RT = null;
    try { RT = (await import('/src/capy-rt.js')).CAPY_RT; } catch (e) { /* older capy */ }
    const THREE = F.ctx.THREE;
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const vec = (p) => (Array.isArray(p) ? p : p && typeof p.x === 'number' ? [p.x, p.y, p.z] : null);
    let imp = F.ctx.fx && F.ctx.fx.impacts;
    if (typeof imp === 'function') imp = imp();
    const impacts = (Array.isArray(imp) ? imp : []).map((m) => {
      const pos = vec(m.pos) || (typeof m.x === 'number' ? [m.x, m.y, m.z] : null);
      const st = F.stateFor(Math.round(m.t * F.FPS));
      const c = st.cam;
      let dist = 40, pan = 0, front = 1;
      if (pos && c) {
        const fwd = norm(sub(c.look, c.pos));
        const right = norm(cross(fwd, [0, 1, 0]));
        const rel = sub(pos, c.pos);
        dist = Math.hypot(...rel);
        const r = norm(rel);
        pan = dot(r, right); front = dot(r, fwd);
      }
      return { t: m.t, pos, size: m.size ?? 1, kind: m.kind ?? '', shot: st.sid, dist, pan, front };
    }).sort((a, b) => a.t - b.t);

    // broom strokes from the tip's motion, in the shots where the broom can be heard
    const broomStrokes = [];
    const capy = F.ctx.capy;
    if (capy && capy.anchor) {
      const v = new THREE.Vector3();
      const ids = ['s01', 's02', 's05', 's09', 's16', 's31'];
      for (const id of ids) {
        const sh = F.SHOTS.find((s) => s.id === id);
        if (!sh) continue;
        const a = Math.ceil(sh.start * F.FPS), b = Math.ceil(sh.end * F.FPS);
        let prev = null, run = null;
        for (let f = a; f < b; f++) {
          let p;
          if (RT && RT.broomTip) { p = RT.broomTip(f / F.FPS); }
          else { F.poseFrame(f); capy.anchor('broomTip', v); p = [v.x, v.y, v.z]; }
          if (prev) {
            const sp = Math.hypot(p[0] - prev[0], p[2] - prev[2]) * F.FPS;
            // bristles are on the tile only when the tip is down (the return stroke is lifted and silent)
            const low = p[1] < 0.02;
            if (sp > 0.3 && low) {
              if (!run) run = { f0: f - 1, f1: f, peak: sp };
              run.f1 = f; run.peak = Math.max(run.peak, sp);
            } else if (run) {
              if (run.f1 - run.f0 >= 2) broomStrokes.push({ t: run.f0 / F.FPS, dur: (run.f1 - run.f0 + 1) / F.FPS, level: Math.min(1, 0.45 + run.peak * 0.25), shot: id });
              run = null;
            }
          }
          prev = p;
        }
        if (run && run.f1 - run.f0 >= 2) broomStrokes.push({ t: run.f0 / F.FPS, dur: (run.f1 - run.f0 + 1) / F.FPS, level: Math.min(1, 0.45 + run.peak * 0.25), shot: id });
      }
    }
    return { generated: new Date().toISOString(), FPS: F.FPS, cues: F.CUES, impacts, broomStrokes };
  });
  if (errors.length) console.warn(errors.slice(0, 10).join('\n'));
  fs.writeFileSync(OUT, JSON.stringify(data, null, 1));
  console.log(`wrote ${OUT}: ${data.impacts.length} impacts, ${data.broomStrokes.length} broom strokes`);
  for (const m of data.impacts) console.log(`${m.t.toFixed(2)}  ${m.shot}  size ${(+m.size).toFixed(1)}  dist ${m.dist.toFixed(0)}  pan ${m.pan.toFixed(2)}  front ${m.front.toFixed(2)} ${m.kind}`);
  for (const s of data.broomStrokes) console.log(`stroke ${s.t.toFixed(2)} ${s.dur.toFixed(2)} ${s.level.toFixed(2)} ${s.shot}`);
} finally {
  await browser.close();
  srv.close();
}

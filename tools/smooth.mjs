// Smoothness check (no render): for every frame, camera position/aim and the screen position of key anchors.
// Flags jerks = second differences far above the shot's typical motion, and pops between consecutive frames
// inside a shot (cuts are expected between shots only).
//   node tools/smooth.mjs [--shots s17,s20] [--k 6]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, serve, launch, openFilm } from './env.mjs';

const args = process.argv.slice(2);
const opt = { shots: null, k: 6 };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--shots') opt.shots = args[++i].split(',');
  else if (args[i] === '--k') opt.k = +args[++i];
}
const srv = await serve();
const browser = await launch();
try {
  const { page } = await openFilm(browser, srv.url, 'scale=0.25');
  const rep = await page.evaluate(async (opt) => {
    const THREE = await import('three');
    const F = window.FILM, ctx = F.ctx;
    const v = new THREE.Vector3(), d = new THREE.Vector3();
    const probes = [
      ['camPos', () => ctx.camera.position.toArray()],
      ['camDir', () => ctx.camera.getWorldDirection(d).toArray().map((x) => x * 100)],
      ['capyHead', () => (ctx.capy?.anchor ? scr(ctx.capy.anchor('head', v)) : null)],
      ['warlordHead', () => (ctx.warlord?.anchor && ctx.warlord.visible !== false ? scr(ctx.warlord.anchor('head', v)) : null)],
    ];
    function scr(p) { if (!p) return null; const q = p.clone().project(ctx.camera); if (q.z > 1 || Math.abs(q.x) > 1.3 || Math.abs(q.y) > 1.3) return null; return [q.x * 960, q.y * 540, 0]; }
    const out = {};
    for (const sh of ctx.SHOTS) {
      if (opt.shots && !opt.shots.includes(sh.id)) continue;
      const f0 = Math.round(sh.start * F.FPS), f1 = Math.round(sh.end * F.FPS) - 1;
      const series = {};
      for (let n = f0; n <= f1; n++) {
        F.poseFrame(n);
        for (const [name, fn] of probes) { let val = null; try { val = fn(); } catch (e) { val = null; } (series[name] ||= []).push(val); }
      }
      const issues = [];
      for (const [name, arr] of Object.entries(series)) {
        const acc = [];
        for (let i = 1; i + 1 < arr.length; i++) {
          if (!arr[i - 1] || !arr[i] || !arr[i + 1]) continue;
          let a = 0; for (let j = 0; j < 3; j++) a += (arr[i + 1][j] - 2 * arr[i][j] + arr[i - 1][j]) ** 2;
          acc.push([i, Math.sqrt(a)]);
        }
        if (acc.length < 4) continue;
        const sorted = acc.map((x) => x[1]).sort((a, b) => a - b);
        const med = sorted[Math.floor(sorted.length / 2)];
        const floor = name.startsWith('cam') ? 0.02 : 1.5;   // metres / pixels
        for (const [i, a] of acc) if (a > Math.max(floor, med * opt.k)) issues.push({ probe: name, frame: f0 + i, t: +((f0 + i) / F.FPS).toFixed(2), acc: +a.toFixed(3), median: +med.toFixed(3) });
      }
      out[sh.id] = issues;
    }
    return out;
  }, opt);
  fs.writeFileSync(path.join(ROOT, 'out', 'smooth.json'), JSON.stringify(rep, null, 1));
  let n = 0;
  for (const [id, issues] of Object.entries(rep)) if (issues.length) { n += issues.length; console.log(`${id}: ${issues.length} jerks, e.g. ${JSON.stringify(issues.slice(0, 3))}`); }
  console.log(n ? `SMOOTH: ${n} jerks` : 'SMOOTH OK');
} finally {
  await browser.close();
  srv.close();
}

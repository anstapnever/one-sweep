// Foot-slide check on real poses (no render). Every creature exposes feet(): [{ name, pos:[x,y,z], planted }].
//   node tools/feet.mjs [--shots s04,s08] [--slip 0.002] [--air 0.03]
// Fails when a planted foot moves more than --slip metres between two consecutive drawings (foot sliding),
// or a foot is marked planted while it hovers above the ground by more than --air (or has sunk under it by more than --air).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, serve, launch, openFilm } from './env.mjs';

const args = process.argv.slice(2);
const opt = { shots: null, slip: 0.002, air: 0.03 };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--shots') opt.shots = args[++i].split(',');
  else if (args[i] === '--slip') opt.slip = +args[++i];
  else if (args[i] === '--air') opt.air = +args[++i];
}
const srv = await serve();
const browser = await launch();
let failed = false;
try {
  const { page } = await openFilm(browser, srv.url, 'scale=0.25&fx=0');
  const rep = await page.evaluate(async (opt) => {
    const F = window.FILM, ctx = F.ctx;
    const out = [];
    const prev = new Map();
    for (const sh of F.SHOTS) {
      if (opt.shots && !opt.shots.includes(sh.id)) continue;
      const a = Math.round(sh.start * F.FPS), b = Math.round(sh.end * F.FPS);
      let slipN = 0, maxSlip = 0, airN = 0, maxAir = 0, plantedN = 0, ex = null;
      prev.clear();
      for (let n = a; n < b; n++) {
        F.poseFrame(n);
        for (const [who, c] of [['capy', ctx.capy], ['warlord', ctx.warlord]]) {
          if (!c || !c.feet || c.visible === false) continue;
          const list = c.feet();
          if (!list) continue;
          for (const f of list) {
            const key = who + ':' + f.name;
            const p = prev.get(key);
            if (f.planted) {
              plantedN++;
              const gy = ctx.town?.groundY ? ctx.town.groundY(f.pos[0], f.pos[2]) : 0;
              const hgt = Math.abs(f.pos[1] - gy);
              maxAir = Math.max(maxAir, hgt);
              if (hgt > opt.air) { airN++; ex ??= `air ${key} f${n} h=${hgt.toFixed(3)}`; }
              if (p && p.planted) {
                const dx = f.pos[0] - p.pos[0], dy = f.pos[1] - p.pos[1], dz = f.pos[2] - p.pos[2];
                const d = Math.hypot(dx, dy, dz);
                maxSlip = Math.max(maxSlip, d);
                if (d > opt.slip) { slipN++; ex ??= `slip ${key} f${n} d=${d.toFixed(4)}`; }
              }
            }
            prev.set(key, { pos: f.pos.slice(), planted: f.planted });
          }
        }
      }
      out.push({ id: sh.id, frames: b - a, plantedN, slipN, maxSlip: +maxSlip.toFixed(4), airN, maxAir: +maxAir.toFixed(3), ex });
    }
    return out;
  }, opt);
  for (const r of rep) {
    const bad = r.slipN + r.airN > 0;
    if (bad) failed = true;
    console.log(`${r.id}: planted ${r.plantedN}, slip ${r.slipN} (max ${r.maxSlip} m), air ${r.airN} (max ${r.maxAir} m) ${bad ? 'FAIL ' + (r.ex || '') : 'ok'}`);
  }
  fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'out/feet.json'), JSON.stringify(rep, null, 1));
} finally {
  await browser.close();
  srv.close();
}
process.exit(failed ? 1 : 0);

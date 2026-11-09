// Pop check (no render): finds every visibility switch of a mesh INSIDE a shot whose mesh is in the camera frustum
// at that moment (things must dissolve, leave frame, or change on a cut — never blink in/out mid-shot).
//   node tools/pops.mjs [--shots s25,s26]
// Each report line: shot, frame, on/off, mesh path. Review them, then render frame before/after with snap.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, serve, launch, openFilm } from './env.mjs';

const args = process.argv.slice(2);
let shots = null;
for (let i = 0; i < args.length; i++) if (args[i] === '--shots') shots = args[++i].split(',');
const srv = await serve();
const browser = await launch();
try {
  const { page } = await openFilm(browser, srv.url, 'scale=0.25');
  const rep = await page.evaluate(async (shots) => {
    const THREE = await import('three');
    const F = window.FILM, ctx = F.ctx;
    const frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere();
    const pathOf = (o) => { const p = []; for (let x = o; x && x !== ctx.scene && x !== ctx.overlay; x = x.parent) p.push(x.name || x.type); return p.reverse().join('/'); };
    const snapshot = () => {
      const cam = ctx.camera;
      pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frustum.setFromProjectionMatrix(pm);
      const vis = new Map();
      for (const root of [ctx.scene, ctx.overlay]) root.traverseVisible((o) => {
        if (!(o.isMesh || o.isPoints || o.isLine)) return;
        let inView = true;
        if (o.geometry && !o.isInstancedMesh) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); if (o.geometry.boundingSphere) { sph.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld); inView = frustum.intersectsSphere(sph); } }
        vis.set(o.uuid, { o, inView });
      });
      return vis;
    };
    const out = {};
    for (const sh of ctx.SHOTS) {
      if (shots && !shots.includes(sh.id)) continue;
      const f0 = Math.round(sh.start * F.FPS), f1 = Math.round(sh.end * F.FPS) - 1;
      let prev = null; const ev = [];
      for (let n = f0; n <= f1; n++) {
        F.poseFrame(n);
        const cur = snapshot();
        if (prev) {
          for (const [id, c] of cur) if (!prev.has(id) && c.inView) ev.push({ frame: n, t: +(n / F.FPS).toFixed(2), what: 'on', mesh: pathOf(c.o) });
          for (const [id, p] of prev) if (!cur.has(id) && p.inView) ev.push({ frame: n, t: +(n / F.FPS).toFixed(2), what: 'off', mesh: pathOf(p.o) });
        }
        prev = cur;
      }
      out[sh.id] = ev;
    }
    return out;
  }, shots);
  fs.writeFileSync(path.join(ROOT, 'out', 'pops.json'), JSON.stringify(rep, null, 1));
  let n = 0;
  for (const [id, ev] of Object.entries(rep)) if (ev.length) { n += ev.length; console.log(`${id}: ${ev.length} switches, e.g. ${ev.slice(0, 4).map((e) => `${e.frame} ${e.what} ${e.mesh}`).join(' | ')}`); }
  console.log(n ? `POPS: ${n} in-shot visibility switches (review out/pops.json)` : 'POPS OK');
} finally {
  await browser.close();
  srv.close();
}

// Pre-render QA on real geometry (three-mesh-bvh).
//   node tools/qa.mjs [--step 2] [--shots s03,s11] [--tol 0.01] [--contactTol 0.03] [--maxv 400]
// For every tested frame (FILM.poseFrame, no render):
//   * every visible 'body' collider vertex (in the camera frustum) vs every visible 'solid' collider: inside + deeper than tol → fail
//     (tol = contactTol when the solid's name is in the body's `contact` list)
//   * body vs body of a different department (e.g. folk vs colossus)
//   * body vertex below town.groundY(x,z) - tol → fail
//   * camera inside a solid, or below groundY + near → fail
// Writes out/qa.json and prints a per-shot summary. Exit code 1 if anything failed.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, serve, launch, openFilm } from './env.mjs';

const args = process.argv.slice(2);
const opt = { step: 2, shots: null, tol: 0.01, contactTol: 0.03, maxv: 400, query: '' };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--step') opt.step = +args[++i];
  else if (a === '--shots') opt.shots = args[++i].split(',');
  else if (a === '--tol') opt.tol = +args[++i];
  else if (a === '--contactTol') opt.contactTol = +args[++i];
  else if (a === '--maxv') opt.maxv = +args[++i];
  else if (a === '--q') opt.query = args[++i];
}

const srv = await serve();
const browser = await launch();
const t0 = Date.now();
let failed = false;
try {
  const { page, errors } = await openFilm(browser, srv.url, `scale=0.25&${opt.query}`);
  page.on('console', (m) => { if (m.type() === 'log' && m.text().startsWith('[qa]')) console.log(m.text()); });
  const report = await page.evaluate(async (opt) => {
    const THREE = await import('three');
    const { MeshBVH } = await import('/vendor/three-mesh-bvh.js');
    const F = window.FILM, ctx = F.ctx;
    const bvhCache = new Map();
    const bvhOf = (geo) => {
      let b = bvhCache.get(geo.uuid);
      if (!b) { b = new MeshBVH(geo); bvhCache.set(geo.uuid, b); }
      return b;
    };
    const visibleUp = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    const meshesOf = (obj) => { const out = []; obj.traverse((m) => { if (m.isMesh && !m.isInstancedMesh && m.geometry?.attributes?.position) out.push(m); }); return out; };
    const cols = ctx.colliders || [];
    const solids = cols.filter((c) => c.kind === 'solid').map((c) => ({ ...c, meshes: meshesOf(c.obj) }));
    const bodies = cols.filter((c) => c.kind === 'body').map((c) => ({ ...c, meshes: meshesOf(c.obj) }));
    const groundY = (x, z) => (ctx.town && ctx.town.groundY ? ctx.town.groundY(x, z) : 0);
    const frustum = new THREE.Frustum(), pm = new THREE.Matrix4();
    const sph = new THREE.Sphere(), boxA = new THREE.Box3(), boxB = new THREE.Box3();
    const v = new THREE.Vector3(), lv = new THREE.Vector3(), inv = new THREE.Matrix4();
    const ray = new THREE.Ray(), hitInfo = { point: new THREE.Vector3(), distance: 0 };
    const DIRS = [new THREE.Vector3(1, 0.013, 0.007).normalize(), new THREE.Vector3(-0.011, 1, 0.017).normalize()];
    const inside = (bvh, p) => {
      let votes = 0;
      for (const d of DIRS) {
        ray.origin.copy(p); ray.direction.copy(d);
        const hits = bvh.raycast(ray, THREE.DoubleSide);
        if (hits.length % 2 === 1) votes++;
      }
      return votes === DIRS.length;
    };
    // depth of world point p inside solid mesh m (0 if outside)
    const depthIn = (m, p) => {
      const bvh = bvhOf(m.geometry);
      inv.copy(m.matrixWorld).invert();
      lv.copy(p).applyMatrix4(inv);
      if (!inside(bvh, lv)) return 0;
      bvh.closestPointToPoint(lv, hitInfo);
      const s = m.matrixWorld.getMaxScaleOnAxis();
      return hitInfo.distance * s;
    };
    const inView = (m) => {
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      sph.copy(m.geometry.boundingSphere).applyMatrix4(m.matrixWorld);
      return frustum.intersectsSphere(sph);
    };
    const wbox = (m, box) => { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); return box.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld); };

    const shots = ctx.SHOTS.filter((s) => !opt.shots || opt.shots.includes(s.id));
    const res = {};
    for (const sh of shots) {
      const f0 = Math.round(sh.start * F.FPS), f1 = Math.round(sh.end * F.FPS) - 1;
      const r = res[sh.id] = { frames: 0, fails: 0, worst: 0, examples: [] };
      for (let n = f0; n <= f1; n += opt.step) {
        const st = F.poseFrame(n);
        const cam = ctx.camera;
        pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
        frustum.setFromProjectionMatrix(pm);
        r.frames++;
        const fail = (kind, depth, a, b, p) => {
          r.fails++; r.worst = Math.max(r.worst, depth);
          if (r.examples.length < 12) r.examples.push({ frame: n, t: +(n / F.FPS).toFixed(2), kind, depth: +depth.toFixed(3), a, b, p: p && [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)] });
        };
        // camera
        const cp = cam.position;
        if (cp.y < groundY(cp.x, cp.z) + cam.near * 0.5) fail('camera-below-ground', groundY(cp.x, cp.z) - cp.y, 'camera', 'ground', cp);
        for (const s of solids) for (const m of s.meshes) {
          if (!visibleUp(m)) continue;
          if (!wbox(m, boxA).expandByScalar(cam.near).containsPoint(cp)) continue;
          const d = depthIn(m, cp);
          if (d > 0) fail('camera-in-solid', d, 'camera', s.name, cp);
        }
        // bodies
        const liveSolids = solids.map((s) => ({ s, meshes: s.meshes.filter(visibleUp) }));
        const liveBodies = bodies.map((b) => ({ b, meshes: b.meshes.filter((m) => visibleUp(m) && inView(m)) })).filter((x) => x.meshes.length);
        for (const { b, meshes } of liveBodies) {
          const contact = new Set(b.contact || []);
          let frameFails = 0;
          for (const m of meshes) {
            const pos = m.geometry.attributes.position;
            const stride = Math.max(1, Math.ceil(pos.count / opt.maxv));
            wbox(m, boxA);
            // candidate solids by bbox overlap
            const cand = [];
            for (const { s, meshes: sm } of liveSolids) for (const mm of sm) if (wbox(mm, boxB).intersectsBox(boxA)) cand.push([s, mm]);
            const otherBodies = [];
            for (const { b: ob, meshes: om } of liveBodies) if (ob.dept !== b.dept) for (const mm of om) if (wbox(mm, boxB).intersectsBox(boxA)) otherBodies.push([ob, mm]);
            for (let i = 0; i < pos.count && frameFails < 3; i += stride) {
              v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
              const gy = groundY(v.x, v.z);
              const gtol = contact.size ? opt.contactTol : opt.tol;
              if (v.y < gy - gtol && !b.noGround) { fail('below-ground', gy - v.y, `${b.name}/${m.name || m.parent?.name || 'mesh'}`, 'ground', v); frameFails++; continue; }
              for (const [s, mm] of cand) {
                const tol = contact.has(s.name) ? opt.contactTol : opt.tol;
                const d = depthIn(mm, v);
                if (d > tol) { fail('body-in-solid', d, `${b.name}/${m.name || m.parent?.name || 'mesh'}`, `${s.name}/${mm.name || 'mesh'}`, v); frameFails++; break; }
              }
              for (const [ob, mm] of otherBodies) {
                const d = depthIn(mm, v);
                if (d > opt.tol) { fail('body-in-body', d, `${b.name}/${m.name || 'mesh'}`, `${ob.name}/${mm.name || 'mesh'}`, v); frameFails++; break; }
              }
            }
          }
        }
      }
      console.log(`[qa] ${sh.id} frames ${r.frames} fails ${r.fails} worst ${r.worst.toFixed(3)}`);
    }
    return { colliders: { solids: solids.map((s) => `${s.name}(${s.meshes.length})`), bodies: bodies.map((b) => `${b.dept}:${b.name}(${b.meshes.length})`) }, shots: res };
  }, opt);
  const out = path.join(ROOT, 'out', 'qa.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ errors, ...report }, null, 1));
  console.log('solids:', report.colliders.solids.join(' '));
  console.log('bodies:', report.colliders.bodies.length);
  for (const [id, r] of Object.entries(report.shots)) {
    if (r.fails) { failed = true; console.log(`FAIL ${id}: ${r.fails} (worst ${r.worst.toFixed(3)} m) e.g. ${JSON.stringify(r.examples[0])}`); }
  }
  if (errors.length) console.log(errors.filter((e) => !e.includes('404') && !e.includes('Failed to fetch')).slice(0, 10).join('\n'));
  console.log(failed ? 'QA FAILED' : 'QA OK', `${((Date.now() - t0) / 1000).toFixed(0)}s → ${out}`);
} finally {
  await browser.close();
  srv.close();
}
process.exit(failed ? 1 : 0);

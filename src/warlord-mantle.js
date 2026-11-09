import * as THREE from 'three';
import { mantleMaterial } from './warlord-mat.js';
import { Rng, clamp, lerp, onThrees, smooth } from './util.js';

// WARLORD dept: the energy mantle. Chartreuse plasma tongues streaming off the shoulders and the back, and a flaring
// cowl behind the head. Strips are rebuilt on threes in world space and always face the camera: bold, flat cel shapes.
const V = THREE.Vector3;
const SEG = 16;

export function createMantle(ctx, j) {
  const rng = new Rng(7331);
  // list: root joint, local position, stream direction (chest space), length, width, seed, kind
  const R = [];
  const add = (joint, pos, dir, len, wid, kind = 0) => R.push({ joint, pos, dir: new V(...dir).normalize(), len, wid, kind, seed: rng.next(), ph: rng.next() * 6.28 });
  // shoulders: a few big tongues fanning out from each shoulder, the outer ones nearly level (bold shapes with air between them)
  for (const s of [1, -1]) for (let i = 0; i < 4; i++) {
    const a = i / 3;
    add('chest', [s * (0.85 + a * 0.75), 1.5 + a * 0.2, -0.5], [s * (0.55 + a * 1.7), 1.3 - a * 0.85, -0.6], 7.6 - a * 2.0, 0.98 - a * 0.26, 0);
  }
  // back: five broad flames leaving between the shoulder blades
  for (let i = 0; i < 5; i++) {
    const a = i - 2;
    add('chest', [a * 0.32, 1.5, -0.85], [a * 0.46, 1.0, -0.72], 9.2 - Math.abs(a) * 1.3, 1.26 - Math.abs(a) * 0.1, 0);
  }
  // the cowl: short bold tongues standing around the neck and behind the head, a flaring hood
  for (let i = 0; i < 9; i++) {
    const a = (i - 4) / 4;
    const ang = a * 1.9;
    add('chest', [Math.sin(ang) * 1.0, 1.72 + Math.cos(ang) * 0.3, -0.42 + Math.abs(a) * 0.1], [Math.sin(ang) * 1.25, 0.9 + Math.cos(ang) * 0.35, -0.5], 3.5 - Math.abs(a) * 0.8, 0.86 - Math.abs(a) * 0.14, 1);
  }

  const n = R.length;
  const nv = n * (SEG + 1) * 2;
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), seed = new Float32Array(nv), kind = new Float32Array(nv);
  const idx = [];
  for (let i = 0; i < n; i++) {
    const base = i * (SEG + 1) * 2;
    for (let k = 0; k <= SEG; k++) {
      const a = base + k * 2;
      uv[a * 2] = uv[(a + 1) * 2] = k / SEG;
      uv[a * 2 + 1] = 0; uv[(a + 1) * 2 + 1] = 1;
      seed[a] = seed[a + 1] = R[i].seed;
      kind[a] = kind[a + 1] = R[i].kind;
      if (k < SEG) idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setIndex(idx);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  const mat = mantleMaterial();
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.userData.noShadow = true;
  mesh.name = 'mantle';
  ctx.scene.add(mesh);

  let level = 0;
  const tmp = new V(), tan = new V(), side = new V(), dV = new V();
  return {
    setVisible(v) { mesh.visible = v; },
    level() { return level; },
    update(st, p, sec, root) {
      const k = p.st.mantle;
      level = k;
      if (k < 0.02 || p.st.black > 0.5) { mesh.visible = false; return; }
      mesh.visible = true;
      const t = onThrees(st.t);
      const cam = ctx.camera.position;
      const s = p.s;
      // up + away: world drift from the chest
      const q = j.chest.getWorldQuaternion(new THREE.Quaternion());
      for (let i = 0; i < n; i++) {
        const r = R[i];
        const joint = j[r.joint];
        const P0 = joint.localToWorld(tmp.set(...r.pos)).clone();
        dV.copy(r.dir).applyQuaternion(q).normalize();
        // the stream lifts toward world up as it leaves the body
        const kL = k < 1 ? k : 1 + (k - 1) * 0.4;
        const len = r.len * s * kL * (0.86 + 0.14 * Math.sin(t * 2.3 + r.ph));
        const wid = r.wid * s * Math.sqrt(kL) * (0.88 + 0.12 * Math.sin(t * 3.1 + r.ph * 2));
        const lp = new V().copy(P0);
        const base = (i) => i * (SEG + 1) * 2;
        const b = base(i);
        for (let a = 0; a <= SEG; a++) {
          const u = a / SEG;
          // up-curve, S-curve sway and spring drift
          const up = u * u * 0.45 * len;
          const sway = Math.sin(u * 4.2 - t * 4.2 + r.ph) * u * len * 0.13;
          const c2 = Math.sin(u * 11 + t * 3 + r.ph * 1.6) * u * len * 0.03;
          const px = P0.x + dV.x * len * u + sway * dV.z + c2 + sec.mant[0] * 0.06 * u * u * len;
          const py = P0.y + dV.y * len * u + up + sway * 0.4 + sec.mant[1] * 0.08 * u * u * len;
          const pz = P0.z + dV.z * len * u - sway * dV.x + c2 * 0.7 + sec.mant[2] * 0.06 * u * u * len;
          tan.set(px - lp.x, py - lp.y, pz - lp.z);
          if (a === 0) tan.copy(dV);
          lp.set(px, py, pz);
          side.set(cam.x - px, cam.y - py, cam.z - pz).cross(tan).normalize();
          const hw = wid * lerp(1, 1, u);
          const v = b + a * 2;
          pos[v * 3] = px - side.x * hw; pos[v * 3 + 1] = py - side.y * hw; pos[v * 3 + 2] = pz - side.z * hw;
          pos[(v + 1) * 3] = px + side.x * hw; pos[(v + 1) * 3 + 1] = py + side.y * hw; pos[(v + 1) * 3 + 2] = pz + side.z * hw;
        }
      }
      g.attributes.position.needsUpdate = true;
      void root; void clamp; void smooth;
    },
  };
}

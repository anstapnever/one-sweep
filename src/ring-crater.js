import * as THREE from 'three';
import { Rng } from './util.js';
import { CRATER, PILLAR, HOOK, CITY, PROM, RAIL } from './layout.js';
import { craterMaterial, propMaterial, RU } from './ring-mat.js';
import { PB } from './ring-prom.js';
import { craterRim } from './ring-geo.js';

// Below-deck: the crater bowl, the pillar he stands on, the things the deck was made of, and the trench of the hook.
export function buildCrater(ctx) {
  const { CUES, scene } = ctx;
  const root = new THREE.Group(); scene.add(root);
  root.visible = false;

  // ---- the bowl: a polar grid, rings packed at the steep rim, broken-tile lumps on it
  const bowlY = (r, a) => {
    const R = CRATER.r;
    if (r >= R) return 0;
    return -CRATER.depth * Math.sqrt(Math.max(0, 1 - (r / R) * (r / R)));
  };
  const nA = 160, rs = [];
  for (let i = 0; i <= 90; i++) { const k = i / 90; rs.push(CRATER.r * (1 - Math.pow(1 - k, 2.2))); }
  const pos = [], uv = [], idx = [];
  const n1 = (a, b) => {
    const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s);
  };
  const vn = (x, y) => { const i = Math.floor(x), j = Math.floor(y); const f = x - i, g = y - j; const u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g); return (n1(i, j) * (1 - u) + n1(i + 1, j) * u) * (1 - v) + (n1(i, j + 1) * (1 - u) + n1(i + 1, j + 1) * u) * v; };
  const fbm = (x, y) => vn(x, y) * 0.55 + vn(x * 2.1 + 3, y * 2.1) * 0.3 + vn(x * 4.3 + 7, y * 4.3) * 0.15;
  for (let i = 0; i < rs.length; i++) for (let j = 0; j <= nA; j++) {
    const a = (j / nA) * Math.PI * 2;
    const r0 = rs[i];
    let y = bowlY(r0, a);
    const c = Math.cos(a), s = Math.sin(a);
    const r = r0 * craterRim(a) / CRATER.r;
    const edge = Math.min(1, (CRATER.r - r0) / 1.2);                // the last ring meets the deck exactly at y = 0
    const jag = (fbm(a * 5 + 3, r0 * 0.3) - 0.5) * 1.6 * Math.exp(-Math.pow((CRATER.r - r0) / 11, 2)) * edge;
    const lump = (fbm(c * r0 * 0.5 + 21, s * r0 * 0.5) - 0.5) * 0.9 * Math.min(1, r0 / 6) * Math.min(1, (CRATER.r - r0) * 0.8 + 0.1);
    y += jag + lump;
    y = Math.min(y, -0.2 * edge);
    let z = r * s;
    // the south edge of the deck: a broken bank of rubble at the end of the world
    let x = r * c;
    const south = Math.max(0, z - 20);
    if (south > 0) y = Math.max(y + 0, -1.2 - (fbm(x * 0.2, 3) * 1.6)) * (1.0 - 0.0);
    if (z > PROM.z1 - 0.02) z = PROM.z1 - 0.02;
    pos.push(x, y, z); uv.push(a * r0, y);
  }
  for (let i = 0; i < rs.length - 1; i++) for (let j = 0; j < nA; j++) {
    const a = i * (nA + 1) + j, b = a + 1, c = a + nA + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const bowlG = new THREE.BufferGeometry();
  bowlG.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bowlG.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  bowlG.setIndex(idx);
  bowlG.computeVertexNormals();
  const bowl = new THREE.Mesh(bowlG, craterMaterial({ kind: 0 }));
  bowl.frustumCulled = false; bowl.userData.noShadow = true;
  root.add(bowl);

  // ---- the pillar: rough walls, sides strictly inside |x|,|z| <= hw at the top (it IS his patch)
  const hw = PILLAR.hw, depth = CRATER.depth + 3;
  const pG = new THREE.BufferGeometry();
  {
    const p = [], u = [], ix = [];
    const seg = 40, segY = 110;
    // the deck's layers stand at slightly different depths: the side reads as a cut cake of ledges, not as draped cloth
    const layerAt = [[0.28, 0], [0.55, -0.05], [2.0, 0.04], [2.6, -0.2], [4.5, 0.07], [99, 0.14]];
    const ledge = (d) => {
      let v = 0, prev = 0;
      for (let i = 0; i < layerAt.length; i++) {
        const [b, o] = layerAt[i];
        const w = Math.min(1, Math.max(0, (d - prev + 0.07) / 0.14));
        v += (o - (i ? layerAt[i - 1][1] : 0)) * w * w * (3 - 2 * w);
        prev = b;
      }
      return v;
    };
    let v = 0;
    const side = (sx, sz, along) => {
      const b = v;
      for (let j = 0; j <= segY; j++) for (let i = 0; i <= seg; i++) {
        const s = (i / seg) * 2 - 1, k = j / segY;
        const y = -k * depth;
        const su = along === 'x' ? s + sz : sx + s;
        const rough = (fbm(su * 4.5 + 11, y * 2.2) - 0.5) * 0.2 * Math.min(1, -y / 1.2) + ledge(-y);
        const belly = 0.05 * Math.min(1, -y / 2) + 0.1 * Math.sin(k * 3.1);
        const off = hw + rough + belly;
        let x, z;
        const cn = Math.pow(Math.abs(s), 6);
        if (along === 'x') { x = s * (hw + (rough + belly) * cn + rough * 0.3 * (1 - cn)); z = off * sz; }
        else { x = off * sx; z = s * (hw + (rough + belly) * cn + rough * 0.3 * (1 - cn)); }
        // the very top of the walls is exact
        const clampTop = Math.min(1, (-y) / 0.25);
        if (along === 'x') { x = s * hw + (x - s * hw) * clampTop; z = sz * hw + (z - sz * hw) * clampTop; }
        else { z = s * hw + (z - s * hw) * clampTop; x = sx * hw + (x - sx * hw) * clampTop; }
        p.push(x, y, z); u.push(s * hw, y); v++;
      }
      for (let j = 0; j < segY; j++) for (let i = 0; i < seg; i++) {
        const a = b + j * (seg + 1) + i, bb = a + 1, c = a + seg + 1, d = c + 1;
        const flip = (along === 'x' ? -sz : sx) > 0;
        if (flip) ix.push(a, c, bb, bb, c, d); else ix.push(a, bb, c, bb, d, c);
      }
    };
    side(0, 1, 'x'); side(0, -1, 'x'); side(1, 0, 'z'); side(-1, 0, 'z');
    pG.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    pG.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
    pG.setIndex(ix);
    pG.computeVertexNormals();
  }
  const pillar = new THREE.Mesh(pG, craterMaterial({ kind: 1 }));
  pillar.frustumCulled = false; pillar.userData.noShadow = true;
  root.add(pillar);

  // ---- pipes broken out of the walls: brass and terracotta, some with a torn flange
  {
    const pb = new PB();
    const rng = new Rng(404);
    const m = new THREE.Matrix4(), y2 = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 46; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r0 = rng.range(CRATER.r - 3.8, CRATER.r - 0.8);
      const y = -rng.range(0.7, 5.2);
      const len = rng.range(0.8, 3.4), R = rng.range(0.07, 0.24);
      const rk = craterRim(a) / CRATER.r;
      const x0 = r0 * rk * Math.cos(a), z0 = r0 * rk * Math.sin(a);
      if (z0 > 21) continue;
      const dir = new THREE.Vector3(-Math.cos(a), rng.range(-0.25, 0.15), -Math.sin(a)).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(y2, dir);
      m.compose(new THREE.Vector3(x0, y, z0), q, new THREE.Vector3(1, 1, 1));
      const kind = rng.next() < 0.6 ? 2 : 4;
      pb.lathe([[R, -1.4], [R, len - 0.04], [R * 1.5, len - 0.02], [R * 1.5, len], [R * 0.7, len + 0.01]], { m: m.clone(), kind, seed: rng.next(), segs: 10, part: i % 3 });
    }
    const pipes = new THREE.Mesh(pb.build(), propMaterial({ id: 16 }));
    pipes.frustumCulled = false; pipes.userData.noShadow = true;
    root.add(pipes);
  }

  // ---- rubble on the bowl, and big broken slabs of promenade tilted on the rim
  // rock is broken, not moulded: a ball chopped by random planes, so it has flat faces and hard edges
  const chiselRock = (seed) => {
    const g = new THREE.IcosahedronGeometry(1, 2), r2 = new Rng(seed), p = g.attributes.position;
    const planes = [];
    for (let i = 0; i < 11; i++) {
      const n = new THREE.Vector3(r2.range(-1, 1), r2.range(-1, 1), r2.range(-1, 1)).normalize();
      planes.push([n, r2.range(0.42, 0.82)]);
    }
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      for (const [n, d] of planes) { const e = v.dot(n) - d; if (e > 0) v.addScaledVector(n, -e); }
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  };
  const rocks = [chiselRock(61), chiselRock(62), chiselRock(63)];
  const rockM = craterMaterial({ kind: 3, instanced: true });
  const rng = new Rng(808);
  const scatter = (geo, n, pick) => {
    const inst = new THREE.InstancedBufferGeometry(); inst.index = geo.index; inst.attributes = geo.attributes;
    const im = new THREE.InstancedMesh(inst, rockM, n);
    const iA = new Float32Array(n * 4); const D = new THREE.Object3D(); let c = 0;
    for (let t = 0; t < n * 8 && c < n; t++) {
      const v = pick(D); if (!v) continue;
      D.updateMatrix(); im.setMatrixAt(c, D.matrix); iA.set([rng.next(), v.slab ? 1 : 0, 0, 0], c * 4); c++;
    }
    inst.setAttribute('iA', new THREE.InstancedBufferAttribute(iA, 4));
    im.count = c; im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; im.userData.noShadow = true;
    root.add(im);
    return im;
  };
  for (const rockG of rocks) scatter(rockG, 370, (D) => {
    const a = rng.range(0, 6.283), r = Math.sqrt(rng.next()) * (CRATER.r - 0.5);
    const rk = craterRim(a) / CRATER.r;
    const x = r * rk * Math.cos(a), z = r * rk * Math.sin(a);
    if (Math.abs(x) < 3.4 && Math.abs(z) < 3.4) return null;
    if (z > 22) return null;
    const s = Math.pow(rng.next(), 3.0) * 1.7 + 0.1;
    const y = -CRATER.depth * Math.sqrt(Math.max(0, 1 - (r / CRATER.r) ** 2)) + s * 0.1;
    D.position.set(x, y, z); D.rotation.set(rng.range(0, 6), rng.range(0, 6), rng.range(0, 6)); D.scale.set(s, s * rng.range(0.45, 0.95), s * rng.range(0.6, 1));
    return {};
  });
  const box = new THREE.BoxGeometry(1, 1, 1);
  scatter(box, 240, (D) => {
    const a = rng.range(0, 6.283), r = CRATER.r - Math.pow(rng.next(), 1.6) * 11 - 0.6;
    const rk = craterRim(a) / CRATER.r;
    const x = r * rk * Math.cos(a), z = r * rk * Math.sin(a);
    if (z > 22.2) return null;
    const s = rng.range(0.5, 2.6);
    const y = -CRATER.depth * Math.sqrt(Math.max(0, 1 - (r / CRATER.r) ** 2)) + rng.range(0, 0.4);
    D.position.set(x, y, z);
    D.rotation.set(rng.range(-0.9, 0.9), rng.range(0, 6.28), rng.range(-0.9, 0.9));
    D.scale.set(s * rng.range(0.7, 1.3), rng.range(0.14, 0.3), s * rng.range(0.6, 1.2));
    return { slab: true };
  });

  // ---- the trench of the hook (below the floor; the floor discards itself over it as the beam passes)
  const trench = new THREE.Group(); scene.add(trench);
  {
    const ax = HOOK.rakeFrom[0], az = HOOK.rakeFrom[2], bx = HOOK.rakeTo[0], bz = HOOK.rakeTo[2];
    const Lx = bx - ax, Lz = bz - az, L = Math.hypot(Lx, Lz);
    const dx = Lx / L, dz = Lz / L, nx = -dz, nz = dx;
    const nAlong = 240, nAcross = 44;
    // the torn outline of the furrow: the same sum as trenchMask() in the floor shader
    const trW = (m, sd) => 60 + 8 * Math.cos(m * 0.0113 + 1.3 + sd * 1.1) + 6 * Math.cos(m * 0.031 + 0.4 + sd * 2.7) + 3.5 * Math.cos(m * 0.083 + 2.2 + sd * 0.9) + 1.8 * Math.cos(m * 0.21 + 5.1 + sd * 1.9);
    const ss = (a, b, x) => { const q = Math.min(1, Math.max(0, (x - a) / (b - a))); return q * q * (3 - 2 * q); };
    const P = [], U = [], I = [];
    for (let i = 0; i <= nAlong; i++) for (let j = 0; j <= nAcross; j++) {
      const s = i / nAlong * 1.1 - 0.05, c0 = (j / nAcross) * 2 - 1, c = Math.sin(c0 * Math.PI * 0.5);
      const W = trW(s * L, c >= 0 ? 1 : -1) * ss(-0.03, 0.07, s) * (1 - ss(0.915, 1.015, s)) + 1.2;
      const X = ax + Lx * s + nx * c * W, Z = az + Lz * s + nz * c * W;
      const edge = Math.max(0, 1 - Math.pow(Math.abs(c), 3.4));
      const y = -46 * edge - 0.3 + (fbm(X * 0.05, Z * 0.05) - 0.5) * 16 * edge;
      P.push(X, y, Z); U.push(s * L, c * W);
    }
    for (let i = 0; i < nAlong; i++) for (let j = 0; j < nAcross; j++) {
      const a = i * (nAcross + 1) + j, b = a + 1, c = a + nAcross + 1, d = c + 1;
      I.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I); g.computeVertexNormals();
    const m = new THREE.Mesh(g, craterMaterial({ kind: 2 }));
    m.frustumCulled = false; m.userData.noShadow = true;
    trench.add(m);
  }

  // ---- debris thrown from the trench: chunks of terrace, slabs and coral arms hung in the air
  let debris;
  {
    const r2 = new Rng(911);
    const beamT = (u) => { if (u <= 0.14) return CUES.rakeStart - 0.1 - 1.3 * (0.14 - u) / 0.14; const q = (u - 0.14) / 0.86; return CUES.rakeStart + (CUES.rakeEnd - CUES.rakeStart) * (1 - Math.pow(1 - q, 1 / 1.35)); };
    const N = 620;
    const g1 = new THREE.BoxGeometry(1, 1, 1);
    const inst = new THREE.InstancedBufferGeometry(); inst.index = g1.index; inst.attributes = g1.attributes;
    const mat = craterMaterial({ kind: 3, instanced: true, debris: true });
    const im = new THREE.InstancedMesh(inst, mat, N);
    const iA = new Float32Array(N * 4), iV = new Float32Array(N * 4), iW = new Float32Array(N * 4);
    const D = new THREE.Object3D();
    const ax = HOOK.rakeFrom[0], az = HOOK.rakeFrom[2], bx = HOOK.rakeTo[0], bz = HOOK.rakeTo[2];
    const Lx = bx - ax, Lz = bz - az, L = Math.hypot(Lx, Lz), nx = -Lz / L, nz = Lx / L;
    for (let i = 0; i < N; i++) {
      const u = r2.next();
      const side = r2.range(-50, 50);
      const x = ax + Lx * u + nx * side, z = az + Lz * u + nz * side;
      const s = Math.pow(r2.next(), 2.6) * 15 + 2.0;
      const y = r2.range(4, 40);
      D.position.set(x, y, z); D.rotation.set(r2.range(0, 6), r2.range(0, 6), r2.range(0, 6)); D.scale.set(s, s * r2.range(0.2, 0.7), s * r2.range(0.4, 1));
      D.updateMatrix(); im.setMatrixAt(i, D.matrix);
      iA.set([r2.next(), 0, 0, 0], i * 4);
      const sp = r2.range(40, 170), up = r2.range(0.5, 1), hAng = r2.range(3.3, 6.1);   // thrown north, away from the side the furrow is seen from
      iV.set([Math.cos(hAng) * sp * 0.34, up * sp, Math.sin(hAng) * sp * 0.34, r2.range(-2.5, 2.5)], i * 4);
      // the earliest ones were thrown before the film begins: debris hangs in the air on frame 0
      const birth = beamT(u) - r2.range(0.05, 1.2) * (u < 0.3 ? 1 : r2.next() * 0.6);
      iW.set([0, birth, r2.range(3.2, 5.5), 0], i * 4);
    }
    inst.setAttribute('iA', new THREE.InstancedBufferAttribute(iA, 4));
    inst.setAttribute('iV', new THREE.InstancedBufferAttribute(iV, 4));
    inst.setAttribute('iW', new THREE.InstancedBufferAttribute(iW, 4));
    im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; im.userData.noShadow = true;
    trench.add(im);
    debris = im;
  }

  RU.uTrA.value.set(HOOK.rakeFrom[0], HOOK.rakeFrom[2]);
  RU.uTrB.value.set(HOOK.rakeTo[0], HOOK.rakeTo[2]);

  return {
    root, trench,
    update(st) {
      const t = st.t;
      const vis = st.set !== 'orbit' && st.set !== 'abstract';
      root.visible = vis && t >= CUES.bladeHit;
      const q = Math.min(1, Math.max(0, (t - CUES.rakeStart) / (CUES.rakeEnd - CUES.rakeStart)));
      RU.uTrU.value = 0.14 + 0.86 * (1 - Math.pow(1 - q, 1.35));
      RU.uTrAge.value = t - CUES.rakeEnd;
      trench.visible = vis;
      debris.visible = t < CUES.rakeEnd + 6.5;
    },
  };
}

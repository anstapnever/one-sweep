import * as THREE from 'three';
import { paint, hex, mixc, sstep, lerp, finish, merge, gridClosed, gridOpen, limb, tube, ell, deform, torus, v3, V3 } from './capy-geo.js';
import { celMat, furMat, CU } from './capy-mat.js';
import { Rng, mulberry32, clamp, smooth, invLerp } from './util.js';

// Props: broom (ash handle, red-brown cord binding, CPU straw bundles that bend and drag on the tile), tin dustpan, the citrus.
// Broom local frame: origin at the bristle tips' rest level, +Y up the handle.

export const BROOM = { len: 1.55, rootY: 0.30, bindTop: 0.385, bindBot: 0.245, strandL: 0.31 };
const STRAW = [hex('#c9ac66'), hex('#ae8b48'), hex('#d8c28c'), hex('#927239')];

export function buildBroom(ctx, mk, grp, parent) {
  const pivot = grp(parent, 0, 0, 0, 'broom');
  // handle: slight taper, a rounded top, a hanging loop hole
  {
    const y0 = BROOM.bindBot + 0.02, L = BROOM.len - y0;
    const g = limb(L, (t) => lerp(0.0178, 0.0205, 1 - t), { seg: 14, rows: 24, cap: 0.012 });
    g.rotateX(Math.PI); g.translate(0, y0, 0);
    paint(g, (p) => mixc(hex('#b99d73'), hex('#937a56'), sstep(BROOM.bindBot, BROOM.len, p.y) * 0.25));
    finish(g);
    mk(g, celMat(4, { id: 57 }), pivot, 'handle', false);
  }
  // binding: a fat lashed bundle of straw under the cord, the cord wound in a helix on top
  {
    const c = (y) => {
      const t = (y - BROOM.bindBot) / (BROOM.bindTop - BROOM.bindBot);
      return lerp(0.067, 0.03, smooth(t)) + 0.006 * Math.sin(t * 22);
    };
    const g = gridClosed(26, 22, (iu, iv, u, v, out) => {
      const a = u * Math.PI * 2, y = lerp(BROOM.bindBot - 0.01, BROOM.bindTop, v);
      const r = c(Math.min(BROOM.bindTop, Math.max(BROOM.bindBot, y)));
      out.set(Math.sin(a) * r, y, Math.cos(a) * r);
    });
    paint(g, (p) => hex('#ae8e50')); finish(g);
    mk(g, celMat(5, { id: 58 }), pivot, 'bundle', false);
    // cord: a helix
    const pts = [];
    const N = 340;
    for (let i = 0; i <= N; i++) {
      const s = i / N, turns = 14;
      const y = lerp(BROOM.bindBot + 0.005, BROOM.bindTop - 0.012, s);
      const a = s * Math.PI * 2 * turns;
      const r = c(y) + 0.0048;
      pts.push(new V3(Math.sin(a) * r, y, Math.cos(a) * r));
    }
    const cord = tube(pts, () => 0.0048, 6, 340);
    paint(cord, (p) => hex('#8a4628')); finish(cord);
    mk(cord, celMat(5, { id: 59, side: THREE.DoubleSide }), pivot, 'cord', false);
    // a second band at the very top and a loose cord end
    const top = torus(0.033, 0.0055, 8, 24); top.rotateX(Math.PI / 2); top.translate(0, BROOM.bindTop + 0.002, 0);
    const end1 = tube([v3(0.03, BROOM.bindTop - 0.02, 0.012), v3(0.05, BROOM.bindTop - 0.05, 0.02), v3(0.055, BROOM.bindTop - 0.09, 0.012)], (t) => 0.0043 * (1 - t * 0.6), 5, 8);
    const g3 = merge([top, end1]); paint(g3, () => hex('#7a3b22')); finish(g3);
    mk(g3, celMat(5, { id: 59 }), pivot, 'cordTop', false);
  }
  return pivot;
}

// Straw bundles. Each strand is a bent ribbon recomputed in world space every drawing: it starts on the binding, ends on the tile,
// and is dragged opposite to the motion. Never below the floor.
export class Bristles {
  constructor(ctx, scene, N = 680) {
    this.N = N;
    this.R = 6;      // rings per strand
    this.S = 3;      // verts per ring
    const VN = N * this.R * this.S;
    const pos = new Float32Array(VN * 3), nor = new Float32Array(VN * 3), col = new Float32Array(VN * 3);
    const rest = new Float32Array(VN * 3), fold = new Float32Array(VN), w = new Float32Array(VN), mask = new Float32Array(VN), uv = new Float32Array(VN * 2);
    const idx = new Uint32Array(N * (this.R - 1) * this.S * 6);
    const rng = new Rng(4711);
    const data = this.data = [];
    // bundles: strand tips cluster, so the broom head reads as clumps not a smooth skirt
    const nB = 42;
    const bundles = [];
    for (let i = 0; i < nB; i++) { const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * 0.098; bundles.push([a, r, rng.range(0.9, 1.08), rng.range(-0.03, 0.03)]); }
    let ix = 0;
    for (let i = 0; i < N; i++) {
      const b = bundles[i % nB];
      const a0 = b[0] + rng.range(-0.22, 0.22);
      const r0 = 0.012 + (b[1] / 0.098) * 0.033 + rng.range(-0.004, 0.004);
      const r1 = b[1] * rng.range(0.9, 1.16) + rng.range(-0.012, 0.012) + 0.02;
      const a1 = b[0] + rng.range(-0.1, 0.1);
      const L = BROOM.strandL * b[2] * rng.range(0.93, 1.05);
      const root = v3(Math.sin(a0) * r0, BROOM.rootY + rng.range(-0.01, 0.01), Math.cos(a0) * r0);
      const tip = v3(Math.sin(a1) * r1, BROOM.rootY - L, Math.cos(a1) * r1);
      data.push({ root, tip, L, rad: rng.range(0.0028, 0.0042), stiff: rng.range(0.75, 1.25), stumpL: rng.range(0.04, 0.11), jit: rng.next() });
      const c = STRAW[Math.floor(rng.next() * STRAW.length)];
      for (let r = 0; r < this.R; r++) for (let s = 0; s < this.S; s++) {
        const q = (i * this.R + r) * this.S + s;
        const k = r / (this.R - 1);
        col[q * 3] = c[0] * (0.82 + 0.26 * k); col[q * 3 + 1] = c[1] * (0.8 + 0.25 * k); col[q * 3 + 2] = c[2] * (0.76 + 0.26 * k);
      }
      for (let r = 0; r < this.R - 1; r++) for (let s = 0; s < this.S; s++) {
        const a = (i * this.R + r) * this.S + s, b2 = (i * this.R + r) * this.S + (s + 1) % this.S;
        const c2 = (i * this.R + r + 1) * this.S + (s + 1) % this.S, d = (i * this.R + r + 1) * this.S + s;
        idx[ix++] = a; idx[ix++] = b2; idx[ix++] = c2; idx[ix++] = a; idx[ix++] = c2; idx[ix++] = d;
      }
    }
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aRest', new THREE.BufferAttribute(rest, 3));
    g.setAttribute('aFold', new THREE.BufferAttribute(fold, 1));
    g.setAttribute('aMask', new THREE.BufferAttribute(mask, 1));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = this.mesh = new THREE.Mesh(g, celMat(5, { id: 151, side: THREE.DoubleSide, soot: 1 }));
    m.frustumCulled = false; m.name = 'capy.bristles';
    scene.add(m);
    this.m = new THREE.Matrix4();
  }
  // M: broom world matrix; vel: world velocity of the head (m/s); wind: extra world bend; sootK unused; stump 0..1; g: ground height; lift: raises the strand stiffness state
  update(M, vel, wind, stump, g = 0, flare = 0) {
    const pos = this.geo.attributes.position.array, nor = this.geo.attributes.normal.array;
    const R = this.R, S = this.S;
    const root = new V3(), tip = new V3(), c1 = new V3(), a = new V3(), b = new V3(), p = new V3(), tn = new V3(), rd = new V3();
    const speed = Math.min(2.4, vel.length());
    // the drag direction is opposite to the motion, on the tile plane
    const dr = v3(-vel.x, 0, -vel.z);
    const dl = dr.length() || 1;
    dr.multiplyScalar(1 / dl);
    const dragA = Math.min(0.32, speed * 0.3);
    for (let i = 0; i < this.N; i++) {
      const d = this.data[i];
      const L = d.L * (1 - stump) + d.stumpL * stump;
      root.copy(d.root).applyMatrix4(M);
      // rest tip: scaled along the strand towards the root for the stump state
      tip.copy(d.root).lerp(d.tip, L / d.L).applyMatrix4(M);
      // wind lean + travel drag + a shimmer at the ends
      const k = d.stiff * (L / BROOM.strandL);
      tip.x += (dr.x * dragA + wind.x) * L * k * (0.75 + 0.5 * d.jit);
      tip.z += (dr.z * dragA + wind.z) * L * k * (0.75 + 0.5 * d.jit);
      tip.y += wind.y * L * k + flare * L * k;
      // on the tile: tip slides along the ground, keeping the strand's length
      let onFloor = false;
      if (tip.y < g + 0.0015) {
        onFloor = true;
        const h = root.y - g;
        const hr = h < L * 0.98 ? Math.sqrt(Math.max(0.0, L * L - h * h)) : 0.0;
        const hx = tip.x - root.x, hz = tip.z - root.z, hl = Math.hypot(hx, hz) || 1;
        // bend mostly the way it was going, then along the drag
        const lx = (hx / hl) * 0.55 + dr.x * 0.8, lz = (hz / hl) * 0.55 + dr.z * 0.8, ll = Math.hypot(lx, lz) || 1;
        tip.x = root.x + (lx / ll) * hr; tip.z = root.z + (lz / ll) * hr;
        tip.y = g + 0.0012;
      }
      // control point: stays along the strand's root tangent, bowed out when bent
      c1.copy(d.root).lerp(d.tip, 0.5 * (L / d.L)).applyMatrix4(M);
      if (onFloor) { c1.y = Math.max(c1.y, g + (root.y - g) * 0.38); c1.lerp(tip, 0.12); }
      for (let r = 0; r < R; r++) {
        const u = r / (R - 1);
        const v = 1 - u;
        // quadratic bezier root -> c1 -> tip
        p.set(v * v * root.x + 2 * v * u * c1.x + u * u * tip.x, v * v * root.y + 2 * v * u * c1.y + u * u * tip.y, v * v * root.z + 2 * v * u * c1.z + u * u * tip.z);
        // tangent
        tn.set(2 * v * (c1.x - root.x) + 2 * u * (tip.x - c1.x), 2 * v * (c1.y - root.y) + 2 * u * (tip.y - c1.y), 2 * v * (c1.z - root.z) + 2 * u * (tip.z - c1.z)).normalize();
        a.set(tn.y, -tn.x, 0); if (a.lengthSq() < 1e-3) a.set(1, 0, 0);
        a.normalize();
        b.crossVectors(tn, a).normalize();
        const rr = d.rad * (1 - 0.82 * u * u);
        for (let s = 0; s < S; s++) {
          const ang = (s / S) * Math.PI * 2;
          rd.copy(a).multiplyScalar(Math.cos(ang)).addScaledVector(b, Math.sin(ang));
          const q = ((i * R + r) * S + s) * 3;
          pos[q] = p.x + rd.x * rr; pos[q + 1] = p.y + rd.y * rr; pos[q + 2] = p.z + rd.z * rr;
          nor[q] = rd.x; nor[q + 1] = rd.y; nor[q + 2] = rd.z;
        }
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
    this.geo.computeBoundingSphere();
  }
}

export function buildDustpan(mk, grp, parent) {
  const piv = grp(parent, 0, 0, 0, 'panP');
  // flat dented pan, three low walls, a short handle with a hanging hole: pan plane faces outward (+X in the pivot), bottom towards -Y
  const W = 0.095, H = 0.17;
  const g = gridOpen(16, 16, (iu, iv, u, v, out) => {
    const x = (u - 0.5) * 2 * W;
    const y = -0.075 - v * H;
    const dent = 0.0025 * Math.sin(x * 60) * Math.cos(y * 80);
    out.set(0.012 + dent + 0.006 * Math.pow(Math.abs(u - 0.5) * 2, 3), y, x);
  });
  const side = (a, b, h) => tube([a, b], () => 0.002, 4, 4);
  void side;
  const walls = [];
  for (const s of [1, -1]) {
    walls.push(gridOpen(10, 2, (iu, iv, u, v, out) => {
      const yy = -0.075 - u * H;
      out.set(0.012 + v * 0.028, yy, s * W);
    }));
  }
  walls.push(gridOpen(10, 2, (iu, iv, u, v, out) => { out.set(0.012 + v * 0.028, -0.075 - H, (u - 0.5) * 2 * W); }));
  const rim = tube([v3(0.04, -0.075, W), v3(0.04, -0.075 - H, W), v3(0.04, -0.075 - H, -W), v3(0.04, -0.075, -W)], () => 0.0024, 5, 24);
  const handle = tube([v3(0.012, -0.075, 0), v3(0.014, -0.04, 0), v3(0.014, -0.012, 0.002)], (t) => 0.0052 * (1.1 - 0.2 * t), 6, 8);
  const hook = torus(0.012, 0.003, 6, 14); hook.rotateY(Math.PI / 2); hook.translate(0.016, 0.006, 0.002);
  const all = merge([g, ...walls, rim, handle, hook]);
  paint(all, (p, n) => mixc(hex('#a8b0a8'), hex('#7d847e'), sstep(-0.12, -0.25, p.y) * 0.5));
  finish(all);
  mk(all, celMat(6, { id: 44, side: THREE.DoubleSide, soot: 1 }), piv, 'dustpan', false);
  return piv;
}

export function buildCitrus(mk, grp, parent) {
  const piv = grp(parent, 0, 0, 0, 'citrusP');
  const R = 0.036;
  const g = new THREE.SphereGeometry(1, 28, 20);
  deform(g, (v) => { const y = v.y; v.x *= 1 + 0.06 * (1 - y * y); v.z *= 1 + 0.06 * (1 - y * y); v.multiplyScalar(R); v.x *= 1.02; v.y *= 0.94; });
  const dim = new Rng(77);
  const dots = [];
  for (let i = 0; i < 90; i++) { const a = dim.range(0, 6.28), yy = dim.range(-0.9, 0.9), r = Math.sqrt(1 - yy * yy); dots.push(v3(Math.cos(a) * r, yy, Math.sin(a) * r)); }
  paint(g, (p, n) => {
    const nn = p.clone().normalize();
    let spot = 0;
    for (const d of dots) if (nn.distanceTo(d) < 0.07) { spot = 1; break; }
    const base = mixc(hex('#cfd63e'), hex('#9fbe3a'), sstep(0.15, -0.5, p.y / R) * 0.8);
    return spot ? mixc(base, hex('#8aa532'), 0.6) : base;
  });
  finish(g);
  const lemon = mk(g, celMat(5, { id: 52, gloss: 0.7 }), piv, 'citrus', true);
  // stem nub and one leaf
  const st = tube([v3(0, R * 0.92, 0), v3(0.002, R * 1.25, 0.002), v3(0.006, R * 1.45, 0.004)], (t) => 0.0035 * (1 - 0.3 * t), 6, 6);
  paint(st, () => hex('#6b5a2c')); finish(st);
  mk(st, celMat(5, { id: 53 }), piv, 'stem', false);
  const leaf = leafBlade(0.05, 0.022);
  leaf.rotateZ(-0.9); leaf.rotateX(0.55); leaf.translate(0.004, R * 1.3, 0.003);
  paint(leaf, (p, n) => (Math.abs(p.z * 0 + p.x * 0.6 + p.y * 0.8 - 0.02) < 0.0012 ? hex('#5e8a3a') : hex('#7fab46')));
  finish(leaf);
  mk(leaf, celMat(5, { id: 54, side: THREE.DoubleSide }), piv, 'citrusLeaf', false);
  return { piv, R };
}

// a leaf: pointed oval, with a folded midrib; lies in the XY plane, tip +Y, root at origin
export function leafBlade(L, w, bend = 0.0) {
  const P = [], I = [];
  const n = 8;
  for (let j = 0; j <= n; j++) {
    const t = j / n, hw = w * Math.sin(Math.pow(t, 0.8) * Math.PI) * (1 - 0.12 * t);
    const y = t * L;
    const zFold = bend * t * t;
    P.push(-hw, y, Math.abs(hw) * 0.3 + zFold, 0, y, zFold, hw, y, Math.abs(hw) * 0.3 + zFold);
  }
  for (let j = 0; j < n; j++) {
    const a = j * 3;
    I.push(a, a + 1, a + 4, a, a + 4, a + 3, a + 1, a + 2, a + 5, a + 1, a + 5, a + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I); g.computeVertexNormals();
  return g;
}

// the leaf pile as one CPU mesh (world space), positions pure functions of time, from capy-pile
export class LeafMesh {
  constructor(scene, count, name, seed) {
    this.count = count;
    const blade = leafBlade(0.075, 0.03, 0.01);
    const bp = blade.attributes.position, bi = blade.index;
    const vN = bp.count, iN = bi.count;
    this.vN = vN;
    this.restP = Float32Array.from(bp.array);
    const pos = new Float32Array(count * vN * 3), nor = new Float32Array(count * vN * 3), col = new Float32Array(count * vN * 3);
    const rest = new Float32Array(count * vN * 3);
    for (let i = 0; i < count; i++) for (let v = 0; v < vN; v++) rest[(i * vN + v) * 3] = (v % 3) - 1;
    const fold = new Float32Array(count * vN), mask = new Float32Array(count * vN), uv = new Float32Array(count * vN * 2);
    const idx = new Uint32Array(count * iN);
    const rng = new Rng(seed);
    const pal = [hex('#a9913f'), hex('#b67b36'), hex('#8b8a3e'), hex('#c2a24b'), hex('#8a5a30'), hex('#788c40'), hex('#9c6a34')];
    for (let i = 0; i < count; i++) {
      const c = pal[Math.floor(rng.next() * pal.length)];
      const sh = rng.range(0.85, 1.1);
      for (let v = 0; v < vN; v++) { const q = i * vN + v; col[q * 3] = c[0] * sh; col[q * 3 + 1] = c[1] * sh; col[q * 3 + 2] = c[2] * sh; }
      for (let j = 0; j < iN; j++) idx[i * iN + j] = i * vN + bi.getX(j);
    }
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aRest', new THREE.BufferAttribute(rest, 3));
    g.setAttribute('aFold', new THREE.BufferAttribute(fold, 1));
    g.setAttribute('aMask', new THREE.BufferAttribute(mask, 1));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mesh = new THREE.Mesh(g, celMat(7, { id: 102, side: THREE.DoubleSide, soot: 0 }));
    this.mesh.frustumCulled = false; this.mesh.name = name;
    scene.add(this.mesh);
    this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v = new V3(); this.n = new V3();
  }
  // set leaf i from pos [x,y,z], euler [rx,ry,rz], scale s (0 hides)
  set(i, x, y, z, rx, ry, rz, s) {
    const { restP, vN, v, n, q, e } = this;
    const pos = this.geo.attributes.position.array, nor = this.geo.attributes.normal.array;
    e.set(rx, ry, rz); q.setFromEuler(e);
    for (let k = 0; k < vN; k++) {
      v.set(restP[k * 3] * s, restP[k * 3 + 1] * s, restP[k * 3 + 2] * s).applyQuaternion(q);
      const a = (i * vN + k) * 3;
      pos[a] = x + v.x; pos[a + 1] = y + v.y; pos[a + 2] = z + v.z;
    }
    n.set(0, 0, 1).applyQuaternion(q);
    for (let k = 0; k < vN; k++) { const a = (i * vN + k) * 3; nor[a] = n.x; nor[a + 1] = n.y; nor[a + 2] = n.z; }
  }
  commit() { this.geo.attributes.position.needsUpdate = true; this.geo.attributes.normal.needsUpdate = true; }
}

// Cartoon dust: flat lumpy blobs, CPU merged in world space. set(i, x, y, z, r); r <= 0 hides.
export class DustBlobs {
  constructor(scene, count = 48) {
    this.count = count;
    const ico = new THREE.IcosahedronGeometry(1, 3);
    const bp = ico.attributes.position;
    const rng = new Rng(2024);
    this.unit = []; for (let i = 0; i < bp.count; i++) this.unit.push(new V3().fromBufferAttribute(bp, i).normalize());
    const vN = this.vN = bp.count;
    const pos = new Float32Array(count * vN * 3), nor = new Float32Array(count * vN * 3), col = new Float32Array(count * vN * 3);
    const rest = new Float32Array(count * vN * 3), fold = new Float32Array(count * vN), mask = new Float32Array(count * vN), uv = new Float32Array(count * vN * 2);
    this.bump = new Float32Array(count * vN);
    const idx = [];
    const c = hex('#d8c4a4');
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, 6.28), b = rng.range(0, 6.28);
      for (let v = 0; v < vN; v++) {
        const q = i * vN + v, u = this.unit[v];
        this.bump[q] = 1 + 0.13 * Math.sin(u.x * 5.0 + a) * Math.sin(u.y * 4.3 + b) + 0.07 * Math.sin(u.z * 9.0 + a + b);
        fold[q] = u.y + 0.1 * Math.sin(u.x * 7.0 + a);
        col[q * 3] = c[0]; col[q * 3 + 1] = c[1]; col[q * 3 + 2] = c[2];
      }
      for (let t = 0; t < vN; t += 3) idx.push(i * vN + t, i * vN + t + 1, i * vN + t + 2);
    }
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aRest', new THREE.BufferAttribute(rest, 3));
    g.setAttribute('aFold', new THREE.BufferAttribute(fold, 1));
    g.setAttribute('aMask', new THREE.BufferAttribute(mask, 1));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, celMat(8, { id: 39, soot: 0 }));
    this.mesh.frustumCulled = false; this.mesh.name = 'capy.dust';
    scene.add(this.mesh);
  }
  set(i, x, y, z, r) {
    const pos = this.geo.attributes.position.array, nor = this.geo.attributes.normal.array, { vN, unit, bump } = this;
    for (let v = 0; v < vN; v++) {
      const a = (i * vN + v) * 3, u = unit[v], k = Math.max(r, 0) * bump[i * vN + v];
      pos[a] = x + u.x * k; pos[a + 1] = y + u.y * k * 0.82; pos[a + 2] = z + u.z * k;
      nor[a] = u.x * 0.3; nor[a + 1] = 0.9 + u.y * 0.3; nor[a + 2] = u.z * 0.3;
    }
  }
  commit() { this.geo.attributes.position.needsUpdate = true; this.geo.attributes.normal.needsUpdate = true; }
}

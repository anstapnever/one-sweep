import * as THREE from 'three';
import { paint, hex, mixc, sstep, lerp, finish, merge, gridClosed, gridOpen, limb, tube, ell, deform, meshSDF, sdBoxR, sdEll, sdRoundCone, smin, smax, lock, torus, v3, V3 } from './capy-geo.js';
import { furMat, celMat, CU } from './capy-mat.js';
import { buildHead, HEAD } from './capy-head.js';

// The sweeper: a heavy barrel in overalls. Pivot hierarchy for bones; torso, overalls shell, belt and straps are deformed on the CPU between hips and chest (two-bone skin).
// Frames: hips is the character root in world; +Z forward, +X the character's left. Everything in metres. Height to top of head 1.15.

export const DIM = {
  hip: 0.40,            // standing pelvis height (origin of the hips frame)
  hipJoint: [0.128, -0.075, 0.0],
  thigh: 0.15,
  shin: 0.125,
  footH: 0.095,
  ballZ: 0.075,
  heelZ: -0.078,
  chestY: 0.12,
  shoulder: [0.243, 0.255, 0.02],
  upper: 0.205,
  fore: 0.185,
  neckY: 0.255, neckZ: 0.035,
  headOff: [0, 0.125, 0.19], headS: 1.22,
  handGrip: [0, -0.068, 0.044],     // handle centre in the wrist frame (X along the handle)
  handleR: 0.019,
};

const COL = {
  base: hex('#8a5f46'), dark: hex('#573b2e'), light: hex('#b89174'),
  sage: hex('#7a9480'), sageD: hex('#617868'), sageL: hex('#90a892'), patch: hex('#b49c70'), patch2: hex('#6c8474'),
  stitch: hex('#f0e8ce'), canvas: hex('#9a8c70'), canvasD: hex('#7f735c'), belt: hex('#553a28'),
  boot: hex('#4c5636'), bootD: hex('#343c29'), bootL: hex('#6c7650'), brass: hex('#caa24c'), rag: hex('#bb4d3c'),
};

// ------------------------------------------------------------------ torso sculpt
const TBL = [ // y, a, bF, bB
  [-0.180, 0.030, 0.030, 0.030], [-0.165, 0.130, 0.120, 0.130], [-0.105, 0.232, 0.200, 0.225], [-0.020, 0.268, 0.238, 0.256],
  [0.100, 0.284, 0.268, 0.258], [0.220, 0.276, 0.256, 0.238], [0.310, 0.256, 0.226, 0.218], [0.385, 0.214, 0.178, 0.190],
  [0.440, 0.158, 0.130, 0.148], [0.482, 0.106, 0.092, 0.110], [0.510, 0.052, 0.052, 0.054],
];
function secAt(y) {
  const T = TBL, n = T.length;
  if (y <= T[0][0]) return [T[0][1], T[0][2], T[0][3]];
  if (y >= T[n - 1][0]) return [T[n - 1][1], T[n - 1][2], T[n - 1][3]];
  let i = 0; while (y > T[i + 1][0]) i++;
  const p0 = T[Math.max(0, i - 1)], p1 = T[i], p2 = T[i + 1], p3 = T[Math.min(n - 1, i + 2)];
  const t = (y - p1[0]) / (p2[0] - p1[0]);
  const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  return [cr(p0[1], p1[1], p2[1], p3[1]), cr(p0[2], p1[2], p2[2], p3[2]), cr(p0[3], p1[3], p2[3], p3[3])];
}
const spow = (x, p) => Math.sign(x) * Math.pow(Math.abs(x), p);
const EXP = 0.9;  // superellipse: slightly boxy barrel
// surface point: th 0 = front (+Z), +pi/2 = left (+X). off = outward offset in metres.
export function torsoAt(th, y, off, out = new V3()) {
  const [a, bF, bB] = secAt(y);
  const b = Math.cos(th) >= 0 ? bF : bB;
  const sx = Math.sin(th), cz = Math.cos(th);
  const x = a * spow(sx, EXP), z = b * spow(cz, EXP);
  const nx = x / (a * a), nz = z / (b * b), l = Math.hypot(nx, nz) || 1;
  return out.set(x + nx / l * off, y, z + nz / l * off);
}
// spine weight: 0 follows the hips, 1 follows the chest
const spineW = (y) => sstep(-0.02, 0.22, y);

// ------------------------------------------------------------------ the deforming skin (CPU, in the hips frame)
class SkinGroup {
  constructor() { this.items = []; }
  add(mesh, belly) {
    const g = mesh.geometry;
    const p = g.attributes.position;
    const rest = new Float32Array(p.array), n = new Float32Array(g.attributes.normal.array);
    const w = new Float32Array(p.count), bel = new Float32Array(p.count), strap = g.attributes.aW ? new Float32Array(g.attributes.aW.array) : new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      const y = rest[i * 3 + 1], z = rest[i * 3 + 2];
      w[i] = spineW(y);
      bel[i] = (belly ?? 1) * sstep(-0.05, 0.08, z / 0.28 - 0.1) * sstep(0.28, 0.05, y) * sstep(-0.13, -0.02, y);
    }
    mesh.frustumCulled = false;
    this.items.push({ mesh, rest, n, w, bel, strap });
  }
  update(mChest, belly, bellyY, breath, strapV, strapL) {
    // mChest maps the bind pose of the upper body to its current place, in the hips frame
    const e = mChest.elements;
    for (const it of this.items) {
      const P = it.mesh.geometry.attributes.position, Nn = it.mesh.geometry.attributes.normal, a = P.array, na = Nn.array;
      const { rest, n, w, bel, strap } = it;
      for (let i = 0, N = P.count; i < N; i++) {
        const ix = i * 3;
        let x = rest[ix], y = rest[ix + 1], z = rest[ix + 2];
        const nx = n[ix], ny = n[ix + 1], nz = n[ix + 2];
        // breath: ribs and belly expand
        const r = w[i] * (1 - sstep(0.28, 0.5, y));
        const br = breath * (0.009 * r + 0.013 * bel[i]);
        x += nx * br; y += ny * br * 0.4; z += nz * br;
        const b = bel[i];
        if (b > 0) { z += belly * b; y += bellyY * b; }
        const s = strap[i];
        if (s > 0) { x += strapV.x * s; y += strapV.y * s; z += strapV.z * s; }
        const W = w[i];
        if (W <= 0.001) { a[ix] = x; a[ix + 1] = y; a[ix + 2] = z; na[ix] = nx; na[ix + 1] = ny; na[ix + 2] = nz; continue; }
        const X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14];
        a[ix] = x + (X - x) * W; a[ix + 1] = y + (Y - y) * W; a[ix + 2] = z + (Z - z) * W;
        const NX = e[0] * nx + e[4] * ny + e[8] * nz, NY = e[1] * nx + e[5] * ny + e[9] * nz, NZ = e[2] * nx + e[6] * ny + e[10] * nz;
        let qx = nx + (NX - nx) * W, qy = ny + (NY - ny) * W, qz = nz + (NZ - nz) * W;
        const l = Math.hypot(qx, qy, qz) || 1;
        na[ix] = qx / l; na[ix + 1] = qy / l; na[ix + 2] = qz / l;
      }
      P.needsUpdate = true; Nn.needsUpdate = true;
    }
  }
}

// ------------------------------------------------------------------ IK
const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _e = new V3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const NEG_Y = new V3(0, -1, 0);
function ik2(parent, upper, lower, target, pole, a, b, flipZ) {
  parent.updateWorldMatrix(true, false);
  const T = parent.worldToLocal(_a.copy(target));
  const Pl = parent.worldToLocal(_b.copy(pole));
  const Sp = upper.position;
  const d = _c.copy(T).sub(Sp);
  let dist = Math.min(Math.max(d.length(), Math.abs(a - b) + 1e-3), (a + b) * 0.9995);
  const dir = d.normalize();
  const pn = _d.copy(Pl).sub(Sp); pn.addScaledVector(dir, -pn.dot(dir)).normalize();
  const cosA = (a * a + dist * dist - b * b) / (2 * a * dist);
  const A = Math.acos(Math.min(1, Math.max(-1, cosA)));
  const u = _e.copy(dir).multiplyScalar(Math.cos(A)).addScaledVector(pn, Math.sin(A));
  const yA = u.clone().negate();
  const zA = pn.clone().multiplyScalar(flipZ ? -1 : 1); zA.addScaledVector(yA, -zA.dot(yA)).normalize();
  const xA = new V3().crossVectors(yA, zA);
  _m.makeBasis(xA, yA, zA);
  upper.quaternion.setFromRotationMatrix(_m);
  const K = Sp.clone().addScaledVector(u, a);
  const Tend = Sp.clone().addScaledVector(dir, dist);
  const w = Tend.clone().sub(K).normalize();
  _q.copy(upper.quaternion).invert();
  w.applyQuaternion(_q);
  lower.quaternion.setFromUnitVectors(NEG_Y, w);
  return dist < (a + b) * 0.995;
}

// ------------------------------------------------------------------ builder
export function buildBody(ctx, mk, grp) {
  const root = new THREE.Group(); root.name = 'capy';
  const hips = grp(root, 0, DIM.hip, 0, 'hips');
  const chest = grp(hips, 0, DIM.chestY, 0, 'chest');
  const neck = grp(chest, 0, DIM.neckY, DIM.neckZ, 'neck');
  const head = grp(neck, ...DIM.headOff, 'head');
  head.scale.setScalar(DIM.headS);
  const skin = new SkinGroup();

  const sage = celMat(1, { id: 46 }), sage2 = celMat(1, { id: 47 });
  const fur = furMat({ id: 40 }), furArm = furMat({ id: 40 });

  // ---- torso fur (only the bare parts show above the overalls)
  {
    const nu = 76, nv = 58;
    const g = gridClosed(nu, nv, (iu, iv, u, v, out) => {
      const y = lerp(-0.18, 0.51, Math.pow(v, 1.0));
      torsoAt(u * Math.PI * 2, y, 0, out);
    });
    paint(g, (p) => {
      const back = sstep(0.06, -0.14, p.z / 0.25 + 0.0);
      const c = mixc(COL.base, COL.dark, back * 0.8);
      return mixc(c, COL.light, sstep(0.08, 0.2, p.z / 0.25) * sstep(0.26, 0.05, p.y) * 0.75);
    });
    finish(g);
    skin.add(mk(g, fur, hips, 'torso', false), 1);
  }

  // ---- overalls shell: waist-high at the sides, bib in front, a back panel behind
  const thB = 0.62, thB2 = 0.82;
  const bibTop = 0.335, waist = 0.1;
  const backTop = 0.30, thBk = 0.42, thBk2 = 0.62;
  const yTop = (th) => {
    let a = Math.atan2(Math.sin(th), Math.cos(th));
    const f = 1 - sstep(thB, thB2, Math.abs(a));
    const b = 1 - sstep(thBk, thBk2, Math.PI - Math.abs(a));
    const cur = waist + (bibTop - waist) * f + (backTop - waist) * b;
    return cur + 0.012 * Math.cos(a * 1.0) * 0.0;
  };
  // fold field for the shell: drag lines from the waist, gathers towards the legs, side creases
  const shellFold = (th, y) => {
    let f = 0;
    f += 0.8 * Math.sin(th * 9 + 2.1 * Math.sin(th * 2.3)) * sstep(0.0, -0.15, y);
    f += 0.5 * Math.sin(y * 60 + th * 2.6) * sstep(0.1, 0.0, y) * sstep(0.04, 0.0, Math.abs(y - 0.05) - 0.08);
    f += 0.45 * Math.sin(th * 4 + y * 22) * sstep(0.24, 0.18, y) * sstep(0.0, 0.04, y);
    f += 0.5 * Math.sin(th * 17 + 1.1) * sstep(0.12, 0.2, y) * (1 - sstep(0.26, 0.34, y));
    return f;
  };
  const OFF = 0.012;
  const shellPts = new V3(); const shellN = 150, shellV = 40;
  const S = (th, y, off, out) => torsoAt(th, y, off, out);
  {
    const g = gridClosed(shellN, shellV, (iu, iv, u, v, out) => {
      const th = u * Math.PI * 2;
      const top = yTop(th);
      const y = lerp(-0.172, top, v);
      const f = shellFold(th, y);
      S(th, y, OFF + 0.0075 * f, out);
    }, { capEnd: false });
    const fold = new Float32Array(g.attributes.position.count);
    {
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        fold[i] = shellFold(Math.atan2(x, z), y);
      }
    }
    paint(g, (p) => mixc(COL.sage, COL.sageD, sstep(0.0, -0.25, p.z / 0.25) * 0.18));
    g.setAttribute('aFold', new THREE.BufferAttribute(fold, 1));
    finish(g);
    skin.add(mk(g, sage, hips, 'shell', false), 1);
  }
  // top rim (a real cloth edge) + stitches along it
  {
    const rims = [], st = [];
    const pts = [], M = 220;
    for (let i = 0; i <= M; i++) { const th = (i / M) * Math.PI * 2; pts.push(S(th, yTop(th) + 0.0015, OFF + 0.004, new V3())); }
    rims.push(tube(pts.slice(0, -1), () => 0.0058, 6, 300, true));
    // stitches: dashes along the rim, 1 cm below it, only where the edge is roughly level or the bib sides
    for (let i = 0; i < 150; i++) {
      const th = (i / 150) * Math.PI * 2;
      const y = yTop(th) - 0.012;
      if (Math.abs(((th + Math.PI) % (Math.PI * 2)) - Math.PI) < 0 ) continue;
      const a = S(th - 0.009, y, OFF + 0.0065, new V3()), b = S(th + 0.009, y, OFF + 0.0065, new V3());
      st.push(tube([a, a.clone().lerp(b, 0.5), b], () => 0.0013, 4, 3));
    }
    const rg = merge(rims); paint(rg, () => COL.sageD); finish(rg);
    skin.add(mk(rg, sage2, hips, 'rim', false), 1);
    const sg = merge(st); paint(sg, () => COL.stitch); finish(sg);
    skin.add(mk(sg, celMat(5, { id: 120 }), hips, 'stitches', false), 1);
  }
  // pocket on the bib, its stitches and the rag
  let ragPivot = null;
  {
    const yC = 0.215, h = 0.058, th0 = 0.0, wTh = 0.38;
    const g = gridOpen(20, 16, (iu, iv, u, v, out) => {
      const th = th0 + (u - 0.5) * wTh, y = yC + (v - 0.5) * h * 2;
      const round = 0.003 * Math.sin(u * Math.PI);
      S(th, y, OFF + 0.0065 + round, out);
    });
    paint(g, () => COL.sageL); finish(g);
    skin.add(mk(g, celMat(1, { id: 47, side: THREE.DoubleSide }), hips, 'pocket', false), 1);
    // pocket stitching and a dark mouth line
    const st = [];
    for (let i = 0; i < 44; i++) {
      const u = i / 44, per = 2 * (wTh * 0.27 + h * 2);
      const on = (s) => { // walk the rectangle, inset
        const w = wTh * 0.5 - 0.022, hh = h - 0.008;
        const q = s * 4;
        if (q < 1) return [th0 - w, yC - hh + q * 2 * hh];
        if (q < 2) return [th0 - w + (q - 1) * 2 * w, yC + hh];
        if (q < 3) return [th0 + w, yC + hh - (q - 2) * 2 * hh];
        return [th0 + w - (q - 3) * 2 * w, yC - hh];
      };
      const [t0, y0] = on(u), [t1, y1] = on(u + 0.008);
      const a = S(t0, y0, OFF + 0.0098, new V3()), b = S(t1, y1, OFF + 0.0098, new V3());
      st.push(tube([a, a.clone().lerp(b, 0.5), b], () => 0.0012, 4, 2));
      void per;
    }
    const sg = merge(st); paint(sg, () => COL.stitch); finish(sg);
    skin.add(mk(sg, celMat(5, { id: 120 }), hips, 'stitch2', false), 1);
    // rag: a floppy red cloth corner poking out of the pocket
    const mouth = S(th0 + 0.04, yC + h - 0.002, OFF + 0.015, new V3());
    ragPivot = grp(hips, mouth.x, mouth.y, mouth.z, 'ragP');
    const rg = gridOpen(10, 12, (iu, iv, u, v, out) => {
      const w = 0.06 * (1 - v * 0.7);
      const x = (u - 0.5) * 2 * w + Math.sin(v * 2.4) * 0.018;
      const y = v * 0.075;
      const z = 0.012 * Math.sin(v * 3.1) + 0.012 * Math.sin(u * 7 + v * 5);
      out.set(x + 0.012 * Math.sin(u * 6.28 + v * 3), y + 0.012 * Math.sin(u * 9) * (1 - v), z);
    });
    deform(rg, () => {});
    paint(rg, (p) => mixc(COL.rag, hex('#8a3029'), sstep(0.0, 0.06, -p.z + 0.02) * 0.6));
    finish(rg);
    mk(rg, celMat(1, { id: 51, side: THREE.DoubleSide }), ragPivot, 'rag', false);
  }
  // straps: from the bib corners over the shoulders to the back panel, with spring weight along the free part
  const buckles = [];
  {
    const list = [];
    for (const s of [1, -1]) {
      const way = [
        [s * 0.30, 0.315], [s * 0.33, 0.37], [s * 0.42, 0.435], [s * 0.72, 0.492], [s * 1.25, 0.49], [s * 2.1, 0.43], [s * 2.55, 0.36], [s * 2.78, 0.3],
      ];
      const nS = 36;
      const curveTh = new THREE.CatmullRomCurve3(way.map(([t, y]) => new V3(t, y, 0)), false, 'catmullrom', 0.5);
      const g = gridOpen(6, nS, (iu, iv, u, v, out) => {
        const q = curveTh.getPoint(v); const a = curveTh.getPoint(Math.max(0, v - 0.01)), b = curveTh.getPoint(Math.min(1, v + 0.01));
        const dth = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dth * 0.25, dy) || 1;
        const hw = 0.0185 * (1 - 0.1 * Math.sin(v * Math.PI));
        const th = q.x + (dy / l) * (u - 0.5) * 2 * hw * 4, y = q.y - (dth * 0.25 / l) * (u - 0.5) * 2 * hw;
        const bump = 0.0028 * Math.sin(u * Math.PI);
        S(th, y, OFF * 1.1 + 0.005 + bump, out);
      });
      const nF = g.attributes.position.count;
      const w = new Float32Array(nF);
      for (let j = 0; j < nF; j++) { const v = Math.floor(j / 7) / nS; w[j] = Math.sin(v * Math.PI) * 0.8; }
      paint(g, (p, n) => mixc(COL.sageD, COL.sage, 0.3));
      g.setAttribute('aW', new THREE.BufferAttribute(w, 1));
      g.computeVertexNormals();
      finish(g);
      // winding towards outside
      skin.add(mk(g, celMat(1, { id: 52, side: THREE.DoubleSide }), hips, 'strap' + s, false), 1);
      // the buckle at the bib corner
      const c = S(s * 0.31, 0.318, OFF + 0.022, new V3());
      const n = S(s * 0.31, 0.318, 0.1, new V3()).sub(S(s * 0.31, 0.318, 0, new V3())).normalize();
      buckles.push({ c, n, s });
    }
    void list;
  }
  // buckles: rigid to the chest, brass rectangles with a bar
  {
    const parts = [];
    for (const { c, n, s } of buckles) {
      const o = (x, y, z) => c.clone().add(v3(x, y, z));
      // an outer rounded rectangle made of four tubes + a centre bar, and a pin
      const hw = 0.023, hh = 0.03;
      const nn = n.clone();
      const u = v3(0, 1, 0).cross(nn).normalize(), w = nn.clone().cross(u).normalize();
      const P = (a, b) => c.clone().addScaledVector(u, a).addScaledVector(w, b).addScaledVector(nn, 0.002);
      const rect = [P(-hw, -hh), P(hw, -hh), P(hw, hh), P(-hw, hh)];
      for (let k = 0; k < 4; k++) parts.push(tube([rect[k], rect[(k + 1) % 4]], () => 0.0045, 6, 4));
      parts.push(tube([P(-hw, 0), P(hw, 0)], () => 0.0035, 6, 4));
      parts.push(tube([P(0, -hh * 0.2), P(0, hh * 0.9)], () => 0.0028, 6, 4));
      parts.push(new THREE.SphereGeometry(0.0075, 8, 6).translate(rect[0].x, rect[0].y, rect[0].z));
      parts.push(new THREE.SphereGeometry(0.0075, 8, 6).translate(rect[1].x, rect[1].y, rect[1].z));
      parts.push(new THREE.SphereGeometry(0.0075, 8, 6).translate(rect[2].x, rect[2].y, rect[2].z));
      parts.push(new THREE.SphereGeometry(0.0075, 8, 6).translate(rect[3].x, rect[3].y, rect[3].z));
      void o; void s;
    }
    const g = merge(parts); paint(g, () => COL.brass); finish(g);
    // they sit in the hips frame at bind and are skinned with the torso
    skin.add(mk(g, celMat(3, { id: 53 }), hips, 'buckles', false), 0);
  }
  // tool belt: a canvas band at the hips plus an apron panel with pouches
  {
    const bandBot = 0.015, bandTop = 0.095;
    const g = gridClosed(120, 6, (iu, iv, u, v, out) => {
      const th = u * Math.PI * 2;
      const y = lerp(bandBot, bandTop, v);
      S(th, y, 0.028 + 0.002 * Math.sin(v * Math.PI), out);
    }, { capStart: false, capEnd: false });
    paint(g, (p) => COL.belt);
    finish(g);
    skin.add(mk(g, celMat(5, { id: 50 }), hips, 'belt', false), 0.5);
    // belt rivets and a square buckle in front
    const rv = [];
    for (let i = 0; i < 14; i++) {
      const th = (i / 14) * Math.PI * 2 + 0.2;
      const c = S(th, (bandBot + bandTop) / 2, 0.033, new V3());
      rv.push(new THREE.SphereGeometry(0.0065, 8, 6).translate(c.x, c.y, c.z));
    }
    const bg = merge(rv); paint(bg, () => COL.brass); finish(bg);
    skin.add(mk(bg, celMat(3, { id: 53 }), hips, 'rivets', false), 0.5);
    // apron panel: hung off the belt in front, flares a little outward, frayed bottom edge
    const fr = (x) => 0.008 * (Math.sin(x * 61) + 0.6 * Math.sin(x * 137)) ;
    const ag = gridOpen(50, 16, (iu, iv, u, v, out) => {
      const th = (u - 0.5) * 1.5;
      const y = lerp(0.075, -0.165 + fr(th) * (v > 0 ? 1 : 1), v);
      const flare = 0.04 + 0.038 * v * v;
      S(th, y, flare, out);
      out.x += Math.sin(th * 14) * 0.003 * v;
    });
    paint(ag, (p) => mixc(COL.canvas, COL.canvasD, sstep(-0.05, -0.16, p.y) * 0.4));
    const fold = new Float32Array(ag.attributes.position.count);
    for (let i = 0; i < fold.length; i++) { const x = ag.attributes.position.getX(i), y = ag.attributes.position.getY(i); fold[i] = Math.sin(x * 24 + y * 3) * sstep(0.04, -0.1, y); }
    ag.setAttribute('aFold', new THREE.BufferAttribute(fold, 1));
    finish(ag);
    const apronMesh = mk(ag, celMat(1, { id: 55, side: THREE.DoubleSide }), hips, 'apron', false);
    skin.add(apronMesh, 0.4);
    // two pouches sewn on the apron
    const pou = [];
    for (const s of [1, -1]) {
      const p = gridOpen(12, 10, (iu, iv, u, v, out) => {
        const th = s * 0.33 + (u - 0.5) * 0.46;
        const y = lerp(-0.006, -0.09, v);
        S(th, y, 0.052 + 0.03 * Math.sin(v * Math.PI) * Math.sin(u * Math.PI) * 0.5 + 0.038 * (y < -0.05 ? 0.3 : 0), out);
      });
      pou.push(p);
    }
    const pg = merge(pou); paint(pg, () => COL.canvasD); finish(pg);
    skin.add(mk(pg, celMat(1, { id: 56, side: THREE.DoubleSide }), hips, 'pouches', false), 0.4);
    // tool handles poking out of the left pouch: a wooden brush handle and a rag-wrapped stick
    const tl = [];
    tl.push(tube([S(0.26, -0.01, 0.06, new V3()), S(0.24, 0.05, 0.068, new V3())], () => 0.0085, 8, 4));
    tl.push(tube([S(0.42, -0.01, 0.06, new V3()), S(0.45, 0.04, 0.074, new V3())], () => 0.0065, 8, 4));
    const tg = merge(tl); paint(tg, () => hex('#c29660')); finish(tg);
    skin.add(mk(tg, celMat(4, { id: 57 }), hips, 'tools', false), 0.3);
  }

  // ---- legs: baggy overall legs over rubber boots, patched knees, frayed hems
  const legs = {};
  for (const side of [1, -1]) {
    const L = side === 1 ? 'L' : 'R';
    const thigh = grp(hips, side * DIM.hipJoint[0], DIM.hipJoint[1], DIM.hipJoint[2], 'thigh' + L);
    const rTh = (t) => lerp(0.112, 0.092, t);
    const tg = limb(DIM.thigh, rTh, { seg: 26, rows: 18, cap: 0.55,
      folds: (a, t) => 0.003 * Math.sin(a * 5 + 1) * sstep(0.2, 1, t) + 0.0035 * Math.sin(t * 19 + a) * sstep(0.5, 1, t) });
    const foldT = new Float32Array(tg.attributes.position.count);
    { const pp = tg.attributes.position; for (let i = 0; i < foldT.length; i++) { const y = pp.getY(i), x = pp.getX(i), z = pp.getZ(i); foldT[i] = Math.sin(Math.atan2(x, z) * 5 + 1) * sstep(-0.05, -0.15, y) + Math.sin(-y * 62 + Math.atan2(x, z)) * 0.5 * sstep(-0.08, -0.15, y); } }
    tg.setAttribute('aFold', new THREE.BufferAttribute(foldT, 1));
    paint(tg, (p) => COL.sage); finish(tg);
    mk(tg, sage, thigh, 'thigh' + L, true);
    const knee = grp(thigh, 0, -DIM.thigh, 0, 'knee' + L);
    // knee patch: a darker khaki square sewn on the front of the knee, with stitches
    {
      const R = 0.094;
      const pg = gridOpen(12, 12, (iu, iv, u, v, out) => {
        const a = (u - 0.5) * 1.5, y = (v - 0.5) * 0.11 + 0.0;
        const r = R + 0.003 + 0.002 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
        out.set(Math.sin(a) * r, y, Math.cos(a) * r);
      });
      paint(pg, () => (side === 1 ? COL.patch : COL.patch2)); finish(pg);
      mk(pg, celMat(1, { id: 58, side: THREE.DoubleSide }), knee, 'kneePatch' + L, false);
      const st = [];
      const R2 = R + 0.0065;
      for (let k = 0; k < 28; k++) {
        const q = (k / 28) * 4; let a, y, aq, yq;
        const hw = 0.72, hh = 0.046;
        const on = (s) => { const f = s % 1; if (s < 1) return [-hw + f * 2 * hw, -hh]; if (s < 2) return [hw, -hh + f * 2 * hh]; if (s < 3) return [hw - f * 2 * hw, hh]; return [-hw, hh - f * 2 * hh]; };
        [a, y] = on(q); [aq, yq] = on((q + 0.1) % 4);
        const pa = v3(Math.sin(a) * R2, y, Math.cos(a) * R2), pb = v3(Math.sin(aq) * R2, yq, Math.cos(aq) * R2);
        st.push(tube([pa, pa.clone().lerp(pb, 0.5), pb], () => 0.0012, 4, 2));
      }
      const sg = merge(st); paint(sg, () => COL.stitch); finish(sg);
      mk(sg, celMat(5, { id: 121 }), knee, 'kneeStitch' + L, false);
    }
    const rSh = (t) => lerp(0.094, 0.088, t);
    const sg = limb(DIM.shin, rSh, { seg: 26, rows: 16, cap: 0.3,
      folds: (a, t) => 0.0035 * Math.sin(t * 15 + a * 1.2) * (0.5 + 0.5 * t) });
    const foldS = new Float32Array(sg.attributes.position.count);
    { const pp = sg.attributes.position; for (let i = 0; i < foldS.length; i++) { const y = pp.getY(i), a = Math.atan2(pp.getX(i), pp.getZ(i)); foldS[i] = Math.sin(-y * 55 + a * 1.2); } }
    sg.setAttribute('aFold', new THREE.BufferAttribute(foldS, 1));
    paint(sg, (p) => COL.sage); finish(sg);
    mk(sg, sage2, knee, 'shin' + L, true);
    // frayed hem: little pointed strips hanging from the leg end, over the boot
    {
      const list = [];
      const nFray = 40;
      for (let i = 0; i < nFray; i++) {
        const a = (i / nFray) * Math.PI * 2 + 0.05;
        const R = 0.0885;
        const c = v3(Math.sin(a) * R, -DIM.shin + 0.016, Math.cos(a) * R);
        const fl = 0.016 + 0.018 * ((i * 7) % 5) / 4;
        const out = v3(Math.sin(a) * 0.004, -fl, Math.cos(a) * 0.004);
        const t = v3(Math.cos(a), 0, -Math.sin(a)).multiplyScalar(0.009);
        const g = new THREE.BufferGeometry();
        const p0 = c.clone().add(t), p1 = c.clone().sub(t), p2 = c.clone().add(out);
        g.setAttribute('position', new THREE.Float32BufferAttribute([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z], 3));
        g.setIndex([0, 1, 2]);
        g.computeVertexNormals();
        list.push(g);
      }
      const fg = merge(list); paint(fg, (p) => COL.sageD); finish(fg);
      mk(fg, celMat(5, { id: 122, side: THREE.DoubleSide }), knee, 'fray' + L, false);
    }
    const ankle = grp(knee, 0, -DIM.shin, 0, 'ankle' + L);
    // rubber boot: shaft + bulbous toe + heel + sole, all in the ankle frame (sole flat at y = -footH)
    const FH = DIM.footH;
    const fb = (x, y, z) => {
      let d = sdRoundCone(x, y, z, [0, 0.03, -0.012], [0, -FH + 0.05, 0.0], 0.08, 0.075);
      d = smin(d, sdEll(x, y, z, [0, -FH + 0.038, 0.075], [0.073, 0.052, 0.082]), 0.04);
      d = smin(d, sdEll(x, y, z, [0, -FH + 0.04, -0.06], [0.068, 0.05, 0.05]), 0.03);
      return Math.max(d, -FH - y);
    };
    const bg = meshSDF(fb, [-0.14, -FH - 0.02, -0.15], [0.14, 0.11, 0.2], 0.006);
    paint(bg, (p) => {
      let c = COL.boot;
      if (p.y < -FH + 0.018) c = COL.bootD;
      else if (p.y < -FH + 0.024) c = COL.bootL;
      if (p.y > 0.015 ) c = mixc(c, COL.bootD, 0.3);
      return c;
    });
    finish(bg);
    mk(bg, celMat(2, { id: 59, gloss: 0.35 }), ankle, 'boot' + L, true);
    legs[L] = { thigh, knee, ankle, side };
  }

  // ---- arms
  const arms = {};
  for (const side of [1, -1]) {
    const L = side === 1 ? 'L' : 'R';
    const sh = grp(chest, side * DIM.shoulder[0], DIM.shoulder[1], DIM.shoulder[2], 'shoulder' + L);
    const ug = limb(DIM.upper, (t) => lerp(0.078, 0.06, t), { seg: 22, rows: 14, cap: 1.0 });
    paint(ug, () => mixc(COL.base, COL.dark, 0.2)); finish(ug);
    mk(ug, furArm, sh, 'upper' + L, true);
    const el = grp(sh, 0, -DIM.upper, 0, 'elbow' + L);
    const fg = limb(DIM.fore, (t) => lerp(0.062, 0.054, t) + 0.012 * Math.sin(Math.min(1, t * 1.6) * Math.PI), { seg: 22, rows: 14, cap: 1.0 });
    paint(fg, () => mixc(COL.base, COL.light, 0.1)); finish(fg);
    mk(fg, furArm, el, 'fore' + L, true);
    const wr = grp(el, 0, -DIM.fore, 0, 'wrist' + L);
    // palm: a thick pad; the handle sits at DIM.handGrip
    const palmColor = mixc(COL.light, COL.base, 0.3);
    const pg = ell(0.044, 0.044, 0.025, 20, 14); pg.translate(0, -0.038, 0.0);
    paint(pg, () => palmColor); finish(pg);
    mk(pg, furMat({ id: 60 - 1, fur: 0.4, size: 0.5 }), wr, 'palm' + L, true);
    const fingers = [];
    const fx = [-0.03, 0, 0.03];
    for (let i = 0; i < 3; i++) {
      const f1 = grp(wr, fx[i], -0.06, 0.0095, 'f1');
      const f2 = grp(f1, 0, -0.03, 0, 'f2');
      const f3 = grp(f2, 0, -0.03, 0, 'f3');
      const seg = (len, r0, r1) => {
        const g = limb(len, (t) => lerp(r0, r1, t), { seg: 12, rows: 6, cap: 0.9, capN: 4 });
        paint(g, () => mixc(COL.light, COL.base, 0.3)); finish(g);
        return g;
      };
      mk(seg(0.03, 0.0172, 0.0162), furMat({ id: 59, fur: 0.3, size: 0.5 }), f1, 'fa' + L + i, true);
      mk(seg(0.03, 0.0162, 0.0155), furMat({ id: 59, fur: 0.3, size: 0.5 }), f2, 'fb' + L + i, true);
      mk(seg(0.028, 0.0155, 0.0135), furMat({ id: 59, fur: 0.3, size: 0.5 }), f3, 'fc' + L + i, true);
      // blunt dark claw
      const cl = ell(0.0095, 0.012, 0.0085, 10, 8); cl.translate(0, -0.032, 0.002);
      paint(cl, () => hex('#2a1f1c')); finish(cl);
      mk(cl, celMat(5, { id: 140 }), f3, 'claw' + L + i, false);
      fingers.push({ f1, f2, f3 });
    }
    // the fourth thick finger, set as a thumb on the far side of the palm
    const tp = grp(wr, side * 0.048, -0.038, 0.01, 'thumb0');
    const t1 = grp(tp, 0, 0, 0, 'tA');
    const t2 = grp(t1, 0, -0.032, 0, 'tB');
    const seg2 = (len, r0, r1) => { const g = limb(len, (t) => lerp(r0, r1, t), { seg: 12, rows: 6, cap: 0.9, capN: 4 }); paint(g, () => mixc(COL.light, COL.base, 0.3)); finish(g); return g; };
    mk(seg2(0.032, 0.018, 0.016), furMat({ id: 59, fur: 0.3, size: 0.5 }), t1, 'tA' + L, true);
    mk(seg2(0.03, 0.016, 0.0135), furMat({ id: 59, fur: 0.3, size: 0.5 }), t2, 'tB' + L, true);
    arms[L] = { sh, el, wr, fingers, tp, t1, t2, side };
  }

  // ---- neck (a thick furred column) and shoulder ruff
  {
    const ng = limb(0.2, (t) => lerp(0.165, 0.2, t), { seg: 28, rows: 14, cap: 1.0, sz: 0.85, warp: (out, a, t) => { out.z -= 0.045; } });
    ng.translate(0, 0.12, 0.0);
    paint(ng, (p, n) => mixc(mixc(COL.base, COL.dark, sstep(0.0, -0.1, n.z)), COL.light, sstep(0.0, 0.6, n.z) * sstep(0.4, -0.2, n.y)));
    finish(ng);
    mk(ng, furMat({ id: 40 }), neck, 'neckM', true);
  }

  const headParts = buildHead(ctx, (g, m, p, n) => mk(g, m, p, n, true), grp, head);

  return { root, hips, chest, neck, head, legs, arms, skin, ragPivot, face: headParts.face };
}

export const IK = { ik2, _NEG: NEG_Y, _m };
void HEAD; void CU; void sdBoxR; void smax;

import * as THREE from 'three';
import { G, COMMON, MRT_OUT, VERT_STD } from './glsl.js';
import { Rng } from './util.js';

// The hive ship: 7 km of wine-dark chitin and bone, ribbed like a seed pod, hanging legs, rows of lime vents.
// Local frame: +X is the nose, Y up, Z across. Hull is a grid in (u along, v around); legs, ribs and spines are tubes.
const L = 7000, A = 1120, B = 760;

// ---- hull surface
function env(u) {            // envelope along the length
  const body = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.86)), 0.55);
  const tailNarrow = THREE.MathUtils.smoothstep(u, 0.0, 0.14);
  return body * (0.62 + 0.38 * tailNarrow);
}
const SEG = 26;                 // abdomen segments along the length
const NRIB = 32;                 // longitudinal seed-pod ribs around
function ribAt(v) {
  const c = Math.abs(Math.cos(v * NRIB * 0.5));
  return Math.pow(c, 7);
}
function hullPoint(u, v, out, crest, overPlates) {
  const e = env(u);
  const sg = u * SEG;
  const f = sg - Math.floor(sg);
  // beetle-abdomen shingles: each band swells toward its rear lip and drops off hard onto the next one
  const segFull = 0.955 + 0.06 * Math.pow(f, 1.6) - 0.045 * THREE.MathUtils.smoothstep(f, 0.965, 1.0);
  const segSoft = 0.992 + 0.012 * Math.pow(f, 1.6) - 0.009 * THREE.MathUtils.smoothstep(f, 0.965, 1.0);
  // the upper half is the outline against the sky: one whole form, the shingles only painted on it; the belly keeps full relief
  const upper = THREE.MathUtils.smoothstep(Math.sin(v), -0.45, 0.1);
  const seg = segFull + (segSoft - segFull) * upper;
  // big slow swells along the back
  const swell = 1 + upper * (0.03 * Math.sin(u * 22.0 + 0.7) + 0.012 * Math.sin(u * 57.0 + 2.1));
  const rib = ribAt(v);
  const ventral = THREE.MathUtils.smoothstep(-Math.sin(v), 0.55, 0.97);
  const r = (overPlates ? e * 1.086 : e * seg * (1 + 0.07 * rib - 0.026 * (1 - rib))) * swell;   // overPlates: the highest the shingles and ridges ever reach
  // keel: the belly drops in a blunt bone-covered ridge
  const keel = ventral * ventral * (0.17 + 0.05 * Math.sin(u * 44));
  const x = (u - 0.5) * L;
  const y = Math.sin(v) * B * r * (1 + keel) + 190 * Math.sin(Math.PI * u) - 140 * Math.pow(u, 3);
  const z = Math.cos(v) * A * r * (1 + 0.03 * Math.sin(u * 18 + v * 3));
  out[0] = x; out[1] = y; out[2] = z;
  if (crest) { crest[0] = rib; crest[1] = seg; crest[2] = ventral; }
}

// smooth envelope (no ribs or shingles): the big drawn form the light follows
function hullSmooth(u, v, out) {
  const e = env(u);
  const ventral = THREE.MathUtils.smoothstep(-Math.sin(v), 0.55, 0.97);
  const keel = ventral * ventral * 0.17;
  out[0] = (u - 0.5) * L;
  out[1] = Math.sin(v) * B * e * (1 + keel) + 190 * Math.sin(Math.PI * u) - 140 * Math.pow(u, 3);
  out[2] = Math.cos(v) * A * e;
}

function buildHull(NU = 1100, NV = 480) {
  const N = (NU + 1) * (NV + 1);
  const pos = new Float32Array(N * 3), nrm = new Float32Array(N * 3), hull = new Float32Array(N * 4), kindA = new Float32Array(N), smoothA = new Float32Array(N * 3);
  const p = [0, 0, 0], c = [0, 0, 0];
  let k = 0;
  for (let j = 0; j <= NV; j++) {
    const v = (j / NV) * Math.PI * 2;
    for (let i = 0; i <= NU; i++) {
      const u = i / NU;
      hullPoint(u, v, p, c);
      pos.set(p, k * 3);
      const arc = v * 880;
      hull.set([p[0], arc, c[0], c[2]], k * 4);
      kindA[k] = 0;
      {
        const du = 0.002, dv = 0.01, a = [0, 0, 0], b = [0, 0, 0], c2 = [0, 0, 0], d2 = [0, 0, 0];
        hullSmooth(Math.min(u + du, 1), v, a); hullSmooth(Math.max(u - du, 0), v, b);
        hullSmooth(u, v + dv, c2); hullSmooth(u, v - dv, d2);
        const tx = a[0] - b[0], ty = a[1] - b[1], tz = a[2] - b[2], sx = c2[0] - d2[0], sy = c2[1] - d2[1], sz = c2[2] - d2[2];
        let nx = sy * tz - sz * ty, ny = sz * tx - sx * tz, nz = sx * ty - sy * tx;
        const l = Math.hypot(nx, ny, nz) || 1;
        // outward
        const ox = 0, oy = p[1] - 100 * Math.sin(Math.PI * u), oz = p[2];
        if (nx * ox + ny * oy + nz * oz < 0) { nx = -nx; ny = -ny; nz = -nz; }
        smoothA.set([nx / l, ny / l, nz / l], k * 3);
      }
      k++;
    }
  }
  const idx = new Uint32Array(NU * NV * 6);
  let q = 0;
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const a = j * (NU + 1) + i, b = a + 1, d = a + NU + 1, e = d + 1;
    idx[q++] = a; idx[q++] = b; idx[q++] = d; idx[q++] = b; idx[q++] = e; idx[q++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aHull', new THREE.BufferAttribute(hull, 4));
  geo.setAttribute('aKind', new THREE.BufferAttribute(kindA, 1));
  geo.setAttribute('aSmooth', new THREE.BufferAttribute(smoothA, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  // close the seam of the normals
  const na = geo.getAttribute('normal');
  for (let i = 0; i <= NU; i++) {
    const a = i, b = NV * (NU + 1) + i;
    const nx = na.getX(a) + na.getX(b), ny = na.getY(a) + na.getY(b), nz = na.getZ(a) + na.getZ(b);
    const l = Math.hypot(nx, ny, nz) || 1;
    na.setXYZ(a, nx / l, ny / l, nz / l); na.setXYZ(b, nx / l, ny / l, nz / l);
  }
  void nrm;
  return geo;
}

// ---- tubes (legs, ribs, spines): one mesh, per-vertex: aHull = (along, around, kind, sway)
function appendTube(store, pts, rad, kind, opts = {}) {
  store.kind ??= [];
  const NS = opts.NS ?? 14, NP = opts.NP ?? 120;
  const curve = new THREE.CatmullRomCurve3(pts.map((a) => new THREE.Vector3(...a)), false, 'centripetal');
  const P = curve.getPoints(NP);
  const T = [], Nn = [], Bb = [];
  const up = new THREE.Vector3(0.3, 1, 0.21).normalize();
  for (let i = 0; i <= NP; i++) {
    const t = (i < NP ? P[i + 1].clone().sub(P[i]) : P[i].clone().sub(P[i - 1])).normalize();
    T.push(t);
    const n = up.clone().sub(t.clone().multiplyScalar(up.dot(t))).normalize();
    Nn.push(n); Bb.push(new THREE.Vector3().crossVectors(t, n).normalize());
  }
  const start = store.pos.length / 3;
  let along = 0;
  for (let i = 0; i <= NP; i++) {
    const f = i / NP;
    const r = rad(f);
    for (let j = 0; j <= NS; j++) {
      const a = (j / NS) * Math.PI * 2;
      const nv = Nn[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(Bb[i], Math.sin(a));
      const pt = P[i].clone().addScaledVector(nv, r);
      store.pos.push(pt.x, pt.y, pt.z);
      store.nrm.push(nv.x, nv.y, nv.z);
      store.hull.push(along, a * 60 * (r / 60 + 0.2), (opts.sway ?? 0) * f, f);
      store.kind.push(kind);
      store.sm ??= []; store.sm.push(nv.x, nv.y, nv.z);
    }
    if (i < NP) along += P[i + 1].distanceTo(P[i]);
  }
  for (let i = 0; i < NP; i++) for (let j = 0; j < NS; j++) {
    const a = start + i * (NS + 1) + j, b = a + 1, d = a + NS + 1, e = d + 1;
    store.idx.push(a, b, d, b, e, d);
  }
}

function buildTubes() {
  const rng = new Rng(4412);
  const s = { pos: [], nrm: [], hull: [], idx: [] };
  const p = [0, 0, 0];
  // --- hanging legs: heavy jointed harvester arms, straight segments and hard elbows, tipped with a hook
  const nLeg = 10;
  for (let i = 0; i < nLeg; i++) {
    const side = i % 2 ? 1 : -1;
    const row = Math.floor(i / 2);
    const u = 0.3 + (row / 4) * 0.42 + rng.range(-0.015, 0.015);
    const v = -Math.PI / 2 + side * rng.range(0.62, 0.8);
    hullPoint(u, v, p);
    const root = p.slice();
    const len = rng.range(1900, 2800) * (1 - 0.3 * Math.abs(row - 2) / 2);
    const out = side * rng.range(300, 460);
    const e1 = [root[0] + rng.range(-90, 90), root[1] - len * 0.3, root[2] + out * 1.3];
    const e2 = [e1[0] + rng.range(-60, 60), e1[1] - len * 0.45, e1[2] - out * 0.75];
    const tip = [e2[0] + rng.range(-40, 40), e2[1] - len * 0.3, e2[2] + side * 40];
    const lerp3 = (a, b, f) => a.map((x, k) => x + (b[k] - x) * f);
    const r0 = rng.range(46, 66);
    const pts = [root, lerp3(root, e1, 0.9), e1, lerp3(e1, e2, 0.08), lerp3(e1, e2, 0.92), e2, lerp3(e2, tip, 0.08), lerp3(e2, tip, 0.9), tip];
    const elbow = [0.31, 0.74];
    appendTube(s, pts, (f) => {
      const segs = [0, elbow[0], elbow[1], 1];
      let idx = 0; while (idx < 2 && f > segs[idx + 1]) idx++;
      const sf = (f - segs[idx]) / (segs[idx + 1] - segs[idx]);
      let r = r0 * (1.02 - f * 0.72) * (0.5 + 0.62 * Math.pow(Math.sin(Math.PI * Math.min(1, sf * 0.92 + 0.08)), 0.7));
      // armour collars just past each joint
      for (const j of elbow) r += r0 * 0.3 * Math.exp(-Math.pow((f - j - 0.014) / 0.01, 2));
      if (f > 0.93) r *= Math.max(0.03, 1 - Math.pow((f - 0.93) / 0.07, 1.2));
      return r;
    }, 2, { NS: 16, NP: 260, sway: rng.range(0.5, 0.75) });
    // thorns along the lower two segments
    const curve = new THREE.CatmullRomCurve3(pts.map((a) => new THREE.Vector3(...a)), false, 'centripetal');
    for (let t = 0; t < 12; t++) {
      const f = 0.36 + (t / 11) * 0.52 + rng.range(-0.008, 0.008);
      const P = curve.getPointAt(f);
      const dir = new THREE.Vector3(side * rng.range(0.5, 1), rng.range(-1, -0.25), rng.range(-0.5, 0.5)).normalize();
      const base = P.toArray();
      const L0 = rng.range(90, 220) * (1.2 - f * 0.6);
      const end = [base[0] + dir.x * L0, base[1] + dir.y * L0, base[2] + dir.z * L0];
      appendTube(s, [base, [base[0] + dir.x * L0 * 0.5, base[1] + dir.y * L0 * 0.45, base[2] + dir.z * L0 * 0.5], end], (q) => 11 * (1 - q) + 2, 2, { NS: 6, NP: 6, sway: rng.range(0.5, 0.75) });
    }
  }
  // --- small drooping mouthparts, under the belly near the nose
  for (let i = 0; i < 16; i++) {
    const u = 0.72 + (i / 15) * 0.2;
    const side = i % 2 ? 1 : -1;
    hullPoint(u, -Math.PI / 2 + side * rng.range(0.2, 0.55), p);
    const r0 = rng.range(26, 44);
    const d = rng.range(420, 900);
    appendTube(s, [[p[0], p[1] + 40, p[2]], [p[0] + rng.range(-40, 40), p[1] - d * 0.6, p[2] + side * 40], [p[0] + rng.range(-40, 40), p[1] - d, p[2] + side * 20]], (f) => r0 * Math.pow(1 - f, 0.8) + 3, 2, { NS: 8, NP: 24, sway: 1.0 });
  }
  // --- bone ribs: great arcs that clasp the hull from the flanks to the keel, tips spread past the belly
  const NR = 21;
  for (let i = 0; i < NR; i++) {
    const u = (Math.round(SEG * (0.13 + (i / (NR - 1)) * 0.76)) + 0.0) / SEG;
    const w0 = rng.range(0.06, 0.13);
    for (const side of [-1, 1]) {
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const f = k / 8;
        const v = -Math.PI / 2 + side * (1.55 + w0 - f * (1.48 - 0.0));
        hullPoint(u - 0.07 * (1 - f) * (1 - f) + 0.012 * f, v, p, null, true);   // clears every lip, so each rib reads as one unbroken arc
        const out = 1.012 + 0.05 * Math.pow(f, 3);
        pts.push([p[0] * 1.0, p[1] * out + (f > 0.9 ? -(f - 0.9) * 800 : 0), p[2] * out]);
      }
      // tip spreads and hooks past the keel
      const last = pts[pts.length - 1];
      pts.push([last[0] + 18, last[1] - 130, last[2] + side * 40]);
      pts.push([last[0] + 36, last[1] - 210, last[2] + side * 100]);
      const rr = rng.range(26, 38) * (0.8 + Math.sin(Math.PI * u) * 0.4) * (i % 3 === 0 ? 1.55 : 0.78);
      appendTube(s, pts, (f) => rr * (1 - 0.72 * f) + rr * 0.28 * Math.exp(-Math.pow((f - 0.16) / 0.05, 2)), 1, { NS: 10, NP: 80 });
    }
  }
  // --- hive pods: long sacs hanging in two rows between the legs, swollen near the tip
  for (let i = 0; i < 28; i++) {
    const side = i % 2 ? 1 : -1;
    const u = 0.2 + (i / 27) * 0.6 + rng.range(-0.008, 0.008);
    hullPoint(u, -Math.PI / 2 + side * rng.range(0.14, 0.5), p);
    const d = rng.range(420, 980);
    const r0 = rng.range(42, 84);
    appendTube(s, [[p[0], p[1] + 40, p[2]], [p[0] + rng.range(-20, 20), p[1] - d * 0.45, p[2] + side * 14], [p[0] + rng.range(-30, 30), p[1] - d, p[2] + side * rng.range(10, 50)]], (f) => (r0 * 0.28 + r0 * Math.pow(Math.sin(Math.PI * Math.pow(f, 1.8)), 0.8)) * (f > 0.985 ? 0.2 : 1), 3, { NS: 12, NP: 40, sway: rng.range(0.7, 1) });
  }
  // --- dorsal spines along the back (silhouette against the sky) and the prow's bone tusks
  for (let i = 0; i < 46; i++) {
    const u = 0.14 + (i / 45) * 0.72;
    hullPoint(u, Math.PI / 2, p);
    const h = (i % 5 === 0 ? rng.range(520, 820) : rng.range(120, 300)) * (1 + Math.sin(i) * 0.2);
    const lean = rng.range(120, 220);
    appendTube(s, [[p[0], p[1] - 80, p[2]], [p[0] - lean * 0.3, p[1] + h * 0.6, p[2]], [p[0] - lean, p[1] + h, p[2]]], (f) => rng.range(40, 40) * Math.pow(1 - f, 1.1) + 2, 1, { NS: 8, NP: 16 });
  }
  // --- the outline's smaller scales: barbs on the upper flanks in three sizes, thorns between them
  for (let i = 0; i < 420; i++) {
    const u = rng.range(0.09, 0.91);
    const vv = rng.range(-0.1, 1.25);
    const v = rng.next() < 0.5 ? vv : Math.PI - vv;
    hullPoint(u, v, p);
    const roll = rng.next();
    const sz = i < 120 ? (roll < 0.15 ? 3 : roll < 0.65 ? 2 : 1) : 0;
    const len = [rng.range(28, 70), rng.range(60, 110), rng.range(120, 220), rng.range(300, 520)][sz];
    const rad = [5, 8, 13, 22][sz];
    const out = new THREE.Vector3(0, Math.sin(v) * 0.9 + 0.35, Math.cos(v)).normalize();
    const bx = -rng.range(0.25, 0.7);
    const e = [p[0] + bx * len, p[1] + out.y * len, p[2] + out.z * len];
    appendTube(s, [[p[0], p[1] - out.y * 16, p[2] - out.z * 16], [p[0] + bx * len * 0.35, p[1] + out.y * len * 0.55, p[2] + out.z * len * 0.55], e], (f) => rad * Math.pow(1 - f, 1.1) + 1.5, 1, { NS: sz > 1 ? 6 : 4, NP: sz > 1 ? 10 : 4 });
  }
  for (const side of [-1, 1]) {
    const q = [0, 0, 0];
    hullPoint(0.985, side > 0 ? 0.0 : Math.PI, q);
    appendTube(s, [[q[0] - 200, q[1] - 80, q[2] * 0.6], [q[0] + 340, q[1] - 200, q[2] * 1.6 + side * 170], [q[0] + 900, q[1] - 90, q[2] * 1.3 + side * 300], [q[0] + 1180, q[1] + 180, q[2] * 0.7 + side * 200]], (f) => 150 * Math.pow(1 - f, 1.0) + 6, 1, { NS: 12, NP: 60 });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(s.nrm, 3));
  geo.setAttribute('aHull', new THREE.Float32BufferAttribute(s.hull, 4));
  geo.setAttribute('aKind', new THREE.Float32BufferAttribute(s.kind, 1));
  geo.setAttribute('aSmooth', new THREE.Float32BufferAttribute(s.sm, 3));
  geo.setIndex(s.idx);
  return geo;
}

// ---- painted chitin
function shipMaterial(sideSign) {
  const u = {
    ...G,
    uClipN: { value: new THREE.Vector3(1, 0, 0) },
    uClipD: { value: 0 },
    uClipOn: { value: 0 },
    uSideSign: { value: sideSign },
    uHot: { value: 0 },
    uDepthMul: { value: 0.09 },
    uHorizonWarm: { value: new THREE.Color('#eef4f4') },
    uHorizonCool: { value: new THREE.Color('#cfe6f5') },
    uMid: { value: new THREE.Color('#3f7fe0') },
  };
  const vs = /* glsl */ `
    attribute vec4 aHull;
    attribute float aKind;
    attribute vec3 aSmooth;
    varying vec3 vSmooth;
    uniform float uTime;
    varying vec4 vHull;
    varying float vKind;
    varying vec3 vLocal;
    ${VERT_STD}
    void main(){
      vHull = aHull;
      vKind = aKind;
      vSmooth = normalize(mat3(modelMatrix) * aSmooth);
      vec3 p = position;
      if(aKind > 1.5){                       // legs sway, slow and heavy
        float sw = aHull.z * aHull.z;
        float ph = position.x * 0.0009 + position.z * 0.0011;
        p.z += sw * 90.0 * sin(uTime * 0.5 + ph * 7.0);
        p.x += sw * 60.0 * sin(uTime * 0.37 + ph * 11.0);
      }
      vLocal = p;
      stdVertex(p, normal);
    }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform vec3 uClipN;
    uniform vec3 uHorizonWarm, uHorizonCool, uMid;
    uniform float uClipD, uClipOn, uSideSign, uHot, uDepthMul;
    varying vec3 vWorld, vNormalW, vNormalV, vLocal;
    varying float vDepth;
    varying vec4 vHull;
    varying float vKind;
    varying vec3 vSmooth;
    float vcell(vec2 p, out float id){
      vec2 ip = floor(p), fp = fract(p);
      float d1 = 8.0, d2 = 8.0; id = 0.0;
      for(int j = -1; j <= 1; j++) for(int i = -1; i <= 1; i++){
        vec2 g = vec2(float(i), float(j));
        vec2 o = hash22(ip + g);
        float d = length(g + o - fp);
        if(d < d1){ d2 = d1; d1 = d; id = hash12(ip + g + 7.0); }
        else if(d < d2) d2 = d;
      }
      return d2 - d1;      // 0 at cell borders
    }
    void main(){
      // clip half
      float side = dot(vLocal, uClipN) - uClipD;
      if(uClipOn > 0.5 && side * uSideSign < 0.0) discard;
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 N = normalize(vNormalW);
      vec3 NV = normalize(vNormalV);
      vec3 V = normalize(cameraPosition - vWorld);
      float kind = vKind;
      bool tube = kind > 0.5;
      float along = vHull.x, around = vHull.y;
      vec2 hp = vec2(along, around);
      // pixel footprint in metres -> each detail layer fades when it would alias or look busy (detail fades with distance)
      float fw = max(length(vec2(dFdx(along), dFdy(along))), length(vec2(dFdx(around), dFdy(around))));
      float layer(float size){ return 1.0; }
      float dA = smoothstep(14.0, 5.0, fw / 8.0);      // medium plates (90 m seen at < ~14 m/px)
      float dB = smoothstep(5.0, 1.6, fw / 8.0);       // small pits, scratches
      // ---- wine-dark chitin colour blotches: three scales
      float big = fbm2(hp * 0.0014 + 2.0);
      float mid = fbm2(hp * 0.008 + 5.0);
      vec3 cA = vec3(0.075, 0.014, 0.046), cB = vec3(0.25, 0.042, 0.105), bone = vec3(0.5, 0.49, 0.52);
      if(tube){ big = 0.5 + (fbm2(vLocal.xz * 0.002 + vLocal.y * 0.0007) - 0.5) * 0.6; mid = 0.5; }
      vec3 col = mix(cA, cB, 0.42 + 0.5 * (big - 0.5) + 0.25 * (mid - 0.5));
      float limeHex = 0.0;
      float h = big * 3.0 + mid * 2.0;           // height for the bump
      if(!tube){
        float ventral = vHull.w;
        float crest = vHull.z;
        // crest of each longitudinal rib: coral highlight running the whole length
        col = mix(col, vec3(0.3, 0.1, 0.15), smoothstep(0.82, 1.0, crest) * 0.45);
        col = mix(col, vec3(0.06, 0.012, 0.035), smoothstep(0.22, 0.0, crest) * 0.6);
        h += crest * 6.0;
        // the belly is bone: a broad pale keel, plated, stained at its margins
        float keel = smoothstep(0.86, 0.95, ventral + (big - 0.5) * 0.1);
        col = mix(col, mix(bone, bone * vec3(0.66, 0.58, 0.58), smoothstep(0.35, 0.65, mid)) * 0.8, keel);
        // plates: medium cells stretched between the ribs
        float pid;
        float pl = vcell(vec2(along * 0.012, around * 0.030), pid);
        float seam = smoothstep(0.05, 0.015, pl) * dA;
        col = mix(col, col * mix(0.68, 1.5, pid), dA * 0.8);
        float segId = floor((vLocal.x / 7000.0 + 0.5) * 26.0);
        col *= 0.78 + 0.5 * hash12(vec2(segId, floor(around / 150.0)));
        h += (1.0 - seam) * pid * 1.6 * dA;
        col = mix(col, vec3(0.05, 0.012, 0.03), seam * 0.9);
        // small pits and scratches
        float pid2;
        float sm = vcell(hp * vec2(0.07, 0.11), pid2);
        float pit = smoothstep(0.34, 0.1, sm) * step(0.35, pid2) * dB;
        col = mix(col, col * 0.52, pit * 0.75);
        float sc = smoothstep(0.86, 0.93, vnoise(hp * vec2(0.03, 0.35) + 4.0)) * dB;
        col = mix(col, mix(col, vec3(0.62, 0.46, 0.5), 0.6), sc * 0.7);
        h += (pit * -0.4 + sc * 0.3);
        // the hive: fields of hexagonal cells over the belly and the lower flanks, some sealed with bone, a few lit from inside
        vec2 hxp = hp / 78.0;
        vec2 hs = vec2(1.0, 1.732);
        vec2 ha = mod(hxp, hs) - hs * 0.5, hb = mod(hxp - hs * 0.5, hs) - hs * 0.5;
        vec2 hg = dot(ha, ha) < dot(hb, hb) ? ha : hb;
        vec2 hid = hxp - hg;
        vec2 hgA = abs(hg);
        float hd = max(dot(hgA, vec2(0.5, 0.866)), hgA.x);
        float hr = hash12(hid);
        float field = smoothstep(0.42, 0.6, fbm2(hp * 0.0024 + 3.3)) * smoothstep(0.2, 0.55, ventral);
        float hexK = field * smoothstep(9.0, 3.0, fw / 8.0);
        if(hexK > 0.001){
          vec3 hc = mix(vec3(0.33, 0.21, 0.24), vec3(0.14, 0.05, 0.08), hr);                 // the wall of the cell
          vec3 hole = vec3(0.012, 0.004, 0.012);
          if(hr > 0.62) hole = bone * vec3(0.62, 0.55, 0.56);                                 // bone cap
          float lime = step(0.93, hash12(hid + 3.1));
          if(lime > 0.5) hole = vec3(0.72, 1.1, 0.16);
          vec3 c2 = mix(hole, hc, smoothstep(0.34, 0.385, hd));
          c2 = mix(c2, vec3(0.03, 0.008, 0.02), smoothstep(0.455, 0.49, hd));
          col = mix(col, c2, hexK);
          limeHex = lime * hexK * (1.0 - smoothstep(0.34, 0.385, hd));
        }
      } else if(kind < 1.5){
        // bone ribs and spines: banded, yellowed
        float band = vnoise(vec2(along * 0.014, around * 0.02));
        col = mix(bone, bone * vec3(0.76, 0.68, 0.68), smoothstep(0.4, 0.8, band));
        col = mix(col, vec3(0.22, 0.1, 0.13), smoothstep(0.96, 1.0, sin(along * 0.03) * 0.5 + 0.5) * 0.2);
      } else {
        // legs: wine chitin, pale joint rings, dark tips
        float rg = smoothstep(0.42, 0.5, fract(along * 0.0029)) * smoothstep(0.54, 0.5, fract(along * 0.0029));
        col = mix(mix(cA, cB, 0.5 + 0.5 * smoothstep(0.35, 0.65, big)), bone * 0.4, rg * 0.9);
        col = mix(col, vec3(0.04, 0.01, 0.025), smoothstep(0.6, 1.0, vHull.w) * 0.8);
        // long armoured grooves down each limb and rows of tiny plates
        col *= mix(1.0, 0.62, smoothstep(0.1, 0.0, abs(fract(around * 0.024) - 0.5)));
        if(kind > 2.5){
          // pods: pale bone-pink membrane, wine stitching, a lime seam at the swelling
          float seam = smoothstep(0.08, 0.0, abs(fract(around * 0.03) - 0.5));
          col = mix(vec3(0.3, 0.2, 0.24), vec3(0.11, 0.03, 0.065), seam);
          float sw = smoothstep(0.45, 0.8, vHull.w) * smoothstep(1.0, 0.86, vHull.w);
          limeHex = max(limeHex, seam * sw);
        }
      }
      // bump from the height field (screen-space)
      vec3 dpx = dFdx(vWorld), dpy = dFdy(vWorld);
      float hx = dFdx(h), hy = dFdy(h);
      vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
      float det = dot(dpx, r1);
      vec3 grad = (r1 * hx + r2 * hy) * sign(det + 1e-6) / max(abs(det), 1e-3);
      N = normalize(N - grad * 0.0);

      // ---- light: one hard sun, cool sky fill from the sides, warm bounce off the bright city on the belly (posterised)
      float ndl = mix(dot(normalize(vSmooth), uSunDir), dot(N, uSunDir), tube ? 0.0 : 0.5);
      float lit = smoothstep(-0.05, 0.08, ndl);
      vec3 Nsm = normalize(vSmooth);
      float fres = 1.0 - max(dot(Nsm, V), 0.0);
      vec3 litC = col * uSunColor * 0.92;
      vec3 Bc = normalize(vec3(-0.1, -1.0, 0.42));
      vec3 Ns = normalize(vSmooth);
      float bn = mix(dot(Ns, Bc), dot(N, Bc), tube ? 0.0 : 0.55) + (big - 0.5) * 0.25 + (mid - 0.5) * 0.08;
      float toneA = smoothstep(0.1, 0.16, bn), toneB = smoothstep(0.62, 0.68, bn);
      vec3 shade = col * vec3(0.5, 0.46, 0.72);
      shade = mix(shade, col * vec3(0.72, 0.56, 0.64), toneA * 0.85);
      shade = mix(shade, col * vec3(0.92, 0.72, 0.74), toneB * 0.8);
      float sideFill = pow(max(dot(N, normalize(vec3(-0.55, -0.15, 0.82))), 0.0), 2.0);
      shade += col * uSkyTint * sideFill * 0.2;
      vec3 outc = mix(shade, litC, lit);
      outc *= mix(0.74, 1.2, smoothstep(-0.7, 0.85, Nsm.y));
      // sky rim on the edges: the shape separates against the blue
      outc = mix(outc, uSkyTint * 0.5, smoothstep(0.78, 0.98, fres) * 0.35);
      if(!tube){
        // the lip of every shingle catches the light from below in one thin coral line
        float fseg = fract((vLocal.x / 7000.0 + 0.5) * 26.0);
        outc *= mix(0.62, 1.16, smoothstep(0.0, 0.92, fseg));
        float lip = smoothstep(0.955, 0.972, fseg) * smoothstep(0.998, 0.982, fseg);
        outc = mix(outc, vec3(0.62, 0.3, 0.32) * (0.4 + 0.7 * toneB) * (lit * 0.7 + 0.3), lip * 0.8);
        outc = mix(outc, col * 0.3, smoothstep(0.985, 1.0, fseg) * 0.9);
        // crest highlight
        
      }
      // ---- rows of lime vents along the flanks
      if(!tube){
        float vent = 0.0;
        for(int i = 0; i < 5; i++){
          float v0 = 880.0 * (3.7 + float(i) * 0.33);      // arc positions in the lower flanks
          float dv = abs(around - v0);
          if(dv < 60.0){
            float xx = fract(along / 230.0) - 0.5;
            float slit = smoothstep(0.2, 0.14, abs(xx)) * smoothstep(10.0, 5.0, dv);
            float pulse = 0.65 + 0.35 * sin(along * 0.01 + uDrawTime * 2.4 + float(i) * 1.7);
            vent = max(vent, slit * pulse);
          }
        }
        // the mirrored rows on the far flank
        for(int i = 0; i < 5; i++){
          float v0 = 880.0 * (5.7 - float(i) * 0.33);
          float dv = abs(around - v0);
          if(dv < 60.0){
            float xx = fract(along / 230.0 + 0.5) - 0.5;
            float slit = smoothstep(0.2, 0.14, abs(xx)) * smoothstep(10.0, 5.0, dv);
            float pulse = 0.65 + 0.35 * sin(along * 0.01 + uDrawTime * 2.4 + float(i) * 2.3);
            vent = max(vent, slit * pulse);
          }
        }
        outc = mix(outc, vec3(0.74, 1.15, 0.2) * 1.25, max(vent, limeHex));
      }
      // ---- the sheared face: the inside of the hull burns white-lime at the cut
      if(!gl_FrontFacing){
        float ringI = smoothstep(0.86, 0.96, fract(along / 269.0));
        float cellI = smoothstep(0.1, 0.03, abs(fract(around / 170.0) - 0.5));
        vec3 cav = mix(vec3(0.055, 0.012, 0.04), vec3(0.17, 0.045, 0.085), 0.5 * (big - 0.2));
        cav = mix(cav, vec3(0.34, 0.2, 0.22), max(ringI, cellI * 0.45));
        float dCut = abs(side);
        cav += vec3(0.7, 1.05, 0.2) * exp(-dCut / 240.0) * (0.25 + 0.75 * uHot);
        cav = mix(cav, vec3(0.02, 0.004, 0.015), smoothstep(300.0, 1400.0, dCut) * 0.7);
        outc = cav;
        N = -N; NV = -NV;
      }
      if(uClipOn > 0.5){
        float cut = abs(side);
        outc = mix(outc, vec3(0.85, 1.2, 0.3) * 1.3, smoothstep(45.0, 5.0, cut) * max(uHot, 0.35));
        outc = mix(outc, vec3(1.25, 1.25, 1.1) * 1.4, smoothstep(10.0, 1.0, cut) * uHot);
      }
      // distant air: a little sky haze, stronger toward the far end
      // air takes the colour of the sky behind it: pale low down, saturated blue when the hull hangs high overhead
      vec3 hz = mix(mix(uHorizonCool, uHorizonWarm, 0.5) * vec3(0.72, 0.8, 1.0), uMid, smoothstep(0.1, 0.45, -V.y));
      outc = mix(outc, hz, (0.1 + 0.3 * smoothstep(3200.0, 8200.0, vDepth)) * (gl_FrontFacing ? 1.0 : 0.25));
      writeOut(outc, 1.0, NV, vDepth * uDepthMul, 0.0);
    }
  `;
  // GLSL ES has no nested functions: strip the helper placeholder
  const fixed = fs.replace('float layer(float size){ return 1.0; }\n', '');
  const m = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fixed, side: THREE.DoubleSide, transparent: false });
  return m;
}

export function buildShip(ctx, SHIP, skyU) {
  const hullGeo = buildHull();
  const tubeGeo = buildTubes();
  const root = new THREE.Group();          // the whole ship
  ctx.scene.add(root);
  const mA = shipMaterial(1), mB = shipMaterial(-1);
  for (const m of [mA, mB]) { m.uniforms.uHorizonWarm = skyU.uHorizonWarm; m.uniforms.uHorizonCool = skyU.uHorizonCool; m.uniforms.uMid = skyU.uMid; }
  const shadowMat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: { uPass: G.uPass }, side: THREE.DoubleSide,
    vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uPass; layout(location=0) out vec4 c; layout(location=1) out vec4 d; void main(){ if(uPass < 0.5) discard; c = vec4(1); d = vec4(0); }' });
  const proxy = new THREE.Mesh(buildHull(140, 48), shadowMat);
  proxy.frustumCulled = false;
  const proxyRoot = new THREE.Group();
  proxyRoot.add(proxy);
  proxyRoot.rotation.set(0, 0.2, -0.05);
  proxyRoot.visible = false;
  ctx.scene.add(proxyRoot);
  ctx.shadowRoots.push(proxyRoot);
  const halfA = new THREE.Group(), halfB = new THREE.Group();
  root.add(halfA, halfB);
  const add = (grp, geo, m) => { const o = new THREE.Mesh(geo, m); o.frustumCulled = false; grp.add(o); return o; };
  add(halfA, hullGeo, mA); add(halfA, tubeGeo, mA);
  add(halfB, hullGeo, mB); add(halfB, tubeGeo, mB);
  halfB.visible = false;

  // the shear: one plane in hull space, tilted so the line reads as a clean diagonal across the belly
  const clipN = new THREE.Vector3(1, -0.35, 0.28).normalize();
  const clipD = -260;
  mA.uniforms.uClipN.value.copy(clipN); mB.uniforms.uClipN.value.copy(clipN);
  mA.uniforms.uClipD.value = clipD; mB.uniforms.uClipD.value = clipD;

  const c = new THREE.Vector3(...SHIP.c);
  const local = { x: 0, y: 0 };
  void local;
  const C = ctx.CUES;
  const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
  const YAW = 0.2, PITCH = -0.05;
  root.position.copy(c);
  root.rotation.set(0, YAW, PITCH);

  function update(st) {
    const t = st.t;
    const visible = st.set !== 'orbit' && st.set !== 'abstract' && t >= C.ship;     // the reveal is s04: never seen in the hook
    root.visible = visible;
    // slow, heavy bob
    root.position.set(c.x + 18 * Math.sin(t * 0.13), c.y + 30 * Math.sin(t * 0.21 + 1), c.z);
    if (st.sid === 's04') {
      // the arrival: it comes down into the frame over the city and settles as the shot ends
      const u = Math.min(1, Math.max(0, (t - C.ship) / 2.6));
      root.position.y += -700 + 2200 * (1 - u) * (1 - u);
      root.position.z += 1500;
    }
    proxyRoot.visible = st.sid === 's04';
    proxyRoot.position.copy(root.position);
    const ts = t - C.sweep;
    const split = ts > 0;
    halfB.visible = split && visible;
    mA.uniforms.uClipOn.value = split ? 1 : 0;
    mB.uniforms.uClipOn.value = split ? 1 : 0;
    const hot = split ? Math.max(0, 1 - ts / 5.5) : 0;
    mA.uniforms.uHot.value = hot; mB.uniforms.uHot.value = hot;
    if (split) {
      const gap = 40 * ts + 22 * ts * ts;
      const away = _v.copy(clipN).multiplyScalar(gap);
      halfA.position.copy(away); halfB.position.copy(away).negate();
      halfA.position.y += 25 * ts; halfB.position.y -= 30 * ts;
      const tilt = Math.min(0.5, ts * 0.018);
      halfA.rotation.set(tilt * 0.7, 0, tilt);
      halfB.rotation.set(-tilt * 0.5, 0, -tilt);
      // far away at the end: shrinking is the same as receding, but stays inside the far plane
      const far = 1 / (1 + 0.14 * Math.max(0, ts - 3.5));
      root.scale.setScalar(far);
      root.position.lerp(c, 0).multiplyScalar(1);
      const dir = _v.copy(c).normalize();
      root.position.copy(c).addScaledVector(dir, 2200 * (1 - far));
      root.position.y += 1800 * (1 - far);
    } else {
      halfA.position.set(0, 0, 0); halfB.position.set(0, 0, 0);
      halfA.rotation.set(0, 0, 0); root.scale.setScalar(1);
    }
    void _q;
  }

  // the point on the belly where the district-killing beam leaves the ship (world space)
  const beamLocal = new THREE.Vector3(-420, -1000, 80);
  const anchorBeam = (v) => { root.updateWorldMatrix(true, false); return v.copy(beamLocal).applyMatrix4(root.matrixWorld); };
  const top = new THREE.Vector3(0, 900, 0);
  const shipTop = () => { root.updateWorldMatrix(true, false); return top.clone().applyMatrix4(root.matrixWorld).y; };

  return { root, update, anchorBeam, shipTop };
}

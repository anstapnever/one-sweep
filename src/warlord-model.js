import * as THREE from 'three';
import { v3, hull, cbox, superPts, cyl, cylZ, cylX, ball, ribs, tube, patch, solid, Kit, sweep, gemGeo, scythe, V } from './warlord-geo.js';
import { Rng, deg } from './util.js';

// WARLORD dept: the insect war-king. Units are metres at the armoured 9 m size, root scale 1 -> 1.55 after the shed.
// +Y up, +Z its front. +X is called 'R' here and -X 'L' (the layout's left foot is the one on screen-left, facing it).
// Every rigid part is merged per joint; each armour piece is its own joint so it can fly off at the shed.
export const W1 = '#300b24', W2 = '#4c1237', W3 = '#6c1a45';
export const STY = {
  W1: { col: W1, metal: 0.9, detail: 1, tone: 0.05 },
  W2: { col: W2, metal: 1, detail: 1, tone: 0.06 },
  W3: { col: W3, metal: 1, detail: 1, tone: 0.05 },
  DARK: { col: '#260817', metal: 0.5, detail: 0.7, tone: 0.05 },            // soft joints, recesses
  MEM: { col: '#4a1630', metal: 0.25, detail: 0.5, tone: 0.05 },            // membrane
  CREAM: { col: '#d8c9b6', metal: 0.25, detail: 0.5, tone: 0.04, wear: 0.4 }, // underplates
  BONE: { col: '#f2ebdd', metal: 0.5, detail: 0.2, tone: 0.03 },            // claws, tusks, blade edges
  CORAL: { col: '#f7849a', metal: 0.8, detail: 0.2, tone: 0.04 },           // ridges
  GT: { col: '#28d6c2', metal: 0, detail: 0, emis: 2, tone: 0.1, wear: 0 },    // turquoise
  GC: { col: '#f3bd2e', metal: 0, detail: 0, emis: 2, tone: 0.1, wear: 0 },    // citrine
  GR: { col: '#e01c4c', metal: 0, detail: 0, emis: 2, tone: 0.1, wear: 0 },    // ruby
  LIME: { col: '#c8ff3a', metal: 0, detail: 0, emis: 1, tone: 0, wear: 0 },
};
export const GEMS = [STY.GT, STY.GC, STY.GR];

export const SK = {
  pelvisY: 5.2, hipX: 0.82, hipY: -0.14,
  thigh: 2.1, shin: 2.3, meta: 1.95, ballH: 0.3,
  waist: [0.46, 0.36, 0.34, 0.34], abd: 0.52,
  neck: [0, 1.82, 0.42], head: [0, 0.34, 0.26],
  sh: [1.68, 1.5, 0.02], upper: 2.0, fore: 1.95, blade: 3.7,
  ish: [1.16, 0.6, 0.64], iupper: 1.36, ifore: 1.46,
  ey: [0.68, 0.38, 0.14],
};
const DEGK = 57.2958;

export function buildWarlord(matBody, matArmour) {
  const j = {};
  const root = new THREE.Group(); root.name = 'warlord'; j.root = root;
  const J = (name, parent, pos = [0, 0, 0]) => { const g = new THREE.Group(); g.name = name; g.position.set(...pos); parent.add(g); j[name] = g; return g; };
  const k = new Kit(911);
  const rng = new Rng(4242);
  const armourNames = [];
  const A = (name, parent) => { const n = 'A_' + name; J(n, typeof parent === 'string' ? j[parent] : parent); armourNames.push(n); return n; };

  const pelvis = J('pelvis', root, [0, SK.pelvisY, 0]);
  let prev = pelvis;
  for (let i = 0; i < 4; i++) { const a = J('abd' + i, prev, i ? [0, -SK.abd, 0] : [0, -0.18, -0.56]); prev = a; }
  let w = pelvis;
  w = J('waist1', w, [0, SK.waist[0], 0]); w = J('waist2', w, [0, SK.waist[1], 0]); w = J('waist3', w, [0, SK.waist[2], 0]);
  const chest = J('chest', w, [0, SK.waist[3], 0]);
  const neck = J('neck', chest, SK.neck);
  const head = J('head', neck, SK.head);
  for (const [s, L] of [[1, 'R'], [-1, 'L']]) {
    const hip = J('hip' + L, pelvis, [s * SK.hipX, SK.hipY, 0]);
    const knee = J('knee' + L, hip, [0, -SK.thigh, 0]);
    const hock = J('hock' + L, knee, [0, -SK.shin, 0]);
    J('foot' + L, hock, [0, -SK.meta, 0]);
    const sh = J('sh' + L, chest, [s * SK.sh[0], SK.sh[1], SK.sh[2]]);
    const el = J('el' + L, sh, [0, -SK.upper, 0]);
    J('wr' + L, el, [0, -SK.fore, 0]);
    const ish = J('ish' + L, chest, [s * SK.ish[0], SK.ish[1], SK.ish[2]]);
    const iel = J('iel' + L, ish, [0, -SK.iupper, 0]);
    const iwr = J('iwr' + L, iel, [0, -SK.ifore, 0]);
    for (let f = 0; f < 3; f++) { const a = J(`f${L}${f}a`, iwr, [0, -0.32, (f - 1) * 0.16]); const b = J(`f${L}${f}b`, a, [0, -0.3, 0]); J(`f${L}${f}c`, b, [0, -0.26, 0]); }
    const tha = J(`th${L}a`, iwr, [s * -0.05, -0.1, 0.22]); J(`th${L}b`, tha, [0, -0.22, 0]);
    const md = J('md' + L, head, [s * 0.24, -0.24, 0.42]);
    J('md2' + L, md, [0, 0, 0.72]);
  }

  buildPelvis(k, A);
  buildAbdomen(k);
  buildWaist(k, A);
  buildThorax(k, A, rng);
  buildHead(k, A, rng);
  for (const [s, L] of [[1, 'R'], [-1, 'L']]) { buildBladeArm(k, A, s, L, rng); buildInnerArm(k, A, s, L, j); buildLeg(k, A, s, L, rng); }

  const free = buildFreeGems(k, J, j, root, rng);

  // proportional fit
  const meshes = [];
  const bodyBins = new Set();
  // armour bins take their own material so seams can crack before the burst
  const armBins = new Set(armourNames);
  for (const [name] of k.bins) if (!armBins.has(name)) bodyBins.add(name);
  const kitArm = new Map(), kitBody = new Map();
  for (const [name, B] of k.bins) (armBins.has(name) ? kitArm : kitBody).set(name, B);
  k.bins = kitBody; k.finish(j, matBody, meshes);
  k.bins = kitArm; k.finish(j, matArmour, meshes);

  // centre each armour piece and free gem on its own centroid: they tumble about it
  const pieces = [];
  for (const m of meshes) {
    const n = m.name.replace('kit:', '');
    const isG = n.startsWith('G_') || n.startsWith('Gb_');
    if (!armBins.has(n) && !isG) continue;
    m.geometry.computeBoundingBox();
    const c = m.geometry.boundingBox.getCenter(new V());
    m.geometry.translate(-c.x, -c.y, -c.z);
    m.position.copy(c);
    m.geometry.computeBoundingSphere();
    pieces.push({ m, joint: m.parent, name: n, kind: isG ? (n.startsWith('Gb_') ? 'lateGem' : 'gem') : 'plate', c: c.clone() });
  }
  return { root, j, meshes, pieces, tris: k.tris, free };
}

// --------------------------------------------------------------- helpers
const surf = (S, u, v, lift = 0) => { const p = S.p(u, v); const c = S.c(u, v); const n = p.clone().sub(c).normalize(); return [p.addScaledVector(n, lift), n]; };
function gem(k, bin, pos, n, r, st, M) {
  const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), n.clone().normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  const rot = [e.x * DEGK, e.y * DEGK, e.z * DEGK];
  k.add(bin, gemGeo(r), st, pos.toArray ? pos.toArray() : pos, rot, M);
  k.add(bin, new THREE.TorusGeometry(r * 1.02, r * 0.16, 6, 12).rotateX(Math.PI / 2), STY.CORAL, (pos.toArray ? pos.toArray() : pos), rot, M);
}
function cluster(k, bin, S, u0, v0, n, du, dv, rng, M, rs = [0.05, 0.14], lift = 0.01, spare = 0.8) {
  for (let i = 0; i < n; i++) {
    const u = u0 + (rng.next() - 0.5) * du, vv = Math.min(0.98, Math.max(0.02, v0 + (rng.next() - 0.5) * dv));
    const r = rs[0] + (rs[1] - rs[0]) * Math.pow(rng.next(), 1.5);
    const [p, nn] = surf(S, u, vv, lift + r * 0.1);
    const roll = rng.next();
    const st = roll < 0.48 ? STY.GT : roll < 0.84 ? STY.GC : STY.GR;
    if (rng.next() < spare) gem(k, bin, p, nn, r, st, M);
  }
}
// a small jutting thorn from a surface
const thorn = (h, r, lean = 0.2) => sweep([[0, -r * 0.4, 0, r], [0, h * 0.45, lean * h * 0.3, r * 0.62], [0, h, lean * h, 0.001]], { seg: 6, nv: 6, crease: 50 });

// ----------------------------------------------------------- pelvis, abdomen, waist
function buildPelvis(k, A) {
  const { W1, W2, W3, DARK, CREAM, CORAL, MEM } = STY;
  const P = tube([[-0.62, 0.34, 0.28, 0.0, 2.5], [-0.34, 0.86, 0.56, -0.04, 2.5], [0.0, 1.06, 0.68, -0.06, 2.6], [0.3, 0.86, 0.6, -0.04, 2.5], [0.52, 0.44, 0.38, 0, 2.4]]);
  k.add('pelvis', solid(P, { nu: 28, nv: 10 }), W1);
  // ventral cream shield
  k.add('pelvis', patch(P, [[-0.12, 0.08], [0.12, 0.08], [0.15, 0.7], [-0.15, 0.7]], { nu: 6, nv: 5, t: 0.04, crown: 0.03 }), CREAM);
  for (const s of [1, -1]) {
    const M = { mirror: s < 0 };
    k.add('pelvis', ball(0.5, 16, 12), MEM, [SK.hipX, SK.hipY, 0], undefined, M);
    k.add('pelvis', patch(P, [[0.17, 0.06], [0.34, 0.06], [0.36, 0.92], [0.16, 0.92]], { nu: 4, nv: 5, t: 0.05, ridge: 0.03 }), W2, undefined, undefined, M);
    // a shard left after the armour goes
    k.add('pelvis', patch(P, [[0.36, 0.4], [0.47, 0.42], [0.47, 0.8], [0.38, 0.76]], { nu: 2, nv: 3, t: 0.05 }), W3, undefined, undefined, M);
  }
  // armour: tassets and belly plate
  const P2 = tube([[-0.62, 0.5, 0.4, 0.0, 2.5], [-0.34, 1.12, 0.78, -0.04, 2.5], [0.0, 1.36, 0.94, -0.06, 2.6], [0.3, 1.16, 0.84, -0.04, 2.5], [0.52, 0.68, 0.58, 0, 2.4]]);
  const b = A('belly', 'pelvis');
  k.add(b, patch(P2, [[-0.11, 0.3], [0.11, 0.3], [0.12, 0.94], [-0.12, 0.94]], { nu: 6, nv: 4, t: 0.06, ridge: 0.05, crown: 0.03 }), W3);
  k.add(b, patch(P2, [[-0.02, 0.32], [0.02, 0.32], [0.02, 0.9], [-0.02, 0.9]], { nu: 1, nv: 4, t: 0.05, lift: 0.08 }), CORAL);
  for (const [s, L] of [[1, 'R'], [-1, 'L']]) {
    const M = { mirror: s < 0 };
    const n = A('tas' + L, 'pelvis');
    for (let i = 0; i < 5; i++) {
      const u0 = 0.14 + i * 0.09, u1 = u0 + 0.1;
      k.add(n, patch(P2, [[u0, 0.0], [u1, 0.0], [u1 + 0.01, 0.72], [u0 - 0.01, 0.72]], { nu: 3, nv: 5, t: 0.1, flare: 0.2, ridge: 0.05, crease: 12 }), i % 2 ? W2 : W3, undefined, undefined, M);
    }
  }
  void W1; void DARK;
}

function buildAbdomen(k) {
  const { W1, W2, W3, CREAM, CORAL } = STY;
  const R = [[0.56, 0.5], [0.66, 0.6], [0.6, 0.56], [0.46, 0.42]];
  for (let i = 0; i < 4; i++) {
    const b = 'abd' + i;
    const [rx, rz] = R[i];
    const S = tube([[0.12, rx * 0.78, rz * 0.78], [-0.08, rx, rz], [-0.3, rx * 1.02, rz * 1.02], [-0.52, rx * 0.84, rz * 0.84], [-0.6, rx * 0.6, rz * 0.6]]);
    k.add(b, solid(S, { nu: 20, nv: 8, caps: true }), i % 2 ? W2 : W1);
    // ventral (front-facing when hanging): cream band
    k.add(b, patch(S, [[-0.09, 0.05], [0.09, 0.05], [0.1, 0.95], [-0.1, 0.95]], { nu: 4, nv: 4, t: 0.03, crown: 0.02 }), CREAM);
    for (const q of [1, -1]) k.add(b, patch(S, [[0.1, 0.05], [0.31, 0.05], [0.31, 0.92], [0.11, 0.92]], { nu: 5, nv: 4, t: 0.04, ridge: 0.03 }), W2, undefined, undefined, { mirror: q < 0 });
    // dorsal plate with a coral ridge
    k.add(b, patch(S, [[0.32, 0.0], [0.68, 0.0], [0.7, 0.94], [0.3, 0.94]], { nu: 8, nv: 4, t: 0.05, ridgeV: 0.02, flare: 0.04 }), W3);
    k.add(b, patch(S, [[0.485, 0.06], [0.515, 0.06], [0.515, 0.9], [0.485, 0.9]], { nu: 1, nv: 4, t: 0.04, lift: 0.06 }), CORAL);
    if (i === 3) k.add(b, sweep([[0, -0.55, 0, 0.24], [0, -0.9, -0.05, 0.16], [0, -1.28, 0.08, 0.001]], { seg: 8, nv: 8 }), STY.BONE);
  }
}

function buildWaist(k, A) {
  const { W1, W2, W3, DARK, CORAL, CREAM, MEM } = STY;
  const R = [0.38, 0.33, 0.35];
  for (let i = 0; i < 3; i++) {
    const b = 'waist' + (i + 1);
    const r = R[i], h = SK.waist[i + 1];
    k.add(b, ribs(null, r * 0.86, r, h, 4, 18).map((g) => g.translate(0, h / 2, 0)), DARK);
    const S = tube([[0, r + 0.04, r * 0.92 + 0.04], [h * 0.5, r + 0.1, r * 0.92 + 0.1], [h, r + 0.04, r * 0.92 + 0.04]]);
    k.add(b, patch(S, [[-0.5, 0.05], [0.5, 0.05], [0.5, 0.92], [-0.5, 0.92]], { nu: 18, nv: 2, t: 0.04, flare: 0.05, ridgeV: 0.02 }), i === 1 ? W3 : W2);
    k.add(b, patch(S, [[-0.08, 0.08], [0.08, 0.08], [0.08, 0.86], [-0.08, 0.86]], { nu: 3, nv: 2, t: 0.04, lift: 0.06 }), CREAM);
    const S2 = tube([[-0.04, r + 0.3, r * 0.92 + 0.3, 0, 2.4], [h * 0.5, r + 0.4, r * 0.92 + 0.4, 0, 2.4], [h + 0.04, r + 0.34, r * 0.92 + 0.34, 0, 2.4]]);
    const wa = A('wst' + i, b);
    k.add(wa, patch(S2, [[-0.5, 0.0], [0.5, 0.0], [0.5, 1.0], [-0.5, 1.0]], { nu: 20, nv: 2, t: 0.09, flare: 0.1, ridgeV: 0.02, crease: 14 }), i === 1 ? W2 : W3);
    k.add(wa, patch(S2, [[-0.05, 0.05], [0.05, 0.05], [0.05, 0.92], [-0.05, 0.92]], { nu: 2, nv: 2, t: 0.05, lift: 0.1, ridge: 0.03 }), CORAL);
    void W1; void CORAL; void MEM;
  }
}

// ------------------------------------------------------------------ thorax
function buildThorax(k, A, rng) {
  const { W1, W2, W3, DARK, CREAM, CORAL, MEM, BONE } = STY;
  // lean body (what is left after the shed): narrower, ribbed
  const C = tube([[-0.06, 0.44, 0.38, 0, 2.2], [0.28, 0.84, 0.66, 0.04, 2.3], [0.84, 1.16, 0.84, 0.04, 2.4], [1.36, 1.14, 0.84, 0.0, 2.4], [1.72, 0.8, 0.64, 0.0, 2.3], [1.96, 0.36, 0.34, 0, 2.2]]);
  k.add('chest', solid(C, { nu: 36, nv: 14 }), W1);
  // ribs after the shed: cream underplates
  for (let i = 0; i < 4; i++) {
    const v0 = 0.18 + i * 0.13;
    k.add('chest', patch(C, [[-0.1, v0], [0.1, v0], [0.11, v0 + 0.11], [-0.11, v0 + 0.11]], { nu: 4, nv: 2, t: 0.05, crown: 0.02, flare: 0.04 }), CREAM);
    for (const s of [1, -1]) k.add('chest', patch(C, [[0.13, v0 + 0.02], [0.33, v0 - 0.02], [0.34, v0 + 0.07], [0.14, v0 + 0.11]], { nu: 4, nv: 2, t: 0.05, ridge: 0.04, crease: 13 }), i % 2 ? W2 : W3, undefined, undefined, { mirror: s < 0 });
  }
  for (const s of [1, -1]) {
    const M = { mirror: s < 0 };
    k.add('chest', patch(C, [[0.3, 0.62], [0.48, 0.62], [0.5, 0.95], [0.32, 0.92]], { nu: 4, nv: 4, t: 0.06, crown: 0.03 }), W2, undefined, undefined, M);
    k.add('chest', ball(0.52, 14, 10), MEM, SK.sh, undefined, M);
    k.add('chest', ball(0.24, 12, 8), MEM, SK.ish, undefined, M);
    // the plate fragments that survive the shed: shoulder shards, gems bare in the flesh (Gb_ fly in s29)
    k.add('chest', patch(C, [[0.16, 0.8], [0.3, 0.76], [0.28, 0.96], [0.16, 0.98]], { nu: 3, nv: 3, t: 0.06, ridge: 0.05, crease: 14 }), W3, undefined, undefined, M);
  }
  k.add('chest', patch(C, [[0.46, 0.68], [0.54, 0.68], [0.54, 0.97], [0.46, 0.97]], { nu: 2, nv: 3, t: 0.06, ridge: 0.05 }), W3);
  k.add('neck', ribs(null, 0.32, 0.36, 0.4, 3, 16).map((g) => g.translate(0, 0.18, 0)), DARK);

  // ----- ARMOUR. Outer shell of the thorax
  const O = tube([[-0.04, 0.72, 0.62, 0.0, 2.3], [0.28, 1.22, 1.0, 0.06, 2.4], [0.84, 1.62, 1.26, 0.08, 2.5], [1.36, 1.64, 1.28, 0.02, 2.5], [1.74, 1.26, 1.06, -0.04, 2.3], [2.04, 0.62, 0.6, -0.04, 2.1]]);
  const dome = A('dome', 'chest');
  // pronotum: the big dorsal shield with a coral keel and the forward horn
  k.add(dome, patch(O, [[0.27, 0.56], [0.73, 0.56], [0.72, 1.0], [0.28, 1.0]], { nu: 18, nv: 6, t: 0.1, crown: 0.14, ridge: 0.05, crease: 24 }), W2);
  k.add(dome, patch(O, [[0.48, 0.56], [0.52, 0.56], [0.515, 1.0], [0.485, 1.0]], { nu: 1, nv: 6, t: 0.06, lift: 0.14 }), CORAL);
  for (let i = 0; i < 4; i++) { const v0 = 0.2 + i * 0.1; k.add(dome, patch(O, [[0.33, v0], [0.67, v0], [0.66, v0 + 0.11], [0.34, v0 + 0.11]], { nu: 12, nv: 2, t: 0.06, flare: 0.07, ridgeV: 0.03 }), i % 2 ? W2 : W3); }
  for (const s of [1, -1]) {
    const M = { mirror: s < 0 };
    k.add(dome, patch(O, [[0.28, 0.42], [0.385, 0.42], [0.39, 0.66], [0.285, 0.66]], { nu: 4, nv: 4, t: 0.08, ridge: 0.05, crease: 14 }), W3, undefined, undefined, M);
    // dorsal spikes
    for (let i = 0; i < 3; i++) {
      const u = 0.42 - i * 0.05, vv = 0.74 + i * 0.07;
      const [p] = surf(O, u, vv, 0.06);
      k.add(dome, thorn(0.7 - i * 0.14, 0.14, -0.6), W3, p.toArray(), [-20, 0, -26], M);
    }
  }
  // horn: arches up and forward above the head
  const HP = [[0, 1.62, -0.62, 0.6, 0.7], [0, 2.7, -0.82, 0.4, 0.8], [0, 3.72, -0.62, 0.26, 0.85], [0, 4.5, 0.02, 0.17, 0.85], [0, 4.86, 0.92, 0.1, 0.9], [0, 4.76, 1.72, 0.002, 1]];
  const horn = sweep(HP, { seg: 18, nv: 22, crease: 30, side: [1, 0, 0] });
  k.add(dome, horn, W3);
  // bone thorns on the crest of the horn, a coral keel under it, two side tines at the fork
  for (const [y, z, h, rx] of [[3.0, -1.2, 0.62, -68], [3.72, -0.98, 0.56, -46], [4.36, -0.44, 0.5, -24], [4.84, 0.18, 0.42, -6]]) k.add(dome, thorn(h, 0.12, 0.5), BONE, [0, y, z], [rx, 0, 0]);
  k.add(dome, sweep(HP.slice(0, 5).map(([x, y, z, r], i) => [x, y - 0.0, z + r * 0.86 * (i < 3 ? 1 : 0.8), 0.045 - i * 0.006]), { seg: 6, nv: 18 }), CORAL);
  for (const sg of [1, -1]) k.add(dome, sweep([[sg * 0.1, 3.5, -0.68, 0.14, 0.7], [sg * 0.62, 4.16, -0.5, 0.08, 0.7], [sg * 1.02, 4.32, -0.1, 0.002, 0.7]], { seg: 10, nv: 10, side: [0, 0, 1] }), W3);
  cluster(k, dome, O, 0.5, 0.74, 12, 0.3, 0.26, rng, undefined, [0.05, 0.13], 0.1);

  for (const [s, L] of [[1, 'R'], [-1, 'L']]) {
    const M = { mirror: s < 0 };
    const b = A('breast' + L, 'chest');
    k.add(b, patch(O, [[0.012, 0.42], [0.2, 0.36], [0.235, 0.86], [0.012, 0.9]], { nu: 7, nv: 8, t: 0.09, crown: 0.09, ridge: 0.05, crease: 14 }), W3, undefined, undefined, M);
    k.add(b, patch(O, [[0.02, 0.86], [0.235, 0.82], [0.26, 0.98], [0.04, 1.0]], { nu: 6, nv: 3, t: 0.08, flare: 0.08 }), W2, undefined, undefined, M);
    cluster(k, b, O, 0.1, 0.62, 9, 0.12, 0.24, rng, M, [0.05, 0.14], 0.08);
    const a = A('rib' + L, 'chest');
    for (let i = 0; i < 4; i++) {
      const v0 = 0.05 + i * 0.1;
      k.add(a, patch(O, [[0.05, v0], [0.25, v0 - 0.02], [0.26, v0 + 0.09], [0.06, v0 + 0.11]], { nu: 5, nv: 2, t: 0.07, flare: 0.07, ridge: 0.03, crease: 12 }), i % 2 ? W2 : W3, undefined, undefined, M);
    }
    const f = A('flank' + L, 'chest');
    k.add(f, patch(O, [[0.235, 0.28], [0.3, 0.28], [0.31, 0.84], [0.25, 0.84]], { nu: 3, nv: 6, t: 0.08, ridge: 0.06 }), W2, undefined, undefined, M);
    k.add(f, cbox(0.06, 0.9, 0.06, 0.02), CORAL, [1.52, 1.0, 0.56], [10, 0, -6], M);
  }
  // sternum: a big gem boss, the centre of the shield
  const st = A('sternum', 'chest');
  k.add(st, patch(O, [[-0.012, 0.34], [0.012, 0.34], [0.012, 0.94], [-0.012, 0.94]], { nu: 1, nv: 8, t: 0.06, lift: 0.1, ridge: 0.05 }), CORAL);
  const [cp, cn] = surf(O, 0, 0.6, 0.17);
  gem(k, st, cp, cn, 0.3, STY.GR);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const q = cp.clone().add(v3(Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0).applyAxisAngle(v3(1, 0, 0), -0.12));
    gem(k, st, q, cn, 0.09 + (i % 2) * 0.04, i % 2 ? STY.GC : STY.GT);
  }
  void CREAM; void DARK; void W1; void BONE;
}

// -------------------------------------------------------------------- head
function buildHead(k, A, rng) {
  const { W1, W2, W3, DARK, CREAM, CORAL, MEM, BONE } = STY;
  const b = 'head';
  // the wedge: broad crown, narrowing to a blunt muzzle
  const pts = [];
  const LR = (arr) => { for (const [x, y, z] of arr) { pts.push(v3(x, y, z)); if (x > 0.001) pts.push(v3(-x, y, z)); } };
  LR([[0.58, 0.6, 0.02], [0.34, 0.72, -0.24], [0, 0.8, 0.12], [0.55, 0.46, 0.28], [0.22, 0.46, 0.6], [0.12, 0.08, 0.66], [0.14, -0.3, 0.56], [0.09, -0.46, 0.34], [0.36, 0.14, -0.36], [0, 0.36, -0.56], [0.22, -0.2, -0.24], [0.3, -0.16, 0.32], [0, 0.56, 0.5]]);
  k.add(b, hull(pts, 26), W2);
  for (const s of [1, -1]) {
    const M = { mirror: s < 0 };
    // brow: a heavy raked ridge, the scowl of the wedge
    k.add(b, hull([v3(0.0, 0.5, 0.67), v3(0.26, 0.56, 0.6), v3(0.68, 0.74, 0.16), v3(0.7, 0.66, 0.02), v3(0.2, 0.42, 0.62), v3(0.0, 0.38, 0.68), v3(0.34, 0.64, 0.34), v3(0, 0.68, 0.46)], 20), W3, undefined, undefined, M);
    k.add(b, hull([v3(0.02, 0.5, 0.685), v3(0.3, 0.58, 0.59), v3(0.7, 0.75, 0.15), v3(0.71, 0.72, 0.1), v3(0.3, 0.545, 0.6), v3(0.02, 0.45, 0.695)], 20), CORAL, undefined, undefined, M);
    // cheek plate under the eye running to the mandible base
    k.add(b, hull([v3(0.5, 0.14, 0.2), v3(0.34, -0.12, 0.42), v3(0.14, -0.28, 0.58), v3(0.2, 0.02, 0.62), v3(0.48, 0.2, 0.36), v3(0.46, -0.04, 0.14), v3(0.22, -0.34, 0.36)], 18), W3, undefined, undefined, M);
    // face plate beside the keel
    k.add(b, hull([v3(0.03, 0.36, 0.69), v3(0.2, 0.38, 0.625), v3(0.14, 0.04, 0.68), v3(0.11, -0.28, 0.59), v3(0.03, -0.3, 0.62), v3(0.03, 0.04, 0.71), v3(0.11, 0.1, 0.56), v3(0.05, 0.3, 0.6)], 22), CREAM, undefined, undefined, M);
    // eye socket: a bony rim around the gem
    k.add(b, new THREE.TorusGeometry(0.385, 0.04, 8, 26).scale(1, 1.08, 1).rotateY(Math.PI / 2), W2, [SK.ey[0] - 0.04, SK.ey[1], SK.ey[2]], [0, 8, 0], M);
    k.add(b, ball(0.34, 14, 10), DARK, [0.52, 0.36, 0.08], undefined, M);
    // jaw hinge
    k.add(b, ball(0.16, 12, 8), MEM, [0.24, -0.24, 0.42], undefined, M);
    // maxillary palps
    k.add(b, sweep([[0.08, -0.36, 0.52, 0.05], [0.13, -0.56, 0.58, 0.04], [0.09, -0.7, 0.5, 0.024]], { seg: 6, nv: 6 }), W1, undefined, undefined, M);
    k.add(b, sweep([[0, 0.32, 0.38, 0.1], [0.06, 0.72, 0.42, 0.075], [0.13, 0.94, 0.52, 0.05]], { seg: 6, nv: 8 }), W3, [0.14, 0.34, 0.08], [0, 0, 0], M);
  }
  // centre keel: rises to a blade
  k.add(b, hull([v3(0, 0.82, 0.3), v3(0, 0.56, 0.72), v3(0, 0.08, 0.76), v3(0, -0.32, 0.65), v3(0.04, 0.5, 0.68), v3(-0.04, 0.5, 0.68), v3(0.04, -0.2, 0.62), v3(-0.04, -0.2, 0.62)], 14), CORAL);
  // ocelli: three small gems on the brow
  gem(k, b, [0, 0.57, 0.64], v3(0, 0.45, 1), 0.07, STY.GT);
  gem(k, b, [0.13, 0.48, 0.64], v3(0.2, 0.5, 1), 0.05, STY.GC);
  gem(k, b, [-0.13, 0.48, 0.64], v3(-0.2, 0.5, 1), 0.05, STY.GC);

  // armour of the head: crown crest and cheek guards
  const crown = A('crown', 'head');
  const CR = tube([[-0.05, 0.3, 0.3, -0.15, 2.3], [0.2, 0.52, 0.5, -0.1, 2.3], [0.56, 0.62, 0.6, -0.1, 2.4], [0.9, 0.42, 0.5, -0.16, 2.2]]);
  k.add(crown, patch(CR, [[0.26, 0.2], [0.74, 0.2], [0.72, 1.0], [0.28, 1.0]], { nu: 12, nv: 4, t: 0.07, ridge: 0.05, crown: 0.06, crease: 18 }), W3);
  for (const s of [1, -1]) k.add(crown, sweep([[0.34, 0.68, -0.08, 0.08, 0.6], [0.56, 1.0, -0.6, 0.05, 0.6], [0.66, 1.16, -1.12, 0.002, 0.6]], { seg: 6, nv: 10, side: [1, 0, 0] }), W3, undefined, undefined, { mirror: s < 0 });
  cluster(k, crown, CR, 0.5, 0.65, 7, 0.34, 0.5, rng, undefined, [0.03, 0.08], 0.09);

  // ------- mandibles: two jointed sickles with bone teeth
  for (const [s, L] of [[1, 'R'], [-1, 'L']]) {
    const M = { mirror: s < 0 };
    const m1 = 'md' + L, m2 = 'md2' + L;
    k.add(m1, sweep([[0, 0, -0.08, 0.15], [0.08, -0.05, 0.3, 0.17, 0.72], [0.02, -0.04, 0.72, 0.12, 0.72]], { seg: 10, nv: 10, side: [0, 1, 0] }), W3, undefined, undefined, M);
    k.add(m1, sweep([[0.12, 0.05, 0.05, 0.03], [0.17, 0.05, 0.42, 0.028], [0.1, 0.03, 0.72, 0.016]], { seg: 6, nv: 8 }), CORAL, undefined, undefined, M);
    k.add(m1, ball(0.13, 10, 8), W1, [0, -0.04, 0.72], undefined, M);
    // the sickle curves inward to the mouth
    k.add(m2, sweep([[0.02, -0.02, 0, 0.11, 0.7], [0.1, -0.05, 0.36, 0.1, 0.7], [0.0, -0.06, 0.72, 0.07, 0.7], [-0.3, -0.06, 0.98, 0.002, 0.7]], { seg: 10, nv: 16, side: [0, 1, 0] }), W2, undefined, undefined, M);
    for (let i = 0; i < 4; i++) {
      const tz = 0.14 + i * 0.2, tx = 0.0 + (i === 3 ? -0.12 : 0.04);
      k.add(m2, sweep([[tx - 0.02, -0.04, tz, 0.04], [tx - 0.12, -0.05, tz + 0.02, 0.02], [tx - 0.21, -0.05, tz + 0.06, 0.001]], { seg: 5, nv: 5 }), BONE, undefined, undefined, M);
    }
  }
  void W1; void CREAM;
}

// -------------------------------------------------------------- blade arm
function buildBladeArm(k, A, s, L, rng) {
  const { W1, W2, W3, DARK, CORAL, MEM, BONE, CREAM } = STY;
  const M = { mirror: s < 0 };
  const sh = 'sh' + L, el = 'el' + L, wr = 'wr' + L;
  const U = tube([[0.16, 0.22, 0.26, 0, 2.0], [-0.3, 0.25, 0.33, 0.02, 1.75], [-0.9, 0.19, 0.28, 0.02, 1.65], [-1.55, 0.14, 0.2, 0, 1.7], [-2.02, 0.13, 0.17, 0, 2.0]]);
  k.add(sh, solid(U, { nu: 18, nv: 8 }), W1, undefined, undefined, M);
  k.add(sh, patch(U, [[-0.1, 0.1], [0.1, 0.1], [0.1, 0.88], [-0.1, 0.88]], { nu: 4, nv: 5, t: 0.04, crown: 0.02 }), CREAM, undefined, undefined, M);
  k.add(sh, patch(U, [[0.12, 0.08], [0.4, 0.08], [0.4, 0.9], [0.12, 0.9]], { nu: 5, nv: 5, t: 0.05, ridge: 0.05, crease: 13 }), W2, undefined, undefined, M);
  k.add(sh, patch(U, [[0.6, 0.06], [0.88, 0.06], [0.88, 0.9], [0.6, 0.9]], { nu: 5, nv: 5, t: 0.05, ridge: 0.05, crease: 13 }), W3, undefined, undefined, M);
  k.add(el, ball(0.32, 12, 10), MEM, [0, 0, 0], undefined, M);
  // pauldron: three stacked shells with an upswept spike (armour)
  const pd = A('pd' + L, sh);
  const D = tube([[0.56, 0.12, 0.14, 0, 2.3, 0.0], [0.4, 0.54, 0.54, 0, 2.3, 0.06], [0.06, 0.7, 0.68, 0, 2.5, 0.08], [-0.4, 0.7, 0.66, 0, 2.5, 0.05], [-0.92, 0.56, 0.52, 0, 2.5, 0]]);
  k.add(pd, solid(D, { nu: 22, nv: 8 }), W2, undefined, undefined, M);
  const lame = (v0, v1, o, st) => k.add(pd, patch(D, [[-0.5, v0], [0.5, v0], [0.5, v1], [-0.5, v1]], { nu: 20, nv: 3, ...o }), st, undefined, undefined, M);
  lame(0.0, 0.52, { t: 0.08, crown: 0.06, crease: 16 }, W3);
  lame(0.48, 0.7, { t: 0.07, flare: 0.08 }, W2);
  lame(0.66, 0.84, { t: 0.07, flare: 0.1 }, W3);
  lame(0.8, 0.98, { t: 0.07, flare: 0.12 }, W2);
  k.add(pd, patch(D, [[0.22, 0.04], [0.28, 0.04], [0.28, 0.4], [0.22, 0.4]], { nu: 2, nv: 4, t: 0.05, lift: 0.1, ridge: 0.03 }), CORAL, undefined, undefined, M);
  k.add(pd, sweep([[0.24, 0.5, 0.0, 0.26, 0.7], [0.6, 1.08, -0.08, 0.14, 0.7], [1.06, 1.5, -0.26, 0.002, 0.7]], { seg: 10, nv: 14, side: [0, 0, 1] }), W3, undefined, undefined, M);
  k.add(pd, sweep([[0.1, 0.5, 0.3, 0.14, 0.7], [0.3, 0.98, 0.5, 0.08, 0.7], [0.62, 1.18, 0.76, 0.002, 0.7]], { seg: 8, nv: 10, side: [0, 0, 1] }), W2, undefined, undefined, M);
  cluster(k, pd, D, 0.25, 0.3, 11, 0.5, 0.36, rng, M, [0.045, 0.12], 0.1);
  // upper arm guard (armour)
  const ug = A('ug' + L, sh);
  k.add(ug, patch(U, [[0.14, 0.2], [0.44, 0.2], [0.42, 0.84], [0.16, 0.84]], { nu: 6, nv: 5, t: 0.08, lift: 0.05, ridge: 0.08, crease: 12 }), W3, undefined, undefined, M);
  // forearm: the thick raptorial femur with a spine row on its inner (+Z) side
  const F = tube([[0.08, 0.13, 0.22, 0, 1.9], [-0.5, 0.17, 0.37, 0.06, 1.55], [-1.2, 0.16, 0.36, 0.08, 1.55], [-1.75, 0.13, 0.26, 0.03, 1.7], [-1.98, 0.12, 0.2, 0, 2.0]]);
  k.add(el, solid(F, { nu: 18, nv: 8 }), W1, undefined, undefined, M);
  k.add(el, patch(F, [[-0.14, 0.06], [0.14, 0.06], [0.13, 0.9], [-0.13, 0.9]], { nu: 5, nv: 5, t: 0.04, crown: 0.02 }), CREAM, undefined, undefined, M);
  k.add(el, patch(F, [[0.16, 0.06], [0.42, 0.06], [0.42, 0.92], [0.16, 0.92]], { nu: 5, nv: 6, t: 0.05, ridge: 0.06, crease: 13 }), W2, undefined, undefined, M);
  k.add(el, patch(F, [[0.58, 0.06], [0.84, 0.06], [0.84, 0.92], [0.58, 0.92]], { nu: 5, nv: 6, t: 0.05, ridge: 0.06, crease: 13 }), W3, undefined, undefined, M);
  for (let i = 0; i < 6; i++) {
    const y = -0.34 - i * 0.26, h = 0.36 - i * 0.03 + (i % 2) * 0.12;
    k.add(el, thorn(h, 0.075, 0.35), BONE, [0, y, 0.42 - i * 0.012], [80, 0, 0], M);
  }
  // forearm guard (armour)
  const fg = A('fg' + L, el);
  k.add(fg, patch(F, [[0.56, 0.1], [0.94, 0.1], [0.92, 0.86], [0.58, 0.86]], { nu: 6, nv: 6, t: 0.08, lift: 0.04, ridge: 0.08, crease: 12 }), W3, undefined, undefined, M);
  cluster(k, fg, F, 0.75, 0.42, 5, 0.26, 0.6, rng, M, [0.04, 0.09], 0.12);
  for (let i = 0; i < 3; i++) k.add(fg, thorn(0.42, 0.07, -0.5), W2, [0, -0.5 - i * 0.48, -0.36], [-50, 0, 0], M);
  // wrist hinge, blade
  k.add(wr, ball(0.24, 12, 10), MEM, [0, 0, 0], undefined, M);
  k.add(wr, scythe(SK.blade, 0.86, 0.18, 0.2), STY.W3, [0, 0.02, -0.05], undefined, M);
  // bone cutting edge: a thinner parallel blade proud of the edge
  k.add(wr, scythe(SK.blade * 0.985, 0.6, 0.08, 0.2, 0.32), BONE, [0, -0.06, 0.16], undefined, M);
  k.add(wr, cylX(0.2, 0.36, 12), CORAL, [0, 0, 0], undefined, M);
  void W1; void DARK;
}

// ------------------------------------------------------------- inner arm
function buildInnerArm(k, A, s, L, j) {
  const { W1, W2, W3, DARK, CORAL, MEM, BONE, CREAM } = STY;
  const M = { mirror: s < 0 };
  const ish = 'ish' + L, iel = 'iel' + L, iwr = 'iwr' + L;
  const U = tube([[0.08, 0.17, 0.2, 0, 2], [-0.36, 0.19, 0.25, 0, 1.8], [-1.0, 0.13, 0.18, 0, 1.8], [-1.39, 0.1, 0.13, 0, 2]]);
  k.add(ish, solid(U, { nu: 14, nv: 6 }), W2, undefined, undefined, M);
  k.add(ish, patch(U, [[0.3, 0.1], [0.7, 0.1], [0.7, 0.86], [0.3, 0.86]], { nu: 6, nv: 4, t: 0.04, ridge: 0.04, crease: 13 }), W3, undefined, undefined, M);
  k.add(iel, ball(0.17, 10, 8), MEM, [0, 0, 0], undefined, M);
  const F = tube([[0.04, 0.11, 0.14, 0, 2], [-0.5, 0.16, 0.22, 0.01, 1.8], [-1.16, 0.13, 0.17, 0, 1.8], [-1.48, 0.11, 0.13, 0, 2]]);
  k.add(iel, solid(F, { nu: 14, nv: 6 }), W2, undefined, undefined, M);
  k.add(iel, patch(F, [[-0.14, 0.1], [0.14, 0.1], [0.12, 0.9], [-0.12, 0.9]], { nu: 4, nv: 4, t: 0.03 }), CREAM, undefined, undefined, M);
  k.add(iel, patch(F, [[0.36, 0.06], [0.64, 0.06], [0.64, 0.92], [0.36, 0.92]], { nu: 4, nv: 5, t: 0.05, ridge: 0.05, crease: 13 }), W3, undefined, undefined, M);
  for (let i = 0; i < 3; i++) k.add(iel, cbox(0.3, 0.08, 0.3, 0.02), i ? W1 : CORAL, [0, -1.32 - i * 0.05, 0]);
  // palm: blocky with a coral knuckle bar
  const P = tube([[0.05, 0.14, 0.2, 0, 3], [-0.14, 0.15, 0.27, 0, 3.2], [-0.34, 0.14, 0.31, 0, 3.2]]);
  k.add(iwr, solid(P, { nu: 18, nv: 5 }), W2, undefined, undefined, M);
  k.add(iwr, patch(P, [[0.1, 0.12], [0.4, 0.12], [0.4, 0.94], [0.1, 0.94]], { nu: 6, nv: 4, t: 0.04, crown: 0.02 }), W3, undefined, undefined, M);
  const seg = (bin, len, r, tip) => {
    k.add(bin, ball(r * 1.15, 10, 8), MEM, undefined, undefined, M);
    if (!tip) k.add(bin, sweep([[0, 0, 0, r * 1.12], [0, -len * 0.5, 0, r * 1.08], [0, -len, 0, r * 0.92]], { seg: 10, nv: 6 }), W2, undefined, undefined, M);
    else k.add(bin, sweep([[0, 0, 0, r], [0, -len * 0.3, 0, r * 0.98], [-r * 0.2, -len * 0.75, 0, r * 0.66], [-r * 0.95, -len * 1.35, 0, 0.002]], { seg: 10, nv: 12, side: [1, 0, 0] }), BONE, undefined, undefined, M);
    if (!tip) k.add(bin, patch(tube([[0, r * 1.2, r * 1.2], [-len, r * 1.08, r * 1.08]]), [[0.1, 0.1], [0.4, 0.1], [0.4, 0.9], [0.1, 0.9]], { nu: 3, nv: 2, t: r * 0.18, crown: r * 0.1, ridge: r * 0.08 }), W3, undefined, undefined, M);
  };
  for (let f = 0; f < 3; f++) {
    seg(`f${L}${f}a`, 0.3, 0.075, false);
    seg(`f${L}${f}b`, 0.26, 0.068, false);
    seg(`f${L}${f}c`, 0.26, 0.06, true);
  }
  seg(`th${L}a`, 0.22, 0.078, false);
  seg(`th${L}b`, 0.22, 0.066, true);
  void DARK; void CORAL; void j; void BONE; void W1;
}

// ------------------------------------------------------------------- leg
function buildLeg(k, A, s, L, rng) {
  const { W1, W2, W3, DARK, CORAL, MEM, BONE, CREAM } = STY;
  const M = { mirror: s < 0 };
  const hip = 'hip' + L, knee = 'knee' + L, hock = 'hock' + L, foot = 'foot' + L;
  // thigh: heavy at the hip
  const T = tube([[0.32, 0.44, 0.54, 0.02, 2.1], [-0.3, 0.58, 0.78, 0.06, 1.9], [-1.0, 0.46, 0.68, 0.06, 1.8], [-1.7, 0.27, 0.42, 0.02, 1.8], [-2.12, 0.22, 0.33, 0, 2.0]]);
  k.add(hip, solid(T, { nu: 20, nv: 9 }), W1, undefined, undefined, M);
  k.add(hip, patch(T, [[-0.07, 0.14], [0.07, 0.14], [0.06, 0.86], [-0.06, 0.86]], { nu: 5, nv: 5, t: 0.04, crown: 0.03 }), CREAM, undefined, undefined, M);
  k.add(hip, patch(T, [[0.16, 0.1], [0.42, 0.1], [0.42, 0.9], [0.16, 0.9]], { nu: 5, nv: 6, t: 0.06, ridge: 0.06, crease: 13 }), W2, undefined, undefined, M);
  k.add(hip, patch(T, [[0.58, 0.1], [0.84, 0.1], [0.84, 0.9], [0.58, 0.9]], { nu: 5, nv: 6, t: 0.06, ridge: 0.06, crease: 13 }), W3, undefined, undefined, M);
  k.add(knee, ball(0.34, 14, 10), MEM, undefined, undefined, M);
  // thigh armour
  const tha = A('th' + L, hip);
  k.add(tha, patch(T, [[-0.13, 0.12], [0.13, 0.12], [0.12, 0.8], [-0.12, 0.8]], { nu: 4, nv: 5, t: 0.14, lift: 0.13, ridge: 0.09, crease: 12 }), W3, undefined, undefined, M);
  k.add(tha, patch(T, [[0.15, 0.08], [0.48, 0.08], [0.46, 0.84], [0.17, 0.84]], { nu: 6, nv: 5, t: 0.14, lift: 0.13, ridge: 0.06, crease: 12 }), W2, undefined, undefined, M);
  k.add(tha, patch(T, [[0.52, 0.06], [0.86, 0.06], [0.84, 0.86], [0.54, 0.86]], { nu: 6, nv: 5, t: 0.14, lift: 0.13, ridge: 0.06, crease: 12 }), W3, undefined, undefined, M);
  cluster(k, tha, T, 0.32, 0.46, 9, 0.28, 0.5, rng, M, [0.04, 0.11], 0.14);
  // knee cowl with a forward spike (armour, stays with the knee joint)
  const kn = A('kn' + L, knee);
  const KC = tube([[0.44, 0.26, 0.2, 0.28, 2.4], [0.1, 0.5, 0.42, 0.28, 2.4], [-0.36, 0.44, 0.34, 0.22, 2.4]]);
  k.add(kn, solid(KC, { nu: 16, nv: 6 }), W3, undefined, undefined, M);
  k.add(kn, sweep([[0, 0.05, 0.42, 0.18, 0.7], [0, 0.18, 0.9, 0.09, 0.7], [0, 0.42, 1.32, 0.002, 0.7]], { seg: 8, nv: 10, side: [1, 0, 0] }), W2, undefined, undefined, M);
  // shin: slimmer, spined on the back
  const N = tube([[0.1, 0.2, 0.3, 0.0, 2.0], [-0.5, 0.25, 0.38, -0.03, 1.8], [-1.3, 0.19, 0.28, -0.04, 1.75], [-2.0, 0.13, 0.18, -0.01, 1.8], [-2.34, 0.12, 0.16, 0, 2.0]]);
  k.add(knee, solid(N, { nu: 18, nv: 8 }), W1, undefined, undefined, M);
  k.add(knee, patch(N, [[-0.07, 0.08], [0.07, 0.08], [0.05, 0.9], [-0.05, 0.9]], { nu: 4, nv: 5, t: 0.04, crown: 0.02 }), CREAM, undefined, undefined, M);
  k.add(knee, patch(N, [[0.16, 0.06], [0.44, 0.06], [0.42, 0.92], [0.16, 0.92]], { nu: 5, nv: 6, t: 0.05, ridge: 0.05, crease: 13 }), W2, undefined, undefined, M);
  k.add(knee, patch(N, [[0.56, 0.06], [0.84, 0.06], [0.84, 0.92], [0.58, 0.92]], { nu: 5, nv: 6, t: 0.05, ridge: 0.05, crease: 13 }), W3, undefined, undefined, M);
  for (let i = 0; i < 5; i++) {
    const y = -0.42 - i * 0.36;
    k.add(knee, thorn(0.34 - i * 0.03, 0.07, 0.25), BONE, [0, y, -0.25 + i * 0.03], [-80, 0, 0], M);
  }
  const gr = A('gr' + L, knee);
  k.add(gr, patch(N, [[-0.32, 0.06], [0.32, 0.06], [0.26, 0.88], [-0.26, 0.88]], { nu: 8, nv: 5, t: 0.13, lift: 0.12, ridge: 0.08, crease: 12 }), W3, undefined, undefined, M);
  k.add(hock, ball(0.2, 12, 8), MEM, undefined, undefined, M);
  // metatarsal: long and lean with a hock spur
  const MT = tube([[0.06, 0.16, 0.18, -0.02, 2.3], [-0.5, 0.2, 0.22, -0.02, 2.4], [-1.4, 0.16, 0.18, 0, 2.4], [-1.97, 0.2, 0.22, 0, 2.3]]);
  k.add(hock, solid(MT, { nu: 16, nv: 6 }), W1, undefined, undefined, M);
  k.add(hock, patch(MT, [[-0.16, 0.08], [0.16, 0.08], [0.14, 0.92], [-0.14, 0.92]], { nu: 5, nv: 5, t: 0.04, ridge: 0.03 }), W3, undefined, undefined, M);
  k.add(hock, patch(MT, [[0.42, 0.08], [0.58, 0.08], [0.58, 0.92], [0.42, 0.92]], { nu: 3, nv: 5, t: 0.03 }), CREAM, undefined, undefined, M);
  k.add(hock, sweep([[0, -0.02, -0.16, 0.13, 0.7], [0, 0.18, -0.42, 0.08, 0.7], [0, 0.46, -0.58, 0.002, 0.7]], { seg: 8, nv: 8, side: [1, 0, 0] }), BONE, undefined, undefined, M);
  const mt = A('mt' + L, hock);
  k.add(mt, patch(MT, [[-0.17, 0.2], [0.17, 0.2], [0.16, 0.9], [-0.16, 0.9]], { nu: 5, nv: 5, t: 0.1, lift: 0.08, ridge: 0.05 }), W2, undefined, undefined, M);
  cluster(k, mt, MT, 0, 0.55, 5, 0.26, 0.6, rng, M, [0.03, 0.075], 0.1);

  // ---- foot: pad + three toes + a spur. Sole is flat at local y = -ballH.
  const B = -SK.ballH;
  k.add(foot, hull([v3(0.34, 0.26, 0.24), v3(-0.34, 0.26, 0.24), v3(0.42, B, 0.44), v3(-0.42, B, 0.44), v3(0.26, B, -0.34), v3(-0.26, B, -0.34), v3(0.2, 0.3, -0.2), v3(-0.2, 0.3, -0.2)], 22), W2, undefined, undefined, M);
  const toe = (a, len, tag) => {
    const c = Math.cos(deg(a)), sn = Math.sin(deg(a));
    const P0 = [sn * 0.2, -0.04, c * 0.2];
    const pt = (d, y, r) => [sn * d, y, c * d, r];
    const r0 = 0.2;
    k.add(foot, sweep([[P0[0], B + r0 * 1.02, P0[2], r0], pt(0.55, B + r0 * 0.98, r0 * 0.96), pt(0.9, B + r0 * 0.86, r0 * 0.8)], { seg: 10, nv: 8 }), W2, undefined, undefined, M);
    // plate over the toe
    k.add(foot, sweep([[sn * 0.32, B + r0 * 1.6, c * 0.32, r0 * 0.5, 0.42], [sn * 0.62, B + r0 * 1.72, c * 0.62, r0 * 0.58, 0.42], [sn * 0.92, B + r0 * 1.46, c * 0.92, r0 * 0.36, 0.42]], { seg: 8, nv: 6, side: [c, 0, -sn] }), W3, undefined, undefined, M);
    // joint coral ring
    k.add(foot, ball(r0 * 0.74, 8, 6), CORAL, [sn * 0.94, B + r0 * 0.72, c * 0.94], undefined, M);
    // claw: bone, hooking down into the tile line
    k.add(foot, sweep([pt(0.94, B + r0 * 0.74, r0 * 0.56), pt(0.94 + len * 0.42, B + r0 * 0.94, r0 * 0.42), pt(0.94 + len, B + 0.018, 0.002)], { seg: 8, nv: 8, crease: 50 }), BONE, undefined, undefined, M);
    void tag;
  };
  toe(30, 0.68, 'o');
  toe(0, 0.76, 'm');
  toe(-30, 0.68, 'i');
  // rear spur
  k.add(foot, sweep([[0, B + 0.2, -0.32, 0.16], [0, B + 0.18, -0.74, 0.1], [0, B + 0.01, -1.08, 0.002]], { seg: 8, nv: 8, crease: 50 }), BONE, undefined, undefined, M);
  void W1; void DARK; void CORAL;
}

// ------------------------------------------------------- loose gems
function buildFreeGems(k, J, j, root, rng) {
  // Gems that scatter at the shed (G_) from the chest; and the ones in the bare flesh that tear out in s29 (Gb_).
  const list = [];
  for (let i = 0; i < 36; i++) {
    const n = J('G_' + i, j.chest, [0, 0, 0]);
    const st = GEMS[i % 3];
    const r = 0.1 + rng.next() * 0.17;
    const px = (rng.next() - 0.5) * 2.0, py = 0.4 + rng.next() * 1.3, pz = 0.5 + rng.next() * 0.4;
    k.add(n.name, gemGeo(r), st, [px, py, pz]);
    list.push(n);
  }
  for (let i = 0; i < 20; i++) {
    const n = J('Gb_' + i, j.chest, [0, 0, 0]);
    const st = GEMS[i % 3];
    const r = 0.1 + rng.next() * 0.2;
    const a = rng.next() * 6.28;
    const px = Math.cos(a) * (0.5 + rng.next() * 0.62), py = 0.5 + rng.next() * 1.1, pz = Math.abs(Math.sin(a)) * 0.2 + 0.6;
    k.add(n.name, gemGeo(r), st, [px, py, pz]);
    list.push(n);
  }
  return list;
}
export { cyl, cylZ, superPts };

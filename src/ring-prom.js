import * as THREE from 'three';
import { Rng, clamp } from './util.js';
import { PROM, RAIL, POD, CRATER, PILLAR, WARLORD } from './layout.js';
import { propMaterial, craterMaterial, floorMaterial, RU } from './ring-mat.js';
import { foliageMaterial } from './bgmaterials.js';
import { craterRim } from './ring-geo.js';

// Street furniture: every shell is closed so QA can test against it.
export class PB {
  constructor() { this.p = []; this.n = []; this.u = []; this.k = []; this.i = []; this.v = 0; }
  // lathe around Y: profile [[r, y]...] bottom to top. closed: caps both ends. lobes: {k,a,ph}
  lathe(profile, o = {}) {
    const segs = o.segs ?? 16;
    const m = profile.length;
    const lobe = o.lobe;
    const kind = o.kind ?? 0, seed = o.seed ?? 0, part = o.part ?? 0;
    const T = o.m ?? new THREE.Matrix4();
    const v = new THREE.Vector3(), N = new THREE.Vector3();
    const ofs = this.v;
    const nm = new THREE.Matrix3().getNormalMatrix(T);
    const rr = (r, th, y) => (lobe ? r * (1 + lobe.a * Math.cos(lobe.k * th + (lobe.ph ?? 0))) : r);
    for (let i = 0; i < m; i++) {
      const [r, y] = profile[i];
      const [r0, y0] = profile[Math.max(0, i - 1)], [r1, y1] = profile[Math.min(m - 1, i + 1)];
      for (let j = 0; j <= segs; j++) {
        const th = (j / segs) * Math.PI * 2;
        const R = rr(r, th, y);
        v.set(R * Math.cos(th), y, R * Math.sin(th)).applyMatrix4(T);
        this.p.push(v.x, v.y, v.z);
        const dy = y1 - y0, dr = r1 - r0;
        N.set(Math.cos(th) * dy, -dr, Math.sin(th) * dy).normalize().applyMatrix3(nm).normalize();
        this.n.push(N.x, N.y, N.z);
        this.u.push((j / segs) * 4, y);
        this.k.push(kind, seed, part, 0);
      }
    }
    for (let i = 0; i < m - 1; i++) for (let j = 0; j < segs; j++) {
      const a = ofs + i * (segs + 1) + j, b = a + 1, c = a + segs + 1, d = c + 1;
      this.i.push(a, c, b, b, c, d);
    }
    this.v += m * (segs + 1);
    if (o.closed !== false) {
      const addCap = (ringI, up) => {
        const [r, y] = profile[ringI];
        const c0 = this.v;
        v.set(0, y, 0).applyMatrix4(T);
        this.p.push(v.x, v.y, v.z);
        N.set(0, up, 0).applyMatrix3(nm).normalize();
        this.n.push(N.x, N.y, N.z); this.u.push(0, y); this.k.push(kind, seed, part, 0);
        const base = this.v + 1;
        for (let j = 0; j <= segs; j++) {
          const th = (j / segs) * Math.PI * 2;
          const R = rr(r, th, y);
          v.set(R * Math.cos(th), y, R * Math.sin(th)).applyMatrix4(T);
          this.p.push(v.x, v.y, v.z);
          this.n.push(N.x, N.y, N.z); this.u.push((j / segs) * 4, y); this.k.push(kind, seed, part, 0);
        }
        for (let j = 0; j < segs; j++) {
          if (up > 0) this.i.push(c0, base + j + 1, base + j); else this.i.push(c0, base + j, base + j + 1);
        }
        this.v += segs + 2;
      };
      addCap(0, -1); addCap(m - 1, 1);
    }
  }
  // rounded box: a closed 6-face box with soft chamfers baked as bevel strips
  box(c, s, o = {}) {
    const [hx, hy, hz] = [s[0] / 2, s[1] / 2, s[2] / 2];
    const B = Math.min(o.bevel ?? 0.03, hx * 0.8, hy * 0.8, hz * 0.8);
    const kind = o.kind ?? 0, seed = o.seed ?? 0, part = o.part ?? 0;
    const T = new THREE.Matrix4();
    if (o.m) T.copy(o.m); T.multiply(new THREE.Matrix4().makeTranslation(c[0], c[1], c[2]));
    const ofs = this.v;
    const v = new THREE.Vector3(), N = new THREE.Vector3();
    const nm = new THREE.Matrix3().getNormalMatrix(T);
    const verts = [];
    // an 8-corner box with beveled corners: 24 verts + quads
    const P = (x, y, z, nx, ny, nz) => { verts.push([x, y, z, nx, ny, nz]); return verts.length - 1; };
    const qd = [];
    const face = (axis, sign) => {
      const a = (axis + 1) % 3, b = (axis + 2) % 3;
      const h = [hx, hy, hz];
      const n = [0, 0, 0]; n[axis] = sign;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, w]) => {
        const p = [0, 0, 0];
        p[axis] = sign * h[axis];
        p[a] = u * (h[a] - B); p[b] = w * (h[b] - B);
        return P(p[0], p[1], p[2], n[0], n[1], n[2]);
      });
      if (sign > 0) qd.push([corners[0], corners[1], corners[2], corners[3]]);
      else qd.push([corners[3], corners[2], corners[1], corners[0]]);
      return corners;
    };
    const F = {};
    for (let ax = 0; ax < 3; ax++) { F[ax + '+'] = face(ax, 1); F[ax + '-'] = face(ax, -1); }
    // edges and corners stitching: emit bevel triangles by connecting neighbours with averaged normals
    const addV = (id) => { const [x, y, z, nx, ny, nz] = verts[id]; v.set(x, y, z).applyMatrix4(T); this.p.push(v.x, v.y, v.z); N.set(nx, ny, nz).applyMatrix3(nm).normalize(); this.n.push(N.x, N.y, N.z); this.u.push(x + z, y + z); this.k.push(kind, seed, part, 0); };
    for (let i = 0; i < verts.length; i++) addV(i);
    const idx = (a) => ofs + a;
    for (const q of qd) this.i.push(idx(q[0]), idx(q[1]), idx(q[2]), idx(q[0]), idx(q[2]), idx(q[3]));
    // bevel strips between adjacent faces (simple stitch)
    const edge = (a0, a1, b0, b1) => { this.i.push(idx(a0), idx(b0), idx(a1), idx(a1), idx(b0), idx(b1)); };
    const find = (ax, sgn, cu, cw) => {
      const a = (ax + 1) % 3, b = (ax + 2) % 3; const h = [hx, hy, hz];
      return F[ax + (sgn > 0 ? '+' : '-')][cu < 0 ? (cw < 0 ? 0 : 3) : (cw < 0 ? 1 : 2)];
    };
    // edges: for each pair of faces sharing an edge along axis c
    for (let c = 0; c < 3; c++) {
      const a = (c + 1) % 3, b = (c + 2) % 3;
      for (const sa of [1, -1]) for (const sb of [1, -1]) {
        // face a (normal a) corners along c at (b = sb side); face b corners along c at (a = sa side)
        const pick = (face, axisAcross, sAcross, cc) => {
          const fa = (face + 1) % 3, fb = (face + 2) % 3;
          // this face's coordinates: (u along fa, w along fb)
          let u, w;
          if (fa === axisAcross) { u = sAcross; w = cc; } else { u = cc; w = sAcross; }
          return find(face, face === a ? sa : sb, u, w);
        };
        const a0 = pick(a, b, sb, -1), a1 = pick(a, b, sb, 1), b0 = pick(b, a, sa, -1), b1 = pick(b, a, sa, 1);
        const out = sa * sb * ((a + 1) % 3 === b ? 1 : -1);
        if (out > 0) edge(a1, a0, b1, b0); else edge(a0, a1, b0, b1);
      }
    }
    // the 8 corner triangles
    for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
      const pickC = (face, s) => {
        const fa = (face + 1) % 3, fb = (face + 2) % 3; const sg = [sx, sy, sz];
        return find(face, sg[face], sg[fa], sg[fb]);
      };
      const p0 = pickC(0), p1 = pickC(1), p2 = pickC(2);
      const flip = sx * sy * sz > 0;
      if (flip) this.i.push(idx(p0), idx(p1), idx(p2)); else this.i.push(idx(p2), idx(p1), idx(p0));
    }
    this.v += verts.length;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('aK', new THREE.Float32BufferAttribute(this.k, 4));
    g.setIndex(this.v > 65000 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    return g;
  }
}

const translateY = (x, y, z, ry = 0) => { const m = new THREE.Matrix4().makeRotationY(ry); m.setPosition(x, y, z); return m; };

// one 2.4 m bay of the balustrade: a fat post, fat bulbous balusters, a curved coral top rail, a low curb
function railBay(pb, x, z, seed) {
  const H = RAIL.h;
  // post
  pb.box([x - 1.2 + 0.2, H * 0.42, z], [0.38, H * 0.84, 0.46], { kind: 0, seed, bevel: 0.04, part: 0 });
  pb.lathe([[0.24, H - 0.32], [0.3, H - 0.3], [0.32, H - 0.2], [0.26, H - 0.08], [0.1, H + 0.03], [0, H + 0.04]], { m: translateY(x - 1, 0, z), kind: 0, seed, segs: 12, part: 2 });
  // curb and top rail
  pb.box([x + 0.2, 0.09, z], [2.0, 0.18, 0.44], { kind: 0, seed: seed + 1, bevel: 0.03, part: 1 });
  pb.box([x + 0.2, H - 0.06, z], [2.0, 0.14, 0.3], { kind: 0, seed: seed + 2, bevel: 0.05, part: 2 });
  // balusters: bellied like little amphorae
  for (let b = 0; b < 6; b++) {
    const bx = x - 0.66 + b * 0.34;
    const y0 = 0.17;
    const h = H - y0 - 0.12;
    pb.lathe([[0.075, y0 - 0.02], [0.095, y0 + 0.01], [0.07, y0 + 0.05], [0.14, y0 + 0.24 * h], [0.15, y0 + 0.4 * h], [0.08, y0 + 0.72 * h], [0.06, y0 + 0.85 * h], [0.09, y0 + h], [0.08, y0 + h + 0.03]], { m: translateY(bx, 0, z), kind: 0, seed: seed + b * 0.1, segs: 10, part: 1 });
  }
}

function planter(pb, x, z, seed, r = 0.72) {
  const lobe = { k: 8, a: 0.012, ph: seed * 9 };
  const h = 0.72;
  // a turned coral urn: foot, swelling belly, a thick lip; the top of the shell sits below the soil
  pb.lathe([[0, 0], [r * 0.72, 0], [r * 0.78, 0.035], [r * 0.73, 0.09], [r * 0.8, h * 0.24], [r * 0.99, h * 0.62], [r * 1.12, h * 0.83], [r * 1.17, h * 0.87], [r * 1.17, h * 0.98], [r * 1.1, h], [r * 0.93, h], [r * 0.9, h - 0.14]], { m: translateY(x, 0, z), kind: 0, seed, segs: 26, lobe, part: 0 });
  pb.lathe([[r * 0.965, h * 0.56], [r * 1.015, h * 0.575], [r * 1.05, h * 0.64], [r * 1.0, h * 0.655]], { m: translateY(x, 0, z), kind: 2, seed, segs: 26, part: 2 });
  // soil: a separate closed disc sitting just inside the rim, top below the rim
  pb.lathe([[0, h - 0.09], [r * 0.9, h - 0.09], [r * 0.9, h - 0.05], [0, h - 0.04]], { m: translateY(x, 0, z), kind: 3, seed, segs: 18, part: 1 });
  // gnarled olive trunk rising from the soil
  const rng = new Rng(Math.floor(seed * 1e4) + 3);
  const lean = rng.range(0, 6.28), bend = rng.range(0.16, 0.3);
  const n = 7;
  const prof = [];
  for (let i = 0; i <= n; i++) prof.push(i);
  const pts = (k) => {
    const y = h - 0.05 + k * 1.75;
    const off = Math.sin(k * 2.5) * bend * (1 - 0.3 * k) * 0.55;
    return [x + Math.cos(lean) * off + Math.sin(k * 5.0) * 0.03, y, z + Math.sin(lean) * off + Math.cos(k * 3.5) * 0.03];
  };
  for (let i = 0; i < n; i++) {
    const k0 = i / n, k1 = (i + 1) / n;
    const c0 = pts(k0), c1 = pts(k1);
    const r0 = 0.11 * (1 - 0.55 * k0) * (1 + 0.5 * Math.exp(-Math.pow(k0 * 6, 2))), r1 = 0.11 * (1 - 0.55 * k1);
    const m = lookUp(c0, c1);
    const L = Math.hypot(c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]);
    pb.lathe([[r0, 0], [r1, L * 1.04]], { m, kind: 4, seed, segs: 8, part: 2 });
  }
  return { top: pts(1), h, r };
}

const lookUp = (a, b) => {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  const m = new THREE.Matrix4();
  const up = Math.abs(d.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const x = new THREE.Vector3().crossVectors(up, d).normalize();
  const z = new THREE.Vector3().crossVectors(x, d).normalize();
  m.makeBasis(x, d, z);
  m.setPosition(a[0], a[1], a[2]);
  return m;
};

function bench(pb, x, z, ry, seed) {
  const m = translateY(x, 0, z, ry);
  const seatW = 2.2;
  // two coral pedestals, like a pair of molars
  for (const s of [-1, 1]) {
    pb.lathe([[0.28, 0], [0.3, 0.02], [0.24, 0.12], [0.22, 0.32], [0.27, 0.4], [0.31, 0.43], [0, 0.44]], { m: new THREE.Matrix4().multiplyMatrices(m, translateY(s * 0.85, 0, 0)), kind: 0, seed: seed + s, segs: 14, lobe: { k: 4, a: 0.06 }, part: 1 });
  }
  // a curved slab seat with slats of wood on top
  pb.box([0, 0.47, 0], [seatW, 0.08, 0.5], { kind: 0, seed, bevel: 0.03, m, part: 0 });
  for (let i = 0; i < 5; i++) pb.box([0, 0.535, -0.2 + i * 0.1], [seatW - 0.14, 0.05, 0.08], { kind: 1, seed: seed + i * 0.1, bevel: 0.012, m, part: 2 });
  // a backrest: two brass uprights and a wooden rail
  for (const s of [-0.85, 0.85]) pb.box([s, 0.8, -0.24], [0.05, 0.56, 0.05], { kind: 2, seed, bevel: 0.01, m, part: 1 });
  pb.box([0, 1.0, -0.26], [seatW - 0.1, 0.13, 0.05], { kind: 1, seed: seed + 3, bevel: 0.012, m, part: 2 });
}

function lamp(pb, x, z, seed) {
  // a pale stalk that bends over like a coral branch and carries a shell of a lantern
  const H = 5.6;
  const path = [];
  for (let i = 0; i <= 9; i++) { const k = i / 9; path.push([x + 0.7 * k * k * k, k * H - 0.02, z]); }
  for (let i = 0; i < 9; i++) {
    const k0 = i / 9;
    const a = path[i], b = path[i + 1];
    const r0 = 0.125 * (1 - 0.5 * k0) + 0.05 * Math.exp(-k0 * k0 * 40), r1 = 0.125 * (1 - 0.5 * (k0 + 1 / 9));
    pb.lathe([[r0, 0], [r1, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 1.05]], { m: lookUp(a, b), kind: 0, seed, segs: 9, part: 0 });
  }
  const tip = path[9];
  // a fluted bell foot and brass collars: the stalk has a base and a rhythm
  pb.lathe([[0.3, 0], [0.31, 0.05], [0.2, 0.17], [0.17, 0.42], [0.15, 0.5]], { m: translateY(x, -0.01, z), kind: 0, seed, segs: 14, part: 0 });
  pb.lathe([[0.155, 0], [0.19, 0.03], [0.19, 0.08], [0.15, 0.11]], { m: translateY(x, 0.47, z), kind: 2, seed, segs: 14, part: 2 });
  for (const k of [0.55, 0.8]) {
    const px = x + 0.7 * k * k * k, r = 0.125 * (1 - 0.5 * k);
    pb.lathe([[r, 0], [r + 0.045, 0.02], [r + 0.045, 0.06], [r, 0.08]], { m: translateY(px, k * H, z), kind: 2, seed, segs: 12, part: 2 });
  }
  pb.lathe([[0.04, -0.02], [0.3, -0.02], [0.34, 0.05], [0.14, 0.42], [0.03, 0.54], [0.0, 0.56]], { m: translateY(tip[0], H - 0.26, tip[2]), kind: 2, seed, segs: 14, part: 2 });
  pb.lathe([[0.28, 0], [0.32, 0.04], [0.24, 0.34], [0, 0.38]], { m: translateY(tip[0], H - 0.72, tip[2]), kind: 7, seed, segs: 14, part: 1 });
}

// the sky-tram pod: an enamel capsule, nose-first in the tiles
function buildPod() {
  const pb = new PB();
  const L = POD.len, R = 0.68;
  // axis +Y of the local frame runs from the nose (y=0, buried) to the tail
  const tail = L;
  // body
  const body = [];
  const steps = 22;
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const y = k * tail;
    const nose = Math.pow(Math.min(1, k / 0.22), 0.55);
    const rear = k > 0.86 ? Math.pow(1 - (k - 0.86) / 0.14, 0.7) * 0.92 + 0.08 : 1;
    body.push([Math.max(0.02, R * nose * rear * (0.92 + 0.08 * Math.sin(k * 3.1))), y]);
  }
  pb.lathe(body, { kind: 5, seed: 0.2, segs: 28, part: 0 });
  // a dark glazed belt with a row of real windows standing proud of it, brass-framed
  pb.lathe([[0.69, 1.6], [0.706, 1.62], [0.706, 2.28], [0.69, 2.3]], { kind: 9, seed: 0.3, segs: 28, part: 1 });
  const nW = 8;
  for (let i = 0; i < nW; i++) {
    const a = ((i + 0.5) / nW) * Math.PI * 2;
    const ry = new THREE.Matrix4().makeRotationY(-a);
    pb.box([0.712, 1.95, 0], [0.04, 0.54, 0.34], { kind: 2, seed: 0.5, bevel: 0.012, m: ry, part: 2 });
    pb.box([0.732, 1.95, 0], [0.03, 0.44, 0.25], { kind: 6, seed: 0.3 + i * 0.07, bevel: 0.01, m: ry, part: 1 });
  }
  // long brass rails down the skin, the rivet-line of an old tram
  for (let i = 0; i < 4; i++) {
    const a = ((i + 0.125) / 4) * Math.PI * 2;
    const ry = new THREE.Matrix4().makeRotationY(-a);
    pb.box([0.7, 0.98, 0], [0.04, 0.72, 0.045], { kind: 2, seed: 0.4, bevel: 0.012, m: ry, part: 2 });
    pb.box([0.685, 2.78, 0], [0.04, 0.5, 0.045], { kind: 2, seed: 0.4, bevel: 0.012, m: ry, part: 2 });
  }
  // coral stripe and brass collar rings
  pb.lathe([[0.69, 1.32], [0.72, 1.34], [0.72, 1.5], [0.69, 1.52]], { kind: 0, seed: 0.1, segs: 28, part: 2 });
  pb.lathe([[0.68, 2.42], [0.73, 2.44], [0.73, 2.5], [0.68, 2.52]], { kind: 2, seed: 0.4, segs: 28, part: 1 });
  pb.lathe([[0.62, 3.0], [0.66, 3.02], [0.66, 3.08], [0.62, 3.1]], { kind: 2, seed: 0.45, segs: 24, part: 1 });
  // tail: the torn hanger arm, a brass stub on top with a sheared end
  // a broad riveted cap, then a flat pylon: a tram's hanger, not a bottle's neck
  pb.lathe([[0.5, 3.24], [0.56, 3.28], [0.56, 3.36], [0.42, 3.42], [0, 3.44]], { kind: 2, seed: 0.5, segs: 22, part: 2 });
  pb.box([0, 3.6, 0], [0.92, 0.42, 0.26], { kind: 5, seed: 0.52, bevel: 0.05, part: 1 });
  // the trolley it hung from: a yoke with a grooved wheel, ripped off the cable
  pb.box([0.17, 3.98, 0], [0.05, 0.42, 0.14], { kind: 2, seed: 0.55, bevel: 0.015, part: 1 });
  pb.box([-0.17, 3.98, 0], [0.05, 0.42, 0.14], { kind: 2, seed: 0.55, bevel: 0.015, part: 1 });
  pb.box([0, 3.82, 0], [0.4, 0.07, 0.15], { kind: 2, seed: 0.55, bevel: 0.015, part: 2 });
  const wheelM = new THREE.Matrix4().makeRotationZ(Math.PI / 2); wheelM.setPosition(0.12, 4.04, 0);
  pb.lathe([[0, 0], [0.17, 0], [0.19, 0.03], [0.13, 0.12], [0.19, 0.21], [0.17, 0.24], [0, 0.24]], { m: wheelM, kind: 5, seed: 0.6, segs: 18, part: 2 });
  // the tram is drawn slimmer than its hanger suggests: at 1.6 m from the s02 lens every centimetre of girth is frame
  const geo = pb.build();
  geo.scale(0.74, 1, 0.74);
  return geo;
}

export function buildProm(ctx, RING) {
  const { CUES, scene, atlas } = ctx;
  const root = new THREE.Group(); scene.add(root);

  // ---- the floor plane (the promenade + the city's ground), one shader
  const floorG = new THREE.PlaneGeometry(15400, 3676, 308, 1);
  floorG.rotateX(-Math.PI / 2);
  floorG.translate(0, 0, -1814);
  const floorM = floorMaterial();
  const floor = new THREE.Mesh(floorG, floorM);
  floor.frustumCulled = false; floor.renderOrder = -1;
  floor.userData.noShadow = true;
  root.add(floor);

  // a QA-only closed slab under the promenade: never drawn (layer 1)
  const col = (geo, name) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial()); m.layers.set(1); m.name = name; root.add(m); return m; };
  const box = (x0, x1, y0, y1, z0, z1) => { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g; };
  const floorCol = col(box(PROM.x0 - 400, PROM.x1 + 400, -3, 0, PROM.z0, PROM.z1), 'floor');
  ctx.colliders.push({ name: 'floor', dept: 'ring', obj: floorCol, kind: 'solid' });
  const pillarCol = col(box(-PILLAR.hw, PILLAR.hw, -CRATER.depth - 3, 0, -PILLAR.hw, PILLAR.hw), 'pillar');
  pillarCol.visible = false;
  ctx.colliders.push({ name: 'pillar', dept: 'ring', obj: pillarCol, kind: 'solid' });

  // ---- balustrade: one module near (real, inked, colliding), instanced far
  const mkRail = (x0, x1) => {
    const pb = new PB();
    let i = 0;
    for (let x = x0; x < x1; x += 2.4, i++) railBay(pb, x + 1.2, RAIL.z, i * 0.13);
    return pb.build();
  };
  const railMat = propMaterial({ id: 2 });
  const rails = [];
  const addRail = (x0, x1, name, solid) => {
    const m = new THREE.Mesh(mkRail(x0, x1), railMat);
    m.frustumCulled = false;
    root.add(m);
    rails.push(m);
    if (solid) ctx.colliders.push({ name, dept: 'ring', obj: m, kind: 'solid' });
    return m;
  };
  const railIn = addRail(-26.4, 26.4, 'railCrater', true);
  addRail(-86.4, -26.4, 'railW', true);
  addRail(26.4, 86.4, 'railE', true);
  // far rail: instanced bay, no collision
  {
    const pb = new PB(); railBay(pb, 0, 0, 0.3);
    const far = new THREE.InstancedMesh(pb.build(), propMaterial({ id: 2, instanced: true }), 1000);
    const D = new THREE.Object3D(); let n = 0;
    for (const s of [-1, 1]) for (let i = 0; i < 500; i++) { D.position.set(s * (88 + i * 2.4), 0, RAIL.z); D.updateMatrix(); far.setMatrixAt(n++, D.matrix); }
    far.count = n; far.instanceMatrix.needsUpdate = true; far.frustumCulled = false; root.add(far);
  }

  // ---- layout of the furniture: formal pairs along the brass lines, keeping the landing zone clear
  const planters = [], benches = [], lamps = [];
  const clearOfWarlord = (x, z, r) => {
    const f1 = Math.hypot(x - WARLORD.footL[0], z - WARLORD.footL[2]), f2 = Math.hypot(x - WARLORD.footR[0], z - WARLORD.footR[2]);
    const p = Math.hypot(x - WARLORD.land[0], z - WARLORD.land[2]);
    return f1 > r + 5 && f2 > r + 5 && p > r + 6;
  };
  const inCrater = (x, z) => Math.hypot(x - CRATER.c[0], z - CRATER.c[1]) < craterRim(Math.atan2(z - CRATER.c[1], x - CRATER.c[0])) + 1;
  for (let k = -9; k <= 9; k++) {
    const xc = (k + 0.5) * 14.8;
    planters.push([xc, -19.4, 0.72], [xc, 16.1, 0.72]);
    lamps.push([xc + 7.4, -22.9], [xc + 7.4, 19.5]);
    if (k !== 0 && k !== -1) benches.push([xc + 3.7, -21.0, Math.PI], [xc - 3.7, -21.0, Math.PI]);
    benches.push([xc + 3.7, 19.6, 0], [xc - 3.7, 19.6, 0]);
  }
  // the olive trees nearest him: the source of his misery
  planters.push([-7.4, -4.6, 0.82]);
  planters.push([-13, 4.6, 0.72]);
  planters.push([14.8, 4.6, 0.72]);

  const keep = (L) => L.filter(([x, z]) => clearOfWarlord(x, z, 1.0));
  const P = keep(planters), B = keep(benches), Lm = keep(lamps);

  const inC = { p: new PB(), b: new PB(), l: new PB() }, out = { p: new PB(), b: new PB(), l: new PB() };
  const treeTops = [];
  P.forEach(([x, z, r], i) => {
    const t = planter((inCrater(x, z) ? inC : out).p, x, z, 0.17 * i + 0.1, r);
    treeTops.push({ x, z, top: t.top, r, crater: inCrater(x, z), seed: i });
  });
  B.forEach(([x, z, ry], i) => bench((inCrater(x, z) ? inC : out).b, x, z, ry, 0.23 * i));
  Lm.forEach(([x, z], i) => lamp((inCrater(x, z) ? inC : out).l, x, z, 0.3 * i));

  const propsGroup = new THREE.Group(); root.add(propsGroup);
  const mkProp = (pb, id, name, solid, crater) => {
    if (!pb.p.length) return null;
    const m = new THREE.Mesh(pb.build(), propMaterial({ id }));
    m.frustumCulled = false;
    m.userData.inCrater = crater;
    propsGroup.add(m);
    if (solid) ctx.colliders.push({ name, dept: 'ring', obj: m, kind: 'solid' });
    return m;
  };
  const crMeshes = [];
  for (const [src, cr] of [[out, false], [inC, true]]) {
    const a = mkProp(src.p, 5, 'planters' + (cr ? 'C' : ''), true, cr);
    const b = mkProp(src.b, 8, 'benches' + (cr ? 'C' : ''), true, cr);
    const c = mkProp(src.l, 11, 'lamps' + (cr ? 'C' : ''), false, cr);
    if (cr) crMeshes.push(a, b, c);
  }
  crMeshes.push(railIn);
  ctx.shadowRoots.push(propsGroup);

  // ---- olive canopies: painted foliage clumps from the shared atlas, silver-grey greens
  const olive = foliageMaterial(atlas, { deep: '#3f5a50', shade: '#5f7e68', mid: '#8ba486', light: '#b2c2a0', blossom: '#dfe8c8', id: 1 });
  const canopy = (list, parent) => {
    if (!list.length) return null;
    const n = list.reduce((a, t) => a + 7, 0);
    const G = new THREE.PlaneGeometry(1, 1);
    const inst = new THREE.InstancedBufferGeometry();
    inst.index = G.index; inst.attributes = G.attributes;
    const aVar = new Float32Array(n * 4);
    const im = new THREE.InstancedMesh(inst, olive, n);
    const D = new THREE.Object3D();
    let i = 0;
    for (const t of list) {
      const rng = new Rng(t.seed + 100);
      const [tx, ty, tz] = t.top;
      for (let k = 0; k < 7; k++) {
        const a = rng.range(0, 6.283), rr = k === 0 ? 0 : rng.range(0.25, 0.8) * t.r;
        const sc = rng.range(1.4, 2.2) * t.r / 0.72;
        D.position.set(tx + Math.cos(a) * rr, ty - 0.2 + rng.range(-0.25, 0.55), tz + Math.sin(a) * rr);
        D.rotation.set(0, 0, 0); D.scale.set(sc, sc, sc);
        D.updateMatrix(); im.setMatrixAt(i, D.matrix);
        aVar.set([rng.next() < 0.55 ? 8 : 15, rng.range(-0.12, 0.12), rng.next(), rng.next() < 0.5 ? 1 : 0], i * 4);
        i++;
      }
    }
    inst.setAttribute('aVar', new THREE.InstancedBufferAttribute(aVar, 4));
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;
    im.userData.noShadow = true;
    parent.add(im);
    return im;
  };
  const canopyOut = canopy(treeTops.filter((t) => !t.crater), root);
  const canopyIn = canopy(treeTops.filter((t) => t.crater), root);
  crMeshes.push(canopyIn);

  // ---- the garden wall on the promenade's north edge: a coral kerb, a clipped hedge. It is the eye-level backdrop of most close shots
  {
    const curbIn = new PB(), curbOut = new PB();
    const seg = 9.2, zK = -26.6;
    for (let i = -42; i < 42; i++) {
      const x = (i + 0.5) * seg;
      const pb = inCrater(x, zK) ? curbIn : curbOut;
      pb.box([x, 0.21, zK], [seg - 0.1, 0.42, 0.74], { kind: 0, seed: 0.07 * i + 0.2, bevel: 0.04, part: 0 });
      pb.box([x, 0.47, zK], [seg - 0.02, 0.1, 0.9], { kind: 0, seed: 0.05 * i + 0.4, bevel: 0.03, part: 2 });
      pb.box([x, 0.55, zK - 0.06], [seg - 0.3, 0.09, 0.62], { kind: 3, seed: 0.03 * i + 0.1, bevel: 0.02, part: 1 });
    }
    const a = mkProp(curbOut, 6, 'kerb', false, false), b = mkProp(curbIn, 6, 'kerbC', false, true);
    if (b) crMeshes.push(b);
    void a;
    const hedge = (items, parent) => {
      if (!items.length) return null;
      const G = new THREE.PlaneGeometry(1, 1);
      const inst = new THREE.InstancedBufferGeometry();
      inst.index = G.index; inst.attributes = { ...G.attributes };
      const n = items.length, aVar = new Float32Array(n * 4);
      const im = new THREE.InstancedMesh(inst, olive, n);
      const D = new THREE.Object3D();
      items.forEach(([x, y, z, sc, v0, v1, v2, v3], i) => {
        D.position.set(x, y, z); D.rotation.set(0, 0, 0); D.scale.set(sc, sc, sc);
        D.updateMatrix(); im.setMatrixAt(i, D.matrix);
        aVar.set([v0, v1, v2, v3], i * 4);
      });
      inst.setAttribute('aVar', new THREE.InstancedBufferAttribute(aVar, 4));
      im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; im.userData.noShadow = true;
      parent.add(im);
      return im;
    };
    const rngH = new Rng(4343), hIn = [], hOut = [];
    for (let x = -386; x < 386; x += 0.82) {
      for (let row = 0; row < 2; row++) {
        const hx = x + rngH.range(-0.3, 0.3), hz = zK + rngH.range(-0.28, 0.2);
        const sc = rngH.range(1.05, 1.6);
        const item = [hx, 0.92 + row * 0.5 + rngH.range(-0.1, 0.12), hz, sc, rngH.next() < 0.5 ? 8 : 15, rngH.range(-0.1, 0.1), rngH.next(), rngH.next() < 0.5 ? 1 : 0];
        (inCrater(hx, hz) ? hIn : hOut).push(item);
      }
    }
    hedge(hOut, root);
    const hc = hedge(hIn, root);
    if (hc) crMeshes.push(hc);
  }

  // ---- the pod
  const podGeo = buildPod();
  const pod = new THREE.Mesh(podGeo, propMaterial({ id: 14 }));
  pod.frustumCulled = false;
  root.add(pod);
  const podGroup = new THREE.Group(); root.add(podGroup);
  const podRest = new THREE.Vector3(POD.pos[0], 0, POD.pos[2]);
  const away = new THREE.Vector3(POD.pos[0], 0, POD.pos[2]).normalize();
  const axisFall = new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), 0);
  // it leans away from him and from the lens: s02 is framed tight, so the body recedes instead of filling the left of the frame
  const podAxis = new THREE.Vector3(-0.2, 1, -0.17).normalize();
  const tilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), podAxis);
  ctx.colliders.push({ name: 'pod', dept: 'ring', obj: pod, kind: 'solid' });

  // ---- broken tiles around the landing and the pod
  const SL = new THREE.BoxGeometry(1, 1, 1);
  const slabMat = craterMaterial({ kind: 3, instanced: true });
  const mkSlabs = (rng, cx, cz, count, r0, r1, sizeA, sizeB, avoid) => {
    const inst = new THREE.InstancedBufferGeometry();
    inst.index = SL.index; inst.attributes = SL.attributes;
    const im = new THREE.InstancedMesh(inst, slabMat, count);
    const D = new THREE.Object3D();
    const iA = new Float32Array(count * 4);
    let n = 0;
    for (let tries = 0; tries < 5000 && n < count; tries++) {
      const a = rng.range(0, 6.283), r = rng.range(r0, r1);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (avoid && avoid(x, z)) continue;
      const sz = rng.range(sizeA, sizeB);
      const tiltK = (1 - (r - r0) / (r1 - r0)) * 0.7 + 0.08;
      D.position.set(x, sz * 0.08 + rng.range(0.0, 0.08), z);
      D.rotation.set(Math.sin(a) * tiltK * rng.range(0.4, 1.2), rng.range(0, 6.28), -Math.cos(a) * tiltK * rng.range(0.4, 1.2));
      D.scale.set(sz, sz * rng.range(0.14, 0.2), sz * rng.range(0.55, 0.95));
      D.updateMatrix(); im.setMatrixAt(n, D.matrix);
      iA.set([rng.next(), 1, 0, 0], n * 4);
      n++;
    }
    inst.setAttribute('iA', new THREE.InstancedBufferAttribute(iA, 4));
    im.count = n; im.instanceMatrix.needsUpdate = true; im.frustumCulled = false;
    im.userData.noShadow = true;
    root.add(im);
    return im;
  };
  const avoidL = (x, z) => {
    if (Math.abs(x) < 3 && Math.abs(z) < 3) return true;
    if (Math.hypot(x - WARLORD.footL[0], z - WARLORD.footL[2]) < 2.0 || Math.hypot(x - WARLORD.footR[0], z - WARLORD.footR[2]) < 2.0) return true;
    return false;
  };
  const slabsLand = mkSlabs(new Rng(301), WARLORD.land[0], WARLORD.land[2], 60, 4.5, 15, 0.35, 1.1, avoidL);
  const slabsPod = mkSlabs(new Rng(302), POD.pos[0], POD.pos[2], 14, 0.85, 2.2, 0.16, 0.42, (x, z) => Math.hypot(x, z) < 0.95);

  // ---- the hull under the south edge
  {
    const pb = new PB();
    const xs = [];
    for (let x = -7600; x <= 7600; x += 50) xs.push(x);
    const prof = [[24, -0.02], [24.5, -0.5], [24.3, -1.0], [27, -6], [23, -9], [23, -14], [30, -30], [26, -36], [24, -80], [40, -120], [36, -260], [60, -520], [50, -900]];
    const base = pb.v;
    for (const x of xs) for (const [z, y] of prof) { pb.p.push(x, y, z); pb.n.push(0, 0.3, 1); pb.u.push(x, y); pb.k.push(8, 0.3, 0, 0); pb.v++; }
    const m = prof.length;
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < m - 1; j++) {
      const a = base + i * m + j, b = a + 1, c = a + m, d = c + 1;
      pb.i.push(a, b, c, b, d, c);
    }
    const hull = new THREE.Mesh(pb.build(), propMaterial({ id: 17 }));
    hull.frustumCulled = false; hull.userData.noShadow = true;
    root.add(hull);
  }

  return {
    root, floor, pod, floorCol, pillarCol, crMeshes, slabsLand, slabsPod, canopyIn, propsGroup, podRest, tilt, away,
    update(st) {
      const t = st.t;
      const crater = t >= CUES.bladeHit;
      RU.uCraterOn.value = crater ? 1 : 0;
      floorCol.visible = !crater;
      pillarCol.visible = crater;
      for (const m of crMeshes) if (m) m.visible = !crater;
      railIn.visible = !crater;
      // the landing
      const landK = t >= CUES.land ? Math.min(1, (t - CUES.land) / 0.14 + 0.55) : 0;
      RU.uLand.value.z = crater ? 0 : landK;
      slabsLand.visible = !crater && t >= CUES.land;
      // the pod
      const hit = CUES.podHit;
      const podK = t >= hit ? Math.min(1, (t - hit) / 0.1 + 0.6) : 0;
      RU.uPod.value.z = crater ? 0 : podK;
      slabsPod.visible = !crater && t >= hit;
      const fall = t < hit ? (hit - t) / 0.42 : 0;
      pod.visible = !crater && t >= hit - 0.42;
      const sink = 0.42;                        // how deep the nose ends up
      if (pod.visible) {
        const shake = t >= hit ? Math.exp(-(t - hit) * 7) * Math.sin((t - hit) * 44) * 0.028 : 0;
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(-away.z, 0, away.x).normalize(), shake);
        pod.quaternion.copy(tilt).premultiply(q);
        const y = -sink;
        // nose-first along its own axis, the crossing with the tiles stays at POD.pos
        const along = fall * fall * POD.fromHeight / podAxis.y - sink / podAxis.y;
        pod.position.set(podRest.x + podAxis.x * along, podAxis.y * along, podRest.z + podAxis.z * along);
      }
      // the shadow sliding over the tiles in the broom close-up
      const se = RU.uShadowEdge.value;
      if (t >= CUES.shadow && t < CUES.drop) {
        const k = (t - CUES.shadow) / (CUES.drop - CUES.shadow);
        se.x = -2.5 + k * 9.0; se.y = 1;
      } else se.y = 0;
      RU.uT.value = t;
      const vis = st.set !== 'orbit' && st.set !== 'abstract';
      root.visible = vis;
    },
  };
}

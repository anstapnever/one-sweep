import * as THREE from 'three';
import { Rng } from './util.js';

// Geometry kit for the ring-city: lofts of ring-shaped cross sections with per-vertex shading data.
//   aL = (metres below the overhang above, depth of that overhang, kind, level hash)
//   kinds: 0 wall, 1 glass, 2 terrace top, 3 coral trim, 4 soffit, 5 ribbed coral, 6 dome/roof, 8 bridge deck
const TAU = Math.PI * 2;

// The torn outline of the crater: the same sum in JS (bowl, props) and in the floor shader (ring-mat.js), so the bowl always meets the deck.
export const craterRim = (a) => 34 + 1.25 * Math.cos(3 * a + 1.0) + 0.85 * Math.cos(5 * a + 2.3) + 0.55 * Math.cos(9 * a + 0.4) + 0.3 * Math.cos(17 * a + 4.0) + 0.16 * Math.cos(31 * a + 1.0);

export class GB {
  constructor() { this.p = []; this.n = []; this.u = []; this.l = []; this.i = []; this.v = 0; }

  // rings: [{ pts: [[x,y,z]...], v, us: [..] | u0/u1, kind, dB: [...]|number, ov: [...]|number, crease, hash }]
  // every consecutive pair is a band in the kind of the LOWER ring.
  loft(rings) {
    const n = rings.length;
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    for (let i = 0; i < n - 1; i++) {
      const A = rings[i], B = rings[i + 1], m = A.pts.length;
      const ofs = this.v;
      for (let s = 0; s < 2; s++) {
        const R = s ? B : A;
        const ri = s ? i + 1 : i;
        for (let j = 0; j < m; j++) {
          const p = R.pts[j];
          const jp = j === m - 1 ? 1 : j + 1, jm = j === 0 ? m - 2 : j - 1;
          const T = sub(R.pts[jp], R.pts[jm]);
          let lo = ri, hi = ri;
          if (s === 0) { hi = ri + 1; if (ri > 0 && !A.crease) lo = ri - 1; }
          else { lo = ri - 1; if (ri < n - 1 && !B.crease) hi = ri + 1; }
          const Bt = sub(rings[hi].pts[j], rings[lo].pts[j]);
          const N = norm(cross(Bt, T));
          this.p.push(p[0], p[1], p[2]);
          this.n.push(N[0], N[1], N[2]);
          const u = R.us ? R.us[j] : (j / (m - 1)) * (R.u1 ?? 1);
          this.u.push(u, R.v ?? p[1]);
          const dB = Array.isArray(A.dB) ? A.dB[j] : (A.dB ?? 99);
          const dB2 = Array.isArray(B.dBt) ? B.dBt[j] : (B.dBt ?? dB);
          const ov = Array.isArray(A.ov) ? A.ov[j] : (A.ov ?? 0);
          this.l.push(s ? dB2 : dB, ov, A.kind ?? 0, A.hash ?? 0);
        }
      }
      for (let j = 0; j < m - 1; j++) {
        const a = ofs + j, b = ofs + j + 1, c = ofs + m + j, d = ofs + m + j + 1;
        this.i.push(a, c, b, b, c, d);
      }
      this.v += m * 2;
    }
  }

  // flat closed polygon fan cap (rounded top)
  fan(ring, apex, opts = {}) {
    const m = ring.length;
    const ofs = this.v;
    const N = opts.n ?? [0, 1, 0];
    for (let j = 0; j < m; j++) {
      const p = ring[j]; this.p.push(p[0], p[1], p[2]); this.n.push(N[0], N[1], N[2]);
      this.u.push(p[0], p[2]); this.l.push(99, 0, opts.kind ?? 6, opts.hash ?? 0);
    }
    this.p.push(apex[0], apex[1], apex[2]); this.n.push(N[0], N[1], N[2]); this.u.push(apex[0], apex[2]); this.l.push(99, 0, opts.kind ?? 6, opts.hash ?? 0);
    for (let j = 0; j < m - 1; j++) this.i.push(ofs + j, ofs + m, ofs + j + 1);
    this.v += m + 1;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('aL', new THREE.Float32BufferAttribute(this.l, 4));
    g.setIndex(this.v > 65000 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    return g;
  }
}

// ---- the plan shape of a tower: never a circle, never a box: slow lobes that drift with height.
export function makePlan(rng, amount = 1) {
  const n = 2 + (rng.next() * 2 | 0);
  const L = [];
  for (let i = 0; i < n; i++) L.push({ k: 2 + (rng.next() * 4 | 0), a: rng.range(0.05, 0.17) * amount, ph: rng.range(0, TAU), dr: rng.range(-0.012, 0.012) });
  return (th, y) => {
    let s = 1;
    for (const l of L) s += l.a * Math.cos(l.k * th + l.ph + y * l.dr);
    return s;
  };
}

const ringPts = (segs, f) => { const a = []; for (let j = 0; j <= segs; j++) a.push(f((j / segs) * TAU, j)); return a; };

// A wedding-cake stack: tiers of levels; each level is a real undulating balcony around a recessed band of glass.
//   o: { H, R(y01), plan, segs, detail, levelH(y01), over(th, lvl), rng, cx, cz, cap }
export function terraceStack(g, o) {
  const { segs, plan, detail, rng } = o;
  const H = o.H, y0 = o.y0 ?? 0;
  const cx = o.cx ?? 0, cz = o.cz ?? 0;
  const profile = o.profile ?? null;
  let y = y0, lvl = 0;
  const dr = (yy) => (o.drift ? o.drift(yy) : [0, 0]);
  const X = (r, th, yy) => cx + dr(yy)[0] + r * Math.cos(th), Z = (r, th, yy) => cz + dr(yy)[1] + r * Math.sin(th);
  const us = (R) => { const N = Math.max(3, Math.round((TAU * R) / 3.6)); const a = []; for (let j = 0; j <= segs; j++) a.push((j / segs) * N * 3.6); return a; };
  const lastTop = { y: y0, ring: null };
  while (y < y0 + H - 0.5) {
    const k = (y - y0) / H;
    const lh = Math.min(o.levelH(k), y0 + H - y);
    const R0 = o.R(k), R1 = o.R(Math.min(1, (y + lh - y0) / H));
    const hsh = rng.next();
    const ph = rng.range(0, TAU), m = 2 + (rng.next() * 4 | 0);
    const ovBase = o.over ? o.over(k, lvl) : 1.5;
    const ov = (th) => ovBase * (0.18 + 0.82 * Math.pow(Math.cos(m * th + ph) * 0.5 + 0.5, 1.5));
    const rb = (th) => R0 * plan(th, y);
    const rt = (th) => R1 * plan(th, y + lh);
    const uu = us((R0 + R1) * 0.5);
    const pts = (r, yy) => ringPts(segs, (th) => [X(r(th), th, yy), yy, Z(r(th), th, yy)]);
    const glassH = Math.min(lh * 0.42, 2.8);
    const lipT = 0.45;
    const yWallTop = y + lh - lipT - glassH;
    const ySoffit = y + lh - lipT;
    const yLip = ySoffit + 0.45;
    const yPar = y + lh + 0.8;
    const yFloor = y + lh + 0.18;
    const ovArr = ringPts(segs, (th) => ov(th) + 0.55);
    const dB = (yy) => ySoffit - yy;
    const nextR = o.R(Math.min(1, (y + lh + 0.18 - y0) / H));
    if (detail === 0) {
      const rec = 0.55;
      o.g = g;
      g.loft([
        { pts: pts(rb, y), v: y, us: uu, kind: 0, dB: dB(y), dBt: dB(y), ov: ovArr, crease: true, hash: hsh },
        { pts: pts((th) => rb(th) + (rt(th) - rb(th)) * 0.5 + 0.25, (y + yWallTop) * 0.5), v: (y + yWallTop) * 0.5, us: uu, kind: 0, dB: dB((y + yWallTop) * 0.5), dBt: dB((y + yWallTop) * 0.5), ov: ovArr, hash: hsh },
        { pts: pts(rt, yWallTop), v: yWallTop, us: uu, kind: 0, dB: dB(yWallTop), dBt: dB(yWallTop), ov: ovArr, crease: true, hash: hsh },
        { pts: pts((th) => rt(th) - rec, yWallTop), v: yWallTop, us: uu, kind: 1, dB: dB(yWallTop), dBt: dB(yWallTop), ov: ovArr, crease: true, hash: hsh },
        { pts: pts((th) => rt(th) - rec, ySoffit), v: ySoffit, us: uu, kind: 4, dB: 0, ov: ovArr, crease: true, hash: hsh },
        { pts: pts((th) => rt(th) + ov(th), ySoffit + 0.04), v: ySoffit, us: uu, kind: 3, dB: 0, ov: 0, crease: true, hash: hsh },
        { pts: pts((th) => rt(th) + ov(th) + 0.16, yLip), v: yLip, us: uu, kind: 3, dB: 0, ov: 0, hash: hsh },
        { pts: pts((th) => rt(th) + ov(th) + 0.06, yPar), v: yPar, us: uu, kind: 3, dB: 0, ov: 0, crease: true, hash: hsh },
        { pts: pts((th) => rt(th) + ov(th) - 0.18, yPar + 0.02), v: yPar, us: uu, kind: 3, dB: 0, ov: 0, crease: true, hash: hsh },
        { pts: pts((th) => rt(th) + ov(th) - 0.24, yFloor), v: yFloor, us: uu, kind: 2, dB: 0, ov: 0, crease: true, hash: hsh },
        { pts: pts((th) => nextR * plan(th, y + lh + 0.18), yFloor), v: yFloor, us: uu, kind: 2, dB: 0, ov: 0, crease: true, hash: hsh },
      ]);
    } else if (detail === 1) {
      g.loft([
        { pts: pts(rb, y), v: y, us: uu, kind: 0, dB: dB(y), dBt: dB(ySoffit), ov: ovArr, crease: true, hash: hsh },
        { pts: pts(rt, ySoffit), v: ySoffit, us: uu, kind: 4, dB: 0, ov: ovArr, crease: true, hash: hsh },
        { pts: pts((th) => rt(th) + ov(th), ySoffit + 0.04), v: ySoffit, us: uu, kind: 3, dB: 0, ov: 0, crease: true, hash: hsh },
        { pts: pts((th) => rt(th) + ov(th) + 0.08, yPar), v: yPar, us: uu, kind: 2, dB: 0, ov: 0, crease: true, hash: hsh },
        { pts: pts((th) => nextR * plan(th, y + lh + 0.18), yFloor), v: yFloor, us: uu, kind: 2, dB: 0, ov: 0, crease: true, hash: hsh },
      ]);
    } else {
      g.loft([
        { pts: pts(rb, y), v: y, us: uu, kind: 0, dB: 40, ov: 0, crease: true, hash: hsh },
        { pts: pts(rt, y + lh), v: y + lh, us: uu, kind: 3, dB: 0, ov: 0, crease: true, hash: hsh },
        // far LOD: the terrace is drawn wider than it is, or from the air it thins out to a wire round the tower
        { pts: pts((th) => rt(th) + ovBase * 1.7, y + lh + 0.8), v: y + lh + 0.8, us: uu, kind: 2, dB: 0, ov: 0, crease: true, hash: hsh },
        { pts: pts((th) => nextR * plan(th, y + lh + 0.18), y + lh + 1.0), v: y + lh + 1, us: uu, kind: 2, dB: 0, ov: 0, crease: true, hash: hsh },
      ]);
    }
    if (profile) profile.push([Math.max(...ringPts(segs, (th) => rt(th) + ov(th))) , y + lh + 1]);
    y += lh + 0.18; lvl++;
    lastTop.y = y; lastTop.r = nextR;
  }
  // the crown: a lens of glazed coral scales, or a garden terrace with a low dome
  const rTop = lastTop.r;
  const rimY = lastTop.y;
  if (o.cap !== false) {
    const steps = detail === 0 ? 7 : detail === 1 ? 4 : 2;
    const domeH = rTop * (o.domeK ?? 0.5);
    const rings = [];
    for (let i = 0; i <= steps; i++) {
      const a = (i / (steps + 0.4)) * Math.PI * 0.5;
      const rr = rTop * 0.94 * Math.cos(a) + 0.01, yy = rimY + domeH * Math.sin(a);
      rings.push({ pts: ringPts(segs, (th) => [X(rr * plan(th, yy), th, yy), yy, Z(rr * plan(th, yy), th, yy)]), v: Math.hypot(rimY - yy, rTop - rr) + yy, us: us(rTop), kind: 6, dB: 40, ov: 0, hash: rng.next() });
    }
    g.loft(rings);
    const last = rings[rings.length - 1].pts;
    const dT = dr(rimY + domeH);
    g.fan(last, [cx + dT[0], rimY + domeH * 1.02, cz + dT[1]], { kind: 6 });
  }
  return { rTop, topY: rimY };
}

// Sweep a lobed tube along a poly-curve (a coral branch). spine: fn(s01) => [x,y,z]; radius: fn(s01) => m.
export function coralTube(g, o) {
  const { spine, radius, segs, n, rng, detail } = o;
  // parallel transport frame
  let last = [1, 0, 0];
  const rings = [];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const ph = rng.range(0, TAU), m = 3 + (rng.next() * 4 | 0), amp = o.amp ?? 0.1;
  const us = (r) => { const N = Math.max(3, Math.round((TAU * r) / 3.6)); const a = []; for (let j = 0; j <= segs; j++) a.push((j / segs) * N * 3.6); return a; };
  let vAcc = 0, prev = null;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const c = spine(s);
    const c2 = spine(Math.min(1, s + 0.01)), c1 = spine(Math.max(0, s - 0.01));
    const Tn = norm([c2[0] - c1[0], c2[1] - c1[1], c2[2] - c1[2]]);
    let Z = norm(cross(last, Tn));
    const X = norm(cross(Tn, Z));
    last = X;
    if (prev) vAcc += Math.hypot(c[0] - prev[0], c[1] - prev[1], c[2] - prev[2]);
    prev = c;
    const r = radius(s);
    // collars: a real terrace ring on the branch every few metres
    const collar = o.collars && (detail < 2) ? Math.pow(Math.max(0, Math.cos(s * Math.PI * o.collars * 2)), 18) : 0;
    const rr = r * (1 + collar * 0.32);
    const pts = ringPts(segs, (th) => {
      const q = rr * (1 + amp * Math.cos(m * th + ph + s * 2.4) + amp * 0.5 * Math.cos(2 * m * th + s * 5.0));
      return [c[0] + X[0] * q * Math.cos(th) + Z[0] * q * Math.sin(th), c[1] + X[1] * q * Math.cos(th) + Z[1] * q * Math.sin(th), c[2] + X[2] * q * Math.cos(th) + Z[2] * q * Math.sin(th)];
    });
    rings.push({ pts, v: vAcc, us: us(r), kind: collar > 0.5 ? 3 : (o.kind ?? 5), dB: 30, ov: 0, hash: o.hash ?? 0.5 });
  }
  g.loft(rings);
  // rounded tip
  const lastPts = rings[rings.length - 1].pts;
  const tip = spine(1);
  g.fan(lastPts, [tip[0], tip[1] + radius(1) * 0.6, tip[2]], { kind: 6 });
}

const smooth01 = (t) => t * t * (3 - 2 * t);

// ---- archetypes. Each is a function (seed, detail) -> { geo, H, R, prof:[[r,h]...] }
export function archStack(seed, detail, cls) {
  const rng = new Rng(seed);
  const g = new GB();
  const segs = detail === 0 ? 64 : detail === 1 ? 26 : 11;
  const low = cls === 'low', mid = cls === 'mid';
  const H = low ? rng.range(20, 30) : mid ? rng.range(90, 170) : rng.range(240, 380);
  const R0 = low ? rng.range(13, 20) : mid ? rng.range(20, 34) : rng.range(34, 56);
  const tiers = low ? 2 + (rng.next() * 2 | 0) : 3 + (rng.next() * 4 | 0);
  const tierF = [];
  let acc = 0;
  for (let i = 0; i < tiers; i++) { acc += rng.range(0.7, 1.3); tierF.push(acc); }
  for (let i = 0; i < tiers; i++) tierF[i] /= acc;
  const shrink = [1];
  for (let i = 1; i < tiers; i++) shrink.push(shrink[i - 1] * rng.range(0.66, 0.86));
  const waist = rng.next() < 0.45 ? rng.range(0.14, 0.34) : 0;
  const R = (k) => {
    let i = 0; while (i < tiers - 1 && k > tierF[i]) i++;
    const k0 = i ? tierF[i - 1] : 0, u = (k - k0) / (tierF[i] - k0);
    const belly = 1 + 0.06 * Math.sin(u * Math.PI);
    const w = waist ? (1 - waist * Math.exp(-Math.pow((k - 0.25) / 0.2, 2))) : 1;
    return R0 * shrink[i] * belly * w * (1 - 0.1 * u);
  };
  const lvlBase = low ? 7.5 : mid ? 11 : 15;
  const levelH = (k) => detail === 2 ? H / (tiers * 2) : lvlBase * (0.9 + 0.3 * Math.sin(k * 17));
  const ovBase = low ? 2.4 : mid ? 3.2 : 4.5;
  const plan = makePlan(rng, 1.1);
  const prof = [];
  // some stacks wander as they climb: the tiers step off to one side instead of sitting on one axis
  const lean = !low && rng.next() < 0.5;
  const la = rng.range(0, TAU), lA = rng.range(0.25, 0.6) * R0, lf = rng.range(0.7, 1.5);
  const drift = lean ? (y) => { const q = Math.sin((y / H) * Math.PI * lf) * lA; return [Math.cos(la) * q, Math.sin(la) * q]; } : null;
  terraceStack(g, { H, R, plan, segs, detail, rng, levelH, drift, over: (k) => ovBase * (0.6 + 0.8 * (1 - k)), domeK: rng.range(0.25, 0.7), profile: prof });
  return { g, H, R: R0 * 1.25 + (lean ? lA : 0), prof };
}

// a flat terrace pad at the end of a coral branch (table coral): lobed outline, corbelled underside, garden on top
function coralPad(g, c, R, segs, rng, detail) {
  const ph = rng.range(0, TAU), m = 2 + (rng.next() * 3 | 0), hash = rng.next();
  const shape = (th) => 1 + 0.14 * Math.cos(m * th + ph) + 0.06 * Math.cos(2 * m * th + ph * 2);
  const ring = (r, y) => ringPts(segs, (th) => [c[0] + r * shape(th) * Math.cos(th), c[1] + y, c[2] + r * shape(th) * Math.sin(th)]);
  const N = Math.max(4, Math.round((TAU * R) / 3.6));
  const us = []; for (let j = 0; j <= segs; j++) us.push((j / segs) * N * 3.6);
  const T = Math.max(1.4, R * 0.3);
  const rg = (r, y, kind, crease) => ({ pts: ring(r, y), v: y, us, kind, dB: 0, ov: 0, crease, hash });
  g.loft([rg(R * 0.16, -T * 1.5, 4), rg(R * 0.62, -T * 0.55, 4), rg(R, -0.1, 3, true), rg(R * 1.03, 0.55, 3), rg(R * 0.96, 0.7, 2, true), rg(R * 0.3, 0.72, 2, true)]);
  const top = ring(R * 0.3, 0.72);
  if (detail < 2) {
    const rs = [];
    for (let i = 0; i <= 4; i++) { const a = (i / 4.4) * Math.PI * 0.5; rs.push({ pts: ring(R * 0.3 * Math.cos(a) + 0.01, 0.72 + R * 0.22 * Math.sin(a)), v: i * 2, us, kind: 6, dB: 40, ov: 0, hash }); }
    g.loft(rs);
    g.fan(rs[rs.length - 1].pts, [c[0], c[1] + 0.72 + R * 0.23, c[2]], { kind: 6 });
  } else g.fan(top, [c[0], c[1] + 0.8, c[2]], { kind: 6 });
}

// A staghorn tree, not a hand: a stem that keeps climbing, and branches leaving it at many heights, each carrying a terrace pad.
export function archBranch(seed, detail, cls) {
  const rng = new Rng(seed);
  const g = new GB();
  const segs = detail === 0 ? 40 : detail === 1 ? 20 : 8;
  const mid = cls === 'mid';
  const H = mid ? rng.range(110, 190) : rng.range(240, 340);
  const R0 = mid ? rng.range(16, 24) : rng.range(26, 38);
  const plan = makePlan(rng, 0.9);
  const trunkH = H * rng.range(0.3, 0.46);
  const prof = [];
  const lvlBase = mid ? 11 : 15;
  terraceStack(g, { H: trunkH, R: (k) => R0 * (1.0 - 0.28 * k), plan, segs: segs * 2, detail, rng, levelH: () => (detail === 2 ? trunkH / 3 : lvlBase), over: () => 3.2, cap: false, profile: prof });
  const roundTip = (s) => (s > 0.93 ? Math.sqrt(Math.max(0.02, 1 - Math.pow((s - 0.93) / 0.07, 2))) : 1);
  const ph = rng.range(0, TAU), stemTop = H * rng.range(0.86, 0.96), y0 = trunkH - 8, sA = rng.range(0.2, 0.42) * R0;
  const stem = (s) => [Math.sin(s * 2.4 + ph) * sA * s, y0 + (stemTop - y0) * s, Math.cos(s * 1.9 + ph) * sA * s];
  const nStem = detail === 0 ? 56 : detail === 1 ? 26 : 8;
  coralTube(g, { spine: stem, radius: (s) => R0 * 0.46 * (1 - 0.5 * s) * roundTip(s), segs, n: nStem, rng, detail, collars: Math.max(2, Math.round((stemTop - y0) / 20)), kind: 5, amp: 0.09, hash: rng.next() });
  coralPad(g, stem(0.97), R0 * rng.range(0.55, 0.85), segs, rng, detail);
  const n = 5 + (rng.next() * 4 | 0);
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5 + rng.range(-0.25, 0.25)) / n;
    const a = ph + i * 2.39996 + rng.range(-0.4, 0.4);
    const b0 = stem(0.08 + 0.8 * f);
    const out = rng.range(0.13, mid ? 0.26 : 0.2) * H * (1 - 0.45 * f);
    const up = out * rng.range(0.45, 1.05);
    const rb = R0 * rng.range(0.16, 0.24) * (1 - 0.4 * f);
    const spine = (s) => { const q = 1 - (1 - s) * (1 - s); return [b0[0] + Math.cos(a) * out * q, b0[1] + up * s * s, b0[2] + Math.sin(a) * out * q]; };
    coralTube(g, { spine, radius: (s) => rb * (1 - 0.4 * s) * roundTip(s), segs: Math.max(8, segs >> 1), n: detail === 0 ? 24 : detail === 1 ? 12 : 5, rng, detail, collars: 2, kind: 5, amp: 0.07, hash: rng.next() });
    coralPad(g, spine(1), rb * rng.range(2.4, 3.8), segs, rng, detail);
  }
  return { g, H, R: R0 * 1.25 + (mid ? 26 : 44), prof };
}

// Table coral: a slim shaft that flares into a wide corbelled crown.
export function archTable(seed, detail, cls) {
  const rng = new Rng(seed);
  const g = new GB();
  const segs = detail === 0 ? 64 : detail === 1 ? 26 : 11;
  const mid = cls === 'mid';
  const H = mid ? rng.range(90, 160) : rng.range(220, 340);
  const R0 = mid ? rng.range(20, 30) : rng.range(32, 48);
  const k0 = rng.range(0.5, 0.68);
  const R = (k) => {
    const f = Math.min(1, Math.max(0, (k - k0) / 0.2)), e = f * f * (3 - 2 * f);
    const top = k > 0.9 ? 1 - (k - 0.9) * 2.2 : 1;
    return R0 * (0.5 + 0.05 * Math.sin(k * 9) + 0.85 * e) * top;
  };
  const prof = [];
  const lvlBase = mid ? 10 : 14;
  terraceStack(g, { H, R, plan: makePlan(rng, 1.0), segs, detail, rng, levelH: (k) => (detail === 2 ? H / 8 : lvlBase * (0.9 + 0.3 * Math.sin(k * 13))), over: (k) => (k > k0 ? 3.4 : 1.8), domeK: rng.range(0.2, 0.42), profile: prof });
  return { g, H, R: R0 * 1.5, prof };
}

// Two stacks of unequal height grown together at the foot.
export function archTwin(seed, detail, cls) {
  const rng = new Rng(seed);
  const g = new GB();
  const segs = detail === 0 ? 48 : detail === 1 ? 20 : 9;
  const mid = cls === 'mid';
  const H = mid ? rng.range(100, 170) : rng.range(240, 360);
  const R0 = mid ? rng.range(15, 22) : rng.range(26, 36);
  const a = rng.range(0, TAU), d = R0 * rng.range(0.85, 1.05), H2 = H * rng.range(0.55, 0.78);
  const prof = [];
  const lvlBase = mid ? 11 : 15;
  const lv = (HH) => (k) => (detail === 2 ? HH / 7 : lvlBase * (0.9 + 0.3 * Math.sin(k * 17)));
  terraceStack(g, { H, R: (k) => R0 * (1 - 0.45 * k), plan: makePlan(rng, 1.0), segs, detail, rng, cx: Math.cos(a) * d, cz: Math.sin(a) * d, levelH: lv(H), over: () => 3, domeK: rng.range(0.3, 0.7), profile: prof });
  terraceStack(g, { H: H2, R: (k) => R0 * 1.15 * (1 - 0.4 * k), plan: makePlan(rng, 1.0), segs, detail, rng, cx: -Math.cos(a) * d, cz: -Math.sin(a) * d, levelH: lv(H2), over: () => 3.4, domeK: rng.range(0.3, 0.7), profile: prof });
  return { g, H, R: d + R0 * 1.3, prof };
}

export function archSpire(seed, detail, cls) {
  const rng = new Rng(seed);
  const g = new GB();
  const segs = detail === 0 ? 72 : detail === 1 ? 30 : 12;
  const mid = cls === 'mid';
  const H = mid ? rng.range(120, 180) : rng.range(280, 400);
  const R0 = mid ? rng.range(16, 26) : rng.range(26, 42);
  const steps = detail === 0 ? 90 : detail === 1 ? 34 : 10;
  const lobes = 3 + (rng.next() * 3 | 0);
  const twist = rng.range(1.2, 2.6) * (rng.next() < 0.5 ? -1 : 1);
  const taper = (k) => R0 * (1 - 0.74 * Math.pow(k, 1.6)) * (1 + 0.1 * Math.sin(k * 11));
  const rings = [];
  for (let i = 0; i <= steps; i++) {
    const k = i / steps, y = H * k;
    const r = taper(k);
    const pts = ringPts(segs, (th) => {
      const q = r * (1 + 0.2 * Math.cos(lobes * th + k * twist * TAU));
      return [q * Math.cos(th), y, q * Math.sin(th)];
    });
    const us = []; for (let j = 0; j <= segs; j++) us.push(j / segs);
    rings.push({ pts, v: y, us, kind: 7, dB: H, ov: lobes, hash: twist });
  }
  g.loft(rings);
  const last = rings[rings.length - 1].pts;
  g.fan(last, [0, H + taper(1) * 1.5, 0], { kind: 6 });
  // real balconies wrap the shell: it belongs to the same city as the terraced towers
  if (detail < 2) {
    const nB = Math.round(H / (mid ? 26 : 34));
    for (let b = 0; b < nB; b++) {
      const k0 = 0.08 + 0.84 * (b + rng.range(-0.2, 0.2)) / nB;
      if (k0 > 0.9) continue;
      const y = H * k0, hsh = rng.next();
      const ovB = rng.range(1.6, 3.4) * (1 - 0.5 * k0);
      const ring = (dq, dy) => ringPts(segs, (th) => {
        const q = taper(k0) * (1 + 0.2 * Math.cos(lobes * th + k0 * twist * TAU)) + dq * (0.55 + 0.45 * Math.cos(3 * th + hsh * TAU));
        return [q * Math.cos(th), y + dy, q * Math.sin(th)];
      });
      const us2 = []; for (let j = 0; j <= segs; j++) us2.push((j / segs) * Math.round((TAU * taper(k0)) / 3.6) * 3.6);
      g.loft([
        { pts: ring(-0.4, -0.5), v: y - 0.5, us: us2, kind: 4, dB: 0, ov: 0, crease: true, hash: hsh },
        { pts: ring(ovB, 0), v: y, us: us2, kind: 3, dB: 0, ov: 0, crease: true, hash: hsh },
        { pts: ring(ovB + 0.15, 0.85), v: y + 0.85, us: us2, kind: 3, dB: 0, ov: 0, crease: true, hash: hsh },
        { pts: ring(ovB - 0.2, 0.9), v: y + 0.9, us: us2, kind: 2, dB: 0, ov: 0, crease: true, hash: hsh },
        { pts: ring(-0.4, 0.9), v: y + 0.9, us: us2, kind: 2, dB: 0, ov: 0, crease: true, hash: hsh },
      ]);
    }
  }
  return { g, H, R: R0 * 1.25, prof: [[R0 * 1.2, H * 0.25], [R0 * 0.8, H * 0.6], [R0 * 0.4, H]] };
}

export function archDome(seed, detail, cls) {
  const rng = new Rng(seed);
  const g = new GB();
  const segs = detail === 0 ? 72 : detail === 1 ? 26 : 10;
  const H = cls === 'low' ? rng.range(22, 34) : rng.range(45, 110);
  const R0 = cls === 'low' ? rng.range(18, 26) : rng.range(36, 60);
  const plan = makePlan(rng, 1.3);
  const steps = detail === 0 ? 32 : detail === 1 ? 14 : 6;
  const rings = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 0.5 * 0.97;
    const rr = R0 * Math.cos(a), y = H * Math.sin(a);
    const pts = ringPts(segs, (th) => { const q = rr * plan(th, y * 0.3); return [q * Math.cos(th), y, q * Math.sin(th)]; });
    const N = Math.max(4, Math.round((TAU * R0) / 3.6));
    const us = []; for (let j = 0; j <= segs; j++) us.push((j / segs) * N * 3.6);
    rings.push({ pts, v: y * 1.3, us, kind: 10, dB: 30, ov: 0, hash: 0.3 });
  }
  g.loft(rings);
  g.fan(rings[rings.length - 1].pts, [0, H * 1.02, 0], { kind: 6 });
  return { g, H, R: R0 * 1.3, prof: [[R0 * 1.25, H * 0.6], [R0 * 0.6, H]] };
}

// A 2-tier super-simple stack for the very far ring.
export function archFar(seed) {
  const rng = new Rng(seed);
  const g = new GB();
  const segs = 7;
  const H = rng.range(180, 340), R0 = rng.range(38, 64);
  const plan = makePlan(rng, 1.2);
  const prof = [];
  terraceStack(g, { H, R: (k) => R0 * (1 - 0.65 * k), plan, segs, detail: 2, rng, levelH: () => H / 3, over: () => 4, cap: true, domeK: 0.4, profile: prof });
  return { g, H, R: R0, prof };
}

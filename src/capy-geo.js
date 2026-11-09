import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/BufferGeometryUtils.js';

// Capy modelling kit. All geometry carries aCol (albedo), aRest (bind position), aFold (cloth shading), aW (spine weight).

export const V3 = THREE.Vector3;
export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _v = new V3(), _n = new V3();

// colours are authored as display values: taken as-is (the pipeline has no sRGB encode at the end)
export const hex = (h) => { const c = new THREE.Color().setStyle(h, THREE.LinearSRGBColorSpace); return [c.r, c.g, c.b]; };
export const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
export const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;

// paint aCol from fn(pos, normal) -> [r,g,b] and fill the standard attributes
export function paint(g, fn) {
  const p = g.attributes.position, n = g.attributes.normal, N = p.count;
  const a = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    _v.fromBufferAttribute(p, i); _n.fromBufferAttribute(n, i);
    const c = typeof fn === 'function' ? fn(_v, _n) : fn;
    if (c) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; } else { a[i * 3] = a[i * 3 + 1] = a[i * 3 + 2] = 1; }
  }
  g.setAttribute('aCol', new THREE.BufferAttribute(a, 3));
  return g;
}

// standard extra attributes; call after the final position is known (bakes aRest)
export function finish(g) {
  const p = g.attributes.position, N = p.count;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.aCol) paint(g, null);
  g.setAttribute('aRest', new THREE.BufferAttribute(new Float32Array(p.array), 3));
  if (!g.attributes.aFold) g.setAttribute('aFold', new THREE.BufferAttribute(new Float32Array(N), 1));
  if (!g.attributes.aW) g.setAttribute('aW', new THREE.BufferAttribute(new Float32Array(N), 1));
  if (!g.attributes.aMask) g.setAttribute('aMask', new THREE.BufferAttribute(new Float32Array(N), 1));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(N * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'aCol', 'aRest', 'aFold', 'aW', 'aMask', 'uv'].includes(k)) g.deleteAttribute(k);
  return g;
}

export function deform(g, fn) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { _v.fromBufferAttribute(p, i); fn(_v, i); p.setXYZ(i, _v.x, _v.y, _v.z); }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

export function ell(rx, ry, rz, ws = 24, hs = 16) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  return g;
}

export function merge(list) {
  return mergeGeometries(list.map((g) => { const f = finish(g.index ? g.toNonIndexed() : g); return f; }), false);
}

// closed grid: rows along v (0..nv), columns wrap around (nu). fn(iu, iv, u, v, out) sets out.x,y,z. Rows 0 and nv collapse to caps.
export function gridClosed(nu, nv, fn, o = {}) {
  const P = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i < nu; i++) { fn(i, j, i / nu, j / nv, _v); P.push(_v.x, _v.y, _v.z); }
  }
  const idx = [];
  const id = (i, j) => j * nu + ((i + nu) % nu);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = id(i, j), b = id(i + 1, j), c = id(i + 1, j + 1), d = id(i, j + 1);
    idx.push(a, d, b, b, d, c);
  }
  // caps: fan to the ring's centroid
  let nVerts = P.length / 3;
  const capRow = (j, flip) => {
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < nu; i++) { const q = id(i, j) * 3; cx += P[q]; cy += P[q + 1]; cz += P[q + 2]; }
    P.push(cx / nu, cy / nu, cz / nu);
    const c = nVerts++;
    for (let i = 0; i < nu; i++) { const a = id(i, j), b = id(i + 1, j); if (flip) idx.push(c, b, a); else idx.push(c, a, b); }
  };
  if (o.capStart !== false) capRow(0, false);
  if (o.capEnd !== false) capRow(nv, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(idx);
  orientOutward(g);
  g.computeVertexNormals();
  return g;
}

// flips the winding of a closed mesh when its faces point inward (relative to the centroid of the vertices)
function orientOutward(g) {
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < p.count; i++) { cx += p.getX(i); cy += p.getY(i); cz += p.getZ(i); }
  cx /= p.count; cy /= p.count; cz /= p.count;
  let s = 0;
  for (let i = 0; i < p.count; i++) s += (p.getX(i) - cx) * n.getX(i) + (p.getY(i) - cy) * n.getY(i) + (p.getZ(i) - cz) * n.getZ(i);
  if (s < 0) { const a = g.index.array; for (let t = 0; t < a.length; t += 3) { const k = a[t + 1]; a[t + 1] = a[t + 2]; a[t + 2] = k; } }
}

// open grid (no wrap, no caps); fn(iu, iv, u, v, out)
export function gridOpen(nu, nv, fn) {
  const P = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { fn(i, j, i / nu, j / nv, _v); P.push(_v.x, _v.y, _v.z); }
  const idx = [];
  const id = (i, j) => j * (nu + 1) + i;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = id(i, j), b = id(i + 1, j), c = id(i + 1, j + 1), d = id(i, j + 1);
    idx.push(a, d, b, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// limb along -Y from y=0 to y=-len. rs: radius profile fn(t 0..1) (t=0 top). o: { sx, sz, seg, rows, zOff(t), folds(fn(a,t)) }. Rounded caps.
export function limb(len, rs, o = {}) {
  const nu = o.seg ?? 20, rowsMid = o.rows ?? 18, capN = o.capN ?? 6;
  const sx = o.sx ?? 1, sz = o.sz ?? 1;
  const r0 = rs(0), r1 = rs(1);
  const capH = o.cap ?? 1.0;                 // how round the caps are (1 = hemispheres)
  const nv = capN + rowsMid + capN;
  return gridClosed(nu, nv, (iu, iv, u, v, out) => {
    const a = u * Math.PI * 2;
    let r, y, t;
    if (iv <= capN) { const q = iv / capN * Math.PI / 2; r = Math.sin(q) * r0; y = Math.cos(q) * r0 * capH; t = 0; }
    else if (iv <= capN + rowsMid) { t = (iv - capN) / rowsMid; r = rs(t); y = -len * t; }
    else { const q = (iv - capN - rowsMid) / capN * Math.PI / 2; r = Math.cos(q) * r1; y = -len - Math.sin(q) * r1 * capH; t = 1; }
    const fold = o.folds ? o.folds(a, t) : 0;
    const rr = r + fold * Math.min(1, r / (r0 + 1e-6));
    out.set(Math.sin(a) * rr * sx, y, Math.cos(a) * rr * sz + (o.zOff ? o.zOff(t) : 0));
    if (o.warp) o.warp(out, a, t);
  });
}

export function tube(points, rFn, seg = 8, tseg = 16, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  const frames = curve.computeFrenetFrames(tseg, closed);
  const c = new V3();
  return gridClosed(seg, tseg, (iu, iv, u, v, out) => {
    curve.getPointAt(v, c);
    const r = rFn(v);
    const a = u * Math.PI * 2;
    out.copy(c).addScaledVector(frames.normals[iv], Math.cos(a) * r).addScaledVector(frames.binormals[iv], Math.sin(a) * r);
  }, { capStart: !closed, capEnd: !closed });
}

export function torus(r, tu, rs = 10, ts = 32) { return new THREE.TorusGeometry(r, tu, rs, ts); }

// a curved, tapered lock of fur: from root p0 along dir d (length L), bent by bend vector, radius r
export function lock(p0, d, L, r, bend = v3()) {
  const p1 = p0.clone().addScaledVector(d, L * 0.5).addScaledVector(bend, 0.3);
  const p2 = p0.clone().addScaledVector(d, L).addScaledVector(bend, 1);
  return tube([p0.clone().addScaledVector(d, -r * 0.5), p1, p2], (t) => r * Math.pow(1 - t, 0.75) * (0.7 + 0.6 * Math.sin(Math.min(1, t * 2.4) * Math.PI * 0.5)) + 0.0006, 6, 8);
}

// ------------------------------------------------------------------ SDF kit
export const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
export const smax = (a, b, k) => -smin(-a, -b, k);
export function sdEll(x, y, z, c, r) {
  const px = x - c[0], py = y - c[1], pz = z - c[2];
  const k0 = Math.hypot(px / r[0], py / r[1], pz / r[2]);
  const k1 = Math.hypot(px / (r[0] * r[0]), py / (r[1] * r[1]), pz / (r[2] * r[2]));
  return k1 < 1e-9 ? -Math.min(r[0], r[1], r[2]) : k0 * (k0 - 1) / k1;
}
export function sdBoxR(x, y, z, cx, cy, cz, hx, hy, hz, r) {
  const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r, qz = Math.abs(z - cz) - hz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}
export function sdRoundCone(x, y, z, a, b, r1, r2) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pax = x - a[0], pay = y - a[1], paz = z - a[2];
  const yy = pax * bax + pay * bay + paz * baz, zz = yy - l2;
  const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
  const x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * l2, z2 = zz * zz * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
}

// surface-nets mesher with Newton projection. bmin/bmax/h in metres. Indexed BufferGeometry with gradient normals.
export function meshSDF(f, bmin, bmax, h) {
  const nx = Math.ceil((bmax[0] - bmin[0]) / h) + 1, ny = Math.ceil((bmax[1] - bmin[1]) / h) + 1, nz = Math.ceil((bmax[2] - bmin[2]) / h) + 1;
  const V = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) V[id(i, j, k)] = f(bmin[0] + i * h, bmin[1] + j * h, bmin[2] + k * h);
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const cell = new Int32Array(cx * cy * cz).fill(-1);
  const cid = (i, j, k) => i + cx * (j + cy * k);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    let neg = 0;
    for (let c = 0; c < 8; c++) { const o = corners[c]; cv[c] = V[id(i + o[0], j + o[1], k + o[2])]; if (cv[c] < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      if ((cv[a] < 0) === (cv[b] < 0)) continue;
      const t = cv[a] / (cv[a] - cv[b]), oa = corners[a], ob = corners[b];
      sx += oa[0] + (ob[0] - oa[0]) * t; sy += oa[1] + (ob[1] - oa[1]) * t; sz += oa[2] + (ob[2] - oa[2]) * t; n++;
    }
    cell[cid(i, j, k)] = pos.length / 3;
    pos.push(bmin[0] + (i + sx / n) * h, bmin[1] + (j + sy / n) * h, bmin[2] + (k + sz / n) * h);
  }
  const idx = [];
  const quad = (a, b, c, d) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; idx.push(a, b, c, a, c, d); };
  for (let k = 1; k < cz; k++) for (let j = 1; j < cy; j++) for (let i = 0; i < cx; i++) {
    if ((V[id(i, j, k)] < 0) === (V[id(i + 1, j, k)] < 0)) continue;
    quad(cell[cid(i, j - 1, k - 1)], cell[cid(i, j, k - 1)], cell[cid(i, j, k)], cell[cid(i, j - 1, k)]);
  }
  for (let k = 1; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 1; i < cx; i++) {
    if ((V[id(i, j, k)] < 0) === (V[id(i, j + 1, k)] < 0)) continue;
    quad(cell[cid(i - 1, j, k - 1)], cell[cid(i, j, k - 1)], cell[cid(i, j, k)], cell[cid(i - 1, j, k)]);
  }
  for (let k = 0; k < cz; k++) for (let j = 1; j < cy; j++) for (let i = 1; i < cx; i++) {
    if ((V[id(i, j, k)] < 0) === (V[id(i, j, k + 1)] < 0)) continue;
    quad(cell[cid(i - 1, j - 1, k)], cell[cid(i, j - 1, k)], cell[cid(i, j, k)], cell[cid(i - 1, j, k)]);
  }
  const e = h * 0.35;
  const grad = (x, y, z) => [f(x + e, y, z) - f(x - e, y, z), f(x, y + e, z) - f(x, y - e, z), f(x, y, z + e) - f(x, y, z - e)];
  const nrm = new Float32Array(pos.length);
  for (let v = 0; v < pos.length; v += 3) {
    let x = pos[v], y = pos[v + 1], z = pos[v + 2];
    for (let it = 0; it < 3; it++) {
      const d = f(x, y, z), g = grad(x, y, z), gl = g[0] * g[0] + g[1] * g[1] + g[2] * g[2] + 1e-12;
      const s = d * (2 * e) / gl, mx = h * 0.6;
      x -= Math.max(-mx, Math.min(mx, s * g[0])); y -= Math.max(-mx, Math.min(mx, s * g[1])); z -= Math.max(-mx, Math.min(mx, s * g[2]));
    }
    const g = grad(x, y, z), l = Math.hypot(g[0], g[1], g[2]) || 1;
    pos[v] = x; pos[v + 1] = y; pos[v + 2] = z;
    nrm[v] = g[0] / l; nrm[v + 1] = g[1] / l; nrm[v + 2] = g[2] / l;
  }
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    if (fx * (nrm[a] + nrm[b] + nrm[c]) + fy * (nrm[a + 1] + nrm[b + 1] + nrm[c + 1]) + fz * (nrm[a + 2] + nrm[b + 2] + nrm[c + 2]) < 0) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

// surface point along a ray from origin o in direction d (first hit, f < 0 inside), bisected
export function raySurf(f, o, d, tMax = 1) {
  let lo = 0, hi = tMax;
  const inside = (t) => f(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t) < 0;
  // march outward from a point known inside
  if (!inside(0)) return null;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (inside(m)) lo = m; else hi = m; }
  const t = (lo + hi) / 2, x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t, e = 0.003;
  const n = new V3(f(x + e, y, z) - f(x - e, y, z), f(x, y + e, z) - f(x, y - e, z), f(x, y, z + e) - f(x, y, z - e)).normalize();
  return { p: new V3(x, y, z), n };
}

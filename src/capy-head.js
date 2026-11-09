import * as THREE from 'three';
import { paint, hex, mixc, sstep, lerp, sdEll, sdBoxR, sdRoundCone, smin, smax, meshSDF, finish, ell, tube, merge, gridClosed, v3, V3, raySurf } from './capy-geo.js';
import { skinMat, eyeMat, lidMat, noseMat, celMat, furMat } from './capy-mat.js';

// The head: a blunt rectangular capybara skull. One smooth skin (cranium, boxy muzzle, big cheeks, eye bulges) carved for the sockets and
// the mouth; a separate lower jaw hinged under the cheeks. Everything in head-local metres: +Z forward (nose), +Y up, X the character's left.

export const HEAD = {
  eye: { x: 0.1, y: 0.124, z: 0.02, r: 0.026 },
  jawHinge: [0, -0.058, -0.075],
  citrus: [0, 0.128, -0.06],
  noseTip: [0, 0.06, 0.322],
};

const fur = { base: '#8a5f46', dark: '#573b2e', light: '#b89174', muzzle: '#97745c' };
const C = { base: hex(fur.base), dark: hex(fur.dark), light: hex(fur.light), muzzle: hex(fur.muzzle) };

const eyeC = () => HEAD.eye;

// plan-view taper: wide cranium, then a muzzle of constant width to the end
export const tapOf = (z) => 1 - 0.27 * sstep(-0.06, 0.16, z);

export function headField() {
  const E = HEAD.eye;
  return (x, y, z) => {
    const ax = Math.abs(x), tap = tapOf(z);
    // one long deep rounded rectangle: flat top line from brow to nose, square muzzle end
    let d = sdBoxR(x / tap, y, z, 0, 0, 0.06, 0.14, 0.116, 0.262, 0.082);
    d = smin(d, sdEll(x, y, z, [0, -0.015, -0.17], [0.12, 0.105, 0.08]), 0.05);
    // the eyes ride high on small rises at the back of the top line
    d = smin(d, sdEll(ax, y, z, [E.x - 0.035, 0.108, E.z], [0.04, 0.034, 0.045]), 0.02);
    // a straight crown across the top, so the eye rises do not read as two frog bumps from the front
    d = smin(d, sdBoxR(x, y, z, 0, 0.09, -0.085, 0.112, 0.045, 0.06, 0.04), 0.03);
    // jowls
    d = smin(d, sdEll(ax, y, z, [0.095, -0.055, -0.07], [0.055, 0.068, 0.09]), 0.04);
    // the lip line: high at the front, falling towards the back. Never a smile
    d = smax(d, (-0.13 + 0.032 * sstep(0.1, 0.3, z)) - y, 0.02);
    // the deep cleft of the upper lip
    d = smax(d, -sdRoundCone(x, y, z, [0, 0.012, 0.33], [0, -0.115, 0.33], 0.016, 0.018), 0.008);
    // sockets: the eyeballs sit in these
    d = smax(d, -(Math.hypot(ax - E.x, y - E.y, z - E.z) - E.r * 1.04), 0.005);
    return d;
  };
}

const cavity = (x, y, z, tap) => sdBoxR(x / tap, y, z, 0, -0.113, 0.115, 0.105, 0.075, 0.16, 0.022);

export function buildHead(ctx, mk, grp, parent) {
  const field = headField();
  const f = (x, y, z) => {
    const tap = tapOf(z);
    return smax(field(x, y, z), -cavity(x, y, z, tap), 0.012);
  };
  const g = meshSDF(f, [-0.24, -0.25, -0.28], [0.24, 0.2, 0.36], 0.0044);
  // colours and the mouth-interior mask
  const P = g.attributes.position, N = P.count;
  const mask = new Float32Array(N), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const tap = tapOf(z);
    if (Math.abs(cavity(x, y, z, tap)) < 0.006 && y < -0.03) mask[i] = 1;
    let c = C.base;
    c = mixc(c, C.dark, sstep(0.0, 0.11, y) * (1 - sstep(0.1, 0.24, z)) * 0.85);
    c = mixc(c, C.dark, sstep(-0.05, -0.2, z) * 0.45);
    c = mixc(c, C.muzzle, sstep(0.08, 0.2, z) * (1 - sstep(-0.01, 0.09, y)));
    c = mixc(c, C.light, sstep(-0.02, -0.09, y) * (1 - sstep(-0.02, -0.11, z)) * 0.9);
    c = mixc(c, C.light, sstep(0.0, -0.085, y) * sstep(0.12, 0.24, z) * 0.55);
    // darker bridge between the eyes
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aMask', new THREE.BufferAttribute(mask, 1));
  finish(g);
  // the cheek-puff morph is done with uInflate on the whole head (small): no extra attribute
  const skinM = skinMat({ id: 41 });
  const skull = mk(g, skinM, parent, 'skull');

  // ---- nose patch: a copy of the head mesh triangles around the snout tip, lifted slightly, the shape drawn in the shader
  const noseGeo = patch(g, (x, y, z) => z > 0.24 && Math.abs(x) < 0.1 && y > 0.0 && y < 0.125, 0.0016);
  const nm = noseMat({ id: 43 });
  mk(noseGeo, nm, parent, 'nose');

  // ---- jaw
  const J = HEAD.jawHinge;
  const jawPivot = grp(parent, J[0], J[1], J[2], 'jawP');
  const fj = (x, y, z) => {
    // barely visible: a narrow strip under the lip at the front, the rear tucked up inside the jowls
    const tap = tapOf(z);
    let j = sdBoxR(x / tap, y - 0.035 * sstep(0.14, -0.02, z), z, 0, -0.098, 0.09, 0.1, 0.037, 0.178, 0.03);
    j = smin(j, sdEll(x, y, z, [0, -0.112, 0.225], [0.062, 0.024, 0.05]), 0.02);
    return smax(j, -sdBoxR(x, y, z, 0, -0.05, 0.1, 0.062, 0.042, 0.165, 0.02), 0.01);
  };
  const jg = meshSDF(fj, [-0.14, -0.18, -0.14], [0.14, -0.03, 0.31], 0.0044);
  const JP = jg.attributes.position, JN = JP.count, jcol = new Float32Array(JN * 3), jmask = new Float32Array(JN);
  for (let i = 0; i < JN; i++) {
    const x = JP.getX(i), y = JP.getY(i), z = JP.getZ(i);
    const inTrough = sdBoxR(x, y, z, 0, -0.05, 0.1, 0.062, 0.042, 0.165, 0.02) < 0.004;
    if (inTrough) jmask[i] = 1;
    const c = mixc(mixc(C.light, C.base, sstep(-0.1, -0.05, y) * sstep(0.14, -0.04, z)), C.muzzle, sstep(0.1, 0.3, z) * 0.5);
    jcol[i * 3] = c[0]; jcol[i * 3 + 1] = c[1]; jcol[i * 3 + 2] = c[2];
  }
  jg.setAttribute('aCol', new THREE.BufferAttribute(jcol, 3));
  jg.setAttribute('aMask', new THREE.BufferAttribute(jmask, 1));
  jg.translate(-J[0], -J[1], -J[2]);
  finish(jg);
  // aRest stays in head coordinates so the mouth paint (y, z tests) lines up
  jg.attributes.aRest.array.forEach((_, i, a) => { a[i] += J[i % 3]; });
  const jawM = skinMat({ id: 45, jaw: true });
  mk(jg, jawM, jawPivot, 'jaw');

  // ---- tongue
  {
    const t = ell(0.052, 0.016, 0.13, 20, 12);
    t.translate(0, -0.087, 0.1);
    paint(t, (v) => mixc(hex('#e0636c'), hex('#b63b48'), sstep(0.0, 0.2, v.z - 0.0) * 0.0 + sstep(-0.098, -0.082, v.y)));
    t.translate(-J[0], -J[1], -J[2]);
    finish(t);
    mk(t, celMat(5, { id: 46, soot: 0 }), jawPivot, 'tongue');
  }

  // ---- incisors: two long chisels above, two below
  const teethMat = celMat(5, { id: 47, gloss: 0.3, soot: 0.2 });
  {
    const tl = [];
    for (const s of [1, -1]) {
      const gx = s * 0.0215;
      // upper incisors hang from the front of the mouth roof
      tl.push(tooth(gx, -0.045, 0.262, 0.0195, 0.075, 0.012, 0.15));
    }
    const ug = merge(tl); paint(ug, (v) => toothCol(v)); finish(ug);
    mk(ug, teethMat, parent, 'teethU');
    const ll = [];
    for (const s of [1, -1]) ll.push(tooth(s * 0.0195, -0.095, 0.262, 0.0175, 0.042, 0.012, -0.08, true));
    const lg = merge(ll); paint(lg, (v) => toothCol(v, true)); lg.translate(-J[0], -J[1], -J[2]); finish(lg);
    mk(lg, teethMat, jawPivot, 'teethL');
  }

  // ---- eyes
  const E = HEAD.eye;
  const face = { eyes: [], brows: [], skinM, jawM, nm, jawPivot, skull };
  const dirOf = (s) => v3(s * 0.5, 0.2, 0.85).normalize();
  for (const s of [1, -1]) {
    const piv = grp(parent, s * E.x, E.y, E.z, 'eye' + (s === 1 ? 'L' : 'R'));
    const dir = dirOf(s);
    // basis: Z forward along the gaze, Y towards head-up, X to complete
    const up = v3(s * 0.14, 1, 0); up.addScaledVector(dir, -up.dot(dir)).normalize();   // a slight roll: inner end of the lid high, so bored never reads as angry
    const xA = new V3().crossVectors(up, dir);
    piv.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA, up, dir));
    const ball = new THREE.SphereGeometry(E.r, 28, 20); finish(ball);
    const em = eyeMat({ id: 42 });
    const ballM = mk(ball, em, piv, 'eyeball' + s);
    const lidC = mixc(C.base, C.dark, 0.85);
    const LR = E.r * 1.05;
    const lidU = new THREE.SphereGeometry(LR, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
    paint(lidU, () => lidC); finish(lidU);
    const uLid = grp(piv, 0, 0, 0, 'lidU');
    mk(lidU, lidMat({ id: 41, edge: 400 }), uLid, 'lidU');
    const lidL = new THREE.SphereGeometry(LR * 0.995, 28, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5);
    paint(lidL, () => lidC); finish(lidL);
    const lLid = grp(piv, 0, 0, 0, 'lidL');
    mk(lidL, lidMat({ id: 41, edge: 2000 }), lLid, 'lidL');
    face.eyes.push({ piv, ball: ballM, uLid, lLid, s });
    // ---- brows: thick dark strokes lying on the bulge above the eye, built along the surface
    const bp = grp(parent, 0, 0, 0, 'brow' + s);
    const browPiv = grp(bp, s * E.x, E.y + 0.024, E.z + 0.002, 'browP');
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const u = k / 8;
      const tar = v3(s * (E.x - 0.045 + u * 0.06), E.y + 0.024 - 0.012 * (u - 0.45) * (u - 0.45) * 8 + 0.002, E.z + 0.05 - u * 0.1);
      const o0 = v3(s * 0.06, 0.035, 0.02);
      const sf = raySurf(field, o0, tar.clone().sub(o0).normalize(), 0.2);
      const pt = sf ? sf.p.clone().addScaledVector(sf.n, 0.004) : tar;
      pts.push(pt.sub(browPiv.position));
    }
    const bg = tube(pts, (t) => 0.0062 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.02 + 0.02)), 0.55) + 0.0014, 8, 18);
    paint(bg, () => hex('#2e1d14')); finish(bg);
    mk(bg, furMat({ id: 54, fur: 0, soot: 1 }), browPiv, 'brow');
    face.brows.push({ piv: browPiv, base: bp, s });
  }

  // ---- ears: small high round cups with an inner dark bowl
  face.ears = [];
  for (const s of [1, -1]) {
    const ep = grp(parent, s * 0.108, 0.098, -0.165, 'earP' + s);
    ep.rotation.set(-0.25, s * 0.5, -s * 0.55);
    const earSpring = grp(ep, 0, 0, 0, 'earS');
    const o = ell(0.024, 0.026, 0.014, 22, 16);
    o.translate(0, 0.02, 0);
    o.computeVertexNormals();
    paint(o, (v, n) => (n.z > 0.2 && Math.hypot(v.x, v.y - 0.024) < 0.016 ? hex('#3f2a24') : mixc(C.base, C.dark, 0.45)));
    finish(o);
    mk(o, furMat({ id: 48, fur: 0.5, size: 0.6 }), earSpring, 'ear');
    face.ears.push({ piv: earSpring, base: ep, s });
  }

  // ---- whiskers: a few stiff dark bristles at the muzzle corners
  {
    const list = [];
    for (const s of [1, -1]) for (let i = 0; i < 4; i++) {
      const a = v3(s * 0.104, 0.0 - i * 0.021, 0.25 + 0.012 * (i % 2));
      const b = a.clone().add(v3(s * (0.06 + i * 0.008), 0.008 - i * 0.015, -0.01 - i * 0.006));
      list.push(tube([a, a.clone().lerp(b, 0.55).add(v3(0, 0.01, 0)), b], (t) => 0.0011 * (1 - t * 0.8), 3, 6));
    }
    const wg = merge(list); paint(wg, () => hex('#2a1c16')); finish(wg);
    mk(wg, celMat(5, { id: 150, soot: 0.6 }), parent, 'whisker');
  }
  void eyeC;
  return { skull, face, field: f };
}

const toothCol = (v, lower) => mixc(hex(lower ? '#ecdcb6' : '#f3e6c4'), hex('#d0a56a'), sstep(0.018, 0.04, lower ? v.y + 0.09 : -0.05 - v.y) * 0.0 + (lower ? 0 : 0) + 0.24);

function tooth(x, y, z, hw, h, d, tilt, lower) {
  // a rounded plank, bevelled chisel tip
  const g = gridClosed(14, 12, (iu, iv, u, v, out) => {
    const a = u * Math.PI * 2;
    const t = v;
    const sx = Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.5);
    const cz = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.7);
    const yy = (lower ? 1 : -1) * h * t;
    const chisel = cz < 0 ? (1 - t * 0.55) : 1 - t * 0.1;
    out.set(sx * hw * (1 - 0.1 * t), yy, cz * d * chisel);
  });
  g.rotateX(tilt);
  g.translate(x, y + (lower ? 0.0 : 0.0), z);
  return g;
}

// copy the triangles for which test(x,y,z) holds, push along normals by `lift`
export function patch(g, test, lift) {
  const P = g.attributes.position, Nn = g.attributes.normal, ix = g.index.array;
  const map = new Map(), pos = [], nor = [], idx = [];
  const add = (i) => {
    if (!map.has(i)) {
      map.set(i, pos.length / 3);
      pos.push(P.getX(i) + Nn.getX(i) * lift, P.getY(i) + Nn.getY(i) * lift, P.getZ(i) + Nn.getZ(i) * lift);
      nor.push(Nn.getX(i), Nn.getY(i), Nn.getZ(i));
    }
    return map.get(i);
  };
  for (let t = 0; t < ix.length; t += 3) {
    if (test(P.getX(ix[t]), P.getY(ix[t]), P.getZ(ix[t])) || test(P.getX(ix[t + 1]), P.getY(ix[t + 1]), P.getZ(ix[t + 1])) || test(P.getX(ix[t + 2]), P.getY(ix[t + 2]), P.getZ(ix[t + 2]))) {
      idx.push(add(ix[t]), add(ix[t + 1]), add(ix[t + 2]));
    }
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  o.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  o.setIndex(idx);
  return finish(o);
}

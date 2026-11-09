import * as THREE from 'three';
import { buildWarlord, SK } from './warlord-model.js';
import { chitinMaterial, gemEyeMaterial, antennaMaterial, WU } from './warlord-mat.js';
import { poseAt, bakeSecondary, poseSecondary, scaleAt, HEAD0 } from './warlord-pose.js';
import { createMantle } from './warlord-mantle.js';
import { Rng, clamp, deg, invLerp, lerp, onTwos, smooth } from './util.js';

// WARLORD dept: createWarlord(ctx) -> { update(st), root, anchor(name, vec3), feet(), visible, mantleLight() }
// Rigid parts in a pivot hierarchy, driven by warlord-pose (a pure function of film time, springs baked at load).
const V = THREE.Vector3, Q = THREE.Quaternion, M4 = THREE.Matrix4;

// Two-bone IK (from the Leviathan archer, MIT, via the Colossus film).
export function solve2(a, b, c, T, Pole, bend) {
  a.parent.updateWorldMatrix(true, false);
  const S = a.parent.localToWorld(new V().copy(a.position));
  const ks = a.parent.matrixWorld.getMaxScaleOnAxis() * a.scale.x;
  const L1 = b.position.length() * ks, L2 = c.position.length() * ks;
  const D = T.clone().sub(S);
  const d = Math.min(Math.max(D.length(), Math.abs(L1 - L2) + 1e-3), L1 + L2 - 1e-3);
  const dd = D.normalize();
  const h0 = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(L1 * L1 - h0 * h0, 0));
  const p = Pole.clone().sub(S);
  p.addScaledVector(dd, -p.dot(dd)).normalize();
  const E = S.clone().addScaledVector(dd, h0).addScaledVector(p, h);
  const Tc = S.clone().addScaledVector(dd, d);
  const u = E.clone().sub(S).normalize();
  const f = Tc.clone().sub(E).normalize();
  const z = f.clone().addScaledVector(u, -f.dot(u));
  if (z.lengthSq() < 1e-6) z.copy(p);
  z.normalize().multiplyScalar(bend);
  const y = u.clone().negate();
  const x = new V().crossVectors(y, z);
  const qW = new Q().setFromRotationMatrix(new M4().makeBasis(x, y, z));
  const qP = a.parent.getWorldQuaternion(new Q());
  a.quaternion.copy(qP.invert().multiply(qW));
  const ang = Math.acos(clamp(u.dot(f), -1, 1));
  b.rotation.set(-bend * ang, 0, 0);
  a.updateWorldMatrix(false, true);
  return ang;
}
export function setWorldBasis(o, x, y, z) {
  const qW = new Q().setFromRotationMatrix(new M4().makeBasis(x, y, z));
  o.quaternion.copy(o.parent.getWorldQuaternion(new Q()).invert().multiply(qW));
}

export let WARLORD_API = null;

export async function createWarlord(ctx) {
  const { CUES, SHOTS, FPS } = ctx;
  const crack = { value: 0 };
  const matBody = chitinMaterial();
  const matArmour = chitinMaterial({ uCrack: crack });
  const W = buildWarlord(matBody, matArmour);
  const { root, j, pieces } = W;
  ctx.scene.add(root);
  ctx.shadowRoots.push(root);
  const FRAMES = Math.ceil(SHOTS[SHOTS.length - 1].end * FPS) + 2;
  bakeSecondary(FPS, FRAMES);

  for (const L of ['R', 'L']) for (const n of ['sh', 'ish']) j[n + L].rotation.order = 'YXZ';

  j.head.scale.setScalar(1.3);
  // eyes: a big faceted dome set on each side of the wedge
  const eyeGeo = new THREE.SphereGeometry(0.36, 48, 36);
  eyeGeo.scale(0.78, 1.1, 1.0);
  const eyeL = gemEyeMaterial({ id: 39 }), eyeR = gemEyeMaterial({ id: 37 });
  const eM = {};
  for (const [s, L, m] of [[1, 'R', eyeR], [-1, 'L', eyeL]]) {
    const e = new THREE.Mesh(eyeGeo, m);
    e.position.set(s * SK.ey[0], SK.ey[1], SK.ey[2]);
    e.scale.set(s, 1, 1);
    e.rotation.y = deg(s * 8);
    e.name = 'eye' + L;
    e.frustumCulled = false;
    j.head.add(e);
    eM[L] = e;
  }

  // antennae: thin whips, re-shaped every drawing, in head space
  const antN = 30, antR = 7;
  const antMat = antennaMaterial();
  const ant = ['L', 'R'].map((L) => {
    const s = L === 'R' ? 1 : -1;
    const g = new THREE.BufferGeometry();
    const nv = (antN + 1) * antR;
    const idx = [];
    const uv = new Float32Array(nv * 2);
    for (let a = 0; a <= antN; a++) for (let b = 0; b < antR; b++) {
      const q = a * antR + b;
      uv[q * 2] = a / antN; uv[q * 2 + 1] = b / antR;
      if (a < antN) { const b2 = (b + 1) % antR; const q2 = a * antR + b2; idx.push(q, q + antR, q2, q2, q + antR, q2 + antR); }
    }
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const m = new THREE.Mesh(g, antMat);
    m.frustumCulled = false;
    m.name = 'ant' + L;
    j.head.add(m);
    return { s, m, g, nv };
  });
  const updateAntenna = (a, t, sec, p) => {
    const { s, g } = a;
    const P = g.attributes.position, N = g.attributes.normal;
    const base = new V(s * 0.27, 1.26, 0.5);
    // the antennae reach up and curl back whatever the head is doing
    const upL = new V(0, 1, 0).applyQuaternion(j.head.getWorldQuaternion(new Q()).invert());
    const dir = new V(s * 0.46, 0.66, -0.1).normalize();
    const L = 5.4;
    const tw = (p.st.hot > 0.5 ? 0.7 : 1) * (1 + 0.5 * Math.sin(t * 0.7));
    const pts = [];
    for (let i = 0; i <= antN; i++) {
      const u = i / antN;
      const u2 = u * u;
      const swing = sec.map((x) => Math.max(-1, Math.min(1, x * 0.08)));
      const wave = Math.sin(u * 7 - t * 2.1 + s) * 0.17 * u2 * tw;
      const wave2 = Math.sin(u * 14 + t * 3.4 + s * 2) * 0.05 * u * tw;
      const sag = -0.55 * Math.pow(u, 2.2);
      pts.push(new V(
        base.x + dir.x * L * u + upL.x * 1.4 * u2 + swing[0] * L * u2 * s * 0.5 + wave * 0.5,
        base.y + dir.y * L * u + upL.y * 1.4 * u2 + sag + swing[1] * L * u2 + wave,
        base.z + dir.z * L * u + upL.z * 1.4 * u2 + swing[2] * L * u2 + wave2,
      ));
    }
    const T = new V(), N0 = new V(), B = new V();
    for (let i = 0; i <= antN; i++) {
      T.copy(pts[Math.min(i + 1, antN)]).sub(pts[Math.max(i - 1, 0)]).normalize();
      N0.set(1, 0.2, 0).addScaledVector(T, -new V(1, 0.2, 0).dot(T)).normalize();
      B.crossVectors(T, N0);
      const u = i / antN;
      const r = lerp(0.075, 0.012, Math.pow(u, 0.7));
      for (let b = 0; b < antR; b++) {
        const a2 = (b / antR) * Math.PI * 2, c = Math.cos(a2), sn = Math.sin(a2);
        const q = i * antR + b;
        const nx = N0.x * c + B.x * sn, ny = N0.y * c + B.y * sn, nz = N0.z * c + B.z * sn;
        P.setXYZ(q, pts[i].x + nx * r, pts[i].y + ny * r, pts[i].z + nz * r);
        N.setXYZ(q, nx, ny, nz);
      }
    }
    P.needsUpdate = true; N.needsUpdate = true;
  };

  const mantle = createMantle(ctx, j);

  // anchors
  const A = {};
  const mk = (name, parent, pos) => { const o = new THREE.Object3D(); o.position.set(...pos); parent.add(o); A[name] = o; return o; };
  mk('head', j.head, [0, 0.3, 0.3]);
  mk('mouth', j.head, [0, -0.5, 1.1]);
  mk('eyeL', eM.L, [0, 0, 0]);
  mk('eyeR', eM.R, [0, 0, 0]);
  mk('chest', j.chest, [0, 0.9, 1.1]);
  mk('chestC', j.chest, [0, 1.0, 0]);
  mk('pelvis', j.pelvis, [0, 0, 0]);
  mk('bladeTipR', j.wrR, [0, -SK.blade, 0.2]);
  mk('bladeTipL', j.wrL, [0, -SK.blade, 0.2]);
  mk('bladeMidR', j.wrR, [0, -SK.blade * 0.5, 0.3]);
  mk('bladeMidL', j.wrL, [0, -SK.blade * 0.5, 0.3]);
  mk('handL', j.iwrL, [0, -0.5, 0]);
  mk('handR', j.iwrR, [0, -0.5, 0]);
  mk('toeL', j.footL, [0, -SK.ballH, 1.74]);
  mk('toeR', j.footR, [0, -SK.ballH, 1.74]);
  mk('footL', j.footL, [0, -SK.ballH, 0.2]);
  mk('footR', j.footR, [0, -SK.ballH, 0.2]);

  // QA: every rigid part of the living body. Feet may touch the tiles.
  const contact = ['floor', 'prom', 'ground', 'tiles', 'promenade', 'pillar'];
  for (const m of W.meshes) {
    const n = m.name.replace('kit:', '');
    if (n.startsWith('A_') || n.startsWith('G')) continue;
    ctx.colliders.push({ name: 'warlord:' + n, dept: 'warlord', obj: m, kind: 'body', contact: /foot|iwr|^f[LR]|^th[LR]/.test(n) ? contact : undefined });
  }

  // --------------------------------------- flying pieces (pure functions of t)
  const tv = new V(), ts = new V(), tq = new Q(), tq2 = new Q(), te = new THREE.Euler();
  const worldM = new M4();

  function poseFor(t) { apply(t, Math.round(onTwos(t) * FPS)); }

  const G0 = 15, FR = 28;
  const flyRng = new Rng(9001);
  const flyGroup = new THREE.Group(); flyGroup.name = 'warlordFly'; ctx.scene.add(flyGroup);
  ctx.shadowRoots.push(flyGroup);

  // -------------------------------------------------------- apply a pose
  const footW = { L: { x: 0, y: 0, z: 0, planted: false, ok: false }, R: { x: 0, y: 0, z: 0, planted: false, ok: false } };

  const qFoot = new Q();
  const _a = new V(), _b = new V(), _c = new V(), _d = new V(), _e = new V(), _f = new V();

  function apply(t0, frame) {
    const p = poseAt(t0);
    const sec = poseSecondary(t0, frame);
    const s = p.s;
    root.position.set(...p.root.pos);
    root.rotation.set(0, deg(p.root.h), 0);
    root.scale.setScalar(s);
    root.updateMatrixWorld(true);

    // pelvis: weight over the feet (world xz back into root space)
    let lx = p.ox, lz = p.oz;
    if (p.pelW) {
      _a.set(p.pelW[0], root.position.y, p.pelW[1]);
      root.worldToLocal(_a);
      lx += _a.x; lz += _a.z;
    }
    j.pelvis.position.set(lx, p.py, lz);
    j.pelvis.rotation.set(deg(p.pR[0]), deg(p.pR[1]), deg(p.pR[2]));

    // spine: waist joints share the bend, head lags on the baked spring
    for (const n of ['waist1', 'waist2', 'waist3']) j[n].rotation.set(deg(p.wR[0]), deg(p.wR[1]), deg(p.wR[2]));
    j.chest.rotation.set(deg(p.cR[0]), deg(p.cR[1]), deg(p.cR[2]));
    j.neck.rotation.set(deg(p.nR[0]), deg(p.nR[1]), deg(p.nR[2]));
    j.head.rotation.set(deg(p.hR[0] + sec.head[0] * 0.8), deg(p.hR[1] + sec.head[1] * 0.8), deg(p.hR[2] + sec.head[2] * 0.8));

    // abdomen: pitch, swing, breathing
    let w = 1;
    for (let i = 0; i < 4; i++) {
      const a = j['abd' + i];
      const k = i === 0 ? 0.55 : 0.14;
      a.rotation.set(deg(p.aR[0] * k + sec.abd[0] * (0.3 + i * 0.3)), deg(p.aR[1] * k + sec.abd[1] * (0.4 + i * 0.4)), 0);
      const sc = 1 + 0.035 * (p.breath - 0.5) * (i + 1);
      a.scale.set(sc, 1, sc);
      w *= sc;
    }

    // mandibles
    const m = clamp(p.m + sec.m, -0.12, 1.2);
    for (const [L, sg] of [['R', 1], ['L', -1]]) {
      j['md' + L].rotation.set(deg(16 + 22 * m), deg(sg * lerp(-14, 42, m)), deg(sg * lerp(0, 10, m)));
      j['md2' + L].rotation.set(0, deg(sg * lerp(-16, 34, m)), 0);
    }

    // arms (FK)
    for (const [L, sg] of [['R', 1], ['L', -1]]) {
      const b = p['b' + L], i = p['i' + L], f = p['f' + L];
      j['sh' + L].rotation.set(deg(b[0]), deg(b[1] * sg), deg(b[2] * sg));
      j['el' + L].rotation.set(deg(-b[3]), 0, 0);
      j['wr' + L].rotation.set(deg(b[4] * 1.35), 0, 0);
      j['ish' + L].rotation.set(deg(i[0]), deg(i[1] * sg), deg(i[2] * sg));
      j['iel' + L].rotation.set(deg(-i[3]), 0, 0);
      j['iwr' + L].rotation.set(deg(-i[4]), 0, deg(-sg * f * 14));
      for (let n = 0; n < 3; n++) {
        const c1 = lerp(10, 72, f), c2 = lerp(14, 90, f), c3 = lerp(12, 58, f);
        const spread = (n - 1) * lerp(14, 2, f);
        j[`f${L}${n}a`].rotation.set(deg(spread), 0, deg(-sg * c1));
        j[`f${L}${n}b`].rotation.set(0, 0, deg(-sg * c2));
        j[`f${L}${n}c`].rotation.set(0, 0, deg(-sg * c3));
      }
      j[`th${L}a`].rotation.set(deg(lerp(30, 58, f)), 0, deg(-sg * lerp(30, 70, f)));
      j[`th${L}b`].rotation.set(0, 0, deg(-sg * lerp(12, 70, f)));
    }

    root.updateMatrixWorld(true);

    // legs (IK): ball of the foot is world-fixed when planted; the metatarsal lies down as the body drops
    const fwdBody = _a.set(0, 0, 1).transformDirection(root.matrixWorld).clone();
    const pelY = (j.pelvis.position.y) / 1;
    const crouchK = clamp((pelY - 2.0) / 3.1);
    for (const [L, sg] of [['R', 1], ['L', -1]]) {
      const F = p.feet[L];
      let ball;
      let yaw = F.yaw;
      if (F.air) { ball = root.localToWorld(_b.set(...F.air)).clone(); yaw = p.root.h + sg * 8; }
      else ball = new V(F.ball[0], F.ball[1] + SK.ballH * s, F.ball[2]);
      const fy = deg(yaw);
      const fw = new V(Math.sin(fy), 0, Math.cos(fy));
      const leftW = new V(Math.cos(fy), 0, -Math.sin(fy));
      // metatarsal direction: hock up and behind the ball
      const a0 = lerp(76, 16, smooth(crouchK));
      let a = deg(a0 + (F.air ? 30 : 0));
      const mDir = new V();
      let hockW = new V();
      // a far-behind foot stands its metatarsal up until the hock is within the reach of the leg (the IK must never fall short)
      const hipW = j['hip' + L].parent.localToWorld(_c.copy(j['hip' + L].position)).clone();
      const maxReach = (SK.thigh + SK.shin) * s * 0.97;
      for (let it = 0; it < 22; it++) {
        mDir.set(0, Math.cos(a), 0).addScaledVector(fw, -Math.sin(a)).normalize();
        hockW.copy(ball).addScaledVector(mDir, SK.meta * s);
        if (hockW.distanceTo(hipW) <= maxReach || a <= deg(6)) break;
        a -= deg(4);
      }
      // knee pole: forward of the hip, a little outward
      const hip = j['hip' + L];
      hip.parent.updateMatrixWorld(true);
      const hipP = hip.parent.localToWorld(_c.copy(hip.position)).clone();
      const pole = hipP.clone().addScaledVector(fwdBody, 6 * s).addScaledVector(leftW, sg * 0.6 * s).setY(hipP.y - 1.2 * s + 2.5 * s * (1 - crouchK));
      solve2(hip, j['knee' + L], j['hock' + L], hockW, pole, -1);

      // metatarsal: aim from hock to ball
      const hock = j['hock' + L];
      hock.updateWorldMatrix(true, false);
      const hockP = hock.getWorldPosition(_d).clone();
      const Y = hockP.clone().sub(ball).normalize();
      const Z = fw.clone().addScaledVector(Y, -fw.dot(Y)).normalize();
      const X = new V().crossVectors(Y, Z);
      setWorldBasis(hock, X, Y, Z);
      hock.updateWorldMatrix(false, true);
      // foot: flat on the ground when planted, toes pointing down in the air
      const foot = j['foot' + L];
      te.set(deg(F.pitch ?? 0), fy, 0, 'YXZ');
      qFoot.setFromEuler(te);
      foot.quaternion.copy(hock.getWorldQuaternion(new Q()).invert().multiply(qFoot));
      foot.updateWorldMatrix(false, true);
      const o = footW[L];
      o.x = ball.x; o.y = ball.y - SK.ballH * s; o.z = ball.z; o.planted = F.planted; o.ok = true;
      if (F.air) { o.planted = false; }
    }

    // fist on the ground: IK for the inner hand R during the landing
    const ld = CUES.land;
    const fistK = smooth(invLerp(ld + 0.0, ld + 0.14, t0)) * (1 - smooth(invLerp(CUES.standUp + 0.18, CUES.standUp + 0.62, t0)));
    if (fistK > 0.002) {
      const L = 'R', sg = 1;
      const fp = root.localToWorld(_b.set(0.75, 0, 3.2)).clone();
      fp.y = 0.9;
      const ish = j['ish' + L];
      ish.parent.updateMatrixWorld(true);
      const S = ish.parent.localToWorld(_c.copy(ish.position)).clone();
      const pole = S.clone().add(_e.set(sg * 3, 0.5, -0.4).applyQuaternion(root.quaternion));
      const q0 = ish.quaternion.clone(), e0 = j['iel' + L].quaternion.clone();
      solve2(ish, j['iel' + L], j['iwr' + L], fp, pole, 1);
      ish.quaternion.slerp(q0, 1 - fistK).normalize();
      j['iel' + L].quaternion.slerp(e0, 1 - fistK).normalize();
      j['ish' + L].updateWorldMatrix(false, true);
      // wrist straight down with the knuckles forward
      if (fistK > 0.5) {
        const X = new V(1, 0, 0).applyQuaternion(root.quaternion);
        const Y = new V(0, 1, 0);
        const Z = new V().crossVectors(X, Y).normalize();
        setWorldBasis(j['iwr' + L], X, Y, Z);
      }
    }
    return p;
  }

  // the moment of the shed: every plate is launched from where it was at that frame
  const setStart = (list, t0, spd) => {
    apply(t0, Math.round(onTwos(t0) * FPS));
    root.updateMatrixWorld(true);
    const ctr = j.chest.getWorldPosition(new V()).add(new V(0, 1, 0));
    for (const c of list) {
      const m = c.m;
      m.updateWorldMatrix(true, false);
      m.matrixWorld.decompose(tv, tq, ts);
      c.p0 = tv.clone(); c.q0 = tq.clone(); c.s0 = ts.x;
      const d = tv.clone().sub(ctr);
      d.y += 0.9;
      d.normalize();
      const v = spd[0] + flyRng.next() * spd[1];
      c.v0 = d.multiplyScalar(v).add(new V((flyRng.next() - 0.5) * 4, flyRng.next() * 4, (flyRng.next() - 0.5) * 4));
      c.ax = new V(flyRng.next() - 0.5, flyRng.next() - 0.5, flyRng.next() - 0.5).normalize();
      c.spin = (flyRng.next() * 2 + 1.5) * (flyRng.next() < 0.5 ? -1 : 1);
    }
  };

  const plates = pieces.filter((x) => x.kind === 'plate');
  const gemsA = pieces.filter((x) => x.kind === 'gem');
  const gemsB = pieces.filter((x) => x.kind === 'lateGem');

  setStart(plates, CUES.shed, [9, 16]);
  setStart(gemsA, CUES.shed, [12, 16]);
  const breakT = CUES.breakup + 0.55;
  setStart(gemsB, breakT, [14, 20]);

  // ballistic flight with one bounce and a rest on the ground; returns position in tv and rotation in tq
  const flyAt = (c, dt) => {
    const R = (c.s0 ?? 1) * 0.1 + 0.05;
    let p = tv.copy(c.p0), vy = c.v0.y;
    const gy = ctx.ring?.groundY ? ctx.ring.groundY(c.p0.x + c.v0.x * Math.min(dt, 4) * 0.3, c.p0.z + c.v0.z * Math.min(dt, 4) * 0.3) : 0;
    const G = G0;
    const y0 = c.p0.y - (gy + R);
    const t1 = (vy + Math.sqrt(vy * vy + 2 * G * Math.max(y0, 0))) / G;
    if (dt <= t1) {
      p = p.addScaledVector(c.v0, dt);
      p.y = c.p0.y + vy * dt - 0.5 * G * dt * dt;
      tq.copy(c.q0).multiply(tq2.setFromAxisAngle(c.ax, c.spin * dt * 2.4));
    } else {
      const landX = c.p0.x + c.v0.x * t1, landZ = c.p0.z + c.v0.z * t1;
      const vb = (vy - G * t1) * -0.32, d2 = dt - t1;
      const t2 = (2 * vb) / G;
      if (d2 < t2) {
        p.set(landX + c.v0.x * 0.22 * d2, gy + R + vb * d2 - 0.5 * G * d2 * d2, landZ + c.v0.z * 0.22 * d2);
      } else p.set(landX + c.v0.x * 0.22 * t2, gy + R, landZ + c.v0.z * 0.22 * t2);
      const spinT = t1 + Math.min(d2, t2) * 0.5;
      tq.copy(c.q0).multiply(tq2.setFromAxisAngle(c.ax, c.spin * spinT * 2.4));
    }
  };

  // ----------------------------------------------------------------- API
  const api = {
    root,
    visible: false,
    update(st) {
      const t = st.t;
      const n = Math.round(onTwos(t) * FPS);
      const sid = st.sid;
      // only where the story needs it
      const after = t >= CUES.drop - 0.2;
      const sky = sid === 's20' || sid === 's22' || sid === 's29';
      const vis = after && (t < CUES.ascend + 0.2 || sky);
      const hidden = !vis || st.set === 'orbit';
      root.visible = !hidden;
      api.visible = !hidden;
      if (hidden) { mantle.setVisible(false); flyGroup.visible = false; return; }
      flyGroup.visible = true;
      const p = apply(t, n);
      const sec = poseSecondary(t, n);
      for (const a of ant) updateAntenna(a, onTwos(t), a.s > 0 ? sec.antR : sec.antL, p);

      // states
      WU.uVein.value = p.st.vein;
      WU.uVeinPulse.value = p.st.veinPulse;
      WU.uHot.value = p.st.hot;
      WU.uBlack.value = p.st.black;
      WU.uScaleK.value = p.s;
      crack.value = t < CUES.shed ? clamp(p.st.crack) : 0;

      // the broom's cut: a world plane through its centre; +X (anatomical left) is kept, -X is gone
      const rxW = _a.set(1, 0.36, -0.05).normalize().transformDirection(root.matrixWorld).clone();
      const cen = j.chest.getWorldPosition(_b).clone();
      WU.uCutOn.value = p.st.cutOn;
      WU.uCutN.value.copy(rxW);
      WU.uCutD.value = rxW.dot(cen) - (0.5 + p.st.regenU * 9) * p.s;
      WU.uCutC.value.copy(cen);
      WU.uBoil.value = p.st.boil;
      // ash front: the body's front goes first
      WU.uDisOn.value = p.st.disOn;
      const fw = _c.set(-0.42, -0.74, 0.5).normalize().transformDirection(root.matrixWorld).clone();   // sweeps across the frame from the lower left, the head goes last
      WU.uDisDir.value.copy(fw).multiplyScalar(-1);
      WU.uDisFront.value = fw.dot(cen) * -1 + lerp(-13, 9, p.st.disU);
      for (const m of [eyeL, eyeR]) { m.uniforms.uPupil.value = p.st.pupil; m.uniforms.uLight.value = p.st.eyeLight; m.uniforms.uDead.value = p.st.dead; }

      // armour on the body or flying
      const shed = t >= CUES.shed;
      for (const c of plates) {
        if (shed) {
          if (c.m.parent !== flyGroup) flyGroup.add(c.m);
          const dt = t - CUES.shed;
          c.m.visible = t < CUES.rush - 0.1;     // gone on the cut into the rush, never pops inside a shot
          flyAt(c, dt);
          c.m.position.copy(tv); c.m.quaternion.copy(tq); c.m.scale.setScalar(c.s0);
        } else {
          if (c.m.parent !== c.joint) c.joint.add(c.m);
          c.m.visible = true;
          c.m.position.copy(c.c); c.m.quaternion.identity(); c.m.scale.setScalar(1);
        }
      }
      for (const c of gemsA) {
        c.m.visible = shed && t < CUES.rush - 0.1;
        if (c.m.visible) {
          if (c.m.parent !== flyGroup) flyGroup.add(c.m);
          flyAt(c, t - CUES.shed);
          c.m.position.copy(tv); c.m.quaternion.copy(tq); c.m.scale.setScalar(c.s0);
        }
      }
      const bt = t >= breakT;
      for (const c of gemsB) {
        c.m.visible = t >= CUES.shed && t < breakT + 3;
        if (bt) {
          if (c.m.parent !== flyGroup) flyGroup.add(c.m);
          flyAt(c, t - breakT);
          c.m.position.copy(tv); c.m.quaternion.copy(tq); c.m.scale.setScalar(c.s0);
        } else {
          if (c.m.parent !== c.joint) c.joint.add(c.m);
          c.m.position.copy(c.c); c.m.quaternion.identity(); c.m.scale.setScalar(1);
        }
      }

      if (new URLSearchParams(location.search).get('mantle') === '0') mantle.setVisible(false); else mantle.update(st, p, sec, root);
      root.updateMatrixWorld(true);
      void worldM; void _f; void HEAD0; void scaleAt; void FR; void te; void _e;
    },
    anchor(name, out = new V()) {
      const o = A[name === 'bladeTip' ? 'bladeTipR' : name] ?? A.chest;
      o.updateWorldMatrix(true, false);
      return out.setFromMatrixPosition(o.matrixWorld);
    },
    feet() {
      if (!api.visible) return null;
      return ['L', 'R'].map((L) => ({ name: L, pos: [footW[L].x, footW[L].y, footW[L].z], planted: footW[L].planted }));
    },
    // the ash front for the FX department: fragments with dot(P, dir) < front are already gone; u is 0..1 across the shot
    ashFront() { return { on: WU.uDisOn.value > 0.5, dir: WU.uDisDir.value.toArray(), front: WU.uDisFront.value }; },
    mantleLight() { const c = api.anchor('chestC'); return { pos: [c.x, c.y + 1.6, c.z], k: mantle.level() }; },
    pose: apply,
  };
  // live skeleton for the cameras (they run before update, and frames come in any order)
  let lastT = -1;
  api.at = (t, name, out = new V()) => {
    if (t !== lastT) { apply(t, Math.round(onTwos(t) * FPS)); lastT = t; root.visible = root.visible; }
    const o = A[name] ?? A.chest; o.updateWorldMatrix(true, false); return out.setFromMatrixPosition(o.matrixWorld);
  };
  api.quat = (name, out = new Q()) => { const o = A[name] ?? j.chest; return o.getWorldQuaternion(out); };
  api.joint = (name) => j[name];
  ctx.warlord = api;
  WARLORD_API = api;
  return api;
}

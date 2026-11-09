import * as THREE from 'three';
import { buildBody, DIM, IK, torsoAt } from './capy-body.js';
import { buildPerformance, HOME_YAW, rotY } from './capy-act.js';
import { buildBroom, Bristles, buildDustpan, buildCitrus, LeafMesh, leafBlade, BROOM, DustBlobs } from './capy-props.js';
import { HEAD } from './capy-head.js';
import { CU, makeFurTex, celMat } from './capy-mat.js';
import { hex, paint, finish, v3, V3 } from './capy-geo.js';
import { onTwos, lerp, clamp, smooth, invLerp, Rng, noise1, deg as rad } from './util.js';
import { evalFrame } from './shots.js';
import { WARLORD, POD } from './layout.js';
import { CAPY_RT } from './capy-rt.js';

const DUR = 80, BAKE = 48;

function spring(N, d, f, zeta, force) {
  const w = 2 * Math.PI * f, dt = 1 / BAKE;
  const out = new Float32Array(N);
  let x = d[0], v = 0;
  for (let i = 0; i < N; i++) {
    const a = -2 * zeta * w * v - w * w * (x - d[i]) + (force ? force[i] : 0);
    v += a * dt; x += v * dt;
    out[i] = x - d[i];
  }
  return out;
}
const smp = (A, t) => { const x = Math.min(A.length - 1.001, Math.max(0, t * BAKE)); const i = Math.floor(x), f = x - i; return A[i] + (A[i + 1] - A[i]) * f; };

export function createCapy(ctx) {
  const { THREE: T, scene, CUES: C } = ctx;
  makeFurTex(ctx.engine.renderer);

  const parts = [];
  const contactNames = () => ctx.colliders.filter((c) => c.kind === 'solid' && /floor|pillar|tile|prom|ground/i.test(c.name)).map((c) => c.name);
  const mk = (geo, mat, parent, nm, coll) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = `capy.${nm}`;
    m.matrixAutoUpdate = true;
    parent.add(m); parts.push(m);
    if (coll) m.userData.coll = nm;
    return m;
  };
  const grp = (parent, x, y, z, nm) => { const g = new THREE.Group(); g.name = 'capy.' + nm; g.position.set(x ?? 0, y ?? 0, z ?? 0); parent.add(g); return g; };

  const rig = buildBody(ctx, mk, grp);
  scene.add(rig.root);
  ctx.shadowRoots.push(rig.root);

  const broom = buildBroom(ctx, mk, grp, scene);
  const bristles = new Bristles(ctx, scene);
  ctx.shadowRoots.push(bristles.mesh);
  ctx.shadowRoots.push(broom);

  // dustpan hangs from the belt on the left hip
  const panPivotBase = torsoAt(1.45, 0.02, 0.055);
  const panBase = grp(rig.hips, panPivotBase.x, panPivotBase.y, panPivotBase.z, 'panB');
  panBase.rotation.set(0, 0.22, 0);
  const pan = buildDustpan(mk, grp, panBase);

  // citrus: rides the head, later world space
  const citrus = buildCitrus(mk, grp, scene);

  // leaves
  const pileMesh = new LeafMesh(scene, 260, 'capy.pile', 9001);
  const heroLeaf = new LeafMesh(scene, 2, 'capy.heroLeaf', 42);
  heroLeaf.mesh.material = celMat(7, { id: 103, side: THREE.DoubleSide, soot: 0 });
  ctx.shadowRoots.push(pileMesh.mesh);

  // ---- rigid parts register as bodies (QA)
  const cn = contactNames();
  for (const m of parts) if (m.userData.coll) ctx.colliders.push({ name: m.name, dept: 'capy', obj: m, kind: 'body', contact: cn });
  const bristleColl = { name: 'capy.bristles', dept: 'capy', obj: bristles.mesh, kind: 'body', contact: cn };
  ctx.colliders.push(bristleColl);
  ctx.colliders.push({ name: 'capy.handle', dept: 'capy', obj: broom, kind: 'body', contact: cn });

  // ---- toe position for s09 (the warlord may not exist yet)
  let toe = [WARLORD.footL[0] - 0.2, WARLORD.footL[2] + 1.4];
  try {
    if (ctx.warlord && ctx.warlord.update && ctx.warlord.anchor) {
      const st = evalFrame(Math.round(C.toeTap1 * 24));
      ctx.warlord.update(st);
      const v = new V3();
      ctx.warlord.anchor('toeL', v);
      if (Number.isFinite(v.x) && Math.hypot(v.x, v.z) < 20) toe = [v.x, v.z];
    }
  } catch (e) { /* layout fallback */ }

  const perf = buildPerformance(C, toe);
  const pose = perf.pose;
  const PcWorld = (() => { const y = HOME_YAW; const r = rotY(y, 0.42, 0.8); return [r[0], 0, r[1]]; })();
  const pelvisW0 = (p) => { const s = rotY(p.yaw, p.shift[0], p.shift[1]); return [p.px + s[0], p.pz + s[1]]; };

  // late binding for the camera file: pure helpers based on the same performance
  CAPY_RT.yaw = (t) => pose(t).yaw;
  CAPY_RT.head = (t) => { apply(t, t); rig.root.updateWorldMatrix(true, true); const v0 = rig.head.localToWorld(new V3(0, 0.03, 0.06)); return [v0.x, v0.y, v0.z]; };
  CAPY_RT.headP = (t, lx, ly, lz) => { apply(t, t); rig.root.updateWorldMatrix(true, true); const v0 = rig.head.localToWorld(new V3(lx, ly, lz)); return [v0.x, v0.y, v0.z]; };
  CAPY_RT.stand = () => [perf.S[0], perf.S[1], perf.ang];
  CAPY_RT.pile = () => [PcWorld[0], PcWorld[2]];
  CAPY_RT.grip = (t, s) => { const p = pose(t); const b = broomPtsW(p, t); return [b.tip[0] + b.axis[0] * s, b.tip[1] + b.axis[1] * s, b.tip[2] + b.axis[2] * s]; };
  CAPY_RT.broomTip = (t) => { const p = pose(t); return broomPtsW(p, t).tip; };

  // ---- bake the springs for the whole film (pure: a fixed integration)
  const N = DUR * BAKE;
  const dPelvisX = new Float32Array(N), dPelvisY = new Float32Array(N), dPelvisZ = new Float32Array(N);
  const dHeadX = new Float32Array(N), dHeadY = new Float32Array(N), dHeadZ = new Float32Array(N);
  const dYaw = new Float32Array(N), dHeadYaw = new Float32Array(N), dHeadPitch = new Float32Array(N), dRoll = new Float32Array(N);
  const windX = new Float32Array(N), windZ = new Float32Array(N), windG = new Float32Array(N);
  const fwd = (y) => [Math.sin(y), Math.cos(y)];
  const windAt = (t) => {
    // a shock front arrives, whips past, decays; a gusting wind while the sky darkens; the sucking calm before the sweep
    let x = 0, z = 0, g = 0;
    const shock = (t0, dx, dz, k, dec) => { if (t >= t0) { const a = Math.exp(-(t - t0) / dec) * Math.min(1, (t - t0) / 0.04) * k; x += dx * a; z += dz * a; g += Math.abs(a); } };
    shock(C.hookShock, 0.25, 1, 26, 0.33);
    shock(C.land, -0.6, 0.8, 34, 0.42);
    shock(C.slash, 0.0, 1, 10, 0.5);
    shock(C.shed, 0.4, 0.9, 20, 0.9);
    shock(C.flick, 0.3, 1, 8, 0.4);
    if (t > C.gather && t < C.sweep) {
      const k = smooth(invLerp(C.gather, C.pileGone, t)) * 16 + 6 * (noise1(t * 4.1, 3) * 0.5 + 0.5);
      x += 0.6 * k * Math.sin(t * 0.9); z += k * 0.8; g += k * 0.4;
    }
    shock(C.sweep, 0.2, 1, 40, 0.5);
    return [x, z, g];
  };
  for (let i = 0; i < N; i++) {
    const t = i / BAKE;
    const p = pose(t);
    const s = rotY(p.yaw, p.shift[0], p.shift[1]);
    const px = p.px + s[0], pz = p.pz + s[1];
    dPelvisX[i] = px; dPelvisY[i] = p.y; dPelvisZ[i] = pz;
    const y = p.yaw + p.hipYaw + p.spine[1];
    dYaw[i] = y; dRoll[i] = p.hipRoll + p.spine[2];
    const f = fwd(y);
    dHeadX[i] = px + f[0] * 0.2; dHeadY[i] = p.y + 0.6; dHeadZ[i] = pz + f[1] * 0.2;
    dHeadYaw[i] = p.spine[1] + p.neck[1] + p.head[1] + p.hipYaw;
    dHeadPitch[i] = p.spine[0] + p.neck[0] + p.head[0] + p.hipPitch;
    const w = windAt(t); windX[i] = w[0]; windZ[i] = w[1]; windG[i] = w[2];
  }
  // spring tables (lag offset = where the soft part wants to be, minus where it is attached)
  const bellyX = spring(N, dPelvisX, 3.1, 0.34), bellyY = spring(N, dPelvisY, 3.1, 0.3), bellyZ = spring(N, dPelvisZ, 3.1, 0.34);
  const strapX = spring(N, dPelvisX, 4.6, 0.22), strapZ = spring(N, dPelvisZ, 4.6, 0.22), strapY = spring(N, dPelvisY, 4.6, 0.22);
  const earX = spring(N, dHeadX, 5.5, 0.2, windX), earZ = spring(N, dHeadZ, 5.5, 0.2, windZ), earY = spring(N, dHeadY, 5.5, 0.2);
  const panX = spring(N, dPelvisX, 1.9, 0.14), panZ = spring(N, dPelvisZ, 1.9, 0.14);
  const ragX = spring(N, dPelvisX, 3.0, 0.16, windX), ragZ = spring(N, dPelvisZ, 3.0, 0.16, windZ);
  const citX = spring(N, dHeadX, 4.2, 0.26), citZ = spring(N, dHeadZ, 4.2, 0.26);
  const headYawLag = spring(N, dYaw, 3.4, 0.55), headPitchLag = spring(N, dHeadPitch, 3.4, 0.55);

  const toWorld = (p, lx, ly, lz) => { const [dx, dz] = rotY(p.yaw, lx, lz); return [p.px + dx, ly, p.pz + dz]; };
  // pelvis xz including the clip shift
  const pelvisWorld = (p) => { const s = rotY(p.yaw, p.shift[0], p.shift[1]); return [p.px + s[0], p.pz + s[1]]; };

  // ---- stump state of the broom and the leaf pile: pure functions of time
  const stumpK = (t) => (t >= C.sweep ? 1 : 0);
  const stumpDrop = 0.148;
  const broomPtsW = (p, t) => broomPts(p, t);
  // broom world points for a pose
  const _bt = new V3(), _ba = new V3();
  function broomPts(p, t) {
    const b = p.broom;
    const tW = toWorld(p, b.tip[0], b.tip[1], b.tip[2]);
    const topW = toWorld(p, b.top[0] * 0.8, b.top[1], b.top[2]);
    tW[1] -= stumpK(t) * stumpDrop; topW[1] -= stumpK(t) * stumpDrop;   // the whole cut broom drops: same angle as before the sweep, so the last frame matches the first
    const a = _ba.set(topW[0] - tW[0], topW[1] - tW[1], topW[2] - tW[2]).normalize();
    return { tip: [tW[0], tW[1], tW[2]], axis: [a.x, a.y, a.z] };
  }

  // ---- pile
  const pileRng = new Rng(7331);
  const PN = 260;
  const homeP = { px: 0, pz: 0, yaw: HOME_YAW };
  const Pc = toWorld({ px: 0, pz: 0, yaw: HOME_YAW }, 0.42, 0, 0.8);
  const pileL = [];
  for (let i = 0; i < PN; i++) {
    const a = pileRng.range(0, Math.PI * 2), r = Math.sqrt(pileRng.next()) * 0.2;
    const hx = Pc[0] + Math.cos(a) * r, hz = Pc[2] + Math.sin(a) * r;
    const hy = 0.012 + (1 - (r / 0.2) ** 2) * (0.085 + pileRng.range(-0.02, 0.02)) * pileRng.range(0.4, 1);
    // scattered start: spread across the sweep arc, in front of him
    const sa = pileRng.range(-0.8, 0.65), sr = pileRng.range(0.45, 0.95);
    const so = toWorld(homeP, Math.sin(-sa) * sr, 0, Math.cos(sa) * sr + 0.1);
    pileL.push({ hx, hy, hz, sx: so[0], sz: so[2], rx: pileRng.range(-0.25, 0.25), ry: pileRng.range(0, 6.28), rz: pileRng.range(-0.25, 0.25),
      s: pileRng.range(0.5, 0.78), stroke: i < PN * 0.58 ? -1 : Math.floor(pileRng.range(0, Math.max(1, perf.strokes.length - 0.1))), vx: pileRng.range(-1, 1), vz: pileRng.range(-1, 1), vy: pileRng.range(1.5, 4), spin: pileRng.range(-9, 9), jit: pileRng.next(), r });
  }
  const gather = (t, L) => {
    if (L.stroke < 0) return 1;
    const ts = perf.strokes[L.stroke] ?? -9;
    return smooth(invLerp(ts + 0.18 + L.jit * 0.1, ts + 0.72 + L.jit * 0.1, t));
  };
  const heroPose = (t) => {
    // the one leaf: swings down the last shot. falls from high in the frame to the tile in front of the broom, then rides the broom
    const land = toWorld(homeP, -0.25, 0.0, 0.78);
    const u = invLerp(C.leafEnd, C.leafLand, t);
    const tf = u * (C.leafLand - C.leafEnd);
    const y = 1.5 * (1 - u) ** 1.08;
    const sw = Math.sin(u * 7.4) * 0.16 * (1 - u * 0.75);
    const dr = Math.cos(u * 3.7) * 0.05 * (1 - u);
    void tf;
    return [land[0] + sw * 0.6 + dr, y + 0.01, land[2] + sw * 0.8 - dr, Math.sin(u * 7.4) * 0.55, u * 2.3, Math.cos(u * 8.4) * 0.5];
  };
  const pileNow = [];
  const updatePile = (t) => {
    const yaw = HOME_YAW;
    const shocks = [C.land];
    const vis = (t < C.land + 2.0 || (t >= C.bladeHit && t < C.pileGone + 0.9));
    pileMesh.mesh.visible = vis;
    if (!vis) { pileNow.length = 0; return; }
    let nP = 0;
    for (let i = 0; i < PN; i++) {
      const L = pileL[i];
      let x, y, z, rx = L.rx, ry = L.ry, rz = L.rz;
      if (t < C.land) {
        // film start: piled leaves + stragglers carried in on strokes (rests flat when they arrive)
        const k = gather(t, L);
        x = lerp(L.sx, L.hx, k); z = lerp(L.sz, L.hz, k);
        y = lerp(0.006, L.hy, k);
      } else if (t < C.land + 2.0) {
        const dt = t - C.land, dx = L.hx - 4.2, dz = L.hz + 7.2, dl = Math.hypot(dx, dz) || 1;
        const vx = dx / dl * 5 + L.vx * 2.4, vz = dz / dl * 5 + L.vz * 2.4;
        x = L.hx + vx * dt; z = L.hz + vz * dt;
        y = Math.max(0.01, L.hy + L.vy * dt - 4.5 * dt * dt);
        rx += L.spin * dt; ry += L.spin * 0.7 * dt; rz += L.spin * 0.8 * dt;
      } else {
        // the pillar pile survives everything until the wind takes it, leaf by leaf
        const tg = C.pileGone - 0.62 + (L.jit * 0.6) * (0.9 - L.r / 0.24 * 0.6) + (L.r / 0.2) * 0.12;
        if (t < tg) { x = L.hx; y = L.hy; z = L.hz; }
        else {
          const dt = t - tg;
          x = L.hx + (L.vx * 0.5 + 0.2) * dt * 1.5 + 4.5 * dt * dt; z = L.hz + (1.2 + L.vz) * dt * 1.5 + 2.8 * dt * dt;
          y = L.hy + (0.6 + L.vy * 0.7) * dt + 1.4 * dt * dt;
          rx += L.spin * dt; ry += L.spin * 0.7 * dt; rz += L.spin * 0.8 * dt;
        }
        if (t > C.pileGone + 0.85) { y = -9; }
      }
      pileMesh.set(i, x, y, z, rx, ry, rz, L.s);
      if (y > -1) { pileNow[nP++] = { pos: [x, y, z], r: 0.03 * L.s }; }
    }
    pileNow.length = nP;
    pileMesh.commit();
    void shocks; void yaw;
  };

  // ---- dust: a burst where the bristles bite, a thin trail along the stroke. Baked once, pure function of t
  const dustMesh = new DustBlobs(scene, 48);
  const dustRng = new Rng(555);
  const dustList = [];
  // one small puff off the bristles per stroke, none while the pod shot plays: its dust is the shock front's
  for (const [T, P] of perf.dust) for (let b = 0; b < 8; b++) {
    const te = T + P * (0.18 + b * 0.012);
    if (te > C.rakeEnd && te < C.leafBlow + 0.2) continue;
    const pp = broomPts(pose(te + 0.2), te + 0.2);
    const a = dustRng.range(0, 6.28), sp = dustRng.range(0.08, 0.3);
    dustList.push({ te, x: pp.tip[0] + dustRng.range(-0.07, 0.07), z: pp.tip[2] + dustRng.range(-0.07, 0.07), vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: dustRng.range(0.06, 0.18),
      R: 0.03 * dustRng.range(0.6, 1.25), life: dustRng.range(0.85, 1.35) });
  }
  dustList.sort((a, b) => a.te - b.te);
  const updateDust = (t) => {
    let n = 0;
    for (const L of dustList) {
      const age = t - L.te;
      if (age <= 0 || age >= L.life || n >= dustMesh.count) continue;
      const u = age / L.life, e = 1 - (1 - u) * (1 - u);
      const r = L.R * (0.35 + 0.65 * Math.min(1, e * 2.5)) * (1 - smooth(invLerp(0.62, 1, u)));
      dustMesh.set(n++, L.x + L.vx * e * 0.7, 0.03 + r * 0.55 + L.vy * e, L.z + L.vz * e * 0.7, r);
    }
    for (let i = n; i < dustMesh.count; i++) dustMesh.set(i, 0, -50, 0, 0);
    dustMesh.commit();
  };

  // ---- the rig
  const v = new V3(), v2 = new V3(), v3b = new V3();
  const mChestLocal = new THREE.Matrix4(), mRestInv = new THREE.Matrix4().makeTranslation(0, -DIM.chestY, 0), mTmp = new THREE.Matrix4();
  const strapV = new V3();
  const qq = new THREE.Quaternion(), qq2 = new THREE.Quaternion(), EE = new THREE.Euler();
  const curl = (arm, c) => {
    const a0 = lerp(-0.14, -0.21, c), a1 = lerp(-0.25, -0.87, c), a2 = lerp(-0.2, -0.87, c);
    for (const f of arm.fingers) { f.f1.rotation.x = a0; f.f2.rotation.x = a1; f.f3.rotation.x = a2; }
    arm.t1.rotation.x = a0 * 0.9; arm.t2.rotation.x = a1 * 1.1;
  };
  const _wP = new V3(), _ank = new V3(), _pl = new V3(), _sh = new V3(), _u = new V3(), _ax = new V3(), _hx = new V3(), _hy = new V3(), _hz = new V3(), _gr = new V3();
  const footQ = new THREE.Quaternion();

  const frameM = new THREE.Matrix4();
  let lastPose = null, lastT = 0;

  function apply(t, q) {
    const p = pose(q);
    lastPose = p; lastT = t;
    const [wx, wz] = pelvisWorld(p);
    rig.hips.position.set(wx, p.y, wz);
    rig.hips.rotation.set(p.hipPitch, p.yaw + p.hipYaw, p.hipRoll, 'YXZ');
    const sp = p.spine, nk = p.neck, hd = p.head;
    rig.chest.rotation.set(sp[0], sp[1], sp[2], 'YXZ');
    // head follow-through: the head yaw lag softens the turn, pitch lag from the body's nod
    rig.neck.rotation.set(nk[0], nk[1], nk[2], 'YXZ');
    rig.head.rotation.set(hd[0] - smp(headPitchLag, t) * 0.25, hd[1] - smp(headYawLag, t) * 0.35, hd[2], 'YXZ');
    // skin
    mTmp.compose(rig.chest.position, rig.chest.quaternion, _wP.set(1, 1, 1));
    mChestLocal.multiplyMatrices(mTmp, mRestInv);
    const yawB = p.yaw + p.hipYaw;
    const toLocal = (dx, dz) => rotY(-yawB, dx, dz);
    const belly = toLocal(smp(bellyX, t), smp(bellyZ, t));
    const strap = toLocal(smp(strapX, t), smp(strapZ, t));
    strapV.set(strap[0] * 0.9, smp(strapY, t) * 0.4, strap[1] * 0.9);
    rig.skin.update(mChestLocal, clamp(belly[1] * 1.6, -0.018, 0.022) + 0.002 * p.breath, smp(bellyY, t) * 1.4, p.breath, strapV);
    rig.root.updateWorldMatrix(true, true);
    // legs
    for (const [nm, f] of [['L', p.fL], ['R', p.fR]]) {
      const lg = rig.legs[nm];
      EE.set(f.pitch, f.yaw, 0, 'YXZ'); footQ.setFromEuler(EE);
      _ank.set(0, DIM.footH, -DIM.ballZ).applyQuaternion(footQ); _ank.x += f.x; _ank.y += f.y; _ank.z += f.z;
      const k = rig.hips.localToWorld(_pl.set(lg.side * DIM.hipJoint[0] * 1.5, DIM.hipJoint[1] - 0.1, 1.5));
      IK.ik2(rig.hips, lg.thigh, lg.knee, _ank, k, DIM.thigh, DIM.shin, false);
      lg.knee.updateWorldMatrix(true, false);
      lg.knee.getWorldQuaternion(qq);
      lg.ankle.quaternion.copy(qq.invert().multiply(footQ));
    }
    rig.root.updateWorldMatrix(true, true);
    // broom
    const stump = stumpK(q);
    const bp = broomPts(p, q);
    const tW = _gr.set(bp.tip[0], bp.tip[1], bp.tip[2]);
    const ax = _ax.set(bp.axis[0], bp.axis[1], bp.axis[2]);
    broom.position.copy(tW);
    broom.quaternion.setFromUnitVectors(_hy.set(0, 1, 0), ax);
    broom.updateWorldMatrix(true, true);
    frameM.copy(broom.matrixWorld);
    // arms: right low on the handle, left high
    const _rest = new V3(), _restQ = new THREE.Quaternion(), _restQ2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0, Math.PI / 2 * 1, 'YXZ'));
    const place = (nm, s, c) => {
      const arm = rig.arms[nm];
      const G = _wP.copy(tW).addScaledVector(ax, s);
      arm.shBase ??= arm.sh.position.clone();
      arm.sh.position.copy(arm.shBase);
      arm.sh.updateWorldMatrix(true, false);
      arm.sh.getWorldPosition(_sh);
      const H = DIM.handGrip;
      // hand basis: X along the handle, Y from the handle towards the forearm
      const X = _hx.copy(ax).multiplyScalar(arm.side);
      const Y = _hy.copy(_sh).sub(G); Y.addScaledVector(X, -Y.dot(X)).normalize();
      const Z = _hz.crossVectors(X, Y).normalize();
      // wrist position: grip point in hand coordinates; handle centre is at H in the wrist frame
      const wr = v.copy(G).addScaledVector(Y, -H[1]).addScaledVector(Z, -H[2]);
      const free = nm === 'L' ? (p.freeL ?? 0) : 0;
      if (free > 0) wr.lerp(rig.chest.localToWorld(_rest.set(arm.side * 0.345, -0.13, 0.1)), smooth(free));
      // the far hand crosses the barrel: the shoulder blade slides towards it, the arm stays a working length
      const over = wr.distanceTo(_sh) - (DIM.upper + DIM.fore - 0.012);
      if (over > 0) {
        const nS = _sh.clone().addScaledVector(wr.clone().sub(_sh).normalize(), Math.min(over, 0.19));
        arm.sh.position.copy(rig.chest.worldToLocal(nS));
        arm.sh.updateWorldMatrix(true, false);
        arm.sh.getWorldPosition(_sh);
      }
      const pole = v2.copy(_sh).addScaledVector(rig.chest.localToWorld(v3b.set(arm.side * 1.0, -0.8, -0.6)).sub(_sh).normalize(), 0.3);
      IK.ik2(rig.chest, arm.sh, arm.el, wr, pole, DIM.upper, DIM.fore, true);
      arm.el.updateWorldMatrix(true, false);
      const m = new THREE.Matrix4().makeBasis(X, Y, Z);
      qq2.setFromRotationMatrix(m);
      if (free > 0) { rig.chest.getWorldQuaternion(_restQ).multiply(_restQ2); qq2.slerp(_restQ, smooth(free)); }
      arm.el.getWorldQuaternion(qq);
      arm.wr.quaternion.copy(qq.invert().multiply(qq2));
      arm.wr.updateWorldMatrix(true, false);
      curl(arm, lerp(c, 0.55, smooth(free)));
    };
    place('R', p.grip[0] * 0.86 + stump * 0.13, p.grip[2]);
    place('L', p.grip[1] * 0.86 + stump * 0.13, p.grip[3]);
    // bristles
    const dt = 1 / 24;
    const p0 = pose(q - dt), p1 = pose(q + dt);
    const a0 = broomPts(p0, q - dt), a1 = broomPts(p1, q + dt);
    const vel = v2.set((a1.tip[0] - a0.tip[0]) / (2 * dt), 0, (a1.tip[2] - a0.tip[2]) / (2 * dt));
    const w = windAt(q);
    const wv = v3b.set(w[0] * 0.012, 0, w[1] * 0.012);
    bristles.update(broom.matrixWorld, vel, wv, stump, 0, 0.5 * (p.grip[2] > 0.99 && q > C.grip && q < C.windup + 0.5 ? 0.1 : 0));
    // ---- pan, rag, ears, face, soot
    const pnx = toLocal(smp(panX, t), smp(panZ, t));
    pan.rotation.set(clamp(-pnx[1] * 4, -0.35, 0.35), 0, clamp(pnx[0] * 4, -0.3, 0.3));
    const rg = toLocal(smp(ragX, t), smp(ragZ, t));
    rig.ragPivot.rotation.set(clamp(rg[1] * 1.2, -0.9, 0.5) - 0.2, 0, clamp(-rg[0] * 2, -0.8, 0.8));
    for (const e of rig.face.ears) {
      const lag = rotY(-(p.yaw + p.hipYaw + p.spine[1]), smp(earX, t), smp(earZ, t));
      const lift = smp(earY, t);
      e.piv.rotation.set(clamp(lag[1] * 7 + lift * 4, -1.0, 0.8), 0, clamp(lag[0] * 6 * e.s, -0.8, 0.8) + p.ears[1] * e.s);
    }
    for (const e of rig.face.eyes) {
      e.uLid.rotation.x = -rad(p.lidU + 9 * smooth(invLerp(-30, 0, p.lidU)));
      e.lLid.rotation.x = -rad(p.lidL);
      e.ball.rotation.set(-p.look[1], p.look[0], 0);
    }
    for (const b of rig.face.brows) {
      b.piv.position.set(0, -0.012 * p.brow, 0);
      b.piv.rotation.set(0, 0, b.s * 0.5 * p.brow);
    }
    rig.face.jawPivot.rotation.x = 0.8 * p.jaw;
    rig.face.skinM.uniforms.uOpen.value = p.jaw; rig.face.jawM.uniforms.uOpen.value = p.jaw;   // closed: a plain ink line, no red lip
    const snoot = snootLeaf(t);
    rig.face.nm.uniforms.uFlare.value = Math.max(p.flare, snoot.blow);
    rig.face.skinM.uniforms.uInflate.value = 0.009 * snoot.blow;
    return p;
  }

  // the snoot leaf (leafSnoot .. leafBlow): stuck on the muzzle, then puffed off
  const sLeaf = new LeafMesh(scene, 1, 'capy.snootLeaf', 15);
  const snootLeaf = (t) => {
    const blow = Math.max(0, invLerp(C.leafBlow - 0.06, C.leafBlow + 0.03, t) * (1 - invLerp(C.leafBlow + 0.03, C.leafBlow + 0.2, t)));
    const on = t >= C.leafSnoot - 0.13 && t < C.leafBlow + 0.65;
    return { on, blow, flying: on && t > C.leafBlow + 0.03 };
  };

  // ---- citrus world behaviour
  const citrusRelease = C.citrusFall;

  // the citrus rolls over the side of the head nearest the camera, then drops. Baked once, pure in t
  const CIT_ROLL = 0.3, CIT_X = 0.2, CIT_DROP = 0.1;
  const citLocal = (u) => [HEAD.citrus[0] + CIT_X * u * u, HEAD.citrus[1] + citrus.R * 0.86 - CIT_DROP * Math.pow(Math.max(0, (u - 0.45) / 0.55), 2), HEAD.citrus[2]];
  const wobR = new THREE.Quaternion();
  const citTr = { p: new V3(), q: new THREE.Quaternion(), out: new V3() };
  const citSpin = new THREE.Vector3(0, 0, 1);
  {
    const p0 = apply(citrusRelease, citrusRelease); rig.root.updateWorldMatrix(true, true);
    const l = rotY(-(p0.yaw + p0.spine[1] + p0.hipYaw), smp(citX, citrusRelease), smp(citZ, citrusRelease));
    wobR.setFromEuler(new THREE.Euler(clamp(l[1] * 7.5, -0.4, 0.4), 0.4, clamp(-l[0] * 7.5, -0.4, 0.4), 'XYZ'));
    const qT = citrusRelease + CIT_ROLL;
    apply(qT, qT); rig.root.updateWorldMatrix(true, true);
    citTr.p.copy(rig.head.localToWorld(new V3(...citLocal(1))));
    const o0 = rig.head.localToWorld(new V3(0, 0, 0));
    citTr.out.copy(rig.head.localToWorld(new V3(1, 0, 0))).sub(o0).setY(0).normalize();
    rig.head.getWorldQuaternion(citTr.q);
    citTr.q.multiply(wobR).multiply(new THREE.Quaternion().setFromAxisAngle(citSpin, -CIT_X * DIM.headS / citrus.R));
  }

  function updateCitrus(t, q, p) {
    citrus.piv.visible = true;
    const R = citrus.R;
    if (t < citrusRelease) {
      rig.head.updateWorldMatrix(true, false);
      const pp = rig.head.localToWorld(v.set(HEAD.citrus[0], HEAD.citrus[1] + R * 0.86, HEAD.citrus[2]));
      citrus.piv.position.copy(pp);
      // the head's orientation plus a damped wobble (balancing) and the wind
      rig.head.getWorldQuaternion(qq);
      const l = rotY(-(p.yaw + p.spine[1] + p.hipYaw), smp(citX, t), smp(citZ, t));
      const wob = new THREE.Euler(clamp(l[1] * 7.5, -0.4, 0.4), 0.4, clamp(-l[0] * 7.5, -0.4, 0.4), 'XYZ');
      citrus.piv.quaternion.copy(qq).multiply(qq2.setFromEuler(wob));
    } else {
      const dt = Math.max(0, q - citrusRelease);
      if (dt < CIT_ROLL) {
        const u = dt / CIT_ROLL;
        rig.head.updateWorldMatrix(true, false);
        citrus.piv.position.copy(rig.head.localToWorld(v.set(...citLocal(u))));
        rig.head.getWorldQuaternion(qq);
        citrus.piv.quaternion.copy(qq).multiply(wobR).multiply(qq2.setFromAxisAngle(citSpin, -CIT_X * u * u * DIM.headS / R));
      } else {
        const tau = dt - CIT_ROLL, vOut = 2 * CIT_X * DIM.headS / CIT_ROLL * 0.55;
        citrus.piv.position.set(citTr.p.x + citTr.out.x * vOut * tau, Math.max(R * 0.9, citTr.p.y - 0.55 * tau - 4.9 * tau * tau), citTr.p.z + citTr.out.z * vOut * tau);
        citrus.piv.quaternion.copy(citTr.q).multiply(qq2.setFromAxisAngle(citSpin, -vOut / R * tau));
      }
      if (t > citrusRelease + 1.1) citrus.piv.visible = false;
    }
    if (t > C.pileGone + 8) citrus.piv.visible = false;
  }

  const anchors = {
    head: () => rig.head.localToWorld(new V3(0, 0, 0)),
    nose: () => rig.head.localToWorld(new V3(...HEAD.noseTip)),
    eyeL: () => rig.face.eyes[0].piv.getWorldPosition(new V3()),
    eyeR: () => rig.face.eyes[1].piv.getWorldPosition(new V3()),
    pawL: () => rig.arms.L.wr.localToWorld(new V3(0, -0.068, 0.044)),
    pawR: () => rig.arms.R.wr.localToWorld(new V3(0, -0.068, 0.044)),
    broomTip: () => broom.localToWorld(new V3(0, 0, 0)),
    broomMid: () => broom.localToWorld(new V3(0, BROOM.len * 0.5, 0)),
    citrus: () => citrus.piv.getWorldPosition(new V3()),
  };

  const api = {
    root: rig.root, rig, broom, bristles, perf, pose, apply,
    visible: true,
    update(st) {
      const t = st.t, q = onTwos(t);
      const hide = st.set === 'orbit' || st.set === 'warlord' || st.set === 'abstract' && st.sid !== 's27';
      rig.root.visible = !hide; broom.visible = !hide; bristles.mesh.visible = !hide; citrus.piv.visible = !hide; pileMesh.mesh.visible = !hide; heroLeaf.mesh.visible = !hide; sLeaf.mesh.visible = !hide; dustMesh.mesh.visible = !hide;
      this.visible = !hide;
      if (hide) return;
      // soot: black from the white-out until the shake blows it off
      CU.uSoot.value = t >= C.bladeHit && t < C.sootShake + 0.5 ? (t < C.sootShake ? 1 : 1 - smooth(invLerp(C.sootShake, C.sootShake + 0.42, t))) : 0;
      const p = apply(t, q);
      updateCitrus(t, q, p);
      updatePile(t);
      updateDust(t);
      // the hero leaf
      if (t >= C.leafEnd - 0.05) {
        heroLeaf.mesh.visible = true;
        const h = heroPose(q);
        let [x, y, z, a, b, c] = h;
        let rest = 0;
        if (t > C.leafLand) { rest = 1; const L = toWorld(homeP, -0.25, 0.008, 0.78); x = L[0]; y = 0.008; z = L[2]; a = -Math.PI / 2 + 0.05; b = 0.4; c = 0.2; }
        if (t > C.backToWork) { const tip = anchors.broomTip(); const u = smooth(invLerp(C.backToWork, C.backToWork + 0.45, t)); x = lerp(x, tip.x + 0.1, u); z = lerp(z, tip.z + 0.05, u); }
        heroLeaf.set(0, x, y, z, a, b, c, 1.1);
        heroLeaf.set(1, 0, -50, 0, 0, 0, 0, 0.0);
        heroLeaf.commit();
      } else heroLeaf.mesh.visible = false;
      // the snoot leaf
      const s = snootLeaf(t);
      sLeaf.mesh.visible = s.on;
      if (s.on) {
        // on the near corner of the snout, turned to the lens (the leaf's face is its +Z)
        const stuck = rig.head.localToWorld(v.set(-0.105, 0.085, 0.265));
        let x = stuck.x, y = stuck.y, z = stuck.z, a = 0.15, b = -0.3, c = 0.6;
        if (t < C.leafSnoot) { const u = (C.leafSnoot - t) / 0.13; x -= 2.3 * u; y += 0.5 * u; z += 0.4 * u; a += u * 3; b += u * 5; }   // arrives on the shock front
        if (s.flying) {
          const dt = t - C.leafBlow;
          const ax = Math.sin(lastPose.yaw), az = Math.cos(lastPose.yaw);
          x += ax * dt * 3.4; z += az * dt * 3.4; y += dt * 2.0 - 2.4 * dt * dt;
          a += dt * 9; b += dt * 12; c += dt * 7;
        }
        sLeaf.set(0, x, y, z, a, b, c, 1.5);
        sLeaf.commit();
      }
      rig.root.updateWorldMatrix(true, true);
    },
    anchor(name, out = new V3()) { const f = anchors[name]; if (!f) return out.set(0, 0, 0); return out.copy(f()); },
    feet() {
      const P = lastPose; if (!P) return [];
      return [
        { name: 'L', pos: [P.fL.x, P.fL.y, P.fL.z], planted: P.fL.planted },
        { name: 'R', pos: [P.fR.x, P.fR.y, P.fR.z], planted: P.fR.planted },
      ];
    },
    pile() { return pileNow; },
  };
  void C; void T; void POD; void paint; void finish; void leafBlade; void hex; void v3;
  return api;
}

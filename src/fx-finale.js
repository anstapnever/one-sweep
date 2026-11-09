import { CAPY_RT } from './capy-rt.js';
import * as THREE from 'three';
import { WARLORD, ORBIT } from './layout.js';
import { hash, hr, KIND, PAL, ID, boltPts, GLOW } from './fx-core.js';
import { clamp, smooth, invLerp, easeOut, easeIn, lerp } from './util.js';
import { SWEEP_FRAMES } from './fx-timing.js';

// The end of the film: ascent, star, nerve tree, the wind, the beam, the sweep, the oculus, ash, gems and the last leaf.
const V = THREE.Vector3;
const LIME = [0.72, 1.0, 0.16], WHITE = [1, 1, 1];
const LEAF = ['#5e7a3c', '#6f8b45', '#54703a', '#86a04e', '#9aa84e'];
const WIND_LEAF = ['#bcd85a', '#d0e66e', '#a8c84e', '#e6dc6a'];
const GEMC = ['#34d8c8', '#e9d24a', '#20b8c8', '#f0c23a', '#d4304e', '#7fe8b8'];

export function makeFinale(F) {
  const { C, I, ctx, camera, puffs, blocks, pebbles, gems, leaves, beams, mist, lines, glows, ribbons, cards, anchor, inkZ, massTone, project, pxScale, flash, focus, groundRing, sfx } = F;
  const _a = new V(), _b = new V(), _c = new V(), _d = new V();
  const SKY = new V(...WARLORD.skyPoint);

  sfx(C.ascend, 0, 40, -20, 0.8, 'ascend');
  sfx(C.star, 0, 0, 0, 0.8, 'star');
  sfx(C.veins, 0, 0, 0, 0.5, 'veins');
  sfx(C.fire, SKY.x, SKY.y, SKY.z, 1, 'beam');
  sfx(C.sweep, 0, 1, 0, 1, 'sweep');
  sfx(C.tunnel, 0, 200, -100, 0.9, 'oculus');
  sfx(C.breakup, SKY.x, SKY.y, SKY.z, 0.7, 'ash');

  // ------------------------------------------------------------ s20: lightning columns around the rising warlord
  function lightning(st) {
    const a = I.tq - C.ascend;
    if (a < 0) return;
    const h = anchor(ctx.warlord, 'head', [SKY.x, SKY.y, SKY.z]);
    const R = I.R, U = I.U;
    const pw = 0.7 + 0.3 * smooth(a / 1.2);
    for (let i = 0; i < 7; i++) {
      const keep = hash(i, (I.draw >> 1) & 7, 11);
      if (keep > 0.72) continue;
      const az = hr(i, 21, 1, 0, 6.283), D = hr(i, 21, 2, 34, 110);
      const x = h.x + Math.cos(az) * D, z = h.z + Math.sin(az) * D;
      const y0 = h.y - hr(i, 21, 3, 120, 300), y1 = h.y + hr(i, 21, 4, 120, 400);
      const pts = boltPts(_a.set(x, y0, z), _b.set(x + hr(i, 21, 5, -30, 30), y1, z + hr(i, 21, 6, -30, 30)), 411 + i * 17 + (I.draw >> 1), R, U, 0.05, 6);
      lines.push(pts, { px: 3.5, m: 1.2, width: (s) => 1.05 - 0.5 * Math.abs(s - 0.5), color: LIME, power: 1.5 * pw, soft: 12, mode: 2, rim: 0.9 });
    }
    const far = smooth((a - 0.5) / 1.0);   // near the launch the body stays readable, far away it becomes the white spark
    glows.push(h, { kind: GLOW.soft, m: 42 + 28 * far, color: [1, 1, 0.8], power: (0.16 + 0.34 * far) * pw, mode: 2 });
    glows.push(h, { kind: GLOW.burst, m: 7 + 13 * far + (1.5 + 1.5 * far) * Math.sin(I.draw * 2.1), color: LIME, power: (0.7 + 0.5 * far) * pw, mode: 2, seed: 0.11 + (I.draw % 4) * 0.05 });
  }
  lightning.shots = ['s20'];

  // ------------------------------------------------------------ s21: a star ignites on the ring
  function star(st) {
    const a = I.t - C.star;
    if (a < 0) return;
    const az = ORBIT.markerAz;
    const P = _a.set(ORBIT.origin[0] + Math.cos(az) * ORBIT.ringR, ORBIT.origin[1], ORBIT.origin[2] + Math.sin(az) * ORBIT.ringR);
    const k = smooth(a / 0.5);
    const grow = 0.22 + 0.78 * Math.pow(clamp(a / (C.veins - C.star)), 2.2);
    glows.push(P.clone(), { kind: GLOW.soft, m: 520 * grow, color: LIME, power: 0.28 * k, mode: 2 });
    glows.push(P.clone(), { kind: GLOW.kira, m: 2100 * grow, color: [1, 1, 0.8], power: 1.0 * k, mode: 2 });
    glows.push(P.clone(), { kind: GLOW.disc, m: 34 * grow, color: LIME, power: 1.5 * k, mode: 2 });
    for (let i = 0; i < 3; i++) {
      const ph = (a * 1.2 + i / 3) % 1;
      glows.push(P.clone(), { kind: GLOW.ring, m: (120 + ph * 800) * (0.5 + 0.5 * grow), color: LIME, power: 0.5 * (1 - ph) * k, mode: 2, seed: 0.03 });
    }
  }
  star.shots = ['s21'];

  // ------------------------------------------------------------ s22: the nervous system
  function nerves(st) {
    const lt = st.lt;
    const prog = easeOut(clamp(lt / 0.62), 1.4) * 1.02;
    const scale = 1.05 + 0.13 * smooth(lt / st.dur);
    const gain = 1 + 0.08 * Math.sin(I.draw * 2.3);
    cards.show('black');
    cards.show('veins', { mode: 1, prog, scale, gain });
  }
  nerves.shots = ['s22'];

  // ------------------------------------------------------------ s23: the wind tears the leaves away
  function windLeaves(st) {
    const t = I.tw, u = t - st.cues.veins - 1.2;
    if (u < 0 || u > 2.0) return;
    // the stream rides downwind (+x) out of his pile: large clean cel leaves crossing the frame at the broom's height
    const pl = CAPY_RT.pile ? CAPY_RT.pile() : [0.7, 0.7];
    for (let i = 0; i < 70; i++) {
      const b = hash(i, 22, 1) * 1.5;
      const a = u - b;
      if (a < 0) continue;
      const v = hr(i, 22, 2, 2.8, 6);
      const d = v * a * (1 + a * 0.8);
      const x = pl[0] + hr(i, 22, 3, -0.8, 0.1) + d, y = hr(i, 22, 4, 0.03, 0.45) + Math.sin(a * 6 + i) * 0.08 + 0.3 * a;
      const z = pl[1] + hr(i, 22, 5, -0.55, 0.55);
      if (d > 7) continue;
      const sp = a * 14;
      leaves.push(x, y, z, sp * hr(i, 22, 6, -1, 1), sp * hr(i, 22, 7, -1, 1), sp, hr(i, 22, 8, 0.1, 0.2), WIND_LEAF[i % WIND_LEAF.length]);
    }
    // a few big ones right past the lens
    for (let i = 0; i < 6; i++) {
      const b = hr(i, 23, 1, 0.1, 1.4);
      const a = u - b;
      if (a < 0 || a > 0.7) continue;
      const x = -2 + 8 * a, y = hr(i, 23, 2, 0.2, 1.2), z = hr(i, 23, 3, 2.0, 3.4);
      const sp = a * 9;
      leaves.push(x, y, z, sp, sp * 0.7, sp * 1.3, hr(i, 23, 4, 0.1, 0.16), WIND_LEAF[(i + 2) % WIND_LEAF.length]);
    }
  }
  windLeaves.shots = ['s23'];

  // ------------------------------------------------------------ s24: the planet-killer beam
  function bigBeam(st) {
    const t = I.tq, a = I.t - C.fire;
    const axisTop = _a.copy(SKY).sub(_b.set(0, 0, 0)).normalize();
    // before it fires: the star of energy above
    if (a < 0) {
      const k = smooth(invLerp(-0.4, 0, a));
      glows.push(SKY.clone(), { kind: GLOW.soft, m: 340, color: LIME, power: 0.7 + 0.5 * k, mode: 2 });
      glows.push(SKY.clone(), { kind: GLOW.burst, m: 90 + 30 * k, color: LIME, power: 1.3, mode: 2, seed: 0.2 + 0.05 * (I.draw % 3) });
      return;
    }
    const down = 1 - Math.exp(-a / 0.55);
    const D = SKY.length();
    const tipD = lerp(D, 95, down) - 8 * a;             // distance of the tip from the capybara along the axis
    const tip = axisTop.clone().multiplyScalar(tipD);
    const top = axisTop.clone().multiplyScalar(D + 1400);
    beams.push(tip.clone(), top.clone(), 26, 3200, { seed: 5.5, flow: 7, rough: 1.25 });
    // a collar of energy and torn air at the tip: a clean hard ring, the column stays readable above it
    const n = 20;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * 6.283;
      const w = 10 + 7 * Math.sin(ang * 5 + I.draw);
      const rr = 34 + 14 * hash(i, 24, 1 + (I.draw % 4));
      const p = _c.copy(tip).add(_d.set(Math.cos(ang) * rr, (hash(i, 24, 5) - 0.5) * 16, Math.sin(ang) * rr));
      puffs.inkZ = inkZ(tip.x, tip.y, tip.z) + (i % 2) * 15;
      puffs.push(p.x, p.y, p.z, w, 0, 1, 0.22, 0, 1, 0, i % 97, 0, 0, KIND.PUFF, i % 4 ? PAL.LIME : PAL.AIR, ID.SMOKE[i % 3]);
    }
    puffs.inkZ = 0;
    glows.push(tip.clone(), { kind: GLOW.burst, m: 30 + 7 * Math.sin(I.draw * 1.7), color: LIME, power: 1.1, mode: 2, seed: 0.33 + (I.draw % 3) * 0.04 });
    // a straight falling shock ring riding the column
    for (let i = 0; i < 3; i++) {
      const ph = (a * 0.7 + i / 3) % 1;
      const rr = lerp(30, 420, ph);
      const p = axisTop.clone().multiplyScalar(tipD + ph * 700);
      const q = project(p);
      if (q) {
        const pts = [];
        for (let k = 0; k <= 64; k++) {
          const th = (k / 64) * 6.283;
          const v = _c.copy(p).add(_d.set(Math.cos(th) * rr, 0, Math.sin(th) * rr));
          const qq = project(v);
          if (qq) pts.push({ x: qq.x, y: qq.y, w: 0.006 * (1 - ph) });
        }
        ribbons.push(pts, { style: 0, core: 0.5, band: 0.85, rough: 0.05, seed: i });
      }
    }
  }
  bigBeam.shots = ['s23', 's24', 's25', 's26'];

  // ------------------------------------------------------------ s26: leaves and pebbles rise around him in stillness
  function rising(st) {
    const u = I.tw - C.silence;
    if (u < -0.15) return;
    // keep every piece at least a metre from the body; they rise slowly and spin; the cut ends them
    for (let i = 0; i < 40; i++) {
      const b = hash(i, 26, 1) * 0.85;
      const a = u - b;
      if (a < 0) continue;
      const ang = hash(i, 26, 2) * 6.283, D = hr(i, 26, 3, 1.05, 4.6);
      const sw = 0.06 * Math.sin(a * 2 + i);
      const x = Math.cos(ang) * D + sw, z = Math.sin(ang) * D + sw;
      const y = 0.03 + hr(i, 26, 4, 0.35, 0.95) * a * (0.5 + 0.5 * smooth(a));
      const sp = a * hr(i, 26, 5, 0.4, 1.4);
      const sz = hr(i, 26, 6, 0.045, 0.13);
      pebbles.push(x, y, z, sp, sp * 0.8, sp * 1.2, sz, sz * 0.8, sz, i % 3 ? '#c9a898' : '#a88a84');
    }
    for (let i = 0; i < 16; i++) {
      const b = 0.05 + hash(i, 26, 11) * 0.7;
      const a = u - b;
      if (a < 0) continue;
      const ang = hash(i, 26, 12) * 6.283, D = hr(i, 26, 13, 1.2, 4.2);
      const x = Math.cos(ang) * D, z = Math.sin(ang) * D;
      const y = 0.02 + hr(i, 26, 14, 0.25, 0.7) * a;
      const sp = a * hr(i, 26, 15, 0.5, 1.3);
      leaves.push(x, y, z, sp, sp * 1.1, sp * 0.7, hr(i, 26, 16, 0.1, 0.17), LEAF[i % LEAF.length]);
    }
  }
  rising.shots = ['s26'];

  // ------------------------------------------------------------ s27: ONE SWEEP
  function theSweep(st) {
    const f0 = Math.round(C.sweep * 24), f = st.frame - f0;
    if (f < 0) {
      // the instant before: a hairline of white across the frame and thin needles of force
      const k = clamp(1 + f / 4);
      if (k > 0) {
        const w = 0.0035 * k * k;
        const pts = [];
        for (let i = 0; i <= 30; i++) { const s = i / 30; pts.push({ x: lerp(1.05, -1.05, s), y: lerp(-0.55, 0.45, s) + 0.1 * Math.sin(s * 3.1), w: w * Math.sin(Math.PI * s) }); }
        ribbons.push(pts, { style: 1, core: 0.8, band: 0.95, rough: 0 });
      }
      return;
    }
    const { negA, white, duo } = SWEEP_FRAMES;
    if (f >= negA[0] && f <= negA[1]) cards.show(f === 0 ? 'sweepNeg0' : 'sweepNeg1');
    else if (f >= white[0] && f <= white[1]) {
      cards.show('white');
    } else if (f >= duo[0] && f <= duo[1]) {
      cards.show(['sweepDuo0', 'sweepDuo2'][(f - duo[0]) % 2]);
    } else {
      // the arc front in its real colours, flying off the frame
      const k = clamp((f - duo[1]) / 8);
      cards.show('white', { a: 1 - smooth(k * 1.2) });
      cards.show('sweepFinal', { scale: 1 + 1.6 * k * k, ox: -0.12 * k, oy: 0.08 * k });
    }
  }
  theSweep.shots = ['s27'];

  // ------------------------------------------------------------ s28: the oculus
  const blue = new THREE.Mesh(new THREE.CircleGeometry(1, 64), F.blueMat);
  blue.frustumCulled = false; blue.userData.noShadow = true; blue.name = 'fx-oculus-sky'; blue.visible = false;
  F.scene.add(blue);
  function oculusOff() { blue.visible = false; }
  function oculus(st) {
    blue.visible = true;
    const lt = I.t - C.tunnel;
    const f = st.frame - Math.round(C.tunnel * 24);
    const k = easeOut(clamp(lt / 0.75), 2.2);
    const axis = I.F;
    const c = _a.copy(I.cam).addScaledVector(axis, 620);
    const R = I.R, U = I.U;
    // after the burst the hole keeps creeping open to the end of the shot: 7% more radius on a decaying curve, starting inside the fast part so there is no knee
    const creep = (1 - Math.exp(-Math.max(0, lt - 0.4) / 1.2)) / 0.806;
    const late = smooth(invLerp(0.85, 2.3, lt));
    const RH = (110 + 250 * k) * (1 + 0.072 * creep);
    blue.position.copy(c).addScaledVector(axis, 60);
    blue.scale.setScalar(RH * 1.2);
    blue.quaternion.copy(camera.quaternion);
    F.blueMat.uniforms.uK.value = k;
    // the torn ring: a band of huge lobes, the inner lip clean and bright
    const n = 130;
    const inkd = c.distanceTo(I.cam);
    for (let i = 0; i < n; i++) {
      const th = (i / n) * 6.283 + hash(i, 28, 1) * 0.03;
      const lag = hash(i, 28, 2);
      const band = i % 3;
      // the outer bands drift off faster than the lip, and some of the outermost lobes tear away
      const tear = band === 2 && hash(i, 28, 6) < 0.42 ? late : 0;
      const rr = RH * (1.06 + 0.1 * lag) + band * 56 * (0.7 + 0.5 * lag) + band * (10 + 34 * lag) * creep + tear * 130;
      const r = (band === 0 ? 70 : 90) * (0.65 + 0.55 * hash(i, 28, 3)) * (0.55 + 0.45 * k) * (1 + band * 0.05 * creep) * (1 - 0.45 * tear);
      const p = _b.copy(c).addScaledVector(R, Math.cos(th) * rr).addScaledVector(U, Math.sin(th) * rr).addScaledVector(axis, band * 15);
      puffs.inkZ = inkd + band * 40;
      const tone = band === 0 ? -0.2 : 0.05 + (hash(i, 28, 5) - 0.5) * 0.15;
      // lit from the hole: the inner billows carry the white, the outer ones fall into shade
      puffs.push(p.x, p.y, p.z, r, 0, 1, 0.24, 0, 1, 0, i % 97, tone, tear * 0.6, KIND.PUFF, PAL.AIR, ID.SMOKE[band]);
    }
    puffs.inkZ = 0;
    // long tongues of torn air streaming outward from the ring
    const nt = 54;
    for (let i = 0; i < nt; i++) {
      const th = (i / nt) * 6.283 + hash(i, 28, 11) * 0.09;
      const r0 = RH * 1.3 + 30 * hash(i, 28, 12) + 40 * creep * hash(i, 28, 15);
      const L = hr(i, 28, 13, 180, 440) * (0.35 + 0.65 * k) * (1 + 0.45 * creep);
      const p = _b.copy(c).addScaledVector(R, Math.cos(th) * r0).addScaledVector(U, Math.sin(th) * r0).addScaledVector(axis, 40);
      const dx = R.x * Math.cos(th) + U.x * Math.sin(th), dy = R.y * Math.cos(th) + U.y * Math.sin(th), dz = R.z * Math.cos(th) + U.z * Math.sin(th);
      const rw = hr(i, 28, 14, 14, 34) * (0.5 + 0.5 * k);
      puffs.push(p.x, p.y, p.z, rw, L, 0.18, 0.1, dx, dy, dz, i % 97, -0.1, 0.5 * hash(i, 28, 16) * smooth(invLerp(1.1, 2.37, lt)), KIND.TONGUE, PAL.AIR, ID.SMOKE[(i + 1) % 3]);
    }
    // curls peeling off the outer edge and leaving outward: one ink shape each, each ends by itself
    for (let i = 0; i < 16; i++) {
      const age = lt - (0.55 + hash(i, 28, 21) * 1.25);
      const life = hr(i, 28, 22, 0.9, 1.4);
      if (age < 0 || age > life) continue;
      const th = (i / 16) * 6.283 + hash(i, 28, 23) * 0.35, sgn = i % 2 ? 1 : -1;
      const base = RH * 1.62 + 40 * hash(i, 28, 24) + 110 * age;
      const span = hr(i, 28, 25, 180, 340) * (0.45 + 0.55 * (1 - Math.exp(-age / 0.35)));
      const grow = smooth(clamp(age / 0.5));
      const r0 = hr(i, 28, 26, 24, 46) * (1 - Math.pow(age / life, 3));
      puffs.inkZ = inkd + 100 + i * 3;
      for (let j = 0; j < 8; j++) {
        const q = (j / 7) * grow;
        const hook = Math.max(0, q - 0.5);
        const rho = base + span * q - 70 * Math.max(0, q - 0.72) / 0.28;
        const phi = th + sgn * (0.2 * q + 2.2 * hook * hook);
        const rj = r0 * (1 - 0.72 * q);
        if (rj < 2) continue;
        const pc = _b.copy(c).addScaledVector(R, Math.cos(phi) * rho).addScaledVector(U, Math.sin(phi) * rho).addScaledVector(axis, 30);
        puffs.push(pc.x, pc.y, pc.z, rj, 0, 1, 0.24, 0, 1, 0, (i * 7 + j) % 97, 0.05 + 0.1 * q, 0.5 * smooth(invLerp(0.6, 1, age / life)), KIND.PUFF, PAL.AIR, ID.SMOKE[i % 3]);
      }
    }
    puffs.inkZ = 0;
    // a few flakes and broken pieces falling through the frame from above, on threes; none of them shakes anything
    const lq = I.tq - C.tunnel, tanH = Math.tan((camera.fov * Math.PI) / 360), asp = camera.aspect;
    const FALL = ['#efe8c8', '#d6e48a', '#4c3338', '#c09a58'], CHUNK = ['#6a5a66', '#8b6a58', '#a8855c'];
    for (let i = 0; i < 53; i++) {
      const chunk = i >= 44;
      const T = chunk ? hr(i, 28, 32, 1.0, 1.6) : hr(i, 28, 32, 1.3, 2.2);
      const a = (lq - (-0.5 + hash(i, 28, 31) * 2.6)) / T;
      if (a < 0 || a > 1) continue;
      const D = chunk ? hr(i, 28, 33, 70, 180) : hr(i, 28, 33, 26, 85);
      const hh = D * tanH;
      const sy = hh * (1.2 - 2.4 * a), sx = hr(i, 28, 34, -1, 1) * hh * asp * 0.95 + Math.sin(a * 5 + i) * hh * 0.07;
      const pf = _b.copy(I.cam).addScaledVector(axis, D).addScaledVector(R, sx).addScaledVector(U, sy);
      const sp = a * hr(i, 28, 35, 2, 6) + i;
      const sz = D * hr(i, 28, 36, chunk ? 0.012 : 0.008, chunk ? 0.03 : 0.024);
      if (chunk) blocks.push(pf.x, pf.y, pf.z, sp, sp * 0.8, sp * 0.5, sz, sz * 0.7, sz * 0.5, CHUNK[i % 3]);
      else F.flakes.push(pf.x, pf.y, pf.z, sp, sp * 0.8, sp * 0.5, sz, FALL[i % 4]);
    }
    // the beam's flesh torn out and flung radially: lime-white wedges past the tongues, thinning out
    const nw = 42;
    const pw = 1 - smooth(invLerp(0.9, 2.0, lt));
    for (let i = 0; i < nw; i++) {
      const th = (i / nw) * 6.283 + hash(i, 29, 1) * 0.1;
      const r0 = RH * 1.55 + 60 * hash(i, 29, 2), r1 = r0 + hr(i, 29, 3, 200, 520) * (0.4 + 0.6 * k);
      const a0 = project(_b.copy(c).addScaledVector(R, Math.cos(th) * r0).addScaledVector(U, Math.sin(th) * r0));
      const a1 = project(_c.copy(c).addScaledVector(R, Math.cos(th) * r1).addScaledVector(U, Math.sin(th) * r1));
      if (!a0 || !a1) continue;
      const pts = [];
      for (let j = 0; j <= 10; j++) { const s = j / 10; pts.push({ x: lerp(a0.x, a1.x, s), y: lerp(a0.y, a1.y, s), w: (0.008 + 0.03 * hash(i, 29, 4)) * (1 - s) * Math.min(1, s / 0.15) * pw }); }
      if (pw > 0.01) ribbons.push(pts, { style: 0, core: 0.55, band: 0.86, rough: 0.05, seed: i * 1.7, power: pw });
    }
    if (f < 3) flash(1, 1, 1, 1 - f / 3);
  }
  oculus.shots = ['s28'];

  // ------------------------------------------------------------ s29: lime ash blown off the warlord
  function ash(st) {
    const a0 = C.breakup + 0.7, a1 = C.breakupEnd - 0.05;
    const U = (x) => lerp(x, smooth(x), 0.2);   // same curve as the warlord's disU
    if (I.tq < a0) return;
    const af = ctx.warlord.ashFront ? ctx.warlord.ashFront() : { on: false, dir: [0, 0, 1], front: 0 };
    if (!af.on) return;
    const ch = anchor(ctx.warlord, 'chest', [SKY.x, SKY.y, SKY.z]);
    const name = (n) => anchor(ctx.warlord, n, [ch.x, ch.y, ch.z]);
    const head = name('head'), pel = name('pelvis'), hL = name('handL'), hR = name('handR'), fL = name('footL'), fR = name('footR');
    const segs = [[ch, head], [ch, pel], [ch, hL], [ch, hR], [pel, fL], [pel, fR]];
    const Dir = _a.set(af.dir[0], af.dir[1], af.dir[2]).normalize();
    // front(t) = front0 + SPAN * smooth(u): the warlord's own mask plane, so every piece leaves the body at the moment the edge reaches it
    const SPAN = 22;
    const front0 = af.front - SPAN * U(invLerp(a0, a1, I.tq));
    const birth = (px, py, pz) => {
      const u = (px * Dir.x + py * Dir.y + pz * Dir.z - front0) / SPAN;
      if (u >= 1) return Infinity;
      if (u <= 0) return a0;
      let lo = 0, hi = 1;
      for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (U(m) < u) lo = m; else hi = m; }
      return lerp(a0, a1, (lo + hi) / 2);
    };
    // the wind takes it back the way the edge came, over the part that is already gone, so the living half stays clear
    const W = [-0.84, 0.3, 0.16];
    const spot = (i, salt, out) => {
      const sg = segs[i % 6], u = hash(i, salt, 1);
      out.x = lerp(sg[0].x, sg[1].x, u) + hr(i, salt, 2, -1.2, 1.2);
      out.y = lerp(sg[0].y, sg[1].y, u) + hr(i, salt, 3, -1.2, 1.2);
      out.z = lerp(sg[0].z, sg[1].z, u) + hr(i, salt, 4, -1.2, 1.2);
    };
    const p = _b;
    // three sizes of the same thing: torn plates of chitin, lime ash, and fat billows of ash the body turns into
    const CHITIN = ['#2c2230', '#4c3338', '#b98f52'];
    for (let i = 0; i < 360; i++) {
      const plate = i < 60;
      spot(i, plate ? 31 : 30, p);
      const tb = birth(p.x, p.y, p.z);
      const age = I.tq - tb;
      const life = plate ? hr(i, 30, 5, 1.2, 1.9) : hr(i, 30, 5, 0.7, 1.5);
      if (age < 0 || age > life) continue;
      const v = plate ? hr(i, 30, 6, 2.5, 7) : hr(i, 30, 6, 5, 15);
      const d = v * age * (1 + age * 0.5);
      const k = age / life;
      const x = p.x + W[0] * d + Math.sin(age * 3 + i) * 0.5, z = p.z + W[2] * d;
      const y = p.y + W[1] * d + Math.cos(age * 2.4 + i * 1.7) * 0.5 - (plate ? 3.2 * age * age : 0);
      const env = Math.min(1, age / 0.08) * (1 - k * k * k);
      const sz = (plate ? hr(i, 30, 7, 0.5, 1.25) : hr(i, 30, 7, 0.16, 0.58)) * env;
      if (sz < 0.02) continue;
      const sp = age * hr(i, 30, 8, plate ? 2 : 3, plate ? 5 : 8) + i;
      F.flakes.push(x, y, z, sp, sp * 0.8, sp * 0.5, sz, plate ? CHITIN[i % 3] : i % 4 ? '#c8f06a' : '#f4ffc8');
    }
    const inkd = inkZ(ch.x, ch.y, ch.z);
    for (let i = 0; i < 100; i++) {
      spot(i, 32, p);
      const tb = birth(p.x, p.y, p.z);
      const age = I.tq - tb;
      const life = hr(i, 32, 5, 0.75, 1.35);
      if (age < 0 || age > life) continue;
      const d = hr(i, 32, 6, 3.5, 9) * age * (1 + age * 0.5);
      // thin dry slivers: two tapers back to back make a spindle pointed at both ends, each at its own length and angle
      const k = age / life;
      const env = Math.min(1, age / 0.1) * (1 - k * k);
      const Ro = 0.07 + 0.24 * Math.pow(hash(i, 32, 7), 2.2);
      const R = (Ro / 3) * env;
      if (R < 0.008) continue;
      const L = Math.min(d * 0.35, Ro * hr(i, 32, 9, 5, 12) * 0.5) * hr(i, 32, 10, 0.5, 1.4) * env;
      const jx = hr(i, 32, 11, -0.55, 0.55), jy = hr(i, 32, 12, -0.55, 0.55), jz = hr(i, 32, 13, -0.3, 0.3);
      const dl = Math.hypot(W[0] + jx, W[1] + jy, W[2] + jz) || 1;
      const nx = (W[0] + jx) / dl, ny = (W[1] + jy) / dl, nz = (W[2] + jz) / dl;
      const x = p.x + W[0] * d, y = p.y + W[1] * d, z = p.z + W[2] * d;
      puffs.inkZ = inkd + (i % 5) * 2.5;
      const tone = hr(i, 32, 8, 0.1, 0.7);
      puffs.push(x, y, z, R, L / 2, 0.02, 0, nx, ny, nz, (i * 5) % 97, tone, 0, KIND.PUFF, PAL.DRY, ID.FLAT);
      puffs.push(x, y, z, R, L / 2, 0.02, 0, -nx, -ny, -nz, (i * 5) % 97, tone, 0, KIND.PUFF, PAL.DRY, ID.FLAT);
    }
    puffs.inkZ = 0;
  }
  ash.shots = ['s29'];

  // ------------------------------------------------------------ s31: gems and ash falling like snow, and the last leaf
  function snow(st) {
    const t = I.tq;
    const box = 26;
    const cam = I.cam;
    const wrap = (x) => { const m = ((x % box) + box) % box; return m - box * 0.5; };
    for (let i = 0; i < 320; i++) {
      const fall = hr(i, 31, 1, 1.0, 2.2), sway = hr(i, 31, 2, 0.5, 1.5);
      const x0 = hash(i, 31, 3) * box, y0 = hash(i, 31, 4) * box, z0 = hash(i, 31, 5) * box;
      const dx = wrap(x0 - cam.x + Math.sin(t * 0.7 + i) * sway);
      const dy = wrap(y0 - cam.y - t * fall);
      const dz = wrap(z0 - cam.z + Math.cos(t * 0.5 + i * 1.7) * sway);
      const x = cam.x + dx, y = cam.y + dy, z = cam.z + dz;
      if (y < 0.08) continue;
      // no flake crosses the capybara
      if (Math.hypot(x, z) < 1.7 && y < 2.4) continue;
      // nor the sight line from the lens to him
      if (y < 2.6) {
        const cx = cam.x, cz = cam.z, L2 = cx * cx + cz * cz;
        const q = L2 > 1e-3 ? Math.max(0, Math.min(1, (x * cx + z * cz) / L2)) : 0;
        if (Math.hypot(x - cx * q, z - cz * q) < 0.9) continue;
      }
      const ang = t * hr(i, 31, 6, 0.8, 1.6) + i;
      if (i < 60) {
        const sz = hr(i, 31, 7, 0.11, 0.27);
        gems.push(x, y, z, ang, ang * 0.7, 0.4, sz, sz * 1.25, sz, GEMC[i % GEMC.length]);
        // a glint now and then
        if (((I.draw >> 1) + i * 7) % 11 === 0) glows.push(new V(x, y, z), { kind: GLOW.kira, m: 0.8, color: i % 2 ? [1.0, 0.95, 0.6] : [0.5, 1.0, 0.9], power: 1.5, mode: 0, bias: 2 });
      } else {
        F.flakes.push(x, y, z, ang, ang * 0.6, 0.4 + ang * 0.3, hr(i, 31, 8, 0.24, 0.58), i % 3 ? '#efe8c8' : '#d6e48a');
      }
    }
    // ---- the one leaf
    const u = I.tw - C.leafEnd;
    if (u < 0) return;
    const LAND = [0.45, 0.002, 0.9];
    const T = C.leafLand - C.leafEnd;
    const k = clamp(u / T);
    const after = I.tw - C.backToWork;
    let x = LAND[0], y = LAND[1], z = LAND[2], rx = 0, rz = 0, ry = 0.7;
    if (u < T) {
      const y0 = 5.2;
      const ew = 1 - k;
      y = LAND[1] + y0 * Math.pow(ew, 1.35);
      const A = 0.85 * ew;
      const w = 2.4;
      const sw = Math.sin((u - 0.1) * w * 3.1);
      x = LAND[0] + A * sw * (0.6 + 0.4 * Math.sin(u * 1.3));
      z = LAND[2] + 0.5 * A * Math.cos((u - 0.1) * w * 3.1);
      rx = 0.55 * sw;
      rz = 0.2 * Math.cos(u * 4.1) * ew;
      ry = 0.7 + 0.18 * Math.sin(u * 2.3);
    } else if (after > 0) {
      // the broom takes it: it slides with the bristles
      const tip = anchor(ctx.capy, 'broomTip', [0.5, 0.05, 0.9]);
      const s = clamp(after / 0.32);
      x = LAND[0] + (tip.x - LAND[0]) * s * 0.8;
      z = LAND[2] + (tip.z - LAND[2]) * s * 0.8;
      y = 0.004 + 0.02 * Math.sin(s * Math.PI);
    }
    leaves.push(x, y, z, rx, ry, rz, 0.21, '#a4bf4a');
    F.anchors.set('leaf', new V(x, y, z));
  }
  snow.shots = ['s31'];

  return { steps: [oculusOff, lightning, star, nerves, windLeaves, bigBeam, rising, theSweep, oculus, ash, snow] };
}

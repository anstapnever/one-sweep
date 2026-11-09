import * as THREE from 'three';
import { WARLORD, CRATER } from './layout.js';
import { hash, hr, KIND, PAL, ID, boltPts, GLOW } from './fx-core.js';
import { clamp, smooth, invLerp, easeOut, easeIn, lerp } from './util.js';
import { BARRAGE_BIG, snapHit, fxGrade } from './fx-timing.js';

// The fight (s06–s19): landing, slash, armour burst, barrage, dash and blade, the smoke and the soot, the flick, regeneration.
const V = THREE.Vector3;
const LIME = [0.72, 1.0, 0.16];
const WHITE = [1, 1, 1];
const TILE = ['#f4d9cc', '#eccabc', '#f7e4da', '#e2bcae', '#d9b4a6'];
const GEM = ['#34d8c8', '#e9d24a', '#20b8c8', '#f0c23a', '#d4304e'];
const LEAF = ['#5e7a3c', '#6f8b45', '#54703a', '#86a04e', '#9aa84e'];

export function makeFight(F) {
  const { C, I, ctx, camera, puffs, rocks, blocks, pebbles, gems, leaves, beams, mist, lines, glows, ribbons, cards, anchor, inkZ, massTone, veil, flight, project, pxScale, flash, focus, groundRing, groundY, sfx } = F;
  const LAND = new V(WARLORD.land[0], 0, WARLORD.land[2]);
  const _a = new V(), _b = new V(), _c = new V(), _d = new V();

  sfx(C.drop, 8, 80, -14, 0.5, 'whoosh');
  sfx(C.land, LAND.x, 0, LAND.z, 1, 'land');
  sfx(C.slash, 0, 8, -5, 1, 'slash');
  sfx(C.shed, LAND.x, 9, LAND.z, 1, 'shed');
  sfx(C.rush, -60, 30, -160, 0.8, 'dash');
  sfx(C.bladeHit, 0, 1, 0, 1, 'blade');
  sfx(C.sootShake, 0, 1, 0, 0.3, 'puff');
  sfx(C.flick, 0, 1, 0, 0.6, 'flick');
  sfx(C.regen, 0, 6, -9, 0.4, 'regen');

  // keep the capybara readable
  function capyGuard() {
    const h = anchor(ctx.capy, 'head', [0, 0.95, 0]);
    return [{ x: h.x, y: h.y, z: h.z, R: 1.3 }, { x: h.x, y: h.y - 0.55, z: h.z, R: 1.0 }];
  }
  function warlordGuard(rw) {
    const c = anchor(ctx.warlord, 'chest', [LAND.x, 6, LAND.z]);
    return { x: c.x, y: c.y, z: c.z, R: rw };
  }

  // ------------------------------------------------------------ s06: drop streak and landing
  function landing(st) {
    const t = I.tq, a = t - C.land;
    // the streak
    if (a < 0.1) {
      const k = clamp((t - C.drop) / (C.land - C.drop));
      if (k >= 0 && t >= C.drop) {
        const sky = _a.set(LAND.x + 14, 150, LAND.z - 8);
        const head = _b.copy(sky).lerp(LAND, easeIn(k, 1.6));
        const tail = _c.copy(sky);
        const w = 1.5 * (a > 0 ? 1 - a / 0.1 : 1);
        beams.push(_d.copy(tail), head.clone(), 0.4 * w, 2.4 * w, { seed: 7, flow: 5, power: 1 });
      }
    }
    if (a < 0) return;
    if (a < 0.17) {
      const pw = a < 0.09 ? 1 : 0.5;
      glows.push(_a.set(LAND.x, 3, LAND.z), { kind: GLOW.burst, m: 15, color: LIME, power: 1.5 * pw, mode: 2, seed: 0.3 + (I.draw % 3) * 0.07 });
      glows.push(_a.set(LAND.x, 2, LAND.z), { kind: GLOW.soft, m: 34, color: LIME, power: 0.5 * pw, mode: 2 });
    }
    if (a < 0.1) flash(1, 1, 0.92, 0.32);
    if (a < 1.1) groundRing(LAND.x, LAND.z, 4 + 36 * easeOut(clamp(a / 0.9), 2.2), 1 - smooth(invLerp(0.55, 1.1, a)), 0.4);
    // radial dust ring
    puffs.guard = capyGuard();
    const n = 64;
    const inkd = inkZ(LAND.x, 1.5, LAND.z);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * 6.283 + hr(i, 1, 1, -0.04, 0.04);
      const del = hash(i, 1, 2) * 0.05;
      const aa = a - del;
      if (aa < 0) continue;
      const row = i % 3 === 0 ? 1 : 0;
      const g = 1 - Math.exp(-aa / 0.34);
      const R = (row ? 3.5 : 6) + (row ? 15 : 20) * g;
      const x = LAND.x + Math.cos(ang) * R, z = LAND.z + Math.sin(ang) * R;
      const y = (row ? 0.5 : 0.9) + 1.6 * hash(i, 1, 3) * g;
      const r = hr(i, 1, 4, 1.5, 3.2) * (0.45 + 0.9 * g) * (row ? 1.3 : 1);
      const fade = 1 - smooth(invLerp(1.0, 1.9, aa + hash(i, 1, 5) * 0.5));
      if (fade <= 0.02) continue;
      puffs.inkZ = inkd + (row ? 4 : 0);
      puffs.push(x, y + r * 0.4, z, r * fade, 0, 1, 0.22, 0, 1, 0, i % 97, massTone(x, y, z, LAND.x, 0, LAND.z, 12, 0), 0, KIND.PUFF, row ? PAL.SMOKE : PAL.DUST, ID.DUST[i % 3]);
    }
    puffs.inkZ = 0;
    // tile chips: thrown out and left lying (they sit until the cut away)
    for (let i = 0; i < 46; i++) {
      const ang = hash(i, 2, 1) * 6.283;
      const del = hash(i, 2, 2) * 0.06;
      const aa = I.t - C.land - del;
      if (aa < 0) continue;
      const sz = hr(i, 2, 3, 0.18, 0.75);
      const p0 = _a.set(LAND.x + Math.cos(ang) * hr(i, 2, 4, 1.5, 4), 0.2, LAND.z + Math.sin(ang) * hr(i, 2, 4, 1.5, 4));
      const v0 = _b.set(Math.cos(ang) * hr(i, 2, 5, 4, 15), hr(i, 2, 6, 5, 16), Math.sin(ang) * hr(i, 2, 5, 4, 15));
      const f = flight(_c, p0, v0, aa, 0.05, 9.8);
      const spin = f.ts * hr(i, 2, 7, 3, 9);
      blocks.push(_c.x, _c.y, _c.z, spin, spin * 0.7, spin * 0.4, sz, sz * 0.32, sz * 0.8, TILE[i % TILE.length]);
    }
  }
  landing.shots = ['s06', 's07'];

  // the pile is blown apart by the landing
  function pileBlown(st) {
    const a = I.tw - C.land;
    if (a < 0.02 || a > 1.5) return;
    const P = [0.65, 0.1, 0.5];
    for (let i = 0; i < 30; i++) {
      const aa = a - hash(i, 3, 1) * 0.05;
      if (aa < 0) continue;
      const v = hr(i, 3, 2, 4, 11), dx = -0.2 + hr(i, 3, 3, -1, 1), dz = 0.8 + hr(i, 3, 4, -0.9, 0.5);
      const drag = (1 - Math.exp(-aa / 0.7)) * 0.75;
      const x = P[0] + dx * v * drag, z = P[2] + dz * v * drag;
      const y = 0.1 + hr(i, 3, 5, 2, 7) * drag + Math.sin(aa * 5 + i) * 0.2 * drag - 2.2 * aa * aa;
      if (y < 0.03) continue;
      const sp = aa * 13;
      leaves.push(x, y, z, sp * hr(i, 3, 6, -1, 1), sp * hr(i, 3, 7, -1, 1), sp, hr(i, 3, 8, 0.08, 0.16), LEAF[i % LEAF.length]);
    }
  }
  pileBlown.shots = ['s06', 's07'];

  // ------------------------------------------------------------ s10: the slash
  function slashArc(st) {
    const a = I.t - C.slash;
    if (a < -0.001 || a > 0.7) return;
    const head = easeOut(clamp(a / 0.11), 2.2);
    const tail = easeIn(clamp((a - 0.1) / 0.5), 1.4);
    const fat = easeOut(clamp(a / 0.07), 2) * (1 - smooth(invLerp(0.18, 0.7, a)));
    if (head <= tail || fat < 0.005) return;
    const arc = (s, off = 0) => {
      const sa = lerp(tail, head, s);
      const x = -1.35 + 2.75 * sa;
      const y = -0.68 + 1.22 * sa - 0.5 * Math.sin(Math.PI * sa) + off;
      return [x, y, sa];
    };
    const pts = [], thin = [];
    const N = 42;
    for (let k = 0; k <= N; k++) {
      const s = k / N;
      const [x, y, sa] = arc(s);
      const belly = Math.pow(Math.sin(Math.PI * s), 0.7);
      pts.push({ x, y, w: 0.16 * fat * belly * (0.55 + 0.6 * sa) });
      const [x2, y2] = arc(s, 0.12 * fat * (1 - sa));
      thin.push({ x: x2, y: y2, w: 0.012 * belly * Math.sqrt(fat) });
    }
    ribbons.push(pts, { style: 0, core: 0.5, band: 0.8, rough: 0.14, seed: 2.7, freq: 22 });
    ribbons.push(thin, { style: 0, core: 0.8, band: 0.95, rough: 0.0, seed: 3.3 });
    if (a < 0.1) focus(0.5, -0.1, 0.6, 0.75, 70, 0.98, 1, 0.82);
    const fs = st.frame - Math.round(C.slash * 24);
    if (fs === 2 || fs === 3) cards.show('slashInk');
  }
  slashArc.shots = ['s10'];

  // ------------------------------------------------------------ s13: armour bursts
  function shed(st) {
    const t = I.tq, a = t - C.shed;
    if (a < -0.05 || a > 1.5) return;
    if (a < 0) { flash(0.95, 1, 0.8, 0.18); return; }
    const chest = anchor(ctx.warlord, 'chest', [LAND.x, 8, LAND.z]);
    const R = 2 + 52 * easeOut(clamp(a / 0.62), 2.0);
    const pw = 1 - smooth(invLerp(0.34, 0.62, a));
    if (pw > 0) {
      glows.push(chest, { kind: GLOW.disc, m: R * 0.98, color: LIME, power: 0.05 * pw, mode: 2 });
      glows.push(chest, { kind: GLOW.ring, m: R, color: WHITE, power: 1.25 * pw, mode: 2, seed: 0.03 });
      glows.push(chest, { kind: GLOW.ring, m: R * 0.72, color: LIME, power: 0.7 * pw, mode: 2, seed: 0.06 });
    }
    if (a < 0.2) glows.push(chest, { kind: GLOW.burst, m: Math.min(16 + 40 * a, I.cam.distanceTo(chest) * 0.55), color: LIME, power: 1.6 * (1 - a / 0.2), mode: 2, seed: 0.51 + (I.draw % 3) * 0.05 });
    if (a < 0.1) flash(1, 1, 0.9, 0.5);
    const sp = project(chest);
    if (sp && a < 0.5) focus(sp.x, sp.y, 0.45 + 2.6 * a, 0.7 * (1 - a / 0.5), 86);
    const fs = st.frame - Math.round(C.shed * 24);
    if (fs >= 0 && fs <= 3) cards.show(['shedNeg0', 'shedNeg1', 'shedBurst0', 'shedBurst1'][fs], {});
    // wind rips outward along the ground: a rolling dust ring
    groundRing(LAND.x, LAND.z, 6 + 66 * easeOut(clamp(a / 1.1), 2), 1 - smooth(invLerp(0.7, 1.3, a)), 0.5);
    const inkd = inkZ(LAND.x, 1, LAND.z);
    for (let i = 0; i < 44; i++) {
      const ang = (i / 44) * 6.283 + hash(i, 4, 1) * 0.1;
      const g = 1 - Math.exp(-a / 0.4);
      const rad = 8 + 34 * g;
      const x = LAND.x + Math.cos(ang) * rad, z = LAND.z + Math.sin(ang) * rad;
      const r = hr(i, 4, 2, 1.8, 4) * (0.4 + g) * (1 - smooth(invLerp(0.8, 1.45, a)));
      puffs.inkZ = inkd;
      puffs.push(x, 0.8 + r * 0.5, z, r, 0, 1, 0.22, 0, 1, 0, i % 97, massTone(x, 1, z, LAND.x, 0, LAND.z, 20, 0), 0, KIND.PUFF, PAL.DUST, ID.DUST[i % 3]);
    }
    puffs.inkZ = 0;
    // gem glints: stars that catch the light as the gems fly out (a few, on drawings, never a spray)
    for (let i = 0; i < 16; i++) {
      const az = hash(i, 5, 1) * 6.283, up = hr(i, 5, 2, -0.35, 0.8);
      const hz = Math.sqrt(1 - up * up);
      const b = hash(i, 5, 3) * 0.2;
      const aa = I.tq - C.shed - b;
      if (aa < 0 || aa > 0.75) continue;
      const v = hr(i, 5, 4, 16, 34);
      const x = chest.x + Math.cos(az) * hz * v * aa, y = chest.y + up * v * aa - 4 * aa * aa, z = chest.z + Math.sin(az) * hz * v * aa;
      const flick = ((I.draw + i) % 3 === 0) ? 1 : 0.25;
      const c = i % 3 === 0 ? [0.3, 0.95, 0.9] : [1.0, 0.92, 0.45];
      glows.push(new V(x, y, z), { kind: GLOW.kira, m: 1.8, color: c, power: 1.6 * flick * (1 - aa / 0.75), mode: 0, bias: 8 });
    }
  }
  shed.shots = ['s13'];

  // ------------------------------------------------------------ s14: the barrage
  const HITS = [];
  {
    const Q = [0, 2, 3, 5, 6, 7, 9, 10, 12, 13, 14, 15, 17, 18, 19, 20];
    const BIG = new Map(BARRAGE_BIG.map((v, i) => [Math.round(v * 8), i === 3 ? 2 : 1]));
    Q.forEach((q, i) => {
      const big = BIG.get(q) ?? 0;
      const x = big ? hr(i, 6, 1, -1, 1) : hr(i, 6, 1, -6, 6), z = big ? hr(i, 6, 2, -1, 1) : hr(i, 6, 2, -5, 5);
      HITS.push({ i, t: snapHit(C.barrage + q / 8), x, z, big, S: big === 2 ? 18 : big === 1 ? 13 : hr(i, 6, 3, 6, 9.5) });
    });
    for (const h of HITS) sfx(h.t, h.x, 2, h.z, h.big === 2 ? 1 : h.big ? 0.8 : 0.45, h.big ? 'boom' : 'hit');
  }
  const INCOMING = (i) => ({ az: hr(i, 7, 1, -0.55, 0.9), el: hr(i, 7, 2, 0.95, 1.25) });
  function barrage(st) {
    const t = I.tq;
    if (t < C.barrage - 0.3 || t > C.bladeHit + 0.05) return;
    // the bolts leave the warlord's chest, so the frame says who is shooting at whom
    const muzzle = anchor(ctx.warlord, 'chest', [0, 8, 0]).clone();
    // the rush: the smoke opens a lane from the lens to the warlord flying in
    if (st.sid === 's15') puffs.guard = { x: muzzle.x, y: muzzle.y, z: muzzle.z, R: 13 };
    for (const h of HITS) {
      const a = t - h.t;
      // the bolt arrives over two drawings, then is gone
      if (a < 0 && a >= -0.25) {
        const tgt = _a.set(h.x, 1, h.z);
        const dist = tgt.distanceTo(muzzle);
        const dir = _b.copy(muzzle).sub(tgt).normalize();
        const headK = (a + 0.25) / 0.25;                  // 0..1 as it comes in
        const head = _c.copy(tgt).addScaledVector(dir, dist * (1 - headK) + 1);
        const tail = _d.copy(tgt).addScaledVector(dir, dist);
        const w = h.big ? 3.4 : 1.8;
        beams.push(tail.clone(), head.clone(), 0.0, w, { seed: h.i * 1.3, flow: 8, rough: 0.7 });
      }
      // a bolt's trail hangs in the air for one drawing after the hit (the eye needs the line)
      if (a >= 0 && a < 0.125) {
        const tgt = _a.set(h.x, 1, h.z);
        beams.push(muzzle.clone(), tgt.clone(), 0.0, h.big ? 2.2 : 1.2, { seed: h.i * 1.7, flow: 8, rough: 0.7 });
      }
      if (a < 0) continue;
      const age = I.t - h.t;
      const n = h.big === 2 ? 62 : h.big ? 44 : 20;
      const S = h.S;
      const inkd = inkZ(h.x, S * 0.5, h.z) + (h.i % 3) * 3;
      puffs.inkZ = inkd;
      for (let i = 0; i < n; i++) {
        const ang = hash(h.i, i, 1) * 6.283, up = 0.15 + 0.85 * hash(h.i, i, 2), hz = Math.sqrt(1 - up * up);
        const g = 1 - Math.exp(-a / 0.2);
        const rx = 0.55 + 0.75 * hash(h.i, i, 3);
        const rise = a * a * 0.9 + 2.2 * a;
        const px = h.x + Math.cos(ang) * hz * S * g * rx;
        const py = Math.max(up * S * 0.92 * g * rx, 1.0) + rise * (0.6 + up);
        const pz = h.z + Math.sin(ang) * hz * S * g * rx;
        const age2 = a + hash(h.i, i, 5) * 0.3;
        const pal = age2 < 0.1 ? PAL.LIME : age2 < 0.3 ? PAL.FIRE : age2 < 0.55 && i % 3 === 0 ? PAL.FIRE : PAL.BURN;
        const r0 = S * (0.17 + 0.2 * hash(h.i, i, 4)) * (0.35 + 0.9 * g) * (1 + 0.14 * a);
        const die = 1 - smooth(invLerp(2.6, 3.6, a));
        const r = r0 * (0.45 + 0.55 * die);
        const tn = pal === PAL.BURN ? massTone(px, py, pz, h.x, S * 0.4, h.z, S, 0.08) : 0;
        puffs.inkZ = inkd + (i % 5) * S * 0.22;
        puffs.push(px, py, pz, r, 0, 1, 0.26, 0, 1, 0, (h.i * 11 + i) % 97, pal === PAL.FIRE ? -0.6 : tn, 0, KIND.PUFF, pal, ID.SMOKE[(h.i + i) % 3]);
      }
      puffs.inkZ = 0;
      if (a < 0.125) {
        // the flash shape: only the big hits fill the frame; small ones are short drawn stars
        const f = h.big ? 1 : 0.5;
        if (h.big || (I.draw % 2 === 0)) glows.push(_a.set(h.x, S * 0.5, h.z), { kind: GLOW.burst, m: S * (fxGrade(I.t).invert ? 0.55 : h.big ? 1.15 : 0.7), color: LIME, power: 1.7 * f, mode: 2, seed: (h.i * 0.17) % 1 });
        if (h.big) {
          const sp = project(_a.set(h.x, S * 0.5, h.z));
          if (sp) focus(sp.x, sp.y, 0.36, 0.85, 100, 1, 1, 0.82);
          flash(1, 1, 0.82, h.big === 2 ? 0.5 : 0.32);
        }
      }
    }
    // low dust spreading from under the barrage
    const u = t - C.barrage;
    if (u > 0) {
      const nd = 34;
      for (let i = 0; i < nd; i++) {
        const ang = (i / nd) * 6.283 + hash(i, 8, 1) * 0.1;
        const g = 1 - Math.exp(-u / 0.8);
        const R = 14 + 26 * g;
        const x = Math.cos(ang) * R, z = Math.sin(ang) * R;
        const r = hr(i, 8, 2, 1.6, 3.8) * (0.5 + 0.7 * g);
        puffs.inkZ = inkZ(0, 3, 0) + 8;
        puffs.push(x, r * 0.55, z, r, 0, 1, 0.26, 0, 1, 0, i % 97, massTone(x, r, z, 0, 0, 0, 30, 0.12), 0, KIND.PUFF, PAL.BURN, ID.DUST[i % 3]);
      }
      puffs.inkZ = 0;
    }
  }
  barrage.shots = ['s14', 's15'];
  barrage.camNear = 12;                   // s15's lens stands in the smoke: keep the billows off it

  // ------------------------------------------------------------ s15: the dash and the blade
  const DASH_FROM = new V(-90, 42, -240);
  function dash(st) {
    const t = I.tq;
    const a = t - C.rush;
    if (a < 0 || t > C.bladeHit + 0.1) return;
    const chest = anchor(ctx.warlord, 'chest', [0, 8, 0]);
    const k0 = clamp(a / (C.bladeHit - C.rush));
    const start = _a.copy(DASH_FROM).lerp(chest, Math.max(0, k0 - 0.55));
    const pts = [];
    for (let k = 0; k <= 22; k++) {
      const s = k / 22;
      const p = _b.copy(start).lerp(chest, s);
      p.y += Math.sin(Math.PI * s) * 4;
      const q = project(p);
      if (!q) continue;
      const wm = 1.8 * Math.pow(s, 1.4) * pxScale(q.d) * 0.95;
      pts.push({ x: q.x, y: q.y, w: Math.max(wm, 0.012 * s) });
    }
    ribbons.push(pts, { style: 0, core: 0.45, band: 0.8, rough: 0.2, seed: 4.1, freq: 14 });
    // towers burst where it passes
    for (let i = 0; i < 4; i++) {
      const s = (i + 0.5) / 5;
      const aa = t - (C.rush + s * (C.bladeHit - C.rush) * 0.75);
      if (aa < 0) continue;
      const P = _c.copy(DASH_FROM).lerp(chest, s * 0.8);
      const n = 12;
      puffs.inkZ = inkZ(P.x, P.y, P.z);
      for (let j = 0; j < n; j++) {
        const ang = (j / n) * 6.283 + hash(i, j, 1), g = 1 - Math.exp(-aa / 0.35);
        const R = 3 + 16 * g;
        const px = P.x + Math.cos(ang) * R, py = P.y + hr(i, j, 2, -6, 8) * g, pz = P.z + Math.sin(ang) * R;
        puffs.push(px, py, pz, hr(i, j, 3, 2.5, 6) * (0.4 + 0.8 * g), 0, 1, 0.26, 0, 1, 0, (i * 9 + j) % 97, massTone(px, py, pz, P.x, P.y, P.z, 12, 0), 0, KIND.PUFF, PAL.DUST, ID.DUST[i % 3]);
      }
      puffs.inkZ = 0;
      for (let j = 0; j < 8; j++) {
        const ang = hash(i, j, 4) * 6.283;
        const v = hr(i, j, 5, 18, 36);
        blocks.push(P.x + Math.cos(ang) * v * aa, P.y + hr(i, j, 6, -3, 12) * aa * 2 - 5 * aa * aa, P.z + Math.sin(ang) * v * aa, aa * 3, aa * 2, 0, 1.8, 1.0, 1.4, TILE[j % TILE.length]);
      }
    }
  }
  dash.shots = ['s15'];

  function bladeWhite(st) {
    const f0 = Math.round(C.bladeHit * 24), f = st.frame - f0;
    if (f < -2) return;
    if (st.sid === 's15') {
      // two-frame pre-flash, then pure white until the cut
      if (f < 0) { flash(1, 1, 0.8, 0.5); return; }
      flash(1, 1, 1, 1);
      // the ring drawn over the white: an ink line, then a thick lime line, flying out of frame
      const a = I.t - C.bladeHit;
      const R = 0.08 + 1.55 * easeOut(clamp(a / 0.5), 1.8);
      if (R > 0) {
        const pts = [], pts2 = [];
        for (let k = 0; k <= 128; k++) {
          const th = (k / 128) * 6.283;
          const w = 0.012 + 0.018 * Math.pow(Math.max(0, Math.sin(th * 3 + 1.1)), 8);
          const j = 1 + 0.018 * Math.sin(th * 13 + 2) + 0.012 * Math.sin(th * 29);
          pts.push({ x: Math.cos(th) * R * j / 1.6, y: Math.sin(th) * R * j * 0.95 - 0.1, w: w * (1 - a / 1.0) });
          pts2.push({ x: Math.cos(th) * R * 0.8 / 1.6, y: Math.sin(th) * R * 0.76 - 0.1, w: 0.004 });
        }
        ribbons.push(pts, { style: 3, core: 1, band: 1, rough: 0.05, seed: 1.1 });
        ribbons.push(pts2, { style: 3, core: 1, band: 1, rough: 0.05, seed: 1.7 });
      }
    } else if (st.sid === 's16') {
      // the white lets go into the smoke
      const k = 1 - smooth(invLerp(C.bladeHit + 0.72, C.bladeHit + 1.15, I.t));
      flash(1, 1, 1, k);
    }
  }
  bladeWhite.shots = ['s15', 's16'];

  // ------------------------------------------------------------ s16: smoke rolls off, the pillar, soot
  function smokeRoll(st) {
    const t = I.tq;
    const u = t - C.smokeClear;
    if (t < C.bladeHit + 0.3 || u > 3.4) return;
    const Rc = Math.max(0, u * 30);       // the clearing front moves outward
    const n = 300;
    for (let i = 0; i < n; i++) {
      const a0 = hash(i, 9, 1) * 6.283, r0 = 5 + 45 * Math.sqrt(hash(i, 9, 2));
      const rr = Math.max(r0, Rc + (r0 - 5) * 0.34);
      const clearing = rr > r0 ? (rr - r0) / 42 : 0;
      const x = Math.cos(a0) * rr + 2.5 * Math.sin(u + i), z = Math.sin(a0) * rr * 0.92;
      const y = hr(i, 9, 3, 0.5, 15) + 6 * clamp(u + 0.5) * hash(i, 9, 4) - 3.2 * clearing;
      // three scales: a few great masses, a body of billows, small lobes along the edges
      const sc = hash(i, 9, 6);
      const base = sc < 0.14 ? hr(i, 9, 5, 8.5, 12.5) : sc < 0.62 ? hr(i, 9, 5, 3.8, 6.2) : hr(i, 9, 5, 1.3, 2.6);
      const dc = Math.hypot(x - I.cam.x, y - I.cam.y, z - I.cam.z);
      // near the lens a billow never grows into a flat sheet: its size is limited by how far it is
      const r = Math.min(base * (1 - 0.35 * smooth(invLerp(0.45, 1.05, clearing))) * (1 + 0.1 * (u + 0.5)), dc * 0.17);
      if (dc < 3) continue;
      // the edge is torn away by the dissolve, not by shrinking
      const fade = smooth(invLerp(0.25, 1.05, clearing));
      if (fade >= 0.98) continue;
      const tone = 0.12 + 0.18 * hash(i, 9, 7) + (y < 5 ? 0.14 : 0);
      puffs.inkZ = inkZ(x, y, z) + (i % 7) * 2.2;
      puffs.push(x, y, z, r, 0, 1, 0.52, 0, 1, 0, i % 97, tone, fade, KIND.PUFF, sc < 0.3 ? PAL.BURN : PAL.SMOKE, ID.SMOKE[i % 3]);
    }
    puffs.inkZ = 0;
  }
  smokeRoll.shots = ['s16'];
  smokeRoll.camNear = 0.8;

  function soot(st) {
    const a = I.t - C.sootShake;
    if (a < 0 || a > 2.0) return;
    const c = anchor(ctx.capy, 'head', [0, 0.95, 0]);
    // a thin haze that shakes off him and crumbles away
    for (let i = 0; i < 9; i++) {
      const ang = (i / 9) * 6.283 + hash(i, 10, 1);
      const g = 1 - Math.exp(-a / 0.3);
      const R = 0.55 + 0.9 * g * hr(i, 10, 3, 0.6, 1.1);
      const x = c.x + Math.cos(ang) * R, z = c.z + Math.sin(ang) * R * 0.7;
      const y = hr(i, 10, 2, 0.35, 1.25) + 0.16 * a;
      const op = 0.46 * smooth(a / 0.1) * (1 - smooth(invLerp(0.35, 1.5, a + hash(i, 10, 4) * 0.3)));
      veil(x, y, z, 0.5 + 0.7 * g, 0.4 + 0.5 * g, i + 7.3, op, [0.5, 0.46, 0.54], [0.36, 0.32, 0.4], 3, 0, 0.12);
    }
    // a few big flakes, none on the body: they start clear of him and drift down and out
    for (let i = 0; i < 11; i++) {
      const ang = hash(i, 10, 11) * 6.283;
      const v = hr(i, 10, 12, 0.5, 1.2);
      const R = 0.62 + v * (1 - Math.exp(-a / 0.5));
      const x = c.x + Math.cos(ang) * R + Math.sin(a * 2 + i) * 0.05, z = c.z + Math.sin(ang) * R * 0.8;
      const y = hr(i, 10, 13, 0.7, 1.4) + 0.5 * a - 0.42 * a * a;
      if (y < 0.03) continue;
      const sz = hr(i, 10, 14, 0.05, 0.1) * (1 - smooth(invLerp(1.3, 2.0, a + hash(i, 10, 15) * 0.3)));
      if (sz < 0.004) continue;
      const sp = a * hr(i, 10, 16, 3, 7) + i;
      F.flakes.push(x, y, z, sp, sp * 0.7, sp * 0.4, sz, '#4a4350');
    }
  }
  soot.shots = ['s16', 's17'];

  // ------------------------------------------------------------ s18: the flick and the line of force
  function flick(st) {
    const a = I.tq - C.flick;
    if (a < -0.05 || a > 0.75) return;
    const tip = anchor(ctx.capy, 'broomTip', [0.8, 0.8, 0.2]);
    if (a < 0.13) glows.push(tip, { kind: GLOW.kira, m: 0.5, color: [1, 0.95, 0.7], power: a < 0.05 ? 1.8 : 0.9, mode: 2 });
    if (a < 0) return;
    const ch = anchor(ctx.warlord, 'chest', [0, 7, -9]);
    const dir = _a.copy(ch).sub(tip).normalize();
    const pts = [];
    const near = 1 + 22 * clamp(a / 0.06);
    for (let k = 0; k <= 30; k++) {
      const s = k / 30;
      const p = _b.copy(tip).addScaledVector(dir, 0.5 + (near * 120) * s * s * s + s * 6);
      const q = project(p);
      if (!q) continue;
      const taper = 1 - smooth(invLerp(0.12, 0.72, a));
      pts.push({ x: q.x, y: q.y, w: (0.005 + 0.011 * Math.sin(Math.PI * s)) * taper, z: q.d });
    }
    ribbons.push(pts, { style: 1, core: 0.7, band: 0.92, rough: 0.0, seed: 7.7 });
    // a little ring of air around the broom tip
    if (a < 0.2) glows.push(tip, { kind: GLOW.ring, m: 0.3 + 3.5 * a, color: [1, 1, 0.92], power: 0.9 * (1 - a / 0.2), mode: 2, seed: 0.04 });
  }
  flick.shots = ['s18'];

  // ------------------------------------------------------------ s19: regeneration sparks and veins
  function regen(st) {
    const t = I.tq, a = t - C.regen;
    if (a < 0 || a > 3.0) return;
    const ch = anchor(ctx.warlord, 'chest', [0, 6.5, -9]);
    const cut = 1 - smooth(invLerp(2.2, 3.0, a));
    // lightning arcs crawling over the missing right side (no sparks on the body: a few bold arcs)
    const n = 5, R = I.R, U = I.U;
    for (let i = 0; i < n; i++) {
      const seed = 91 + i * 7 + (I.draw % 4) * 3;
      const fromY = hr(i, 11, 1, -2, 2.5), side = hr(i, 11, 2, 1.5, 5);
      const p0 = _a.set(ch.x + 0.8, ch.y + fromY, ch.z + 0.4);
      const p1 = _b.set(ch.x + side, ch.y + fromY + hr(i, 11, 3, -2.4, 2.4), ch.z + hr(i, 11, 4, -1, 1));
      const pts = boltPts(p0, p1, seed, R, U, 0.3, 5);
      lines.push(pts, { px: 2.5, m: 0.05, width: (q) => 1 - 0.8 * q, color: LIME, power: 1.5 * cut, soft: 8, mode: 2, rim: 0.7 });
    }
  }
  regen.shots = ['s19'];

  return { steps: [landing, pileBlown, slashArc, shed, barrage, dash, bladeWhite, smokeRoll, soot, flick, regen] };
}

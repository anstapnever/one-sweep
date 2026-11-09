import * as THREE from 'three';
import { HOOK, SHIP, SLASH } from './layout.js';
import { hash, hr, KIND, PAL, ID, boltPts, GLOW } from './fx-core.js';
import { clamp, smooth, invLerp, easeOut, easeIn, lerp } from './util.js';

// The hook (s01–s04) and the skyline cut (s11): the colossal beam, the erupting cut line,
// the shock front and leaf wave, debris columns, dust where the towers slide.
const V = THREE.Vector3;
const LIME = [0.72, 1.0, 0.16];
const STONE = ['#f6efe6', '#f0ded0', '#f1cfc0', '#e8d0c4', '#d9b8ae'];
const LEAF = ['#5e7a3c', '#6f8b45', '#54703a', '#86a04e', '#9aa84e'];

export function makeCity(F) {
  const { C, I, puffs, blocks, beams, leaves, glows, ribbons, lines, ctx, anchor, inkZ, massTone, project, pxScale, flash, flight, veil, sfx } = F;
  const A = new V(...HOOK.rakeFrom), B = new V(...HOOK.rakeTo);
  const LEN = A.distanceTo(B);
  const dirL = B.clone().sub(A).normalize();
  const dirN = new V(-dirL.z, 0, dirL.x);
  const gAt = (s, out = new V()) => out.copy(A).lerp(B, s);
  const S0 = 0.26;
  const rake = (t) => S0 + (1 - S0) * easeOut(invLerp(C.rakeStart, C.rakeEnd, t), 1.35);
  const eruptAt = (s) => s < S0 ? C.rakeStart - 0.7 - (S0 - s) * 0.8 : C.rakeStart + 0.5 + 0.78 * (s - S0) / (1 - S0);   // the line goes up just behind the beam
  const retract = (t) => smooth(invLerp(C.ship + 0.3, C.ship + 2.5, t));

  sfx(C.rakeStart + 0.02, A.x, 40, A.z, 1, 'beam');
  sfx(C.rakeEnd, B.x, 40, B.z, 1, 'erupt');
  sfx(C.hookShock, 0, 4, 0, 1, 'shock');

  // ------------------------------------------------------------ the beam
  const _a = new V(), _b = new V(), _c = new V();
  function beam(st) {
    const t = I.tq;
    const rt = retract(t);
    if (t > C.ship + 2.6) return;
    const s = rake(I.t);
    gAt(s, _a); _a.y = -20;
    const top = anchor(ctx.world, 'shipBeam', [SHIP.c[0] - 300, SHIP.c[1] - 300, SHIP.c[2] + 500]);
    // from his lens the column drops straight out of the sky; the wide aerial shots see it run to the ship
    if (st.sid === 's01' || st.sid === 's02') top.set(_a.x * 1.04, 2300, _a.z - 1200);
    const r0 = 62, r1 = 120;
    if (st.sid === 's01' || st.sid === 's02') beams.push(_a.clone(), top, r0 * 1.42, r1 * 1.42, { seed: 7.7, flow: 5, power: 2, cutA: rt, rough: 1.08 });
    beams.push(_a.clone(), top, r0, r1, { seed: 3.1, flow: 3, power: 1, cutA: rt, rough: (st.sid === 's01' || st.sid === 's02') ? 1.08 : 1.03 });
    if (rt >= 1) return;
    // the fireball where it touches the ground (rides with the beam while it rakes)
    const gnd = (1 - smooth(invLerp(C.rakeEnd, C.rakeEnd + 0.6, t))) * (1 - rt);
    if (t < C.ship) {
      const n = 26, inkd = inkZ(_a.x, 60, _a.z);
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * 6.283 + hash(i, I.draw % 5, 1) * 0.6;
        const rad = hr(i, 0, 2, 40, 95) * (0.7 + 0.3 * gnd), h = hr(i, 0, 3, 8, 90);
        const r = hr(i, 0, 4, 24, 50) * (0.8 + 0.5 * gnd);
        const x = _a.x + Math.cos(ang) * rad, z = _a.z + Math.sin(ang) * rad;
        puffs.inkZ = inkd + (i % 2) * 40;
        puffs.push(x, 20 + h, z, r, 0, 1, 0.28, 0, 1, 0, (i * 7 + I.draw) % 97, massTone(x, 20 + h, z, _a.x, 40, _a.z, 90), 0, KIND.PUFF, i < 16 ? PAL.FIRE : PAL.LIME, ID.DUST[0]);
      }
      puffs.inkZ = 0;
      glows.push(new V(_a.x, 60, _a.z + 30), { kind: GLOW.soft, m: 260, color: LIME, power: 0.22 * (0.4 + 0.6 * gnd), mode: 0, bias: 200 });
    }
  }
  beam.shots = ['s01', 's02', 's03', 's04'];

  // ------------------------------------------------------------ the erupting wall
  const NW = 96;
  function wall(st) {
    const t = I.tq;
    if (t < C.rakeStart + 0.45) return;
    const n = NW;
    const air = st.sid === 's03' || st.sid === 's04';
    const late = t > C.ship + 3;      // only far views after this: fewer lobes
    // s03 looks along the furrow from low on the south side: the dust stands behind the cut as a backdrop, the furrow stays open
    const low = st.sid === 's03';
    gAt(0.5, _a);
    const away = (_a.x - I.cam.x) * dirN.x + (_a.z - I.cam.z) * dirN.z > 0 ? 1 : -1;
    let inkd = 0;
    for (let j = 0; j < n; j++) {
      if (late && j % 2) continue;
      const s = (j + 0.5) / n;
      const a = t - eruptAt(s) - 0.1 * hash(j, 1, 1);
      if (a < 0) continue;
      if (j % (low ? 16 : 6) === 0) { gAt(s, _a); inkd = inkZ(_a.x, 80, _a.z) + (j % 12) * 12; }
      const seg = 0.72 + 0.5 * Math.sin(s * 19.0 + 1.3) * Math.cos(s * 7.0) + 0.3 * hash(j, 2, 2);
      const Hm = (air ? 170 : 340) * seg * (air && j % 11 === 0 ? 2.6 : 1);
      const H = Hm * (1 - Math.exp(-a / 0.62));
      const age = Math.min(a / 9, 1);
      for (let k = 0; k < 6; k++) {
        if (low && (j + k) % 2) continue;   // half the lobes, each much bigger below
        const f = (k + 0.5) / 6;
        gAt(s + (hash(j, k, 3) - 0.5) * 0.018, _a);
        const side = (hash(j, k, 4) - 0.5) * 40 * (1 + 2.5 * f) * (!late && !air && k < 3 ? 3.2 : 1) * (low ? 0.5 : 1) + (low ? away * (135 + 50 * f) : 0);
        const x = _a.x + dirN.x * side + 8 * a * f;
        const z = _a.z + dirN.z * side - 3 * a * f;
        const y = 6 + H * f * (0.9 + 0.2 * hash(j, k, 5)) + a * a * 0.6 * f * 10;
        const r = (62 - 26 * f) * (0.55 + 0.45 * hash(j, k, 6)) * (0.45 + 0.9 * (1 - Math.exp(-a / 0.5))) * (1 + 0.35 * age);
        const hot = a < 2.6 + 2 * hash(j, k, 7);
        const dcam = Math.hypot(x - I.cam.x, y - I.cam.y, z - I.cam.z);
        const rFinal = low ? Math.min(r * (hash(j, k, 8) < 0.22 ? 2.4 : 1.25), dcam * (hash(j, k, 8) < 0.22 ? 0.13 : 0.07)) : air ? Math.min(r, dcam * 0.05) : r;
        const pal = !air && k < 3 && hot ? PAL.FIRE : PAL.DUST;
        const tn = massTone(x, y, z, _a.x, H * 0.45, _a.z, Hm * 0.6, late ? 0.3 : -0.04);
        if (late && Math.hypot(x - I.cam.x, z - I.cam.z) < 320) continue;
        puffs.inkZ = inkd;
        puffs.push(x, y, z, rFinal, 0, 1, 0.24, 0, 1, 0, (j * 3 + k * 7) % 97, late ? tn : tn * 0.75, 0, KIND.PUFF, pal, ID.DUST[Math.floor(j / 6) % 3]);
      }
      if (j % 8 === 0) { const a2 = 1 - smooth(invLerp(0.3, 3.5, a)); if (a2 > 0) glows.push(new V(_a.x, 60, _a.z), { kind: GLOW.soft, m: 180, color: [1, 0.72, 0.35], power: 0.16 * a2, mode: 0, bias: 150 }); }
    }
    // both lips of the cut burn: two long straight lines of fire with the dust standing between them
    if (air) for (let sd = -1; sd <= 1; sd += 2) for (let i = 0; i < 120; i++) {
      if (low && sd !== away) continue;  // the near lip is the crater's own burning edge in s03
      const s = (i + 0.5) / 120;
      const a = t - eruptAt(s) - 0.08 * hash(i, sd + 2, 41);
      if (a < 0) continue;
      gAt(s, _a);
      const g = 1 - Math.exp(-a / 0.4);
      const off = sd * (72 + hr(i, sd + 2, 42, -10, 12));
      const x = _a.x + dirN.x * off, z = _a.z + dirN.z * off;
      const flick = 0.85 + 0.25 * Math.sin(I.draw * 1.9 + i * 2.3);
      const r = (low ? hr(i, sd + 2, 43, 8, 16) : hr(i, sd + 2, 43, 20, 40)) * (0.4 + 0.8 * g) * flick;
      const y = low ? 2 : 60 + hr(i, sd + 2, 44, 0, 110) * g;
      if (low) {
        // tongues in uneven runs along the edge, one ink shape per run
        const run = 0.5 + 0.5 * Math.sin(s * 61 + 1.7) * Math.sin(s * 23 + I.draw * 0.35);
        const h = (10 + 46 * run) * g * flick * hr(i, sd + 2, 45, 0.55, 1.2);
        if (h < 7) continue;
        puffs.inkZ = inkZ(x, 20, z) + Math.floor(i / 9) * 7;
        puffs.push(x, y, z, r * 0.8, h, 0.18, 0.3, 0.12 * Math.sin(i * 1.3), 1, 0, (i * 3 + I.draw) % 97, -0.35, 0, KIND.PUFF, i % 13 === 0 ? PAL.LIME : PAL.FIRE, ID.DUST[i % 3]);
        continue;
      }
      puffs.inkZ = inkZ(x, y, z) + (i % 4) * 6;
      puffs.push(x, y, z, r, 0, 1, 0.3, 0, 1, 0, (i * 3 + I.draw) % 97, -0.35, 0, KIND.PUFF, i % 9 === 0 ? PAL.LIME : PAL.FIRE, ID.DUST[i % 3]);
    }
    puffs.inkZ = 0;
  }
  wall.shots = ['s03', 's04', 's07', 's09', 's10', 's11', 's13', 's14', 's15'];

  // ------------------------------------------------------------ the same wall as the promenade sees it (s01, s02)
  // The real trench is 900 m away behind the towers. From his lens it is drawn on the same sight lines at a fixed near depth,
  // so the foot of the beam and the boiling line stand in front of the far towers from frame 0.
  const DN = 135;
  function near(x, y, z, D = DN) { const c = I.cam, dx = x - c.x, dy = y - c.y, dz = z - c.z, k = D / Math.hypot(dx, dy, dz); return [c.x + dx * k, c.y + dy * k, c.z + dz * k, k]; }
  function hookNear(st) {
    const t = I.tq;
    gAt(rake(I.t), _a);
    const gnd = 1 - smooth(invLerp(C.rakeEnd + 0.1, C.rakeEnd + 0.8, t));
    // the boil at the foot of the beam
    if (gnd > 0) for (let i = 0; i < 46; i++) {
      const ang = (i / 46) * 6.283 + hash(i, I.draw % 5, 11) * 0.5;
      const rad = hr(i, 11, 2, 5, 150);
      const wx = _a.x + Math.cos(ang) * rad, wz = _a.z + Math.sin(ang) * rad * 0.5;
      const wy = hr(i, 11, 3, 4, 150) * (1 - rad / 300);
      const [x, y, z, k] = near(wx, wy, wz, 52);
      const r = hr(i, 11, 4, 22, 54) * k * (0.9 + 0.18 * Math.sin(I.draw * 1.3 + i)) * (0.3 + 0.7 * gnd);
      const pal = wy < 50 ? (i % 4 === 0 ? PAL.LIME : PAL.FIRE) : (i % 2 ? PAL.DUST : PAL.FIRE);
      puffs.inkZ = 50 + (i % 4) * 2.5;
      puffs.push(x, y, z, r, 0, 1, 0.24, 0, 1, 0, (i * 7 + I.draw) % 97, pal === PAL.DUST ? 0.1 : 0, 0, KIND.PUFF, pal, ID.DUST[i % 3]);
    }
    // the blast right at the base, in front of the column
    if (gnd > 0) for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * 6.283 + hash(i, I.draw % 5, 31) * 0.8;
      const rad = hr(i, 31, 2, 10, 75);
      const [x, y, z, k] = near(_a.x + Math.cos(ang) * rad, hr(i, 31, 3, 4, 46), _a.z + Math.sin(ang) * rad * 0.5, 22);
      const r = hr(i, 31, 4, 24, 46) * k * (0.9 + 0.2 * Math.sin(I.draw * 1.7 + i)) * (0.3 + 0.7 * gnd);
      puffs.inkZ = 21 + (i % 3);
      puffs.push(x, y, z, r, 0, 1, 0.24, 0, 1, 0, (i * 5 + I.draw) % 97, -0.2, 0, KIND.PUFF, i % 3 ? PAL.FIRE : PAL.LIME, ID.DUST[i % 3]);
    }
    // the line going up behind it
    for (let j = 0; j < 58; j++) {
      const sj = (j + 0.5) / 58;
      const a = t - eruptAt(sj) - 0.1 * hash(j, 1, 21);
      if (a < 0) continue;
      const seg = 0.72 + 0.5 * Math.sin(sj * 19.0 + 1.3) * Math.cos(sj * 7.0) + 0.3 * hash(j, 2, 22);
      const Hm = (sj < S0 + 0.06 ? 170 : 400) * seg, H = Hm * (1 - Math.exp(-a / 0.62));
      for (let m = 0; m < 5; m++) {
        const f = (m + 0.5) / 5;
        gAt(sj + (hash(j, m, 23) - 0.5) * 0.02, _b);
        const side = (hash(j, m, 24) - 0.5) * 50;
        const [x, y, z, k] = near(_b.x + dirN.x * side, 6 + H * f * (0.9 + 0.2 * hash(j, m, 25)), _b.z + dirN.z * side);
        const r = (60 - 22 * f) * (0.55 + 0.45 * hash(j, m, 26)) * (0.45 + 0.9 * (1 - Math.exp(-a / 0.5))) * k;
        const pal = m < 2 && a < 2.4 ? PAL.FIRE : PAL.DUST;
        puffs.inkZ = DN + 2 + (j % 5) * 3 + m * 2;
        puffs.push(x, y, z, r, 0, 1, 0.24, 0, 1, 0, (j * 3 + m * 7) % 97, pal === PAL.DUST ? 0.06 + 0.12 * f : -0.35, 0, KIND.PUFF, pal, ID.DUST[j % 3]);
      }
    }
    puffs.inkZ = 0;
  }
  hookNear.shots = ['s01', 's02'];

  // ------------------------------------------------------------ debris already in the air on frame 0, then columns
  const G = 22;
  function debris(st) {
    const t = I.tq;
    if (t > C.ship + 2.4) return;
    for (let i = 0; i < 90; i++) {
      const s = hr(i, 3, 1, -0.02, 1.0);
      const t0 = C.rakeStart + (s - S0) * 1.2 - hash(i, 3, 2) * 0.9;
      const a = t - t0;
      if (a < 0) continue;
      gAt(s, _a);
      const big = i < 26;
      const x0 = _a.x + hr(i, 3, 3, -70, 70), z0 = _a.z + hr(i, 3, 4, -70, 70);
      const vx = hr(i, 3, 5, -55, 55), vy = big ? hr(i, 3, 6, 130, 230) : hr(i, 3, 6, 70, 170), vz = hr(i, 3, 7, -30, 60);
      const y = 30 + vy * a - 0.5 * G * a * a;
      if (y < -30) continue;
      const sz = big ? hr(i, 3, 8, 10, 30) : hr(i, 3, 8, 2.5, 9);
      const rx = (a + 1) * hr(i, 3, 9, -1.2, 1.2), ry = (a + 1) * hr(i, 3, 10, -1.2, 1.2);
      blocks.push(x0 + vx * a, y, z0 + vz * a, rx, ry, 0, sz, sz * hr(i, 3, 11, 0.5, 1.1), sz * hr(i, 3, 12, 0.6, 1.3), STONE[i % STONE.length]);
    }
    // a hanging veil of chunks nearer the camera, drifting in the air behind the promenade (the poster of frame 0)
    if (st.sid === 's01' || st.sid === 's02') for (let i = 0; i < 40; i++) {
      const az = hr(i, 4, 1, -0.42, 0.42), d = hr(i, 4, 2, 70, 215);
      const x = Math.sin(az) * d + 6 * Math.sin(t * 0.7 + i), z = 4.45 - Math.cos(az) * d;
      const y = 1 + hr(i, 4, 3, 0.03, 0.25) * d + 7 * t - 1.6 * t * t;
      const sz = hr(i, 4, 4, 1.0, 5.5) * (d / 140);
      blocks.push(x, y, z, t * hr(i, 4, 5, -1.4, 1.4) + i, t * hr(i, 4, 6, -1.4, 1.4) + i * 2, 0.3, sz, sz * 0.7, sz * 0.5, STONE[i % STONE.length]);
    }
  }
  debris.shots = ['s01', 's02', 's03', 's04'];

  // ------------------------------------------------------------ the shock front: a wave of dust and leaves
  const V_FRONT = 150;
  function front(st) {
    const t = I.tq, u = t - C.hookShock;
    if (u < -0.65 || u > 0.5) return;
    const zf = (x, row) => u * V_FRONT - (x * x) * 0.012 - row * 5;
    // the capybara stays readable: nothing passes in front of him as seen from the lens
    const head = anchor(ctx.capy, 'head', [0, 0.95, 0]);
    puffs.guard = [{ x: head.x, y: head.y, z: head.z, R: 1.2 }, { x: head.x, y: head.y - 0.6, z: head.z, R: 1.2 }];
    const n = 84;
    for (let i = 0; i < n; i++) {
      const x = -42 + (84 * (i + 0.5)) / n + hr(i, 5, 1, -0.5, 0.5);
      for (let row = 0; row < 4; row++) {
        const z = zf(x, row * 0.7) + hr(i, row, 2, -1, 1);
        if (z > 40 && row === 0) continue;
        if (row === 3 && i % 2) continue;
        const lift = 1 - Math.exp(-(u + 0.65) / 0.25);
        const y = 0.7 + row * row * 1.1 + 1.9 * hash(i, row, 3) * (1 + row);
        const r = (0.9 + row * 0.62) * (0.75 + 0.7 * hash(i, row, 4)) * lift;
        const fade = 1 - smooth(invLerp(0.14, 0.5, u + row * 0.03));
        // nothing fills the lens as it goes by: the billows nearest the camera give way
        const dc = Math.hypot(x - I.cam.x, y - I.cam.y, z - I.cam.z);
        const rr = r * (0.2 + 0.8 * fade) * clamp((dc - 2.5) / 5);
        if (rr < 0.05) continue;
        // every billow keeps its own terminator: the sun rakes it, the shadow side is a hard shape
        const tn = 0.1 + 0.05 * row + (i % 3) * 0.04;
        puffs.inkZ = inkZ(x, y, z) + (i % 4) * 1.2 + row * 2.4;
        puffs.push(x, y, z, rr, 0, 1, 0.26, 0, 1, 0, (i * 5 + row * 13) % 97, tn, 0, KIND.PUFF, PAL.DUST, ID.DUST[row % 3]);
      }
      // grit and chips thrown ahead of the wall
      if (i % 2 === 0 && u > -0.5 && u < 0.2) {
        const zc = zf(x, -1.2) + hr(i, 12, 1, 0, 3);
        const yc = hr(i, 12, 2, 0.2, 3.2) + Math.sin(u * 20 + i) * 0.2;
        const sz = hr(i, 12, 3, 0.05, 0.2);
        blocks.push(x + hr(i, 12, 4, -0.5, 0.5), yc, zc, u * hr(i, 12, 5, -30, 30), u * hr(i, 12, 6, -30, 30), i, sz, sz * 0.7, sz * 0.5, STONE[i % STONE.length]);
      }
    }
    // leaves riding the crest
    for (let i = 0; i < 26; i++) {
      const x = hr(i, 13, 1, -14, 14);
      const zc = zf(x, -0.6) + hr(i, 13, 2, -1.5, 3);
      const y = hr(i, 13, 3, 0.4, 5) + Math.sin(u * 9 + i) * 0.4;
      leaves.push(x, y, zc, u * hr(i, 13, 4, -20, 20), u * hr(i, 13, 5, -20, 20), u * 16, hr(i, 13, 6, 0.12, 0.26), LEAF[i % LEAF.length]);
    }
    puffs.inkZ = 0;
  }
  front.shots = ['s01', 's02'];
  front.camNear = 0.4;

  // wind in the wake: large leaves and thin white lines racing past the camera
  function wake(st) {
    const t = I.tw, u = t - C.hookShock;
    if (u < -0.1 || u > 0.55) return;
    for (let i = 0; i < 48; i++) {
      const b = hr(i, 6, 1, -0.05, 0.42);
      const a = u - b;
      if (a < 0) continue;
      const v = hr(i, 6, 2, 28, 42);
      const zz = -16 + v * a * (1 + a);
      const x = hr(i, 6, 3, -13, 13) + Math.sin(a * 11 + i) * 0.7;
      const y = hr(i, 6, 4, 0.25, 4.4) + Math.sin(a * 7 + i * 1.7) * 0.5;
      if (zz > 22) continue;
      const size = hr(i, 6, 5, 0.09, 0.22);
      const sp = a * 16;
      leaves.push(x, y, zz, sp * hr(i, 6, 6, -1, 1), sp * hr(i, 6, 7, -1, 1), sp, size, LEAF[i % LEAF.length]);
    }
    const ul = I.tq - C.hookShock;
    for (let i = 0; i < 26; i++) {
      const b = hr(i, 7, 1, -0.05, 0.4), a = ul - b;
      if (a < 0 || a > 0.18) continue;
      const x = hr(i, 7, 2, -10, 10), y = hr(i, 7, 3, 0.4, 3.2);
      const z0 = -18 + 90 * a;
      const pa = project(_a.set(x, y, z0)), pb = project(_b.set(x, y, z0 + 16));
      if (!pa || !pb) continue;
      const pts = [];
      for (let k = 0; k <= 6; k++) { const s = k / 6; pts.push({ x: lerp(pa.x, pb.x, s), y: lerp(pa.y, pb.y, s), w: 0.0028 * Math.sin(Math.PI * s) }); }
      ribbons.push(pts, { style: 2, core: 0.7, band: 0.95, rough: 0.0, seed: i });
    }
  }
  wake.shots = ['s02'];

  // ------------------------------------------------------------ s11: dust and debris where the towers slide
  function slideDust(st) {
    const t = I.tq, u = t - C.slide;
    if (u < -0.15) return;
    // along the cut line between the towers (band z -60..-420)
    const n = 40;
    const cy = (x, z) => SLASH.p[1] - (SLASH.n[0] * x + SLASH.n[2] * (z - SLASH.p[2])) / SLASH.n[1];
    for (let i = 0; i < n; i++) {
      const x = hr(i, 8, 1, -420, 420), z = hr(i, 8, 2, -420, -70);
      const y0 = cy(x, z);
      const a = u - hash(i, 8, 3) * 0.9;
      if (a < 0) continue;
      const g = 1 - Math.exp(-a / 0.7);
      const sx = SLASH.slideDir[0], sz = SLASH.slideDir[2];
      const px = x + sx * 16 * g * a, pz = z + sz * 8 * g, py = y0 - 3 * a * a - 7 * g;
      const r = hr(i, 8, 4, 3, 7.5) * (0.4 + 0.9 * g) * (1 - smooth(invLerp(1.0, 2.0, a)));
      if (r > 0.1) {
        puffs.inkZ = inkZ(x, y0, z);
        puffs.push(px, py, pz, r, 0, 1, 0.26, 0, 1, 0, i % 97, 0.14, 0, KIND.PUFF, PAL.DUST, ID.DUST[i % 3]);
      }
      // a thin stream of powder falling from the cut
      if (i % 3 === 0 && a < 2.4) veil(px, py - 18, pz, 7 * (0.4 + 0.9 * g), 22 + 18 * g, i + 3, 0.5 * (1 - smooth(a / 2.4)), [0.99, 0.9, 0.82], [0.8, 0.66, 0.68], 18);
    }
    puffs.inkZ = 0;
    for (let i = 0; i < 70; i++) {
      const x = hr(i, 9, 1, -420, 420), z = hr(i, 9, 2, -420, -70);
      const y0 = cy(x, z);
      const a = u - hash(i, 9, 3) * 1.5;
      if (a < 0) continue;
      const y = y0 + 6 * a - 0.5 * 18 * a * a;
      if (y < -10) continue;
      const sz = hr(i, 9, 4, 1.2, 6);
      blocks.push(x + SLASH.slideDir[0] * 6 * a, y, z, a * hr(i, 9, 5, -2, 2), a * hr(i, 9, 6, -2, 2), 0, sz, sz * 0.6, sz * 0.8, STONE[i % STONE.length]);
    }
  }
  slideDust.shots = ['s11'];

  return { steps: [beam, wall, hookNear, debris, front, wake, slideDust] };
}

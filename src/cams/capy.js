import { smooth, smoother, noise1, lerp, invLerp, clamp } from '../util.js';
import { CUES as C } from '../shots.js';
import { CAPY_RT as R } from '../capy-rt.js';

// Cameras for the sweeper's shots. Long lenses and calm drift on him: the world misbehaves around a still centre.
const nz = (x, s) => noise1(x, s);
const drift = (t, a) => [nz(t * 0.5, 1) * a, nz(t * 0.43, 2) * a * 0.6, nz(t * 0.37, 3) * a * 0.6];
const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const axes = (yaw) => ({ fx: Math.sin(yaw), fz: Math.cos(yaw), rx: Math.cos(yaw), rz: -Math.sin(yaw) });
const off = (p, a, f, r, y = 0) => [p[0] + a.fx * f + a.rx * r, p[1] + y, p[2] + a.fz * f + a.rz * r];
const hd = (t) => (R.head ? R.head(t) : [0, 1, 0]);
const yw = (t) => (R.yaw ? R.yaw(t) : 0.89);

// Shot 1 framing: dead centre, half the frame height, camera at his face height, city behind. The last shot lands on exactly this.
export function hookCam(lt) {
  // low and tilted up: the beam comes down out of a band of real sky behind him
  const P = [0.15, 0.36, 2.55], L = [0.0, 0.9, -0.1];
  const d = drift(lt * 2.5, 0.01);
  return { pos: [P[0] + lt * 0.04 + d[0], P[1] + lt * 0.006 + d[1], P[2] - lt * 0.1 + d[2]], look: [L[0] + d[0] * 0.5, L[1], L[2]], fov: 44 };
}

export const CAMS = {
  s01: (lt) => hookCam(lt),

  s02: (lt, d, t) => {
    // same side of him, closer: his bulk right of centre and the place where the pod lands on the left
    const push = smooth(lt / d);
    const P = [-0.1, 0.55, 3.0 - push * 0.14], L = [-0.4, 0.85, -0.05];
    const a = t > C.podHit ? Math.exp(-(t - C.podHit) * 7) * 0.05 : 0;
    const s = [nz(t * 41, 7) * a, nz(t * 47, 8) * a];
    return { pos: [P[0] + s[0], P[1] + s[1], P[2]], look: [L[0] + s[0] * 1.5, L[1] + s[1] * 1.5, L[2]], fov: 34 };
  },

  s05: (lt, d) => {
    // low on the tiles: broom head and the neat pile, a slow creep sideways
    return { pos: [lerp(0.28, 0.62, smooth(lt / d)), 0.2, 1.68 - lt * 0.05], look: [0.72, 0.08, 0.28], fov: 29 };
  },

  s09: (lt) => {
    // behind and to his right, low: broom, toe and the giant foot it belongs to
    const rt = R.stand ? R.stand() : [1.55, -2.8, 2.6];
    const a = axes(rt[2]);
    const p0 = [rt[0], 0, rt[1]];
    const P = off(p0, a, -1.7, -1.15, 0.48);
    const L = off(p0, a, 0.75, 0.15, 0.32);
    const dr = drift(lt, 0.01);
    return { pos: [P[0] + lt * 0.05 + dr[0], P[1] + dr[1], P[2] + lt * 0.04], look: L, fov: 40 };
  },

  s12: (lt, d, t) => {
    const h = hd(t), a = axes(yw(t)), dr = drift(lt * 2, 0.006);
    const P = off(h, a, 1.4, 0.75, 0.1), L = off(h, a, 0.1, 0, 0.03);
    return { pos: [P[0] + dr[0], P[1] + dr[1], P[2] + dr[2]], look: L, fov: 20 };
  },

  s16: (lt, d, t) => {
    // from the crater rim, low across the pit; pushes in and settles close enough to read the shake
    const k = smooth(invLerp(0, C.sootShake - (t - lt), lt));
    const dist = lerp(32, 5.0, k * k * (3 - 2 * k));
    const az = 0.55;
    const dr = drift(lt, 0.03 * (1 - k));
    return { pos: [Math.sin(az) * dist + dr[0], lerp(5, 0.9, k) + dr[1], Math.cos(az) * dist + dr[2]], look: [0.2, lerp(-2, 0.62, k), 0], fov: lerp(46, 28, k) };
  },

  s17: (lt, d, t) => {
    // level with the muzzle, a touch above: straight down the open mouth, the eyes squeezed shut above it
    const a = axes(yw(t)), push = smooth(lt / d) * 0.1;
    const h = hd(t);
    return { pos: off(h, a, 1.45 - push, 0.72, 0.05), look: off(h, a, 0.08, 0, -0.03), fov: 25 };
  },

  s18: (lt, d, t) => {
    // capy low left, the warlord leaning over him fills the upper frame; a wide lens from the side of the pillar
    const dr = drift(lt, 0.01);
    return { pos: [1.0 + dr[0], 0.45 + dr[1], 3.6 + dr[2]], look: [0.6, 4.5, -5], fov: 70, roll: 2 };
  },

  s23: (lt, d, t) => {
    // one continuous move: pile and bristles, up his body, the citrus goes, an extreme close-up of the eyes as they lift
    const h = hd(t), a = axes(yw(t)), pile = R.pile ? R.pile() : [0.7, 0.7];
    const k = smoother(invLerp(C.pileGone - 0.2, C.citrusFall - 0.1, t));
    const k2 = smooth(invLerp(C.citrusFall + 0.5, C.lookUp - 0.05, t));
    const P0 = [pile[0] - a.fx * 0.05 + a.rx * 1.15, 0.16, pile[1] - a.fz * 0.05 + a.rz * 1.15];
    const L0 = [pile[0] - a.rx * 0.32 + a.fx * 0.05, 0.07, pile[1] - a.rz * 0.32 + a.fz * 0.05];
    // the ECU sits in front of and below the eyes, so it still sees them when the head rises
    // a long lens so the muzzle does not hide the eyes: both sit outside its silhouette
    // a hair above the muzzle line: the eyes sit behind it on top of the head, lower and the snout covers them
    const eyes = R.headP(t, 0, 0.09, 0.0);
    const ecu = off(eyes, a, 2.4, 0.1, -0.03);
    const P = mix3(mix3(P0, off(h, a, 1.2, 0.55, 0.1), k), ecu, k2);
    const face = R.headP(t, 0, 0.028, 0.16);
    const L = mix3(mix3(L0, off(h, a, 0.1, 0, -0.05), k), face, k2);
    const dr = drift(lt, 0.004);
    return { pos: [P[0] + dr[0], P[1] + dr[1], P[2] + dr[2]], look: L, fov: lerp(lerp(33, 26, k), 15.5, k2) };
  },

  s25: (lt, d, t) => {
    // the lower paw on the handle, from his free side so the head does not cover it
    const p = R.grip(t, 0.56), a = axes(yw(t));
    const s = t > C.grip ? 0.0015 * clamp((t - C.grip) * 6) : 0;
    const P = off(p, a, 0.22, -0.62, 0.05);
    return { pos: [P[0] + nz(t * 40, 9) * s, P[1] + nz(t * 37, 10) * s, P[2]], look: [p[0] + a.fx * 0.08, p[1] + 0.02, p[2] + a.fz * 0.08], fov: 26 };
  },

  s26: (lt, d, t) => {
    // from behind and low; the beam column stands behind the broom
    const a = axes(yw(t)), k = smooth(lt / d), f = lerp(2.1, 2.5, k);
    return { pos: [-a.fx * f - a.rx * 0.95, 0.24 + 0.05 * k, -a.fz * f - a.rz * 0.95], look: [a.fx * 0.9, lerp(0.75, 1.3, k), a.fz * 0.9], fov: 42 };
  },

  s27: (lt, d, t) => {
    // the lens in front of the swing, low, the broom head flies at us
    const tip = R.broomTip(t), a = axes(yw(t));
    const s = t > C.sweep ? Math.exp(-(t - C.sweep) * 5) * 0.04 : 0;
    return { pos: [a.fx * 1.15 + a.rx * 1.2 + nz(t * 60, 11) * s, 0.3 + nz(t * 53, 12) * s, a.fz * 1.15 + a.rz * 1.2],
      look: [tip[0] * 0.3 + a.rx * 0.2 + a.fx * 0.2, 0.46, tip[2] * 0.3 + a.rz * 0.2 + a.fz * 0.2], fov: 52 };
  },

  s31: (lt, d, t) => {
    // opens on the empty blue, cranes down to him, then lands on the framing of frame one
    const k = smoother(invLerp(0.2, C.stump - 0.5 - (t - lt), lt));
    const pos = [3.0, lerp(1.5, 0.98, k), lerp(9.0, 4.0, k)];
    // aim as an angle, not a point: a point sweeping past the lens snapped the tilt in its last frames
    const yawTilt = lerp(Math.atan2(-2.9, -49), Math.atan2(-2.9, -4), k), pitch = lerp(0.755, Math.atan2(-0.36, 4.93), k);
    const look = [pos[0] + Math.sin(yawTilt) * Math.cos(pitch) * 4.95, pos[1] + Math.sin(pitch) * 4.95, pos[2] + Math.cos(yawTilt) * Math.cos(pitch) * 4.95];
    // hold still until the leaf is down, the move must not carry it out of frame
    const land = smoother(invLerp(C.leafLand - 0.02, C.backToWork + 0.2, t));
    const hk = hookCam(Math.max(0, t - C.backToWork));
    return { pos: mix3(pos, hk.pos, land), look: mix3(look, hk.look, land), fov: lerp(lerp(40, 30, k), hk.fov, land) };
  },
};

const SH = (x, y, z, r, depth) => ({ center: [x, y, z], radius: r, depth });
export const LOOKS = {
  s01: () => ({ shadow: SH(0, 0.6, 0, 7, 16) }),
  s02: () => ({ shadow: SH(0, 0.6, 0, 7, 16) }),
  s05: () => ({ shadow: SH(0.7, 0.2, 0.3, 3, 12) }),
  s09: () => ({ shadow: SH(1.4, 0.8, -2.4, 7, 22) }),
  s12: () => ({ shadow: SH(1.5, 1, -2.8, 6, 14) }),
  s16: () => ({ shadow: SH(0, 0.6, 0, 6, 14) }),
  s17: () => ({ shadow: SH(0, 0.8, 0, 6, 14) }),
  s18: () => ({ shadow: SH(0, 0.8, 0, 6, 14) }),
  s23: () => ({ shadow: SH(0, 0.8, 0, 6, 14) }),
  s25: () => ({ shadow: SH(0, 0.8, 0, 6, 14) }),
  s26: () => ({ shadow: SH(0, 0.8, 0, 6, 14) }),
  s31: () => ({ shadow: SH(0, 0.6, 0, 7, 16) }),
};

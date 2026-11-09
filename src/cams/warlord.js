import { Quaternion as QUAT } from 'three';
import { CUES } from '../shots.js';
import { WARLORD_API } from '../warlord.js';
import { WARLORD } from '../layout.js';
import { clamp, lerp, smooth, easeInOut, easeOut, easeIn, noise1, invLerp } from '../util.js';

// WARLORD dept cameras: s06 landing, s07 tilt up, s08 eye, s10 slash, s13 shed, s14 barrage (with FX), s15 rush, s19 regen, s20 ascent, s29 coming apart.
// Very wide, very low lenses; one continuous move per shot; shake only on impacts.
const C = CUES;
const A = (t, name) => { const api = WARLORD_API; if (!api) return [0, 5, 0]; const v = api.at(t, name); return [v.x, v.y, v.z]; };
const mixV = (a, b, k) => a.map((x, i) => x + (b[i] - x) * k);
const drift = (t, k = 0.03, seed = 0) => [noise1(t * 0.55, seed + 1) * k, noise1(t * 0.47, seed + 2) * k, noise1(t * 0.51, seed + 3) * k];
const add = (a, b) => a.map((x, i) => x + b[i]);
function shake(t, t0, amp, decay = 5.5, f = 21) {
  if (t < t0) return [0, 0, 0];
  const k = amp * Math.exp(-(t - t0) * decay);
  return [noise1(t * f, 41) * k, noise1(t * f, 42) * k * 0.8, noise1(t * f, 43) * k];
}

export const CAMS = {
  // ---- a low wide, the capy's scale in the near foreground, the streak drops behind him, the ground heaves.
  s06: (lt, d, t) => {
    const k = smooth(invLerp(C.land - 0.05, C.land + 1.5, t));
    let pos = mixV([3.2, 0.45, 3.6], [3.5, 0.5, 4.0], k);
    pos = add(pos, shake(t, C.land, 0.5));
    const look = mixV([1.4, 4.4, -8.0], [1.3, 2.5, -7.0], smooth(invLerp(C.drop, C.land + 0.2, t)));
    return { pos, look: add(look, drift(t, 0.05)), fov: 56, roll: lerp(-5, -2, k) };
  },
  // ---- the tilt: from the claws to the head, a very low worm's-eye lens beside the toe
  s07: (lt, d, t) => {
    const k = easeInOut(clamp(lt / (d * 0.93)), 1.7);
    const head = A(t, 'head');
    const toe = A(t, 'toeL');
    const pos = add([1.5, 0.28, 3.4], drift(t, 0.02));
    const look = mixV([toe[0], 0.35, toe[2] - 0.6], [head[0] - 0.2, head[1] - 0.3, head[2]], k);
    const sh = shake(t, C.boast + 0.06, 0.14, 4);
    return { pos: add(pos, sh), look, fov: 60 + 4 * k, roll: lerp(3, -5, k) };
  },
  // ---- ECU of one gem eye, straight down the pupil, long lens
  s08: (lt, d, t) => {
    const api = WARLORD_API;
    if (!api) return { pos: [0, 5, 3], look: [0, 5, 0], fov: 22 };
    const eye = api.at(t, 'eyeL').clone();
    const q = api.joint('head').getWorldQuaternion(new QUAT());
    const out = localToWorldDir(q, [-0.82, 0.04, 0.57]);
    const up = localToWorldDir(q, [0, 1, 0]);
    const creep = lerp(1.42, 1.22, easeOut(clamp(lt / d), 1.5));
    const P = [eye.x + out[0] * creep + up[0] * 0.05, eye.y + out[1] * creep + up[1] * 0.05, eye.z + out[2] * creep + up[2] * 0.05];
    // roll so the slit stands vertical in the frame
    const v = norm([eye.x - P[0], eye.y - P[1], eye.z - P[2]]);
    const right = norm(cross(v, [0, 1, 0])), imgUp = cross(right, v);
    const tiltRight = Math.atan2(dot(up, right), dot(up, imgUp));
    return { pos: add(P, drift(t, 0.012, 7)), look: [eye.x, eye.y, eye.z], fov: 24, near: 0.2, roll: -tiltRight * 57.2958 };
  },
  // ---- the slash, a low wide with the whole body, city behind
  s10: (lt, d, t) => {
    const k = smooth(lt / d);
    const pos = add(mixV([10.5, 1.1, 2.6], [9.6, 0.9, 2.1], k), shake(t, C.slash, 0.55, 6));
    const look = mixV([4.6, 6.8, -7.5], [4.3, 5.7, -7.5], k);
    return { pos, look: add(look, drift(t, 0.05, 2)), fov: 64, roll: lerp(3, -4, smooth(invLerp(C.slash - 0.1, C.slash + 0.4, t))) };
  },
  // ---- armour bursts: starts on the chest; on the burst it throws the lens back to catch the growth
  s13: (lt, d, t) => {
    const pushB = easeOut(clamp((t - C.shed) / 1.0), 2.4);
    const k = smooth(lt / d);
    // close on the hands raking the breastplate; on the burst the lens is thrown back across the promenade to catch the growth
    const ch = A(t, 'chest');
    const nearP = [ch[0] - 1.5, ch[1] - 1.3, ch[2] + 4.2], nearL = [ch[0] + 0.1, ch[1] + 0.3, ch[2] - 0.2];
    const pos = add(mixV(nearP, [11, 0.9, 3.4], pushB), shake(t, C.shed, 0.95, 4));
    const far = [4.7, 11.6, -7];
    const look = add(mixV(nearL, far, pushB), [0.4 * k, 0, 0]);
    return { pos, look, fov: lerp(48, 72, pushB), roll: lerp(-6, -3, pushB) };
  },
  // ---- the barrage: wide, low, the impact zone on the left, the warlord on the right, its bolts crossing the frame
  s14: (lt, d, t) => {
    const k = smooth(lt / d);
    const pos = add(mixV([62, 1.4, 6], [57, 1.4, 7], k), shake(t, C.barrage, 0.18, 2.2, 14));
    return { pos, look: mixV([0, 12, -22], [0, 14, -22], k), fov: 46, roll: -2 };
  },
  // ---- the rush, lens on the ground looking up the street as it comes at the camera, blade over its head
  s15: (lt, d, t) => {
    const a = A(t, 'chestC');
    const k = smooth(invLerp(C.rush, C.bladeHit, t));
    const pos = add(mixV([2.4, 1.3, 9.0], [1.8, 0.7, 7.2], k), shake(t, C.bladeHit - 0.24, 0.35, 3));
    const look = mixV(a, [1.5, 3.8, -3.6], smooth(invLerp(C.bladeHit - 0.5, C.bladeHit - 0.06, t)));
    return { pos, look, fov: lerp(40, 66, easeIn(k, 1.6)), roll: lerp(-2, -7, k) };
  },
  // ---- regen: a worm's eye from the pillar: the half-body above him, then it laughs
  s19: (lt, d, t) => {
    const k = smooth(lt / d);
    const pos = add(mixV([-3.0, 1.3, 3.6], [-3.6, 1.0, 4.6], k), drift(t, 0.04, 3));
    const a = A(t, 'chestC');
    const look = [a[0] - 0.4, a[1] + 0.6, a[2]];
    return { pos, look, fov: 56, roll: lerp(3, -3, k) };
  },
  // ---- ascent: the lens tracks it up and away until it is a white spark
  s20: (lt, d, t) => {
    // a chasing operator: looks at where he was a moment ago, averaged over the body's drawings, so the launch never steps the lens
    const r = [0, 0.042, 0.083, 0.125].map((b) => A(t - b, 'chestC')).reduce((m, v) => [m[0] + v[0] / 4, m[1] + v[1] / 4, m[2] + v[2] / 4], [0, 0, 0]);
    const k = smooth(lt / d);
    const pos = add([2, 1.2, 14], drift(t, 0.06, 5));
    const fp = mixV([1, 16, -13], r, smooth(invLerp(0.0, 0.5, lt)));
    return { pos, look: fp, fov: lerp(44, 28, k) };
  },
  // ---- coming apart: a CU from below and in front, the eye in the upper third, ship behind it
  s29: (lt, d, t) => {
    const a = A(t, 'head');
    const k = smooth(lt / d);
    // straight at the face, a little below it: the head and the eye in the upper middle, the ship and its shear line behind
    // starts on the face and slowly backs off, so the whole body and the ship behind it are in frame while the edge eats across it
    const pull = easeInOut(clamp(lt / (d * 0.55)), 1.8);
    const pos = add([a[0] - 2.4 - pull * 3.0, a[1] - 2.6 - pull * 5.5, a[2] + 9.6 + pull * 10.5], drift(t, 0.02, 6));
    const look = [a[0] - 0.3, a[1] - 0.9 - pull * 5.0, a[2]];
    return { pos, look, fov: 40, roll: lerp(-3, 2, k) };
  },
};

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
function localToWorldDir(q, v) {
  const x = v[0], y = v[1], z = v[2];
  const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
  const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx];
}

export const LOOKS = {
  s06: () => ({ shadow: { center: [4, 1.5, -6], radius: 24, depth: 60 } }),
  s07: () => ({ shadow: { center: [4, 4, -6], radius: 20, depth: 60 } }),
  s10: () => ({ shadow: { center: [5, 4, -7], radius: 28, depth: 60 } }),
  s13: () => ({ shadow: { center: [5, 7, -7], radius: 30, depth: 70 } }),
};
void WARLORD; void easeIn;

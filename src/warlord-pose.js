import { CUES, SHOTS } from './shots.js';
import { WARLORD } from './layout.js';
import { clamp, lerp, smooth, easeIn, easeOut, easeInOut, noise1, onTwos, deg, invLerp } from './util.js';

// WARLORD dept: the whole performance as a pure function of film time.
// Local numbers are in metres at the armoured size. Shoulders use Euler YXZ: x = forward swing (negative = forward/up),
// y = horizontal swing (+ outward), z = lateral raise (+ outward). el/wr fold forward (positive folds toward the front).
const C = CUES;

// heading for the landing stance: its forward axis, so the layout's feet are a natural staggered stance
export const HEAD0 = -8;

// ---- weights: keep these little named curves near the top; every beat is a time from CUES
export const ROOT = {
  land: [WARLORD.land[0], 0, WARLORD.land[2]],
  site2: [36, 0, -11],            // s14: it stands back on the promenade and pounds him from there
};

const easeOutBack = (u) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(clamp(u) - 1, 3) + c1 * Math.pow(clamp(u) - 1, 2); };
const eOut = (p = 2.6) => (u) => easeOut(u, p);
const eIn = (p = 2.4) => (u) => easeIn(u, p);
const eInOut = (p = 2) => (u) => easeInOut(u, p);
const SNAP = eOut(3.4);        // arrives fast and holds
const HOLD = (u) => (u < 1 ? 0 : 1);

// ------------------------------------------------------------- key poses
const BASE = {
  py: 5.1, ox: 0, oz: 0, pR: [9, 0, 0],
  wR: [4, 0, 0], cR: [-2, 0, 0], nR: [4, 0, 0], hR: [8, -18, 0],
  aR: [34, 0],     // abdomen pitch (+ tucks forward), yaw
  bL: [-68, 8, 10, 118, 118], bR: [-68, 8, 10, 118, 118],     // blade arms, the mantis prayer
  iL: [-30, 10, 12, 62, 8], iR: [-30, 10, 12, 62, 8],         // inner arms
  fL: 0.25, fR: 0.25,
  m: 0.12, gn: 0,
  crX: 1,
};
const P = (o) => ({ ...BASE, ...o });

export const POSES = {
  // the fall: tucked, blades folded up tight, head down, knees to the chest
  fall: P({ py: 5.4, pR: [12, 0, 0], wR: [10, 0, 0], cR: [10, 0, 0], nR: [8, 0, 0], hR: [24, 0, 0], bL: [-105, 6, 18, 142, 138], bR: [-105, 6, 18, 142, 138], iL: [-40, 0, 8, 100, 20], iR: [-40, 0, 8, 100, 20], aR: [62, 0], m: 0.05 }),
  // an instant before touching down: the whole body opens, legs reach, arms lift (anticipation of the shock)
  reach: P({ py: 5.62, pR: [-6, 0, 0], wR: [-4, 0, 0], cR: [-8, 0, 0], nR: [2, 0, 0], hR: [10, 0, 0], bL: [-42, 8, 34, 112, 98], bR: [-42, 8, 34, 112, 98], iL: [12, 0, 28, 24, 0], iR: [-4, 0, 26, 30, 0], aR: [2, 0] }),
  // the feet are down, the mass is still coming
  contact: P({ py: 4.65, pR: [20, 0, 0], wR: [10, 0, 0], cR: [8, 0, 0], nR: [0, 0, 0], hR: [6, 0, 0], bL: [-36, 8, 42, 96, 92], bR: [-36, 8, 42, 96, 92], iL: [30, 0, 30, 20, 0], iR: [-58, 0, 22, 40, 0], aR: [26, 0] }),
  // the bottom of the landing: hips almost on the hocks, chest over the knee, fist on the tile, blades flung wide
  crouchLow: P({ py: 2.05, ox: 0, oz: 0.22, pR: [36, 6, 0], wR: [7, 0, 0], cR: [12, -12, 0], nR: [-18, 8, 0], hR: [-30, -8, 0], bL: [-40, 14, 78, 62, 64], bR: [-26, 14, 86, 52, 58], iL: [-42, 18, 16, 90, 20], iR: [-74, 0, 6, 12, 0], fL: 0.7, fR: 1, aR: [44, 0], m: 0.26 }),
  crouchUp: P({ py: 2.55, oz: 0.16, pR: [34, 4, 0], wR: [6, 0, 0], cR: [10, -10, 0], nR: [-16, 8, 0], hR: [-26, -8, 0], bL: [-44, 14, 70, 72, 72], bR: [-30, 14, 78, 62, 64], iL: [-42, 18, 16, 92, 20], iR: [-74, 0, 6, 12, 0], fL: 0.7, fR: 1, aR: [40, 0], m: 0.2 }),
  crouch: P({ py: 2.3, oz: 0.2, pR: [35, 5, 0], wR: [6, 0, 0], cR: [11, -11, 0], nR: [-18, 8, 0], hR: [-30, -8, 0], bL: [-44, 14, 66, 76, 74], bR: [-30, 14, 74, 66, 66], iL: [-42, 18, 16, 92, 20], iR: [-74, 0, 6, 12, 0], fL: 0.7, fR: 1, aR: [42, 0], m: 0.16 }),
  // getting up: the weight goes forward over the planted foot first, then the knee drives
  rise1: P({ py: 3.3, oz: 0.3, pR: [30, 8, 0], wR: [7, 2, 0], cR: [10, -8, 0], nR: [-10, 6, 0], hR: [-18, -12, 0], bL: [-42, 6, 44, 90, 88], bR: [-36, 6, 46, 96, 88], iL: [-42, 14, 16, 88, 14], iR: [-30, 0, 18, 52, 6], fR: 0.7, aR: [26, 0] }),
  rise2: P({ py: 4.6, oz: 0.12, pR: [20, 6, 0], wR: [10, 2, 0], cR: [8, -6, 0], nR: [0, 2, 0], hR: [0, -18, 0], bL: [-54, 8, 28, 104, 104], bR: [-54, 8, 28, 104, 104], iL: [-32, 12, 14, 70, 10], iR: [-32, 12, 14, 70, 10], aR: [20, 0] }),
  stand: P({}),
  // boast: a beat of drawing in, then it opens
  preBoast: P({ py: 4.74, pR: [16, 0, 0], wR: [10, 0, 0], cR: [14, 0, 0], nR: [8, 0, 0], hR: [-4, -14, 0], bL: [-82, 4, 2, 132, 132], bR: [-82, 4, 2, 132, 132], iL: [-40, 0, 4, 106, 20], iR: [-40, 0, 4, 106, 20], aR: [40, 0], m: 0.02 }),
  boast: P({ py: 5.46, pR: [-2, 0, 0], wR: [2, 0, 0], cR: [4, 0, 0], nR: [2, 0, 0], hR: [12, -8, 0], bL: [-112, 20, 76, 28, 22], bR: [-112, 20, 76, 28, 22], iL: [-24, 28, 62, 34, -14], iR: [-24, 28, 62, 34, -14], fL: 0, fR: 0, aR: [4, 0], m: 1 }),
  boastHold: P({ py: 5.32, pR: [2, 0, 0], wR: [3, 0, 0], cR: [6, 0, 0], nR: [4, 0, 0], hR: [18, -12, 0], bL: [-106, 20, 70, 36, 30], bR: [-106, 20, 70, 36, 30], iL: [-24, 26, 56, 40, -8], iR: [-24, 26, 56, 40, -8], fL: 0, fR: 0, aR: [8, 0], m: 0.82 }),
  // the toe taps: it looks down, the head tilts, very slowly amused
  down: P({ py: 5.0, pR: [10, -3, 0], wR: [6, 0, 0], cR: [6, -6, 0], nR: [16, -8, 0], hR: [30, -20, 12], bL: [-72, 12, 18, 112, 110], bR: [-72, 12, 18, 112, 110], iL: [-32, 12, 14, 70, 10], iR: [-32, 12, 14, 70, 10], aR: [28, 0], m: 0.2 }),
  amused: P({ py: 5.0, pR: [10, -3, 0], wR: [6, 0, 0], cR: [6, -6, 0], nR: [16, -8, 0], hR: [30, -20, -20], bL: [-72, 12, 18, 112, 110], bR: [-72, 12, 18, 112, 110], iL: [-32, 12, 14, 70, 10], iR: [-34, 14, 16, 96, 16], aR: [28, 0], m: 0.42 }),
  // slash: weight onto the front foot, rear foot back, blade cocked behind the shoulder, then one huge arc
  overL: P({ py: 4.92, pR: [12, -2, -4], wR: [6, -4, 0], cR: [6, -8, -5], nR: [8, -4, 0], hR: [16, -10, 0], bL: [-74, 10, 14, 114, 112], bR: [-74, 10, 14, 114, 112], aR: [24, 0], m: 0.16 }),
  cock: P({ py: 4.3, oz: -0.28, pR: [8, 18, 6], wR: [2, 8, 0], cR: [-8, 26, 8], nR: [4, -20, 0], hR: [8, -22, 0], bL: [-58, 6, 40, 88, 66], bR: [-96, 128, 8, 96, -30], iL: [-44, 14, 30, 88, 6], iR: [-52, 28, 34, 72, 6], fL: 0.9, fR: 0.9, aR: [8, 6], m: 0.36 }),
  cockTop: P({ py: 4.12, oz: -0.36, pR: [4, 22, 8], wR: [0, 9, 0], cR: [-12, 30, 10], nR: [2, -24, 0], hR: [6, -24, 0], bL: [-52, 6, 46, 82, 60], bR: [-102, 146, 4, 110, -44], iL: [-44, 14, 34, 90, 6], iR: [-54, 30, 38, 74, 6], fL: 1, fR: 1, aR: [2, 10], m: 0.5 }),
  slash: P({ py: 4.3, oz: 0.42, pR: [22, -24, -8], wR: [12, -10, 0], cR: [12, -24, -10], nR: [-6, 16, 0], hR: [0, 18, 0], bL: [-30, 6, 42, 60, 50], bR: [-90, -68, 0, 8, -6], iL: [-30, 14, 36, 50, 0], iR: [-30, 10, 30, 60, 0], fL: 1, fR: 1, aR: [-14, -12], m: 0.94 }),
  slashThru: P({ py: 4.2, oz: 0.5, pR: [26, -28, -10], wR: [14, -12, 0], cR: [14, -30, -12], nR: [-6, 18, 0], hR: [2, 22, 0], bL: [-28, 6, 44, 60, 50], bR: [-82, -98, 2, 18, 4], iL: [-30, 14, 36, 50, 0], iR: [-30, 10, 30, 60, 0], fL: 1, fR: 1, aR: [-20, -16], m: 0.72 }),
  slashEnd: P({ py: 4.8, oz: 0.1, pR: [14, -14, -2], wR: [7, -6, 0], cR: [6, -14, -4], nR: [8, 4, 0], hR: [12, -8, 0], bL: [-66, 8, 20, 100, 100], bR: [-72, -30, 12, 70, 56], iL: [-32, 12, 14, 70, 10], iR: [-32, 12, 14, 70, 10], aR: [18, 0], m: 0.3 }),
  // shed
  roar: P({ py: 5.0, pR: [-2, 0, 0], wR: [-6, 0, 0], cR: [-18, 0, 0], nR: [-12, 0, 0], hR: [-26, 0, 0], bL: [-28, 30, 62, 40, 30], bR: [-28, 30, 62, 40, 30], iL: [-80, -18, -10, 118, 40], iR: [-80, -18, -10, 118, 40], fL: 0.7, fR: 0.7, aR: [-4, 0], m: 1, gn: 0.3 }),
  claw: P({ py: 4.3, pR: [20, 0, 0], wR: [14, 0, 0], cR: [18, 0, 0], nR: [6, 0, 0], hR: [-6, 0, 0], bL: [-34, 26, 50, 58, 42], bR: [-34, 26, 50, 58, 42], iL: [-72, -30, -18, 134, 56], iR: [-72, -30, -18, 134, 56], fL: 0.82, fR: 0.82, aR: [44, 0], m: 0.72, gn: 1 }),
  burst: P({ py: 5.56, pR: [-4, 0, 0], wR: [-4, 0, 0], cR: [-10, 0, 0], nR: [-8, 0, 0], hR: [-14, 0, 0], bL: [-120, 34, 84, 14, 10], bR: [-120, 34, 84, 14, 10], iL: [-34, 34, 74, 14, -24], iR: [-34, 34, 74, 14, -24], fL: 0, fR: 0, aR: [-16, 0], m: 1 }),
  burstHold: P({ py: 5.44, pR: [-2, 0, 0], wR: [-2, 0, 0], cR: [-6, 0, 0], nR: [-2, 0, 0], hR: [-2, 0, 0], bL: [-112, 30, 74, 26, 24], bR: [-112, 30, 74, 26, 24], iL: [-34, 30, 66, 20, -14], iR: [-34, 30, 66, 20, -14], fL: 0, fR: 0, aR: [-6, 0], m: 0.9 }),
  // barrage: alternating punches thrown down at him with the inner arms; blades flung back
  bar0: P({ py: 5.0, pR: [24, 0, 0], wR: [8, 8, 0], cR: [4, 18, 0], nR: [2, -14, 0], hR: [4, -8, 0], bL: [-96, 62, 40, 56, 40], bR: [-96, 62, 40, 56, 40], iL: [-78, -8, 12, 18, 0], iR: [-30, 32, 34, 102, 10], fL: 0, fR: 1, aR: [10, 0], m: 0.8 }),
  bar1: P({ py: 4.9, pR: [26, 0, 0], wR: [8, -8, 0], cR: [4, -18, 0], nR: [2, 14, 0], hR: [4, 8, 0], bL: [-96, 62, 40, 56, 40], bR: [-96, 62, 40, 56, 40], iL: [-30, 32, 34, 102, 10], iR: [-78, -8, 12, 18, 0], fL: 1, fR: 0, aR: [10, 0], m: 0.88 }),
  // rush: flat out, head forward, blade raised behind for the stab
  rushFly: P({ py: 5.1, pR: [64, 0, 0], wR: [10, 0, 0], cR: [-4, 0, 0], nR: [-22, 0, 0], hR: [-18, 0, 0], bL: [-30, 40, 50, 18, 6], bR: [-30, 40, 50, 18, 6], iL: [10, 10, 30, 20, 0], iR: [10, 10, 30, 20, 0], aR: [-10, 0], m: 0.6 }),
  rushDrive: P({ py: 5.1, pR: [34, 0, 0], wR: [4, 0, 0], cR: [-22, 0, 0], nR: [-8, 0, 0], hR: [12, 0, 0], bL: [-150, -10, 28, 38, -6], bR: [-160, -4, 14, 40, -18], iL: [-8, 0, 40, 40, 0], iR: [-8, 0, 40, 40, 0], fL: 0.8, fR: 0.8, aR: [-6, 0], m: 1 }),
  rushHit: P({ py: 5.1, pR: [22, 0, 0], wR: [7, 0, 0], cR: [9, 0, 0], nR: [-8, 0, 0], hR: [-18, 0, 0], bL: [-100, 42, 62, 30, 8], bR: [-92, 0, 2, 6, -4], iL: [-8, 0, 40, 40, 0], iR: [-8, 0, 40, 40, 0], fL: 0.8, fR: 0.8, aR: [-16, 0], m: 1, gn: 0.6 }),
  // hovering on the mantle: legs hang relaxed; the upper body floats over them
  hover: P({ py: 5.1, pR: [14, 0, 0], wR: [6, 0, 0], cR: [0, 0, 0], nR: [8, 0, 0], hR: [12, 0, 0], bL: [-70, 28, 40, 74, 56], bR: [-70, 28, 40, 74, 56], iL: [-24, 20, 40, 72, 8], iR: [-24, 20, 40, 72, 8], fL: 0.4, fR: 0.4, aR: [30, 0], m: 0.28 }),
  // s18: bent down over him, in his face, screaming
  scream: P({ py: 5.1, pR: [30, 0, 0], wR: [14, 0, 0], cR: [10, 0, 0], nR: [-22, 0, 0], hR: [-46, 0, 0], bL: [-18, 44, 74, 26, 18], bR: [-18, 44, 74, 26, 18], iL: [-52, 28, 46, 60, 10], iR: [-52, 28, 46, 60, 10], fL: 0.1, fR: 0.1, aR: [26, 0], m: 1, gn: 1 }),
  // the cut, frozen a moment, stunned upright
  cut: P({ py: 5.1, pR: [-4, 0, 13], wR: [-6, 0, 8], cR: [-10, -4, -6], nR: [14, -10, 4], hR: [28, -30, -8], bL: [-66, 18, 44, 64, 50], bR: [-16, 30, 66, 58, 26], iL: [-24, 20, 40, 72, 8], iR: [-34, -8, 12, 116, 20], fL: 0.1, fR: 0.5, aR: [34, -14], m: 1, gn: 0 }),
  laugh1: P({ py: 5.1, pR: [8, 0, 0], wR: [-6, 0, 0], cR: [-18, 0, 0], nR: [-10, 0, 0], hR: [-26, 0, 16], bL: [-98, 24, 72, 46, 40], bR: [-98, 24, 72, 46, 40], iL: [-30, 20, 46, 70, 10], iR: [-30, 20, 46, 70, 10], fL: 0.5, fR: 0.5, aR: [2, 0], m: 0.96 }),
  laugh2: P({ py: 5.1, pR: [12, 0, 0], wR: [0, 0, 0], cR: [-10, 0, 0], nR: [-6, 0, 0], hR: [-14, 0, 20], bL: [-92, 24, 66, 52, 44], bR: [-92, 24, 66, 52, 44], iL: [-30, 20, 46, 70, 10], iR: [-30, 20, 46, 70, 10], fL: 0.5, fR: 0.5, aR: [8, 0], m: 0.42 }),
  // the ascent and the crucifixion in the sky
  ascend: P({ py: 5.1, pR: [8, 0, 0], wR: [0, 0, 0], cR: [-6, 0, 0], nR: [-4, 0, 0], hR: [-10, 0, 0], bL: [-162, 4, 18, 8, 0], bR: [-162, 4, 18, 8, 0], iL: [10, 0, 30, 10, 0], iR: [10, 0, 30, 10, 0], fL: 0.6, fR: 0.6, aR: [-10, 0], m: 0.5 }),
  burn: P({ py: 5.1, pR: [0, 0, 0], wR: [-3, 0, 0], cR: [-8, 0, 0], nR: [-6, 0, 0], hR: [-10, 0, 0], bL: [-88, 0, 96, 6, 0], bR: [-88, 0, 96, 6, 0], iL: [-14, 0, 80, 6, 0], iR: [-14, 0, 80, 6, 0], fL: 0.3, fR: 0.3, aR: [-4, 0], m: 0.9 }),
  // coming apart: arched back into the blast, arms thrown wide
  undo: P({ py: 5.1, pR: [-4, 0, 5], wR: [-3, 0, 3], cR: [-12, 6, 4], nR: [6, 12, -4], hR: [18, 30, -8], bL: [-30, 34, 46, 50, 30], bR: [-140, 20, 50, 40, 20], iL: [-10, 20, 30, 40, 10], iR: [-50, 24, 60, 50, 0], fL: 0.4, fR: 0.1, aR: [-16, 6], m: 0.86 }),
  undo2: P({ py: 5.1, pR: [-8, 0, 7], wR: [-5, 0, 4], cR: [-18, 8, 5], nR: [2, 14, -4], hR: [8, 34, -10], bL: [-16, 30, 34, 62, 40], bR: [-152, 16, 44, 26, 10], iL: [-4, 18, 24, 52, 14], iR: [-58, 22, 54, 40, 0], fL: 0.6, fR: 0.15, aR: [-24, 8], m: 1 }),
};

// [ time, pose, ease of the segment arriving at this key ]
const su = C.standUp, bo = C.boast, sl = C.slash, sw = C.slashWind, sh = C.shed, ss = C.shedStart, ba = C.barrage, ru = C.rush, bh = C.bladeHit, fl = C.flick, re = C.regen, as = C.ascend, br = C.breakup, ld = C.land;
const shotT = (id) => SHOTS.find((x) => x.id === id).start;
const shotE = (id) => SHOTS.find((x) => x.id === id).end;
const s14 = shotT('s14'), s15 = shotT('s15');  // cut times from the shot list (site changes)
export const KEYS = [
  [C.drop - 0.2, 'fall'],
  [ld - 0.1, 'fall', HOLD],
  [ld - 0.02, 'reach', eOut(2)],
  [ld, 'contact', eIn(1.6)],
  [ld + 0.24, 'crouchLow', SNAP],
  [ld + 0.54, 'crouchUp', eInOut(1.6)],
  [ld + 1.1, 'crouch', eInOut(2)],
  [su, 'crouch', HOLD],
  [su + 0.62, 'rise1', eInOut(1.8)],
  [su + 1.3, 'rise2', eInOut(1.7)],
  [bo - 0.38, 'stand', eInOut(1.6)],
  [bo - 0.06, 'preBoast', eOut(1.6)],
  [bo + 0.24, 'boast', easeOutBack],
  [bo + 1.2, 'boastHold', eInOut(1.7)],
  [C.toeTap1 - 1.4, 'boastHold', HOLD],
  [C.toeTap1 + 0.2, 'down', eInOut(2.2)],
  [C.toeTap2 + 0.5, 'down', HOLD],
  [C.toeTap2 + 0.9, 'amused', eInOut(1.6)],
  [sw - 0.4, 'amused', HOLD],
  [sw - 0.1, 'overL', eInOut(1.6)],
  [sw + 0.72, 'cock', eInOut(1.8)],
  [sl - 0.14, 'cockTop', eOut(1.4)],
  [sl, 'slash', eIn(2.6)],
  [sl + 0.2, 'slashThru', eOut(2.4)],
  [sl + 1.4, 'slashEnd', eInOut(1.8)],
  [ss - 0.2, 'stand', eInOut(1.8)],
  [ss + 0.08, 'roar', SNAP],
  [ss + 0.34, 'roar', HOLD],
  [sh - 0.08, 'claw', eInOut(1.6)],
  [sh + 0.12, 'burst', SNAP],
  [sh + 1.0, 'burstHold', eInOut(1.7)],
  [s14 - 0.02, 'burstHold', HOLD],
  [s14, 'bar0', HOLD],
  [ba + 0.22, 'bar1', SNAP], [ba + 0.44, 'bar0', SNAP], [ba + 0.62, 'bar1', SNAP], [ba + 0.82, 'bar0', SNAP], [ba + 1.0, 'bar1', SNAP],
  [ba + 1.18, 'bar0', SNAP], [ba + 1.36, 'bar1', SNAP], [ba + 1.54, 'bar0', SNAP], [ba + 1.72, 'bar1', SNAP], [ba + 1.9, 'bar0', SNAP], [ba + 2.08, 'bar1', SNAP], [ba + 2.3, 'bar0', SNAP],
  [s15 - 0.02, 'bar0', HOLD],
  [s15, 'rushFly', HOLD],
  [ru + 0.42, 'rushFly', HOLD],
  [bh - 0.22, 'rushDrive', eOut(2)],
  [bh, 'rushHit', eIn(2.8)],
  [bh + 0.34, 'rushHit', HOLD],
  [bh + 0.66, 'hover', eInOut(1.8)],
  [fl - 1.3, 'hover', HOLD],
  [fl - 0.82, 'scream', SNAP],
  [fl - 0.02, 'scream', HOLD],
  [fl + 0.12, 'cut', SNAP],
  [re - 0.02, 'cut', HOLD],
  [re + 0.44, 'hover', eInOut(1.8)],
  [re + 1.0, 'laugh1', SNAP],
  [re + 1.14, 'laugh2', SNAP], [re + 1.28, 'laugh1', SNAP], [re + 1.42, 'laugh2', SNAP], [re + 1.56, 'laugh1', SNAP], [re + 1.7, 'laugh2', SNAP], [re + 1.84, 'laugh1', SNAP], [re + 1.98, 'laugh2', SNAP], [re + 2.12, 'laugh1', SNAP], [re + 2.26, 'laugh2', SNAP],
  [as - 0.26, 'hover', eInOut(1.6)],
  [as, 'ascend', SNAP],
  [as + 1.2, 'ascend', HOLD],
  [as + 1.9, 'burn', eInOut(1.8)],
  [br - 0.1, 'burn', HOLD],
  [br + 0.4, 'undo', SNAP],
  [C.breakupEnd, 'undo2', eInOut(1.3)],
].map(([t, p, e]) => [t, POSES[p], e]);

const RUSH_C = [3.8, -0.73, -11.93];     // root at the instant of the hit: the blade tip stops just above him
const lerpAr = (a, b, u) => a.map((x, i) => x + (b[i] - x) * u);
function poseBlend(t) {
  let i = KEYS.length - 1;
  while (i > 0 && KEYS[i][0] > t) i--;
  const [t0, A] = KEYS[i];
  const next = KEYS[Math.min(i + 1, KEYS.length - 1)];
  const [t1, B, ease] = next;
  const u = t1 > t0 ? (ease || smooth)(clamp((t - t0) / (t1 - t0))) : 0;
  const R = {};
  for (const k of Object.keys(BASE)) {
    const a = A[k], b = B[k];
    R[k] = Array.isArray(a) ? lerpAr(a, b, u) : a + (b - a) * u;
  }
  return R;
}

// ------------------------------------------------------------------- feet
// ball = world position of the ball of the foot on the ground. Planted feet are at fixed world xz between these times.
const PL = { x: WARLORD.footL[0], z: WARLORD.footL[2], yaw: -20 };
const SITE2 = {
  L: { x: ROOT.site2[0] - 2.9, z: ROOT.site2[2] + 1.6, yaw: -112 },
  R: { x: ROOT.site2[0] + 1.3, z: ROOT.site2[2] - 3.3, yaw: -84 },
};
// rear foot: landed a little wide, one step to get under the body as it rises, one back for the slash, one out after the growth
export const STEPS_R = [
  { t0: ld, t1: su + 0.34, x: 7.1, z: -9.4, yaw: 10 },
  { t0: su + 0.96, t1: sw + 0.3, x: 6.4, z: -8.0, yaw: 8 },
  { t0: sw + 0.76, t1: sh + 1.0, x: 7.3, z: -9.8, yaw: 14 },
  { t0: sh + 1.58, t1: s14, x: 8.3, z: -9.4, yaw: 20 },
];
const FOOT_AIR = {
  // in root-local metres: where the balls of the feet hang while airborne (relative to the root origin)
  fall: { L: [-1.4, 5.0 - 1.4, 1.2], R: [1.4, 5.0 - 1.4, 0.2] },
  rush: { L: [-0.9, 2.3, -1.0], R: [0.9, 1.5, -1.6] },
  hover: { L: [-1.0, 1.0, 0.1], R: [1.0, 1.0, -0.3] },
  cut: { L: [-1.0, 1.0, 0.1], R: [2.5, 3.1, 1.5] },      // the half that is left: its one leg kicked up and out, nothing to stand on
};

function rootAt(t) {
  // world position of the root, heading, scale
  let pos, h = HEAD0;
  const cruise = ROOT.land;
  if (t < ld) {
    const u = clamp((t - (C.drop - 0.2)) / (ld - (C.drop - 0.2)));
    pos = [cruise[0], lerp(110, 0, 1 - Math.pow(1 - easeIn(u, 2), 1)), cruise[2]];
  } else if (t < s14) pos = cruise;
  else if (t < s15) { pos = ROOT.site2; h = -106; }
  else if (t <= bh) {
    // the rush: a curving flat run through the towers, then down on him
    const u = clamp((t - ru) / (bh - ru));
    const a = [86, 34, -212], b = [32, 22, -60], c = RUSH_C, e = easeIn(u, 1.5);
    const q = (x, y, z) => (1 - e) * (1 - e) * x + 2 * e * (1 - e) * y + e * e * z;
    pos = [q(a[0], b[0], c[0]), q(a[1], b[1], c[1]), q(a[2], b[2], c[2])];
    h = -32;
  } else if (t < as + 2) {
    const yR = (p) => p - BASE.py * 1.55;     // layout gives the pelvis height: root sits on the virtual ground below it
    const fp = [WARLORD.hover[0], yR(WARLORD.hover[1]), WARLORD.hover[2]];
    const close = [2.15, yR(2.1), -8.6];       // leaning into his face
    const hk = smooth(invLerp(fl - 1.34, fl - 0.86, t)) * (1 - smooth(invLerp(fl + 0.1, fl + 0.5, t)));
    const recoil = smooth(invLerp(fl, fl + 0.42, t));
    const recoilPos = [1.5, yR(7.2), -10.4];
    const after = [1.0, yR(8.6), -12];
    pos = lerpAr(fp, close, hk);
    if (recoil > 0) pos = lerpAr(pos, recoilPos, recoil);
    if (t >= shotT('s19')) pos = after;
    const bob = Math.sin(t * 1.25) * 0.28 + Math.sin(t * 2.7) * 0.08;
    pos = [pos[0], pos[1] + bob, pos[2]];
    h = lerp(-8, -14, hk);
    // the flick spins what is left of him: the open side comes round to the lens
    h += 24 * smooth(invLerp(fl, fl + 0.4, t)) * (1 - smooth(invLerp(re + 0.1, re + 1.1, t)));
    // settles out of the strike: no teleport at the end of the rush
    { const kS = smooth(invLerp(bh + 0.34, bh + 0.9, t)); pos = lerpAr(RUSH_C, pos, kS); h = lerp(-32, h, kS); }
    // the ascent
    if (t > as - 0.05) {
      const u2 = clamp((t - as + 0.05) / 1.7);
      const sky = WARLORD.skyPoint;
      const e2 = easeIn(u2, 2.2);
      pos = [lerp(after[0], sky[0], e2), lerp(after[1], sky[1], e2), lerp(after[2], sky[2], e2)];
      pos[1] += Math.sin(u2 * Math.PI) * 18;
    }
  } else {
    pos = [...WARLORD.skyPoint];
    if (t > br) pos = [pos[0], pos[1] + easeIn(clamp((t - br) / 2.8), 1.5) * 6, pos[2]];
  }
  return { pos, h };
}

// growth curve: 9 m -> 14 m with overshoot; lands on the shed cue
export const scaleAt = (t) => {
  if (t < sh) return 1;
  const u = (t - sh) / 0.8;
  if (u >= 1.7) return 1.55;
  if (u < 1) return 1 + 0.55 * easeOutBack(u) * (1 + 0.0);
  return 1.55 + 0.04 * Math.sin((u - 1) * Math.PI / 0.7) * Math.exp(-(u - 1) * 2.4);
};

function footWorldAt(side, t, root, s) {
  // returns { ball: [x,y,z], planted, yaw, pitch, airLocal? }
  const air = (kind, pitch, blendLocal) => ({ air: FOOT_AIR[kind][side], planted: false, yaw: 0, pitch, blendLocal });
  const fy = s * 0;       // the sole is on y=0
  if (t < ld) {
    // fall: tucked up, in the last moment reaching down for the plant
    const plant = side === 'L' ? [PL.x, 0, PL.z] : [STEPS_R[0].x, 0, STEPS_R[0].z];
    const yaw = side === 'L' ? PL.yaw : STEPS_R[0].yaw;
    const u = smooth((t - (ld - 0.16)) / 0.16);
    const tuck = (1 - u) * 2.5;
    return { ball: [plant[0], root.pos[1] + tuck + fy, plant[2]], planted: false, yaw, pitch: lerp(38, 0, u) };
  }
  if (t < s14) {
    if (side === 'L') return { ball: [PL.x, 0, PL.z], planted: true, yaw: PL.yaw, pitch: 0 };
    let last = STEPS_R[0];
    for (let i = 0; i < STEPS_R.length; i++) {
      const a = STEPS_R[i];
      if (t >= a.t0 && t < a.t1) return { ball: [a.x, 0, a.z], planted: true, yaw: a.yaw, pitch: 0 };
      if (t >= a.t1 && i + 1 < STEPS_R.length && t < STEPS_R[i + 1].t0) {
        const b = STEPS_R[i + 1], u = (t - a.t1) / (b.t0 - a.t1);
        const e = easeInOut(u, 2);
        // the foot peels up, swings in an arc and comes down toe-first
        const pitch = Math.sin(Math.PI * u) * 34;
        return { ball: [lerp(a.x, b.x, e), Math.sin(Math.PI * u) * 0.55 * Math.sqrt(s) + Math.sin(deg(pitch)) * 1.8 * s, lerp(a.z, b.z, e)], planted: false, yaw: lerp(a.yaw, b.yaw, e), pitch };
      }
      last = a;
    }
    return { ball: [last.x, 0, last.z], planted: true, yaw: last.yaw, pitch: 0 };
  }
  if (t < s15) {
    const f = SITE2[side];
    return { ball: [f.x, 0, f.z], planted: true, yaw: f.yaw, pitch: 0 };
  }
  // airborne
  if (t < bh + 0.5) return air('rush', 62);
  { const u = smooth(invLerp(fl, fl + 0.14, t)) * (1 - smooth(invLerp(re, re + 0.5, t))); return { ...air('hover', 48), air: lerpAr(FOOT_AIR.hover[side], FOOT_AIR.cut[side], u) }; }
}

const smoothNoise = (t, f, seed) => noise1(t * f, seed);

// The body pose with all fine motion, on twos. Pure function of t.
export function poseAt(t0) {
  let t = onTwos(t0 + 1e-6);
  // drawings never reach back over a cut: the first drawing of a shot starts on the cut
  for (const sh of SHOTS) if (t0 >= sh.start && t0 < sh.end && t < sh.start) { t = sh.start; break; }
  const P0 = poseBlend(t);
  const R = rootAt(t);
  const s = scaleAt(t);
  const Fs = { L: footWorldAt('L', t, R, s), R: footWorldAt('R', t, R, s) };
  const air = t < ld || t >= s15;

  // Stillness with life: the mantis sway, in time with breath, only when there's weight on the feet
  const still = 1 - clamp(Math.abs(t - bo) * 0.0);
  const sw1 = Math.sin(t * 1.05) * still;
  const sw2 = Math.sin(t * 2.3 + 0.7);
  P0.ox += sw1 * 0.07; P0.pR[2] += sw1 * 1.4; P0.wR[2] += -sw1 * 0.8; P0.cR[2] += -sw1 * 0.6;
  P0.pR[0] += sw2 * 0.4;

  // breath: chest heave and abdomen pulse. Fast when it has just shed / regenerated
  const br2 = 1 + 1.2 * clamp(1 - Math.abs(t - sh) / 2.5);
  const breath = Math.sin(t * 1.6 * br2) * 0.5 + 0.5;
  P0.cR[0] += (breath - 0.5) * 1.6;
  P0.py += (breath - 0.5) * 0.05;
  const abdPulse = breath;

  // weight distribution from which planted foot carries the pelvis (world xz → root-local)
  let wtR = 0.5;
  if (t >= ld && t < s14) {
    // 0 = over the front foot, 1 = over the rear foot
    wtR = keyed(t, [[ld, 0.48], [su + 0.1, 0.42], [su + 0.32, 0.18], [su + 0.92, 0.2], [su + 1.45, 0.48], [sw - 0.1, 0.42], [sw + 0.24, 0.1], [sw + 0.42, 0.1], [sw + 1.0, 0.82], [sl - 0.06, 0.92], [sl + 0.1, 0.2], [sl + 0.8, 0.28], [sl + 2.0, 0.46], [sh, 0.46], [sh + 1.1, 0.34], [sh + 1.4, 0.24], [sh + 1.7, 0.56]]);
  } else if (t >= s14 && t < s15) wtR = 0.5;
  let pelW = null;
  if (!air) {
    const a = Fs.L.ball, b = Fs.R.ball;
    pelW = [lerp(a[0], b[0], wtR), lerp(a[2], b[2], wtR)];
  }

  // arcs: a tiny drift on the head and mandibles
  const headN = [smoothNoise(t, 0.8, 11) * 1.3, smoothNoise(t, 0.7, 12) * 2.4, smoothNoise(t, 0.6, 13) * 1.0];
  P0.hR = P0.hR.map((x, i) => x + headN[i]);

  // Shock shake on landing and other hits: the mass rings
  const shk = Math.exp(-Math.max(t - ld, 0) * 7) * (t >= ld ? 1 : 0);
  P0.py += shk * Math.sin((t - ld) * 26) * 0.05;

  // mandible working + gnash
  const nw = (Math.sin(t * 7.1) * 0.5 + 0.5) * 0.05 + smoothNoise(t, 3.1, 44) * 0.03;
  const gnash = Math.abs(Math.sin(t * 26));
  const m = clamp(P0.m + nw + P0.gn * (gnash - 0.5) * 0.5, 0, 1.15);

  // ---- state curves from cues
  const st = {};
  st.shedU = clamp((t - sh) / 0.8);
  st.crack = clamp((t0 - (ss + 0.16)) / (sh - ss - 0.16));
  st.vein = t0 < sh ? 0 : clamp((t0 - sh) / 0.4);
  st.veinPulse = t0 >= sh ? Math.exp(-(t0 - sh) * 1.6) + 0.15 * Math.max(0, Math.sin(t0 * 7)) : 0;
  if (t0 >= fl) st.veinPulse = Math.max(st.veinPulse, smooth(invLerp(re - 0.1, re + 0.4, t0)) * (1 - smooth(invLerp(re + 1.8, re + 2.8, t0))) * 1.2);
  // the star's front arrives on a burnt husk: dark chitin, lit cracks, so the whole figure reads while it comes apart
  st.hot = smooth(invLerp(as + 0.05, as + 1.9, t0)) * lerp(1, 0.22, smooth(invLerp(br - 0.3, br + 0.3, t0)));
  st.black = t0 >= C.veins && t0 < shotE('s22') ? 1 : 0;
  // the cut: straight at the flick, boiling back during regen
  st.cutOn = t0 >= fl && t0 < re + 2.35 ? 1 : 0;
  st.regenU = smooth(invLerp(re, re + 2.2, t0));
  st.boil = smooth(invLerp(re - 0.08, re + 0.24, t0));
  // ash front
  // near-linear: he goes limb by limb over two seconds, the figure must still be there to come apart
  st.disOn = t0 >= br + 0.7 ? 1 : 0;
  { const u = invLerp(br + 0.7, C.breakupEnd - 0.05, t0); st.disU = lerp(u, smoother01(u), 0.2); }

  // mantle state: how huge the mantle is
  st.mantle = keyed(t0, [[C.drop - 0.3, 0.45], [ld, 0.5], [ld + 0.3, 0.28], [su, 0.28], [bo - 0.1, 0.32], [bo + 0.3, 1.5], [bo + 1.4, 1.05], [sl - 0.1, 1], [sl, 1.25], [ss, 1.1], [sh - 0.02, 1.15], [sh + 0.18, 2.8], [sh + 1.3, 1.7], [s15, 1.5], [bh, 2.2], [bh + 1, 1.5], [fl, 1.6], [fl + 0.3, 1.0], [re + 0.2, 1.1], [re + 1.2, 1.7], [as, 1.9], [as + 1.5, 2.8], [br - 0.3, 1.5], [br + 0.5, 0.7], [C.breakupEnd - 0.4, 0.12], [C.breakupEnd, 0.02]]);
  // eye: pupil 0 slit - 1 wide; lightning 0..1
  st.pupil = keyed(t0, [[0, 0.38], [C.eye + 0.3, 0.38], [C.eye + 0.5, 0.12], [C.eye + 1.1, 0.06], [sh, 0.5], [sh + 1, 0.22], [fl, 0.3], [fl + 0.06, 1.0], [fl + 1.2, 0.6], [as, 0.3], [br, 0.42], [br + 0.34, 1.0], [br + 1.6, 1.0], [C.breakupEnd - 0.3, 1.0]]);
  st.eyeLight = keyed(t0, [[0, 0.32], [C.eye + 0.34, 0.32], [C.eye + 0.5, 1.1], [C.eye + 1.3, 1.0], [sh, 1.1], [fl, 0.4], [re, 1.4], [as, 1.2], [br, 1.0], [br + 1.6, 1.0], [C.breakupEnd - 0.5, 0]]);
  st.dead = smooth(invLerp(C.breakupEnd - 1.0, C.breakupEnd - 0.2, t0));

  return { ...P0, t, root: R, s, feet: Fs, m, wtR, pelW, air, st, breath, abdPulse, shk };
}

function smoother01(u) { return smooth(u); }
function keyed(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, a] = keys[i - 1], [t1, b] = keys[i];
      return lerp(a, b, smooth((t - t0) / (t1 - t0)));
    }
  }
  return keys[keys.length - 1][1];
}

// ---------------------------------------------------------- secondary motion
// Springs baked once over the whole film. Pure lookup at render time: frame order doesn't matter.
export const BAKE = { frames: 0, head: null, antL: null, antR: null, abd: null, mant: null, m: null };
export function bakeSecondary(fps, frames) {
  BAKE.frames = frames;
  BAKE.head = new Float32Array(frames * 3);
  BAKE.abd = new Float32Array(frames * 2);
  BAKE.mant = new Float32Array(frames * 3);
  BAKE.antL = new Float32Array(frames * 3);
  BAKE.antR = new Float32Array(frames * 3);
  BAKE.m = new Float32Array(frames);
  const dt = 1 / fps;
  const vec = () => ({ x: [0, 0, 0], v: [0, 0, 0] });
  const head = vec(), abd = vec(), mant = vec(), aL = vec(), aR = vec();
  let mX = 0, mV = 0;
  let prevP = null, prevVel = [0, 0, 0], prevCR = null, prevM = null;
  const spring = (S, ax, k, c, out, n) => {
    for (let i = 0; i < n; i++) {
      S.v[i] += (-k * S.x[i] - c * S.v[i] + ax[i]) * dt;
      S.x[i] += S.v[i] * dt;
      out[i] = S.x[i];
    }
  };
  const lim = (a, m) => { const l = Math.hypot(...a); return l > m ? a.map((x) => x * (m / l)) : a; };
  const O = [0, 0, 0];
  // antenna twitches: seeded pulse times
  const pulses = [];
  { let tp = 0; let sd = 0.31; const f = (x) => { sd = (sd * 9301.17 + 49297.3) % 1; return sd * x; }; while (tp < frames / fps) { tp += 0.18 + f(1.1); pulses.push([tp, f(1) > 0.5 ? 1 : -1, f(1), f(1)]); } }
  for (let n = 0; n < frames; n++) {
    const t = n / fps;
    const p = poseAt(t);
    // chest position (root + pelvis height + rough lean)
    const hr = deg(p.root.h);
    const lx = (p.ox ?? 0) * p.s, lz = (p.oz ?? 0) * p.s;
    const wx = p.root.pos[0] + Math.sin(hr) * lz + Math.cos(hr) * lx, wz = p.root.pos[2] + Math.cos(hr) * lz - Math.sin(hr) * lx, wy = p.root.pos[1] + (p.py + 1.5) * p.s;
    const P = [wx, wy, wz];
    let vel = prevP ? [(P[0] - prevP[0]) / dt, (P[1] - prevP[1]) / dt, (P[2] - prevP[2]) / dt] : [0, 0, 0];
    if (Math.hypot(...vel) > 240) vel = prevVel;       // a cut teleports
    const acc = lim([(vel[0] - prevVel[0]) / dt, (vel[1] - prevVel[1]) / dt, (vel[2] - prevVel[2]) / dt], 800);
    prevVel = vel; prevP = P;
    // into the body frame
    const fwd = [Math.sin(hr), 0, Math.cos(hr)], left = [Math.cos(hr), 0, -Math.sin(hr)];
    const ab = [acc[0] * left[0] + acc[2] * left[2], acc[1], acc[0] * fwd[0] + acc[2] * fwd[2]];
    // rotation rates of the torso
    const CR = [p.pR[0] + p.wR[0] * 3 + p.cR[0], p.pR[1] + p.wR[1] * 3 + p.cR[1], p.pR[2] + p.wR[2] * 3 + p.cR[2]];
    const drot = prevCR ? CR.map((x, i) => lim([(x - prevCR[i]) / dt], 700)[0]) : O;
    prevCR = CR;
    const hd = [0, 0, 0];
    // head lags the chest: it wants to keep looking where it was, then catches up with overshoot
    spring(head, drot.map((x) => -x * 11), 96, 13, hd, 3);
    BAKE.head.set(hd, n * 3);
    const ab2 = [0, 0, 0];
    spring(abd, [-drot[0] * 7 - ab[2] * 0.7, -drot[1] * 7 - ab[0] * 0.7, 0], 34, 5.5, ab2, 2);
    BAKE.abd.set(ab2.slice(0, 2), n * 2);
    const m2 = [0, 0, 0];
    spring(mant, [-ab[0] * 0.2, -ab[1] * 0.12, -ab[2] * 0.2], 14, 3.2, m2, 3);
    BAKE.mant.set(m2, n * 3);
    // antennae: pushed by the chest, whip-like, with their own twitches; separate delays
    const twL = [0, 0, 0], twR = [0, 0, 0];
    for (const [tp, sg, a, b] of pulses) {
      const d = t - tp;
      if (d < 0 || d > 0.5) continue;
      const k = Math.exp(-d * 14) * Math.sin(d * 58);
      const pow = 150 * (0.45 + a * 0.55);
      if (a < 0.7) twL[1] += sg * pow * k, twL[0] += (b - 0.5) * pow * 1.2 * k;
      if (a > 0.3) twR[1] -= sg * pow * k, twR[0] += (0.5 - b) * pow * 1.2 * k;
    }
    const ax = [-ab[0] * 0.26 + twL[0], -ab[1] * 0.26 + twL[1], -ab[2] * 0.26 + twL[2]];
    const axR = [-ab[0] * 0.26 + twR[0], -ab[1] * 0.26 + twR[1], -ab[2] * 0.26 + twR[2]];
    const oL = [0, 0, 0], oR = [0, 0, 0];
    spring(aL, ax, 55, 6.5, oL, 3);
    spring(aR, axR, 49, 6.0, oR, 3);
    BAKE.antL.set(oL, n * 3);
    BAKE.antR.set(oR, n * 3);
    const dm = prevM == null ? 0 : (p.m - prevM) / dt;
    mV += (-120 * mX - 11 * mV - dm * 20) * dt;
    mX += mV * dt;
    prevM = p.m;
    BAKE.m[n] = clamp(mX, -0.3, 0.3);
  }
}
export function poseSecondary(t, n) {
  const f = clamp(n, 0, BAKE.frames - 1);
  return {
    head: [BAKE.head[f * 3], BAKE.head[f * 3 + 1], BAKE.head[f * 3 + 2]],
    abd: [BAKE.abd[f * 2], BAKE.abd[f * 2 + 1]],
    mant: [BAKE.mant[f * 3], BAKE.mant[f * 3 + 1], BAKE.mant[f * 3 + 2]],
    antL: [BAKE.antL[f * 3], BAKE.antL[f * 3 + 1], BAKE.antL[f * 3 + 2]],
    antR: [BAKE.antR[f * 3], BAKE.antR[f * 3 + 1], BAKE.antR[f * 3 + 2]],
    m: BAKE.m[f],
  };
}

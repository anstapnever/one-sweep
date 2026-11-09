import { noise1, smooth, lerp } from '../util.js';
import { SLASH } from '../layout.js';

// Ring owns s03 (the trench from the air) and s11 (the skyline cut on one line).
const nl = Math.hypot(...SLASH.n);
const n = SLASH.n.map((v) => v / nl);
const d = n[0] * SLASH.p[0] + n[1] * SLASH.p[1] + n[2] * SLASH.p[2];
const planeY = (x, z) => (d - n[0] * x - n[2] * z) / n[1];

export const CAMS = {
  // aerial: the long straight trench across the frame, the ring curving up to the east
  s03: (lt, dur, t) => {
    const k = lt / dur;
    const dr = noise1(t * 0.4, 1) * 1;
    return { pos: [-290 + 90 * k, 205 - 14 * k + dr * 2, -500 - 14 * k + dr * 2], look: [190 + 40 * k, -6, -758], fov: 52 };
  },
  // the eye sits ON the cut plane: however many towers it passes through, the cut projects to one dead straight line
  s11: (lt, dur, t) => {
    const k = smooth(lt / dur);
    const shake = lt < 0.3 ? Math.exp(-lt * 7) * 3 : 0;
    const x = -300 + 50 * k + noise1(t * 2, 2) * 0.6, z = 330 - 20 * k;
    const y = planeY(x, z) + 4 + noise1(t * 1.7, 3) * 0.4 + shake * 0.5;
    return { pos: [x, y, z], look: [-430 + 30 * k, planeY(-430, -240) + 54, -240], fov: 38 };
  },
};
export const LOOKS = {
  // the aerial sees 2-3 km of city: thin the haze so the towers keep their colour
  s03: () => ({ fogMul: 0.32 }),
  s11: () => ({ fogMul: 0.3, exposure: 0.92 }),
};

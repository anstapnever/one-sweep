import { CUES as C } from '../shots.js';
import { noise1, smooth, clamp, lerp, invLerp, easeOut } from '../util.js';
import { BARRAGE_BIG } from '../fx-timing.js';

// Cameras of the FX department: s14, s22, s24, s27, s28.
let fxc = null;
export function setFxContext(v) { fxc = v; }

const shake = (t, amp, f = 21, seed = 0) => [amp * noise1(t * f, seed + 1), amp * noise1(t * f, seed + 2)];
function bumps(t, list, k = 8) {
  let e = 0;
  for (const b of list) if (t >= b) e += Math.exp(-(t - b) * k);
  return e;
}

export const CAMS = {
  // wide and low: the promenade, the stacked explosions over his spot, the warlord high behind
  s14: (lt, d, t) => {
    const e = bumps(t, BARRAGE_BIG.map((b) => C.barrage + b));
    const sh = shake(t, 0.05 + 0.32 * e);
    const push = smooth(lt / d);
    // over the warlord's shoulder, low: it stands huge on the right and pounds his spot on the left
    return { pos: [62 - 5 * push + sh[0], 1.4 + sh[1] * 0.5, 6 + 1 * push], look: [0, 12 + 2 * push + sh[1], -22], fov: 46 };
  },
  s22: () => ({ pos: [0, 2, 10], look: [0, 2, 0], fov: 40 }),
  // from the ground: the column fills the sky, the capybara a speck at the bottom
  s24: (lt, d, t) => {
    const k = smooth(lt / d);
    const e = Math.exp(-Math.max(t - C.fire, 0) * 2.2);
    const sh = shake(t, 0.25 + 0.9 * e, 14);
    return { pos: [-3 + sh[0], 1.5 + sh[1] * 0.3, 22], look: [sh[0] * 2, 78 + 5 * k + sh[1] * 2, -80], fov: 88, near: 0.5, far: 8500 };
  },
  s27: (lt, d, t) => {
    const a = t - C.sweep;
    const e = a > 0 ? Math.exp(-a * 7) : 0;
    const sh = shake(t, 0.03 + 0.26 * e, 26, 3);
    return { pos: [1.6 + sh[0], 0.32 + sh[1], 2.6], look: [-0.15, 0.85, 0], fov: 46 };
  },
  // behind him, low, looking up at the ring of torn air: he stands at the bottom of the hole
  s28: (lt, d, t) => {
    const sh = shake(t, 0.05, 2.5, 5);
    // looking south over the open air (the towers are all behind us), the hole of blue above him
    const z = -15.5 - 1.2 * smooth(lt / d);
    return { pos: [-0.3 + sh[0], 0.32 + sh[1] * 0.3, z], look: [0.2, 12.5 + 3.2 * smooth(lt / d), z + 30], fov: 66 };
  },
};
export const LOOKS = {
  s24: () => ({ sunElev: 54, sunAz: 150, shadow: { center: [0, 0, 0], radius: 40, depth: 40 } }),
  s28: () => ({ sunElev: 54, sunAz: 150 }),
};

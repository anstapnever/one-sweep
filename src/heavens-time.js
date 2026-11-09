// HEAVENS department: every behaviour of the sky as a pure function of film time.
import { WARLORD } from './layout.js';
import { clamp, smooth, invLerp, easeOut } from './util.js';

const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
export const SKY_AXIS = norm(WARLORD.skyPoint);          // where the clouds are pulled to (seen from the capybara)
export const ZENITH = [0, 1, 0];
const DEG = Math.PI / 180;

// The flick: one straight great circle through the sky behind the warlord (a great circle projects to a dead straight
// line on screen in any camera). C = the point on the circle where the cut starts; it races away from there both ways.
const CUT_C = norm([0.02, 0.42, -1]);
const CUT_ALONG = norm([1, 0.32, 0.12]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const CUT_N = norm(cross(CUT_C, CUT_ALONG));
export const CUT_CENTER = CUT_C;

// Gathers every number the sky shaders need at time t.
export function skyTimeline(t, C) {
  const out = {};
  // ---- flick
  const fl = t - C.flick;
  out.cutW = fl <= 0 ? 0 : (0.022 + 0.012 * clamp(fl / 5)) * (1 - Math.exp(-fl * 9));
  out.cutHead = fl <= 0 ? 0 : fl * 9.0;
  // ---- spiral: starts at gather; released by the sweep
  const s0 = smooth(invLerp(C.gather - 1.2, C.gather + 2.4, t));
  const rel = smooth(invLerp(C.sweep, C.sweep + 4.5, t));
  out.spiral = s0 * (1 - rel);
  const g = Math.max(0, t - C.gather);
  out.spiralRot = -0.05 * g - 0.03 * g * g;
  out.core = smooth(invLerp(C.ascend + 0.8, C.gather + 2.5, t)) * (1 - smooth(invLerp(C.sweep, C.sweep + 0.25, t)));
  // ---- the sweep: the clouds are shoved outward along one front
  const ts = t - C.sweep;
  let F = 0;
  if (ts > 0) {
    const a1 = C.tunnel - C.sweep, a2 = C.breakup - C.sweep, a3 = C.skyClear - C.sweep;
    if (ts < a1) F = 30 * easeOut(ts / a1, 2);
    else if (ts < a2) F = 30 + 26 * ((ts - a1) / (a2 - a1));
    else if (ts < a3) F = 56 + (FINAL_F - 56) * smooth((ts - a2) / (a3 - a2));
    else F = FINAL_F;
  }
  out.partF = F * DEG;
  out.partH = (ts > 0 ? 20 - 9 * smooth(invLerp(C.tunnel, C.skyClear, t)) : 20) * DEG;
  // the front starts centred on the sky point (the oculus) and ends centred on the zenith (a level horizon line all round)
  out.partAxisK = smooth(invLerp(C.tunnel, C.skyClear - 0.6, t));
  return out;
}
export const FINAL_F = 83.5;     // degrees from the zenith: the cloud wall's clean top edge sits 6.5 degrees over the horizon

// orbit cameras, shared with the orbit set, which composes its sun and the opening line from them.
// k runs 0..1 over the shot. Positions are absolute world coordinates.
import { ORBIT as _ORBIT } from './layout.js';
export function orbitCam(sid, k) {
  const [ox, oy, oz] = _ORBIT.origin;
  if (sid === 's21') {
    // near the marker's side of the planet, a little to its left and above, so the star sits right of centre over the disc
    const dx = 0.893, dy = 0.235, dz = -0.384, dist = 23500 - 1500 * k;
    return { pos: [ox + dx * dist, oy + dy * dist, oz + dz * dist], look: [ox + 420, oy - 520, oz + 900], fov: 30, near: 50, far: 200000 };
  }
  return { pos: [ox - 1200 + 400 * k, oy + 2600 + 300 * k, oz + 16700 - 1500 * k], look: [ox + 300, oy - 500, oz], fov: 37, near: 50, far: 200000 };
}

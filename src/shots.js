import { smooth, invLerp } from './util.js';
import { colorScript } from './colorscript.js';

// ONE SWEEP — 78.2 s, 24 fps. A shot-for-shot retelling (actions only) of a famous anime fight,
// fully redesigned: a capybara janitor sweeps a sunlit ring-city while an insect warlord fails to bother him.
export const FPS = 24;
export const DURATION = 78.2;
export const FRAMES = Math.round(FPS * DURATION);

// Story beats in film seconds. Every department and the soundtrack key off these.
export const CUES = {
  hookBeam: 0,        // frame 0: the white-lime beam stands in the sky behind him, debris already in the air, the capy mid-sweep
  rakeStart: 0.0,     // the beam rakes across the district
  rakeEnd: 1.2,       // beam stops; the cut line erupts behind it
  podHit: 1.75,       // a sky-tram pod falls and plants nose-first 1.4 m from him, he sweeps around it
  hookShock: 1.9,     // shock front reaches the promenade (fur, ears, dust); he keeps sweeping
  leafSnoot: 2.0,     // a leaf slaps onto his snoot
  leafBlow: 2.3,      // he puffs it off
  ship: 4.4,          // the hive ship fills the sky
  shadow: 8.4,        // the ship's/warlord's shadow slides over the tiles
  drop: 9.6,          // warlord streaks down
  land: 9.9,          // WARLORD LANDS. tiles crater, the leaf pile is blown apart (attempt 1 ruined)
  standUp: 11.7,      // rises out of its crouch
  boast: 13.4,        // arms spread, mantle unfurls, mandibles open
  eye: 15.0,          // ECU gem eye
  toeTap1: 17.8,      // the broom taps the warlord's toe: move
  toeTap2: 18.3,
  slashWind: 19.5,    // blade arm cocks back
  slash: 20.7,        // the slash: the skyline behind is cut
  slide: 21.7,        // upper halves of the towers start sliding
  strand: 23.7,       // one cut hair floats down past his face
  shedStart: 25.1,    // warlord roars, claws at its own chest
  shed: 26.0,         // ARMOUR BURSTS OFF, gems scatter, mantle flares, it grows from 9 m to 14 m
  barrage: 28.3,      // bolts pound the promenade: 28.3 .. 30.9
  rush: 31.1,         // dash through towers
  bladeHit: 32.5,     // blade hits him: white-out; the promenade becomes a crater (swap hidden by the flash)
  smokeClear: 33.7,   // smoke rolls off: lone pillar of swept tile
  sootShake: 35.3,    // he shakes off the soot like a wet animal
  yawn: 37.0,         // huge yawn
  flick: 39.9,        // one lazy flick of the broom: the warlord loses its right half, a line cuts the clouds
  regen: 41.4,        // lime veins knit it back: 41.4 .. 43.6
  ascend: 44.4,       // rockets into the sky, starts to burn white
  gather: 45.8,       // cloud deck starts spiralling toward the ring
  star: 46.8,         // orbit: a star ignites on the ring
  veins: 49.2,        // black frame, lime veins, the warlord's whole nervous system
  pileGone: 51.0,     // the wind tears away his pile; the last leaf rolls off the broom (attempt 3 ruined)
  citrusFall: 51.7,   // the citrus finally rolls off his head and is gone
  lookUp: 53.2,       // FOR THE FIRST TIME he looks up
  brows: 54.4,        // brows come down: the only change of expression in the film
  fire: 55.6,         // the planet-killer beam
  grip: 57.7,         // paws close on the handle
  silence: 59.0,      // total silence begins
  windup: 59.2,       // back foot sets, broom drawn back
  sweep: 61.0,        // ONE SWEEP
  tunnel: 61.8,       // beam parted around him, oculus of blue sky
  breakup: 64.2,      // warlord starts coming apart
  breakupEnd: 67.0,
  planet: 67.2,       // cloud cover opening around the whole planet
  skyClear: 71.6,     // final shot opens on the sky: blue to every horizon, gems falling like snow, then cranes down to him
  stump: 74.6,        // he looks at the broom stump
  leafEnd: 75.2,      // one leaf starts to fall
  leafLand: 76.9,     // leaf lands on the clean tile
  backToWork: 77.3,   // he sweeps it: the same sweep, the same framing as frame 0, the cut sky behind
  end: 78.2,
};

// set = which part of the world the shot needs. ref = times in ref/clip.mp4 (seconds).
const LIST = [
  ['s01', 'hook: beam behind him', 'prom', 1.3, '0-10, 90-100'],
  ['s02', 'pod falls', 'prom', 1.1, '-'],
  ['s03', 'quarter erupts', 'city', 2.0, '370-375'],
  ['s04', 'hive ship', 'sky', 3.0, '-'],
  ['s05', 'broom close, shadow', 'prom', 2.2, '-'],
  ['s06', 'landing', 'prom', 1.8, '75-80'],
  ['s07', 'tilt up the warlord', 'prom', 3.6, '5-10, 45-50'],
  ['s08', 'gem eye', 'warlord', 1.4, '10-20, 100'],
  ['s09', 'toe tap', 'prom', 2.8, '25-30'],
  ['s10', 'slash', 'prom', 2.2, '30-35'],
  ['s11', 'skyline slides', 'city', 2.0, '35-40'],
  ['s12', 'one hair', 'prom', 1.4, '55-60'],
  ['s13', 'armour bursts', 'prom', 3.4, '60-70'],
  ['s14', 'barrage', 'prom', 2.8, '165-195'],
  ['s15', 'rush and blade', 'prom', 2.2, '150-160'],
  ['s16', 'the pillar', 'crater', 3.6, '285-295'],
  ['s17', 'yawn', 'crater', 2.0, '295'],
  ['s18', 'flick', 'crater', 2.2, '430-440'],
  ['s19', 'regenerates', 'crater', 3.4, '260-290'],
  ['s20', 'ascent, burning', 'sky', 2.4, '488-495'],
  ['s21', 'star on the ring', 'orbit', 2.4, '494-500'],
  ['s22', 'veins', 'abstract', 1.2, '510-514'],
  ['s23', 'last leaf, then he looks up', 'crater', 4.8, '514-516'],
  ['s24', 'the beam', 'sky', 2.0, '516-520'],
  ['s25', 'grip', 'crater', 1.8, '524-527'],
  ['s26', 'wind-up', 'crater', 1.6, '528-530'],
  ['s27', 'ONE SWEEP', 'abstract', 1.2, '530-533'],
  ['s28', 'oculus', 'sky', 2.4, '533-539'],
  ['s29', 'warlord comes apart', 'sky', 3.0, '540-545'],
  ['s30', 'planet opens', 'orbit', 4.4, '546-553'],
  ['s31', 'blue horizon, one leaf', 'crater', 6.6, '554-575'],
];
export const SHOTS = [];
{
  let t = 0;
  for (const [id, name, set, d, ref] of LIST) { SHOTS.push({ id, name, set, start: +t.toFixed(3), end: +(t + d).toFixed(3), ref }); t += d; }
}

const CAMS = {}, LOOKS = {};
export function registerCams(mod) { Object.assign(CAMS, mod.CAMS || {}); Object.assign(LOOKS, mod.LOOKS || {}); }

// Placeholder framing per set until the owner sets a real camera.
const DEFAULT_CAM = {
  prom: { pos: [-5, 1.6, 12], look: [0, 3, -20], fov: 40 },
  city: { pos: [-200, 90, 160], look: [0, 40, -500], fov: 40 },
  sky: { pos: [0, 2, 40], look: [0, 500, -800], fov: 45 },
  crater: { pos: [8, 2, 12], look: [0, 1.2, 0], fov: 40 },
  warlord: { pos: [4, 9, 8], look: [4, 8.6, 0], fov: 30 },
  orbit: { pos: [0, 100000, 40000], look: [0, 100000, 0], fov: 30, near: 50, far: 200000 },
  abstract: { pos: [0, 2, 10], look: [0, 2, 0], fov: 40 },
};
const DEFAULT_LOOK = { sunElev: 54, sunAz: 150 };

export function shotAt(t) {
  for (let i = 0; i < SHOTS.length; i++) if (t < SHOTS[i].end) return i;
  return SHOTS.length - 1;
}
export const shotById = (id) => SHOTS.find((s) => s.id === id);

export function evalFrame(frame) {
  const t = frame / FPS;
  const si = shotAt(t);
  const sh = SHOTS[si];
  const lt = t - sh.start, dur = sh.end - sh.start;
  const st = { frame, t, si, sid: sh.id, shot: sh.name, set: sh.set, lt, dur, cues: CUES, fade: 0, fadeColor: '#ffffff', shadow: null, key: null };
  const lf = LOOKS[sh.id];
  st.look = { ...DEFAULT_LOOK, ...(lf ? lf(lt, dur, t, st) : {}) };
  // the lead's colour script has the last word on light and grade for every shot
  st.look = { ...st.look, ...colorScript(sh.id, lt, dur, t, st) };
  st.shadow = st.look.shadow ?? null;
  st.key = st.look.key ?? null;
  const cf = CAMS[sh.id];
  st.cam = cf ? cf(lt, dur, t, st) : DEFAULT_CAM[sh.set];
  if (st.look.fade != null) st.fade = st.look.fade;
  if (st.look.fadeColor) st.fadeColor = st.look.fadeColor;
  // no fade in. A short cut to black at the very end only.
  if (t > DURATION - 0.25) { st.fade = Math.max(st.fade, smooth(invLerp(DURATION - 0.25, DURATION - 0.05, t))); st.fadeColor = '#000000'; }
  return st;
}

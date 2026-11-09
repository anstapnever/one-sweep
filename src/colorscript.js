// Colour script of ONE SWEEP: every shot's light rig and grade (the lead has the last word here).
// Palettes (look.js): noon → dust after the landing → meteor (sky drained by the warlord) → clear (after the sweep).
// Each shot: key = sun or cheat, rim = back light that separates the subject, fill = bounce colour from the surroundings,
// energy = one light with a visible source (the mantle, the beam), grade = warm/cool split, contrast, blacks, light pools.
import { CUES as C } from './shots.js';
import { smooth, invLerp, clamp, lerp } from './util.js';
import { fxGrade, SWEEP_FRAMES } from './fx-timing.js';

const NOON = { contrast: 0.32, black: 0.025, split: 0.17, shadowTint: '#3a5fd0', highTint: '#ffe9c6', vignette: 0.22, bloom: 0.85 };
const DUST = { contrast: 0.28, black: 0.03, split: 0.2, shadowTint: '#5a4fa8', highTint: '#ffdeb0', vignette: 0.26, bloom: 0.9 };
const DARK = { contrast: 0.42, black: 0.05, split: 0.26, shadowTint: '#3020a0', highTint: '#fff0de', vignette: 0.38, bloom: 1.25 };
const CLEAR = { contrast: 0.26, black: 0.02, split: 0.14, shadowTint: '#2f6cd8', highTint: '#fff2cc', vignette: 0.14, bloom: 0.8 };
const LIME = '#ccff3e';
const mix = (a, b, k) => lerp(a, b, clamp(k));
const pulse = (t, t0, a, b) => (t < t0 ? 0 : Math.exp(-(t - t0) * b) * a);

// the warlord's mantle is an energy light after the shed
function mantle(st, kk = 1) {
  return { pos: [4.2, 9, -7.2], color: LIME, k: 0.5 * kk, radius: 42 };
}

const S = {
  // HOOK: noon, the beam behind him rims him in lime; the shock burns the frame for a moment
  s01(lt, d, t) {
    const hit = pulse(t, C.hookShock, 0.55, 5);
    return { pal: 'noon', sunElev: 50, sunAz: 138,
      rim: { dir: [-0.2, 0.25, -1], color: '#eeffb0', k: 0.75 + 0.25 * smooth(lt / 1) },
      fill: { dir: [0.5, -0.4, 0.7], color: '#ffd6b8', k: 0.5 },
      energy: { pos: [-40, 90, -500], color: LIME, k: 0.0, radius: 600 },
      exposure: 1.12 + hit, grade: { ...NOON, contrast: 0.36, spots: [{ x: 0.42, y: 0.5, r: 0.5, k: 0.05, color: '#fff2d8' }, { x: 0.05, y: 0.95, r: 0.5, k: -0.25 }] } };
  },
  s03: () => ({ pal: 'noon', sunElev: 48, sunAz: 140, exposure: 0.94, rim: { dir: [1, 0.4, -0.4], color: '#fff0c8', k: 0.5 }, grade: { ...NOON, contrast: 0.48, black: 0.05, split: 0.24 } }),
  // the ship: first darkening, the ship's own shadow. Cool underside.
  s04: () => ({ pal: { a: 'dust', b: 'noon', k: 0.8 }, sunElev: 40, sunAz: 120, rim: { dir: [0.5, 1, -0.3], color: '#ffe8c0', k: 0.8 }, fill: { dir: [0, 1, 0.3], color: '#6a78e8', k: 0.5 },
    grade: { ...NOON, contrast: 0.42, split: 0.28, black: 0.05, shadowTint: '#2a2c98', highTint: '#ffe0b0', spots: [{ x: 0.5, y: 0.12, r: 0.55, k: -0.28 }] } }),
  s05: (lt, d, t) => { const sh = smooth((t - C.shadow) / 0.8); return { pal: 'noon', sunElev: 52, sunAz: 146, key: [0.5, 0.9, 0.4], rim: { dir: [-1, 0.4, 0.2], color: '#ffefd2', k: 0.7 }, fill: { dir: [0, -1, 0.3], color: '#ffd8b0', k: 0.5 }, exposure: 1.15 - 0.3 * sh,
    grade: { ...NOON, split: mix(0.17, 0.34, sh), spots: [{ x: 0.5, y: 0.4, r: 0.45, k: 0.05 }] } }; },
  s06: (lt, d, t) => { const hit = pulse(t, C.land, 0.7, 7); return { pal: { a: 'dust', b: 'noon', k: 0.6 }, sunElev: 50, sunAz: 145, rim: { dir: [-0.6, 0.4, -0.8], color: '#ffe0b0', k: 0.8 }, fill: { dir: [0, -1, 0.3], color: '#ffc69a', k: 0.6 }, exposure: 1.1 + hit, grade: { ...DUST, invert: t > C.land - 0.02 && t < C.land + 0.1 ? 1 : 0, spots: [{ x: 0.5, y: 0.2, r: 0.6, k: -0.15 }] } }; },
  s07: () => ({ pal: { a: 'dust', b: 'noon', k: 0.55 }, sunElev: 46, sunAz: 130, rim: { dir: [0.3, 1, -0.2], color: '#ffe8c8', k: 0.9 }, fill: { dir: [0, -1, 0.4], color: '#ffb0a0', k: 0.7 }, energy: { pos: [6, 12, -6], color: LIME, k: 0.2, radius: 30 },
    grade: { ...DUST, contrast: 0.44, black: 0.06, spots: [{ x: 0.5, y: 0.82, r: 0.35, k: 0.12, color: '#ffd8a8' }] } }),
  s08: () => ({ pal: 'dust', sunElev: 42, sunAz: 120, rim: { dir: [1, 0.6, 0.2], color: '#fff0d8', k: 0.8 }, fill: { dir: [0, -1, 0], color: LIME, k: 0.45 }, grade: { ...DUST, contrast: 0.5, black: 0.08, vignette: 0.55 } }),
  s09: () => ({ pal: { a: 'dust', b: 'noon', k: 0.72 }, sunElev: 52, sunAz: 144, rim: { dir: [-0.6, 0.5, -0.5], color: '#ffe8c6', k: 0.7 }, fill: { dir: [0.4, -0.5, 0.7], color: '#ffd6b8', k: 0.5 }, grade: { ...NOON, split: 0.22 } }),
  s10: (lt, d, t) => { const hit = pulse(t, C.slash, 0.6, 8); return { pal: { a: 'dust', b: 'noon', k: 0.6 }, sunElev: 46, sunAz: 135, rim: { dir: [0.4, 0.7, -0.5], color: '#fff0c0', k: 0.9 }, fill: { dir: [0, -1, 0.5], color: '#ffb098', k: 0.6 }, energy: { pos: [-3, 12, -2], color: LIME, k: 0.6, radius: 26 }, exposure: 1.1 + hit, grade: { ...DUST, invert: t > C.slash && t < C.slash + 0.09 ? 1 : 0 } }; },
  s11: () => ({ pal: { a: 'dust', b: 'noon', k: 0.72 }, sunElev: 46, sunAz: 140, rim: { dir: [1, 0.4, -0.3], color: '#ffe8c0', k: 0.45 }, grade: { ...NOON, contrast: 0.36, split: 0.24 } }),
  s12: () => ({ pal: { a: 'dust', b: 'noon', k: 0.78 }, sunElev: 56, sunAz: 150, key: [0.45, 0.7, 0.55], rim: { dir: [-0.8, 0.3, -0.4], color: '#ffefd0', k: 0.6 }, fill: { dir: [0, -1, 0.6], color: '#ffcfaa', k: 0.55 }, grade: { ...NOON, split: 0.2, vignette: 0.32 } }),
  // the armour bursts: the mantle is the light of the frame
  s13: (lt, d, t) => { const b = smooth((t - C.shed + 0.15) / 0.4); const hit = pulse(t, C.shed, 0.8, 5); return { pal: { a: 'dust', b: 'noon', k: 0.45 }, sunElev: 44, sunAz: 130, rim: { dir: [0, 0.4, -1], color: LIME, k: 0.6 + 0.4 * b }, fill: { dir: [0, -1, 0.5], color: '#ff9a80', k: 0.55 }, energy: { pos: [4.2, 10, -7.2], color: LIME, k: 0.75 * b, radius: 40 }, exposure: 1.08 + hit, grade: { ...DUST, contrast: 0.46, black: 0.06, split: 0.26 } }; },
  s14: () => ({ pal: 'dust', sunElev: 38, sunAz: 120, rim: { dir: [0.2, 0.6, -0.8], color: '#ffe8b0', k: 0.6 }, fill: { dir: [0, -1, 0.3], color: '#ffb080', k: 0.7 }, energy: { pos: [0, 16, -3], color: LIME, k: 0.6, radius: 80 }, grade: { ...DUST, contrast: 0.5, black: 0.05 } }),
  s15: (lt, d, t) => { const w = smooth((t - C.bladeHit + 0.05) / 0.05); return { pal: 'dust', sunElev: 38, sunAz: 120, rim: { dir: [0.2, 0.6, -0.8], color: LIME, k: 0.8 }, energy: { pos: [-3, 12, -2], color: LIME, k: 0.3, radius: 50 }, exposure: 1.05 + 0.5 * w, grade: { ...DUST, contrast: 0.5, black: 0.05 }, fade: w * 0.92 }; },
  // the pillar: dust hanging in the air, a clean shaft of sun finds him
  s16: (lt, d, t) => { const clr = smooth((t - C.smokeClear) / 2.2); return { pal: { a: 'dust', b: 'noon', k: 0.35 + 0.3 * clr }, sunElev: 56, sunAz: 150, rim: { dir: [-0.5, 0.6, -0.5], color: '#fff0d0', k: 0.7 }, fill: { dir: [0, -1, 0.4], color: '#d8a080', k: 0.5 }, shafts: 0.9, grade: { ...DUST, contrast: 0.42, black: 0.05, spots: [{ x: 0.5, y: 0.45, r: 0.3, k: 0.16, color: '#ffe8c0' }, { x: 0.5, y: 0.95, r: 0.7, k: -0.3 }] } }; },
  s17: () => ({ pal: { a: 'dust', b: 'noon', k: 0.72 }, sunElev: 56, sunAz: 150, key: [0.4, 0.75, 0.55], rim: { dir: [-0.7, 0.4, -0.5], color: '#fff0d0', k: 0.7 }, fill: { dir: [0, -1, 0.5], color: '#ffc69a', k: 0.5 }, grade: { ...NOON, split: 0.22, vignette: 0.3 } }),
  s18: (lt, d, t) => { const hit = pulse(t, C.flick + 0.25, 0.7, 6); return { pal: { a: 'dust', b: 'noon', k: 0.65 }, sunElev: 50, sunAz: 140, rim: { dir: [-0.3, 0.5, -0.8], color: '#ffefc0', k: 0.8 }, fill: { dir: [0, -1, 0.5], color: '#ffbb98', k: 0.5 }, energy: { pos: [0, 7, -9], color: LIME, k: 0.55, radius: 32 }, exposure: 1.1 + hit, grade: { ...DUST, contrast: 0.42 } }; },
  s19: () => ({ pal: { a: 'dust', b: 'noon', k: 0.55 }, sunElev: 44, sunAz: 130, rim: { dir: [0.5, 0.7, -0.5], color: LIME, k: 0.8 }, fill: { dir: [0, -1, 0.3], color: '#ff9c80', k: 0.5 }, energy: { pos: [0, 7, -9], color: LIME, k: 0.7, radius: 30 }, grade: { ...DUST, contrast: 0.46, black: 0.07, vignette: 0.42 } }),
  // the sky is drained: visible reason is the clouds spiralling in, from here to the sweep
  s20: (lt, d, t) => { const k = smooth(invLerp(C.ascend, C.star, t)); return { pal: { a: 'noon', b: 'meteor', k: 0.4 + 0.5 * k }, sunElev: 42, sunAz: 130, rim: { dir: [0, 0.4, -1], color: LIME, k: 0.9 }, energy: { pos: [0, 200, -320], color: LIME, k: 0.45, radius: 1000 }, grade: { ...DARK, contrast: 0.42 } }; },
  s21: () => ({ pal: 'meteor', sunElev: 20, sunAz: 100, rim: { dir: [1, 0.2, 0], color: '#f2f8ff', k: 0.9 }, grade: { ...DARK, contrast: 0.5, black: 0.08, split: 0.2, vignette: 0.5 } }),
  s22: () => ({ pal: 'meteor', grade: { ...DARK, contrast: 0.7, black: 0.1, duo: 0.85, duoDark: '#040208', duoLight: '#d9ff46', vignette: 0.7, bloom: 1.5 } }),
  _s22old: () => ({ pal: { a: 'noon', b: 'meteor', k: 0.72 }, sunElev: 56, sunAz: 150, key: [0.2, 1, 0.3], rim: { dir: [0, 1, -0.3], color: LIME, k: 1 }, fill: { dir: [0, -1, 0.5], color: '#7a6ae0', k: 0.4 }, energy: { pos: [0, 200, -60], color: LIME, k: 0.12, radius: 700 }, grade: { ...DARK, contrast: 0.44, split: 0.24 } }),
  // the only time the top of his head is the key light: the growing star above him
  s23: (lt, d, t) => { const up = smooth((t - C.lookUp) / 1.2); return { pal: { a: 'noon', b: 'meteor', k: 0.84 }, sunElev: 70, sunAz: 150, key: [0, 1, 0.25], rim: { dir: [0, 1, -0.2], color: '#eef7b8', k: 0.32 + 0.33 * up }, fill: { dir: [0, -1, 0.7], color: '#6a5ae0', k: 0.65 }, energy: { pos: [0, 300, -100], color: LIME, k: 0.07 + 0.08 * up, radius: 900 }, grade: { ...DARK, contrast: 0.5, black: 0.07, vignette: 0.44 } }; },
  s24: (lt, d, t) => { const b = smooth((t - C.fire + 0.1) / 0.3); return { pal: 'meteor', rim: { dir: [0, 1, 0], color: LIME, k: 1 }, energy: { pos: [0, 400, -200], color: LIME, k: 0.7 * b, radius: 2400 }, exposure: 1.1 + 0.35 * b, grade: { ...DARK, contrast: 0.56, black: 0.08, vignette: 0.5 } }; },
  s25: () => ({ pal: 'meteor', key: [0.25, 1, 0.3], rim: { dir: [0, 1, 0], color: '#f6f2d4', k: 0.55 }, fill: { dir: [0, -1, 0.6], color: '#6a5ae0', k: 0.6 }, energy: { pos: [0, 200, -60], color: LIME, k: 0.16, radius: 900 }, grade: { ...DARK, contrast: 0.62, black: 0.1, vignette: 0.55 } }),
  s26: () => ({ pal: 'meteor', key: [0.25, 1, 0.3], rim: { dir: [0, 1, 0.2], color: '#f6f2d4', k: 0.65 }, fill: { dir: [0, -1, 0.5], color: '#5a4ad8', k: 0.6 }, energy: { pos: [0, 200, -60], color: LIME, k: 0.2, radius: 900 }, grade: { ...DARK, contrast: 0.64, black: 0.11, split: 0.3, vignette: 0.6 } }),
  // Impact sequence: negative -> white -> ink/lime duotone. Exact frames refined with the FX report.
  s27: (lt, d, t) => { const s = Math.round((t - C.sweep) * 24); const white = s >= SWEEP_FRAMES.white[0] && s <= SWEEP_FRAMES.white[1] ? 1 : 0; return { pal: 'meteor', energy: { pos: [0, 2, 4], color: '#ffffff', k: t < C.sweep ? 0.14 : 0.32, radius: 200 }, exposure: (t < C.sweep ? 1.0 : 1.02) + white * 0.8, fade: white * 0.98, fadeColor: '#ffffff', grade: { ...DARK, contrast: 0.7, black: 0.12, vignette: 0.55, bloom: 1.6 } }; },
  // air is rung clean
  s28: (lt, d, t) => { const k = smooth(lt / 1.8); return { pal: { a: 'meteor', b: 'clear', k: 0.3 + 0.7 * k }, sunElev: 60, sunAz: 150, rim: { dir: [0, 1, 0], color: '#ffffff', k: 0.6 }, exposure: 1.2 - 0.1 * k, grade: { ...CLEAR, contrast: 0.42, bloom: 1.2 } }; },
  s29: () => ({ pal: { a: 'noon', b: 'clear', k: 0.8 }, sunElev: 56, sunAz: 150, key: [0.5, 0.7, 0.5], rim: { dir: [-0.6, 0.5, -0.6], color: '#fff6d8', k: 0.8 }, energy: { pos: [0, 620, -320], color: LIME, k: 0.45, radius: 300 }, grade: { ...CLEAR, contrast: 0.4, split: 0.2, vignette: 0.26 } }),
  s30: () => ({ pal: 'clear', sunElev: 25, sunAz: 110, rim: { dir: [1, 0.2, 0], color: '#fff6d8', k: 1 }, grade: { ...CLEAR, contrast: 0.42, black: 0.06, vignette: 0.32, bloom: 1.15 } }),
  _s31a: () => ({ pal: 'clear', sunElev: 58, sunAz: 150, shafts: 1.0, rim: { dir: [-0.5, 0.5, -0.5], color: '#fff6d8', k: 0.7 }, fill: { dir: [0, -1, 0.5], color: '#ffd8b8', k: 0.5 }, grade: { ...CLEAR, spots: [{ x: 0.5, y: 0.2, r: 0.5, k: 0.05, color: '#fff2d0' }] } }),
  s31: () => ({ pal: 'clear', sunElev: 58, sunAz: 150, shafts: 0.5, key: [0.5, 0.75, 0.5], rim: { dir: [-0.6, 0.4, -0.6], color: '#fff6d8', k: 0.75 }, fill: { dir: [0, -1, 0.6], color: '#ffd2ac', k: 0.55 }, grade: { ...CLEAR, spots: [{ x: 0.42, y: 0.48, r: 0.32, k: 0.08, color: '#fff2d0' }, { x: 0.5, y: 0.98, r: 0.7, k: -0.18 }] } }),
};

S.s02 = S.s01;
export function colorScript(id, lt, d, t, st) {
  const f = S[id];
  const out = f ? f(lt, d, t, st) : {};
  // impact frames (negatives, lime-on-ink): FX owns the timing, active frames win over the shot's grade
  const hit = fxGrade(t);
  if (hit.invert || hit.duo) out.grade = { ...(out.grade ?? {}), ...hit };
  return out;
}

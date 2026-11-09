import { CUES as C, FPS } from './shots.js';

// Impact-frame timing, in one place, for the lead's colour script.
//   import { fxGrade } from './fx-timing.js';
//   grade: { ...base, ...fxGrade(t) }
// Everything is frames after the event (a = whole frames from the hit, on the film's 24 fps grid).
// invert means a true negative: pass invA = dark, invB = white (the engine's defaults keep white white).
const NEG = { invert: 1, invA: '#16071e', invB: '#ffffff', duo: 0 };
const PLAIN = { invert: 0, duo: 0 };
const DUO = { invert: 0, duo: 1, duoDark: '#050308', duoLight: '#d9ff46' };
const fr = (t) => Math.round(t * FPS);

// big hits of the barrage (seconds after CUES.barrage)
export const BARRAGE_BIG = [0, 0.875, 1.5, 2.5];
// effects are drawn on threes: a hit becomes visible on the first 1/8 s step at or after its time
export const snapHit = (t) => Math.ceil(t * 8 - 1e-6) / 8;

// the sweep, in frames after its first frame
export const SWEEP_FRAMES = { negA: [0, 1], white: [2, 4], duo: [5, 6] };

export function fxGrade(t) {
  const f = fr(t);
  const a = (cue) => f - fr(cue);
  // the slash: two negative frames
  if (a(C.slash) >= 0 && a(C.slash) <= 1) return NEG;
  // the armour bursts: frames 0-1 are a painted negative card (fx-cards), so the grade stays plain there; then lime on ink
  if (a(C.shed) >= 2 && a(C.shed) <= 3) return DUO;
  for (let i = 0; i < BARRAGE_BIG.length; i++) {
    const n = a(snapHit(C.barrage + BARRAGE_BIG[i]));
    if (n >= 0 && n <= 1) return NEG;
  }
  if (a(C.bladeHit) === -1) return NEG;
  const s = a(C.sweep);
  if (s >= SWEEP_FRAMES.negA[0] && s <= SWEEP_FRAMES.negA[1]) return NEG;
  if (s >= SWEEP_FRAMES.duo[0] && s <= SWEEP_FRAMES.duo[1]) return DUO;
  return PLAIN;
}

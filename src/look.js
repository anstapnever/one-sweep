import * as THREE from 'three';
import { G } from './glsl.js';
import { ENV } from './passes-env.js';
import { deg } from './util.js';

// Colour script for COLOSSUS: one blazing high-key afternoon over a white town.
//   k = 1    full sun: deep cobalt zenith, white cumulus, white stucco, blue domes
//   k = 0.5  dust: the gate is gone, ochre dust hangs in the air, the sun is a pale disk
// Shadows stay cool lavender-blue like classic cels; never muddy or grey.
export const PRESETS = {
  dust: {
    sunColor: '#fff0d6', sunStrength: 0.74, skyTint: '#f6ecdc', shadeTint: '#b8b0d8', deepTint: '#8a82bc', bounce: '#f0dcc0',
    sky: { zenith: '#5a86c8', mid: '#a9c2dc', warm: '#f4e6cc', cool: '#e2dcd2', cloudLit: '#fff8ee', cloudMid: '#f0e6da', cloudShade: '#bfb2c8' },
    fog: { warm: '#ecdcc0', cool: '#d8d0cc', density: 0.0011, mist: 0.3, mistHeight: 24 },
    grade: { lift: '#1a1420', gain: '#fffaf0', sat: 1.02 },
  },
  day: {
    sunColor: '#fff4dc', sunStrength: 1.0, skyTint: '#eaf4ff', shadeTint: '#a6b2ea', deepTint: '#7482d4', bounce: '#f2e8d8',
    sky: { zenith: '#1046c4', mid: '#3a92ee', warm: '#f2f8f8', cool: '#dcf0fa', cloudLit: '#ffffff', cloudMid: '#eef3fe', cloudShade: '#adbcf2' },
    fog: { warm: '#f2f6f6', cool: '#dcecf8', density: 0.00016, mist: 0.06, mistHeight: 30 },
    grade: { lift: '#0e1630', gain: '#fffdf8', sat: 1.12 },
  },
};

PRESETS.noon = PRESETS.day;
// the sky darkens as the warlord drinks the atmosphere; a burning white-lime star overhead
PRESETS.meteor = {
  sunColor: '#f4f8ff', sunStrength: 0.62, skyTint: '#b8c8ff', shadeTint: '#5a4ea8', deepTint: '#2c2470', bounce: '#a8a8b8',
  sky: { zenith: '#080a3a', mid: '#1c2a8c', warm: '#8aa0ee', cool: '#5a78d8', cloudLit: '#c8ccff', cloudMid: '#7a80d8', cloudShade: '#2c2c78' },
  fog: { warm: '#7a88d8', cool: '#3c4a9c', density: 0.0005, mist: 0.1, mistHeight: 24 },
  grade: { lift: '#04030e', gain: '#fffdf4', sat: 1.16 },
};
// after the sweep: the cleanest air of the film
PRESETS.clear = {
  sunColor: '#fff0d0', sunStrength: 1.08, skyTint: '#eaf7ff', shadeTint: '#8fb0ee', deepTint: '#5a7ad8', bounce: '#ffe0c4',
  sky: { zenith: '#0a50cc', mid: '#2aa2f2', warm: '#f8fcf4', cool: '#d8f4ff', cloudLit: '#ffffff', cloudMid: '#f2f8ff', cloudShade: '#b4c8f8' },
  fog: { warm: '#fbfaf0', cool: '#dcf2fc', density: 0.00008, mist: 0.03, mistHeight: 30 },
  grade: { lift: '#0a1230', gain: '#fffef8', sat: 1.2 },
};

const ca = new THREE.Color(), cb = new THREE.Color();
const mixC = (target, a, b, k) => target.copy(ca.set(a)).lerp(cb.set(b), k);
const mixN = (a, b, k) => a + (b - a) * k;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// look: { k, sunElev (deg), sunAz (deg, 0 = -Z north, + toward +X east), sunDisk, shafts, veil, mistMul, fogMul,
//         fogDensity, fogWarm, fogCool, exposure, paintRadius, inkWidth, key: [x,y,z], shadow: {center, radius, depth},
//         fade, fadeColor, cloudDrift }
// New in ONE SWEEP: pal: 'noon' | 'dust' | 'meteor' | 'clear', or { a, b, k } to mix two presets;
//   rim: {dir, color, k}, fill: {dir, color, k}, energy: {pos, color, k, radius},
//   grade: {contrast, black, split, shadowTint, highTint, invert, invA, invB, duo, duoDark, duoLight, spots: [{x,y,r,k,color}], vignette, bloom, grain}
const setDir = (u, v) => { if (v) u.value.set(...v).normalize(); };
export function applyLook(ctx, look) {
  let A = PRESETS.dust, B = PRESETS.day, k = clamp01(((look.k ?? 1) - 0.5) / 0.5);
  if (typeof look.pal === 'string') { A = B = PRESETS[look.pal]; k = 1; }
  else if (look.pal) { A = PRESETS[look.pal.a]; B = PRESETS[look.pal.b]; k = clamp01(look.pal.k); }
  const el = deg(look.sunElev ?? 34), az = deg(look.sunAz ?? 205);
  G.uSunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
  mixC(G.uSunColor.value, A.sunColor, B.sunColor, k);
  G.uSunStrength.value = mixN(A.sunStrength, B.sunStrength, k);
  mixC(G.uSkyTint.value, A.skyTint, B.skyTint, k);
  mixC(G.uShadeTint.value, A.shadeTint, B.shadeTint, k);
  mixC(G.uDeepTint.value, A.deepTint, B.deepTint, k);
  mixC(G.uBounce.value, A.bounce, B.bounce, k);

  ENV.uRain.value = 0;
  ENV.uRainbow.value = 0;
  ENV.uVeil.value = clamp01(look.veil ?? (1 - k) * 0.6);
  ENV.uWaterOn.value = 0;

  const sky = ctx.world && ctx.world.sky;
  if (sky) {
    const u = sky.material.uniforms;
    mixC(u.uZenith.value, A.sky.zenith, B.sky.zenith, k);
    mixC(u.uMid.value, A.sky.mid, B.sky.mid, k);
    mixC(u.uHorizonWarm.value, A.sky.warm, B.sky.warm, k);
    mixC(u.uHorizonCool.value, A.sky.cool, B.sky.cool, k);
    mixC(u.uCloudLit.value, A.sky.cloudLit, B.sky.cloudLit, k);
    mixC(u.uCloudMid.value, A.sky.cloudMid, B.sky.cloudMid, k);
    mixC(u.uCloudShade.value, A.sky.cloudShade, B.sky.cloudShade, k);
    u.uSunDisk.value = look.sunDisk ?? 1;
    u.uCloudDrift.value = look.cloudDrift ?? 0;
  }
  const e = ctx.engine;
  const a = e.mAtmos.uniforms;
  mixC(a.uFogWarm.value, A.fog.warm, B.fog.warm, k);
  mixC(a.uFogCool.value, A.fog.cool, B.fog.cool, k);
  if (look.fogWarm) a.uFogWarm.value.set(look.fogWarm);
  if (look.fogCool) a.uFogCool.value.set(look.fogCool);
  a.uFogDensity.value = (look.fogDensity ?? mixN(A.fog.density, B.fog.density, k)) * (look.fogMul ?? 1);
  a.uMist.value = mixN(A.fog.mist, B.fog.mist, k) * (look.mistMul ?? 1);
  a.uMistHeight.value = mixN(A.fog.mistHeight, B.fog.mistHeight, k);
  a.uShafts.value = look.shafts ?? 0;
  const f = e.mFinal.uniforms;
  mixC(f.uLift.value, A.grade.lift, B.grade.lift, k);
  mixC(f.uGain.value, A.grade.gain, B.grade.gain, k);
  f.uSat.value = mixN(A.grade.sat, B.grade.sat, k);
  f.uExposure.value = look.exposure ?? 1.12;
  const r = look.rim ?? {}, fi = look.fill ?? {}, en = look.energy ?? {}, gr = look.grade ?? {};
  setDir(G.uRimDir, r.dir); if (r.color) G.uRimColor.value.set(r.color); G.uRimK.value = r.k ?? 0;
  setDir(G.uFillDir, fi.dir); if (fi.color) G.uFillColor.value.set(fi.color); G.uFillK.value = fi.k ?? 0;
  if (en.pos) G.uEnergyPos.value.set(...en.pos); if (en.color) G.uEnergyColor.value.set(en.color);
  G.uEnergyK.value = en.k ?? 0; G.uEnergyRadius.value = en.radius ?? 40;
  f.uContrast.value = gr.contrast ?? 0; f.uBlack.value = gr.black ?? 0; f.uSplit.value = gr.split ?? 0;
  f.uShadowTint.value.set(gr.shadowTint ?? '#5a7ad0'); f.uHighTint.value.set(gr.highTint ?? '#fff0d8');
  f.uInvert.value = gr.invert ?? 0; f.uInvA.value.set(gr.invA ?? '#16071e'); f.uInvB.value.set(gr.invB ?? '#ffffff');
  f.uDuo.value = gr.duo ?? 0; f.uDuoDark.value.set(gr.duoDark ?? '#050308'); f.uDuoLight.value.set(gr.duoLight ?? '#d6ff4a');
  f.uVignette.value = gr.vignette ?? 0.16; f.uBloom.value = gr.bloom ?? 0.9; f.uGrain.value = gr.grain ?? 0.02;
  for (let i = 0; i < 4; i++) {
    const sp = gr.spots?.[i];
    f.uSpot.value[i].set(sp?.x ?? 0, sp?.y ?? 0, sp?.r ?? 0.3, sp?.k ?? 0);
    f.uSpotC.value[i].set(sp?.color ?? '#ffffff');
  }
}

// Environment passes: painted brushwork and atmosphere (water pass removed for COLOSSUS).
// Imported by engine.js; base uniforms are created in Engine's constructor.
// Extra uniforms for these passes go in ENV_UNIFORMS (merged by the engine).
import * as THREE from 'three';
import { G } from './glsl.js';

// Weather uniforms shared by the environment materials (sky, city, foliage)
// and the water / atmosphere passes. world.update(state) and applyLook() set them.
export const ENV = {
  uRain: { value: 0 },        // 0..1 sunshower intensity
  uWet: { value: 0 },         // 0..1 how soaked the city is
  uVeil: { value: 0 },        // 0..1 thin cloud over the sun
  uRainbow: { value: 0 },     // 0..1 rainbow growth
  uEnvTime: { value: 0 },     // film time on threes (drawn env FX)
  uOcean: { value: 1 },       // 1 = open-ocean drawing (km scale), 0 = plain water
  uOceanScale: { value: 1 },  // multiplies every swell and whitecap size
  uWaterOn: { value: 1 },     // mirrors look.water for the atmosphere pass
  uShipWake: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) },   // x, z, heading, length
  uSeaShadow: { value: new THREE.Vector4(0, 0, 0, 0) },    // x, z, heading, strength
  uSeaShadowB: { value: new THREE.Vector4(600, 160, 0, 0) },  // half length, half width
  uSeaCalm: { value: 0 },     // 0..1 flatten the swell (the held breath before the water mountain)
};

export const ENV_UNIFORMS = {
  paint: { tData: { value: null } },
  water: { uRain: ENV.uRain, uRainbow: ENV.uRainbow, uEnvTime: ENV.uEnvTime, uVeil: ENV.uVeil,
    uOcean: ENV.uOcean, uOceanScale: ENV.uOceanScale, uShipWake: ENV.uShipWake, uSeaShadow: ENV.uSeaShadow, uSeaShadowB: ENV.uSeaShadowB, uSeaCalm: ENV.uSeaCalm,
    // the robot's shadow map masks the caustics on the street floor
    uShadowMap: G.uShadowMap, uShadowMatrix: G.uShadowMatrix, uShadowOn: G.uShadowOn },
  atmos: { uRain: ENV.uRain, uVeil: ENV.uVeil, uEnvTime: ENV.uEnvTime, uWaterOn: ENV.uWaterOn,
    uHazeCool: { value: new THREE.Color('#cfe6f5') }, uHazeWarm: { value: new THREE.Color('#eef4f4') } },   // world.js shares the sky's own
};

export const NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float fbm2(vec2 p){ float s = 0., a = .5; for(int i = 0; i < 4; i++){ s += a*vnoise(p); p = p*2.03 + vec2(1.7, 9.2); a *= .5; } return s; }
`;

export const PAINT_FS = /* glsl */ `
uniform sampler2D tColor, tData;
uniform vec2 uRes;
uniform float uRadius, uStep, uS;
varying vec2 vUv;
out vec4 o;
${NOISE}
// Generalised anisotropic Kuwahara: 8 overlapping sectors of an elliptical brush
// aligned to a slowly turning stroke field; sectors are blended by how flat they are,
// so edges and small painted details survive while flat areas get gouache strokes.
// The brush shrinks on distant surfaces so windows and signs stay readable.
void main(){
  vec4 c0 = texture(tColor, vUv);
  if(c0.a < 0.5){ o = vec4(c0.rgb, 0.0); return; }
  vec2 px = 1.0 / uRes;
  vec2 fc = gl_FragCoord.xy / uS;
  float ang = (fbm2(fc / 140.0) - 0.5) * 3.2 + 0.4;
  vec2 dA = vec2(cos(ang), sin(ang)), dB = vec2(-dA.y, dA.x);
  float depth = texture(tData, vUv).b;
  float rad = uRadius * mix(0.72, 0.4, smoothstep(10.0, 120.0, depth)) * uStep;
  vec3 m[8]; vec3 s[8]; float n[8];
  for(int k = 0; k < 8; k++){ m[k] = c0.rgb; s[k] = c0.rgb * c0.rgb; n[k] = 1.0; }
  for(int r = 1; r <= 3; r++){
    float rr = rad * float(r) / 3.0;
    for(int k = 0; k < 16; k++){
      float a = float(k) * 0.39269908 + (r == 2 ? 0.19634954 : 0.0);
      vec2 off = (dA * cos(a) * 1.45 + dB * sin(a) * 0.8) * rr;
      vec4 t = texture(tColor, vUv + off * px);
      vec3 tc = t.rgb * t.a, tq = t.rgb * t.rgb * t.a;
      if(k / 2 * 2 == k){
        int i0 = k / 2;
        m[i0] += tc; s[i0] += tq; n[i0] += t.a;
      } else {
        int i0 = (k - 1) / 2, i1 = ((k + 1) / 2) % 8;
        m[i0] += tc * 0.5; s[i0] += tq * 0.5; n[i0] += t.a * 0.5;
        m[i1] += tc * 0.5; s[i1] += tq * 0.5; n[i1] += t.a * 0.5;
      }
    }
  }
  vec3 acc = vec3(0.0); float wsum = 0.0;
  for(int k = 0; k < 8; k++){
    vec3 mu = m[k] / n[k];
    vec3 v = abs(s[k] / n[k] - mu * mu);
    float sd = sqrt(v.r + v.g + v.b);
    float w = 1.0 / (1.0 + pow(sd * 22.0, 8.0));
    acc += mu * w; wsum += w;
  }
  vec3 col = wsum > 1e-5 ? acc / wsum : c0.rgb;
  // dry-brush grain and paper tooth
  mat2 R = mat2(dA.x, dA.y, dB.x, dB.y);
  vec2 sp = R * fc;
  float bristle = vnoise(vec2(sp.x / 26.0, sp.y / 2.2));
  float paper = vnoise(fc / 2.5) * 0.5 + vnoise(fc / 9.0) * 0.5;
  col *= 0.98 + 0.04 * bristle;
  col *= 0.99 + 0.02 * paper;
  o = vec4(col, 1.0);
}
`;

export const ATMOS_FS = /* glsl */ `
uniform sampler2D tColor, tData;
uniform vec3 uCamPos;
uniform mat4 uInvProj, uCamWorld;
uniform float uWaterLevel, uTime;
uniform vec3 uSunDir, uSunColor;
uniform float uSunStrength;
uniform vec3 uFogWarm, uFogCool;
uniform float uFogDensity, uMist, uMistHeight, uMistNear;
uniform vec2 uSunUV;
uniform float uShafts;
uniform float uRain, uVeil, uEnvTime, uWaterOn;
uniform vec3 uHazeCool, uHazeWarm;
varying vec2 vUv;
out vec4 o;
${NOISE}
void main(){
  vec4 col = texture(tColor, vUv);
  vec4 d = texture(tData, vUv);
  vec2 ndc = vUv * 2.0 - 1.0;
  vec4 vp = uInvProj * vec4(ndc, 1.0, 1.0);
  vec3 vdir = normalize(vp.xyz / vp.w);
  vec3 wdir = normalize(mat3(uCamWorld) * vdir);
  float cosv = -vdir.z;
  float vd = d.b;
  bool seaHit = false;
  if(wdir.y < -1e-4 && uWaterOn > 0.5){
    float t = (uWaterLevel - uCamPos.y) / wdir.y;
    if(t > 0.0){ vd = min(vd, t * cosv); seaHit = uWaterOn > 0.5; }
  }
  bool sky = vd > 8000.0 && !seaHit;
  float dist = sky ? 3000.0 : vd / max(cosv, 0.05);
  vec3 P = uCamPos + wdir * dist;
  float toSun = dot(wdir, uSunDir);
  float sunward = smoothstep(-0.3, 1.0, toSun);
  vec3 fogC = mix(uFogCool, uFogWarm, sunward);
  // rain haze: sunlit droplets brighten the air, strongest looking into the light
  float rainFog = uRain * (0.0007 + 0.0011 * pow(max(toSun, 0.0), 3.0));
  float fog = 1.0 - exp(-dist * (uFogDensity + rainFog));
  if(sky) fog *= 0.0;
  // height mist hugging the water, drifting in soft banks
  float hgt = max(P.y - uWaterLevel, 0.0);
  float bank = fbm2(P.xz * 0.03 + vec2(uTime * 0.012, uTime * 0.004));
  float mist = uMist * exp(-hgt / uMistHeight) * smoothstep(uMistNear, uMistNear + 40.0, dist) * (0.35 + 1.1 * bank);
  if(sky){
    // mist sits low on the horizon in front of the sky
    float hz = exp(-max(wdir.y, 0.0) * 18.0);
    mist = uMist * hz * 0.7;
  }
  float f = clamp(fog + mist, 0.0, 0.95);
  vec3 c = mix(col.rgb, fogC, f);
  // the far sea melts into the sky's own horizon colour, so no hard seam is left between them.
  // Only open sea and open sky take it: whatever stands in front stays crisp.
  float seaVD = seaHit ? (uWaterLevel - uCamPos.y) / wdir.y * cosv : 1e9;
  if(uWaterOn > 0.5 && (sky || (seaHit && (d.b > seaVD - 1.0 || d.b > 8000.0)))){
    float sunSide = dot(normalize(wdir.xz + 1e-5), normalize(uSunDir.xz + 1e-5)) * 0.5 + 0.5;
    vec3 hazeC = mix(uHazeCool, uHazeWarm, smoothstep(0.35, 1.0, sunSide));
    float hy = wdir.y;
    float hk = hy < 0.0 ? exp(-pow(-hy / 0.03, 1.3)) : 0.72 * exp(-pow(hy / 0.016, 1.5));
    c = mix(c, hazeC, hk);
  }
  // backlit rain glow: a soft bright bloom of air around the (off-screen) sun
  c += uSunColor * uRain * pow(max(toSun, 0.0), 8.0) * 0.08 * uSunStrength * (sky ? 0.3 : 1.0);

  // light shafts: march toward the sun over open-sky pixels; above the frame counts as sky
  vec3 camF = normalize(mat3(uCamWorld) * vec3(0.0, 0.0, -1.0));
  float facing = dot(camF, uSunDir);
  if(uShafts > 0.0 && facing > 0.05){
    vec2 toS = uSunUV - vUv;
    float L = length(toS);
    vec2 dirS = toS / max(L, 1e-4);
    float span = min(L, 0.7);
    float acc = 0.0;
    for(int i = 1; i <= 28; i++){
      vec2 uv = vUv + dirS * span * (float(i) / 28.0);
      float s;
      if(uv.y > 1.0) s = 1.0;
      else if(uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0) s = 0.6;
      else s = texture(tData, uv).b > 8000.0 ? 1.0 : 0.0;
      acc += s;
    }
    acc /= 28.0;
    float ang = atan(toS.y, toS.x);
    float streak = smoothstep(0.25, 0.95, vnoise(vec2(ang * 30.0, uEnvTime * 0.15)) * 0.7 + vnoise(vec2(ang * 80.0, 3.0)) * 0.4);
    float k = uShafts * uSunStrength * smoothstep(0.05, 0.4, facing) * (0.3 + 1.0 * uRain);
    float fall = smoothstep(1.5, 0.3, L);
    c += uSunColor * acc * streak * k * fall * (sky ? 0.14 : 0.32);
  }
  o = vec4(c, 1.0);
}
`;

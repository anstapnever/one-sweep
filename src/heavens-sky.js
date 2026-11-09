import * as THREE from 'three';
import { G, COMMON, MRT_OUT } from './glsl.js';

// The painted sky dome: gradient, cirrus, the planet's limb beyond the air, the ring as a bright arc, the sun.
// Space (the orbit set) is the same mesh with uSpace = 1. Clouds are drawn on top by heavens-clouds.js.
const base = (extra) => ({ ...G, ...extra });

export function heavensSkyMaterial() {
  const u = base({
    uZenith: { value: new THREE.Color('#2f6fd0') },
    uMid: { value: new THREE.Color('#6fb1ee') },
    uHorizonWarm: { value: new THREE.Color('#eef4f4') },
    uHorizonCool: { value: new THREE.Color('#cfe6f5') },
    uCloudLit: { value: new THREE.Color('#ffffff') },
    uCloudMid: { value: new THREE.Color('#eef2fa') },
    uCloudShade: { value: new THREE.Color('#a9b6dc') },
    uSunDisk: { value: 1 },
    uCloudDrift: { value: 0 },
    uSpace: { value: 0 },
    uSpiral: { value: 0 },
    uShafts: { value: 0 },
    uCore: { value: 0 },
    uAxis: { value: new THREE.Vector3(0, 1, 0) },
    uRingOn: { value: 1 },
    uPartF: { value: 0 }, uPartAxis: { value: new THREE.Vector3(0, 1, 0) },
  });
  const vs = /* glsl */ `
    varying vec3 vDir;
    void main(){
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vDir = normalize(wp.xyz - cameraPosition);
      vec4 mv = viewMatrix * wp;
      gl_Position = projectionMatrix * mv;
      gl_Position.z = gl_Position.w * 0.99999;
    }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform vec3 uZenith, uMid, uHorizonWarm, uHorizonCool, uCloudLit, uCloudMid, uCloudShade;
    uniform float uSunDisk, uCloudDrift, uSpace, uSpiral, uCore, uRingOn, uShafts;
    uniform vec3 uAxis, uPartAxis;
    uniform float uPartF;
    varying vec3 vDir;
    const float D2R = 0.0174532925;

    // ---- the ring, drawn as an arch: a circle in the sky concentric with the planet, its top toward the north
    const vec3 PLANET_C = vec3(0.1179, -0.4507, -0.8848);   // disk centre, below the northern horizon
    vec4 ringArc(vec3 d, vec3 sky){
      vec3 C = PLANET_C;
      float rho = 63.0 * D2R;
      vec3 e2 = normalize(vec3(0.0, 1.0, 0.0) - C * C.y);   // toward the apex
      vec3 e1 = normalize(cross(e2, C));
      float ang = acos(clamp(dot(d, C), -1.0, 1.0));
      float a = (rho - ang);                             // + is inside the ring toward the planet
      float b = atan(dot(d, e1), dot(d, e2));            // 0 at the apex
      float bn = abs(b) / (90.0 * D2R);
      if(bn > 2.2) return vec4(0.0);
      // perspective width: thin at the top, wide where it comes down at the horizon
      float hw = mix(0.8, 6.5, pow(min(bn * 0.75, 1.2), 2.4)) * D2R;
      float v = a / hw;
      if(abs(v) > 2.2) return vec4(0.0);
      // along-coordinate compressed like receding structure: segments grow toward the horizon
      float k = tan(clamp(b * 0.5, -1.2, 1.2));
      float seg = fract(k * 58.0);
      float sN = floor(k * 58.0);
      float rnd = hash12(vec2(sN, 3.0));
      vec3 c = mix(vec3(1.0, 0.98, 0.95), vec3(0.97, 0.91, 0.86), rnd * 0.6);
      // surface bands across the width
      float vv = v * 0.5 + 0.5;
      vec3 under = mix(uCloudShade, uZenith, 0.55);
      float body = smoothstep(1.02, 0.98, abs(v));
      // the near edge is a bright rim, the far edge drops into a blue-violet underside
      c = mix(under, c, smoothstep(-0.65, -0.55, v));
      c = mix(c, vec3(1.05, 1.03, 1.0), smoothstep(0.86, 0.92, v));
      c = mix(c, c * vec3(0.76, 0.85, 1.0), smoothstep(0.015, 0.0, abs(seg - 0.5) - 0.48) * 0.45);
      // turquoise glass stripe with a thin coral line next to it
      c = mix(c, vec3(0.45, 0.86, 0.9), step(0.34, vv) * step(vv, 0.42) * 0.8);
      c = mix(c, vec3(0.98, 0.62, 0.52), step(0.45, vv) * step(vv, 0.465) * 0.8);
      // the city band: sparkles scattered over the surface (terraces catching the sun)
      float cityBand = smoothstep(0.12, 0.2, vv) * smoothstep(0.34, 0.26, vv) + smoothstep(0.5, 0.56, vv) * smoothstep(0.86, 0.8, vv);
      vec2 sp = vec2(k * 420.0, vv * 16.0);
      float cell = hash12(floor(sp));
      float tw = 0.55 + 0.45 * sin(uTime * (2.0 + cell * 5.0) + cell * 60.0);
      float spark = step(0.87, cell) * smoothstep(0.42, 0.1, length(fract(sp) - 0.5));
      c = mix(c, vec3(1.25, 1.2, 1.05), spark * cityBand * tw);
      vec3 bandC = mix(uCloudShade, c, 0.94);
      // a thin companion ring outside the main band
      float thin = smoothstep(0.14, 0.05, abs(v - 1.62));
      float air = smoothstep(0.0, 11.0 * D2R, max(d.y, 0.0));        // melts into the haze down at the horizon
      float vis = mix(0.32, 1.0, air);
      vec3 col = mix(sky, bandC, body);
      col = mix(col, vec3(1.02, 1.0, 0.98), thin * 0.75);
      float glowA = exp(-abs(v) * 0.9) * 0.1;
      col += vec3(0.8, 0.9, 1.0) * glowA;
      return vec4(mix(sky, col, vis), 1.0);
    }

    // ---- the planet beyond the air: a giant pale disk whose top stands over the northern horizon
    vec3 planetLimb(vec3 d, vec3 sky){
      vec3 C = PLANET_C;
      float R = 41.5 * D2R;
      float ang = acos(clamp(dot(d, C), -1.0, 1.0));
      float x = (ang - R) / D2R;                        // degrees outside the disk (negative: inside)
      vec3 col = sky;
      vec3 limbC = mix(vec3(0.82, 0.93, 1.0), uCloudLit, 0.5);
      // outer glow, then a hard bright limb line
      col = mix(col, limbC, exp(-max(x, 0.0) / 2.6) * 0.5);
      if(x < 0.0){
        float depth = clamp(-x / 44.0, 0.0, 1.0);
        vec3 ocean = mix(mix(uMid, uZenith, 0.25), uMid, 0.4);
        // tangential coordinates over the disk
        vec3 t1 = normalize(cross(C, vec3(0.0, 1.0, 0.0)));
        vec3 t2 = cross(t1, C);
        vec2 p = vec2(dot(d, t1), dot(d, t2)) * (1.0 + depth * 2.2) * 3.2;
        // great curved cloud bands, cel-cut
        float bands = fbm2(p * vec2(1.0, 2.8) + vec2(fbm2(p * 1.3) * 1.3, 0.0));
        float wh = smoothstep(0.51, 0.53, bands);
        vec3 c = mix(ocean, mix(vec3(1.0), uCloudLit, 0.5), wh * 0.85);
        c = mix(c, c * vec3(0.84, 0.88, 1.0), smoothstep(0.47, 0.49, bands) * (1.0 - wh) * 0.6);
        // limb brightening and atmosphere thickness: airy, washed out, like a daytime moon
        c = mix(c, limbC, smoothstep(5.0, 0.0, -x) * 0.75);
        float air = 0.62;
        col = mix(col, c, air);
        col = mix(col, vec3(1.0), smoothstep(0.55, 0.0, -x) * 0.85);
      }
      return col;
    }

    vec3 space(vec3 d){
      vec3 col = mix(vec3(0.020, 0.030, 0.13), vec3(0.055, 0.075, 0.26), smoothstep(-0.6, 0.8, d.y + 0.4 * d.x));
      float neb = fbm3(d * 2.1 + 4.0);
      col += vec3(0.05, 0.05, 0.16) * smoothstep(0.5, 0.75, neb);
      // two sizes of stars
      for(int i = 0; i < 2; i++){
        float sc = i == 0 ? 180.0 : 340.0;
        vec3 q = d * sc;
        vec3 ip = floor(q);
        float h = hash13(ip + float(i) * 13.0);
        if(h > (i == 0 ? 0.992 : 0.98)){
          vec3 c = ip + vec3(hash13(ip + 1.0), hash13(ip + 2.0), hash13(ip + 3.0));
          float dd = length(q - c);
          float s = smoothstep(i == 0 ? 0.55 : 0.32, 0.0, dd);
          float tint = hash13(ip + 7.0);
          col += s * mix(vec3(0.75, 0.82, 1.1), vec3(1.1, 0.95, 0.8), tint) * (i == 0 ? 1.1 : 0.55);
        }
      }
      return col;
    }

    float outsideFront(vec3 d){
      if(uPartF <= 0.0) return 1.0;
      return smoothstep(uPartF, uPartF + 0.2, acos(clamp(dot(d, uPartAxis), -1.0, 1.0)));
    }

    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 d = normalize(vDir);
      vec3 s = normalize(uSunDir);
      if(uSpace > 0.5){
        writeOut(space(d), 1.0, vec3(0.0, 0.0, 1.0), 9000.0, 0.0);
        return;
      }
      float el = d.y;
      float elD = asin(clamp(el, -1.0, 1.0)) / D2R;
      float toSun = dot(d, s);
      vec2 hs = normalize(s.xz + 1e-5);
      float sunSide = dot(normalize(d.xz + 1e-5), hs) * 0.5 + 0.5;

      // ---- painted gradient: milky horizon -> saturated cerulean -> deep ultramarine zenith
      vec3 hor = mix(uHorizonCool, uHorizonWarm, smoothstep(0.35, 1.0, sunSide));
      float h = max(elD, 0.0);
      vec3 col = mix(hor, uMid, smoothstep(0.0, 18.0, h));
      col = mix(col, uZenith, smoothstep(9.0, 78.0, h));
      // broad, nearly invisible brush sweeps across the blue
      vec2 bp = d.xz / (abs(el) + 0.35);
      float sweep = fbm2(vec2(bp.x * 0.7 - bp.y * 0.5, bp.x * 0.5 + bp.y * 3.0) * 1.4 + 2.0) - 0.5;
      col *= 1.0 + sweep * 0.05 * smoothstep(0.0, 0.3, el);
      col = mix(col, mix(hor, vec3(1.0), 0.35), pow(max(toSun, 0.0), 14.0) * 0.5);

      // ---- beyond the air: planet and ring (only in the upper hemisphere; the sea of clouds hides the rest)
      if(uRingOn > 0.5){
        col = mix(planetLimb(d, col), col, smoothstep(0.95, 1.4, uPartF));
        vec4 ring = ringArc(d, col);
        if(ring.a > 0.0) col = ring.rgb;
      }
      // ---- high cirrus: long drawn wisps
      if(el > 0.06){
        vec2 cp = d.xz / (el + 0.28);
        vec2 cr = vec2(cp.x * 0.8 + cp.y * 0.6, -cp.x * 0.6 + cp.y * 0.8);
        float ci = fbm2(cr * vec2(0.8, 6.0) + 3.0) * fbm2(cr * 0.5 + 11.0);
        float wisp = smoothstep(0.26, 0.34, ci) * smoothstep(0.08, 0.3, el) * outsideFront(d);
        col = mix(col, mix(col, uCloudLit, 0.75), wisp * 0.32);
      }
      // the storm: spiral bands in the upper air around the sky point
      if(uSpiral > 0.001){
        vec3 b1 = normalize(cross(vec3(0.0, 1.0, 0.0), uAxis));
        vec3 b2 = cross(uAxis, b1);
        float th = acos(clamp(dot(d, uAxis), -1.0, 1.0));
        float phi = atan(dot(d, b2), dot(d, b1));
        float arms = sin(phi * 5.0 + th * 9.0 + uTime * 1.2) * 0.5 + 0.5;
        float streak = fbm2(vec2(phi * 3.0 + th * 8.0 + uTime * 0.6, th * 22.0));
        vec3 dark = mix(uCloudShade, uZenith, 0.5);
        col = mix(col, mix(dark, uCloudMid, 0.25), uSpiral * smoothstep(0.35, 0.6, arms * 0.6 + streak * 0.6) * 0.5 * outsideFront(d) * smoothstep(0.0, 0.3, th));
        col += vec3(0.3, 0.42, 0.06) * uCore * exp(-th * 6.0);
        col += vec3(0.7, 0.95, 0.3) * uCore * smoothstep(0.075, 0.03, th) * 0.8;
      }
      // ---- under the horizon: the deep shade between the billows of the sea of clouds
      float belowK = smoothstep(0.0, -0.03, el);
      vec3 deep = mix(mix(hor, uCloudShade, 0.55), mix(uCloudShade, uZenith, 0.35), smoothstep(0.0, -0.2, el));
      col = mix(col, deep, belowK);

      // ---- after the sweep: painted sun shafts standing in the clean blue
      if(uShafts > 0.001){
        vec3 sN = normalize(uSunDir);
        vec3 t1 = normalize(cross(sN, vec3(0.13, 0.97, 0.21)));
        vec3 t2 = cross(sN, t1);
        float ang = atan(dot(d, t2), dot(d, t1));
        float sum = sin(ang * 7.0 + 1.1) + 0.7 * sin(ang * 13.0 + 2.7) + 0.5 * sin(ang * 29.0 + 0.4);
        float ray = smoothstep(0.55, 0.72, sum * 0.5 + 0.5) * smoothstep(-0.2, 0.55, toSun) * smoothstep(0.0, 0.1, el);
        col = mix(col, col + vec3(0.42, 0.46, 0.42), ray * uShafts * 0.3);
      }
      // ---- sun: disk + glow
      float disk = smoothstep(0.99955, 0.9997, toSun) * uSunDisk;
      float halo = pow(max(toSun, 0.0), 320.0) * 0.9 + pow(max(toSun, 0.0), 40.0) * 0.16 + pow(max(toSun, 0.0), 8.0) * 0.05;
      col += mix(uHorizonWarm, vec3(1.0, 0.98, 0.92), 0.6) * halo * uSunDisk;
      col = mix(col, vec3(1.0, 0.98, 0.92) * 2.6, disk);
      writeOut(col, 1.0, vec3(0.0, 0.0, 1.0), 9000.0, 0.0);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.BackSide, depthWrite: false, transparent: false });
}

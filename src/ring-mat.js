import * as THREE from 'three';
import { G, COMMON, MRT_OUT, VERT_STD } from './glsl.js';
import { PAINT_LIGHT } from './bgmaterials.js';

// Ring department materials. All city surfaces are gouache: colour is built in screen-independent metres,
// in four scales, each faded by metres-per-pixel so far towers stay solid flat paint and near ones show chips and grain.

export const RU = {
  uT: { value: 0 },
  uBendK: { value: 1 / (2 * 14000) },   // the ring curves up: y += max(|x| - x0, 0)^2 * k
  uBendX0: { value: 650 },
  uHF: { value: null },                 // city height field (for painted cast shadows), RGB = heights in the 3 states
  uHFR: { value: new THREE.Vector4(-2000, -2500, 4000, 2600) },
  uHFSel: { value: new THREE.Vector3(1, 0, 0) },
  // promenade state
  uLand: { value: new THREE.Vector4(4.2, -7.2, 0, 0) },       // x, z, growth 0..1, age
  uPod: { value: new THREE.Vector4(-1.5, 1.15, 0, 0) },       // x, z, growth 0..1, age
  uCraterOn: { value: 0 },
  uShadowEdge: { value: new THREE.Vector4(0, 0, 0, 0) },      // z of the moving ship-shadow edge, strength
  // trench
  uTrA: { value: new THREE.Vector2(-620, -900) },
  uTrB: { value: new THREE.Vector2(520, -700) },
  uTrU: { value: 0 },                                         // how far along the line the beam has burned (0..1)
  uTrAge: { value: 0 },
};

const HELP = /* glsl */ `
float aaStep(float e, float x, float w){ return smoothstep(e - w, e + w, x); }
float box2(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float archSD(vec2 p, float w, float h0){
  float r = w * 0.5;
  float dr = box2(p - vec2(0.0, h0 * 0.5), vec2(r, h0 * 0.5));
  float dc = length(p - vec2(0.0, h0)) - r;
  return p.y > h0 ? dc : dr;
}
vec2 voro2(vec2 p){
  vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for(int y = -1; y <= 1; y++) for(int x = -1; x <= 1; x++){
    vec2 g = vec2(float(x), float(y)); vec2 o = hash22(i + g);
    vec2 r = g + o - f; float d = dot(r, r);
    if(d < d1){ d2 = d1; d1 = d; } else if(d < d2) d2 = d;
  }
  return vec2(sqrt(d1), sqrt(d2) - sqrt(d1));
}
// id of the nearest voronoi cell
vec2 voroId(vec2 p){
  vec2 i = floor(p), f = fract(p); float d1 = 8.0; vec2 id = i;
  for(int y = -1; y <= 1; y++) for(int x = -1; x <= 1; x++){
    vec2 g = vec2(float(x), float(y)); vec2 o = hash22(i + g);
    vec2 r = g + o - f; float d = dot(r, r);
    if(d < d1){ d1 = d; id = i + g; }
  }
  return id;
}
`;

const CITY_SHADOW = /* glsl */ `
uniform sampler2D uHF;
uniform vec4 uHFR;
uniform vec3 uHFSel;
float cityShadow(vec3 P, float bias){
  vec2 s = normalize(uSunDir.xz + 1e-5);
  float tanE = uSunDir.y / max(length(uSunDir.xz), 0.05);
  float d = 3.5;
  for(int i = 0; i < 16; i++){
    vec2 uv = (P.xz + s * d - uHFR.xy) / uHFR.zw;
    if(uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    float h = dot(texture(uHF, uv).rgb, uHFSel);
    if(h > P.y + d * tanE + bias) return 0.0;
    d *= 1.3;
  }
  return 1.0;
}
`;

const TERR_LIGHT = /* glsl */ `
// painted cel light with the rig on top. sunVis: all cast shadows I know about.
vec3 ringLight(vec3 albedo, vec3 N, vec3 NV, vec3 w, float sunVis, float ao){
  vec3 c = paintLight(albedo, N, w, sunVis, ao);
  // the rim light is for silhouettes of walls; on anything facing up it would wash whole floors out
  vec3 V = normalize(cameraPosition - w);
  vec3 lit = rigLight(albedo, c, N, N.y > 0.55 ? N : V, w);
  // whatever colour the rig throws (lime energy above all) only half lands on floors, so the pale stone stays stone
  return N.y > 0.55 ? c + (lit - c) * 0.5 : lit;
}
`;

function mat(uniforms, vs, fs, opts = {}) {
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide, ...opts });
}

// ---------------------------------------------------------------- towers
export function coralMaterial(o = {}) {
  const upper = !!o.upper;
  const u = { ...G, ...RU, uUpper: { value: upper ? 1 : 0 } };
  const defines = o.cut ? { CUT: 1 } : {};
  const vs = /* glsl */ `
    attribute vec4 aL;
    attribute vec4 iA, iCut, iHit, iMove;
    uniform float uT, uUpper, uBendK, uBendX0;
    varying vec3 vRest, vWorld, vNormalW, vNormalV;
    varying float vDepth;
    varying vec2 vUv, vUv0;
    varying vec4 vL;
    flat varying vec4 vA;
    flat varying vec4 vCutP, vCapP;
    flat varying vec2 vCutS;
    flat varying float vCutAge;
    flat varying vec3 vOrg;
    vec3 rotAxis(vec3 v, vec3 a, float s, float c){ return v * c + cross(a, v) * s + a * dot(a, v) * (1.0 - c); }
    void main(){
      mat4 im = instanceMatrix;
      vec3 rest = (modelMatrix * im * vec4(position, 1.0)).xyz;
      float sc = iA.w;
      vec3 nw = normalize(mat3(modelMatrix) * mat3(im) * (normal / sc));
      vec3 P = rest, N = nw;
      vCutP = iCut; vCapP = iCut; vCutS = vec2(0.0, iHit.z);
      float dt = uT - iHit.x;
      vCutS.x = (iHit.z > 0.5 && dt >= 0.0) ? 1.0 : 0.0;
      vCutAge = dt;
      vOrg = (modelMatrix * im * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #ifdef CUT
      if(uUpper > 0.5){
        if(iHit.z < 0.5 || dt < 0.0 || uT > iHit.w){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vec3 org = (modelMatrix * im * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float pivY = (iCut.w - iCut.x * org.x - iCut.z * org.z) / iCut.y;
        vec3 piv = vec3(org.x, pivY, org.z);
        float sl = max(uT - iHit.y, 0.0);
        vec3 off = vec3(0.0); float ang = 0.0; vec3 ax = vec3(0.0, 0.0, 1.0);
        if(iHit.z < 1.5){
          // the skyline: enormous, slow; slides on the cut plane, then the overhang takes over
          float s = 0.5 * iMove.w * sl * sl;
          off = iMove.xyz * s + iCut.xyz * 3.2 * smoothstep(0.0, 0.3, sl);
          float over = max(sl - 3.2, 0.0);
          off.y -= 0.5 * 11.0 * over * over;
          ax = normalize(cross(vec3(0.0, 1.0, 0.0), normalize(iMove.xyz + vec3(1e-4))));
          ang = 0.0008 * s + 0.018 * over * over;   // the tops keep parallel to the cut while they slide, so the line stays one line
        } else {
          // the hook: the beam throws the tops apart, away from the line
          off = iMove.xyz * dt * (18.0 + 40.0 * dt);
          off.y -= 0.5 * 17.0 * dt * dt;
          ax = normalize(cross(vec3(0.0, 1.0, 0.0), normalize(iMove.xyz + vec3(1e-4))));
          ang = (0.25 + iMove.w) * dt * dt * 0.35;
        }
        float sa = sin(ang), ca = cos(ang);
        P = rotAxis(rest - piv, ax, sa, ca) + piv + off;
        N = rotAxis(nw, ax, sa, ca);
        vec3 nc = rotAxis(iCut.xyz, ax, sa, ca);
        vCapP = vec4(nc, dot(nc, piv + off));
        vOrg = rotAxis(org - piv, ax, sa, ca) + piv + off;
      }
      #endif
      vRest = rest;
      float bx = max(abs(P.x) - uBendX0, 0.0);
      P.y += bx * bx * uBendK;
      vWorld = P;
      vNormalW = N;
      vNormalV = normalize(mat3(viewMatrix) * N);
      vec4 mv = viewMatrix * vec4(P, 1.0);
      vDepth = -mv.z;
      vUv = uv * sc; vUv0 = uv; vL = aL; vL.x *= sc; vL.y *= sc;
      vA = iA;
      gl_Position = projectionMatrix * mv;
    }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${PAINT_LIGHT}
    ${HELP}
    ${CITY_SHADOW}
    ${TERR_LIGHT}
    uniform float uUpper, uT;
    uniform mat4 projectionMatrix;
    varying vec3 vRest, vWorld, vNormalW, vNormalV;
    varying float vDepth;
    varying vec2 vUv, vUv0;
    varying vec4 vL;
    flat varying vec4 vA;
    flat varying vec4 vCutP, vCapP;
    flat varying vec2 vCutS;
    flat varying float vCutAge;
    flat varying vec3 vOrg;

    vec2 billows(vec2 p, float cs, float seed){
      vec2 ci = floor(p / cs);
      float best = -1.0; vec3 bn = vec3(0.0, 0.0, 1.0);
      for(int j = -1; j <= 1; j++) for(int i = -1; i <= 1; i++){
        vec2 c = ci + vec2(float(i), float(j));
        vec2 h = hash22(c + seed);
        vec2 ctr = (c + 0.2 + 0.6 * h) * cs;
        float r = cs * (0.62 + 0.3 * hash12(c + seed * 1.7));
        vec2 d = (p - ctr) / r;
        float q = dot(d, d);
        if(q >= 1.0) continue;
        float hz = sqrt(1.0 - q) * r / cs + hash12(c * 1.3 + seed) * 0.5;
        if(hz > best){ best = hz; bn = vec3(d, sqrt(1.0 - q)); }
      }
      float lit = dot(bn, normalize(vec3(-0.3, 0.78, 0.5)));
      return vec2(lit, best);
    }
    vec3 leafTone(float lit){
      vec3 c = vec3(0.17, 0.36, 0.3);
      c = mix(c, vec3(0.3, 0.52, 0.36), smoothstep(0.12, 0.18, lit));
      c = mix(c, vec3(0.5, 0.68, 0.38), smoothstep(0.55, 0.62, lit));
      c = mix(c, vec3(0.74, 0.84, 0.46), smoothstep(0.84, 0.88, lit));
      return c;
    }

    void main(){
      vec3 P = vRest;
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 N = normalize(vNormalW);
      vec3 NV = normalize(vNormalV);
      float front = gl_FrontFacing ? 1.0 : -1.0;
      vec3 w = vWorld;
      float depthOut = vDepth;
      bool cap = false;
      #ifdef CUT
      gl_FragDepth = gl_FragCoord.z;
      if(vCutS.x > 0.5){
        float rag = 0.0;
        if(vCutS.y > 1.5) rag = (fbm2(P.xz * 0.09 + vA.x * 13.0) - 0.5) * 22.0 + (vnoise(P.xz * 0.5) - 0.5) * 5.0;
        float side = dot(P, vCutP.xyz) - vCutP.w + rag;
        if(uUpper > 0.5){ if(side < 0.0) discard; } else { if(side > 0.0) discard; }
        if(front < 0.0){
          vec3 o = cameraPosition;
          vec3 d = normalize(w - o);
          vec3 n = vCapP.xyz;
          float den = dot(d, n);
          if(abs(den) > 1e-4){
            float tp = (vCapP.w - dot(o, n)) / den;
            vec3 hit = o + d * tp;
            // a real cap only if the ray enters through the cut: heading into the kept half, before this back wall, inside the tower's outline
            bool heading = uUpper > 0.5 ? den > 0.0 : den < 0.0;
            bool inside = length(hit.xz - vOrg.xz) < length(w.xz - vOrg.xz) * 1.03;
            if(tp > 0.0 && heading && inside && tp < length(w - o)){
              w = o + d * tp; cap = true;
              P = w;
              N = den < 0.0 ? n : -n;
              NV = normalize(mat3(viewMatrix) * N);
              vec4 mv = viewMatrix * vec4(w, 1.0);
              depthOut = -mv.z;
              vec4 cp = projectionMatrix * mv;
              gl_FragDepth = 0.5 * cp.z / cp.w + 0.5;
            }
          }
        }
      }
      #endif
      if(!cap && front < 0.0){ N = -N; NV = -NV; }

      float pxm = max(length(fwidth(w)), 1e-4);
      float kS = 1.0 - smoothstep(0.012, 0.05, pxm);   // grain and chips
      float kM = 1.0 - smoothstep(0.05, 0.4, pxm);     // seams, cracks
      float kW = 1.0 - smoothstep(0.16, 0.6, pxm);     // windows
      float seed = vA.x;
      float kind = floor(vL.z + 0.5);
      vec2 uv = vUv;
      float U = uv.x, V = uv.y;
      float dB = vL.x;
      float ov = vL.y;
      float lvl = vL.w;
      vec3 col;
      float ao = 1.0;
      float glass = 0.0;
      float gloss = 0.0;

      // ---- the tower's own colour story: white to blush coral, with a coral foot
      vec3 white = vec3(0.975, 0.945, 0.905), blush = vec3(0.965, 0.8, 0.72), deepC = vec3(0.93, 0.6, 0.52);
      vec3 body = mix(white, blush, vA.y * vA.y * 0.68);
      // a third of the city carries a colour of its own, all inside the white-and-coral family
      if(vA.z < 0.15) body = mix(body, vec3(0.92, 0.5, 0.42), 0.8);            // deep coral
      else if(vA.z < 0.27) body = mix(body, vec3(0.96, 0.72, 0.44), 0.78);     // apricot sand
      else if(vA.z < 0.35) body = mix(body, vec3(0.55, 0.83, 0.76), 0.68);     // celadon glaze
      float hy = P.y;
      body = mix(body, mix(body, blush, 0.55), (1.0 - smoothstep(0.0, 42.0, hy)) * 0.6);

      if(cap){
        // fresh-cut face: pale stone, a grid of sliced floors, hot lime edge for a moment
        vec2 q = P.xz;
        vec3 stone = vec3(0.86, 0.79, 0.74);
        stone *= 0.9 + 0.2 * fbm2(q * 0.08 + seed);
        float g1 = abs(fract(q.x / 7.5) - 0.5), g2 = abs(fract(q.y / 7.5) - 0.5);
        float grid = 1.0 - smoothstep(0.03, 0.08 + pxm * 0.06, min(g1, g2));
        stone = mix(stone, stone * vec3(0.46, 0.42, 0.5), grid * 0.8);
        float dots = 1.0 - smoothstep(0.08, 0.14, length(fract(q / 2.5) - 0.5));
        stone = mix(stone, stone * 0.7, dots * 0.5 * kW);
        if(vCutS.y < 1.5) stone *= vec3(0.5, 0.46, 0.5);    // from the side the skyline's cut face must read as a dark seam
        col = stone;
        kind = 99.0;
      } else if(kind == 0.0){
        col = body;
        if(lvl > 0.8) col = mix(col, deepC, 0.3);
        else if(lvl > 0.72) col = mix(col, vec3(0.95, 0.86, 0.68), 0.45);
        // large: patina washes, sun-bleached crowns of the walls, cool stains
        float w1 = fbm3(P * vec3(0.022, 0.012, 0.022) + seed * 11.0);
        col *= 0.86 + 0.2 * smoothstep(0.3, 0.72, w1);
        float kL = 1.0 - smoothstep(0.35, 1.8, pxm);
        float cRow = floor(V / 1.32);
        vec2 bk = vec2(U / (2.6 + 1.2 * hash12(vec2(cRow, seed))) + cRow * 0.5, cRow);
        float bkH = hash12(floor(bk) + seed * 3.0);
        col *= 1.0 + (bkH - 0.5) * 0.11 * kL;
        vec2 bg = floor(vec2(U / 9.0, V / 4.0) + vec2(fbm2(vec2(U, V) * 0.06) * 2.0));
        col *= 1.0 + (hash12(bg + seed) - 0.5) * 0.1 * kL;
        col = mix(col, col * vec3(1.02, 0.97, 0.93), smoothstep(0.55, 0.75, fbm2(vec2(U * 0.05, V * 0.03) + seed * 3.0)) * 0.8);
        // rain runs: from under each balcony, long tails of cool grey
        float sx = U * 0.24 + seed * 3.0;
        float sN = vnoise(vec2(sx, 0.0)) * 0.62 + vnoise(vec2(sx * 3.3, 2.0)) * 0.38;
        float runs = smoothstep(0.54, 0.82, sN) * smoothstep(0.0, 1.5, dB) * exp(-max(dB, 0.0) / (3.5 + 9.0 * vnoise(vec2(sx * 0.4, 5.0))));
        col = mix(col, col * vec3(0.8, 0.8, 0.88), runs * 0.55);
        // medium: plaster courses, seams, hairline cracks
        float course = abs(fract(V / 1.32 + (vnoise(vec2(U * 0.33, seed)) - 0.5) * 0.3) - 0.5);
        col = mix(col, col * vec3(0.87, 0.85, 0.87), (1.0 - smoothstep(0.0, 0.02 + pxm * 0.8, course)) * 0.55 * kM);
        float cr = abs(fbm2(vec2(U, V * 0.7) * 0.32 + seed) - 0.5);
        float crack = (1.0 - smoothstep(0.003, 0.003 + pxm * 0.6, cr)) * step(0.55, vnoise(vec2(U, V) * 0.18 + seed));
        col = mix(col, col * vec3(0.62, 0.58, 0.64), crack * kM * 0.85);
        // small: pitting, chips of plaster with a dark rim
        float pit = vnoise(vec2(U, V) * 34.0 + seed);
        col *= 1.0 + (pit - 0.5) * 0.06 * kS;
        float chipN = fbm2(vec2(U, V) * 2.9 + seed * 2.0);
        float chip = aaStep(0.76, chipN, pxm * 1.4 + 0.003);
        float chipR = aaStep(0.735, chipN, pxm * 1.4 + 0.003) - chip;
        col = mix(col, mix(col, vec3(0.86, 0.72, 0.62), 0.7), chip * kM);
        col = mix(col, col * 0.78, chipR * kM * 0.6);
        // shell-arched windows
        float sp = lvl < 0.34 ? 4.8 : lvl < 0.72 ? 3.6 : 7.2, fh = 3.7;
        float zone = smoothstep(0.39, 0.45, vnoise(vec2(U * 0.045 + seed * 9.0, V * 0.07 + seed * 3.0)));
        // no two storeys share a rhythm: some rows slide half a bay, some go in pairs with a blank pier, some are nearly solid wall
        float rowI = floor(V / fh);
        float rowH = hash12(vec2(rowI, seed * 17.0));
        vec2 cell = vec2(U / sp + rowH * step(0.42, lvl), V / fh);
        vec2 cid = floor(cell), f = fract(cell);
        float r1 = hash12(cid + seed * 13.1), r2 = hash12(cid + seed * 7.7 + 3.1), r3 = hash12(cid * 1.7 + seed);
        float pier = step(mod(cid.x, 3.0), 0.5) * step(0.5, fract(lvl * 7.3));
        float sparse = step(0.62, fract(rowI * 0.37 + lvl * 5.1)) * step(0.45, r2);
        vec2 lp = vec2((f.x - 0.5) * sp, f.y * fh - 0.7);
        float ww = lvl < 0.34 ? 1.9 : lvl < 0.72 ? 1.5 : 3.1, h0 = lvl < 0.72 ? 1.3 : 1.5;
        float arch = archSD(lp, ww, h0);
        float blank = step(0.72, r3) + step(dB, 0.55) + (1.0 - zone) + pier + sparse;
        float open = (1.0 - aaStep(0.0, arch, pxm)) * (1.0 - clamp(blank, 0.0, 1.0));
        float frame = (1.0 - aaStep(0.11, arch, pxm)) * (1.0 - open) * (1.0 - clamp(blank, 0.0, 1.0));
        float gy = (lp.y) / (h0 + ww * 0.5);
        vec3 inside = mix(vec3(0.1, 0.3, 0.42), vec3(0.17, 0.46, 0.55), gy) * (0.85 + 0.3 * r3);
        vec3 refl = mix(vec3(0.5, 0.82, 0.86), vec3(0.86, 0.96, 0.97), gy);
        float band = smoothstep(0.45, 0.55, gy + lp.x * 0.25 + (r2 - 0.5) * 0.4) * step(0.3, r1);
        vec3 gc = mix(inside, refl, band * 0.72);
        // closed shutters on about one window in six
        if(r1 < 0.17) gc = mix(vec3(0.84, 0.45, 0.38), vec3(0.3, 0.62, 0.58), step(0.5, fract(seed * 5.3))) * (0.92 + 0.14 * fract(lp.y * 3.2));
        float sillL = (1.0 - aaStep(0.06, abs(lp.y + 0.08), pxm)) * step(abs(lp.x), ww * 0.5 + 0.12) * (1.0 - clamp(blank, 0.0, 1.0));
        vec3 nearC = col;
        nearC = mix(nearC, nearC * 1.05 + 0.03, frame * 0.8);
        nearC = mix(nearC, gc, open);
        nearC = mix(nearC, col * 1.1 + 0.04, sillL * kM);
        float aaX = clamp(fwidth(cell.x), 0.001, 0.5), aaY = clamp(fwidth(cell.y), 0.001, 0.5);
        float rowB = smoothstep(0.25 - aaY, 0.25 + aaY, f.y) * (1.0 - smoothstep(0.72 - aaY, 0.72 + aaY, f.y));
        rowB = mix(rowB, 0.47, smoothstep(0.3, 0.5, aaY));
        float colB = smoothstep(0.32 - aaX, 0.32 + aaX, f.x) * (1.0 - smoothstep(0.68 - aaX, 0.68 + aaX, f.x));
        colB = mix(colB, 0.42, smoothstep(0.3, 0.5, aaX));
        float farK = mix((1.0 - clamp(blank, 0.0, 1.0)) * mix(0.55, 1.0, step(0.3, r1)), 0.62, smoothstep(0.14, 0.34, max(aaX, aaY)));
        vec3 farC = mix(col, vec3(0.3, 0.62, 0.7), rowB * zone * mix(colB, 0.55, smoothstep(0.08, 0.22, max(aaX, aaY))) * 0.72 * farK);
        col = mix(farC, nearC, kW);
        glass = open * kW;
        ao *= 1.0 - 0.1 * (1.0 - smoothstep(0.0, 1.2, dB));
      } else if(kind == 1.0){
        // the turquoise glass band: panes that mirror the sky
        float gy = fract(V / 3.0);
        vec2 cell = vec2(U / 1.8, V / 3.0);
        vec2 cid = floor(cell), f = fract(cell);
        float r1 = hash12(cid + seed), r2 = hash12(cid * 1.3 + seed + 3.3);
        float gs = fract(seed * 3.17);
        vec3 teal = mix(vec3(0.1, 0.56, 0.6), vec3(0.2, 0.76, 0.74), f.y);
        vec3 sky = mix(vec3(0.44, 0.82, 0.85), vec3(0.88, 0.97, 0.97), f.y);
        vec3 gFar = vec3(0.28, 0.76, 0.76);
        if(gs < 0.46){ teal = mix(vec3(0.5, 0.56, 0.68), vec3(0.68, 0.74, 0.82), f.y); sky = mix(vec3(0.78, 0.84, 0.92), vec3(0.97, 0.98, 1.0), f.y); gFar = vec3(0.72, 0.77, 0.86); }
        else if(gs < 0.62){ teal = mix(vec3(0.66, 0.36, 0.32), vec3(0.85, 0.52, 0.42), f.y); sky = mix(vec3(0.96, 0.72, 0.56), vec3(1.0, 0.92, 0.8), f.y); gFar = vec3(0.9, 0.62, 0.5); }
        // the sky mirrored across many panes as one shape, each pane knocked slightly out of true
        float mirror = fbm2(vec2(U * 0.035, V * 0.09) + seed * 7.0) + (r2 - 0.5) * 0.14 + (f.y - 0.5) * 0.16;
        float band = smoothstep(0.46, 0.52, mirror);
        col = mix(teal, sky, band * (0.62 + 0.38 * r1));
        float mul = 1.0 - aaStep(0.03, min(min(f.x, 1.0 - f.x) * 1.8, min(f.y, 1.0 - f.y) * 3.0), pxm);
        col = mix(col, vec3(0.92, 0.9, 0.84), mul * kM);
        col = mix(col, gFar, 1.0 - kW * 0.75);
        glass = 1.0; gloss = 1.0;
        if(gs > 0.86){
          // an open loggia: stone piers and shade behind them
          float pr = abs(fract(U / 3.6) - 0.5) * 3.6;
          float op = aaStep(0.42, pr, pxm);
          vec3 shade = mix(body * vec3(0.46, 0.4, 0.5), body * vec3(0.62, 0.54, 0.62), f.y);
          col = mix(body * (0.97 + 0.06 * fbm2(vec2(U, V) * 0.4 + seed)), shade, mix(0.72, op, kW));
          glass = 0.0; gloss = 0.0;
        }
      } else if(kind == 2.0){
        // the terrace: a garden on most, pale stone paving on some
        float isG = step(lvl, 0.62);
        vec2 q = P.xz;
        vec3 stone = mix(body, vec3(0.9, 0.82, 0.74), 0.5) * (0.94 + 0.08 * fbm2(q * 0.2 + seed));
        vec2 tq = fract(q / 1.4);
        stone = mix(stone, stone * 0.86, (1.0 - aaStep(0.05, min(min(tq.x, 1.0 - tq.x), min(tq.y, 1.0 - tq.y)), pxm)) * kM);
        vec2 b = billows(q, 1.3, seed);
        float lawn = smoothstep(0.34, 0.5, fbm2(q * 0.13 + seed * 5.0));
        vec3 gr = leafTone(b.x);
        gr = mix(vec3(0.42, 0.62, 0.38), gr, kW);
        col = mix(stone, gr, isG * lawn);
        ao *= 0.96;
      } else if(kind == 3.0){
        // coral trim
        vec3 tc = mix(vec3(0.95, 0.64, 0.55), vec3(0.97, 0.76, 0.66), vA.z);
        tc *= 0.92 + 0.14 * fbm2(vec2(U * 0.12, V * 0.4) + seed);
        float pan = abs(fract(U / 1.8) - 0.5);
        tc = mix(tc, tc * 0.82, (1.0 - smoothstep(0.0, 0.03 + pxm * 0.5, pan)) * kM);
        tc *= 1.0 + (vnoise(vec2(U, V) * 26.0 + seed) - 0.5) * 0.08 * kS;
        col = tc;
        // garden spilling over the edge
        float spill = smoothstep(0.42, 0.6, vnoise(vec2(U * 0.22 + seed * 4.0, lvl * 19.0))) * step(lvl, 0.62) * step(0.3, fract(lvl * 7.7));
        vec2 b = billows(uv, 0.8, seed + 2.0);
        col = mix(col, mix(vec3(0.34, 0.56, 0.36), leafTone(b.x), kW), spill * step(0.0, b.y));
      } else if(kind == 4.0){
        col = mix(body, vec3(0.97, 0.86, 0.78), 0.5);
        col *= 0.97 + 0.04 * vnoise(vec2(U, V) * 0.7);
        ao *= 0.9;
      } else if(kind == 5.0){
        // staghorn coral: ribs and pores
        vec3 base = mix(white, mix(blush, deepC, 0.35), vA.z);
        float rib = abs(fract(U / 2.6) - 0.5) * 2.0;
        float gr = 1.0 - smoothstep(0.0, 0.25 + pxm * 0.15, rib);
        base = mix(base, base * vec3(0.76, 0.7, 0.75), gr * 0.7 * kW);
        base *= 0.93 + 0.12 * fbm3(P * 0.05 + seed);
        vec2 pp = vec2(U / 1.3, V / 1.3);
        vec2 pf = fract(pp) - 0.5; vec2 pid = floor(pp);
        float pore = (1.0 - smoothstep(0.17, 0.22 + pxm * 0.3, length(pf + (hash22(pid + seed) - 0.5) * 0.3))) * kM;
        base = mix(base, base * vec3(0.55, 0.58, 0.7), pore * 0.6);
        base *= 1.0 + (vnoise(vec2(U, V) * 18.0) - 0.5) * 0.09 * kS;
        // ribbon of turquoise slit windows around the coral
        float sl = abs(fract(V / 8.2) - 0.42);
        float slit = aaStep(0.04, 0.06 - sl, pxm) * step(0.28, vnoise(vec2(U * 0.2, floor(V / 8.2) + seed)));
        col = mix(base, vec3(0.1, 0.62, 0.66), slit * 0.9 * (0.25 + 0.75 * kW));
        glass = slit * 0.6 * kW;
      } else if(kind == 6.0){
        // the crown: fish-scale glazed tiles, turquoise on some, coral on others
        vec3 dc = mix(vec3(0.15, 0.72, 0.72), vec3(0.96, 0.68, 0.58), step(0.45, fract(vA.z * 3.7)));
        vec2 q = vec2(U / 1.6, V / 1.0);
        q.x += floor(q.y) * 0.5;
        vec2 f = fract(q);
        float sc = length((f - vec2(0.5, 0.0)) * vec2(1.0, 0.85));
        dc = mix(dc, dc * 0.78, (1.0 - smoothstep(0.42, 0.5, sc)) * smoothstep(0.32, 0.42, sc) * kW);
        dc *= 0.93 + 0.14 * vnoise(floor(q) * 3.3 + seed);
        // ribs up the dome and two girdles: readable from the air, where the scales have melted away
        float mer = abs(fract(U / 8.4 + seed * 3.0) - 0.5);
        dc = mix(dc, dc * vec3(0.62, 0.74, 0.8), (1.0 - smoothstep(0.03, 0.05 + pxm * 0.12, mer)) * 0.75);
        float gird = abs(fract(V / 7.0 + seed) - 0.5);
        dc = mix(dc, vec3(0.97, 0.89, 0.78), (1.0 - smoothstep(0.03, 0.05 + pxm * 0.15, gird)) * 0.8);
        col = dc;
        gloss = 1.0;
      } else if(kind == 10.0){
        // a masonry dome: ribs running to the crown, ring courses, a band of lunette windows round the drum
        vec3 base = mix(mix(white, blush, 0.35), body, 0.7);
        base *= 0.9 + 0.16 * fbm3(P * 0.035 + seed);
        float bay = 3.6 * 5.0;
        vec2 dc = vec2(U / bay, V / 9.0);
        float rib = abs(fract(dc.x + 0.5) - 0.5) * bay;
        float ribW = 0.7 + 0.35 * smoothstep(0.0, 60.0, V);
        vec3 ribC = mix(vec3(0.95, 0.66, 0.56), vec3(0.9, 0.55, 0.47), vA.z);
        base = mix(base, base * vec3(0.82, 0.78, 0.84), (1.0 - smoothstep(ribW, ribW + 0.5 + pxm, rib)) * 0.65);
        base = mix(base, ribC, 1.0 - smoothstep(ribW * 0.55, ribW * 0.55 + pxm, rib));
        float ringC = abs(fract(dc.y) - 0.5) * 9.0;
        base = mix(base, ribC * 1.02, 1.0 - smoothstep(0.32, 0.32 + pxm, ringC));
        base = mix(base, base * 0.8, (1.0 - smoothstep(0.32, 0.8 + pxm, ringC)) * 0.5);
        // shingle courses between ribs, medium scale
        float sh = abs(fract(V / 1.3) - 0.5);
        base = mix(base, base * vec3(0.88, 0.85, 0.88), (1.0 - smoothstep(0.03, 0.08 + pxm * 0.8, sh)) * kM * 0.8);
        base *= 1.0 + (hash12(floor(vec2(U / 2.1 + floor(V / 1.3) * 0.5, V / 1.3)) + seed) - 0.5) * 0.12 * kM;
        // lunettes in the second course
        float row = floor(dc.y);
        if(row < 4.0){
          vec2 lc = vec2((fract(dc.x) - 0.5) * bay, (fract(dc.y) - 0.15) * 9.0);
          float lw = 7.2 - row * 0.9;
          float lu = archSD(lc, lw, 2.6);
          float lOpen = 1.0 - aaStep(0.0, lu, pxm);
          float lFrame = (1.0 - aaStep(0.28, lu, pxm)) * (1.0 - lOpen);
          base = mix(base, ribC, lFrame);
          base = mix(base, mix(vec3(0.1, 0.34, 0.44), vec3(0.45, 0.82, 0.84), smoothstep(0.1, 0.9, lc.y / 6.0)), lOpen);
          glass = lOpen;
        }
        col = base;
      } else if(kind == 7.0){
        // twisted shell spire: white ribs, a helical band of glass
        float H = max(vL.x / vA.w, 1.0);
        float k = vUv0.y / H;
        float lobes = vL.y / vA.w;
        float tw = lvl;
        float s = 0.5 + 0.5 * cos(lobes * 6.2831853 * vUv0.x + k * tw * 6.2831853);
        vec3 base = body;
        base *= 0.93 + 0.12 * fbm3(P * 0.04 + seed);
        float fl = abs(fract(V / 3.6) - 0.5);
        base = mix(base, base * vec3(0.83, 0.82, 0.88), (1.0 - smoothstep(0.03, 0.06 + pxm * 0.3, fl)) * kW * 0.8);
        float grv = 1.0 - smoothstep(0.05, 0.24 + fwidth(s) * 3.0, s);
        base = mix(base, base * vec3(0.74, 0.7, 0.8), grv * 0.85);
        float gl = aaStep(0.32, 0.5 + (0.035 - s) * 6.0, fwidth(s) * 3.0) * step(0.34, fract(V / 11.0));
        vec3 g2 = mix(vec3(0.34, 0.5, 0.62), vec3(0.78, 0.9, 0.94), smoothstep(0.42, 0.6, vnoise(vec2(V * 0.08, U * 2.0))));
        float fl2 = 1.0 - smoothstep(0.02, 0.05 + pxm * 0.3, fl);
        g2 = mix(g2, g2 * 0.7, fl2 * kW);
        col = mix(base, g2, gl);
        glass = gl; gloss = gl;
      } else {
        col = body;
      }

      // ---- hanging gardens: green drapes under the balconies of some levels
      if((kind == 0.0 || kind == 1.0) && !cap && lvl < 0.62){
        float gx = U * 0.42 + seed * 6.0;
        float colN = vnoise(vec2(gx * 0.5, lvl * 40.0));
        float len = (0.4 + 6.2 * colN * colN) * smoothstep(0.32, 0.52, vnoise(vec2(gx * 0.4 + 3.0, lvl * 13.0)));
        float rag = (vnoise(vec2(gx * 2.5, V * 0.3)) - 0.5) * 1.1 + smoothstep(0.62, 0.9, vnoise(vec2(gx * 2.0, 5.0))) * 2.4;
        float field = len + rag * step(0.2, len) - dB;
        vec2 bl = billows(vec2(U, V), 0.62, seed + 5.0);
        float ivy = mix(step(0.0, field), step(0.0, field + (bl.y - 0.55) * 0.9) * step(0.0, bl.y), kW);
        vec3 ivyC = mix(vec3(0.33, 0.56, 0.36), leafTone(bl.x), kW);
        // flowers: pink coral vine
        vec2 fc = floor(vec2(U, V) * 2.0);
        float fl = step(0.93, hash12(fc + seed)) * step(length(fract(vec2(U, V) * 2.0) - 0.5), 0.2);
        ivyC = mix(ivyC, vec3(0.98, 0.56, 0.62), fl * kM);
        col = mix(col, ivyC, ivy);
        glass *= 1.0 - ivy; gloss *= 1.0 - ivy;
      }

      // ---- large scale, everywhere: sun bleach near the top of tall things, cool at the feet
      if(!cap){
        col *= mix(vec3(0.94, 0.96, 1.03), vec3(1.03, 1.01, 0.97), smoothstep(0.0, 60.0, hy));
      }

      // ---- cast shadows: the balcony above (exact), then the rest of the city (height field)
      float lipLit = 1.0;
      if((kind == 0.0 || kind == 1.0 || kind == 5.0) && !cap && ov > 0.0){
        vec2 nh = normalize(N.xz + 1e-4), sh = normalize(uSunDir.xz + 1e-4);
        float along = dot(nh, sh);
        float tanE = uSunDir.y / max(length(uSunDir.xz), 0.05);
        float reach = max(dB, 0.0) / max(tanE, 0.02) * max(along, 0.0);
        lipLit = aaStep(ov, reach, 0.06 + pxm);
      }
      float cs = cap ? cityShadow(P, 3.0) : cityShadow(P, 2.5 + pxm * 0.6);
      float sunVis = lipLit * cs;
      vec3 outc = ringLight(col, N, NV, w, sunVis, ao);

      if(cap){
        // the cut is still hot for a moment: white-lime at once, cooling through yellow to scorched stone
        float heat = exp(-max(vCutAge, 0.0) * (vCutS.y > 1.5 ? 1.5 : 0.62));
        outc = mix(outc, mix(vec3(0.55, 0.42, 0.3), vec3(0.95, 1.0, 0.55), heat) * (1.0 + heat * 1.2), smoothstep(0.02, 0.9, heat) * 0.95);
      }

      #ifdef CUT
      if(vCutS.x > 0.5 && !cap){
        float dist = abs(dot(P, vCutP.xyz) - vCutP.w);
        float heat = exp(-max(vCutAge, 0.0) * (vCutS.y > 1.5 ? 1.6 : 0.62));
        float hot = smoothstep(0.02, 0.18, heat);
        float band = 1.0 - smoothstep(0.0, 0.9 + 3.6 * heat + pxm * 1.5, dist);
        outc = mix(outc, vec3(1.0, 1.0, 0.62) * 1.9, band * hot * 0.95);
        // the scar stays after the glow: one thin dark line, the same height on every tower
        if(vCutS.y < 1.5){
          // one dark slit, never thinner than a couple of pixels however far the tower is; a pale lip under it
          float w0 = max(0.6, pxm * 1.3);
          float w1 = w0 + max(1.1, pxm * 1.5);
          float lip = 1.0 - smoothstep(w1, w1 + pxm, dist);
          outc = mix(outc, mix(vec3(1.0, 0.96, 0.84) * 1.2, vec3(1.0, 1.0, 0.7) * 1.8, hot), lip);
          float slit = 1.0 - smoothstep(w0, w0 + pxm, dist);
          outc = mix(outc, vec3(0.13, 0.1, 0.17), slit * (1.0 - hot * 0.85));
        } else {
          float scar = 1.0 - smoothstep(0.35, 1.1 + pxm * 2.0, dist);
          outc = mix(outc, outc * vec3(0.4, 0.36, 0.42), scar * (1.0 - hot));
        }
      }
      #endif
      outc = mix(outc, col * mix(uSkyTint, vec3(1.0), 0.5) * 0.92, glass * 0.55);
      vec3 V3 = normalize(cameraPosition - w);
      float fr = pow(1.0 - clamp(dot(N, V3), 0.0, 1.0), 3.0);
      outc += vec3(0.75, 0.92, 1.0) * fr * gloss * 0.2 * uSunStrength;
      vec3 Rv = reflect(-V3, N);
      float spec = pow(max(dot(Rv, uSunDir), 0.0), 24.0);
      outc += uSunColor * step(0.4, spec) * gloss * sunVis * 0.5 * uSunStrength;

      // near towers are drawn as inked cel (each its own id so silhouettes get a line); beyond that the painterly brush
      float cid = depthOut < 700.0 ? 1.0 + floor(seed * 13.0) : 0.0;
      writeOut(outc, 1.0, NV, depthOut, cid);
    }
  `;
  return mat(u, vs, fs, { defines, side: THREE.DoubleSide });
}

// ---------------------------------------------------------------- the floor: promenade tiles + city ground
export function floorMaterial() {
  const u = { ...G, ...RU };
  const vs = /* glsl */ `
    uniform float uBendK, uBendX0;
    varying vec3 vRest, vWorld, vNormalW, vNormalV;
    varying float vDepth;
    varying vec2 vUv;
    void main(){
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vRest = wp.xyz;
      float bx = max(abs(wp.x) - uBendX0, 0.0);
      wp.y += bx * bx * uBendK;
      vWorld = wp.xyz;
      vNormalW = vec3(0.0, 1.0, 0.0);
      vNormalV = normalize(mat3(viewMatrix) * vNormalW);
      vec4 mv = viewMatrix * wp; vDepth = -mv.z; vUv = uv;
      gl_Position = projectionMatrix * mv;
    }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${PAINT_LIGHT}
    ${HELP}
    ${CITY_SHADOW}
    ${TERR_LIGHT}
    uniform vec4 uLand, uPod, uShadowEdge;
    uniform float uCraterOn, uT, uTrU, uTrAge;
    uniform vec2 uTrA, uTrB;
    vec3 gEmit = vec3(0.0);
    varying vec3 vRest, vWorld, vNormalW, vNormalV;
    varying float vDepth;
    varying vec2 vUv;

    // ---- one tile of honed coral limestone. p metres in the tile, size sz, id per tile
    vec3 stoneTile(vec2 p, vec2 sz, vec2 id, float pxm, float clean){
      float h1 = hash12(id), h2 = hash12(id + 5.3), h3 = hash12(id * 1.7 + 9.1);
      vec3 c = mix(vec3(0.965, 0.86, 0.79), vec3(0.975, 0.905, 0.85), h1);
      c = mix(c, vec3(0.945, 0.79, 0.72), step(0.74, h2) * 0.55);
      c = mix(c, vec3(0.985, 0.94, 0.89), step(0.9, h3) * 0.7);
      float kA = 1.0 - smoothstep(0.004, 0.018, pxm);   // the macro scale: grain, pores
      float kB = 1.0 - smoothstep(0.012, 0.06, pxm);   // vein and shell scale
      float kC = 1.0 - smoothstep(0.05, 0.3, pxm);     // tile scale
      vec2 q = p + id * 3.17;
      float ang = h1 * 6.2831; mat2 R = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
      vec2 rq = R * q;
      // soft sedimentary bands drifting across each slab
      float lay = fbm2(vec2(rq.x * 0.9, rq.y * 5.5) + h2 * 20.0);
      c = mix(c, c * vec3(0.97, 0.925, 0.89), smoothstep(0.42, 0.66, lay) * 0.72 * kC);
      c = mix(c, c * vec3(1.03, 1.02, 1.0) + 0.012, smoothstep(0.68, 0.82, lay) * 0.5 * kC);
      // veins of paler calcite with one darker side
      vec2 wq = rq + vec2(fbm2(rq * 2.1 + 3.0), fbm2(rq * 2.1 + 8.0)) * 0.18;
      float veinF = abs(fbm2(wq * 2.2 + h3 * 13.0) - 0.5);
      float veinW = 0.0035 + 0.006 * smoothstep(0.45, 0.8, vnoise(wq * 1.4 + 2.0));
      float vein = (1.0 - smoothstep(veinW, veinW + pxm * 0.9, veinF)) * step(0.62, vnoise(rq * 0.9 + h2 * 7.0));
      c = mix(c, vec3(1.0, 0.975, 0.94), vein * 0.5 * kB);
      float veinS = (1.0 - smoothstep(veinW * 2.2, veinW * 2.2 + pxm * 0.9, veinF + 0.0015)) - vein;
      c = mix(c, c * vec3(0.9, 0.78, 0.75), clamp(veinS, 0.0, 1.0) * 0.45 * kB);
      // mottled honed stone: soft clouds at several sizes, drawn low-contrast (the eye reads them as depth in the stone)
      float m1 = fbm2(rq * 11.0 + h1 * 30.0), m2 = fbm2(rq * 37.0 + h2 * 11.0);
      c *= 1.0 + (smoothstep(0.34, 0.66, m1) - 0.5) * 0.07 * kB;
      c *= 1.0 + (smoothstep(0.38, 0.62, m2) - 0.5) * 0.05 * kA;
      if(kB > 0.01){
        // the stone is an aggregate: angular chips of shell and coral set in the matrix, honed flat. Crisp shapes, drawn, in two sizes
        vec2 aq = rq * 30.0 + (vec2(vnoise(rq * 41.0), vnoise(rq * 41.0 + 3.0)) - 0.5) * 0.7;
        vec2 av = voro2(aq); float ar = hash12(voroId(aq) + h2 * 30.0);
        float chipA = smoothstep(0.05, 0.08 + pxm * 30.0, av.y) * step(0.42, ar);
        vec3 cc = ar < 0.66 ? c * vec3(1.05, 1.03, 0.99) + 0.022 : ar < 0.86 ? c * vec3(0.96, 0.87, 0.83) : ar < 0.955 ? mix(c, vec3(0.9, 0.67, 0.58), 0.55) : ar < 0.994 ? mix(c, vec3(0.78, 0.74, 0.8), 0.7) : mix(c, vec3(0.32, 0.68, 0.68), 0.75);
        c = mix(c, cc, chipA * 0.62 * kB);
        if(kA > 0.01){
          vec2 aq2 = rq * 92.0 + 5.0;
          vec2 av2 = voro2(aq2); float ar2 = hash12(voroId(aq2) + h3 * 17.0);
          float chipB = smoothstep(0.06, 0.1 + pxm * 92.0, av2.y) * step(0.58, ar2);
          c = mix(c, ar2 < 0.82 ? c * 1.06 + 0.02 : c * vec3(0.8, 0.68, 0.66), chipB * 0.62 * kA);
        }
        // fossil coral: little polyps, pores that are irregular (warped voronoi), sparse
        vec2 wq2 = rq + (vec2(vnoise(rq * 22.0), vnoise(rq * 22.0 + 5.0)) - 0.5) * 0.035;
        vec2 pq = wq2 * 13.0;
        vec2 pv = voro2(pq);
        vec2 pid = voroId(pq);
        float pSel = step(0.86, hash12(pid + h1 * 40.0));
        float rr0 = 0.05 + 0.06 * hash12(pid + 2.0);
        float pore = (1.0 - smoothstep(rr0, rr0 + 0.05 + pxm * 10.0, pv.x)) * pSel;
        float polyp = (1.0 - smoothstep(rr0 * 2.6, rr0 * 2.6 + 0.08 + pxm * 10.0, pv.x)) * pSel;
        c = mix(c, c * vec3(0.97, 0.94, 0.92), (polyp - pore) * 0.6 * kB);
        c = mix(c, c * vec3(0.84, 0.74, 0.72), pore * 0.75 * kB);
        // shell fragments: a few pale curved flecks
        vec2 sq = rq * 3.1 + 7.0;
        vec2 scid = floor(sq); vec2 scf = fract(sq) - 0.5 - (hash22(scid) - 0.5) * 0.5;
        float sAng = hash12(scid) * 6.2831; mat2 sR = mat2(cos(sAng), -sin(sAng), sin(sAng), cos(sAng));
        vec2 sp = sR * scf;
        float lenS = length(sp);
        float crescent = (1.0 - smoothstep(0.13, 0.145 + pxm * 3.0, lenS)) * smoothstep(0.07, 0.085 + pxm * 3.0, length(sp - vec2(0.05, 0.0))) * step(0.86, hash12(scid + 4.0));
        c = mix(c, c * 1.06 + 0.03, crescent * 0.8 * kB);
      }
      if(kA > 0.01){
        // fine grain: millimetre specks, irregular, dark and pale
        vec2 gv = voro2(rq * 150.0);
        float gId = hash12(voroId(rq * 150.0));
        float dark = (1.0 - smoothstep(0.12, 0.26, gv.x)) * step(0.82, gId);
        float pale = (1.0 - smoothstep(0.16, 0.3, gv.x)) * step(gId, 0.08);
        c = mix(c, c * vec3(0.8, 0.72, 0.72), dark * 0.7 * kA);
        c = mix(c, c * 1.07 + 0.02, pale * 0.7 * kA);
      }
      // hairline scratches from years of brooms
      float sc1 = abs(fract(dot(rq, vec2(0.86, 0.5)) * 9.0 + fbm2(rq * 3.0) * 0.5) - 0.5);
      float scratch = (1.0 - smoothstep(0.004, 0.012 + pxm * 6.0, sc1)) * step(0.7, vnoise(vec2(dot(rq, vec2(-0.5, 0.86)) * 2.5, floor(dot(rq, vec2(0.86, 0.5)) * 9.0))));
      c = mix(c, c * 1.05 + 0.015, scratch * 0.7 * kA);
      // the honed edge: a tiny bevel, lit on the sun side, shaded on the other, then the grout
      float dx0 = p.x, dx1 = sz.x - p.x, dy0 = p.y, dy1 = sz.y - p.y;
      float e = min(min(dx0, dx1), min(dy0, dy1));
      float jw = max(0.0085, pxm * 0.7);
      float grout = 1.0 - smoothstep(jw, jw + max(0.0025, pxm * 0.6), e);
      float bevel = 1.0 - smoothstep(jw + 0.004, jw + 0.018 + pxm, e);
      float sunSide = smoothstep(-0.2, 0.2, (dx0 < dx1 ? -uSunDir.x : uSunDir.x) * step(min(dx0, dx1), min(dy0, dy1)) + (dy0 < dy1 ? -uSunDir.z : uSunDir.z) * step(min(dy0, dy1), min(dx0, dx1)));
      c = mix(c, mix(c * vec3(0.84, 0.8, 0.84), c * 1.12 + 0.04, sunSide), (bevel - grout) * 0.65 * kC);
      // chipped corners and edge nicks
      vec2 cn = vec2(min(dx0, dx1), min(dy0, dy1));
      float nick = (1.0 - smoothstep(0.012, 0.03 + pxm, length(cn))) * step(0.42, h3);
      float edgeN = vnoise(vec2((dx0 < dx1 || dy0 < dy1 ? p.x + p.y * 1.7 : p.x * 1.3 + p.y) * 18.0, h1 * 30.0));
      float edgeChip = (1.0 - smoothstep(jw + 0.002, jw + 0.03 + pxm, e)) * step(0.62, edgeN);
      c = mix(c, c * vec3(0.76, 0.68, 0.68), clamp(nick + edgeChip, 0.0, 1.0) * 0.7 * kC);
      vec3 groutC = mix(vec3(0.52, 0.44, 0.45), vec3(0.76, 0.68, 0.64), clean * 0.3);
      groutC *= 0.92 + 0.15 * vnoise(p * 40.0);
      c = mix(c, groutC, grout * (0.55 + 0.45 * kC));
      return c;
    }

    // the cracks around an impact. returns x: crack line, y: shatter tone per fragment, z: crushed centre
    vec3 cracks(vec2 p, vec2 c, float R, float grow, float pxm, float seed){
      vec2 rd = p - c; float rl = length(rd);
      if(rl > R * 1.2 || grow <= 0.0) return vec3(0.0);
      float ang = atan(rd.y, rd.x);
      float nA = 11.0;
      float a00 = ang / 6.2831853 * nA + seed;
      float sect = floor(a00);
      // stone breaks in straight runs with sudden kinks: a sum of piecewise-linear zigzags, in metres
      float jag = 0.0;
      for(int i = 0; i < 3; i++){
        float f = 1.6 * pow(3.1, float(i)), amp = 0.42 / pow(2.7, float(i));
        float q0 = rl * f + sect * 7.3 + float(i) * 3.1;
        float s0 = floor(q0), t0 = fract(q0);
        jag += (mix(hash12(vec2(s0, seed + sect)), hash12(vec2(s0 + 1.0, seed + sect)), t0) - 0.5) * 2.0 * amp;
      }
      float wob = ((fbm2(vec2(rl * 0.4, seed)) - 0.5) * 2.0 + jag) * clamp(R / 10.0, 0.3, 1.0);
      float aF = (ang + wob / max(rl, 0.6)) / 6.2831853 * nA + seed;
      float aId = floor(aF);
      float br = abs(fract(aF) - 0.5) * 6.2831853 / nA * rl;
      float reach = R * (0.45 + 0.55 * hash12(vec2(aId, seed + 4.0))) * grow;
      float bw = mix(0.034, 0.004, sqrt(clamp(rl / max(reach, 0.01), 0.0, 1.0))) + pxm * 0.35;
      float mainC = (1.0 - smoothstep(bw, bw + pxm + 0.008, br)) * step(rl, reach);
      // the spider web near the centre, cells growing with radius
      float webR = R * 0.48 * grow;
      float scale = mix(5.0, 1.8, smoothstep(0.0, webR, rl));
      vec2 q = p * scale + vec2(fbm2(p * 3.1 + seed), fbm2(p * 3.1 + seed + 4.0)) * 0.6;
      vec2 vo = voro2(q);
      vec2 vi = voroId(q);
      float web = (1.0 - smoothstep(0.015, 0.03 + pxm * scale, vo.y)) * (1.0 - smoothstep(webR * 0.7, webR, rl + (vnoise(p * 1.7) - 0.5) * 1.5));
      float tone = (hash12(vi) - 0.5) * (1.0 - smoothstep(webR * 0.4, webR * 0.8, rl));
      float centre = 1.0 - smoothstep(R * 0.11, R * 0.2, rl + (vnoise(p * 6.0) - 0.5) * 0.3);
      return vec3(clamp(mainC + web, 0.0, 1.0), tone, centre * grow);
    }

    float gTrW = 0.0;
    // the same outline as the trench mesh in ring-crater.js
    float trenchMask(vec2 p, out float along, out float dist){
      vec2 ab = uTrB - uTrA; float L = length(ab); vec2 d = ab / L, n = vec2(-d.y, d.x);
      float m = dot(p - uTrA, d), h = m / L, lat = dot(p - uTrA, n), s = lat >= 0.0 ? 1.0 : -1.0;
      along = h; dist = abs(lat);
      float W = 60.0 + 8.0 * cos(m * 0.0113 + 1.3 + s * 1.1) + 6.0 * cos(m * 0.031 + 0.4 + s * 2.7) + 3.5 * cos(m * 0.083 + 2.2 + s * 0.9) + 1.8 * cos(m * 0.21 + 5.1 + s * 1.9);
      W *= smoothstep(-0.03, 0.07, h) * (1.0 - smoothstep(0.915, 1.015, h));
      gTrW = W;
      return dist < W - vnoise(p * 0.35) * 1.5 - vnoise(p * 1.6) * 0.6 && h < uTrU + 0.015 && h > -0.03 ? 1.0 : 0.0;
    }

    void main(){
      vec3 w = vWorld;
      vec3 P = vRest;
      vec2 p = P.xz;
      vec3 N = vec3(0.0, 1.0, 0.0);
      vec3 NV = normalize(vNormalV);
      float pxm = max(length(fwidth(w)), 1e-5);
      float ao = 1.0;
      float rimR = 0.0;
      float d0 = length(p);
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      bool onProm = p.y > -26.0;
      float inPillar = step(abs(p.x), ${(2.5).toFixed(2)}) * step(abs(p.y), ${(2.5).toFixed(2)});
      vec3 col;
      float dBrass = 1e3;
      // the crater takes a round bite: out of the promenade and of the garden north of it
      if(uCraterOn > 0.5 && inPillar < 0.5 && d0 < 45.0){
        float a0 = atan(p.y, p.x);
        rimR = 34.0 + 1.25 * cos(3.0 * a0 + 1.0) + 0.85 * cos(5.0 * a0 + 2.3) + 0.55 * cos(9.0 * a0 + 0.4) + 0.3 * cos(17.0 * a0 + 4.0) + 0.16 * cos(31.0 * a0 + 1.0);
        // the deck overhangs the bowl a little, torn along its own edge
        if(d0 < rimR - vnoise(p * 2.4) * 0.6 - vnoise(p * 9.0) * 0.2) discard;
      }
      if(onProm){
        // ---- running-bond slabs, and the brass lines of the pavement; the patch he guards is a brass-framed square
        float patch1 = step(abs(p.x), 2.5) * step(abs(p.y), 2.5);
        float rowH = 0.92;
        float row = floor(p.y / rowH);
        float L = 1.74 * (patch1 > 0.5 ? 1.0 : 1.0);
        float off = mod(row, 2.0) * 0.5 * L;
        vec2 cell = vec2((p.x + off) / L, p.y / rowH);
        vec2 tid = floor(cell);
        vec2 tf = fract(cell) * vec2(L, rowH);
        float clean = patch1;
        col = stoneTile(tf, vec2(L, rowH), tid, pxm, clean);
        col *= vec3(0.82, 0.78, 0.75);
        // ---- brass lines: the long meridian every 9.2 m, cross lines every 14.8 m; diamonds at the nodes
        float g1 = abs(fract((p.y + 4.6) / 9.2) - 0.5) * 9.2;
        float g2 = abs(fract((p.x + 7.4) / 14.8) - 0.5) * 14.8;
        float bw = 0.03;
        float mL = min(g1, g2);
        // the frame around his patch
        float frameD = abs(max(abs(p.x), abs(p.y)) - 2.5);
        float inFrame = step(max(abs(p.x), abs(p.y)), 2.56);
        vec2 ndC = abs(vec2(fract((p.x + 7.4) / 14.8) - 0.5, fract((p.y + 4.6) / 9.2) - 0.5)) * vec2(14.8, 9.2);
        float diamond = (ndC.x + ndC.y) - 0.34;
        dBrass = min(mL - bw, diamond);
        dBrass = min(dBrass, frameD - 0.028);
        dBrass = min(dBrass, abs(max(abs(p.x), abs(p.y)) - 2.33) - 0.012);
        if(dBrass < 0.05){
          float bk = 1.0 - smoothstep(0.0, max(0.004, pxm), dBrass);
          vec3 br = mix(vec3(0.44, 0.31, 0.15), vec3(0.62, 0.49, 0.25), smoothstep(-0.05, 0.05, sin(p.x * 3.0 + p.y * 7.0 + fbm2(p * 2.0) * 4.0)));
          // the node of the pavement: an engraved rose, worn smooth by a thousand sweepings
          if(diamond < 0.0){
            float rr = length(ndC), a8 = atan(ndC.y, ndC.x);
            float petals = abs(sin(a8 * 2.0)) * 0.17 + 0.05;
            float eng = (1.0 - smoothstep(0.004, 0.009 + pxm, abs(rr - petals))) + (1.0 - smoothstep(0.003, 0.008 + pxm, abs(rr - 0.235)));
            br = mix(br, br * 0.58, clamp(eng, 0.0, 1.0) * (1.0 - smoothstep(0.012, 0.05, pxm)) * 0.85);
          }
          br *= 1.0 + (vnoise(vec2(dot(p, vec2(0.7, 0.7)) * 240.0, dot(p, vec2(-0.7, 0.7)) * 8.0)) - 0.5) * 0.14 * (1.0 - smoothstep(0.004, 0.02, pxm));
          br = mix(br, vec3(0.43, 0.64, 0.52), smoothstep(0.62, 0.8, fbm2(p * 9.0)) * 0.5);
          br *= 0.94 + 0.12 * vnoise(p * 30.0);
          float hi = 1.0 - smoothstep(0.0, 0.012 + pxm, abs(dBrass + 0.014));
          br = mix(br, vec3(0.86, 0.76, 0.46), hi * 0.6);
          // the seam of the inlay, a thin dark line round the brass
          float seam = (1.0 - smoothstep(0.003, 0.006 + pxm, abs(dBrass))) ;
          col = mix(col, col * vec3(0.72, 0.65, 0.62), seam * 0.8 * (1.0 - bk));
          col = mix(col, br, bk);
        }
        // ---- large scale wear: sun-bleached belts, foot traffic, dust the wind leaves, rust-tea stains under planters
        float big = fbm2(p * 0.07 + 2.0);
        col *= 0.9 + 0.16 * smoothstep(0.3, 0.72, big);
        col = mix(col, col * vec3(0.95, 0.91, 0.84), smoothstep(0.58, 0.8, fbm2(p * 0.018 + 9.0)) * 0.7);
        float medium = fbm2(p * 0.9 + 4.0);
        col *= 0.955 + 0.09 * smoothstep(0.35, 0.65, medium) * (1.0 - smoothstep(0.03, 0.2, pxm));
        // dust: a soft ochre film over the unswept stone, thicker in the corners of the joints, with drawn drift edges
        float dustN = fbm2(p * 0.55 + 12.0) + 0.3 * fbm2(p * 3.0) - 0.12;
        float dust = smoothstep(0.32, 0.5, dustN);
        float patchK = smoothstep(2.62, 2.5, max(abs(p.x), abs(p.y)));
        // the swept arcs at the boundary of his clean patch: little drifts he has not collected yet
        float sw = abs(max(abs(p.x), abs(p.y)) - 3.0);
        float drift = (1.0 - smoothstep(0.1, 0.5 + 0.5 * vnoise(p * 0.8), sw)) * smoothstep(0.4, 0.7, vnoise(p * 1.3));
        vec3 dustC = vec3(0.86, 0.73, 0.57);
        float kN = 1.0 - smoothstep(0.018, 0.2, pxm);
        col = mix(col, mix(col, dustC, 0.42), dust * (1.0 - patchK) * (0.55 + 0.45 * kN));
        col = mix(col, mix(col, dustC, 0.75), drift * (1.0 - patchK) * 0.75);
        // grit and tiny stones on unswept tile; a fallen olive leaf here and there
        float gr = 0.0;
        if(pxm < 0.03){
          vec2 gq = p * 38.0 + vec2(vnoise(p * 9.0), vnoise(p * 9.0 + 4.0)) * 0.5;
          vec2 gv2 = voro2(gq);
          gr = (1.0 - smoothstep(0.1, 0.24, gv2.x)) * step(0.88, hash12(voroId(gq) + 1.3));
        }
        col = mix(col, vec3(0.6, 0.48, 0.4), gr * (1.0 - patchK) * (1.0 - smoothstep(0.004, 0.02, pxm)));
        vec2 lq = mat2(0.8, 0.6, -0.6, 0.8) * p * 1.05 + 3.0 + vec2(vnoise(p * 0.7), vnoise(p * 0.7 + 5.0)) * 1.2; vec2 lid = floor(lq);
        vec2 lf = fract(lq) - 0.5 - (hash22(lid) - 0.5) * 0.55;
        float lr = hash12(lid + 4.4) * 6.2831; lf = mat2(cos(lr), sin(lr), -sin(lr), cos(lr)) * lf;
        float leafS = step(0.9, hash12(lid + 9.9));
        float leaf = (1.0 - smoothstep(0.04, 0.048 + pxm, abs(lf.y) + lf.x * lf.x * 2.4 + 0.012 * abs(lf.x * 40.0))) * step(abs(lf.x), 0.22);
        vec3 leafC = mix(vec3(0.49, 0.53, 0.27), vec3(0.76, 0.66, 0.34), hash12(lid + 1.0));
        leafC = mix(leafC, leafC * 0.7, (1.0 - smoothstep(0.0, 0.006 + pxm, abs(lf.y))) * 0.8);
        col = mix(col, leafC, leaf * leafS * (1.0 - patchK) * (1.0 - smoothstep(0.02, 0.09, pxm)));
        // the pod's cracks and the landing's
        if(uPod.z > 0.0 && uCraterOn < 0.5){
          vec3 cr = cracks(p, uPod.xy, 3.4, uPod.z, pxm, 2.0);
          col = mix(col, col * vec3(0.38, 0.33, 0.38), cr.x * 0.85);
          col *= 1.0 + cr.y * 0.16;
          col = mix(col, col * 0.6, cr.z * 0.5);
        }
        if(uLand.z > 0.0 && uCraterOn < 0.5){
          vec3 cr = cracks(p, uLand.xy, 21.0, uLand.z, pxm, 5.0);
          cr.x *= 1.0 - patch1;
          cr.y *= 1.0 - patch1;
          col = mix(col, col * vec3(0.34, 0.3, 0.36), cr.x * 0.9);
          col *= 1.0 + cr.y * 0.2;
          col = mix(col, col * 0.62, cr.z * 0.55);
        }
        ao *= 1.0;
      } else {
        // ---- the city's floor between the towers: pale plazas, garden courts, canals of turquoise
        float tr = 0.0, along = 0.0, dist = 0.0;
        tr = trenchMask(p, along, dist);
        if(tr > 0.5) discard;
        float behind = (1.0 - smoothstep(uTrU - 0.01, uTrU + 0.02, along)) * smoothstep(-0.05, -0.02, along);
        float edgeD = dist - gTrW + vnoise(p * 0.2) * 7.0;
        vec2 q = p * 0.012;
        float n = fbm2(q + 3.0);
        vec3 plaza = mix(vec3(0.96, 0.88, 0.8), vec3(0.93, 0.78, 0.7), smoothstep(0.35, 0.7, fbm2(p * 0.03)));
        vec3 park = mix(vec3(0.42, 0.56, 0.42), vec3(0.62, 0.7, 0.5), smoothstep(0.35, 0.65, fbm2(p * 0.06)));
        // mown lines and dark beds: a tended garden, not a flat colour
        park *= 0.94 + 0.1 * smoothstep(0.3, 0.7, abs(fract(p.x * 0.09 + fbm2(p * 0.02) * 2.0) - 0.5) * 2.0);
        float bed = smoothstep(0.53, 0.6, fbm2(p * 0.05 + 3.0 + 1.6 * vec2(fbm2(p * 0.018), fbm2(p * 0.018 + 7.0))));
        park = mix(park, vec3(0.2, 0.36, 0.3), bed * 0.55);
        float blossom = mix(smoothstep(0.62, 0.7, vnoise(p * 0.9)), 0.26, smoothstep(0.25, 0.8, pxm));
        park = mix(park, vec3(0.95, 0.62, 0.62), bed * blossom * 0.75);
        col = mix(plaza, park, smoothstep(0.46, 0.52, n));
        vec2 cq = fract(p / 42.0);
        float ln = 1.0 - smoothstep(0.012, 0.018 + pxm * 0.02, min(min(cq.x, 1.0 - cq.x), min(cq.y, 1.0 - cq.y)));
        col = mix(col, col * 0.86, ln);
        float canal = abs(p.x - 320.0 * sin(p.y * 0.0025) - 80.0);
        col = mix(col, vec3(0.1, 0.62, 0.64), 1.0 - aaStep(12.0, canal, pxm * 2.0));
        ao *= 0.95;
        // the deck beside the furrow: scorched wide, and burning along its torn lip while the beam is still fresh
        if(behind > 0.0 && edgeD < 46.0){
          float sc = 1.0 - smoothstep(6.0, 34.0 + vnoise(p * 0.07) * 18.0, edgeD);
          col = mix(col, vec3(0.2, 0.16, 0.2), sc * 0.9 * behind);
          float life = 1.0 - smoothstep(2.0, 8.0, uTrAge);
          float flN = fbm2(p * 0.11 + vec2(uT * 0.8, -uT * 0.5));
          float fl = (1.0 - smoothstep(1.0, 9.0 + flN * 14.0, edgeD)) * smoothstep(0.32, 0.5, flN);
          gEmit = mix(vec3(1.0, 0.42, 0.1), vec3(1.0, 0.92, 0.45), smoothstep(0.5, 0.72, flN)) * 1.5 * fl * life * behind;
        }
      }

      float sunVis = cityShadow(P, 1.5);
      vec3 outc = ringLight(col, N, NV, w, sunVis, ao);
      outc = max(outc, gEmit);

      // brass catches the sun
      if(dBrass < 0.0){
        vec3 V3 = normalize(cameraPosition - w);
        vec3 Rv = reflect(-V3, N);
        float sp = pow(max(dot(Rv, uSunDir), 0.0), 18.0);
        outc += uSunColor * 0.35 * sp * uSunStrength;
      }

      // the shadow that slides over the tiles
      if(uShadowEdge.y > 0.0){
        float e = p.y - uShadowEdge.x - sin(p.x * 0.7) * 0.15;
        float sh = 1.0 - smoothstep(-0.02, 0.06 + pxm, e);
        outc = mix(outc, outc * vec3(0.5, 0.47, 0.72), sh * uShadowEdge.y);
      }

      // at macro distance the drawn grain must survive: no brush over it
      float id = pxm < 0.02 ? 101.0 : 0.0;
      writeOut(outc, 1.0, NV, vDepth, id);
    }
  `;
  return mat(u, vs, fs);
}

// ---------------------------------------------------------------- crater bowl, pillar walls, trench walls, debris
// kind by uniform: 0 crater bowl (strata on the steep wall, scorched rubble on the floor), 1 pillar sides, 2 trench, 3 rubble instanced
export function craterMaterial(o = {}) {
  const u = { ...G, ...RU, uKind: { value: o.kind ?? 0 } };
  const inst = !!o.instanced;
  const defines = inst ? { INST: 1 } : {};
  if (o.debris) defines.DEBRIS = 1;
  const vs = /* glsl */ `
    uniform float uT, uBendK, uBendX0;
    varying vec3 vRest, vWorld, vNormalW, vNormalV;
    varying float vDepth;
    varying vec2 vUv;
    flat varying vec4 vA;
    #ifdef INST
    attribute vec4 iA;
    #endif
    #ifdef DEBRIS
    attribute vec4 iV, iW;
    #endif
    vec3 rotAxis(vec3 v, vec3 a, float s, float c){ return v * c + cross(a, v) * s + a * dot(a, v) * (1.0 - c); }
    void main(){
      #ifdef INST
      mat4 im = instanceMatrix;
      vec3 p = (im * vec4(position, 1.0)).xyz;
      vec3 n = mat3(im) * normal;
      vA = iA;
      #else
      vec3 p = position; vec3 n = normal; vA = vec4(0.0);
      #endif
      vec4 wp = modelMatrix * vec4(p, 1.0);
      vec3 nw = normalize(mat3(modelMatrix) * n);
      vRest = wp.xyz;
      #ifdef DEBRIS
      float dt = uT - iW.y;
      if(dt < 0.0 || dt > iW.z){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
      vec3 c0 = (im * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      vec3 axis = normalize(iV.xyz + vec3(0.3, 1.0, 0.2));
      float a = iV.w * dt, sa = sin(a), ca = cos(a);
      vec3 rel = rotAxis(p - c0, axis, sa, ca);
      nw = rotAxis(nw, axis, sa, ca);
      vec3 pos = c0 + iV.xyz * dt;
      pos.y -= 0.5 * 26.0 * dt * dt;
      wp = vec4(pos + rel, 1.0);
      if(wp.y < -2.0){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
      #endif
      vWorld = wp.xyz;
      vNormalW = nw;
      vNormalV = normalize(mat3(viewMatrix) * nw);
      vec4 mv = viewMatrix * wp; vDepth = -mv.z; vUv = uv;
      gl_Position = projectionMatrix * mv;
    }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${PAINT_LIGHT}
    ${HELP}
    ${TERR_LIGHT}
    uniform float uKind, uT, uTrAge;
    varying vec3 vRest, vWorld, vNormalW, vNormalV;
    varying float vDepth;
    varying vec2 vUv;
    flat varying vec4 vA;

    // stacked deck strata, from the tile layer down to the ring's bedrock
    vec3 strata(float dy, vec2 ap, float pxm, float seed){
      float wob = (vnoise(ap * vec2(0.5, 0.5) + seed) - 0.5) * 0.35 + (vnoise(ap * 2.2 + seed) - 0.5) * 0.12;
      float d = dy + wob;
      vec3 c;
      if(d < 0.28){ c = vec3(0.96, 0.84, 0.76); }              // the tile
      else if(d < 0.55){ c = vec3(0.77, 0.7, 0.66); }           // mortar
      else if(d < 2.0){                                          // the deck concrete with rebar
        c = vec3(0.85, 0.74, 0.68) * (0.92 + 0.13 * fbm2(ap * 0.6 + seed));
        vec2 rq = fract(ap / vec2(0.38, 0.36)) - 0.5;
        float ball = 1.0 - smoothstep(0.06, 0.11, length(rq));
        c = mix(c, vec3(0.5, 0.33, 0.27), ball * step(0.74, hash12(floor(ap / vec2(0.38, 0.36)) + seed)) * step(pxm, 0.05) * 0.7);
      } else if(d < 2.6){ c = vec3(0.62, 0.53, 0.56); }         // a damp service gallery, dark
      else if(d < 4.5){ c = mix(vec3(0.94, 0.8, 0.72), vec3(0.86, 0.66, 0.58), smoothstep(0.3, 0.7, fbm2(vec2(ap.x * 0.2, d * 1.3)))); }   // pale coral bedrock
      else { c = mix(vec3(0.77, 0.6, 0.56), vec3(0.6, 0.48, 0.5), smoothstep(4.5, 9.0, d)); }
      // thin sedimentary lines in every layer
      float lines = abs(fract(d * 5.2 + (vnoise(ap * 0.7) - 0.5) * 0.7) - 0.5);
      c = mix(c, c * 0.84, (1.0 - smoothstep(0.03, 0.06 + pxm * 2.0, lines)) * 0.5 * (1.0 - smoothstep(0.03, 0.3, pxm)));
      // boundaries of the layers: dark line
      return c;
    }

    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 P = vRest, w = vWorld;
      vec3 N = normalize(vNormalW);
      vec3 NV = normalize(vNormalV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      float pxm = max(length(fwidth(w)), 1e-4);
      float kS = 1.0 - smoothstep(0.012, 0.06, pxm);
      float kM = 1.0 - smoothstep(0.06, 0.5, pxm);
      float kind = uKind;
      vec3 col;
      float ao = 1.0;
      float seed = vA.x * 37.0 + 1.0;
      vec3 trEmit = vec3(0.0);
      if(kind < 0.5 || kind > 1.5 && kind < 2.5){
        float r = length(P.xz);
        float a = atan(P.z, P.x);
        vec2 ap = vec2(a * r, P.y);
        vec2 cq = P.xz;
        float steep = 1.0 - smoothstep(0.55, 0.85, N.y);
        vec3 wallC = strata(-P.y, vec2(a * 34.0, P.y), pxm, 3.0);
        float nFine = fbm2(ap * 1.2 + 4.0);
        wallC *= 0.93 + 0.14 * nFine;
        // vertical gouges and rivulets of molten dust
        float gouge = abs(fract(a * 18.0 / 6.2831853 + (vnoise(vec2(a * 3.0, P.y * 0.2)) - 0.5) * 0.3) - 0.5);
        wallC = mix(wallC, wallC * vec3(0.58, 0.52, 0.6), (1.0 - smoothstep(0.0, 0.06, gouge)) * 0.55);
        // the blasted floor: rubble drawn in cells, soot rays out from the centre, glazed lime-yellow at the middle
        vec2 v1 = voro2(cq * 0.9 + vec2(fbm2(cq * 0.5)) * 2.0);
        vec2 v2 = voro2(cq * 3.3 + 4.0);
        vec3 fl = mix(vec3(0.79, 0.69, 0.65), vec3(0.62, 0.53, 0.54), smoothstep(0.3, 0.75, fbm2(cq * 0.25)));
        fl *= 0.84 + 0.3 * v1.x * (1.0 - 0.5 * step(0.5, hash12(voroId(cq * 0.9 + vec2(fbm2(cq * 0.5)) * 2.0))));
        fl = mix(fl, fl * vec3(0.5, 0.45, 0.52), (1.0 - smoothstep(0.015, 0.05 + pxm * 0.4, v1.y)) * 0.7);
        fl = mix(fl, fl * vec3(0.66, 0.6, 0.65), (1.0 - smoothstep(0.02, 0.08 + pxm, v2.y)) * 0.5 * kM);
        fl *= 1.0 + (vnoise(cq * 22.0) - 0.5) * 0.12 * kS;
        // tile shards embedded in the floor near the rim
        float sootR = smoothstep(0.42, 0.6, vnoise(vec2(a * 9.0, r * 0.08))) * smoothstep(34.0, 8.0, r);
        fl = mix(fl, fl * vec3(0.42, 0.4, 0.48), sootR * 0.75);
        fl = mix(fl, mix(vec3(0.74, 0.84, 0.4), vec3(0.95, 0.95, 0.72), smoothstep(0.3, 0.7, fbm2(cq * 0.5))), (1.0 - smoothstep(7.5, 13.0, r + (vnoise(cq * 0.35) - 0.5) * 7.0)) * 0.55);
        col = mix(fl, wallC, steep);
        ao *= mix(1.0, 0.9, steep);
        if(kind > 1.5){
          // the trench: char, then glowing fissures
          // walls: the deck's own strata, burnt; floor: char and rubble. It darkens with depth, so the furrow reads as a cut with shadow in it
          float dep = clamp(-P.y / 46.0, 0.0, 1.0);
          float wallK = 1.0 - smoothstep(0.35, 0.8, N.y);
          vec3 tw = strata(-P.y * 0.2, vec2(P.x + P.z, P.y * 0.6), pxm, 9.0) * vec3(0.74, 0.62, 0.6);
          tw *= 0.86 + 0.26 * fbm2(vec2(P.x + P.z, P.y * 0.4) * 0.12);
          vec3 floorC = mix(vec3(0.17, 0.14, 0.18), vec3(0.32, 0.26, 0.28), smoothstep(0.42, 0.7, fbm2(P.xz * 0.06)));
          floorC = mix(floorC, floorC * 0.55, (1.0 - smoothstep(0.02, 0.08, voro2(P.xz * 0.14).y)) * 0.7);
          col = mix(floorC, tw, wallK);
          col *= mix(1.0, 0.46, smoothstep(0.08, 0.8, dep));
          float life = 1.0 - smoothstep(2.0, 9.0, uTrAge);
          float fiss = (1.0 - smoothstep(0.015, 0.06, voro2(P.xz * 0.075 + 3.0).y)) * smoothstep(0.42, 0.6, fbm2(P.xz * 0.018 + 5.0));
          trEmit = mix(vec3(1.0, 0.36, 0.08), vec3(1.0, 0.95, 0.42), smoothstep(0.2, 0.95, dep)) * 1.5 * fiss * smoothstep(0.35, 0.8, dep) * life;
          float rimB = smoothstep(-13.0, -1.0, P.y + (vnoise(P.xz * 0.16 + vec2(uT * 0.6, 0.0)) - 0.5) * 11.0);
          trEmit = max(trEmit, vec3(1.0, 0.5, 0.12) * 1.45 * rimB * life * wallK);
        }
      } else if(kind < 1.5){
        // the pillar: he stands on a tower of everything the deck is made of
        vec2 ap = abs(N.x) > abs(N.z) ? vec2(P.z, P.y) : vec2(P.x, P.y);
        col = strata(-P.y, ap, pxm, 7.0);
        col *= 0.93 + 0.14 * fbm2(ap * 0.9 + 3.0);
        float frag = voro2(ap * vec2(0.9, 1.5) + vec2(fbm2(ap * 0.7), 2.0)).y;
        col = mix(col, col * vec3(0.76, 0.7, 0.75), (1.0 - smoothstep(0.012, 0.05 + pxm, frag)) * 0.5 * kM * smoothstep(2.7, 3.4, -P.y));
        // the service gallery was sliced with everything in it: pipe ends in brass and copper
        for(int i = 0; i < 3; i++){
          float cx = -1.55 + float(i) * 1.42 + (float(i) - 1.0) * 0.1;
          float rP = 0.2 - float(i) * 0.03;
          float dp = length(ap - vec2(cx, -2.34 - float(i) * 0.04));
          col = mix(col, vec3(0.7, 0.5, 0.26), 1.0 - smoothstep(rP - 0.01, rP + pxm, dp));
          col = mix(col, vec3(0.16, 0.13, 0.18), 1.0 - smoothstep(rP - 0.075, rP - 0.06 + pxm, dp));
        }
        float soot = smoothstep(0.35, 0.65, fbm2(ap * vec2(0.5, 0.18) + 10.0));
        col = mix(col, col * vec3(0.56, 0.52, 0.58), soot * 0.5);
        col = mix(col, vec3(0.97, 0.87, 0.79), smoothstep(-0.05, -0.02, P.y));
      } else {
        // rubble and slabs
        float h = vA.y;
        vec3 base = mix(vec3(0.91, 0.78, 0.7), vec3(0.8, 0.68, 0.64), fract(vA.x * 7.0));
        // each lump was cut from the strata: a few bands at its own angle
        vec3 bd = normalize(vec3(fract(vA.x * 11.3) - 0.5, 0.6, fract(vA.x * 5.7) - 0.5));
        float bq = dot(P, bd) * 1.7 + vA.x * 40.0;
        base = mix(base, base * vec3(0.8, 0.72, 0.74), smoothstep(0.42, 0.46, abs(fract(bq) - 0.5)) * 0.7 * kM * (1.0 - h));
        vec2 uv2 = vUv * 2.0 + vA.x * 40.0;
        base *= 0.86 + 0.26 * fbm2(uv2 * 1.6);
        float crN = voro2(uv2 * 3.0).y;
        base = mix(base, base * 0.74, (1.0 - smoothstep(0.02, 0.06, crN)) * 0.3 * kM);
        base *= 1.0 + (vnoise(uv2 * 30.0) - 0.5) * 0.1 * kS;
        // top of tile slabs keeps the honed tile
        if(h > 0.5 && N.y > 0.7) base = mix(vec3(0.96, 0.86, 0.79), vec3(0.98, 0.91, 0.84), fract(vA.x * 3.0));
        col = base;
      }
      vec3 outc = max(ringLight(col, N, NV, w, 1.0, ao), trEmit);
      // rubble is inked, one id per lump family; the ground it lies on stays paint
      writeOut(outc, 1.0, NV, vDepth, kind > 2.5 ? 15.0 + floor(vA.x * 4.0) : 0.0);
    }
  `;
  return mat(u, vs, fs, { defines });
}

// ---------------------------------------------------------------- street furniture and the pod: inked cel, stone in three scales
// Vertex attribute aK = (kind, seed, ?, ?). kinds: 0 coral stone, 1 wood, 2 brass, 3 soil, 4 olive bark, 5 enamel, 6 turquoise glass, 7 lantern, 8 hull
export function propMaterial(o = {}) {
  const u = { ...G, ...RU, uId: { value: o.id ?? 2 } };
  const inst = !!o.instanced;
  const defines = inst ? { INST: 1 } : {};
  const vs = /* glsl */ `
    attribute vec4 aK;
    uniform float uBendK, uBendX0;
    varying vec3 vRest, vWorld, vNormalW, vNormalV, vLocal;
    varying float vDepth;
    varying vec2 vUv;
    varying vec4 vK;
    void main(){
      #ifdef INST
      vec3 p = (instanceMatrix * vec4(position, 1.0)).xyz;
      vec3 n = mat3(instanceMatrix) * normal;
      #else
      vec3 p = position; vec3 n = normal;
      #endif
      vec4 wp = modelMatrix * vec4(p, 1.0);
      vRest = p;
      float bx = max(abs(wp.x) - uBendX0, 0.0);
      wp.y += bx * bx * uBendK;
      vLocal = position;
      vWorld = wp.xyz;
      vNormalW = normalize(mat3(modelMatrix) * n);
      vNormalV = normalize(normalMatrix * n);
      vec4 mv = viewMatrix * wp; vDepth = -mv.z; vUv = uv; vK = aK;
      gl_Position = projectionMatrix * mv;
    }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${HELP}
    uniform float uId;
    varying vec3 vRest, vWorld, vNormalW, vNormalV, vLocal;
    varying float vDepth;
    varying vec2 vUv;
    varying vec4 vK;
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 w = vWorld;
      vec3 N = normalize(vNormalW);
      vec3 NV = normalize(vNormalV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      float pxm = max(length(fwidth(w)), 1e-4);
      float kS = 1.0 - smoothstep(0.008, 0.04, pxm);
      float kM = 1.0 - smoothstep(0.03, 0.2, pxm);
      float kind = floor(vK.x + 0.5);
      float seed = vK.y;
      vec3 q = vLocal;
      vec3 lit, dark; float gloss = 0.0;
      if(kind == 0.0){
        lit = vec3(0.96, 0.82, 0.74); dark = vec3(0.7, 0.59, 0.66);
        vec3 tint = vec3(0.98, 0.88, 0.79);
        lit = mix(lit, tint, step(0.5, fract(seed * 3.0)));
        float lit0 = dot(lit, vec3(0.333));
        float big = fbm3(q * 0.7 + seed);
        lit *= 0.92 + 0.14 * big;
        float crack = abs(fbm3(q * 3.3 + seed * 7.0) - 0.5);
        lit = mix(lit, lit * 0.72, (1.0 - smoothstep(0.004, 0.012 + pxm * 0.7, crack)) * kM * 0.75);
        lit *= 1.0 + (vnoise3(q * 70.0 + seed) - 0.5) * 0.08 * kS;
        float chips = smoothstep(0.71, 0.76, fbm3(q * 7.0 + seed * 2.0));
        lit = mix(lit, lit * vec3(0.8, 0.7, 0.68), chips * kM * 0.7);
        // three more scales, each fading out with the metres a pixel covers: weather wash, chisel strokes and lichen, pinholes
        float kF = 1.0 - smoothstep(0.1, 0.7, pxm);
        float wash = smoothstep(0.34, 0.68, fbm3(q * vec3(0.55, 1.7, 0.55) + seed * 2.0));
        lit = mix(lit, lit * vec3(0.84, 0.82, 0.85), wash * 0.6 * kF);
        float strokeN = (q.x + q.z * 0.6) * 11.0 + vnoise3(q * 3.1 + seed) * 2.4;
        float stroke = 1.0 - smoothstep(0.03, 0.14 + pxm * 11.0, abs(fract(strokeN) - 0.5));
        lit = mix(lit, lit * vec3(0.92, 0.9, 0.91), stroke * kM * 0.65);
        float liN = fbm3(q * 4.6 + seed * 3.0);
        float lichen = smoothstep(0.64, 0.68, liN) * smoothstep(-0.1, 0.5, N.y + 0.2);
        vec3 liC = mix(vec3(0.86, 0.77, 0.44), vec3(0.6, 0.68, 0.46), smoothstep(0.35, 0.65, fbm3(q * 19.0 + seed)));
        lit = mix(lit, liC, lichen * kM * 0.8);
        lit = mix(lit, lit * 0.74, (smoothstep(0.615, 0.64, liN) - smoothstep(0.64, 0.68, liN)) * kM * 0.4);
        float pinV = vnoise3(q * 46.0 + seed * 5.0);
        lit = mix(lit, lit * vec3(0.66, 0.6, 0.62), smoothstep(0.76, 0.84, pinV) * kS * 0.75);
        // the shaded side carries the same marks, not a flat fill
        dark *= mix(1.0, clamp(dot(lit, vec3(0.333)) / lit0, 0.62, 1.12), 0.42);
        lit = mix(lit, lit * vec3(0.78, 0.8, 0.84), smoothstep(0.35, 0.0, q.y) * 0.4);   // splash of grime at the foot
      } else if(kind == 1.0){
        lit = vec3(0.68, 0.45, 0.28); dark = vec3(0.32, 0.22, 0.32);
        float gr = fbm3(vec3(q.x * 90.0, q.y * 90.0, q.z * 3.0) + seed);
        lit *= 0.84 + 0.32 * gr;
        float knot = smoothstep(0.73, 0.8, vnoise3(q * 5.0 + seed));
        lit = mix(lit, lit * 0.68, knot);
        dark *= 0.9 + 0.2 * gr;
      } else if(kind == 2.0){
        lit = vec3(0.74, 0.55, 0.27); dark = vec3(0.34, 0.23, 0.18);
        lit *= 0.9 + 0.2 * vnoise3(q * 20.0 + seed);
        lit = mix(lit, vec3(0.42, 0.62, 0.5), smoothstep(0.6, 0.82, fbm3(q * 12.0)) * 0.45);
        gloss = 1.0;
      } else if(kind == 3.0){
        lit = vec3(0.48, 0.34, 0.27); dark = vec3(0.2, 0.15, 0.22);
        lit *= 0.82 + 0.36 * vnoise3(q * 28.0);
      } else if(kind == 4.0){
        lit = vec3(0.55, 0.47, 0.36); dark = vec3(0.26, 0.21, 0.28);
        float gr = abs(fract(q.x * 16.0 + vnoise3(q * 4.0) * 3.0) - 0.5);
        lit = mix(lit, lit * 0.62, (1.0 - smoothstep(0.0, 0.2, gr)) * kM);
      } else if(kind == 5.0){
        // tram livery: deep teal enamel, scuffed down to cream primer where it has been knocked about
        lit = vec3(0.13, 0.5, 0.54); dark = vec3(0.05, 0.22, 0.34);
        float s = fbm3(q * 0.9 + seed);
        lit = mix(lit, lit * vec3(1.15, 1.1, 1.05), smoothstep(0.45, 0.7, s));
        float scr = abs(fract(q.y * 5.0 + fbm3(q * 2.0) * 2.0) - 0.5);
        lit = mix(lit, lit * 1.3, (1.0 - smoothstep(0.0, 0.04 + pxm * 2.0, scr)) * 0.3 * kM);
        // sheet-metal panels, riveted along the seams, and long streaks of road grime running tailward
        float ang9 = atan(q.z, q.x) / 6.2831853 * 10.0;
        float hs = abs(fract(q.y / 0.62 + 0.25) - 0.5) * 0.62, vs = abs(fract(ang9 + floor(q.y / 0.62 + 0.25) * 0.5) - 0.5) * 0.44;
        float seam9 = 1.0 - smoothstep(0.004, 0.009 + pxm, min(hs, vs));
        lit = mix(lit, lit * 0.5, seam9 * 0.85 * kM);
        float rivA = abs(fract(ang9 * 4.0) - 0.5) * 0.11;
        float riv = 1.0 - smoothstep(0.009, 0.013 + pxm, length(vec2(rivA, hs - 0.03)));
        lit = mix(lit, lit * 1.5 + 0.06, riv * 0.8 * kM);
        float streak = smoothstep(0.5, 0.74, fbm3(vec3(ang9 * 1.6, q.y * 0.5, seed)));
        lit = mix(lit, lit * vec3(0.72, 0.7, 0.66), streak * 0.55);
        float scuff = smoothstep(0.74, 0.76, fbm3(q * 11.0 + seed * 3.0)) * smoothstep(0.42, 0.62, fbm3(q * 2.0 + seed));
        lit = mix(lit, vec3(0.93, 0.86, 0.74), scuff * 0.9 * kM);
        dark = mix(dark, vec3(0.42, 0.36, 0.5), scuff * kM);
        gloss = 0.7;
      } else if(kind == 6.0){
        lit = mix(vec3(0.13, 0.62, 0.66), vec3(0.72, 0.96, 0.96), smoothstep(0.35, 0.8, vnoise3(q * 0.6) + q.y * 0.1));
        dark = vec3(0.06, 0.32, 0.44);
        gloss = 1.0;
      } else if(kind == 7.0){
        lit = vec3(1.0, 0.95, 0.72); dark = vec3(0.9, 0.78, 0.5);
      } else if(kind == 9.0){
        // the pod's window belt: ink-blue enamel, so the windows and brass frames stand off it
        lit = vec3(0.15, 0.23, 0.36); dark = vec3(0.07, 0.1, 0.22);
        lit *= 0.9 + 0.2 * fbm3(q * 3.0 + seed);
        gloss = 0.5;
      } else {
        lit = vec3(0.9, 0.82, 0.75); dark = vec3(0.5, 0.42, 0.55);
        lit *= 0.9 + 0.15 * fbm3(q * 0.2);
        float rib = abs(fract(q.x / 8.0) - 0.5);
        lit = mix(lit, lit * 0.7, 1.0 - smoothstep(0.0, 0.04, rib));
        dark = mix(lit * 0.5, dark, 0.6);
      }
      float ndl = dot(N, uKeyDir);
      float sh = sunShadow(w, N);
      float lk = smoothstep(0.01, 0.06, ndl) * sh;
      vec3 shade = mix(dark, dark * uShadeTint * 1.25, 0.65);
      vec3 sunC = lit * mix(vec3(1.0), uSunColor * 1.04, 0.5);
      vec3 outc = mix(shade, sunC, lk);
      outc *= mix(uShadeTint * 1.25, vec3(1.0), 0.5 + 0.5 * uSunStrength);
      vec3 V = normalize(cameraPosition - w);
      vec3 Rv = reflect(-V, N);
      float sp = pow(max(dot(Rv, uKeyDir), 0.0), 40.0);
      outc += step(0.55, sp) * gloss * lk * 0.5;
      float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
      outc += uSkyTint * fres * gloss * 0.14;
      outc = rigLight(lit, outc, N, V, w);
      writeOut(outc, 1.0, NV, vDepth, uId + mod(floor(vK.z + 0.5), 3.0));
    }
  `;
  return mat(u, vs, fs, { defines });
}

import * as THREE from 'three';
import { G, COMMON, MRT_OUT, VERT_STD } from './glsl.js';
import { mulberry32 } from './util.js';

// Capy materials. Hand-drawn feel: two hard tones, ragged terminator on the fur, a multi-scale brush-stroke fur texture
// (big locks / medium long strokes / fine hairs) carried in bind space so it never swims. Everything ends in rigLight().

// shared animated uniforms of this department
export const CU = {
  uSoot: { value: 0 },        // 0 clean .. 1 black with soot
  uSootBurst: { value: 0 },
  uFurTex: { value: null },
  uLeanK: { value: 1 },
};

// ---- stroke texture: R big locks, G long strokes, B fine hairs, A per-stroke tone. Tiles in both axes. Strokes run along V.
export function makeFurTex(renderer) {
  if (CU.uFurTex.value) return CU.uFurTex.value;
  const S = 1024;
  const data = new Uint8Array(S * S * 4);
  const R = new Float32Array(S * S), Gc = new Float32Array(S * S), B = new Float32Array(S * S), A = new Float32Array(S * S);
  const rnd = mulberry32(90210);
  const stroke = (buf, cx, cy, L, W, bend, val, tone) => {
    const y0 = Math.floor(cy - L / 2), y1 = Math.ceil(cy + L / 2);
    for (let y = y0; y <= y1; y++) {
      const t = (y - y0) / Math.max(1, y1 - y0);
      const hw = W * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.02)), 0.75) * (1 - t * 0.35);
      const xc = cx + bend * (t * t - t) * 4;
      const a = Math.floor(xc - hw - 1), b = Math.ceil(xc + hw + 1);
      for (let x = a; x <= b; x++) {
        const d = Math.abs(x - xc) / Math.max(hw, 0.6);
        if (d > 1) continue;
        const v = val * (1 - d * d * 0.55);
        const ix = ((x % S) + S) % S, iy = ((y % S) + S) % S, q = iy * S + ix;
        if (v > buf[q]) { buf[q] = v; if (tone !== undefined) A[q] = tone; }
      }
    }
  };
  // R: short soft tufts: a rounded top and three blunt points at the bottom, most of the coat left plain
  const tuft = (cx, cy, W, Hup, Hdn, ang) => {
    const ca = Math.cos(ang), sa = Math.sin(ang), rr = Math.ceil(Math.max(W, Hdn) + 4);
    for (let y = Math.floor(cy - rr); y <= cy + rr; y++) for (let x = Math.floor(cx - rr); x <= cx + rr; x++) {
      const dx = x - cx, dy = y - cy, a = (dx * ca + dy * sa) / W, along = dx * sa - dy * ca;
      if (Math.abs(a) >= 1) continue;
      const env = Math.sqrt(1 - a * a);
      const m = Math.min(along + Hup * env, Hdn * env * (0.55 + 0.45 * Math.pow(0.5 + 0.5 * Math.cos(a * 3 * Math.PI), 1.3)) - along);
      if (m <= -3) continue;
      const v = Math.max(0, Math.min(1, 0.68 + m * 0.07)), ix = ((x % S) + S) % S, iy = ((y % S) + S) % S, q = iy * S + ix;
      if (v > R[q]) R[q] = v;
    }
  };
  const centres = [];
  for (let tries = 0; tries < 6000 && centres.length < 44; tries++) {
    const x = rnd() * S, y = rnd() * S;
    if (centres.every(([a, b]) => { const dx = Math.min(Math.abs(a - x), S - Math.abs(a - x)), dy = Math.min(Math.abs(b - y), S - Math.abs(b - y)); return dx * dx + dy * dy > 58 * 58; })) centres.push([x, y]);
  }
  for (const [cx, cy] of centres) { const k = 0.65 + rnd() * 0.75; tuft(cx, cy, (34 + rnd() * 18) * k, (12 + rnd() * 6) * k, (34 + rnd() * 20) * k, (rnd() - 0.5) * 0.6); }
  // G: long thin strokes
  for (let i = 0; i < 1800; i++) stroke(Gc, rnd() * S, rnd() * S, 120 + rnd() * 170, 2.2 + rnd() * 3.2, (rnd() - 0.5) * 34, 0.5 + rnd() * 0.5);
  // B: fine hairs
  for (let i = 0; i < 9000; i++) stroke(B, rnd() * S, rnd() * S, 40 + rnd() * 60, 0.8 + rnd() * 1.4, (rnd() - 0.5) * 12, 0.45 + rnd() * 0.55);
  for (let i = 0; i < S * S; i++) {
    data[i * 4] = Math.min(255, R[i] * 255); data[i * 4 + 1] = Math.min(255, Gc[i] * 255);
    data[i * 4 + 2] = Math.min(255, B[i] * 255); data[i * 4 + 3] = Math.min(255, A[i] * 255);
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true; tex.anisotropy = 8; tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  CU.uFurTex.value = tex;
  return tex;
}

const VS = /* glsl */ `
  attribute vec3 aCol;
  attribute vec3 aRest;
  attribute float aFold;
  attribute float aMask;
  uniform float uInflate;
  varying vec3 vCol, vRest;
  varying float vFold, vMask;
  varying vec3 vLocalN;
  ${VERT_STD}
  void main(){
    vCol = aCol; vRest = aRest; vFold = aFold; vMask = aMask; vLocalN = normal;
    stdVertex(position + normal * uInflate, normal);
  }
`;

const FS_HEAD = /* glsl */ `
  ${COMMON}
  ${MRT_OUT}
  uniform float uId, uFurK, uFurSize, uFlow, uGloss, uRagged, uSootK, uDetailK;
  uniform float uSoot, uSootBurst;
  uniform sampler2D uFurTex;
  varying vec3 vCol, vRest, vWorld, vNormalW, vNormalV, vLocalN;
  varying float vFold, vMask, vDepth;
  varying vec2 vUv;

  float aa(float e){ float w = fwidth(e) * 0.8 + 1e-5; return smoothstep(-w, w, e); }

  // the three stroke layers at scale s, flowing along the part's axis; bind-space, biplanar
  vec4 furSample(vec3 p, vec3 n){
    vec3 a = abs(n);
    vec2 uvA, uvB; float w;
    if(uFlow < 0.5){            // flow down -Y (body, limbs)
      uvA = vec2(p.x, p.y); uvB = vec2(p.z + 0.37, p.y); w = smoothstep(0.42, 0.62, a.x / (a.x + a.z + 1e-4));
    } else {                    // flow back along -Z (head)
      uvA = vec2(p.x, p.z); uvB = vec2(p.y + 0.21, p.z); w = smoothstep(0.42, 0.62, a.y / (a.y + a.x + 1e-4));
      w = 1.0 - w;
      float fr = step(0.62, a.z);
      uvA = mix(uvA, vec2(p.x + 0.11, p.y), fr); uvB = mix(uvB, vec2(p.x + 0.11, p.y), fr);
    }
    vec2 wob = vec2(sin(p.y * 13.0 + p.z * 11.0) + 0.6 * sin(p.x * 23.0 - p.y * 7.0), 0.0) * 0.011;
    uvA += wob; uvB += wob;
    // big locks 45 cm per tile, long strokes 16 cm, hairs 6 cm
    vec4 s;
    s.r = mix(texture(uFurTex, uvA * (2.2 / uFurSize)).r, texture(uFurTex, uvB * (2.2 / uFurSize) + 0.31).r, w);
    s.g = mix(texture(uFurTex, uvA * (6.3 / uFurSize)).g, texture(uFurTex, uvB * (6.3 / uFurSize) + 0.19).g, w);
    s.b = mix(texture(uFurTex, uvA * (17.0 / uFurSize)).b, texture(uFurTex, uvB * (17.0 / uFurSize) + 0.57).b, w);
    s.a = mix(texture(uFurTex, uvA * (2.2 / uFurSize)).a, texture(uFurTex, uvB * (2.2 / uFurSize) + 0.31).a, w);
    return s;
  }

  // shared lighting: two tones, cool shade, ragged terminator, hot rim on the key side
  // three flat tones of the painted colour, the steps follow the drawn clumps
  vec3 celTone(vec3 c, float clump){
    float L = dot(c, vec3(0.3333)), e = aa(clump - 0.68) * 0.07 - 0.015;
    float q = mix(0.33, mix(0.43, 0.53, aa(L - 0.52 - e)), aa(L - 0.33 - e));
    return c * q / max(L, 0.01);
  }

  vec3 capyLight(vec3 col, vec3 N, vec3 V, float rag, float gloss, float shOff){
    float ndl = dot(N, uKeyDir);
    // hand-painted: one hard shadow edge, shaped by the drawn clumps
    float sh = smoothstep(0.42, 0.58, sunShadow(vWorld + uKeyDir * shOff, N) + rag * 0.8);
    float lit = smoothstep(-0.015, 0.015, ndl + rag) * sh;
    vec3 litCol = col * mix(uSkyTint, uSunColor, 0.55 * uSunStrength) * 1.06;
    vec3 shT = mix(uShadeTint, vec3(dot(uShadeTint, vec3(0.3333))) * vec3(1.08, 0.95, 0.97), 0.42);
    vec3 shadeCol = col * shT * 1.04;
    vec3 o = mix(shadeCol, litCol, lit);
    float fres = 1.0 - max(dot(N, V), 0.0);
    float rim = smoothstep(0.62, 0.72, fres) * smoothstep(-0.25, 0.25, ndl);
    o = mix(o, col * uSunColor * 1.2 + 0.04, rim * 0.35);
    vec3 H = normalize(uKeyDir + V);
    o = mix(o, vec3(1.0), step(0.988, dot(N, H)) * lit * gloss * 0.85);
    return o;
  }

  vec3 applySoot(vec3 col, vec3 p){
    if(uSoot <= 0.001 || uSootK < 0.01) return col;
    float n = fbm3(p * 16.0 + 1.3) * 0.7 + vnoise3(p * 60.0) * 0.3;
    float k = smoothstep(1.02 - uSoot * 1.08, 1.1 - uSoot * 1.0, n + 0.12) * uSootK;
    k = max(k, smoothstep(0.75, 1.0, uSoot) * uSootK * 0.9);
    vec3 sc = mix(vec3(0.065, 0.058, 0.065), vec3(0.17, 0.15, 0.15), vnoise3(p * 9.0));
    return mix(col, sc, k);
  }
`;

const FS_FUR = FS_HEAD + /* glsl */ `
  void main(){
    if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
    vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
    if(!gl_FrontFacing){ N = -N; NV = -NV; }
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 col = vCol;
    float rag = 0.0, id = uId;
    if(uFurK > 0.001){
      vec4 s = furSample(vRest, normalize(vLocalN));
      col = celTone(col, s.r);
      // short tufts in one darker tone; the shadow edge bites around them
      float tuft = aa(s.r - 0.68);
      col = mix(col, col * vec3(0.935, 0.915, 0.915), tuft * uFurK);
      rag = (tuft - 0.35) * uRagged * 0.55 * uFurK;
    }
    col = applySoot(col, vRest);
    vec3 outc = capyLight(col, N, V, rag, uGloss, 0.0);
    outc = rigLight(col, outc, N, V, vWorld);
    outc = min(outc, col * 1.6 + 0.05);
    writeOut(outc, 1.0, NV, vDepth, id);
  }
`;

// generic cel surfaces with a small pattern: 1 cloth, 2 rubber, 3 metal, 4 wood, 5 flat, 6 tin
const FS_CEL = FS_HEAD + /* glsl */ `
  uniform float uKind;
  void main(){
    if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
    vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
    if(!gl_FrontFacing){ N = -N; NV = -NV; }
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 col = vCol;
    float gloss = uGloss, rag = 0.0;
    float px = fwidth(vRest.y) * 1024.0;
    float near = 1.0 - smoothstep(0.4, 1.4, px * 0.06);
    vec3 r = vRest;
    if(uKind < 1.5){ // cloth: fold shadow, twill, faded patches, grime
      float fold = vFold;
      col = mix(col, col * vec3(0.87, 0.885, 0.885), aa(-0.42 - fold));
      col = mix(col, col * 1.09, aa(fold - 0.5));
      float tw = sin((r.x * 1.0 + r.y * 1.0 + r.z * 0.7) * 620.0);
      col = mix(col, col * 0.94, step(0.25, tw) * near * 0.55);
      float fade = fbm3(r * 9.0 + 3.0);
      col = mix(col, col * vec3(1.13, 1.1, 1.0), aa(fade - 0.6) * 0.3);
      float grime = fbm3(r * 17.0 + 11.0);
      col = mix(col, col * vec3(0.88, 0.87, 0.89), aa(grime - 0.66) * 0.35);
      rag = (fade - 0.5) * 0.08;
    } else if(uKind < 2.5){ // rubber: scuffs + a soft band of shine
      float sc = fbm3(r * 34.0);
      col = mix(col, col * 1.15, aa(sc - 0.67) * 0.6);
      col = mix(col, col * 0.8, aa(fbm3(r * 12.0 + 2.0) - 0.65) * 0.6);
    } else if(uKind < 3.5){ // brass: bands from the normal, tiny scratches
      float b = N.y * 0.7 + N.x * 0.5;
      col = mix(col, col * 1.28 + vec3(0.1, 0.07, 0.02), aa(b - 0.45));
      col = mix(col, col * 0.72, aa(-0.2 - b));
      col = mix(col, vec3(1.0, 0.95, 0.72), aa(b - 0.82));
    } else if(uKind < 4.5){ // ash wood: long grain lines along the local axis
      float gr = vnoise(vec2(r.x * 170.0, r.y * 5.0) + r.z * 40.0) * 0.6 + vnoise(vec2(r.x * 56.0, r.y * 2.0) + 3.0) * 0.4;
      col = mix(col, col * vec3(0.8, 0.74, 0.68), aa(gr - 0.62) * 0.8);
      float knot = smoothstep(0.82, 0.86, vnoise(vec2(r.y * 13.0, r.x * 90.0 + r.z * 90.0)));
      col = mix(col, col * 0.7, knot * 0.8);
      rag = (gr - 0.5) * 0.05;
    } else if(uKind < 5.5){ // flat
    } else if(uKind > 7.5){ // dust puff: flat cream / peach / lilac bands by height
      float h = vFold;
      vec3 c = mix(vec3(0.78, 0.58, 0.74), mix(vec3(0.93, 0.7, 0.6), vec3(0.97, 0.93, 0.78), aa(h - 0.14)), aa(h + 0.34));
      c *= mix(vec3(1.0), mix(uSkyTint, uSunColor, 0.5), 0.6);
      writeOut(c, 1.0, NV, vDepth, uId);
      return;
    } else if(uKind > 6.5){ // leaf: its own ink (r.x = -1 edge, 0 midrib, 1 edge), so straw lying across it draws no outline
      float e = abs(r.x), w = max(fwidth(e) * 1.4, 0.05);
      col = mix(col, col * 0.82, 1.0 - smoothstep(0.0, w * 0.8, e - 0.02));
      col = mix(col, vec3(0.13, 0.1, 0.13), smoothstep(1.0 - w * 1.6, 1.0 - w * 0.8, e));
    } else { // tin: dents, scratches, hammered highlights
      float d = fbm3(r * 30.0);
      float b = N.y * 0.6 - N.z * 0.4 + d * 0.4;
      col = mix(col, col * 1.32 + vec3(0.05), aa(b - 0.5));
      col = mix(col, col * 0.72, aa(0.08 - b));
      col = mix(col, col * vec3(0.72, 0.56, 0.42), aa(fbm3(r * 21.0 + 7.0) - 0.68) * 0.75);   // rust spots
      float sc = abs(sin((r.x * 0.8 + r.y * 1.4) * 900.0));
      col = mix(col, col * 1.2, step(0.985, sc) * near * 0.8);
    }
    col = applySoot(col, r * 1.0);
    vec3 outc = capyLight(col, N, V, rag, gloss, 0.0);
    outc = rigLight(col, outc, N, V, vWorld);
    outc = min(outc, col * 1.6 + 0.05);
    writeOut(outc, 1.0, NV, vDepth, uId);
  }
`;

// Head skin: fur on bind position plus analytic face paint (nostril pad, morrillo, mouth interior from the aMask attribute)
const FS_SKIN = FS_HEAD + /* glsl */ `
  uniform float uDrip, uJaw, uOpen;
  uniform mat4 modelMatrix;
  float sdBoxR(vec3 p, vec3 c, vec3 h, float r){ vec3 q = abs(p - c) - h + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
  void main(){
    if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
    vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
    if(!gl_FrontFacing){ N = -N; NV = -NV; }
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 p = vRest;
    vec3 col = vCol;
    float id = uId;
    float rag = 0.0;
    float inMouth;
    if(uJaw > 0.5) inMouth = (sdBoxR(p, vec3(0.0, -0.05, 0.1), vec3(0.062, 0.042, 0.165), 0.02) < 0.004 || (normalize(vLocalN).y > 0.3 && p.y > -0.078 + 0.035 * smoothstep(0.14, -0.02, p.z) && p.z < 0.24 && abs(p.x) < 0.082 * (1.0 - 0.27 * smoothstep(-0.06, 0.16, p.z)))) ? 1.0 : 0.0;
    else { float tap = 1.0 - 0.27 * smoothstep(-0.06, 0.16, p.z); inMouth = (abs(sdBoxR(vec3(p.x / tap, p.yz), vec3(0.0, -0.113, 0.115), vec3(0.105, 0.075, 0.16), 0.022)) < 0.016 && p.y < -0.02) ? 1.0 : 0.0; }
    if(inMouth > 0.5 && uOpen > 0.01){
      // mouth interior: dark red, a lighter band near the lip, near black down the throat
      float band = aa(0.02 - abs(p.y + 0.085));
      col = mix(vec3(0.34, 0.07, 0.1), vec3(0.72, 0.28, 0.3), band);
      col = mix(col, vec3(0.07, 0.015, 0.03), smoothstep(0.17, 0.0, p.z));
      vec3 mc = col * mix(vec3(1.0), uSunColor, 0.15);
      writeOut(mc, 1.0, NV, vDepth, 44.0);
      return;
    }
    vec4 s = furSample(p, normalize(vLocalN));
    col = celTone(col, s.r);
    float muz = smoothstep(0.1, 0.22, p.z);
    float big = mix(1.0, 0.55, muz);
    float tuft = aa(s.r - 0.68);
    col = mix(col, col * vec3(0.935, 0.915, 0.915), tuft * big);
    rag = (tuft - 0.35) * uRagged * 0.55 * big;
    // philtrum groove and a little dark at the lip
    float ph = aa(0.0036 - abs(p.x)) * aa(p.z - 0.28) * aa(p.y + 0.1) * aa(0.012 - p.y);
    col = mix(col, vec3(0.1, 0.06, 0.06), ph * 0.9);
    col = applySoot(col, p);
    vec3 pn = normalize((p - vec3(0.0, -0.01, 0.04)) / vec3(0.18, 0.16, 0.36));
    vec3 Nl = normalize(normalize(mat3(modelMatrix) * pn) * 0.6 + N * 0.4);
    vec3 outc = capyLight(col, Nl, V, rag, 0.0, 0.85);
    outc = rigLight(col, outc, Nl, V, vWorld);
    outc = min(outc, col * 1.6 + 0.05);
    writeOut(outc, 1.0, NV, vDepth, id);
  }
`;

// The eyeball: unit-radius geometry scaled by the mesh; cream sclera, big dark-brown iris, pupil, two hard highlights.
const FS_EYE = FS_HEAD + /* glsl */ `
  uniform float uIrisR, uPupil;
  void main(){
    if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
    vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 p = normalize(vRest);
    vec3 col = vec3(0.97, 0.93, 0.84);
    float r = length(p.xy);
    float ndl = dot(N, uKeyDir);
    if(p.z > 0.0 && r < uIrisR){
      float t = r / uIrisR;
      vec3 irisA = vec3(0.19, 0.10, 0.06), irisB = vec3(0.47, 0.26, 0.11);
      float v = clamp(0.5 - p.y / uIrisR * 0.5, 0.0, 1.0);
      col = mix(irisA, irisB, smoothstep(0.1, 0.85, v) * smoothstep(1.0, 0.45, t));
      float a = atan(p.y, p.x);
      col *= 0.9 + 0.22 * vnoise(vec2(a * 11.0, t * 3.0));
      col = mix(col, irisA * 0.5, smoothstep(0.82, 0.94, t));
      if(r < uPupil) col = vec3(0.025, 0.018, 0.03);
    }
    // shade under the lid
    col *= mix(vec3(0.74, 0.73, 0.88), vec3(1.0), smoothstep(-0.05, 0.42, -p.y + 0.0 * ndl + 0.26));
    vec3 H = normalize(uKeyDir + V);
    float h1 = step(0.982, dot(N, H));
    float h2 = step(0.996, dot(N, normalize(H + vec3(-0.45, -0.55, 0.15))));
    col = mix(col, vec3(1.0), max(h1, h2));
    col = rigLight(col, col, N, V, vWorld);
    writeOut(col, 1.0, NV, vDepth, uId);
  }
`;

// The eyelid: same fur as the head with a dark lash rim. vRest.y near 0 = the lid edge.
const FS_LID = FS_HEAD + /* glsl */ `
  uniform float uEdge;
  void main(){
    if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
    vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
    if(!gl_FrontFacing){ N = -N; NV = -NV; }
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 p = vRest;
    vec3 col = vCol;
    float edge = abs(p.y) * uEdge;
    col = mix(col, vec3(0.1, 0.06, 0.07), aa(1.0 - edge));
    // a faint crease line near the top of the lid
    col = mix(col, col * 0.78, aa(0.0022 - abs(p.y - 0.018 * sign(uEdge))) * step(0.0, p.z) * 0.0);
    col = applySoot(col, p + vec3(0.2, 0.31, 0.11));
    vec3 outc = capyLight(col, N, V, 0.0, 0.0, 0.42);
    outc = rigLight(col, outc, N, V, vWorld);
    outc = min(outc, col * 1.6 + 0.05);
    writeOut(outc, 1.0, NV, vDepth, uId);
  }
`;

// Nose patch: flat dark rhinarium with two wide nostril slits, drawn analytically in the head's bind frame.
const FS_NOSE = FS_HEAD + /* glsl */ `
  uniform float uFlare;
  uniform mat4 modelMatrix;
  void main(){
    if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
    vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 p = vRest;
    float ax = abs(p.x);
    // pad outline: a wide, soft-cornered shield on the upper front of the muzzle
    float cy = 0.062;
    float q = pow(abs(p.x / 0.076), 2.6) + pow(abs((p.y - cy) / 0.045), 2.8);
    if(q > 1.0 || p.z < 0.2 || normalize(vLocalN).z < 0.45) discard;
    vec3 col = mix(vec3(0.17, 0.12, 0.12), vec3(0.3, 0.22, 0.2), smoothstep(-0.02, 0.05, p.y - cy + ax * 0.15));
    // wide comma nostrils set wide and high on the pad
    vec2 n = vec2(ax - 0.046, p.y - cy - 0.004 + 0.22 * (ax - 0.046));
    float wide = 0.026 + 0.007 * uFlare, tall = 0.0052 + 0.006 * uFlare;
    float d = length(n / vec2(wide, tall));
    float nost = 1.0 - smoothstep(0.92, 1.0, d);
    col = mix(col, vec3(0.03, 0.02, 0.03), nost);
    float rimN = (1.0 - smoothstep(1.0, 1.25, d)) * (1.0 - nost);
    col = mix(col, vec3(0.1, 0.07, 0.07), rimN);
    // the groove down the middle, only below the nostrils
    col = mix(col, col * 0.62, aa(0.0024 - ax) * smoothstep(0.016, 0.0, p.y - cy) * 0.9);
    col *= 0.96 + 0.1 * vnoise(p.xy * 300.0);
    col = applySoot(col, p);
    vec3 Nl = normalize(normalize(mat3(modelMatrix) * normalize((p - vec3(0.0, -0.01, 0.04)) / vec3(0.18, 0.16, 0.36))) * 0.7 + N * 0.3);
    vec3 outc = capyLight(col, Nl, V, 0.0, 0.0, 0.85);
    // the wet: two small painted glints on the upper pad
    float g1 = aa(0.0026 * (1.0 - pow(ax / 0.03, 2.0)) - abs(p.y - cy - 0.031 + 2.6 * p.x * p.x));
    float k = smoothstep(0.05, 0.3, dot(N, uKeyDir));
    outc = mix(outc, vec3(0.86, 0.85, 0.9), g1 * k * 0.8 * (1.0 - uSoot * 0.8));
    outc = rigLight(col, outc, N, V, vWorld);
    outc = min(outc, col * 1.6 + 0.05);
    writeOut(outc, 1.0, NV, vDepth, uId);
  }
`;

function build(fs, u, o = {}) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { ...G, ...CU, uInflate: { value: o.inflate ?? 0 }, ...u },
    vertexShader: VS,
    fragmentShader: fs,
    side: o.side ?? THREE.FrontSide,
    ...(o.poly ? { polygonOffset: true, polygonOffsetFactor: o.poly, polygonOffsetUnits: o.poly * 2 } : {}),
  });
}

const base = (o) => ({
  uId: { value: o.id ?? 40 }, uFurK: { value: o.fur ?? 0 }, uFurSize: { value: o.size ?? 1 }, uFlow: { value: o.flow ?? 0 },
  uGloss: { value: o.gloss ?? 0 }, uRagged: { value: o.ragged ?? 0.32 }, uSootK: { value: o.soot ?? 1 }, uDetailK: { value: o.detail ?? 1 },
});

export const furMat = (o = {}) => build(FS_FUR, base({ fur: 1, ...o }), o);
export const celMat = (kind, o = {}) => build(FS_CEL, { ...base(o), uKind: { value: kind } }, o);
export const skinMat = (o = {}) => build(FS_SKIN, { ...base({ fur: 1, flow: 1, ...o }), uDrip: { value: 0 }, uJaw: { value: o.jaw ? 1 : 0 }, uOpen: { value: 0 } }, o);
export const eyeMat = (o = {}) => build(FS_EYE, { ...base(o), uIrisR: { value: o.irisR ?? 0.78 }, uPupil: { value: o.pupil ?? 0.42 } }, o);
export const lidMat = (o = {}) => build(FS_LID, { ...base(o), uEdge: { value: o.edge ?? 160 } }, o);
export const noseMat = (o = {}) => build(FS_NOSE, { ...base(o), uFlare: { value: 0 } }, { ...o, poly: -2 });

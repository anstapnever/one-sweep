import * as THREE from 'three';
import { G, COMMON, MRT_OUT } from './glsl.js';
import { ORBIT } from './layout.js';
import { orbitCam } from './heavens-time.js';

// The orbit set, built around ORBIT.origin and visible only when st.set === 'orbit':
// a painted planet whose whole cloud cover is a pure function drawn in the sphere's own fragment shader, so the line that
// opens it is razor-straight at any zoom; the thin bright ring with its sparkling city band; atmosphere limb; sun with a lens star.
const R = ORBIT.planetR;
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

const CLOUD_GLSL = /* glsl */ `
  uniform vec3 uLineN, uLineC, uLineT2;
  uniform float uLineHead, uLineW, uLinePile, uLineLen, uLineClose;
  uniform vec3 uSpiralC;
  uniform float uSpiralS, uSpiralRot, uCloudT;
  vec3 rotAbout(vec3 p, vec3 a, float ang){ float c = cos(ang), s = sin(ang); return p * c + cross(a, p) * s + a * dot(a, p) * (1.0 - c); }
  float billow3(vec3 p){ float s = 0.0, a = 0.5; for(int i = 0; i < 3; i++){ s += a * abs(2.0 * vnoise3(p) - 1.0); p = p * 2.13 + vec3(3.1, 1.7, 8.3); a *= 0.5; } return s; }
  float cyc(vec3 p, vec3 c, float r){ return exp(-pow(acos(clamp(dot(p, c), -1.0, 1.0)) / r, 2.0)); }
  // six fixed cyclones wind the bands into the swirls you see on a real globe, only cleaner
  vec3 swirl(vec3 d){
    vec3 p = d;
    p = rotAbout(p, vec3(0.3536, 0.3536, 0.866), 2.4 * cyc(p, vec3(0.3536, 0.3536, 0.866), 0.42));
    p = rotAbout(p, vec3(-0.6, 0.5, 0.6245), -2.9 * cyc(p, vec3(-0.6, 0.5, 0.6245), 0.5));
    p = rotAbout(p, vec3(0.7, -0.42, 0.5771), -2.2 * cyc(p, vec3(0.7, -0.42, 0.5771), 0.38));
    p = rotAbout(p, vec3(-0.1, -0.62, 0.778), 2.7 * cyc(p, vec3(-0.1, -0.62, 0.778), 0.45));
    p = rotAbout(p, vec3(0.92, 0.2, -0.3366), 2.6 * cyc(p, vec3(0.92, 0.2, -0.3366), 0.5));
    p = rotAbout(p, vec3(0.5, 0.62, -0.6047), -2.2 * cyc(p, vec3(0.5, 0.62, -0.6047), 0.4));
    return p;
  }
  float cloudH(vec3 d){
    vec3 p = swirl(d);
    vec3 q = vec3(p.x, p.y * 2.3, p.z);
    float big = fbm3(q * 1.9 + vec3(3.0, 1.0, 7.0));
    float belt = cos(asin(clamp(p.y, -1.0, 1.0)) * 6.0 + big * 2.2) * 0.075;
    float b1 = billow3(p * 8.5 + big * 3.0);
    float b2 = billow3(p * 31.0 + vec3(big));
    return big + belt + (b1 - 0.42) * 0.2 + (b2 - 0.42) * 0.065 - uCloudT;
  }
  // backward map: where did the cloud now at d come from? ridge = 1 at the lip of the opened lane
  float cloudAt(vec3 d, out float ridge){
    ridge = 0.0;
    float arm = 0.0;
    vec3 p = d;
    float sd = 1.0;
    if(uLineHead > 0.0){
      float s = clamp(dot(d, uLineN), -1.0, 1.0);
      float lat = asin(s);
      vec3 onC = d - uLineN * s;
      float az = mod(atan(dot(onC, uLineT2), dot(onC, uLineC)), 6.2831853);
      // a blade: the lane is a sharp wedge behind the travelling head, full width a little way back
      float behind = uLineHead - az;
      float wedge = behind > 0.0 ? pow(clamp(behind / uLineLen, 0.0, 1.0), 0.62) : 0.0;
      float tailK = max(uLineClose, smoothstep(-0.02, 0.5, az));
      float w = uLineW * wedge * tailK;
      float lim = w + uLinePile * max(wedge, 0.0);
      float al = abs(lat);
      if(w > 0.0){
        sd = (al - w) * 26.0;
        if(al < lim){
          float nf = pow(clamp((al - w) / max(lim - w, 1e-4), 0.0, 1.0), 0.66);
          float lat0 = sign(lat) * lim * nf;
          vec3 onN = normalize(onC + vec3(1e-6));
          p = onN * cos(lat0) + uLineN * sin(lat0);
          ridge = 1.0 - nf;
        }
      }
    }
    if(uSpiralS > 0.001){
      vec3 C = uSpiralC;
      float th = acos(clamp(dot(p, C), -1.0, 1.0));
      float th0 = th * (1.0 + uSpiralS * 0.75 * smoothstep(1.4, 0.0, th));
      vec3 p1 = C * cos(th0) + normalize(p - C * dot(p, C) + vec3(1e-6)) * sin(th0);
      p = rotAbout(p1, C, -(uSpiralS * 3.6 / (th * 2.4 + 0.3) + uSpiralRot));
      // arms laid out in the source space, so the same flow winds them into a spiral that matches the streaks
      vec3 e1 = normalize(cross(C, vec3(0.31, 0.93, 0.2)));
      vec3 e2 = cross(C, e1);
      arm = cos(3.0 * atan(dot(p, e2), dot(p, e1)) + 0.6) * smoothstep(1.75, 0.3, th) * smoothstep(0.1, 0.5, uSpiralS);
    }
    float h = cloudH(p) + arm * 0.2 - abs(arm) * 0.04;
    h += ridge * ridge * 0.34;
    // the lip of the lane is scalloped a little, then stays dead straight along its length
    if(sd < 1.0) sd += (billow3(d * 40.0) - 0.4) * 0.5;
    return min(h, sd);
  }
`;

function planetMaterial(skyU) {
  const u = {
    ...G,
    uSun: { value: new THREE.Vector3(0, 0, 1) },
    uRingN: { value: new THREE.Vector3(0, 1, 0) },
    uRingR: { value: ORBIT.ringR },
    uRingW: { value: ORBIT.ringWidth },
    uO: { value: new THREE.Vector3(...ORBIT.origin) },
    uLineN: { value: new THREE.Vector3(0, 1, 0) }, uLineC: { value: new THREE.Vector3(1, 0, 0) }, uLineT2: { value: new THREE.Vector3(0, 0, 1) },
    uLineHead: { value: 0 }, uLineW: { value: 0 }, uLinePile: { value: 0.1 }, uLineLen: { value: 1.2 }, uLineClose: { value: 0 },
    uSpiralC: { value: new THREE.Vector3(1, 0, 0) }, uSpiralS: { value: 0 }, uSpiralRot: { value: 0 }, uCloudT: { value: 0.4 },
    uStarK: { value: 0 },
    uCloudLit: skyU.uCloudLit, uCloudMid: skyU.uCloudMid, uCloudShade: skyU.uCloudShade,
  };
  const vs = /* glsl */ `
    varying vec3 vN, vW;
    varying float vDepth;
    void main(){
      vN = normalize(position);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vW = wp.xyz;
      vec4 mv = viewMatrix * wp;
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${CLOUD_GLSL}
    uniform vec3 uSun, uRingN, uCloudLit, uCloudMid, uCloudShade, uO;
    uniform float uRingR, uRingW, uStarK;
    varying vec3 vN, vW;
    varying float vDepth;
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 N = normalize(vN);
      vec3 V = normalize(cameraPosition - vW);
      float ndl = dot(N, uSun);
      float day = smoothstep(-0.1, 0.1, ndl);
      // ---- oceans: flat painted bands of azure, deep to shallow, one soft sweep of brush across them
      float sweep = fbm3(vec3(N.x * 1.3, N.y * 2.6, N.z * 1.3) + 11.0);
      float cont = fbm3(N * 2.1 + 3.0) + 0.22 * fbm3(N * 7.0 + 8.0) + 0.05 * (fbm3(N * 23.0 + 1.3) - 0.5) + 0.018 * (fbm3(N * 71.0 + 5.1) - 0.5);
      float deepK = smoothstep(0.34, 0.66, sweep);
      vec3 ocean = mix(vec3(0.02, 0.27, 0.8), vec3(0.05, 0.44, 1.0), deepK);
      ocean = mix(ocean, vec3(0.08, 0.5, 0.95), smoothstep(0.625, 0.635, cont + (sweep - 0.5) * 0.03) * 0.6);
      ocean = mix(ocean, vec3(0.22, 0.76, 0.84), smoothstep(0.675, 0.682, cont + (sweep - 0.5) * 0.02));
      // ---- land: three flat tones, a pale coast, white ranges
      float landK = smoothstep(0.696, 0.704, cont);
      float m = fbm3(N * 5.5 + 2.0);
      float rg = billow3(N * 15.0 + 4.0);
      vec3 land = mix(vec3(0.74, 0.67, 0.5), vec3(0.36, 0.55, 0.32), smoothstep(0.4, 0.43, m));
      land = mix(land, vec3(0.15, 0.36, 0.25), smoothstep(0.55, 0.58, m));
      land = mix(land, vec3(0.93, 0.9, 0.84), smoothstep(0.66, 0.7, m + (0.42 - rg) * 0.3));
      vec3 col = mix(ocean, land, landK);
      col = mix(col, vec3(0.92, 0.96, 0.98), smoothstep(0.69, 0.697, cont) * (1.0 - landK) * 0.55);
      // ---- cloud cover, with the shadow it throws on the sea
      vec3 tS = uSun - N * ndl;
      float tl = length(tS); tS = tl > 1e-3 ? tS / tl : vec3(0.0, 1.0, 0.0);
      float rid0, ridS;
      float h0 = cloudAt(N, rid0);
      float cFw = max(fwidth(h0) * 1.1, 1e-3);
      float cA = smoothstep(0.0, cFw, h0);
      float hSh = cloudAt(normalize(N + tS * 0.018), ridS);
      float shadow = smoothstep(0.0, 0.012, hSh) * (1.0 - cA);
      col *= 1.0 - shadow * 0.55 * day;
      col = mix(col, col * vec3(0.55, 0.6, 1.0), shadow * 0.4 * day);
      // ---- sunlight on the surface
      vec3 litC = col * mix(vec3(0.86, 0.9, 1.0), vec3(1.06, 1.02, 0.96), day) * (0.68 + 0.32 * smoothstep(0.0, 0.55, ndl));
      vec3 outc = mix(col * vec3(0.03, 0.05, 0.13) + vec3(0.0, 0.004, 0.02), litC, day);
      // small painted sun-glint on open water
      vec3 H = normalize(uSun + V);
      float nh = max(dot(N, H), 0.0);
      outc += (1.0 - landK) * day * (1.0 - shadow) * vec3(1.0, 0.98, 0.9) * (pow(nh, 170.0) * 0.05 + pow(nh, 26.0) * 0.08);
      // the warm line where day turns to night
      outc += vec3(0.95, 0.42, 0.24) * smoothstep(0.16, 0.02, ndl) * smoothstep(-0.1, 0.03, ndl) * 0.2;
      // city lights on the night coasts
      float cty = smoothstep(0.66, 0.7, cont) * step(cont, 0.74) * step(0.986, hash13(floor(N * 260.0)));
      outc += vec3(1.1, 0.78, 0.4) * cty * (1.0 - day) * 1.3;
      // ---- cloud tones: two scales of relief against the sun, hard painted steps
      float rb, rs;
      float hB = cloudAt(normalize(N + tS * 0.03), rb);
      float hS = cloudAt(normalize(N + tS * 0.0065), rs);
      float L = (h0 - hB) * 5.0 + (h0 - hS) * 9.0 + min(h0, 0.2) * 0.8 + 0.14;
      L += rid0 * 0.2;
      vec3 cS = mix(uCloudShade, vec3(0.3, 0.38, 0.86), 0.55), cM = mix(uCloudMid, vec3(0.6, 0.73, 0.98), 0.55), cH = mix(uCloudLit, vec3(1.0, 0.99, 0.96), 0.55);
      vec3 sh = mix(cS * vec3(0.84, 0.86, 1.08), cS, smoothstep(-0.18, -0.05, L));
      vec3 cc = mix(sh, cM, smoothstep(-0.015, 0.015, L));
      cc = mix(cc, cH * 1.04, smoothstep(0.1, 0.13, L));
      // a thin bright crest on the lip of the lane
      cc = mix(cc, vec3(1.32, 1.3, 1.22), smoothstep(0.86, 0.985, rid0) * 0.9);
      // ---- day, gold terminator, night
      float gold = smoothstep(0.13, 0.03, ndl) * smoothstep(-0.14, 0.02, ndl);
      cc = mix(cc, cc * vec3(1.14, 0.66, 0.58) + vec3(0.14, 0.03, 0.06), gold * 0.85);
      cc = mix(cc, uCloudShade * vec3(0.2, 0.25, 0.52), smoothstep(0.03, -0.14, ndl));
      // lime of the star on the deck below it
      float sa = acos(clamp(dot(N, uSpiralC), -1.0, 1.0));
      cc += vec3(0.5, 0.95, 0.12) * uStarK * (exp(-sa * 7.0) * 1.1 + exp(-sa * 2.4) * 0.08);
      outc = mix(outc, cc, cA);
      // ---- the stroke itself: a white-hot needle running ahead of the opening and speed-strands left behind in the lane
      if(uLineHead > 0.0){
        float s1 = clamp(dot(N, uLineN), -1.0, 1.0);
        float lat1 = asin(s1);
        vec3 onC1 = N - uLineN * s1;
        float az1 = mod(atan(dot(onC1, uLineT2), dot(onC1, uLineC)), 6.2831853);
        float ah = az1 - uLineHead;
        float wNeedle = 0.0028 * smoothstep(0.6, 0.0, ah);
        float needle = smoothstep(wNeedle * 1.6, wNeedle * 0.5, abs(lat1)) * step(-0.05, ah) * smoothstep(0.55, 0.0, ah);
        float tipGlow = exp(-pow(ah / 0.07, 2.0) - pow(lat1 / 0.03, 2.0));
        outc += vec3(1.5, 1.5, 1.35) * needle * day + vec3(1.2, 1.25, 1.0) * tipGlow * 0.8 * day;
        float behind1 = uLineHead - az1;
        float laneW = uLineW * pow(clamp(behind1 / uLineLen, 0.0, 1.0), 0.62);
        if(behind1 > 0.0 && cA < 0.5 && abs(lat1) < laneW){
          float n1 = vnoise(vec2(az1 * 5.0, lat1 * 95.0));
          float n2 = vnoise(vec2(az1 * 11.0 + 7.0, lat1 * 240.0));
          float st1 = smoothstep(0.82, 0.86, n1) + 0.7 * smoothstep(0.86, 0.89, n2);
          float fade = smoothstep(2.4, 0.2, behind1) * (0.35 + 0.65 * smoothstep(0.0, 0.5, abs(lat1) / max(laneW, 1e-3)));
          outc = mix(outc, vec3(0.92, 0.96, 1.0), clamp(st1, 0.0, 1.0) * fade * 0.72 * day);
        }
      }
      // ---- ring's thin shadow
      float tR = dot(uRingN, -N) / (abs(dot(uRingN, uSun)) < 1e-4 ? 1e-4 : dot(uRingN, uSun));
      if(tR > 0.0){
        float rad = length(N + uSun * tR) * 6000.0;
        outc *= 1.0 - smoothstep(uRingW * 1.05, uRingW * 0.5, abs(rad - uRingR)) * 0.3 * day;
      }
      // ---- atmosphere: a painted blue band hugging the limb, day side only
      float fres = 1.0 - max(dot(N, V), 0.0);
      vec3 atm = vec3(0.42, 0.74, 1.0);
      // a long air gradient over the disc, then a very thin bright line: thin air is what makes a planet look huge
      outc = mix(outc, atm * (0.25 + 0.75 * day), smoothstep(0.42, 0.96, fres) * 0.6 * (0.2 + 0.8 * day));
      outc = mix(outc, vec3(0.86, 0.96, 1.05), smoothstep(0.978, 0.996, fres) * 0.8 * day);
      writeOut(outc, 1.0, vec3(0.0, 0.0, 1.0), 9000.0, 0.0);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs });
}

function atmosphereMesh(pu) {
  const geo = new THREE.SphereGeometry(R * 1.12, 128, 64);
  const u = { ...G, uSun: pu.uSun, uO: pu.uO };
  const vs = /* glsl */ `
    varying vec3 vW;
    void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    uniform vec3 uSun, uO;
    varying vec3 vW;
    layout(location = 0) out vec4 o;
    layout(location = 1) out vec4 oD;
    void main(){
      if(uPass > 0.5) discard;
      vec3 Rd = normalize(vW - cameraPosition);
      vec3 toC = uO - cameraPosition;
      vec3 cl = cameraPosition + Rd * dot(toC, Rd);    // nearest point of the sight line to the planet's centre
      float b = (length(cl - uO) - 6000.0) / 6000.0;   // height of that point above the surface, in planet radii
      vec3 Nc = normalize(cl - uO);
      float day = smoothstep(-0.28, 0.45, dot(Nc, uSun));
      if(b < 0.0) discard;
      float soft = exp(-b * 42.0);
      float band = smoothstep(0.012, 0.005, b);
      vec3 c = mix(vec3(0.16, 0.34, 0.95), vec3(0.5, 0.78, 1.05), day) * soft * 0.55 + vec3(0.72, 0.9, 1.05) * band * 0.4;
      c *= 0.12 + 0.88 * day;
      float ndlA = dot(Nc, uSun);
      c += vec3(1.0, 0.52, 0.3) * soft * exp(-pow(ndlA / 0.2, 2.0)) * 0.55;          // dawn along the terminator
      o = vec4(c, 1.0);
      oD = vec4(0.5, 0.5, 9000.0, 0.0);
    }
  `;
  const m = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(geo, m);
  mesh.frustumCulled = false;
  return mesh;
}

function ringMesh(pu) {
  // a flat band, the only geometry: everything else is drawn
  const SEG = 1440;
  const pos = [], uvs = [], idx = [];
  const w = ORBIT.ringWidth, rr = ORBIT.ringR;
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * TAU;
    const c = Math.cos(a), s = Math.sin(a);
    for (let j = 0; j < 4; j++) {
      const v = j / 3;
      const r = rr + (v - 0.5) * w;
      const h = (j === 1 || j === 2) ? w * 0.05 : 0.0;
      pos.push(c * r, h, s * r); uvs.push(a, v);
    }
  }
  for (let i = 0; i < SEG; i++) for (let j = 0; j < 3; j++) { const a = i * 4 + j, b = a + 1, d = a + 4, e = d + 1; idx.push(a, d, b, b, d, e); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  const u = { ...G, uSun: pu.uSun };
  const vs = /* glsl */ `
    varying vec2 vU; varying vec3 vW; varying float vDepth;
    void main(){ vU = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vec4 mv = viewMatrix * wp; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform vec3 uSun;
    varying vec2 vU; varying vec3 vW; varying float vDepth;
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 P = vW - vec3(0.0, 100000.0, 0.0);
      float v = vU.y, a = vU.x;
      vec3 sd = normalize(uSun);
      float tc = dot(-P, sd);
      float inShadow = tc > 0.0 ? smoothstep(6060.0, 5940.0, length(P + sd * tc)) : 0.0;
      // pearl deck, turquoise glass stripe, coral line, dark edge lines
      vec3 c = vec3(1.0, 0.97, 0.92);
      float seg = abs(fract(a * 90.0) * 2.0 - 1.0);
      c = mix(c, vec3(0.8, 0.78, 0.86), smoothstep(0.97, 1.0, seg));
      c = mix(c, vec3(0.26, 0.82, 0.88), step(0.42, v) * step(v, 0.5));
      c = mix(c, vec3(1.0, 0.45, 0.38), step(0.53, v) * step(v, 0.55));
      c = mix(c, vec3(0.2, 0.25, 0.5), smoothstep(0.06, 0.03, v) + smoothstep(0.94, 0.97, v));
      float city = smoothstep(0.06, 0.12, v) * smoothstep(0.42, 0.36, v) + smoothstep(0.58, 0.64, v) * smoothstep(0.94, 0.88, v);
      vec3 outc = mix(c, c * 0.14 + vec3(0.02, 0.03, 0.1), inShadow);
      // city sparkle in two sizes: tiny grain and rare hard glints
      vec2 g1 = vec2(a * 1800.0, v * 7.0);
      float id1 = hash12(floor(g1));
      float sp1 = smoothstep(0.5, 0.1, length(fract(g1) - 0.5));
      float tw1 = 0.55 + 0.45 * sin(uTime * (3.0 + id1 * 7.0) + id1 * 60.0);
      outc += vec3(1.25, 1.2, 1.0) * sp1 * step(0.8, id1) * city * tw1 * mix(0.8, 1.4, inShadow);
      vec2 g2 = vec2(a * 260.0, v * 3.0);
      float id2 = hash12(floor(g2) + 7.0);
      float sp2 = smoothstep(0.42, 0.04, length(fract(g2) - 0.5));
      float tw2 = pow(0.5 + 0.5 * sin(uTime * (2.0 + id2 * 6.0) + id2 * 40.0), 4.0);
      outc += vec3(1.6, 1.5, 1.2) * sp2 * step(0.7, id2) * city * tw2 * 1.5;
      writeOut(outc, 0.0, vec3(0.0, 0.0, 1.0), 9000.0, 100.0);
    }
  `;
  const m = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, m);
  mesh.frustumCulled = false;
  return mesh;
}

// additive billboard with the lens-star drawing, for the sun
function starMaterial() {
  const u = { uCore: { value: new THREE.Color('#fff6dc') }, uRay: { value: new THREE.Color('#ffeec4') }, uI: { value: 1 }, uSpin: { value: 0 }, uRays: { value: 6 } };
  const vs = /* glsl */ `
    uniform float uSpin;
    varying vec2 vQ;
    void main(){
      vQ = position.xy;
      vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      float s = length((modelMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
      vec4 mv = viewMatrix * vec4(c, 1.0);
      float cs = cos(uSpin), sn = sin(uSpin);
      mv.xy += vec2(cs * position.x - sn * position.y, sn * position.x + cs * position.y) * s;
      gl_Position = projectionMatrix * mv;
    }
  `;
  const fs = /* glsl */ `
    uniform vec3 uCore, uRay;
    uniform float uI, uRays;
    varying vec2 vQ;
    layout(location = 0) out vec4 o;
    layout(location = 1) out vec4 oD;
    void main(){
      float d = length(vQ);
      float ang = atan(vQ.y, vQ.x);
      float spike = pow(abs(cos(ang * uRays * 0.5)), 90.0) * exp(-d * 3.2);
      float spike2 = pow(abs(cos(ang * uRays * 0.5 + 1.57 / uRays)), 240.0) * exp(-d * 5.5) * 0.6;
      float core = smoothstep(0.1, 0.03, d);
      float glow = exp(-d * 9.0) * 0.8 + exp(-d * 2.6) * 0.1;
      vec3 c = uCore * core * 2.5 + uRay * (spike * 2.2 + spike2 * 1.5 + glow);
      o = vec4(c * uI, 1.0);
      oD = vec4(0.5, 0.5, 9000.0, 0.0);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
}

// right, up, toward-camera of a look-at camera
function camBasis(c) {
  const pos = new THREE.Vector3(...c.pos), look = new THREE.Vector3(...c.look);
  const back = pos.clone().sub(look).normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(back).normalize();
  const up = back.clone().cross(right);
  return { right, up, back, pos };
}

export function buildOrbit(ctx, skyU) {
  const C = ctx.CUES;
  const O = new THREE.Vector3(...ORBIT.origin);
  const root = new THREE.Group();
  root.position.copy(O);
  ctx.scene.add(root);
  root.visible = false;

  // the ring passes through the film's point (FX draws its star there, at height 0), tilted about that point's own axis
  const Md = new THREE.Vector3(Math.cos(ORBIT.markerAz), 0, Math.sin(ORBIT.markerAz)).normalize();
  const tiltA = 15 * DEG;
  const RN = new THREE.Vector3(0, 1, 0).multiplyScalar(Math.cos(tiltA)).add(new THREE.Vector3().crossVectors(Md, new THREE.Vector3(0, 1, 0)).multiplyScalar(Math.sin(tiltA))).normalize();
  const ringFrame = new THREE.Matrix4().makeBasis(Md, RN, new THREE.Vector3().crossVectors(Md, RN).normalize());

  const planet = new THREE.Mesh(new THREE.SphereGeometry(R, 256, 128), planetMaterial(skyU));
  root.add(planet);
  const pu = planet.material.uniforms;
  pu.uRingN.value.copy(RN);
  // the spiral's centre is the point of the deck seen right behind the star, so the arms wind around it on screen
  {
    const c = orbitCam('s21', 0.5);
    const cam = new THREE.Vector3(...c.pos).sub(O), star = Md.clone().multiplyScalar(ORBIT.ringR);
    const dir = star.clone().sub(cam).normalize();
    const b = cam.dot(dir), disc = b * b - (cam.lengthSq() - R * R);
    pu.uSpiralC.value.copy(cam.addScaledVector(dir, -b - Math.sqrt(Math.max(0, disc))).normalize());
  }
  root.add(atmosphereMesh(pu));
  const ring = ringMesh(pu);
  root.add(ring);
  ring.matrixAutoUpdate = false;
  ring.matrix.copy(ringFrame);

  // light is cheated per shot, always from the upper left and a little in front of the planet, so each frame is composed
  const b21 = camBasis(orbitCam('s21', 0.5)), b30 = camBasis(orbitCam('s30', 0.5));
  const sunFrom = (b, x, y, z) => b.right.clone().multiplyScalar(x).addScaledVector(b.up, y).addScaledVector(b.back, z).normalize();
  const SUN21 = sunFrom(b21, -0.58, 0.42, 0.7);
  const SUN30 = sunFrom(b30, -0.62, 0.44, 0.66);

  // the line: runs left to right across the face of the planet, rising a little, then right round the back
  const slope = 17 * DEG;
  const lineDirImg = b30.right.clone().multiplyScalar(Math.cos(slope)).addScaledVector(b30.up, Math.sin(slope)).normalize();
  const LN = b30.up.clone().multiplyScalar(Math.cos(slope)).addScaledVector(b30.right, -Math.sin(slope)).addScaledVector(b30.back, 0.08).normalize();
  const LC = lineDirImg.clone().multiplyScalar(-1).addScaledVector(LN, LN.dot(lineDirImg)).normalize();
  // start a little beyond the left limb, on the far side
  const LT2 = new THREE.Vector3().crossVectors(LN, LC).normalize();
  const LC0 = LC.clone().multiplyScalar(Math.cos(-0.22)).addScaledVector(LT2, Math.sin(-0.22)).normalize();
  const LT20 = new THREE.Vector3().crossVectors(LN, LC0).normalize();
  pu.uLineN.value.copy(LN); pu.uLineC.value.copy(LC0); pu.uLineT2.value.copy(LT20);

  // sun with the lens star: painted just off the limb, placed from the camera every frame
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), starMaterial());
  sun.scale.setScalar(9000);
  sun.material.uniforms.uRays.value = 8;
  root.add(sun);

  const _p = new THREE.Vector3();
  function update(st) {
    const vis = st.set === 'orbit';
    root.visible = vis;
    if (!vis) return;
    const t = st.t;
    const is21 = st.sid === 's21', is30 = st.sid === 's30';
    pu.uSun.value.copy(is21 ? SUN21 : SUN30);
    // ---- s21: the deck spirals toward the star
    const ls = Math.max(0, (t - C.star) / (C.veins - C.star));
    pu.uSpiralS.value = is21 ? 0.16 + 0.8 * Math.pow(Math.min(1, ls), 1.3) : 0;
    pu.uSpiralRot.value = is21 ? ls * 1.1 : 0;
    pu.uStarK.value = is21 ? Math.min(1, ls * 3) * 0.55 : 0;
    pu.uCloudT.value = is21 ? 0.39 : 0.315;
    // ---- s30: the line opens round the planet
    const lp = Math.max(0, t - C.planet);
    const dur = C.skyClear - C.planet;
    const k = Math.min(1.2, lp / dur);
    pu.uLineHead.value = is30 ? Math.pow(k, 1.15) * (TAU + 0.8) * 1.05 : 0;
    pu.uLineLen.value = 1.7;
    pu.uLineW.value = is30 ? (0.035 + 0.965 * Math.pow(Math.min(1, k * 1.02), 2.1)) * 31 * DEG : 0;
    pu.uLinePile.value = (7 + 9 * k) * DEG;
    pu.uLineClose.value = Math.min(1, Math.max(0, (pu.uLineHead.value - 2.6) / 2.6));
    // ---- sun: fixed on screen, just off the upper-left limb
    const c = st.cam;
    if (c && (is21 || is30)) {
      const b = is21 ? b21 : b30;
      _p.set(...c.pos).sub(O);
      const d = 90000;
      sun.position.copy(_p).addScaledVector(b.back, -d).addScaledVector(b.right, (is21 ? -0.42 : -0.46) * d).addScaledVector(b.up, (is21 ? 0.21 : 0.255) * d);
      sun.material.uniforms.uSpin.value = 0.13 + t * 0.03;
      sun.visible = true;
    } else sun.visible = false;
  }
  return { root, update, marker: Md.clone().multiplyScalar(ORBIT.ringR).add(O) };
}

import * as THREE from 'three';
import { G, COMMON, MRT_OUT, VERT_STD } from './glsl.js';

// WARLORD dept: wine-dark cel chitin, cut gems, the faceted eye and the plasma mantle.
// Every material takes the same state block WU (veins, white-hot, the broom's cut, the regrowth, the ash front).
export const WU = {
  uVein: { value: 0 },            // lime vein strength 0..1 (after the shed)
  uVeinPulse: { value: 0 },       // brightening pulse along the veins
  uHot: { value: 0 },             // white-hot body 0..1
  uBlack: { value: 0 },           // s22: everything black except veins and the eye
  uCutOn: { value: 0 },
  uCutN: { value: new THREE.Vector3(1, 0, 0) },
  uCutD: { value: 0 },            // keep fragments with dot(P, N) >= D
  uCutC: { value: new THREE.Vector3() },  // the jagged tear is anchored to the body, it must not crawl as he drifts
  uBoil: { value: 0 },            // the cut edge boils while re-knitting
  uDisOn: { value: 0 },
  uDisDir: { value: new THREE.Vector3(0, 0, 1) },
  uDisFront: { value: 0 },        // ash front: fragments with dot(P, Dir) < front are gone
  uScaleK: { value: 1 },          // root scale
};

const STATE_GLSL = /* glsl */ `
uniform float uVein, uVeinPulse, uHot, uBlack, uCutOn, uCutD, uBoil, uDisOn, uDisFront, uScaleK;
uniform vec3 uCutN, uDisDir, uCutC;
// signed "keep" value for the broom's cut (world position); < 0 means gone
float wCutSd(vec3 P){
  if(uCutOn < 0.5) return 10.0;
  float big = (vnoise3(P * 0.55 + vec3(3.1, uDrawTime * 2.2, 7.4)) - 0.5) * 3.0;
  float small = (vnoise3(P * 2.6 + vec3(uDrawTime * 5.0)) - 0.5) * 0.7;
  // a torn edge, not a slice: big rips, then saw teeth
  vec3 Q = P - uCutC;
  float rip = (vnoise3(Q * vec3(0.5, 0.5, 0.5) + 41.0) - 0.5) * 2.2;
  float tooth = abs(fract(Q.y * 0.95 + vnoise3(Q * 0.7 + 9.0) * 1.6) - 0.5) * 1.1 - 0.27;
  float fine = (vnoise3(Q * 3.4 + 17.0) - 0.5) * 0.34;
  return dot(P, uCutN) - uCutD + rip + tooth + fine + (big + small) * uBoil;
}
float wDisSd(vec3 P, float late){
  if(uDisOn < 0.5) return 10.0;
  P += uDisDir * late;
  float lob = (vnoise3(P * 0.42 + 13.0) - 0.5) * 7.0 + (vnoise3(P * 1.7 + 3.0) - 0.5) * 1.6;
  return dot(P, uDisDir) - uDisFront + lob;
}
// returns rim 0..1 and discards the part that is gone
float wStateClip(vec3 P, float late){
  float c = wCutSd(P); if(c < 0.0) discard;
  float d = wDisSd(P, late); if(d < 0.0) discard;
  float rim = 0.0;
  if(uCutOn > 0.5) rim = max(rim, 1.0 - smoothstep(0.015, mix(0.05, 0.3, uBoil), c));
  if(uDisOn > 0.5) rim = max(rim, 1.0 - smoothstep(0.03, 0.42, d));
  return rim;
}
vec3 wCellLime(vec3 v){ return vec3(0.72, 1.18, 0.14) * v; }
`;

// ------------------------------------------------------------------ chitin
export function chitinMaterial(o = {}) {
  const u = { ...G, ...WU, uCrack: o.uCrack ?? { value: 0 }, uDetailK: { value: o.detail ?? 1 } };
  const vs = /* glsl */ `
    attribute vec3 aCol;
    attribute vec4 aMat;
    attribute vec3 aEx;
    varying vec3 vCol, vLocal, vLocalN, vEx;
    varying vec4 vMat;
    ${VERT_STD}
    void main(){ vCol = aCol; vMat = aMat; vEx = aEx; vLocal = position; vLocalN = normal; stdVertex(position, normal); }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${STATE_GLSL}
    uniform float uCrack, uDetailK;
    varying vec3 vWorld, vNormalW, vNormalV, vCol, vLocal, vLocalN, vEx;
    varying vec4 vMat;
    varying float vDepth;
    varying vec2 vUv;

    // 3D cellular: returns F1, F2 (Euclidean, 2x2x2 fast search)
    vec2 cell3(vec3 x){
      vec3 p = floor(x), f = fract(x);
      float a = 8.0, b = 8.0;
      for(int k = -1; k <= 1; k++) for(int j = -1; j <= 1; j++) for(int i = -1; i <= 1; i++){
        vec3 g = vec3(float(i), float(j), float(k));
        vec3 o = vec3(hash13(p + g + 11.7), hash13(p + g + 23.1), hash13(p + g + 37.3));
        float d = dot(g + o - f, g + o - f);
        if(d < a){ b = a; a = d; } else if(d < b) b = d;
      }
      return sqrt(vec2(a, b));
    }

    float veinField(vec3 p, float mpp){
      float a = fbm3(p * 0.85 + 4.0);
      float b = vnoise3(p * 3.1 + 2.0);
      // line width follows the gradient of the field, so a vein stays a thin line instead of ballooning where the noise is flat
      float wa = clamp(fwidth(a) * 1.6, 0.002, 0.016);
      float trunk = 1.0 - smoothstep(wa * 0.6, wa * 1.5, abs(a - 0.5));
      float wb = clamp(fwidth(b) * 1.3, 0.002, 0.02);
      float branch = (1.0 - smoothstep(wb * 0.6, wb * 1.5, abs(b - 0.5))) * smoothstep(0.5, 0.6, vnoise3(p * 0.9 + 6.0));
      branch *= smoothstep(0.055, 0.02, mpp);        // far away only the main trunks are left, or the body turns to speckle
      return max(trunk, branch * 0.8);
    }

    void main(){
      float rim0 = wStateClip(vWorld, 0.0);
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 N = normalize(vNormalW);
      vec3 NV = normalize(vNormalV);
      bool back = !gl_FrontFacing;
      if(back){ N = -N; NV = -NV; }
      vec3 V = normalize(cameraPosition - vWorld);
      vec3 p = vLocal;
      float mpp = length(fwidth(p)) + 1e-5;
      float idF = floor(vMat.w + 0.5);
      float gloss = vMat.x, detail = vMat.y * uDetailK, emis = vMat.z;
      float edge = vEx.x, wear = vEx.y;

      vec3 col = vCol;
      float seamMask = 0.0;

      // ------------------- multi-scale chitin: every octave fades out once its features drop below a few pixels
      if(emis < 0.5 && detail > 0.001){
        // large: mottling, two hard tones, plum in the dark, garnet in the light (stays at every distance)
        float mot = fbm3(p * 0.62 + vCol * 19.0);
        float tMot = smoothstep(0.44, 0.47, mot) + smoothstep(0.58, 0.61, mot);
        col = mix(col * vec3(0.68, 0.62, 0.78), col, min(tMot, 1.0));
        col = mix(col, col * vec3(1.18, 1.1, 1.22) + vec3(0.015, 0.0, 0.02), max(tMot - 1.0, 0.0));

        // growth bands across the part
        float fB = smoothstep(0.1, 0.012, mpp);
        if(fB > 0.001){
          float by = p.y + (fbm3(p * 1.15) - 0.5) * 0.28;
          float s1 = 1.0 - smoothstep(0.0, 0.12, abs(fract(by * 3.1) - 0.5) * 2.0);
          float s2 = 1.0 - smoothstep(0.0, 0.08, abs(fract(by * 7.3 + 0.3) - 0.5) * 2.0);
          col = mix(col, col * vec3(1.24, 1.14, 1.26), s1 * fB * 0.6 * detail);
          col = mix(col, col * vec3(0.72, 0.68, 0.8), s2 * fB * 0.6 * detail);
        }
        // medium: plate seams and ridge scales
        float fS = smoothstep(0.09, 0.016, mpp);
        if(fS > 0.001){
          vec2 c = cell3(p * vec3(3.1, 2.2, 3.1) + 3.0);
          float brk = smoothstep(0.5, 0.64, fbm3(p * 1.1 + 13.0));
          float seam = (1.0 - smoothstep(0.008, 0.03, c.y - c.x)) * brk;
          float rid = (1.0 - smoothstep(0.03, 0.08, c.y - c.x)) * (1.0 - seam) * brk;
          col = mix(col, col * vec3(0.55, 0.46, 0.62), seam * fS * detail * 0.6);
          col = mix(col, mix(col, vec3(1.0, 0.56, 0.58), 0.35), rid * fS * detail * 0.4);
          seamMask = seam * fS;
        }
        // scars: long thin pale gouges
        float fC = smoothstep(0.03, 0.005, mpp);
        if(fC > 0.001){
          float sc1 = vnoise3(vec3(p.x * 9.0 + p.z * 3.0, p.y * 0.9, p.z * 9.0 - p.x * 2.0) + 21.0);
          float scar = (1.0 - smoothstep(0.004, 0.016, abs(sc1 - 0.5))) * smoothstep(0.55, 0.62, fbm3(p * 0.9 + 8.0));
          col = mix(col, vec3(0.98, 0.62, 0.55), scar * fC * detail);
          col = mix(col, col * vec3(0.5, 0.4, 0.55), (1.0 - smoothstep(0.016, 0.03, abs(sc1 - 0.5))) * (1.0 - scar) * smoothstep(0.55, 0.62, fbm3(p * 0.9 + 8.0)) * fC * detail);
        }
        // small: pits with a lit lower lip
        float fP = smoothstep(0.014, 0.003, mpp);
        if(fP > 0.001){
          vec2 c2 = cell3(p * 11.0);
          float pit = 1.0 - smoothstep(0.09, 0.16, c2.x);
          pit *= smoothstep(0.42, 0.55, vnoise3(p * 3.1 + 5.0));
          col = mix(col, col * vec3(0.46, 0.42, 0.58), pit * fP * detail * 0.9);
          float gr = vnoise3(p * 46.0);
          col *= 1.0 + (step(0.62, gr) - step(gr, 0.38)) * 0.07 * fP * detail;
        }
      }
      // ridges: coral along every plate edge
      float coral = smoothstep(0.62, 0.95, edge);
      float broke = 0.7 + 0.3 * step(0.44, vnoise3(p * 7.0));
      col = mix(col, vec3(0.93, 0.36, 0.5), coral * broke * step(emis, 0.5) * 0.8);

      // ------------------- cel light: two tones
      float ndl = dot(N, uKeyDir);
      float sh = sunShadow(vWorld, N);
      float lit = smoothstep(-0.03, 0.05, ndl) * sh;
      vec3 litCol = col * mix(uSkyTint, uSunColor * 0.92, uSunStrength);
      float up = smoothstep(-0.7, 0.6, N.y);
      vec3 shadeCol = col * uShadeTint * mix(uBounce, vec3(1.0), up) * 1.08;
      vec3 outc = mix(mix(shadeCol, litCol, 0.15), litCol, lit);
      float deep = step(ndl, -0.55) * step(N.y, -0.35);
      outc = mix(outc, col * uDeepTint, deep * 0.8);

      // ------------------- lacquer: painted sky band and a hard hot highlight
      vec3 R = reflect(-V, N);
      float bandEdge = R.y + (vnoise3(vWorld * 0.7) - 0.5) * 0.08;
      float sky = smoothstep(0.5, 0.52, bandEdge) * (1.0 - smoothstep(0.62, 0.64, bandEdge));
      float lower = smoothstep(-0.42, -0.4, bandEdge) * (1.0 - smoothstep(-0.26, -0.24, bandEdge));
      outc = mix(outc, outc * 0.5 + vec3(0.62, 0.4, 0.62) * (0.5 + 0.5 * lit), sky * gloss * 0.5 * (1.0 - coral));
      outc = mix(outc, outc * 0.7 + vec3(0.75, 0.34, 0.42) * 0.5, lower * gloss * 0.3 * (1.0 - coral));
      vec3 H = normalize(uKeyDir + V);
      float sp = dot(N, H);
      float spec = step(0.982, sp) * lit;
      outc = mix(outc, vec3(1.12, 1.0, 0.94), spec * gloss * (1.0 - 0.8 * seamMask));
      float fres = 1.0 - max(dot(N, V), 0.0);
      float rimL = smoothstep(0.72, 0.78, fres) * (0.3 + 0.7 * lit);
      outc = mix(outc, vec3(0.98, 0.5, 0.66), rimL * 0.42 * gloss);

      // ------------------- emissive classes: 1 lime inlay, 2 gem, 3 cream-white bone (no change)
      if(emis > 0.5 && emis < 1.5){
        outc = vec3(0.9, 1.5, 0.24) * (0.8 + 0.5 * uVein);
      } else if(emis > 1.5 && emis < 2.5){
        // cut gem: flat facets in three hard tones and white glints that travel with the view
        vec3 fn = normalize(vLocalN);
        float h = fract(sin(dot(floor(fn * 7.0 + 0.5), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        float tone = dot(N, normalize(uKeyDir + vec3(0.0, 0.6, 0.0)));
        vec3 gem = vCol * mix(0.46, 1.05, smoothstep(-0.2, 0.4, tone + (h - 0.5) * 0.6));
        gem = mix(gem, vCol * 1.5 + 0.25, step(0.78, h));
        float glint = step(0.986, dot(R, normalize(uKeyDir + vec3(sin(h * 19.0 + vWorld.x), 0.4, cos(h * 17.0 + vWorld.z)) * 0.18)));
        float tw = 0.4 + 0.6 * step(0.5, sin(uDrawTime * 11.0 + h * 40.0));
        outc = mix(gem, vec3(1.8, 1.8, 1.7), glint * tw);
      }

      // ------------------- states
      // the armour cracks along its seams before it bursts
      if(uCrack > 0.001){
        float e2 = max(step(0.5, edge), seamMask);
        float grow = smoothstep(1.0 - uCrack, 1.0, fbm3(p * 1.3 + 2.0) + 0.42);
        outc = mix(outc, vec3(1.1, 1.65, 0.28) * (1.0 + 0.5 * uCrack), e2 * grow * step(emis, 0.5));
      }
      // white-hot body
      if(uHot > 0.001){
        // keeps its form: a lit side and a shaded side, so the body is never a flat white blob
        vec3 hot = mix(vec3(0.94, 0.82, 0.5), vec3(1.2, 1.18, 1.02), lit);
        float flick = step(0.32, vnoise3(p * 1.3 + uDrawTime * 2.0));
        outc = mix(outc, hot, uHot * (0.85 + 0.15 * flick));
      }
      if(uBlack > 0.001 && emis < 1.5) outc = mix(outc, vec3(0.0), uBlack);
      // lime veins under the skin (body, not gems)
      if(uVein > 0.001 && emis < 1.5){
        float v = veinField(p, mpp);
        float flow = 0.72 + 0.5 * step(0.55, fract(p.y * 0.8 - uDrawTime * 1.8 + vnoise3(p * 0.6) * 2.0));
        vec3 lime = mix(vec3(0.62, 1.05, 0.08), vec3(1.5, 1.85, 0.5), uVeinPulse * 0.7 + 0.2) * flow;
        // on the white-hot body the veins go dark lime so they still read
        lime = mix(lime, vec3(0.16, 0.3, 0.02), uHot * (1.0 - uBlack));
        outc = mix(outc, lime, v * uVein);
      }
      // the inside of a cut body: wet coral flesh, lime threads
      if(back){
        vec3 fl = mix(vec3(0.92, 0.32, 0.34), vec3(1.0, 0.62, 0.5), step(0.5, fbm3(p * 2.6)));
        float thr = 1.0 - smoothstep(0.01, 0.03, abs(vnoise3(p * 3.0) - 0.5));
        outc = mix(fl * (0.65 + 0.35 * lit), vec3(0.85, 1.4, 0.22), thr);
      }
      // the moving light may colour the cream and bone, not blow them out
      float lumA = max(max(col.r, col.g), col.b);
      if(!back){ vec3 pre = outc; outc = rigLight(col * min(1.0, 0.3 / max(lumA, 0.001)), outc, N, V, vWorld); outc = mix(pre, outc, 0.42); }
      // edge of a cut / the ash front: white-lime
      outc = mix(outc, vec3(1.45, 1.95, 0.55), rim0);
      writeOut(outc, 1.0, NV, vDepth, idF);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide, transparent: false });
}

// ------------------------------------------------------------- the gem eye
// Local +X is the outward axis of the (mirrored) eye. uPupil: 0 tightened slit, 1 wide. uLight: lightning strength.
export function gemEyeMaterial(o = {}) {
  const u = {
    ...G, ...WU,
    uPupil: { value: 0.5 },
    uLight: { value: 0.3 },
    uDead: { value: 0 },
    uId: { value: o.id ?? 39 },
    uPupilDir: { value: new THREE.Vector3(...(o.pupilDir ?? [0.82, 0.0, 0.57])).normalize() },
  };
  const vs = /* glsl */ `
    varying vec3 vLocal, vLocalN;
    ${VERT_STD}
    void main(){ vLocal = position; vLocalN = normal; stdVertex(position, normal); }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${STATE_GLSL}
    uniform float uPupil, uLight, uDead, uId;
    uniform vec3 uPupilDir;
    varying vec3 vWorld, vNormalW, vNormalV, vLocal, vLocalN;
    varying float vDepth;
    varying vec2 vUv;
    // hex cell id (axial) and distance to its border
    vec3 hexCell(vec2 p){
      const vec2 s = vec2(1.7320508, 1.0);
      vec4 hc = floor(vec4(p, p - vec2(0.5 * s.x, 0.5)) / s.xyxy) + 0.5;
      vec4 rc = vec4(p - hc.xy * s, p - (hc.zw + 0.5) * s);
      vec2 g, id;
      if(dot(rc.xy, rc.xy) < dot(rc.zw, rc.zw)){ g = rc.xy; id = hc.xy; } else { g = rc.zw; id = hc.zw + 0.5; }
      vec2 a = abs(g);
      float d = 0.5 - max(a.y, dot(a, normalize(s)));
      return vec3(id, d);
    }
    void main(){
      float rim0 = wStateClip(vWorld, 0.8);
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      vec3 V = normalize(cameraPosition - vWorld);
      vec3 d = normalize(vLocal);
      // gaze frame around the pupil direction
      vec3 pd = uPupilDir, ax = normalize(cross(vec3(0.0, 1.0, 0.0), pd)), ay = cross(pd, ax);
      vec2 q = vec2(dot(d, ax), dot(d, ay)) / max(1.0 + dot(d, pd), 0.12);
      float mpp = length(fwidth(q)) + 1e-5;

      vec3 hx = hexCell(q * 17.0);
      float facet = fract(sin(dot(hx.xy, vec2(41.3, 289.1))) * 43758.5453);
      vec2 qc = hx.xy * vec2(1.7320508, 1.0) / 17.0;
      float line = 1.0 - smoothstep(0.02, 0.09, hx.z);
      float hFade = smoothstep(0.4 / 17.0, 0.1 / 17.0, mpp);

      float r = length(q);
      // base gem: deep turquoise body, brighter ring around the pupil, per-facet tone
      float cR = length(qc);
      vec3 cc = mix(vec3(0.05, 0.74, 0.70), vec3(0.03, 0.34, 0.42), smoothstep(0.08, 0.9, cR));
      cc *= 0.82 + 0.5 * step(0.5, facet) * 0.5 + 0.42 * step(0.78, facet);
      // a warm lower glow: citrine bounces inside the gem
      cc = mix(cc, vec3(0.92, 0.72, 0.18), smoothstep(0.1, 0.9, -qc.y) * step(0.36, facet) * 0.35);
      vec3 col = mix(cc * 0.92, cc, step(0.3, facet));
      col = mix(col, col * 0.42, line * hFade);

      float tt = uDrawTime;
      // lime lightning inside the eye: two jagged arcs that re-draw on threes
      float tq = floor(tt * 8.0);
      float lt = 0.0;
      for(int i = 0; i < 4; i++){
        float fi = float(i);
        vec2 p2 = vec2(atan(q.y, q.x) * 1.8 + fi * 1.7 + tq * 0.37, r * 7.0 + fi);
        float n = vnoise(vec2(p2.x * 3.3, tq * 0.91 + fi * 7.0));
        float n2 = vnoise(vec2(p2.x * 11.0, tq * 1.3 + fi * 3.0));
        float rr = 0.36 + 0.42 * n + 0.1 * n2;
        lt = max(lt, (1.0 - smoothstep(0.002, 0.017, abs(r - rr))) * step(0.45, vnoise(vec2(p2.x * 1.9, tq + fi * 11.0))));
      }
      float radial = 0.0;
      for(int i = 0; i < 6; i++){
        float fi = float(i) + 1.0;
        float a = fract(sin(fi * 91.7 + tq * 0.13) * 437.5) * 6.2832;
        vec2 dr = vec2(cos(a), sin(a));
        float along = dot(q, dr);
        float across = dot(q, vec2(-dr.y, dr.x)) + (vnoise(vec2(along * 18.0, tq + fi)) - 0.5) * 0.09;
        radial = max(radial, (1.0 - smoothstep(0.0, 0.012, abs(across))) * step(0.1, along) * step(along, 0.25 + 0.25 * fract(fi * 0.37 + tq * 0.21)));
      }
      float L = max(lt, radial) * uLight * (1.0 - uDead);
      col = mix(col, vec3(1.3, 1.85, 0.34), L);
      col = mix(col, vec3(1.3, 1.85, 0.34), (1.0 - smoothstep(0.0, 0.02, abs(r - (0.13 + 0.17 * uPupil)))) * (1.0 - uDead * 0.8));

      // pupil: a hard vertical slit that opens into a disc
      float wp = mix(0.018, 0.17, uPupil);
      float hp = mix(0.3, 0.2, uPupil);
      float pm = 1.0 - smoothstep(0.86, 1.0, length(q / vec2(wp, hp)));
      col = mix(col, vec3(0.012, 0.01, 0.03), pm);
      // the eye goes out
      col = mix(col, dot(col, vec3(0.3, 0.6, 0.1)) * vec3(0.32, 0.5, 0.52), uDead);

      // cel light on the dome
      float ndl = dot(N, uKeyDir);
      float lit = smoothstep(-0.05, 0.08, ndl);
      vec3 outc = col * mix(0.56, 1.15, lit);
      // hard painted window highlights
      vec3 R = reflect(-V, N);
      float win = smoothstep(0.84, 0.85, dot(R, normalize(uKeyDir + vec3(0.0, 0.25, 0.0))));
      float bar = (1.0 - smoothstep(0.02, 0.03, abs(R.y - 0.52))) * step(0.0, R.x * 0.0 + 1.0) * smoothstep(0.3, 0.5, dot(N, V));
      outc = mix(outc, vec3(1.6, 1.65, 1.5), win * 0.92 * (1.0 - uDead * 0.5));
      outc = mix(outc, vec3(1.1, 1.3, 1.25), bar * 0.28 * (1.0 - uDead));
      float fres = 1.0 - max(dot(N, V), 0.0);
      outc = mix(outc, vec3(0.2, 0.56, 0.56), smoothstep(0.6, 0.72, fres) * 0.55);

      // state
      if(uHot > 0.001) outc = mix(outc, vec3(1.3, 1.4, 1.1), uHot * 0.16);
      if(uBlack > 0.5) outc = mix(vec3(0.02), outc * 1.4 + vec3(0.2, 0.5, 0.0), 1.0 - pm * 0.8);
      outc = mix(outc, vec3(1.45, 1.95, 0.55), rim0);
      writeOut(outc, 1.0, NV, vDepth, uId);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide, transparent: false });
}

// -------------------------------------------------------- the plasma mantle
// Strips with uv.x along the ribbon (0 root, 1 tip), uv.y across (0..1). Bold cel shapes, no alpha ramps.
export function mantleMaterial() {
  const u = { ...G, ...WU, uK: { value: 1 } };
  const vs = /* glsl */ `
    attribute float aSeed;
    attribute float aKind;
    varying vec3 vLocal;
    varying float vSeed, vKind;
    ${VERT_STD}
    void main(){ vLocal = position; vSeed = aSeed; vKind = aKind; stdVertex(position, normal); }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${STATE_GLSL}
    uniform float uK;
    varying vec3 vWorld, vNormalW, vNormalV, vLocal;
    varying float vDepth, vSeed, vKind;
    varying vec2 vUv;
    void main(){
      float rim0 = wStateClip(vWorld, 0.0);
      if(uPass > 0.5) discard;
      float u1 = vUv.x, v1 = abs(vUv.y * 2.0 - 1.0);
      float t8 = floor(uTime * 8.0) / 8.0;
      // silhouette: fat at the root, tapering in flame tongues
      float belly = smoothstep(0.0, 0.2, u1 + 0.015);
      float profile = belly * pow(1.0 - u1, mix(0.8, 1.0, vKind)) * (0.86 + 0.14 * sin(u1 * 7.0 + vSeed * 40.0 - t8 * 7.0));
      float lob = (vnoise(vec2(u1 * 5.0 + vSeed * 91.0, t8 * 3.0 + vUv.y * 1.6)) - 0.5) * 0.3 * (0.3 + u1);
      // hard notches bitten out of the edge: the flame licks
      float nt = smoothstep(0.46, 0.78, vnoise(vec2(u1 * 6.0 + vSeed * 53.0 + step(0.5, vUv.y) * 9.0, t8 * 2.0))) * smoothstep(0.25, 0.6, u1);
      float w = profile + lob - nt * 0.22;
      if(v1 > w) discard;
      float sd = (w - v1) / max(w, 0.02);
      vec3 base = vec3(0.22, 0.46, 0.02);
      vec3 mid = vec3(0.56, 0.86, 0.05);
      vec3 pale = vec3(0.86, 1.12, 0.14);
      vec3 hot = vec3(1.28, 1.4, 0.7);
      float b1 = step(0.22, sd), b2 = step(0.62 - 0.1 * vKind, sd + (vnoise(vec2(u1 * 13.0 + vSeed * 17.0, t8 * 4.0)) - 0.5) * 0.3);
      float b3 = step(0.9, sd + (0.25 - u1) * 0.2);
      vec3 col = mix(base, mid, b1);
      col = mix(col, pale, b2);
      col = mix(col, hot, b3);
      vec3 hotC = vec3(1.7, 1.72, 1.45);
      if(uHot > 0.001) col = mix(col, mix(vec3(1.0, 1.05, 0.5), hotC, b2) * (0.92 + 0.2 * b3), uHot);
      writeOut(mix(col, vec3(1.6), rim0), 1.0, vec3(0.0, 0.0, 1.0), vDepth, 101.0);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide, transparent: false });
}

// Thin plain chitin for the antennae: uses aCol-less cel shading (a single colour band ramp along the whip)
export function antennaMaterial() {
  const u = { ...G, ...WU };
  const vs = /* glsl */ `${VERT_STD} void main(){ stdVertex(position, normal); }`;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${STATE_GLSL}
    varying vec3 vWorld, vNormalW, vNormalV;
    varying float vDepth;
    varying vec2 vUv;
    void main(){
      float rim0 = wStateClip(vWorld, 0.0);
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      vec3 V = normalize(cameraPosition - vWorld);
      float ndl = dot(N, uKeyDir);
      float lit = smoothstep(-0.05, 0.06, ndl);
      // segmented: dark wine with coral rings
      float rings = step(0.8, fract(vUv.x * 26.0));
      vec3 col = mix(vec3(0.22, 0.05, 0.13), vec3(1.0, 0.52, 0.44), rings);
      vec3 outc = mix(col * uShadeTint * 1.1, col * mix(uSkyTint, uSunColor * 1.25, uSunStrength), lit);
      if(uHot > 0.001) outc = mix(outc, vec3(1.5, 1.52, 1.3), uHot);
      if(uBlack > 0.001) outc = mix(outc, vec3(0.0), uBlack);
      outc = rigLight(col, outc, N, V, vWorld);
      writeOut(mix(outc, vec3(1.45, 1.95, 0.55), rim0), 1.0, NV, vDepth, 38.0);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide, transparent: false });
}

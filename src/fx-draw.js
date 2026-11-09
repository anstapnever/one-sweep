import * as THREE from 'three';
import { G, COMMON, MRT_OUT } from './glsl.js';

// Drawn-energy kit for ONE SWEEP:
//   BeamBatch   instanced cel beams and bolts: real cylinders in the main scene, hard white / lime bands
//   RibbonBatch screen-space tapered strokes in the overlay (slashes, the sweep, the line of force, dash trails)
//   ScreenFx    full-frame flash and focus lines (overlay)
//   CardLayer   hand-painted full-frame drawings from a 2D canvas (impact frames, the nerve tree)
//   LeafBatch   large clean cel olive leaves (two-coloured: dark sage top, pale silver underside)

const premult = (m) => {
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.OneFactor;
  m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  m.premultipliedAlpha = true;
  return m;
};
const FS_VS = /* glsl */ `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const HASH = /* glsl */ `
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(h12(i), h12(i+vec2(1,0)), u.x), mix(h12(i+vec2(0,1)), h12(i+vec2(1,1)), u.x), u.y); }
float fb(vec2 p){ float s = 0., a = .5; for(int i = 0; i < 4; i++){ s += a*vn(p); p = p*2.03 + vec2(1.7, 9.2); a *= .5; } return s / 0.9375; }
`;

// ------------------------------------------------------------------ beams
export function beamMaterial() {
  const u = { ...G, uDraw: { value: 0 } };
  const vs = /* glsl */ `
    attribute vec3 iA, iB;
    attribute vec4 iR;   // radius at A, radius at B, seed, flow speed
    attribute vec4 iK;   // power, cut at A (0..1 of the length eaten), cut at B, roughness
    varying vec3 vN, vW;
    varying vec2 vUL;
    varying vec4 vR, vK;
    varying float vDepth, vLen;
    varying vec3 vAx;
    void main(){
      vec3 ax = iB - iA;
      float L = max(length(ax), 1e-3);
      vec3 Y = ax / L;
      vec3 ref = abs(Y.y) < 0.92 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
      vec3 X = normalize(cross(Y, ref)), Z = cross(X, Y);
      float r = mix(iR.x, iR.y, position.y);
      vec3 rad = X * position.x + Z * position.z;
      vec4 wp = vec4(iA + ax * position.y + rad * r, 1.0);
      vec4 mv = viewMatrix * wp;
      vW = wp.xyz; vDepth = -mv.z;
      // the normal leans with the taper so a cone shades like a cone
      vN = normalize(rad + Y * (iR.x - iR.y) / L);
      vUL = vec2(position.y, atan(position.z, position.x));
      vLen = L; vR = iR; vK = iK; vAx = Y;
      gl_Position = projectionMatrix * mv;
    }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform mat4 projectionMatrix;
    uniform float uDraw;
    varying vec3 vN, vW;
    varying vec2 vUL;
    varying vec4 vR, vK;
    varying float vDepth, vLen;
    varying vec3 vAx;
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1.0); oData = vec4(0.0); return; }
      vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
      // across the column as seen: take the view vector's part along the axis out, so a beam leaning away keeps its white core
      vec3 Vp = normalize(V - normalize(vAx) * dot(V, normalize(vAx)));
      float f = clamp(abs(dot(N, Vp)), 0.0, 1.0);
      float d = sqrt(max(1.0 - f * f, 0.0));   // 0 on the axis as seen, 1 on the silhouette
      float s = vUL.x, ang = vUL.y, seed = vR.z, rough = vK.w;
      float circ = max(vR.x, vR.y) * 6.283;
      float L = vLen;
      // long streaks running down the beam, redrawn on threes
      vec2 sp = vec2(ang * (2.0 + min(circ * 0.02, 10.0)) + seed * 13.0, s * L * 0.012 - uDraw * vR.w);
      float st = fbm2(sp), st2 = fbm2(sp * vec2(3.0, 0.5) + 9.0);
      float e = d + (st - 0.5) * 0.45 * rough + (st2 - 0.5) * 0.18 * rough;
      // eaten ends: torn, never a flat cap
      float n = vnoise(vec2(ang * 6.0 + seed, s * L * 0.02 + uDraw * 0.7));
      if(s < vK.y + (n - 0.5) * 0.04 * step(0.001, vK.y)) discard;
      if(1.0 - s < vK.z + (n - 0.5) * 0.04 * step(0.001, vK.z)) discard;
      if(rough > 1.15){
        // the planet-killer seen nearly end-on: bands are drawn by the angle from its axis, streaks run radially out of the centre
        vec3 ax = normalize(vAx), ray = -V;
        vec3 u1 = normalize(cross(ax, vec3(0.0, 1.0, 0.0))), v1 = cross(ax, u1);
        float th = acos(clamp(dot(ray, ax), -1.0, 1.0));
        float az = atan(dot(ray, v1), dot(ray, u1));
        vec2 q = vec2(cos(az), sin(az)) * 7.0;
        float a1 = fbm2(q + vec2(seed, 0.0) + th * 0.4 - uDraw * vR.w * 0.05);
        float a2 = fbm2(q * 3.1 + vec2(seed * 2.0, 4.0) - uDraw * vR.w * 0.11);
        e = th / 1.0 + (a1 - 0.5) * 0.3 + (a2 - 0.5) * 0.12;
      }
      vec3 lime = vec3(0.70, 1.0, 0.14), deep = vec3(0.30, 0.62, 0.08);
      vec3 col;
      float P = vK.x;
      float coreW = mix(0.46, 0.42, smoothstep(1.15, 1.2, rough));
      if(e < coreW) col = vec3(1.9, 1.95, 1.7);
      else if(e < coreW + 0.2) col = vec3(1.08, 1.3, 0.62);
      else if(e < 0.965) col = lime * 1.15;
      else col = deep;
      if(rough > 1.15 && e > coreW + 0.1){
        // long drawn needles run out of the centre over the lime
        vec3 ax2 = normalize(vAx), ray2 = -V;
        vec3 u2 = normalize(cross(ax2, vec3(0.0, 1.0, 0.0))), v2 = cross(ax2, u2);
        float az2 = atan(dot(ray2, v2), dot(ray2, u2));
        float k = floor((az2 / 6.28318 + 0.5) * 64.0), f = fract((az2 / 6.28318 + 0.5) * 64.0);
        float h1 = fract(sin(k * 12.9898 + mod(floor(uDraw), 8.0) * 3.1) * 43758.5453);
        float h2 = fract(sin(k * 78.233 + 1.7) * 43758.5453);
        float w = 0.1 + 0.28 * h2;
        if(h1 > 0.42 && abs(f - 0.5) < w * (1.0 - smoothstep(coreW, 1.0, e))) col = vec3(1.25, 1.45, 0.72);
        if(h1 < 0.22 && abs(f - 0.5) < w * 0.7 * smoothstep(coreW, 1.0, e)) col = deep;
      }
      // the hook column: ragged edge, drawn energy lines running down the core
      if(rough > 1.02 && rough <= 1.15){
        float rg = fbm2(vec2(ang * 9.0 + seed, s * L * 0.006 - uDraw * vR.w * 0.25));
        float rg2 = fbm2(vec2(ang * 26.0 + seed * 2.0, s * L * 0.018 - uDraw * vR.w * 0.5));
        if(vK.x > 1.5){
          // corona: a violent lime flame standing off the column, its own torn silhouette
          float e2 = d + (rg - 0.5) * 0.95 + (rg2 - 0.5) * 0.45;
          if(e2 > 0.84) discard;
          col = e2 < 0.42 ? vec3(1.05, 1.55, 0.36) : e2 < 0.66 ? lime * 1.2 : deep;
        } else {
          float e3 = e + (rg2 - 0.5) * 0.42 * smoothstep(0.55, 0.95, d);
          if(e3 > 1.0) discard;
          col = e3 < coreW ? vec3(1.9, 1.95, 1.7) : e3 < coreW + 0.18 ? vec3(1.08, 1.45, 0.5) : e3 < 0.93 ? lime * 1.2 : deep;
          // long dashes of pale lime racing down the white
          float nl = 34.0, xx = (ang / 6.28318 + 0.5) * nl, kk = floor(xx), ff = fract(xx);
          float h1 = fract(sin(kk * 12.9898 + 4.1) * 43758.5453), h2 = fract(sin(kk * 78.233) * 43758.5453);
          float dash = fract(s * L * 0.0022 + h1 * 7.0 - floor(uDraw) * 0.13 * (0.6 + h2));
          if(e3 < coreW && h1 > 0.45 && abs(ff - 0.5) < 0.1 + 0.2 * h2 && dash < 0.5) col = vec3(1.1, 1.5, 0.55);
        }
      }
      // the planet-killer always stands in front of the far cloud layers
      float dv = vDepth;
      if(rough > 1.02){ dv = min(vDepth, rough > 1.15 ? 180.0 : rough > 1.05 ? 25.0 : 560.0); vec4 cl = projectionMatrix * vec4(0.0, 0.0, -dv, 1.0); gl_FragDepth = clamp(cl.z / cl.w * 0.5 + 0.5, 0.0, 1.0); }
      else gl_FragDepth = gl_FragCoord.z;
      // the colossal beams are light, not objects in the haze: the atmosphere pass must not fog them
      writeOut(col, 1.0, normalize(vec3(N.xy * 0.2, 1.0)), rough > 1.02 ? min(dv, 8.0) : dv, 101.0);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide });
}

export class BeamBatch {
  constructor(material, max = 64) {
    this.max = max;
    const g = new THREE.InstancedBufferGeometry();
    const base = new THREE.CylinderGeometry(1, 1, 1, 64, 16, true);
    base.translate(0, 0.5, 0);
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('uv', base.getAttribute('uv'));
    g.setAttribute('normal', base.getAttribute('normal'));
    const A = (n, s) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * s), s); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(n, a); return a; };
    this.aA = A('iA', 3); this.aB = A('iB', 3); this.aR = A('iR', 4); this.aK = A('iK', 4);
    g.instanceCount = 0;
    this.geo = g;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.userData.noShadow = true;
    this.mesh.name = 'fx-beams';
    this.n = 0;
  }
  begin() { this.n = 0; }
  // a, b: world end points; ra, rb: radii (m); o: { seed, flow, power, cutA, cutB, rough }
  push(a, b, ra, rb, o = {}) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.aA.array.set([a.x, a.y, a.z], i * 3);
    this.aB.array.set([b.x, b.y, b.z], i * 3);
    this.aR.array.set([ra, rb, o.seed ?? 0.1, o.flow ?? 2.5], i * 4);
    this.aK.array.set([o.power ?? 1, o.cutA ?? 0, o.cutB ?? 0, o.rough ?? 1], i * 4);
  }
  end() {
    this.geo.instanceCount = this.n;
    for (const a of [this.aA, this.aB, this.aR, this.aK]) { a.needsUpdate = true; a.clearUpdateRanges?.(); }
  }
}

// ------------------------------------------------------------------ ribbons (screen-space tapered strokes)
export const STYLE = { LIME: 0, SWEEP: 1, AIR: 2, INK: 3 };
export function ribbonMaterial() {
  const u = { uSceneData: { value: null }, uRes: { value: new THREE.Vector2(1, 1) } };
  const vs = /* glsl */ `
    attribute vec3 aP;    // ndc xy, depth (m; 0 = no depth test)
    attribute vec4 aUV;   // along (m-ish, for the torn edge), across -1..1, seed, style
    attribute vec4 aK;    // core width, band width, roughness, power
    varying vec4 vUV, vK;
    varying float vD;
    void main(){ vUV = aUV; vK = aK; vD = aP.z; gl_Position = vec4(aP.xy, 0.0, 1.0); }
  `;
  const fs = /* glsl */ `
    uniform sampler2D uSceneData;
    uniform vec2 uRes;
    varying vec4 vUV, vK;
    varying float vD;
    out vec4 oColor;
    ${HASH}
    void main(){
      if(vD > 0.01){
        float sd = texture(uSceneData, gl_FragCoord.xy / uRes).b;
        if(sd > 0.01 && vD > sd + 0.5) discard;
      }
      float seed = vUV.z, style = vUV.w, core = vK.x, band = vK.y, rough = vK.z, P = vK.w;
      float n = fb(vec2(vUV.x, seed * 7.0)), n2 = vn(vec2(vUV.x * 3.1, seed * 3.0 + 4.0));
      float e = abs(vUV.y) + (n - 0.5) * rough + (n2 - 0.5) * rough * 0.5;
      float fw = max(fwidth(e), 1e-3);
      float a = 1.0 - smoothstep(1.0 - fw, 1.0 + fw, e);
      if(a < 0.003) discard;
      vec3 c1, c2, c3;
      if(style < 0.5){ c1 = vec3(1.9, 1.95, 1.7); c2 = vec3(1.1, 1.5, 0.42); c3 = vec3(0.30, 0.62, 0.08); }
      else if(style < 1.5){ c1 = vec3(1.8, 1.76, 1.6); c2 = vec3(1.0, 0.76, 0.28); c3 = vec3(0.34, 0.2, 0.1); }
      else if(style < 2.5){ c1 = vec3(1.0, 1.0, 0.98); c2 = vec3(0.92, 0.94, 1.0); c3 = vec3(0.72, 0.76, 0.92); }
      else { c1 = vec3(0.05, 0.03, 0.08); c2 = vec3(0.05, 0.03, 0.08); c3 = vec3(0.05, 0.03, 0.08); }
      vec3 col = e < core ? c1 : e < band ? c2 : c3;
      float s = smoothstep(band - fw, band + fw, e);
      col = mix(c2, c3, s);
      float cc = 1.0 - smoothstep(core - fw, core + fw, e);
      col = mix(col, c1, cc);
      a *= min(P, 1.0);
      oColor = vec4(col * a, a);
    }
  `;
  return premult(new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
}

export class RibbonBatch {
  constructor(material, maxVerts = 8000) {
    this.max = maxVerts;
    const g = new THREE.BufferGeometry();
    const mk = (n) => { const a = new THREE.BufferAttribute(new Float32Array(maxVerts * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aP = mk(3); this.aUV = mk(4); this.aK = mk(4);
    g.setAttribute('position', this.aP); g.setAttribute('aP', this.aP); g.setAttribute('aUV', this.aUV); g.setAttribute('aK', this.aK);
    this.idx = new THREE.BufferAttribute(new Uint32Array(maxVerts * 3), 1);
    this.idx.setUsage(THREE.DynamicDrawUsage);
    g.setIndex(this.idx); g.setDrawRange(0, 0);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'fx-ribbons';
    this.nv = 0; this.ni = 0; this.aspect = 16 / 9;
  }
  begin() { this.nv = 0; this.ni = 0; }
  // pts: [{x, y, w, z?}] in NDC, w = half width in NDC-y units. o: { style, core, band, rough, seed, power, freq }
  push(pts, o = {}) {
    const n = pts.length;
    if (n < 2 || this.nv + n * 2 > this.max) return;
    const asp = this.aspect, freq = o.freq ?? 18, base = this.nv;
    let along = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = (b.x - a.x) * asp, ty = b.y - a.y;
      const l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      if (i > 0) along += Math.hypot((p.x - pts[i - 1].x) * asp, p.y - pts[i - 1].y);
      for (let sd = -1; sd <= 1; sd += 2) {
        const v = this.nv++;
        this.aP.array.set([p.x + (-ty * p.w * sd) / asp, p.y + tx * p.w * sd, p.z ?? 0], v * 3);
        this.aUV.array.set([along * freq, sd, o.seed ?? 0.3, o.style ?? 0], v * 4);
        this.aK.array.set([o.core ?? 0.55, o.band ?? 0.82, o.rough ?? 0.06, o.power ?? 1], v * 4);
      }
      if (i < n - 1) {
        const q = base + i * 2, ia = this.idx.array, k = this.ni;
        ia[k] = q; ia[k + 1] = q + 1; ia[k + 2] = q + 2; ia[k + 3] = q + 1; ia[k + 4] = q + 3; ia[k + 5] = q + 2;
        this.ni += 6;
      }
    }
  }
  end() {
    this.geo.setDrawRange(0, this.ni);
    for (const a of [this.aP, this.aUV, this.aK, this.idx]) { a.needsUpdate = true; a.clearUpdateRanges?.(); }
  }
}

// ------------------------------------------------------------------ full-frame flash + focus lines
export function screenFxMaterial() {
  const u = {
    uRes: { value: new THREE.Vector2(1, 1) }, uFlash: { value: new THREE.Vector4(1, 1, 1, 0) },
    uLine: { value: new THREE.Vector4(1, 1, 1, 0) }, uCen: { value: new THREE.Vector2(0.5, 0.5) },
    uInner: { value: 0.4 }, uDraw: { value: 0 }, uN: { value: 90 },
  };
  const fs = /* glsl */ `
    uniform vec2 uRes, uCen;
    uniform vec4 uFlash, uLine;
    uniform float uInner, uDraw, uN;
    out vec4 oColor;
    ${HASH}
    void main(){
      vec2 uv = gl_FragCoord.xy / uRes;
      vec3 rgb = vec3(0.0);
      float A = 0.0;
      if(uLine.a > 0.002){
        vec2 p = (uv - uCen) * vec2(uRes.x / uRes.y, 1.0);
        float r = length(p), an = atan(p.y, p.x);
        float x = (an / 6.28318 + 0.5) * uN, i = floor(x), f = fract(x);
        float h = h12(vec2(i, uDraw)), h2 = h12(vec2(i, uDraw + 3.0)), h3 = h12(vec2(i + 9.0, uDraw));
        float in0 = uInner * (0.8 + 1.1 * h3);
        float w = mix(0.03, 0.42, h2 * h2) * smoothstep(in0, in0 + 0.5, r) * step(0.3, h);
        float fw = fwidth(f);
        float a = 1.0 - smoothstep(w - fw, w + fw, abs(f - 0.5));
        a *= step(0.0001, w) * uLine.a;
        rgb = uLine.rgb * a; A = a;
      }
      if(uFlash.a > 0.002){
        float a = uFlash.a;
        rgb = rgb * (1.0 - a) + uFlash.rgb * a; A = A * (1.0 - a) + a;
      }
      if(A < 0.002) discard;
      oColor = vec4(rgb, A);
    }
  `;
  return premult(new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: FS_VS, fragmentShader: fs, transparent: true, depthTest: false, depthWrite: false }));
}

// ------------------------------------------------------------------ painted cards
export function cardMaterial() {
  const u = {
    uRes: { value: new THREE.Vector2(1, 1) }, uMap: { value: null }, uA: { value: 0 }, uMode: { value: 0 },
    uProg: { value: 1 }, uScale: { value: 1 }, uOff: { value: new THREE.Vector2(0, 0) }, uRoll: { value: 0 }, uGain: { value: 1 },
    uHot: { value: new THREE.Color('#d9ff46') }, uDraw: { value: 0 },
  };
  const fs = /* glsl */ `
    uniform vec2 uRes, uOff;
    uniform sampler2D uMap;
    uniform float uA, uMode, uProg, uScale, uRoll, uGain, uDraw;
    uniform vec3 uHot;
    out vec4 oColor;
    ${HASH}
    void main(){
      vec2 uv = gl_FragCoord.xy / uRes;
      if(uA <= 0.002) discard;
      vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
      float cr = cos(uRoll), sr = sin(uRoll);
      p = mat2(cr, sr, -sr, cr) * p / uScale;
      p.x /= uRes.x / uRes.y;
      vec2 q = p + 0.5 + uOff;
      vec4 t = texture(uMap, q);
      if(uMode > 0.5){
        // nerve tree: r = line mask, g = arrival time 0..1 (premultiplied by r), b = white core
        float m = t.r, arr = t.g / max(t.r, 0.003), core = t.b;
        float on = smoothstep(uProg + 0.012, uProg - 0.005, arr);
        float front = smoothstep(0.05, 0.0, abs(arr - uProg)) * step(arr, uProg + 0.02);
        vec3 c = uHot * (0.65 + 0.35 * front) * m * 1.5;
        c += vec3(1.0) * (core + front * m * 1.2);
        c = min(c * on, vec3(1.9));
        float A = 1.0;
        oColor = vec4(c * uA, A * uA);
        return;
      }
      vec3 rgb = t.rgb * uGain;
      float a = t.a;
      oColor = vec4(rgb * uA, a * uA);
    }
  `;
  return premult(new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: FS_VS, fragmentShader: fs, transparent: true, depthTest: false, depthWrite: false }));
}

export class CardLayer {
  constructor(overlay, engine, order = 20, slots = 2) {
    this.meshes = [];
    for (let i = 0; i < slots; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), cardMaterial());
      m.material.uniforms.uRes.value.set(engine.IW, engine.IH);
      m.frustumCulled = false; m.renderOrder = order + i; m.name = 'fx-card' + i;
      overlay.add(m);
      this.meshes.push(m);
    }
    this.tex = new Map();
    this.painters = new Map();
    this.used = 0;
  }
  register(name, paint, w = 2560, h = 1440) { this.painters.set(name, { paint, w, h }); }
  get(name) {
    let t = this.tex.get(name);
    if (t) return t;
    const p = this.painters.get(name);
    if (!p) return null;
    const c = document.createElement('canvas');
    c.width = p.w; c.height = p.h;
    p.paint(c.getContext('2d'), p.w, p.h);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace; t.premultiplyAlpha = true; t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
    this.tex.set(name, t);
    return t;
  }
  begin() { this.used = 0; for (const m of this.meshes) m.material.uniforms.uA.value = 0; }
  show(name, o = {}) {
    if (this.used >= this.meshes.length) return;
    const m = this.meshes[this.used++], u = m.material.uniforms;
    u.uMap.value = this.get(name);
    u.uA.value = o.a ?? 1; u.uMode.value = o.mode ?? 0; u.uProg.value = o.prog ?? 1; u.uScale.value = o.scale ?? 1;
    u.uOff.value.set(o.ox ?? 0, o.oy ?? 0); u.uRoll.value = o.roll ?? 0; u.uGain.value = o.gain ?? 1; u.uDraw.value = o.draw ?? 0;
  }
}

// ------------------------------------------------------------------ cel leaves
function leafGeo() {
  // a slim olive leaf, 1 unit long, creased along the midrib
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.5);
  shape.bezierCurveTo(0.34, -0.3, 0.3, 0.26, 0, 0.5);
  shape.bezierCurveTo(-0.3, 0.26, -0.34, -0.3, 0, -0.5);
  const g = new THREE.ShapeGeometry(shape, 10);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, Math.abs(x) * 0.5 - y * y * 0.18); }
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}
export function leafMaterial(id = 79) {
  const u = { ...G, uId: { value: id } };
  const vs = /* glsl */ `
    varying vec3 vWorld, vNormalW, vNormalV, vObj;
    varying float vDepth;
    varying vec3 vTint;
    void main(){
      mat4 im = instanceMatrix;
      vec4 wp = modelMatrix * im * vec4(position, 1.0);
      vWorld = wp.xyz;
      vec3 nW = normalize(mat3(modelMatrix) * mat3(im) * normal);
      vNormalW = nW;
      vNormalV = normalize(mat3(viewMatrix) * nW);
      vec4 mv = viewMatrix * wp;
      vDepth = -mv.z; vObj = position;
      vTint = instanceColor;
      gl_Position = projectionMatrix * mv;
    }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform float uId;
    varying vec3 vWorld, vNormalW, vNormalV, vObj;
    varying float vDepth;
    varying vec3 vTint;
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
      bool top = gl_FrontFacing;
      if(!top){ N = -N; NV = -NV; }
      // dark sage on top, pale silver below, a thin midrib; autumn leaves carry a warmer tint in the instance colour
      vec3 col = top ? vTint : mix(vTint, vec3(0.78, 0.82, 0.72), 0.72);
      float rib = smoothstep(0.022, 0.012, abs(vObj.x));
      col = mix(col, top ? col * 1.35 : col * 0.88, rib);
      float lit = smoothstep(0.0, 0.08, dot(N, uKeyDir));
      vec3 litc = col * mix(uSkyTint, uSunColor * 1.08, uSunStrength);
      vec3 shadec = col * max(uShadeTint * 0.92, vec3(0.5));
      vec3 c = mix(shadec, litc, lit);
      writeOut(c, 1.0, NV, vDepth, uId);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide });
}
export class LeafBatch {
  constructor(material, max = 400) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(leafGeo(), material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.userData.noShadow = true;
    this.mesh.name = 'fx-leaves';
    this.n = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._c = new THREE.Color();
  }
  begin() { this.n = 0; }
  // size = length of the leaf (m)
  push(x, y, z, rx, ry, rz, size, color = '#5e7a3c') {
    if (this.n >= this.max) return;
    const i = this.n++;
    this._q.setFromEuler(this._e.set(rx, ry, rz));
    this._m.compose(this._p.set(x, y, z), this._q, this._s.set(size, size, size));
    this.mesh.setMatrixAt(i, this._m);
    this.mesh.setColorAt(i, this._c.set(color));
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.mesh.visible = true;
  }
}

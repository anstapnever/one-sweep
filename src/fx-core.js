import * as THREE from 'three';
import { G, COMMON, MRT_OUT } from './glsl.js';

// FX toolkit for ONE SWEEP (adapted from the Colossus film's). Everything is rebuilt each frame from state.t alone.
// (Ideas and code adapted from the Leviathan FX departments, MIT.)
//   PuffBatch  : cel billows (steam, dust) as impostors in the main scene: real depth, hard tones, ink
//   ChunkBatch : instanced faceted cel solids (stone blocks, rocks, bronze slabs, stucco, petals)
//   LineBatch  : screen-extruded lightning lines (overlay)
//   GlowBatch  : flash shapes (overlay)
//   QuadBatch  : soft dust / spray veils (overlay)
//   dome, ground ring, full-screen flash (overlay)

export function hash(a, b = 0, c = 0) {
  let h = Math.imul((a * 7919) | 0, 0x27d4eb2d) ^ Math.imul((b * 104729) | 0, 0x165667b1) ^ Math.imul((c * 15485863) | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export const hr = (a, b, c, lo, hi) => lo + (hi - lo) * hash(a, b, c);

// ink ids: FX 60–99 inked, 100+ no ink
export const ID = { DUST: [61, 63, 65], SMOKE: [67, 69, 71], STONE: 73, TILE: 75, GEM: 77, LEAF: 79, FINE: 101, FLAT: 103 };
export const KIND = { PUFF: 0, TONGUE: 1, DROP: 2 };
export const PAL = { DUST: 0, SMOKE: 1, FIRE: 2, LIME: 3, SOOT: 4, AIR: 5, NIGHT: 6, ASH: 7, BURN: 8, DRY: 9 };

// palette rows: hi, lit, shade, deep (display space). One light, one hard shadow; deep only in the far shade.
const PALETTE = [
  ['#fff1e0', '#fbd9c0', '#cd8e90', '#9a6a94'],   // coral dust
  ['#fbf5ec', '#ece2d8', '#a39ab8', '#70668e'],   // warm grey-white smoke
  ['#fff8cc', '#ffcf62', '#f58a3a', '#d14a33'],   // fire (hot centre to coral edge)
  ['#fdffe0', '#e4ff6e', '#a8e424', '#62aa1c'],   // lime energy cloud
  ['#7d7382', '#574d5e', '#3a3242', '#201b28'],   // soot
  ['#ffffff', '#ffffff', '#b4bff0', '#93a0dc'],   // clean white air
  ['#f6f2ff', '#dcd6f6', '#6c64b4', '#443c8c'],   // white cloud on a dark sky
  ['#f6ffcf', '#d8f48a', '#a3c45e', '#708a40'],   // lime ash
  ['#d8a688', '#a9707a', '#5b3f78', '#2f2450'],   // battle smoke: burnt warm light, deep violet shade
  ['#a8a37e', '#7f7a5e', '#56523f', '#38352c'],   // dry dead ash: no light of its own
];
function palValues() {
  const out = [];
  for (const row of PALETTE) for (const c of row) { const n = parseInt(c.slice(1), 16); out.push(new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)); }
  return out;
}

// ------------------------------------------------------------------ puffs
export function puffMaterial(S) {
  const u = { ...G, uS: { value: S }, uPal: { value: palValues() }, uDrawing: { value: 0 }, uFogD: { value: 0 }, uFogC: { value: new THREE.Color('#ddd0d0') }, uFogComp: { value: 0.8 } };
  const vs = /* glsl */ `
    attribute vec3 iPos;
    uniform vec3 uKeyDir, uSunDir;
    attribute vec4 iS;    // radius (m), length along iDir (m), tip ratio, lumpiness
    attribute vec3 iDir;
    attribute vec4 iK;    // seed, tone, fade, kind
    attribute vec3 iM;    // palette, ink id, ink depth (0 = own depth)
    varying vec2 vP;
    varying vec3 vShape;
    varying vec4 vK;
    varying vec3 vM;
    varying vec4 vC;
    varying vec4 vAxes;
    varying vec3 vL;
    varying float vBack;
    void main(){
      vec4 c = viewMatrix * vec4(iPos, 1.0);
      vec3 dv = mat3(viewMatrix) * iDir;
      float sl = length(dv.xy);
      vec2 ey = sl > 1e-3 ? dv.xy / sl : vec2(0.0, 1.0);
      vec2 ex = vec2(ey.y, -ey.x);
      float r = max(iS.x, 1e-3);
      float len = iS.y * sl / r;
      float m = 1.06 + iS.w * 0.55;
      vec2 q = position.xy * 2.0;
      vec2 L = vec2(q.x * m, (q.y * 0.5 + 0.5) * (len + 2.0 * m) - m);
      vP = L; vShape = vec3(len, iS.z, iS.w); vK = iK; vM = iM;
      vC = vec4(c.xyz, r); vAxes = vec4(ex, ey);
      vec3 sun = normalize(mat3(viewMatrix) * uKeyDir);
      vL = normalize(mix(sun, normalize(vec3(-0.45, 0.78, 0.44)), 0.55));
      // never light a billow straight from the lens: keep the light raking so a shadow side always shows
      vL = normalize(vec3(vL.xy + normalize(vec2(-0.5, 0.86) + vL.xy) * 0.25, min(vL.z, 0.3)));
      // backlit: the billow sits between the camera and the sun
      vBack = smoothstep(0.2, 0.8, dot(normalize(c.xyz), normalize(mat3(viewMatrix) * uSunDir)));
      vec3 mv = c.xyz + vec3((ex * L.x + ey * L.y) * r, 0.0);
      gl_Position = projectionMatrix * vec4(mv, 1.0);
    }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform mat4 projectionMatrix;
    uniform vec3 uPal[40];
    uniform float uS, uDrawing, uFogD, uFogComp;
    uniform vec3 uFogC;
    varying vec2 vP;
    varying vec3 vShape;
    varying vec4 vK;
    varying vec3 vM;
    varying vec4 vC;
    varying vec4 vAxes;
    varying vec3 vL;
    varying float vBack;
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1.0); oData = vec4(0.0); return; }
      float seed = vK.x, tone = vK.y, fade = vK.z, kind = vK.w;
      float len = vShape.x, tip = vShape.y, lump = vShape.z;
      vec2 P = vP;
      int pal = int(vM.x + 0.5);
      vec3 cHi = uPal[pal * 4], cLit = uPal[pal * 4 + 1], cSh = uPal[pal * 4 + 2], cDeep = uPal[pal * 4 + 3];
      float boil = mod(uDrawing, 16.0) * 0.19;
      vec2 wob = vec2(vnoise(P * 1.25 + seed * 7.13 + boil), vnoise(P * 1.25 + seed * 3.31 + 9.0 - boil)) - 0.5;
      vec2 wob2 = vec2(vnoise(P * 3.1 + seed * 2.1), vnoise(P * 3.1 + seed * 5.3 + 4.0)) - 0.5;
      vec2 Q = P + wob * lump * 0.95 + wob2 * lump * 0.34;
      float h = len > 1e-3 ? clamp(Q.y / len, 0.0, 1.0) : 0.0;
      vec2 pa = Q - vec2(0.0, h * len);
      float rr = mix(1.0, tip, h);
      vec2 ns = pa / max(rr, 1e-3);
      float d = length(pa) - rr;
      if(kind < 0.5){
        // cauliflower outline: a run of small round lobes
        float ang = atan(ns.y, ns.x) + wob.x * 1.2;
        float nl = 5.0 + floor(mod(seed * 3.7, 5.0));
        d -= lump * 0.34 * (abs(sin(ang * nl * 0.5 + seed * 2.1)) - 0.55) * smoothstep(0.35, 0.95, length(ns));
      }
      if(d > 0.0) discard;
      float z = sqrt(max(1.0 - min(dot(ns, ns), 1.0), 0.0));
      if(fade > 0.001){
        float n = fbm2(P * 1.35 + seed * 5.7);
        float edge = fade * 1.02 - (z * 0.18);
        if(n * 1.25 < edge) discard;
      }
      vec3 nv = vec3(vAxes.xy * ns.x + vAxes.zw * ns.y, z + 0.05);
      bool clean = true;
      bool hot = pal == 2 || pal == 3;
      nv.xy += (wob + wob2 * 0.7) * (clean ? 0.12 : (kind < 1.5 ? 0.95 : 0.35));
      nv = normalize(nv);
      float ndl = dot(nv, vL);
      float brush = fbm2(P * 1.05 + seed * 9.0 + wob * 0.8) - 0.5;
      float s = ndl + brush * 0.38 - tone - vBack * 0.35;
      vec3 col;
      if(clean){
        // big anime billow: one clean terminator, lit warm-white vs one lavender shadow shape
        float sc = ndl - tone + 0.08 * (wob.x + wob.y);
        col = sc > -0.12 ? cHi : cSh;
        if(sc > 0.42 && lump > 0.0) col = mix(cHi, cHi, 1.0);
        if(sc < -0.75) col = cDeep;
        if(pal == 8 || pal == 0 || pal == 1) col = sc > 0.42 ? cHi : sc > -0.12 ? cLit : sc > -0.62 ? cSh : cDeep;
        if(hot){
          // fire and energy shade from the centre out: a white-hot heart, a flat body, a dark edge
          float e = length(ns) + (wob.x + wob2.y) * 0.25 - tone * 0.4;
          col = e < 0.5 ? cHi : e < 0.78 ? cLit : e < 0.94 ? cSh : cDeep;
          col *= 1.0 + (e < 0.5 ? 0.22 : 0.0);
        }
      } else if(kind > 1.5){
        col = s > -0.15 ? cLit : cSh;
      } else {
        col = cLit;
        if(s > 0.58) col = cHi;
        if(s < 0.04) col = cSh;
        if(s < -0.5) col = cDeep;
        // a thin bright rim where the silhouette faces the light
        vec2 lv = normalize(vec2(dot(vL.xy, vAxes.xy), dot(vL.xy, vAxes.zw)) + 1e-4);
        float rimW = mix(0.86, 0.7, vBack);
        float rimK = smoothstep(rimW, rimW + 0.06, length(ns)) * step(mix(0.45, -0.2, vBack), dot(normalize(ns + 1e-4), lv));
        if(rimK > 0.5 && fade < 0.35) col = cHi * 1.04;
        // backlit billows: lavender core, cream light soaking in toward the edge, silver rim all round
        float e = length(ns) + brush * 0.12 + ndl * 0.1;
        float lk = ndl + brush * 0.25;
        vec3 bcol = e > 0.86 ? cHi * 1.05 : (e > 0.66 || lk > 0.5) ? cLit : (lk < -0.3 ? cDeep : cSh);
        float bsel = step(0.38 + 0.25 * (brush + 0.5), vBack);
        col = mix(col, bcol, bsel);
      }
      // clean lobes barely bulge in depth, so they stack instead of cutting into each other (clean overlap lines)
      float zv = vC.z + z * vC.w * rr * 0.12;
      vec4 clip = projectionMatrix * vec4(vC.xy + (vAxes.xy * P.x + vAxes.zw * P.y) * vC.w, zv, 1.0);
      gl_FragDepth = clamp(clip.z / clip.w * 0.5 + 0.5, 0.0, 1.0);
      // far billows draw their own outline: the screen ink pass thins to nothing past ~80 m
      // tip < 0.95 on a round billow (len 0) = part of a merged plume: leave the outline to the ink pass
      if(kind < 1.5 && fade < 0.3 && tip > 0.95){
        float far = smoothstep(20.0, 50.0, -zv);
        float fw = max(fwidth(d), 1e-4);
        float edge = smoothstep(-1.6 * fw, -0.7 * fw, d);
        col = mix(col, mix(vec3(0.165, 0.133, 0.21), col * 0.32, 0.25), edge * far * 0.9);
      }
      // pre-compensate the atmosphere pass so distant billows keep their shadow sides instead of fading to paper
      float fogF = clamp(1.0 - exp(-max(-zv, 0.0) * uFogD), 0.0, 0.9) * uFogComp;
      col = max((col - fogF * uFogC) / max(1.0 - fogF, 0.1), vec3(0.0));
      writeOut(col, 1.0, normalize(vec3(nv.xy * 0.42, 1.0)), vM.z > 0.0 ? vM.z : -zv, vM.y);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide, transparent: false });
}

export class PuffBatch {
  constructor(material, max) {
    this.max = max;
    const g = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('uv', base.getAttribute('uv'));
    const A = (n, s) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * s), s); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(n, a); return a; };
    this.aPos = A('iPos', 3); this.aS = A('iS', 4); this.aDir = A('iDir', 3); this.aK = A('iK', 4); this.aM = A('iM', 3);
    this.inkZ = 0; this.buds = 0; this.guard = null;
    g.instanceCount = 0;
    this.geo = g;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.userData.noShadow = true;
    this.n = 0;
    this.cam = new THREE.Vector3(1e9, 1e9, 1e9);
    this.camNear = 0;   // puffs never closer than this to the camera (m)
  }
  begin(camPos) { this.n = 0; this.inkZ = 0; this.buds = 0; this.guard = null; if (camPos) this.cam.copy(camPos); }
  // guard: { x, y, z, R } — a sphere (the colossus face) that no billow may cover as seen from the camera
  hidesGuard(x, y, z, r) {
    if (Array.isArray(this.guard)) {
      const all = this.guard;
      for (const g of all) { this.guard = g; const h = this.hidesGuard(x, y, z, r); this.guard = all; if (h) return true; }
      return false;
    }
    const g = this.guard, c = this.cam;
    if (!g) return false;
    const hx = g.x - c.x, hy = g.y - c.y, hz = g.z - c.z, dH = Math.hypot(hx, hy, hz);
    if (dH < 1e-3) return false;
    const px = x - c.x, py = y - c.y, pz = z - c.z;
    const along = (px * hx + py * hy + pz * hz) / dH;
    if (along > dH + g.R * 0.3 || along < 0) return false;
    const perp = Math.sqrt(Math.max(px * px + py * py + pz * pz - along * along, 0));
    return perp < g.R * (along / dH) + r;
  }
  push(x, y, z, r, len, tip, lump, dx, dy, dz, seed, tone, fade, kind, pal, id) {
    if (this.hidesGuard(x, y, z, r + len * 0.5)) return;
    this.put(x, y, z, r, len, tip, lump, dx, dy, dz, seed, tone, fade, kind, pal, id);
    // cumulus buds: small billows sitting on the rim of a big one (upper / outer side)
    if (this.buds > 0 && kind === 0 && r >= 2.5) {
      for (let b = 0; b < this.buds; b++) {
        const h1 = hash(seed | 0, b, 991), h2 = hash(seed | 0, b, 992), h3 = hash(seed | 0, b, 993);
        const an = h1 * Math.PI * 2, up = 0.15 + 0.85 * h2, ho = Math.sqrt(1 - up * up);
        const k = r * (0.7 + 0.12 * h3);
        const bx = x + Math.cos(an) * ho * k, by = y + up * k, bz = z + Math.sin(an) * ho * k;
        const rb = r * (0.3 + 0.2 * h3);
        if (this.hidesGuard(bx, by, bz, rb)) continue;
        this.put(bx, by, bz, rb, 0, 1, lump, dx, dy, dz, (seed + 17 * (b + 1)) % 97 + 0.37, tone - 0.06, fade, kind, pal, id);
      }
    }
  }
  put(x, y, z, r, len, tip, lump, dx, dy, dz, seed, tone, fade, kind, pal, id) {
    if (this.n >= this.max || r <= 0) return;
    // never swallow the lens: a billow around the camera fills the frame with white
    const cd = Math.hypot(x - this.cam.x, y - this.cam.y, z - this.cam.z);
    if (cd < r * 1.6 + 1.0 + this.camNear) {
      const k = (cd - 1.0 - this.camNear) / 1.6 / r;
      if (k < 0.15) return;
      r *= k; len *= k;
    }
    const i = this.n++;
    let a = this.aPos.array; a[i * 3] = x; a[i * 3 + 1] = y; a[i * 3 + 2] = z;
    a = this.aS.array; a[i * 4] = r; a[i * 4 + 1] = len; a[i * 4 + 2] = tip; a[i * 4 + 3] = lump;
    a = this.aDir.array; a[i * 3] = dx; a[i * 3 + 1] = dy; a[i * 3 + 2] = dz;
    a = this.aK.array; a[i * 4] = seed; a[i * 4 + 1] = tone; a[i * 4 + 2] = fade; a[i * 4 + 3] = kind;
    a = this.aM.array; a[i * 3] = pal; a[i * 3 + 1] = id; a[i * 3 + 2] = this.inkZ;
  }
  end() {
    this.geo.instanceCount = this.n;
    for (const a of [this.aPos, this.aS, this.aDir, this.aK, this.aM]) { a.needsUpdate = true; a.clearUpdateRanges?.(); }
    this.mesh.visible = true;
  }
}

// ------------------------------------------------------------------ chunks (instanced cel solids)
export function chunkMaterial(o = {}) {
  const u = { ...G, uId: { value: o.id ?? 73 }, uDark: { value: new THREE.Color(o.dark ?? '#8c7c9c') }, uRim: { value: o.rim ?? 0 }, uSat: { value: o.sat ?? 0.72 } };
  const vs = /* glsl */ `
    varying vec3 vWorld;
    varying vec3 vNormalW;
    varying vec3 vNormalV;
    varying float vDepth;
    varying vec3 vCol;
    varying vec3 vObj;
    void main(){
      mat4 im = instanceMatrix;
      vec4 wp = modelMatrix * im * vec4(position, 1.0);
      vWorld = wp.xyz;
      vec3 nW = normalize(mat3(modelMatrix) * mat3(im) * normal);
      vNormalW = nW;
      vNormalV = normalize(mat3(viewMatrix) * nW);
      vec4 mv = viewMatrix * wp;
      vDepth = -mv.z;
      vObj = position;
      #ifdef USE_INSTANCING_COLOR
        vCol = instanceColor;
      #else
        vCol = vec3(1.0);
      #endif
      gl_Position = projectionMatrix * mv;
    }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform float uId, uRim, uSat;
    uniform vec3 uDark;
    varying vec3 vWorld;
    varying vec3 vNormalW;
    varying vec3 vNormalV;
    varying float vDepth;
    varying vec3 vCol;
    varying vec3 vObj;
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 N = normalize(vNormalW);
      vec3 NV = normalize(vNormalV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      vec3 col = mix(vec3(dot(vCol, vec3(0.3, 0.59, 0.11))), vCol, uSat);
      // chipped, worn stone: a few hard blotches one step darker
      float g = fbm3(vObj * 2.3 + vCol * 17.0);
      col = mix(col, col * vec3(0.88, 0.84, 0.9), step(0.6, g));
      float ndl = dot(N, uKeyDir);
      float lit = smoothstep(-0.03, 0.05, ndl);
      vec3 litCol = col * mix(uSkyTint, uSunColor * 1.06, uSunStrength);
      float up = smoothstep(-0.7, 0.6, N.y);
      vec3 shadeCol = col * uShadeTint * mix(uBounce, vec3(1.0), up);
      vec3 outc = mix(mix(shadeCol, litCol, 0.12), litCol, lit);
      float deep = step(ndl, -0.55) * step(N.y, -0.35);
      outc = mix(outc, col * uDeepTint, deep * 0.85);
      // metal: a hard highlight band
      if(uRim > 0.5){
        vec3 V = normalize(cameraPosition - vWorld);
        float sp = dot(N, normalize(uKeyDir + V));
        outc = mix(outc, mix(outc, vec3(1.0, 0.92, 0.7), 0.6), step(0.995, sp) * lit);
      }
      writeOut(outc, 1.0, NV, vDepth, uId);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide });
}

function rockGeo(seed, detail = 1) {
  const g = new THREE.IcosahedronGeometry(0.5, detail);
  const p = g.getAttribute('position');
  const key = (x, y, z) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
  const off = new Map();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = key(x, y, z);
    if (!off.has(k)) off.set(k, 0.78 + 0.34 * hash(off.size, seed, 3));
    const s = off.get(k);
    // flatten one side: broken stone has planes
    let yy = y * s;
    if (yy < -0.3) yy = -0.3 + (yy + 0.3) * 0.2;
    p.setXYZ(i, x * s, yy, z * s);
  }
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  return ng;
}
function blockGeo(seed) {
  const g = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
  const p = g.getAttribute('position');
  const key = (x, y, z) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
  const off = new Map();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = key(x, y, z);
    if (!off.has(k)) {
      const n = off.size;
      const nOut = (Math.abs(x) > 0.49 ? 1 : 0) + (Math.abs(y) > 0.49 ? 1 : 0) + (Math.abs(z) > 0.49 ? 1 : 0);
      // corners get knocked off (pulled in hard), edges chipped, faces stay nearly flat
      const pull = nOut === 3 ? (hash(n, seed, 4) < 0.45 ? hr(n, seed, 5, 0.12, 0.3) : 0.02) : nOut === 2 ? hr(n, seed, 5, 0, 0.1) : hr(n, seed, 5, -0.03, 0.03);
      off.set(k, [-x * pull * 1.4 + hr(n, seed, 1, -0.03, 0.03), -y * pull * 1.4 + hr(n, seed, 2, -0.03, 0.03), -z * pull * 1.4 + hr(n, seed, 3, -0.03, 0.03)]);
    }
    const o = off.get(k);
    p.setXYZ(i, x + o[0], y + o[1], z + o[2]);
  }
  // a chamfered (knocked off) corner
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  return ng;
}
function petalGeo() {
  // a small cupped teardrop, 1 unit long
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.5);
  shape.bezierCurveTo(0.42, -0.25, 0.38, 0.3, 0, 0.5);
  shape.bezierCurveTo(-0.38, 0.3, -0.42, -0.25, 0, -0.5);
  const g = new THREE.ShapeGeometry(shape, 6);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, (x * x) * 0.9 - y * 0.12); }
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}
export const GEO = { rock: rockGeo, block: blockGeo, petal: petalGeo };

export class ChunkBatch {
  constructor(geo, material, max) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(geo, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.userData.noShadow = true;
    this.n = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._c = new THREE.Color();
  }
  begin() { this.n = 0; }
  // position, euler rotation, scale xyz, colour
  push(x, y, z, rx, ry, rz, sx, sy, sz, color) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this._q.setFromEuler(this._e.set(rx, ry, rz));
    this._m.compose(this._p.set(x, y, z), this._q, this._s.set(sx, sy, sz));
    this.mesh.setMatrixAt(i, this._m);
    this.mesh.setColorAt(i, typeof color === 'string' ? this._c.set(color) : color);
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.mesh.visible = true;
  }
}

// ------------------------------------------------------------------ overlay helpers
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
float fb(vec2 p){ float s = 0., a = .5; for(int i = 0; i < 5; i++){ s += a*vn(p); p = p*2.03 + vec2(1.7, 9.2); a *= .5; } return s / 0.96875; }
`;

// ---------------------------------------------------------- lightning lines
export class LineBatch {
  constructor(material, maxVerts = 20000) {
    this.max = maxVerts;
    const g = new THREE.BufferGeometry();
    const mk = (n) => { const a = new THREE.BufferAttribute(new Float32Array(maxVerts * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aPos = mk(3); this.aPrev = mk(3); this.aNext = mk(3);
    this.aA = mk(4); this.aC = mk(4); this.aH = mk(4); this.aK = mk(4);
    g.setAttribute('position', this.aPos); g.setAttribute('aPrev', this.aPrev); g.setAttribute('aNext', this.aNext);
    g.setAttribute('aA', this.aA); g.setAttribute('aC', this.aC); g.setAttribute('aH', this.aH); g.setAttribute('aK', this.aK);
    this.idx = new THREE.BufferAttribute(new Uint32Array(maxVerts * 3), 1);
    this.idx.setUsage(THREE.DynamicDrawUsage);
    g.setIndex(this.idx);
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.nv = 0; this.ni = 0;
  }
  begin() { this.nv = 0; this.ni = 0; }
  // o: { px, m, width(s), color, hot, power, soft, mode (0 depth-tested, 2 none), bias, rim }
  push(pts, o = {}) {
    const n = pts.length;
    if (n < 2 || this.nv + n * 2 > this.max) return;
    const px = o.px ?? 1.5, m = o.m ?? 0, soft = o.soft ?? 6, mode = o.mode ?? 0, bias = o.bias ?? 2, rim = o.rim ?? 0;
    const c = o.color ?? [0.3, 0.85, 1.0], hot = o.hot ?? [1, 1, 1], power = o.power ?? 1;
    const fw = o.width;
    const base = this.nv;
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1);
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const wk = fw ? fw(s) : 1;
      for (let sd = 0; sd < 2; sd++) {
        const v = this.nv++;
        this.aPos.array.set([p.x, p.y, p.z], v * 3);
        this.aPrev.array.set([a.x, a.y, a.z], v * 3);
        this.aNext.array.set([b.x, b.y, b.z], v * 3);
        this.aA.array.set([sd ? 1 : -1, s, px * wk, m * wk], v * 4);
        this.aC.array.set([c[0], c[1], c[2], power], v * 4);
        this.aH.array.set([hot[0], hot[1], hot[2], soft], v * 4);
        this.aK.array.set([mode, bias, rim, 0], v * 4);
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
    for (const a of [this.aPos, this.aPrev, this.aNext, this.aA, this.aC, this.aH, this.aK, this.idx]) { a.needsUpdate = true; a.clearUpdateRanges?.(); }
    this.mesh.visible = true;
  }
}

// A lightning leg: long straight runs and sharp kinks, displaced across the view.
export function boltPts(a, b, seed, R, U, rough = 0.24, levels = 5) {
  let pts = [a.clone(), b.clone()];
  let amp = a.distanceTo(b) * rough;
  for (let l = 0; l < levels; l++) {
    const nx = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      const k = 0.3 + 0.4 * hash(seed, l * 31 + 1, i);
      const m = new THREE.Vector3().lerpVectors(p, q, k);
      const dx = (hash(seed, l * 31 + 2, i) - 0.5) * 2 * amp, dy = (hash(seed, l * 31 + 3, i) - 0.5) * 2 * amp;
      m.addScaledVector(R, dx).addScaledVector(U, dy);
      nx.push(m, q);
    }
    pts = nx;
    amp *= 0.52;
  }
  return pts;
}

export function boltMaterial(S) {
  const u = { uSceneData: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uS: { value: S }, uRimC: { value: new THREE.Color(0.08, 0.32, 0.85) } };
  const vs = /* glsl */ `
    attribute vec3 aPrev, aNext;
    attribute vec4 aA, aC, aH, aK;
    uniform vec2 uRes;
    uniform float uS;
    varying vec2 vA;
    varying float vDepth, vW, vPad;
    varying vec4 vC;
    varying vec4 vH;
    varying vec3 vK;
    const float NEARZ = -0.6;
    vec4 toNear(vec4 a, vec4 b){ return mix(a, b, clamp((NEARZ - a.z) / (b.z - a.z), 0.0, 1.0)); }
    void main(){
      vec4 v = viewMatrix * vec4(position, 1.0);
      vec4 vp = viewMatrix * vec4(aPrev, 1.0);
      vec4 vn = viewMatrix * vec4(aNext, 1.0);
      if(v.z > NEARZ){
        if(vn.z < NEARZ) v = toNear(v, vn);
        else if(vp.z < NEARZ) v = toNear(v, vp);
        else { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); return; }
      }
      if(vp.z > NEARZ) vp = toNear(vp, v);
      if(vn.z > NEARZ) vn = toNear(vn, v);
      vec4 c = projectionMatrix * v, cp = projectionMatrix * vp, cn = projectionMatrix * vn;
      vec2 s = c.xy / c.w * 0.5 * uRes, sp = cp.xy / cp.w * 0.5 * uRes, sn = cn.xy / cn.w * 0.5 * uRes;
      vec2 d = sn - sp;
      float l = length(d);
      d = l > 1e-3 ? d / l : vec2(1.0, 0.0);
      vec2 nr = vec2(-d.y, d.x);
      float ppm = projectionMatrix[1][1] * 0.5 * uRes.y / max(-v.z, 0.1);
      float w = aA.z * uS + aA.w * ppm;
      float pad = w * 3.0 + 2.0 * uS + aH.w * uS;
      vec2 P = s + nr * aA.x * pad;
      vA = vec2(aA.x * pad, aA.y);
      vW = w; vPad = pad;
      vC = aC; vH = aH; vK = aK.xyz;
      vDepth = -v.z;
      gl_Position = vec4(P / (0.5 * uRes) * c.w, c.z, c.w);
    }
  `;
  const fs = /* glsl */ `
    uniform sampler2D uSceneData;
    uniform vec2 uRes;
    uniform float uS;
    uniform vec3 uRimC;
    varying vec2 vA;
    varying float vDepth, vW, vPad;
    varying vec4 vC;
    varying vec4 vH;
    varying vec3 vK;
    out vec4 oColor;
    void main(){
      float sd = texture(uSceneData, gl_FragCoord.xy / uRes).b;
      if(vK.x < 0.5 && sd > 0.01 && vDepth > sd + vK.y) discard;
      float d = abs(vA.x), w = vW;
      float core = clamp(w - d + 0.5, 0.0, 1.0);
      float band = clamp(w * 1.7 + 0.8 * uS - d + 0.5, 0.0, 1.0);
      float rim = clamp(w * 2.0 + 1.8 * uS - d + 0.5, 0.0, 1.0);
      float soft = clamp(1.0 - max(d - w, 0.0) / max(vPad - w, 0.5), 0.0, 1.0);
      soft = soft * soft * soft;
      float pw = vC.a;
      vec3 hot = vH.rgb * (1.0 + 0.22 * min(pw, 2.0));
      vec3 rgb = hot * core * 1.25 + vC.rgb * (0.85 + 0.15 * min(pw, 2.0)) * band * (1.0 - core) + vC.rgb * soft * 0.22 * pw;
      float a = max(rim * vK.z, band) * min(pw, 1.0);
      rgb *= min(pw, 1.0);
      rgb += uRimC * rim * (1.0 - band) * vK.z * min(pw, 1.0);
      rgb = min(rgb, vec3(1.9));
      if(a < 0.003 && dot(rgb, rgb) < 1e-5) discard;
      oColor = vec4(rgb, a);
    }
  `;
  return premult(new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
}

// ---------------------------------------------------------- glows
export const GLOW = { soft: 0, kira: 1, ring: 2, burst: 3, streak: 4, disc: 5 };
export class GlowBatch {
  constructor(material, max = 256) {
    this.max = max;
    const g = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('uv', base.getAttribute('uv'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.aC = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.aK = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.aL = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    for (const a of [this.aPos, this.aC, this.aK, this.aL]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iC', this.aC); g.setAttribute('iK', this.aK); g.setAttribute('iL', this.aL);
    g.instanceCount = 0;
    this.geo = g;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.n = 0;
  }
  begin() { this.n = 0; }
  // o: { kind, m (radius metres), px (radius pixels), color, power, rot, aspect, mode, bias, seed }
  push(p, o) {
    if (this.n >= this.max || (o.power ?? 1) <= 0) return;
    const i = this.n++, c = o.color ?? [0.45, 0.88, 1];
    this.aPos.array.set([p.x, p.y, p.z], i * 3);
    this.aC.array.set([c[0], c[1], c[2], o.power ?? 1], i * 4);
    this.aK.array.set([o.kind ?? 0, o.m ?? 0, o.px ?? 0, o.rot ?? 0], i * 4);
    this.aL.array.set([o.aspect ?? 1, o.mode ?? 0, o.bias ?? 4, o.seed ?? 0.1], i * 4);
  }
  end() {
    this.geo.instanceCount = this.n;
    for (const a of [this.aPos, this.aC, this.aK, this.aL]) { a.needsUpdate = true; a.clearUpdateRanges?.(); }
    this.mesh.visible = true;
  }
}

export function glowMaterial(S) {
  const u = { uSceneData: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uS: { value: S } };
  const vs = /* glsl */ `
    attribute vec3 iPos;
    attribute vec4 iC, iK, iL;
    uniform vec2 uRes;
    uniform float uS;
    varying vec2 vL;
    varying vec4 vC, vK, vO;
    varying float vDepth, vR;
    void main(){
      vec4 mv = viewMatrix * vec4(iPos, 1.0);
      if(mv.z > -0.3){ gl_Position = vec4(3.0, 3.0, 3.0, 1.0); return; }
      vec4 c = projectionMatrix * mv;
      float ppm = projectionMatrix[1][1] * 0.5 * uRes.y / -mv.z;
      float s = iK.y * ppm + iK.z * uS;
      vec2 q = position.xy * 2.0;
      vec2 p = vec2(q.x * s * iL.x, q.y * s);
      float r = iK.w;
      p = mat2(cos(r), sin(r), -sin(r), cos(r)) * p;
      vL = q; vC = iC; vK = iK; vO = iL; vDepth = -mv.z; vR = s;
      gl_Position = vec4(c.xy + p / (0.5 * uRes) * c.w, c.z, c.w);
    }
  `;
  const fs = /* glsl */ `
    uniform sampler2D uSceneData;
    uniform vec2 uRes;
    uniform float uS;
    varying vec2 vL;
    varying vec4 vC, vK, vO;
    varying float vDepth, vR;
    out vec4 oColor;
    ${HASH}
    void main(){
      float sd = texture(uSceneData, gl_FragCoord.xy / uRes).b;
      if(vO.y < 0.5 && sd > 0.01 && vDepth > sd + vO.z) discard;
      float k = vK.x, r = length(vL), a = 0.0;
      float aa = 1.5 / max(vR, 1.0);
      vec3 col = vC.rgb, rgb = vec3(0.0);
      float P = vC.a;
      if(k < 0.5){
        float e = clamp(1.0 - r, 0.0, 1.0);
        float I = e * e * (0.25 + 0.75 * exp(-r * r * 9.0));
        rgb = col * P * I;
        a = clamp(I * P, 0.0, 1.0) * 0.7;
      } else if(k < 1.5){
        float x = abs(vL.x), y = abs(vL.y);
        float armH = clamp(1.0 - x, 0.0, 1.0), armV = clamp(1.0 - y, 0.0, 1.0);
        float h = smoothstep(0.022 * armH + aa, 0.022 * armH - aa * 0.3, y) * armH;
        float v = smoothstep(0.022 * armV + aa, 0.022 * armV - aa * 0.3, x) * armV;
        float heart = smoothstep(0.12 + aa, 0.09, r);
        float halo = exp(-r * r * 12.0) * 0.5;
        float I = max(max(h, v), heart);
        rgb = (mix(col, vec3(1.0), smoothstep(0.1, 0.8, I)) * I * 1.6 + col * halo) * P;
      } else if(k < 2.5){
        float th = vO.w;
        float e0 = smoothstep(1.0 - th - aa, 1.0 - th + aa, r), e1 = smoothstep(1.0 + aa, 1.0 - aa, r);
        float on = e0 * e1;
        rgb = mix(col, vec3(1.0), 0.7) * on * 1.4 * P;
        a = on * 0.9 * min(P, 1.0);
      } else if(k < 3.5){
        float an = atan(vL.y, vL.x);
        float sd2 = vO.w * 91.7;
        float n1 = vn(vec2(an * 2.6 + sd2, sd2));
        float n2 = vn(vec2(an * 8.0 - sd2, sd2 * 1.7));
        float spikes = pow(abs(sin(an * 3.5 + sd2 * 1.3)), 6.0) * 0.5 + pow(abs(sin(an * 7.0 + sd2)), 12.0) * 0.26;
        float R1 = 0.34 + 0.34 * n1 + 0.12 * n2 + spikes;
        float R0 = R1 * 0.62;
        float body = smoothstep(R1 + aa, R1 - aa, r);
        float core = smoothstep(R0 + aa, R0 - aa, r);
        float halo = exp(-r * r * 4.0) * 0.7 * clamp(1.0 - r, 0.0, 1.0);
        rgb = (vec3(1.0) * core * 1.9 + col * 1.3 * body * (1.0 - core) + col * halo) * P;
        a = body * min(P, 1.0);
      } else if(k < 4.5){
        float x = vL.x;
        float wd = (1.0 - x * x);
        float y = abs(vL.y) / max(wd, 0.001);
        float I = smoothstep(1.0, 0.25, y) * step(abs(x), 1.0);
        rgb = (mix(col, vec3(1.0), 0.75 * smoothstep(0.7, 0.1, y)) * I * 1.5) * P;
      } else {
        float d = smoothstep(1.0 + aa, 1.0 - aa, r);
        float c = smoothstep(0.62 + aa, 0.62 - aa, r);
        rgb = (vec3(1.0) * c * 1.6 + col * 1.2 * d * (1.0 - c)) * P;
        a = d * min(P, 1.0);
      }
      rgb = min(rgb, vec3(1.9));
      if(dot(rgb, rgb) < 1e-6 && a < 0.003) discard;
      oColor = vec4(rgb, a);
    }
  `;
  return premult(new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
}

// ---------------------------------------------------------- soft veils (overlay)
export function mistMaterial() {
  const u = { uSceneData: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uDrawing: { value: 0 } };
  const vs = /* glsl */ `
    attribute vec3 iPos;
    attribute vec4 iS;   // size x, size y, seed, opacity
    attribute vec4 iC;   // softness (m), rotation, tone, hardness
    attribute vec3 iTop; // lit colour
    attribute vec3 iBot; // shade colour
    varying vec2 vQ;
    varying vec4 vS;
    varying vec4 vC;
    varying vec3 vTop, vBot;
    varying float vDepth;
    void main(){
      vec4 mv = viewMatrix * vec4(iPos, 1.0);
      vDepth = -mv.z;
      vec2 q = position.xy * 2.0;
      float r = iC.y;
      vec2 o = mat2(cos(r), sin(r), -sin(r), cos(r)) * (q * iS.xy);
      mv.xy += o;
      vQ = q; vS = iS; vC = iC; vTop = iTop; vBot = iBot;
      gl_Position = projectionMatrix * mv;
    }
  `;
  const fs = /* glsl */ `
    uniform sampler2D uSceneData;
    uniform vec2 uRes;
    uniform float uDrawing;
    varying vec2 vQ;
    varying vec4 vS;
    varying vec4 vC;
    varying vec3 vTop, vBot;
    varying float vDepth;
    out vec4 oColor;
    ${HASH}
    void main(){
      if(vDepth < 0.3) discard;
      vec2 q = vQ;
      float seed = vS.z, op = vS.w;
      float n = fb(q * 1.3 + seed * 7.0 + vec2(uDrawing * 0.02, 0.0));
      float r = length(q);
      float body = 1.0 - r + (n - 0.5) * 1.05;
      float hard = vC.w;
      float a = smoothstep(0.0, mix(0.55, 0.06, hard), body);
      float sceneD = texture(uSceneData, gl_FragCoord.xy / uRes).b;
      float soft = sceneD < 0.01 ? 1.0 : clamp((sceneD - vDepth) / vC.x, 0.0, 1.0);
      a *= soft * op;
      if(a < 0.004) discard;
      float sh = smoothstep(-0.4, 0.5, q.y + q.x * -0.4 + (n - 0.5) * 1.2) - vC.z;
      vec3 c = mix(vBot, vTop, clamp(sh, 0.0, 1.0));
      oColor = vec4(c * a, a);
    }
  `;
  return premult(new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs,
    transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
}

export class QuadBatch {
  constructor(material, max, attrs) {
    this.max = max;
    const g = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('uv', base.getAttribute('uv'));
    this.list = [];
    for (const [name, size] of Object.entries(attrs)) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(max * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
      this.list.push([a, size]);
    }
    g.instanceCount = 0;
    this.geo = g;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.n = 0;
  }
  begin() { this.n = 0; }
  push(...vals) {
    if (this.n >= this.max) return;
    const i = this.n++;
    for (let k = 0; k < this.list.length; k++) {
      const [a, size] = this.list[k];
      const v = vals[k];
      for (let c = 0; c < size; c++) a.array[i * size + c] = v[c] ?? 0;
    }
  }
  end() {
    this.geo.instanceCount = this.n;
    for (const [a] of this.list) { a.needsUpdate = true; a.clearUpdateRanges?.(); }
    this.mesh.visible = true;
  }
}

// ---------------------------------------------------------- the flash dome (overlay)
export function domeMaterial() {
  const u = { uSceneData: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uPower: { value: 0 }, uDrawing: { value: 0 },
    uCol: { value: new THREE.Color(0.45, 0.9, 1.0) } };
  const vs = /* glsl */ `
    varying vec3 vN, vV, vObj;
    varying float vDepth;
    void main(){
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vec4 mv = viewMatrix * wp;
      vDepth = -mv.z;
      vN = normalize(mat3(modelMatrix) * normal);
      vV = normalize(cameraPosition - wp.xyz);
      vObj = position;
      gl_Position = projectionMatrix * mv;
    }
  `;
  const fs = /* glsl */ `
    uniform sampler2D uSceneData;
    uniform vec2 uRes;
    uniform float uPower, uDrawing;
    uniform vec3 uCol;
    varying vec3 vN, vV, vObj;
    varying float vDepth;
    out vec4 oColor;
    ${HASH}
    void main(){
      float sd = texture(uSceneData, gl_FragCoord.xy / uRes).b;
      if(sd > 0.01 && vDepth > sd + 2.0) discard;
      float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
      // drawn bands: white heart, cyan body, a hard bright rim, crackling streaks
      float an = atan(vObj.z, vObj.x);
      float n = fb(vec2(an * 6.0, vObj.y * 4.0) + uDrawing * 1.37);
      float t = f + (n - 0.5) * 0.25;
      // a pale cyan glass of light: thin heart, saturated body, hard white rim
      vec3 c = mix(uCol, vec3(1.0), 0.75) * 1.05;
      // white-hot near the ground behind the wall, thinning to cyan glass at the crown
      float hb = smoothstep(0.55, 0.0, vObj.y + (n - 0.5) * 0.2);
      float a = mix(0.42, 0.9, hb);
      c = mix(c, vec3(1.25), hb);
      if(t > 0.5) { c = mix(uCol, vec3(1.0), 0.35) * 1.0; a = 0.6; }
      if(t > 0.78) { c = uCol * 0.95; a = 0.85; }
      if(t > 0.92) { c = vec3(1.0) * 1.5; a = 1.0; }
      // rays crawling up the dome
      float ray = step(0.8, vn(vec2(an * 30.0, uDrawing * 3.1)));
      c = mix(c, vec3(1.4), ray * step(0.3, t) * 0.6);
      a = max(a, ray * step(0.3, t) * 0.7) * uPower;
      oColor = vec4(c * a, a);
    }
  `;
  return premult(new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, transparent: true, depthTest: false, depthWrite: false, side: THREE.FrontSide }));
}

// ---------------------------------------------------------- shock ring over the roofs (overlay, per pixel on a plane)
export function planeRingMaterial() {
  const u = {
    uSceneData: { value: null }, uRes: { value: new THREE.Vector2(1, 1) },
    uTan: { value: new THREE.Vector2(1, 1) }, uCam: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
    uY: { value: 12 }, uR: { value: new THREE.Vector4() }, uDrawing: { value: 0 },
    uColor: { value: new THREE.Color('#ffffff') }, uShade: { value: new THREE.Color('#e6d8cc') },
  };
  const fs = /* glsl */ `
    uniform sampler2D uSceneData;
    uniform vec2 uRes, uTan;
    uniform float uY, uDrawing;
    uniform mat4 uCam;
    uniform vec3 uCamPos, uColor, uShade;
    uniform vec4 uR;      // x, z, radius, power
    out vec4 oColor;
    ${HASH}
    void main(){
      if(uR.w < 0.002) discard;
      vec2 uv = gl_FragCoord.xy / uRes;
      vec3 rv = vec3((uv * 2.0 - 1.0) * uTan, -1.0);
      vec3 rd = mat3(uCam) * rv;
      float sd = texture(uSceneData, uv).b;
      // roofs flash white as the front passes over them
      float fl = 0.0;
      if(sd > 0.01 && sd < 3000.0){
        vec3 Ps = uCamPos + rd * sd;
        float rs = length(Ps.xz - uR.xy);
        float R0 = uR.z;
        fl = smoothstep(R0 - 30.0, R0 - 10.0, rs) * (1.0 - smoothstep(R0 + 2.0, R0 + 8.0, rs)) * step(Ps.y, 40.0) * step(0.5, Ps.y);
        fl *= 0.55 + 0.45 * step(0.4, fb(Ps.xz * 0.08 + uDrawing * 0.37));
      }
      float flA = fl * 0.8 * uR.w;
      float t = abs(rd.y) < 1e-4 ? -1.0 : (uY - uCamPos.y) / rd.y;
      if(t <= 0.0 || (sd > 0.01 && t > sd + 25.0)){
        if(flA < 0.004) discard;
        oColor = vec4(vec3(1.0, 0.99, 0.96) * flA, flA);
        return;
      }
      vec3 P = uCamPos + rd * t;
      float mpp = max(length(fwidth(P.xz)), 1e-3);
      vec2 q = P.xz - uR.xy;
      float r = length(q), R = uR.z;
      float an = atan(q.y, q.x);
      float n = fb(vec2(an * 9.0, R * 0.01) + uDrawing * 0.7);
      float lw = max(R * 0.045, mpp * 2.0);
      float hw = lw * (0.6 + n);
      float d = r - R;
      float ring = clamp((hw - abs(d)) / mpp + 0.5, 0.0, 1.0);
      // drawn front: white leading lip, lavender underside, ink on the outer edge
      float ink = clamp((mpp * 1.3 - abs(d - hw)) / mpp + 0.5, 0.0, 1.0);
      float inkIn = clamp((mpp * 0.8 - abs(d + hw)) / mpp + 0.5, 0.0, 1.0) * step(0.45, fb(vec2(an * 22.0, 3.1)));
      float sh = step(d, hw * (-0.1 + 0.5 * (fb(vec2(an * 16.0, R * 0.02 + 5.0)) - 0.5)));
      // a pale band of dragged air behind the front, broken into streaks
      float st = step(0.5, fb(vec2(an * 40.0, r * 0.02)));
      float back = smoothstep(R * 0.55, R * 0.97, r) * step(r, R) * (0.35 + 0.4 * st);
      float A = max(max(ring, max(ink, inkIn) * 0.9), back * 0.4) * uR.w;
      vec3 rgb = mix(uShade, mix(uColor, vec3(0.80, 0.76, 0.94), sh), ring);
      rgb = mix(rgb, vec3(0.43, 0.37, 0.62), max(ink, inkIn));
      // under the ring band, the roof flash shows through what the band leaves uncovered
      rgb = rgb * A + vec3(1.0, 0.99, 0.96) * flA * (1.0 - A);
      A = A + flA * (1.0 - A);
      if(A < 0.004) discard;
      oColor = vec4(rgb, A);
    }
  `;
  return premult(new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: FS_VS, fragmentShader: fs, transparent: true, depthTest: false, depthWrite: false }));
}

// ---------------------------------------------------------- full-frame flash veil
export function screenFlashMaterial() {
  const u = { uColor: { value: new THREE.Color(1, 1, 1) }, uA: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uRes: { value: new THREE.Vector2(1, 1) } };
  const fs = /* glsl */ `
    uniform vec3 uColor;
    uniform float uA;
    uniform vec2 uCenter, uRes;
    out vec4 oColor;
    void main(){
      vec2 uv = gl_FragCoord.xy / uRes;
      vec2 p = (uv - uCenter) * vec2(uRes.x / uRes.y, 1.0);
      // brightest toward the source, so the white-out still has a direction
      float g = clamp(1.25 - length(p) * 0.5, 0.0, 1.0);
      float a = clamp(uA * mix(0.8, 1.0, g), 0.0, 1.0);
      if(a < 0.002) discard;
      oColor = vec4(uColor * (1.0 + 0.6 * g * uA) * a, a);
    }
  `;
  const m = premult(new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: FS_VS, fragmentShader: fs, transparent: true, depthTest: false, depthWrite: false }));
  return m;
}

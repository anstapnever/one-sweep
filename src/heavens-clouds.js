import * as THREE from 'three';
import { G, COMMON, MRT_OUT } from './glsl.js';
import { Rng } from './util.js';
import { CLOUD_DECK_Y } from './layout.js';

// Anime cumulus as painted billows. Every cloud is a heap of round puffs drawn back to front on the sky sphere (no
// parallax, they are far away), each one a little shaded ball: lit top, one hard shadow side, a soft violet base. White
// on white merges into one mass; the only lines the eye sees are the silhouette and the scallops of the shadow edge.
// Time warps move the puffs themselves: the flick cut, the spiral, the sweeping front (src/heavens-time.js).

const DEG = Math.PI / 180;
const dirOf = (azD, elD) => {
  const a = azD * DEG, e = elD * DEG;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
};

// puff record: az, el, r, z, relX, relY (light on the whole mass), hgt, kind, base
// Three levels: the whole cloud -> its lobes -> buds on the lobes' outer rim. Light comes from the big forms,
// so each lobe has one lit cap and one hard shadow side and the small billows only scallop that edge.
function towerPuffs(rng, o, out) {
  const { az, base, w, h, R } = o;
  const lobes = o.lobes ?? Math.max(2, Math.round(w / (R * 2.0)));
  const lobeH = [];
  for (let i = 0; i < lobes; i++) lobeH.push(rng.range(0.5, 0.92));
  lobeH[Math.floor(lobes * rng.range(0.3, 0.7))] = 1;
  const lean = o.lean ?? 0;
  const seg = [];
  for (let li = 0; li < lobes; li++) {
    const uu = lobes === 1 ? 0 : li / (lobes - 1) - 0.5;
    const lh = h * lobeH[li] * (1 - 0.6 * Math.pow(Math.abs(uu) * 2, 1.7));
    const lx0 = az + uu * (w - R * 1.4);
    const clumps = Math.max(1, Math.round(lh / (R * 1.5)));
    for (let k = 0; k < clumps; k++) {
      const f = clumps === 1 ? 0.6 : k / (clumps - 1);
      const cy = base + f * Math.max(0, lh - R * 0.7) + R * 0.5;
      const cx = lx0 + lean * f * h + rng.range(-0.4, 0.4) * R * (1 - f * 0.5);
      const cr = R * (1.25 - 0.45 * f) * rng.range(0.9, 1.15);
      const cz = (1 - f) * R * 2 + (0.5 - Math.abs(uu)) * R * 3 + rng.range(0, 1) * R;
      const clump = [];
      // the clump's body: a few big overlapping balls
      const nBody = 7;
      for (let i = 0; i < nBody; i++) {
        const a = rng.range(0, 6.283), rr = rng.range(0, 0.55) * cr;
        clump.push({ az: cx + Math.cos(a) * rr, el: cy + Math.sin(a) * rr * 0.8, r: cr * rng.range(0.55, 0.8), z: cz + rng.range(0, cr * 0.4), lvl: 0 });
      }
      // buds on the upper/sideways outer rim of the clump (two generations)
      const nBud = Math.round(26 + cr / R * 18);
      for (let i = 0; i < nBud; i++) {
        const a = rng.range(-0.55, Math.PI + 0.55);
        const rb = cr * rng.range(0.92, 1.12);
        const bud = { az: cx + Math.cos(a) * rb * 0.92, el: cy + Math.sin(a) * rb * 0.82, r: cr * rng.range(0.16, 0.34), z: cz + cr * 0.55 + rng.range(0, cr * 0.2), lvl: 1 };
        clump.push(bud);
        if (rng.next() < 0.65) {
          const a2 = a + rng.range(-1.0, 1.0);
          clump.push({ az: bud.az + Math.cos(a2) * bud.r * 0.95, el: bud.el + Math.sin(a2) * bud.r * 0.9, r: bud.r * rng.range(0.32, 0.52), z: bud.z + bud.r * 0.3, lvl: 2 });
        }
      }
      for (const p of clump) {
        p.rlX = (p.az - cx) / cr; p.rlY = (p.el - cy) / cr;
      }
      seg.push(...clump);
    }
  }
  const elMid = base + h * 0.5;
  for (const p of seg) {
    const cx = (p.az - az) / (w * 0.55 + 1e-3), cy = (p.el - elMid) / (h * 0.55 + 1e-3);
    p.relX = 0.55 * cx + 0.62 * p.rlX;
    p.relY = 0.55 * cy + 0.7 * p.rlY;
    p.hgt = Math.max(0, Math.min(1, (p.el - base) / (h + 1e-3)));
    p.kind = o.kind ?? 0;
    p.hz = o.haze ?? 0;
    p.base = base + (o.baseLift ?? 0);
  }
  seg.sort((a, b) => a.z - b.z);
  out.push(...seg);
}

// Sea of clouds far below the rail: rings of puffs around the viewer, far rings first.
function deckPuffs(rng, out) {
  const H = -CLOUD_DECK_Y;
  let D = 90000;
  const list = [];
  while (D > 500) {
    const r = Math.max(170, D * 0.042);
    const n = Math.min(320, Math.round((2 * Math.PI * D) / (r * 1.05)));
    const off = rng.next();
    for (let i = 0; i < n; i++) {
      const azD = ((i + off + rng.range(-0.3, 0.3)) / n) * 360;
      const d = D * rng.range(0.97, 1.03);
      const big = rng.next() < 0.14;
      const rr = r * (big ? rng.range(1.4, 2.0) : rng.range(0.7, 1.15));
      const dist = Math.hypot(d, H);
      const lift = big ? rr * 1.05 : rr * rng.range(0.2, 0.55);   // the tops rise out of the sea
      const elD = -Math.atan2(H - lift, d) / DEG;
      const rD = (rr / dist) / DEG;
      list.push({ az: azD, el: elD, r: Math.min(rD, 7.5), z: -d, relX: rng.range(-0.3, 0.3), relY: rng.range(-0.15, 0.25), hgt: rng.range(0.42, 1), kind: 1, hz: 0, base: -90 });
    }
    D /= 1.055;
  }
  for (const p of list) out.push(p);
}

// Extra cloud that only exists while the sky is being pulled in: long arms of billows spiralling into the sky point.
function stormPuffs(rng, out) {
  // One clump = a few big overlapping bodies with buds on the rim. Clumps touch along each arm, so the arms read as
  // continuous masses of cloud; nothing floats alone. Offsets (u along the flow, v across it) light the clump as one form.
  const clump = (th, ang, cr, f) => {
    const sinT = Math.max(0.12, Math.sin(th * DEG));
    const put = (u, v, r, lvl, stage) => {
      const relU = u / cr, relV = v / cr;
      out.push({ stormTh: th + v, stormPhi: ang + u / sinT, az: 0, el: 0, r, z: -th * 10 + lvl * 0.4 + rng.next() * 0.3,
        relX: relU * 0.85, relY: relV * 0.85, hgt: Math.max(0, Math.min(1, 0.6 + relV * 0.4)), kind: 2, hz: 0, stage: Math.min(1, stage), base: -90 });
    };
    for (let i = 0; i < 6; i++) {
      const a = rng.range(0, 6.283), rr = rng.range(0, 0.5) * cr;
      put(Math.cos(a) * rr, Math.sin(a) * rr, cr * rng.range(0.55, 0.8), 0, f);
    }
    const buds = 7;
    for (let i = 0; i < buds; i++) {
      const a = ((i + rng.next()) / buds) * 6.283, rb = cr * rng.range(0.8, 1.0);
      put(Math.cos(a) * rb * 0.6, Math.sin(a) * rb * 0.6, cr * rng.range(0.3, 0.55), 1, f + 0.05);
    }
    // a late generation of small billows: absent while the storm forms, they serrate the rims once the spiral winds up
    for (let i = 0; i < 10; i++) {
      const a = ((i + rng.next()) / 10) * 6.283, rb = cr * rng.range(0.85, 1.1);
      put(Math.cos(a) * rb, Math.sin(a) * rb, cr * rng.range(0.14, 0.27), 2, 0.75 + f * 0.25);
    }
  };
  for (let arm = 0; arm < 5; arm++) {
    let th = 4;
    while (th < 122) {
      const f = (th - 4) / 118;
      const ang = (arm / 5) * 360 + th * 3.1 + rng.range(-5, 5);
      // big heads among small ones: the arm has a rhythm instead of even beads
      const head = rng.next() < 0.17 ? rng.range(1.5, 2.1) : 1;
      const cr = (1.5 + f * 7.5) * (0.7 + 1.1 * Math.pow(rng.next(), 2.0)) * head;
      clump(th, ang, cr, f);
      // the arm has body: flanking clumps across the flow
      if (rng.next() < 0.75) clump(th + rng.range(-1, 1) * cr * 1.15, ang + rng.range(-0.4, 0.4) * cr, cr * rng.range(0.6, 0.9), f);
      th += cr * 0.95 / Math.hypot(1, 3.1 * Math.sin(th * DEG));
    }
  }
}

// The cloud wall that rides the sweep's front: a closed ring of billows, placed in the shader around the front's axis.
function wallPuffs(rng, out) {
  const list = [];
  const add = (n, r0, r1, st0, st1) => {
    for (let i = 0; i < n; i++) {
      const stage = rng.range(st0, st1);
      list.push({ wall: true, phi: rng.range(0, 360), r: rng.range(r0, r1), stage, z: -stage, relX: rng.range(-0.3, 0.3), relY: 0.65 - stage * 1.3, hgt: 1 - stage, kind: 3, hz: 0, base: -90, az: 0, el: 0 });
    }
  };
  add(420, 3.5, 6.5, 0.3, 1.0);
  add(900, 1.5, 3.2, 0.08, 0.7);
  add(1400, 0.5, 1.4, 0.0, 0.3);
  list.sort((a, b) => a.z - b.z);
  out.push(...list);
}

function cutFrame() { return { az: 0, el: 30, slope: 0.32 }; }

export function makeCloudPuffs(axis) {
  const rng = new Rng(9417);
  const out = [];
  const add = (o) => towerPuffs(rng, o, out);
  // far castles along the whole horizon, hazed, drawn first
  for (let a = -180; a < 180; a += 17) add({ az: a + rng.range(-6, 6), base: -2.5, w: rng.range(14, 26), h: rng.range(6, 15), R: rng.range(1.2, 1.8), haze: 0.3 });
  // the great towers: every view has a castle in it. North is the city (ship/ring live there), so keep the north sky lighter.
  add({ az: -74, base: -3, w: 34, h: 40, R: 4.4, lean: 0.06 });
  add({ az: 42, base: -3, w: 36, h: 46, R: 4.8, lean: -0.05 });
  add({ az: 96, base: -2, w: 26, h: 28, R: 3.6 });
  add({ az: 128, base: -3, w: 34, h: 38, R: 4.4, lean: 0.04 });
  add({ az: 168, base: -3, w: 26, h: 24, R: 3.4, lean: -0.03 });
  add({ az: 196, base: -3, w: 34, h: 42, R: 4.6, lean: -0.04 });
  add({ az: 234, base: -2, w: 30, h: 30, R: 4.0 });
  add({ az: 262, base: -3, w: 28, h: 26, R: 3.6, lean: 0.05 });
  add({ az: -32, base: -2, w: 18, h: 15, R: 2.6 });
  add({ az: 8, base: -1, w: 14, h: 10, R: 2.0 });
  add({ az: 74, base: 1, w: 12, h: 8, R: 1.8 });
  add({ az: 150, base: 1, w: 10, h: 7, R: 1.6 });
  // fair-weather cumulus higher up (flat bottoms, seen from slightly under)
  for (const [az, el, w] of [[-52, 19, 10], [-14, 27, 14], [22, 18, 9], [-34, 40, 13], [38, 44, 15], [-78, 34, 12],
    [140, 21, 11], [160, 30, 14], [114, 34, 13], [182, 22, 10], [214, 36, 15], [250, 24, 11], [290, 30, 13], [320, 20, 10],
    [84, 52, 16], [200, 58, 18], [-40, 62, 16], [20, 70, 14], [130, 68, 18], [262, 64, 14]]) {
    add({ az, base: el, w, h: w * 0.55, R: w * 0.2, lobes: 3 });
  }
  deckPuffs(rng, out);
  // the bank of cloud that is thrown up behind the warlord after the blade hit; the flick cuts a line through it
  const CUT = cutFrame();
  for (let i = 0; i < 44; i++) {
    const aU = rng.range(-75, 75), aV = rng.range(-24, 24);
    const az = CUT.az + aU, el = CUT.el + aU * CUT.slope + aV;
    if (el < 6) continue;
    const w = rng.range(9, 18);
    towerPuffs(rng, { az, base: el - w * 0.28, w, h: w * 0.62, R: w * 0.2, lobes: 3, kind: 4 }, out);
  }
  const preSky = out.length;
  stormPuffs(rng, out);
  out.slice(preSky).sort((a, b) => a.z - b.z).forEach((p, i) => { out[preSky + i] = p; });
  wallPuffs(rng, out);
  return out;
}

export function buildClouds(puffs, skyUniforms, axis) {
  const quad = new THREE.PlaneGeometry(2, 2);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index; geo.setAttribute('position', quad.getAttribute('position')); geo.setAttribute('uv', quad.getAttribute('uv'));
  const n = puffs.length;
  const aP = new Float32Array(n * 4), aI = new Float32Array(n * 4), aG = new Float32Array(n * 4);
  const rng = new Rng(77);
  // storm basis (axis polar coordinates)
  const A = new THREE.Vector3(...axis);
  const B1 = new THREE.Vector3(0, 1, 0).cross(A).normalize(); const B2 = new THREE.Vector3().crossVectors(A, B1).normalize();
  puffs.forEach((p, i) => {
    let d;
    if (p.wall) d = [p.phi * DEG, 0, 0];
    else if (p.stormTh != null) {
      const th = p.stormTh * DEG, ph = p.stormPhi * DEG;
      const v = new THREE.Vector3().copy(B1).multiplyScalar(Math.cos(ph) * Math.sin(th)).addScaledVector(B2, Math.sin(ph) * Math.sin(th)).addScaledVector(A, Math.cos(th));
      d = [v.x, v.y, v.z];
    } else d = dirOf(p.az, p.el);
    aP.set([d[0], d[1], d[2], p.r * DEG * (p.z != null ? 1 : 1)], i * 4);
    aI.set([rng.next() * 37, p.hgt, p.kind, p.stage ?? 0], i * 4);
    aG.set([p.relX, p.relY, p.hz ?? 0, (p.base ?? -90) * DEG], i * 4);
  });
  geo.setAttribute('aPuff', new THREE.InstancedBufferAttribute(aP, 4));
  geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(aI, 4));
  geo.setAttribute('aRel', new THREE.InstancedBufferAttribute(aG, 4));
  geo.instanceCount = n;

  const u = {
    ...G,
    uZenith: skyUniforms.uZenith, uMid: skyUniforms.uMid, uHorizonWarm: skyUniforms.uHorizonWarm, uHorizonCool: skyUniforms.uHorizonCool,
    uCloudLit: skyUniforms.uCloudLit, uCloudMid: skyUniforms.uCloudMid, uCloudShade: skyUniforms.uCloudShade, uCloudDrift: skyUniforms.uCloudDrift,
    uAxis: { value: A.clone() }, uB1: { value: B1 }, uB2: { value: B2 },
    uCutN: { value: new THREE.Vector3(0, 0, 1) }, uCutC: { value: new THREE.Vector3(0, 0, -1) }, uCutW: { value: 0 }, uCutHead: { value: 0 },
    uSpiral: { value: 0 }, uSpiralRot: { value: 0 }, uCore: { value: 0 },
    uPartF: { value: 0 }, uPartH: { value: 0.3 }, uPartAxis: { value: A.clone() }, uAir: { value: 0 },
    uDrift: { value: 0 }, uBank: { value: 0 },
  };
  const vs = /* glsl */ `
    uniform vec3 uSunDir, uAxis, uB1, uB2, uCutN, uCutC, uPartAxis, uHorizonWarm, uHorizonCool;
    uniform float uCutW, uCutHead, uSpiral, uSpiralRot, uPartF, uPartH, uCloudDrift, uDrift, uTime, uBank;
    attribute vec4 aPuff, aInfo, aRel;
    varying vec2 vQ;
    varying vec3 vL, vHor, vPre, vDir;
    varying vec4 vI;
    varying vec4 vR;
    varying float vGroup, vHaze, vToSun, vPile, vAxisTh;
    const float PI = 3.14159265;
    vec3 rotY(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z); }
    void tangents(vec3 d, out vec3 E, out vec3 U){
      vec3 Y = abs(d.y) > 0.995 ? vec3(0.0, 0.0, -1.0) : vec3(0.0, 1.0, 0.0);
      E = normalize(cross(Y, d)); E = -E;
      U = cross(d, E); U = -U;
      if(dot(U, Y) < 0.0) U = -U;
    }
    void main(){
      vec3 P = aInfo.z > 2.5 && aInfo.z < 3.5 ? vec3(1.0, 0.0, 0.0) : normalize(aPuff.xyz);
      float kind = aInfo.z;
      float r = aPuff.w;
      // storm puffs only exist while the sky is being pulled in; they grow from the outer arm tips inward
      float scale = 1.0;
      bool wall = kind > 2.5 && kind < 3.5;
      if(kind > 1.5 && kind < 2.5){
        float grow = smoothstep(aInfo.w * 0.55, aInfo.w * 0.55 + 0.2, uSpiral);
        scale = pow(grow, 0.55);                                 // swells fast: no field of tiny peas while it forms
      } else if(wall){
        // placed around the front in the part below
        scale = smoothstep(0.0, 0.05, uPartF);
      } else {
        if(kind > 3.5) scale = uBank;
        P = rotY(P, -(uCloudDrift + uDrift) * 0.01745329);
      }
      // ---- the flick: puffs by the line are shoved off it, on both sides
      if(uCutW > 0.0){
        float cd = dot(P, uCutN);
        float ang = asin(clamp(cd, -1.0, 1.0));
        vec3 onC = normalize(P - uCutN * cd + vec3(1e-5));
        float along = acos(clamp(dot(onC, uCutC), -1.0, 1.0));
        float head = smoothstep(uCutHead, uCutHead - 0.25, along);
        float push = uCutW * 1.7 * exp(-abs(ang) / (uCutW * 3.0 + 1e-3)) * head;
        P = normalize(P + uCutN * (ang >= 0.0 ? 1.0 : -1.0) * push);
      }
      if(wall){
        float wphi = aPuff.x;
        vec3 w1 = normalize(cross(uPartAxis, vec3(0.31, 0.0, 0.95)));
        vec3 w2 = cross(uPartAxis, w1);
        float wth = uPartF + uPartH * pow(aInfo.w, 1.25) * 1.05;
        P = uPartAxis * cos(wth) + (w1 * cos(wphi) + w2 * sin(wphi)) * sin(wth);
      }
      vec3 Pc = P;
      // ---- spiral: differential rotation around the sky point + pull toward it
      vec3 Esp = vec3(1.0, 0.0, 0.0);
      float s = uSpiral;
      float th0 = acos(clamp(dot(P, uAxis), -1.0, 1.0));
      if(s > 0.0005 && !wall){
        float rn = th0 / PI;
        float phi = atan(dot(P, uB2), dot(P, uB1));
        float pull = (kind > 0.5 && kind < 1.5) ? 0.35 : 1.0;      // the sea below turns slower
        phi += (uSpiralRot + 2.4 * s / (rn * 3.2 + 0.32)) * pull;
        float th = th0 * mix(1.0, 0.58 + 0.42 * smoothstep(0.0, 0.8, rn), s * pull);
        vec3 pr = uB1 * cos(phi) + uB2 * sin(phi);
        P = normalize(uAxis * cos(th) + pr * sin(th));
        Esp = normalize(cross(uAxis, P) + 1e-5);
      }
      // ---- sweep: everything inside the front is shoved to the wall just outside it
      float pile = 0.0;
      if(uPartF > 0.0 && !wall){
        float c = dot(P, uPartAxis);
        float th = acos(clamp(c, -1.0, 1.0));
        float lim = uPartF + uPartH;
        if(th < lim){
          vec3 pr = normalize(P - uPartAxis * c + vec3(2e-5));
          float nf = th / lim;
          float th2 = uPartF + uPartH * pow(nf, 1.8);
          P = normalize(uPartAxis * cos(th2) + pr * sin(th2));
          pile = 1.0 - nf;
        }
      }
      vec3 E, U; tangents(P, E, U);
      float sx = 1.0, sy = 1.0;
      if(s > 0.0005){
        vec3 E2 = normalize(mix(E, normalize(Esp + 1e-5), s * 0.85));
        E = E2; U = normalize(cross(P, E)); if(dot(U, vec3(0.0, 1.0, 0.0)) < -2.0) U = -U;
        float st = 1.0 + 1.7 * s * smoothstep(0.1, 0.9, th0 / PI + 0.2);
        sx = st; sy = 1.0;
      }
      if(wall) r *= 0.3 + 1.05 * sin(acos(clamp(dot(P, uPartAxis), -1.0, 1.0)));
      r *= scale * (1.0 + 0.55 * pile);
      vQ = position.xy;
      vec3 corner = normalize(P + (E * position.x * sx + U * position.y * sy) * r * 1.22);
      vPre = normalize(Pc + (E * position.x * sx + U * position.y * sy) * r * 1.22);
      vDir = corner;
      vec3 sd = normalize(uSunDir);
      vL = vec3(dot(sd, E), dot(sd, U), dot(sd, -P));
      vGroup = dot(aRel.xy, normalize(vL.xy + 1e-4));
      if(kind > 1.5 && kind < 2.5){
        // storm clumps: offsets are along/across the flow, so the whole clump takes the light as one form
        vec3 off = Esp * aRel.x + cross(Esp, P) * aRel.y;
        vGroup = dot(vec2(dot(off, E), dot(off, U)), normalize(vL.xy + 1e-4));
      }
      vToSun = dot(P, sd);
      float elv = asin(clamp(P.y, -1.0, 1.0));
      vec2 hs = normalize(sd.xz + 1e-5);
      float sunSide = dot(normalize(P.xz + 1e-5), hs) * 0.5 + 0.5;
      vHor = mix(uHorizonCool, uHorizonWarm, smoothstep(0.35, 1.0, sunSide));
      float hz = wall ? 0.0 : aRel.z;
      float below = max(-elv, 0.0);
      vHaze = kind > 0.5 && kind < 1.5
        ? clamp(1.0 - smoothstep(0.0, 0.07, below), 0.0, 1.0) * 0.5
        : clamp(hz + smoothstep(0.17, 0.0, elv) * 0.72, 0.0, 0.95);
      vI = aInfo;
      vR = aRel;
      vPile = pile;
      vAxisTh = acos(clamp(dot(P, uAxis), -1.0, 1.0));
      vec3 vd = mat3(viewMatrix) * corner;
      vec4 clip = projectionMatrix * vec4(vd * 1000.0, 1.0);
      clip.z = clip.w * 0.99999;
      if(scale < 0.002) clip = vec4(2.0, 2.0, 2.0, 1.0);
      gl_Position = clip;
    }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform vec3 uCloudLit, uCloudMid, uCloudShade, uCutN, uCutC, uPartAxis;
    uniform float uCutW, uCutHead, uPartF, uPartH, uSpiral, uCore, uAir;
    uniform vec3 uZenith;
    uniform vec3 uAxis;
    #define uAxisF uAxis
    varying vec2 vQ;
    varying vec3 vL, vHor, vPre, vDir;
    varying vec4 vI, vR;
    varying float vGroup, vHaze, vToSun, vPile, vAxisTh;
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec2 q = vQ;
      float seed = vI.x;
      float n1 = vnoise(q * 1.7 + seed) - 0.5;
      float n2 = vnoise(q * 4.6 + seed * 1.7) - 0.5;
      // the drawn outline: round, with a few scallops on the rim, never fuzzy noise
      float ang = atan(q.y, q.x);
      float sc = abs(sin(ang * (3.0 + floor(mod(seed, 4.0))) + seed));
      float e = 1.0 - dot(q, q) + n1 * 0.18 + (sc - 0.65) * 0.1;
      if(e <= 0.0) discard;
      // flat bottoms: the cloud base is one soft-edged level
      float baseEl = vR.w + n1 * 0.012;
      float fel = asin(clamp(vPre.y, -1.0, 1.0));
      if(fel < baseEl) discard;
      // ---- flick: the band is empty, with razor edges
      float edgeLine = 0.0;
      if(uCutW > 0.0){
        float cd = dot(vPre, uCutN);
        float ang = abs(asin(clamp(cd, -1.0, 1.0)));
        vec3 onC = normalize(vPre - uCutN * cd + vec3(1e-5));
        float along = acos(clamp(dot(onC, uCutC), -1.0, 1.0));
        if(along < uCutHead){
          if(ang < uCutW) discard;
          edgeLine = smoothstep(uCutW + 0.0035, uCutW + 0.0008, ang);
        }
      }
      // ---- sweep: nothing inside the front, the wall has one clean edge
      float wallEdge = 0.0;
      if(uPartF > 0.0){
        float th = acos(clamp(dot(normalize(vDir), uPartAxis), -1.0, 1.0));
        if(th < uPartF) discard;
        wallEdge = smoothstep(uPartF + 0.006, uPartF + 0.0015, th);
      }
      if(uCore > 0.0 && acos(clamp(dot(normalize(vDir), uAxisF), -1.0, 1.0)) < uCore * (0.1 + 0.02 * vnoise(normalize(vDir).xz * 60.0))) discard;
      vec3 n = normalize(vec3(q, sqrt(max(e, 0.02)) * 1.1));
      vec3 L = normalize(vL + vec3(0.0, 0.3, 0.3));    // anime cheat: light leans to the viewer and comes from above
      if(vI.z > 0.5 && vI.z < 1.5) L = normalize(vec3(normalize(vL.xy + vec2(0.0, 0.3)) * 0.9, 0.42));  // the sea, seen from above: a crescent of shadow on every billow
      float deck = step(0.5, vI.z) * step(vI.z, 1.5);
      float pterm = dot(n, L);
      // the big form decides the light; each billow only scallops the shadow's edge
      float lit = deck > 0.5
        ? pterm * 1.15 + vGroup * 0.2 + n1 * 0.16 - 0.68
        : vGroup * 0.95 + (pterm - 0.35) * ((vI.z > 1.5 && vI.z < 2.5) ? mix(0.2, 0.5, smoothstep(0.35, 0.7, uSpiral)) : 0.5) + n1 * 0.1 + n2 * 0.04 + 0.2;
      // while a storm is still forming its billows are soft-shaded; once the spiral winds up the shapes turn hard
      float forming = 1.0 - smoothstep(0.35, 0.7, uSpiral);
      forming *= (vI.z > 1.5 && vI.z < 2.5) ? 1.0 : (vI.z < 0.5 ? smoothstep(0.02, 0.12, uSpiral) : 0.0);   // the castles caught in the pull soften with it
      float tLit = smoothstep(-0.02 - 0.13 * forming, 0.02 + 0.13 * forming, lit);
      float tHi = smoothstep(-0.015 - 0.1 * forming, 0.02 + 0.1 * forming, lit - 0.2);
      float hgt = vI.y;
      // tones: hard shadow -> mid -> light. Inside the shadow a second, lighter tone follows each billow's lit side.
      vec3 violet = uCloudShade * vec3(0.92, 0.84, 1.08);
      float inner = smoothstep(0.12, 0.3, pterm + n1 * 0.15);
      inner = mix(inner, 0.45, uAir * 0.55);                      // s26: no bright rim lines stacking up into heavy layers
      vec3 sh = mix(uCloudShade * vec3(0.96, 0.95, 1.03), mix(uCloudShade, uCloudMid, 0.42 + 0.3 * forming), inner);
      vec3 cc = mix(sh, uCloudMid, tLit);
      cc = mix(cc, uCloudLit, tHi);
      // base of each cloud in a soft violet, feathered up the body
      float baseK = (deck > 0.5 ? 0.0 : smoothstep(0.34, 0.0, hgt + q.y * 0.06 + n1 * 0.1));
      cc = mix(cc, violet, baseK * (1.0 - tHi * 0.75) * 0.9);
      if(deck > 0.5){
        cc = mix(cc, cc * vec3(0.9, 0.9, 1.05), (1.0 - tLit) * 0.5);
      }
      // brush strokes in the shade so it never reads as flat fill
      float br = vnoise(vec2(dot(q, vec2(0.8, 0.6)) * 3.0 + seed, dot(q, vec2(-0.6, 0.8)) * 16.0));
      cc *= 1.0 + (br - 0.5) * 0.06 * (1.0 - tHi);
      // silver lining only when looking almost into the sun
      float back = smoothstep(0.78, 0.97, vToSun);
      float rimK = smoothstep(0.16, 0.0, e) * back;
      cc = mix(cc, uCloudLit * 1.12, rimK * 0.7);
      // storm: darker body, lime breath near the core
      if(uCore > 0.0 && vAxisTh < 1.2){
        float g = smoothstep(0.42, 0.04, vAxisTh);
        cc = mix(cc, cc * vec3(0.92, 1.02, 0.72) + vec3(0.2, 0.3, 0.04) * g, uCore * g * 0.55);
      }
      // the wall piles up bright against the front
      cc = mix(cc, uCloudLit * 1.05, smoothstep(0.1, 1.0, vPile) * 0.25);
      cc = mix(cc, vHor, vHaze);
      if(uAir > 0.0){
        // s26: the tension stays, but there is air: shadows open up and the far layers pale toward the horizon
        cc = mix(cc, mix(cc, uCloudMid, 0.22), uAir * (1.0 - tHi));
        float farK = smoothstep(0.85, 0.06, fel);
        cc = mix(cc, mix(uCloudMid, uCloudLit, 0.5), uAir * farK * farK * 0.72);
      }
      // the sea of clouds carries the shadows of the cumulus overhead: long flat painted shapes, stronger than the haze
      if(deck > 0.5){
        vec3 dd = normalize(vDir);
        if(dd.y < -0.004){
          // log-polar coordinates: patches thin out toward the horizon and never alias into stripes
          vec2 pl = normalize(dd.xz) * (13.0 + 2.0 * log(-dd.y));
          float pn = fbm2(pl * 1.15 + 4.0) + 0.12 * vnoise(pl * 6.0);
          float pfade = smoothstep(0.006, 0.03, -dd.y) * (1.0 - smoothstep(0.1, 0.26, -dd.y));
          float patchK = smoothstep(0.5, 0.515, pn) * pfade * tLit;
          cc = mix(cc, mix(mix(uCloudMid, uCloudShade, 0.6), vHor, 0.18), patchK * 0.85);
        }
      }
      cc = mix(cc, vec3(1.06, 1.04, 0.98), max(edgeLine * 0.9, wallEdge * 0.95));
      writeOut(cc, 1.0, vec3(0.0, 0.0, 1.0), 9000.0, 0.0);
    }
  `;
  const mat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, depthWrite: false, depthTest: false, side: THREE.DoubleSide, transparent: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = -9; mesh.userData.noShadow = true;
  return mesh;
}

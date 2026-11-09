import * as THREE from 'three';
import { Rng } from './util.js';
import { HOOK, SLASH, CITY } from './layout.js';
import { GB, archStack, archBranch, archTable, archTwin, archSpire, archDome, archFar, coralTube } from './ring-geo.js';
import { coralMaterial, RU } from './ring-mat.js';

// The city. Towers are instanced from a library of archetypes in three levels of detail, by distance from the promenade.
const DEFAULT_CUT = [0, 1, 0, 1e6];

export const SLASH_N = new THREE.Vector3(...SLASH.n).normalize();
export const SLASH_D = SLASH_N.dot(new THREE.Vector3(...SLASH.p));
export const slashY = (x, z) => (SLASH_D - SLASH_N.x * x - SLASH_N.z * z) / SLASH_N.y;
const dirSlide = (() => {
  const d = new THREE.Vector3(...SLASH.slideDir).normalize();
  const n = SLASH_N;
  return d.clone().addScaledVector(n, -d.dot(n)).normalize();
})();

// radial profile of an archetype from its real vertices: per height, the mean radius (a bit inside, so the walls never shadow themselves)
function profileOf(geo) {
  const p = geo.attributes.position, bins = new Map();
  for (let i = 0; i < p.count; i++) {
    const y = Math.floor(p.getY(i) / 3);
    const r = Math.hypot(p.getX(i), p.getZ(i));
    if (!bins.has(y)) bins.set(y, [0, 0]);
    const b = bins.get(y); b[0] += r; b[1]++;
  }
  const out = [];
  for (const [y, b] of bins) out.push([(b[0] / b[1]) * 0.8, (y + 1) * 3]);
  return out;
}

class Occ {
  constructor(sz) { this.sz = sz; this.m = new Map(); }
  key(x, z) { return Math.floor(x / this.sz) + ':' + Math.floor(z / this.sz); }
  ok(x, z, r, margin) {
    const R = Math.ceil((r + 90) / this.sz);
    const ci = Math.floor(x / this.sz), cj = Math.floor(z / this.sz);
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
      const L = this.m.get((ci + i) + ':' + (cj + j));
      if (!L) continue;
      for (const o of L) if (Math.hypot(o.x - x, o.z - z) < r + o.r + margin) return false;
    }
    return true;
  }
  add(x, z, r) { const k = this.key(x, z); if (!this.m.has(k)) this.m.set(k, []); this.m.get(k).push({ x, z, r }); }
}

export function buildCity(ctx) {
  const { CUES, scene } = ctx;
  const root = new THREE.Group();
  scene.add(root);
  const rng = new Rng(9090);
  const lib = new Map();     // cls|type|seed|detail -> geo
  const makers = { stack: archStack, branch: archBranch, table: archTable, twin: archTwin, spire: archSpire, dome: archDome };
  const getArch = (cls, type, seed, det) => {
    const k = `${cls}|${type}|${seed}|${det}`;
    if (!lib.has(k)) {
      const a = type === 'far' ? archFar(seed) : makers[type](seed, det, cls);
      a.geo = a.g.build(); a.g = null;
      a.prof = profileOf(a.geo);
      lib.set(k, a);
    }
    return lib.get(k);
  };
  const types = {
    low: [['stack', 11], ['stack', 12], ['stack', 13], ['stack', 14], ['dome', 15]],
    mid: [['stack', 21], ['stack', 22], ['stack', 23], ['stack', 24], ['table', 61], ['table', 62], ['twin', 63], ['twin', 64], ['branch', 26], ['branch', 27], ['branch', 37], ['spire', 28], ['dome', 29], ['stack', 39]],
    tall: [['stack', 31], ['stack', 32], ['stack', 33], ['table', 65], ['table', 66], ['twin', 67], ['twin', 68], ['branch', 35], ['branch', 36], ['spire', 41], ['stack', 43], ['branch', 45], ['stack', 46]],
    far: [['far', 51], ['far', 52], ['far', 53]],
  };
  const pickType = (cls) => rng.pick(types[cls]);

  const towers = [];          // for the height field
  const occ = new Occ(130);
  const hookLine = new THREE.Vector2(HOOK.rakeTo[0] - HOOK.rakeFrom[0], HOOK.rakeTo[2] - HOOK.rakeFrom[2]);
  const hookLen = hookLine.length();
  const hookD = hookLine.clone().normalize();
  const hookN = new THREE.Vector2(-hookD.y, hookD.x);
  const hookU = (x, z) => ((x - HOOK.rakeFrom[0]) * hookD.x + (z - HOOK.rakeFrom[2]) * hookD.y) / hookLen;
  const hookDist = (x, z) => {
    const u = Math.max(0, Math.min(1, hookU(x, z)));
    return Math.hypot(x - (HOOK.rakeFrom[0] + hookLine.x * u), z - (HOOK.rakeFrom[2] + hookLine.y * u));
  };

  const groups = new Map();  // key -> { arch, cut, items: [] }
  const addInstance = (o) => {
    const a = getArch(o.cls, o.type, o.seed, o.det);
    const key = a.geo.uuid + (o.cut ? '|c' : '');
    if (!groups.has(key)) groups.set(key, { a, cut: !!o.cut, items: [] });
    groups.get(key).items.push(o);
  };

  function place(o) {
    const { cls, x, z, Htarget, det } = o;
    const [type, seed] = o.tp ?? pickType(cls);
    const proto = getArch(cls, type, seed, Math.max(det, 1));
    let s = Htarget ? Htarget / proto.H : rng.range(0.82, 1.2);
    s = Math.min(o.sMax ?? 1.45, Math.max(o.sMin ?? 0.6, s));
    const r = proto.R * s;
    if (!occ.ok(x, z, r, o.margin ?? 6)) return null;
    if (o.zMax != null && z + r > o.zMax) return null;
    occ.add(x, z, r);
    const inst = {
      cls, type, seed, det, x, z, s, ry: rng.range(0, Math.PI * 2), seedI: rng.next(), tintA: Math.pow(rng.next(), 1.2), tintB: rng.next(),
      r, H: proto.H * s, prof: proto.prof, cut: null,
    };
    Object.assign(inst, o.extra ?? {});
    return inst;
  }

  // ---- rows and zones
  // Row A: the low terraces that line the promenade
  for (let x = -760; x <= 760; x += 21) {
    const z = rng.range(-56, -34);
    const inst = place({ cls: 'low', x: x + rng.range(-8, 8), z, det: Math.abs(x) < 180 ? 0 : 1, zMax: CITY.z0 - 1.5, margin: 2.5, sMin: 0.7, sMax: 1.15 });
    if (inst) towers.push(inst);
  }
  // Band: towers in the slash's band. Taller than the plane so the cut shows everywhere.
  for (let x = -1100; x <= 700; x += 41) for (let z = -86; z >= -430; z -= 42) {
    const xj = x + rng.range(-15, 15), zj = z + rng.range(-14, 14);
    const py = slashY(xj, zj);
    const cuttable = xj < 240 && py > 8;
    // the s04 upshot: nothing tall on the left of its frame, nothing with pads hanging over its lens
    const az4 = Math.atan2(xj - 60, 14 - zj) * 180 / Math.PI, d4 = Math.hypot(xj - 60, zj - 14);
    const s04L = az4 > -75 && az4 < -33 && d4 < 700;
    let H = cuttable ? Math.max(py + rng.range(44, 135), 78) : rng.range(70, 165);
    if (s04L) H = Math.max(py + rng.range(24, 36), 60);
    let tp;
    if (d4 < 520) do tp = pickType('mid'); while (tp[0] === 'branch' || tp[0] === 'dome');
    const det = (Math.abs(xj) < 480 && zj > -300) ? 0 : 1;
    const inst = place({ cls: 'mid', x: xj, z: zj, Htarget: H, det, tp, sMin: s04L ? 0.4 : 0.62, margin: 5 });
    if (inst) { if (cuttable) inst.cutMode = 1; towers.push(inst); }
  }
  // Mid-city up to the hook, the tall district on and behind the hook's line
  for (let x = -2300; x <= 2300; x += 66) for (let z = -470; z >= -1350; z -= 68) {
    const xj = x + rng.range(-24, 24), zj = z + rng.range(-24, 24);
    const dh = hookDist(xj, zj);
    // the district south of the line stays low, so the trench can be seen into from the side (s03); north of it a wall of tall towers
    const southH = ((xj - HOOK.rakeFrom[0]) * hookN.x + (zj - HOOK.rakeFrom[2]) * hookN.y) > 0;
    const big = southH && dh < 230 ? rng.range(40, 85) : southH && dh < 430 ? rng.range(70, 140) : dh < 340 ? rng.range(110, 210) : 190 + rng.range(0, 150);
    const nearS = southH && dh < 430;
    const inst = place({ cls: nearS ? 'mid' : 'tall', x: xj, z: zj, Htarget: big, det: dh < 260 ? 1 : (Math.hypot(xj, zj) < 1300 ? 1 : 2), sMin: nearS ? 0.34 : 0.62, sMax: 1.35, margin: 4 });
    if (!inst) continue;
    if (dh < 74 && hookU(xj, zj) > -0.05 && hookU(xj, zj) < 1.05) inst.cutMode = 2;
    towers.push(inst);
  }
  // West and east flanks of the near city
  for (let x = -3700; x <= 3700; x += 92) {
    for (let z = -86; z >= -1450; z -= 88) {
      if (x > -1050 && x < 700 && z > -440) continue;
      if (Math.abs(x) < 2300 && z < -470) continue;
      const inst = place({ cls: rng.next() < 0.55 ? 'mid' : 'tall', x: x + rng.range(-30, 30), z: z + rng.range(-30, 30), Htarget: rng.range(90, 280), det: Math.hypot(x, z) < 1500 ? 1 : 2, sMin: 0.6, margin: 3 });
      if (inst) towers.push(inst);
    }
  }
  // Far north, to z = -3500
  for (let x = -4200; x <= 4200; x += 118) for (let z = -1420; z >= -3500; z -= 116) {
    const inst = place({ cls: rng.next() < 0.35 ? 'mid' : 'tall', x: x + rng.range(-40, 40), z: z + rng.range(-40, 40), Htarget: rng.range(120, 400), det: 2, sMin: 0.55, sMax: 1.5, margin: 2 });
    if (inst) towers.push(inst);
  }
  // Up the curve of the ring, both ways
  for (const sgn of [-1, 1]) for (let x = 4200; x <= 7500; x += 150) for (let z = -160; z >= -3400; z -= 150) {
    const inst = place({ cls: 'far', x: sgn * (x + rng.range(-40, 40)), z: z + rng.range(-40, 40), det: 2, sMin: 0.8, sMax: 1.5, margin: 2 });
    if (inst) towers.push(inst);
  }

  // Sky bridges between the near towers
  const bridges = [];
  const near = towers.filter((t) => t.det <= 1 && t.H > 70 && (t.type === 'stack' || t.type === 'branch'));
  for (let i = 0; i < near.length; i++) {
    const a = near[i];
    for (let j = i + 1; j < near.length; j++) {
      const b = near[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      const gap = d - (a.r + b.r) * 0.6;
      if (gap < 18 || gap > 120 || rng.next() > 0.32) continue;
      const y = rng.range(0.32, 0.72) * Math.min(a.H, b.H);
      bridges.push({ a, b, d, y, seed: rng.next() });
    }
  }

  // ---- bridge geometry at 3 lengths
  const makeBridge = (L) => {
    const r2 = new Rng(77 + L);
    const g = new GB();
    const R = 2.4;
    coralTube(g, {
      spine: (s) => [-L / 2 + L * s, 2.8 * Math.sin(s * Math.PI), 0],
      radius: () => R, segs: 10, n: Math.max(10, Math.round(L / 6)), rng: r2, detail: 1, collars: Math.max(2, Math.round(L / 14)), kind: 1, amp: 0.05, hash: 0.7,
    });
    return g.build();
  };
  const bridgeGeo = { 60: makeBridge(60), 100: makeBridge(100), 150: makeBridge(150) };

  // ---- resolve instances
  const ht0 = CUES.rakeStart, ht1 = CUES.rakeEnd;
  // when the beam (see fx-city.js) passes a point u along the line; what lies before its first position was hit before the film began
  const S0 = 0.14;
  const beamTime = (u) => {
    if (u <= S0) return ht0 - 1.3 * (S0 - u) / S0 - 0.1;
    const q = Math.min(1, (u - S0) / (1 - S0));
    return ht0 + (ht1 - ht0) * (1 - Math.pow(1 - q, 1 / 1.35));
  };
  const Dummy = new THREE.Object3D();
  for (const t of towers) {
    t.iA = [t.seedI, t.tintA, t.tintB, t.s];
    t.iCut = DEFAULT_CUT; t.iHit = [0, 0, 0, 0]; t.iMove = [0, 0, 0, 0];
    t.keepH = t.H + 500;       // height left standing after each state, for the height field
    t.stumpHook = null; t.stumpSlash = null;
    if (t.cutMode === 1) {
      const delay = rng.range(0, 0.1) + Math.max(0, (t.x + 300) / 1700) * 0.12;
      t.iCut = [SLASH_N.x, SLASH_N.y, SLASH_N.z, SLASH_D];
      t.iHit = [CUES.slash, CUES.slash + 0.16 + delay, 1, CUES.slash + delay + 12];
      t.iMove = [dirSlide.x, dirSlide.y, dirSlide.z, 58 * rng.range(0.92, 1.08)];
      t.stumpSlash = slashY(t.x, t.z);
    } else if (t.cutMode === 2) {
      const tC = beamTime(hookU(t.x, t.z)) + rng.range(-0.02, 0.04);
      // ragged low plane with a tilt, the stumps left standing in the trench
      // what stood in the middle of the furrow is gone entirely; only the rim keeps ragged stumps
      const h = hookDist(t.x, t.z) < 50 ? -8 : rng.range(5, 26);
      const nx = rng.range(-0.18, 0.18), nz = rng.range(-0.18, 0.18);
      const nl = Math.hypot(nx, 1, nz);
      const n = [nx / nl, 1 / nl, nz / nl];
      t.iCut = [n[0], n[1], n[2], n[0] * t.x + n[1] * h + n[2] * t.z];
      const side = ((t.x - HOOK.rakeFrom[0]) * hookN.x + (t.z - HOOK.rakeFrom[2]) * hookN.y) > 0 ? 1 : -1;
      t.iHit = [tC, tC, 2, tC + 7.5];   // gone only once it has fallen through the deck: no pop on screen
      t.iMove = [hookN.x * side * rng.range(0.4, 1), rng.range(0.05, 0.3), hookN.y * side * rng.range(0.4, 1), rng.range(0.1, 0.55)];
      t.stumpHook = Math.max(h, 0);
    }
    addInstance({ ...t, cut: !!t.cutMode });
  }

  const mPlain = coralMaterial({});
  const mLower = coralMaterial({ cut: true });
  const mUpper = coralMaterial({ cut: true, upper: true });
  const meshes = [], uppers = [];
  const buildMesh = (geo, items, cut) => {
    const g = new THREE.InstancedBufferGeometry();
    // a copy of the table: the same archetype is used by a cut and an uncut group, each with its own instance data
    g.index = geo.index; g.attributes = { ...geo.attributes };
    const n = items.length;
    const iA = new Float32Array(n * 4), iCut = new Float32Array(n * 4), iHit = new Float32Array(n * 4), iMove = new Float32Array(n * 4);
    items.forEach((t, i) => { iA.set(t.iA, i * 4); iCut.set(t.iCut, i * 4); iHit.set(t.iHit, i * 4); iMove.set(t.iMove, i * 4); });
    g.setAttribute('iA', new THREE.InstancedBufferAttribute(iA, 4));
    g.setAttribute('iCut', new THREE.InstancedBufferAttribute(iCut, 4));
    g.setAttribute('iHit', new THREE.InstancedBufferAttribute(iHit, 4));
    g.setAttribute('iMove', new THREE.InstancedBufferAttribute(iMove, 4));
    g.instanceCount = n;
    const add = (mat, keepUp) => {
      const m = new THREE.InstancedMesh(g, mat, n);
      m.frustumCulled = false;
      items.forEach((t, i) => {
        Dummy.position.set(t.mx ?? t.x, t.my ?? 0, t.mz ?? t.z);
        Dummy.rotation.set(0, t.ry, 0);
        Dummy.scale.setScalar(t.s);
        Dummy.updateMatrix();
        m.setMatrixAt(i, Dummy.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
      m.userData.noShadow = true;
      root.add(m);
      (keepUp ? uppers : meshes).push(m);
    };
    add(cut ? mLower : mPlain, false);
    if (cut) add(mUpper, true);
  };
  for (const [, grp] of groups) buildMesh(grp.a.geo, grp.items, grp.cut);

  // bridges: instance per bridge; those above the slash plane ride with the tower tops
  const brGroups = { 60: [], 100: [], 150: [] };
  for (const br of bridges) {
    const L = br.d < 80 ? 60 : br.d < 125 ? 100 : 150;
    const mx = (br.a.x + br.b.x) / 2, mz = (br.a.z + br.b.z) / 2;
    const ang = -Math.atan2(br.b.z - br.a.z, br.b.x - br.a.x);
    const s = (br.d) / L;
    const inst = { mx, my: br.y, mz, x: mx, z: mz, ry: ang, s, seedI: br.seed, H: 6, iA: [br.seed, 0.2, 0.5, s], iCut: DEFAULT_CUT, iHit: [0, 0, 0, 0], iMove: [0, 0, 0, 0] };
    const py = slashY(mx, mz);
    if (br.a.cutMode === 1 || br.b.cutMode === 1) {
      inst.iCut = [SLASH_N.x, SLASH_N.y, SLASH_N.z, SLASH_D];
      if (br.y > py) inst.iHit = [CUES.slash, CUES.slash + 0.2, 1, CUES.slash + 12], inst.iMove = [dirSlide.x, dirSlide.y, dirSlide.z, 58];
      else inst.iHit = [CUES.slash, CUES.slide, 1, 1e4], inst.iMove = [0, 0, 0, 0];
    }
    if (br.a.cutMode === 2 || br.b.cutMode === 2) {
      const tC = beamTime(hookU(mx, mz));
      inst.iCut = [0, 1, 0, 1];   // the whole bridge is above this plane: it goes
      inst.iHit = [tC, tC, 2, tC + 2.4];
      inst.iMove = [hookN.x * 0.5, 0.2, hookN.y * 0.5, 0.4];
    }
    brGroups[L].push(inst);
  }
  for (const L of [60, 100, 150]) if (brGroups[L].length) buildMesh(bridgeGeo[L], brGroups[L], true);

  // ---- height field for the painted cast shadows
  const W = 2048, Hh = 1331;
  const rect = RU.uHFR.value;
  const data = new Float32Array(W * Hh * 4);
  const toPix = (x, z) => [((x - rect.x) / rect.z) * W, ((z - rect.y) / rect.w) * Hh];
  for (const t of towers) {
    const [px, pz] = toPix(t.x, t.z);
    const rp = Math.ceil((t.r * 1.1 / rect.z) * W);
    if (px + rp < 0 || px - rp >= W || pz + rp < 0 || pz - rp >= Hh) continue;
    const prof = t.prof.map(([r, h]) => [r * t.s, h * t.s]).sort((a, b) => a[0] - b[0]);
    const h0 = t.stumpHook, h1 = t.stumpSlash;
    for (let j = Math.max(0, Math.floor(pz - rp)); j < Math.min(Hh, pz + rp + 1); j++) {
      for (let i = Math.max(0, Math.floor(px - rp)); i < Math.min(W, px + rp + 1); i++) {
        const r = Math.hypot(((i + 0.5) - px) / W * rect.z, ((j + 0.5) - pz) / Hh * rect.w);
        // the tallest profile entry that still covers this radius
        let H = 0;
        for (const [pr, ph] of prof) if (pr >= r && ph > H) H = ph;
        if (H <= 0) continue;
        const o = (j * W + i) * 4;
        data[o] = Math.max(data[o], H);
        const a = h0 != null ? Math.min(H, h0) : H;
        data[o + 1] = Math.max(data[o + 1], a);
        const b = h1 != null ? Math.min(a, h1) : a;
        data[o + 2] = Math.max(data[o + 2], b);
      }
    }
  }
  const hfTex = new THREE.DataTexture(data, W, Hh, THREE.RGBAFormat, THREE.FloatType);
  hfTex.minFilter = hfTex.magFilter = THREE.LinearFilter;   // a stair-stepped shadow edge was showing on the parks from the air
  hfTex.wrapS = hfTex.wrapT = THREE.ClampToEdgeWrapping;
  hfTex.needsUpdate = true;
  RU.uHF.value = hfTex;

  const stats = { towers: towers.length, bridges: bridges.length, tris: 0 };
  for (const [, grp] of groups) stats.tris += grp.items.length * grp.a.geo.index.count / 3;
  const firstCut = Math.min(CUES.rakeStart - 2, CUES.slash);
  return {
    root, towers, hookU, hookDist, hookN, hookLen, hookLine, stats,
    update(st) {
      RU.uHFSel.value.set(st.t < CUES.rakeEnd ? 1 : 0, st.t >= CUES.rakeEnd && st.t < CUES.slash ? 1 : 0, st.t >= CUES.slash ? 1 : 0);
      for (const m of uppers) m.visible = st.t >= firstCut;
    },
  };
}

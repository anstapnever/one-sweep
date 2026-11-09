import { fxGrade } from './fx-timing.js';
import * as THREE from 'three';
import { hash, ID, GEO, PuffBatch, puffMaterial, ChunkBatch, chunkMaterial, LineBatch, boltMaterial, GlowBatch, glowMaterial, QuadBatch, mistMaterial, planeRingMaterial, screenFlashMaterial } from './fx-core.js';
import { BeamBatch, beamMaterial, RibbonBatch, ribbonMaterial, screenFxMaterial, CardLayer, LeafBatch, leafMaterial } from './fx-draw.js';
import { registerCards } from './fx-cards.js';
import { makeCity } from './fx-city.js';
import { makeFight } from './fx-fight.js';
import { makeFinale } from './fx-finale.js';
import { setFxContext } from './cams/fx.js';
import { onThrees, onTwos, clamp } from './util.js';

// FX department of ONE SWEEP: everything is a pure function of st.t, drawn on threes.
const V = THREE.Vector3;

export async function createFx(ctx) {
  const { scene, overlay, engine, camera, CUES } = ctx;
  const S = engine.S;

  const blueMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, uniforms: { uK: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vP; varying float vD; void main(){ vP = position.xy; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      layout(location = 0) out vec4 oColor; layout(location = 1) out vec4 oData;
      varying vec2 vP; varying float vD; uniform float uK;
      void main(){ float r = length(vP); if(r > 1.0) discard;
        vec3 c = mix(vec3(0.12, 0.42, 0.98), vec3(0.42, 0.74, 1.0), smoothstep(0.1, 1.0, r));
        oColor = vec4(c, 0.0); oData = vec4(0.5, 0.5, vD, 100.0); }`,
    side: THREE.DoubleSide,
  });
  const puffs = new PuffBatch(puffMaterial(S), 9000);
  const rocks = new ChunkBatch(GEO.rock(3, 1), chunkMaterial({ id: ID.STONE }), 500);
  const blocks = new ChunkBatch(GEO.block(5), chunkMaterial({ id: ID.TILE }), 500);
  const pebbles = new ChunkBatch(GEO.rock(7, 0), chunkMaterial({ id: ID.FINE }), 400);
  const gems = new ChunkBatch(GEO.rock(11, 0), chunkMaterial({ id: ID.GEM, rim: 1, sat: 1 }), 200);
  const leaves = new LeafBatch(leafMaterial(ID.LEAF), 500);
  const flakes = new LeafBatch(leafMaterial(ID.FLAT), 500);
  const beams = new BeamBatch(beamMaterial(), 96);
  scene.add(puffs.mesh, rocks.mesh, blocks.mesh, pebbles.mesh, gems.mesh, leaves.mesh, flakes.mesh, beams.mesh);

  const mist = new QuadBatch(mistMaterial(), 400, { iPos: 3, iS: 4, iC: 4, iTop: 3, iBot: 3 });
  const lines = new LineBatch(boltMaterial(S), 24000);
  lines.mesh.material.uniforms.uRimC.value.setRGB(0.18, 0.42, 0.06);   // never blue: the rim of a bolt is deep lime
  const glows = new GlowBatch(glowMaterial(S), 256);
  const ribbons = new RibbonBatch(ribbonMaterial(), 16000);
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), planeRingMaterial());
  ring.frustumCulled = false; ring.name = 'fx-ground-ring';
  ring.material.uniforms.uR.value.set(0, 0, 0, 0);
  const screenM = screenFxMaterial();
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), screenM);
  screen.frustumCulled = false; screen.name = 'fx-screen';
  screenM.uniforms.uRes.value.set(engine.IW, engine.IH);
  const cards = new CardLayer(overlay, engine, 20, 2);
  registerCards(cards);
  mist.mesh.renderOrder = 1; ring.renderOrder = 2; glows.mesh.renderOrder = 4; lines.mesh.renderOrder = 5; ribbons.mesh.renderOrder = 6; screen.renderOrder = 10;
  overlay.add(mist.mesh, ring, glows.mesh, lines.mesh, ribbons.mesh, screen);
  // uRes in overlay materials with uSceneData is filled by the engine; for the rest set it here
  for (const m of [glows.mesh, lines.mesh]) m.material.uniforms.uRes?.value.set(engine.IW, engine.IH);

  // ------------------------------------------------------------------ frame state and helpers
  const I = { t: 0, tq: 0, tw: 0, draw: 0, L: new V(), cam: new V(), R: new V(), U: new V(), F: new V(), st: null };
  const impacts = [];
  const anchors = new Map();
  const _p = new V(), _lv = new V(-0.45, 0.78, 0.44);

  const groundY = (x, z) => { try { const g = ctx.ring?.groundY?.(x, z); return Number.isFinite(g) ? g : 0; } catch { return 0; } };
  function anchor(obj, name, fb) {
    try {
      if (obj && typeof obj.anchor === 'function') {
        const v = new V();
        const r = obj.anchor(name, v);
        if (r && r.isVector3) return r.clone();
        if (Array.isArray(r)) return new V(r[0], r[1], r[2]);
        if (v.lengthSq() > 0) return v;
      }
    } catch { /* fall back */ }
    return new V(fb[0], fb[1], fb[2]);
  }
  function inkZ(x, y, z) {
    const m = camera.matrixWorldInverse.elements;
    return Math.max(-(m[2] * x + m[6] * y + m[10] * z + m[14]), 0.5);
  }
  // shade from the whole mass first: billows on the far side of the light are drawn in shade
  function massTone(x, y, z, cx, cy, cz, R, base = 0) {
    const d = ((x - cx) * I.L.x + (y - cy) * I.L.y + (z - cz) * I.L.z) / R;
    return base - 0.55 * Math.tanh(d * 1.3);
  }
  function veil(x, y, z, sx, sy, seed, op, top, bot, soft = 20, tone = 0, hard = 0.3, rot = 0) {
    if (op <= 0.004) return;
    mist.push([x, y, z], [sx, sy, seed % 37, op], [soft, rot, tone, hard], top, bot);
  }
  function flight(out, p0, v0, a, floorY, g = 9.8, rest = 0.28, fric = 0.45) {
    const res = { land: Infinity, settled: false, ts: a };
    const dy = p0.y - floorY;
    const t1 = dy >= 0 ? (v0.y + Math.sqrt(Math.max(v0.y * v0.y + 2 * g * dy, 0))) / g : 0;
    res.land = t1;
    if (a <= t1) { out.set(p0.x + v0.x * a, p0.y + v0.y * a - 0.5 * g * a * a, p0.z + v0.z * a); return res; }
    const P1x = p0.x + v0.x * t1, P1z = p0.z + v0.z * t1;
    const vyL = v0.y - g * t1;
    const bvx = v0.x * fric, bvz = v0.z * fric, bvy = -vyL * rest;
    const t2 = (2 * bvy) / g;
    const b = a - t1;
    if (b <= t2) { out.set(P1x + bvx * b, floorY + bvy * b - 0.5 * g * b * b, P1z + bvz * b); res.ts = a; return res; }
    const P2x = P1x + bvx * t2, P2z = P1z + bvz * t2;
    const c = b - t2, tau = 0.35;
    const k = tau * (1 - Math.exp(-c / tau)) * 0.6;
    out.set(P2x + bvx * k, floorY, P2z + bvz * k);
    res.settled = c > 0.8;
    res.ts = t1 + t2 + Math.min(c, 0.5) * 0.5;
    return res;
  }
  // to NDC with depth; null when behind the camera
  function project(p) {
    _p.copy(p).applyMatrix4(camera.matrixWorldInverse);
    if (_p.z > -0.5) return null;
    const depth = -_p.z;
    _p.applyMatrix4(camera.projectionMatrix);
    return { x: _p.x, y: _p.y, d: depth };
  }
  function pxScale(depth) { return camera.projectionMatrix.elements[5] / depth; }   // metres -> NDC-y
  const lim = { flashA: 0 };
  function flash(r, g, b, a) {
    // on a negative frame a white flash would print as a solid black frame and lose the drawing
    if (fxGrade(I.t).invert) return; if (a <= lim.flashA) return; lim.flashA = a; screenM.uniforms.uFlash.value.set(r, g, b, a); }
  function focus(cx, cy, inner, a, n = 90, r = 1, g = 1, b = 1) {
    const u = screenM.uniforms;
    u.uLine.value.set(r, g, b, a); u.uCen.value.set(cx * 0.5 + 0.5, cy * 0.5 + 0.5); u.uInner.value = inner; u.uN.value = n;
  }
  function groundRing(x, z, R, power, y = 1.2, color = '#ffffff', shade = '#e8d4cc') {
    const u = ring.material.uniforms;
    u.uR.value.set(x, z, R, power);
    u.uY.value = y; u.uDrawing.value = I.draw;
    u.uCamPos.value.copy(camera.position); u.uCam.value.copy(camera.matrixWorld);
    const th = Math.tan((camera.fov * Math.PI) / 360);
    u.uTan.value.set(th * camera.aspect, th);
    u.uColor.value.set(color); u.uShade.value.set(shade);
  }

  const F = { ctx, C: CUES, V, I, camera, scene, overlay, puffs, rocks, blocks, pebbles, gems, leaves, flakes, beams, mist, lines, glows, ribbons, cards,
    anchors, impacts, blueMat, groundY, anchor, inkZ, massTone, veil, flight, project, pxScale, flash, focus, groundRing, hash,
    screenM, ring,
    sfx: (t, x, y, z, size, kind) => impacts.push({ t: +t.toFixed(3), x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), size, kind }) };

  const parts = [makeCity(F), makeFight(F), makeFinale(F)];
  const steps = parts.flatMap((p) => p.steps);
  impacts.sort((a, b) => a.t - b.t);
  setFxContext({ ctx, F });

  function update(st) {
    I.st = st;
    I.t = st.t; I.tq = onThrees(st.t); I.tw = onTwos(st.t);
    I.draw = Math.floor(I.tq * 8 + 0.5);
    I.cam.copy(camera.position);
    camera.updateMatrixWorld();
    I.R.set(1, 0, 0).applyQuaternion(camera.quaternion);
    I.U.set(0, 1, 0).applyQuaternion(camera.quaternion);
    I.F.set(0, 0, -1).applyQuaternion(camera.quaternion);
    // drawn light: mostly the sun, cheated toward the upper left of the frame
    I.L.copy(_lv).transformDirection(camera.matrixWorld).multiplyScalar(0.55).addScaledVector(ctx.G.uKeyDir.value, 0.45).normalize();
    try {
      const au = engine.mAtmos?.uniforms, pu = puffs.mesh.material.uniforms;
      if (au && pu.uFogD) { pu.uFogD.value = au.uFogDensity.value; pu.uFogC.value.copy(au.uFogCool.value).lerp(au.uFogWarm.value, 0.5); }
    } catch { /* no atmosphere: no compensation */ }

    puffs.begin(I.cam); rocks.begin(); blocks.begin(); pebbles.begin(); gems.begin(); leaves.begin(); flakes.begin(); beams.begin();
    mist.begin(); lines.begin(); glows.begin(); ribbons.begin(); cards.begin();
    puffs.mesh.material.uniforms.uDrawing.value = I.draw;
    mist.mesh.material.uniforms.uDrawing.value = I.draw;
    beams.mesh.material.uniforms.uDraw.value = I.draw;
    ring.material.uniforms.uR.value.w = 0;
    screenM.uniforms.uFlash.value.w = 0; screenM.uniforms.uLine.value.w = 0; screenM.uniforms.uDraw.value = I.draw;
    lim.flashA = 0;

    for (const f of steps) {
      if (st.sid && f.shots && !f.shots.includes(st.sid)) continue;
      puffs.guard = null; puffs.buds = 0; puffs.inkZ = 0; puffs.camNear = f.camNear ?? 0;
      try { f(st); } catch (e) { console.error(`[fx] ${f.name}: ${e.stack || e}`); }
    }

    puffs.end(); rocks.end(); blocks.end(); pebbles.end(); gems.end(); leaves.end(); flakes.end(); beams.end();
    mist.end(); lines.end(); glows.end(); ribbons.end();
  }

  return {
    update,
    impacts,
    anchor(name, v = new V()) { const a = anchors.get(name); if (a) v.copy(a); return v; },
    F,
  };
}

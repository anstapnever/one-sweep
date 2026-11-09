import * as THREE from 'three';
import { Engine } from './engine.js';
import { G } from './glsl.js';
import { makeFoliageAtlas } from './tex-foliage.js';
import { applyLook } from './look.js';
import { FPS, FRAMES, CUES, SHOTS, evalFrame, registerCams } from './shots.js';
import { onTwos, deg } from './util.js';

// URL params:
//   scale=2            internal supersampling (1 for quick previews)
//   frame=N | t=sec    show this frame on load
//   test=1&cam=x,y,z&at=x,y,z&fov=35&t=30   free camera at film time t
//   k=1&elev=34&az=215 override the light (with test=1)
//   world=0 ring=0 capy=0 warlord=0 fx=0  skip a department
const P = new URLSearchParams(location.search);
const S = parseFloat(P.get('scale') ?? '2');
const W = 1920, H = 1080;

const canvas = document.getElementById('c');
const engine = new Engine(canvas, W, H, S);
const scene = new THREE.Scene();
const overlay = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 9000);

const atlas = makeFoliageAtlas();
// colliders: [{ name, dept, object3d }] meshes the QA tool tests for interpenetration (see CONTRACT.md)
const ctx = { THREE, scene, overlay, engine, camera, atlas, G, CUES, SHOTS, FPS, W, H, shadowRoots: [], colliders: [] };
if (P.get('flat') === '1') G.uFlat.value = 1;

// cameras + looks per shot live in src/cams/*.js (lead owns them)
for (const c of ['ring', 'heavens', 'capy', 'warlord', 'fx']) {
  try { registerCams(await import(`./cams/${c}.js`)); } catch (e) { console.error(`[cams/${c}] failed to load: ${e.stack || e}`); }
}
const NOOP = { update() {} };
async function dept(name, file, fn) {
  if (P.get(name) === '0') return NOOP;
  try {
    const mod = await import(file);
    return (await mod[fn](ctx)) || NOOP;
  } catch (e) {
    console.error(`[${name}] failed to load: ${e.stack || e}`);
    return NOOP;
  }
}
ctx.world = await dept('world', './world.js', 'buildWorld');
ctx.ring = await dept('ring', './ring.js', 'buildRing');
ctx.town = ctx.ring;   // tools/qa.mjs reads ctx.town.groundY
ctx.warlord = await dept('warlord', './warlord.js', 'createWarlord');
ctx.capy = await dept('capy', './capy.js', 'createCapy');
ctx.fx = await dept('fx', './fx.js', 'createFx');
const ORDER = ['world', 'ring', 'warlord', 'capy', 'fx'];

const num3 = (s) => s.split(',').map(Number);

function stateFor(frame) {
  const st = evalFrame(frame);
  if (P.get('test') === '1') {
    if (P.get('cam')) st.cam = { pos: num3(P.get('cam')), look: num3(P.get('at') ?? '0,1.5,0'), fov: parseFloat(P.get('fov') ?? '35') };
    const L = { ...st.look };
    if (P.get('k')) L.k = parseFloat(P.get('k'));
    if (P.get('elev')) L.sunElev = parseFloat(P.get('elev'));
    if (P.get('az')) L.sunAz = parseFloat(P.get('az'));
    st.look = L;
    if (P.get('fade') === '0') st.fade = 0;
  }
  return st;
}

const _sc = new THREE.Vector3();
function renderState(st) {
  G.uTime.value = st.t;
  G.uDrawTime.value = onTwos(st.t);
  applyLook(ctx, st.look);
  if (st.key) G.uKeyDir.value.set(...st.key).normalize(); else G.uKeyDir.value.copy(G.uSunDir.value);
  const c = st.cam;
  camera.position.set(...c.pos);
  camera.up.set(0, 1, 0);
  camera.lookAt(_sc.set(...c.look));
  if (c.roll) camera.rotateZ(deg(c.roll));
  camera.updateMatrixWorld();
  camera.fov = c.fov;
  camera.near = c.near ?? 0.3;
  camera.far = c.far ?? 9000;
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  scene.updateMatrixWorld(true);
  for (const d of ORDER) {
    try { ctx[d].update(st); } catch (e) { console.error(`[${d}] update failed: ${e.stack || e}`); }
  }
  scene.updateMatrixWorld(true);
  overlay.updateMatrixWorld(true);
  engine.render(scene, overlay, camera, {
    shadow: st.shadow && { center: _sc.set(...st.shadow.center).clone(), radius: st.shadow.radius, depth: st.shadow.depth },
    shadowRoots: ctx.shadowRoots.length ? ctx.shadowRoots : undefined,
    frame: st.frame, fade: st.fade, fadeColor: st.fadeColor,
    inkSeed: Math.floor(st.t * 12) % 5, paintRadius: st.look.paintRadius ?? 4, inkWidth: st.look.inkWidth,
  });
  ctx.lastState = st;
}

window.FILM = {
  FPS, FRAMES, CUES, SHOTS, ctx,
  renderFrame(n) { renderState(stateFor(n)); return true; },
  // QA hook: pose the world for frame n without rendering (for intersection checks)
  poseFrame(n) {
    const st = stateFor(n);
    G.uTime.value = st.t; G.uDrawTime.value = onTwos(st.t);
    const c = st.cam;
    camera.position.set(...c.pos); camera.up.set(0, 1, 0); camera.lookAt(_sc.set(...c.look));
    if (c.roll) camera.rotateZ(deg(c.roll));
    camera.fov = c.fov; camera.near = c.near ?? 0.3; camera.far = c.far ?? 9000; camera.aspect = W / H;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    scene.updateMatrixWorld(true);
    for (const d of ORDER) { try { ctx[d].update(st); } catch (e) { console.error(`[${d}] update failed: ${e.stack || e}`); } }
    scene.updateMatrixWorld(true);
    ctx.lastState = st;
    return st;
  },
  capture(q = 0.93) { return canvas.toDataURL('image/jpeg', q); },
  stateFor,
};
renderState(stateFor(0));
window.FILM_READY = true;

const startFrame = parseInt(P.get('frame') ?? (P.get('t') ? Math.round(parseFloat(P.get('t')) * FPS) : 0), 10);
if (P.get('headless') !== '1') {
  window.FILM.renderFrame(startFrame);
  document.dispatchEvent(new CustomEvent('film-ready', { detail: { frame: startFrame } }));
}

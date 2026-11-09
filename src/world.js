import * as THREE from 'three';
import { ENV } from './passes-env.js';
import { onThrees } from './util.js';
import { heavensSkyMaterial } from './heavens-sky.js';
import { buildClouds, makeCloudPuffs } from './heavens-clouds.js';
import { skyTimeline, SKY_AXIS, ZENITH, CUT_N, CUT_CENTER } from './heavens-time.js';
import { buildShip } from './heavens-ship.js';
import { SHIP } from './layout.js';
import { buildOrbit } from './heavens-orbit.js';

// HEAVENS department: sky, ring-arc, hive ship, orbit.
export async function buildWorld(ctx) {
  const C = ctx.CUES;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(8500, 48, 24), heavensSkyMaterial());
  sky.renderOrder = -10; sky.frustumCulled = false; sky.userData.noShadow = true;
  ctx.scene.add(sky);
  const au = ctx.engine.mAtmos.uniforms, su = sky.material.uniforms;
  au.uHazeCool = su.uHorizonCool; au.uHazeWarm = su.uHorizonWarm;

  const axis = new THREE.Vector3(...SKY_AXIS), zen = new THREE.Vector3(...ZENITH);
  su.uAxis.value.copy(axis);
  const clouds = buildClouds(makeCloudPuffs(SKY_AXIS), su, SKY_AXIS);
  ctx.scene.add(clouds);
  const cu = clouds.material.uniforms;
  cu.uCutN.value.set(...CUT_N); cu.uCutC.value.set(...CUT_CENTER);

  const ship = buildShip(ctx, SHIP, su);
  const orbitSet = buildOrbit(ctx, su);
  let lastSet = '';
  function spiral(t) { return skyTimeline(t, C).spiral; }

  const world = {
    sky, clouds,
    spiral,
    update(st) {
      ENV.uEnvTime.value = onThrees(st.t);
      sky.position.copy(ctx.camera.position);
      const orbit = st.set === 'orbit';
      clouds.visible = !orbit && st.set !== 'abstract';
      su.uSpace.value = orbit ? 1 : 0;
      // the first and last shots rhyme on an open sky: no ring arc slicing it behind him
      su.uRingOn.value = orbit || st.sid === 's01' || st.sid === 's02' || st.sid === 's31' ? 0 : 1;
      cu.uAir.value = st.sid === 's26' ? 1 : 0;
      const tl = skyTimeline(st.t, C);
      cu.uCutW.value = tl.cutW; cu.uCutHead.value = tl.cutHead;
      cu.uSpiral.value = tl.spiral; cu.uSpiralRot.value = tl.spiralRot; cu.uCore.value = tl.core;
      su.uSpiral.value = tl.spiral; su.uCore.value = tl.core;
      { const sk = Math.max(0, Math.min(1, (st.t - (ctx.CUES.skyClear - 1.5)) / 2)); su.uShafts.value = sk * sk * (3 - 2 * sk); }
      cu.uPartF.value = tl.partF; cu.uPartH.value = tl.partH;
      cu.uPartAxis.value.copy(axis).lerp(zen, tl.partAxisK).normalize();
      cu.uDrift.value = st.t * 0.04;
      cu.uBank.value = st.t > C.bladeHit - 0.05 ? 1 : 0;
      su.uPartF.value = tl.partF; su.uPartAxis.value.copy(cu.uPartAxis.value);
      ship.update(st);
      orbitSet.update(st);
      lastSet = st.set;
    },
    shipTop(t) { return ship.shipTop(t); },
    anchor(name, v) { if (name === 'shipBeam') return ship.anchorBeam(v); return v.set(0, 2000, -3900); },
    ship, orbit: orbitSet,
  };
  ctx.world = world;
  return world;
}

import * as THREE from 'three';
import { CRATER, PILLAR, CAPY, WARLORD, POD, RAIL, groundYProm } from './layout.js';
import { buildCity } from './ring-towers.js';
import { buildProm } from './ring-prom.js';
import { buildCrater } from './ring-crater.js';

// The RING department: the city, the promenade, what the warlord breaks.
export async function buildRing(ctx) {
  const city = buildCity(ctx);
  const prom = buildProm(ctx);
  const crater = buildCrater(ctx);
  let afterCrater = false;
  const ring = {
    update(st) {
      afterCrater = st.t >= ctx.CUES.bladeHit;
      const vis = st.set !== 'orbit' && st.set !== 'abstract';
      city.root.visible = vis;
      city.update(st);
      prom.update(st);
      crater.update(st);
    },
    groundY(x, z) { return groundYProm(x, z, afterCrater); },
    anchor(name, v) {
      if (name === 'home') return v.set(...CAPY.home);
      if (name === 'landing') return v.set(...WARLORD.land);
      if (name === 'pod') return v.set(...POD.pos);
      if (name === 'crater') return v.set(CRATER.c[0], 0, CRATER.c[1]);
      if (name === 'rail') return v.set(0, RAIL.h, RAIL.z);
      return v.set(0, 0, 0);
    },
    city, prom, crater,
  };
  ctx.ring = ring;
  console.log(`[ring] towers ${city.stats.towers}, bridges ${city.stats.bridges}, tris ${Math.round(city.stats.tris / 1000)}k`);
  return ring;
}

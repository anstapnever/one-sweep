// ONE SWEEP — the one shared map. Metres, Y up. North = -Z (the city), south = +Z (the rail, then open sky).
// Lead owns this file. Every department places things from these numbers.

export const GROUND_Y = 0;

// The promenade: a white-coral esplanade running east-west along the south edge of the ring.
export const PROM = { x0: -140, x1: 140, z0: -26, z1: 24, y: 0 };
export const RAIL = { z: 23.2, h: 1.15 };                 // balustrade on the south edge; beyond it open air, cloud deck far below
export const CITY = { z0: -26 };                          // the towers start north of the promenade (z < -26) and run to z = -3500
export const CLOUD_DECK_Y = -900;                         // cloud sea under the ring, seen over the rail

// The capybara's whole story happens on a 5 × 5 m patch around the origin.
export const CAPY = {
  home: [0, 0, 0],
  height: 1.15,                                           // top of head (ears excluded)
  face: 2.25,                                             // heading in radians (0 = +Z); he stands facing south-east toward the sun
  broomLen: 1.55,
};

// Crater after CUES.bladeHit: the promenade around him is gone, the pillar is exactly his patch.
export const CRATER = { c: [0, 0], r: 34, depth: 9 };
export const PILLAR = { hw: 2.5 };                        // top at y = 0, square |x|, |z| <= hw, rough walls down to the crater floor

export function groundYProm(x, z, afterCrater) {
  if (afterCrater) {
    const d = Math.hypot(x - CRATER.c[0], z - CRATER.c[1]);
    if (Math.abs(x) <= PILLAR.hw && Math.abs(z) <= PILLAR.hw) return 0;
    if (d < CRATER.r) return -CRATER.depth * Math.sqrt(Math.max(0, 1 - (d / CRATER.r) ** 2));
  }
  return 0;
}

// The warlord. 9 m tall at landing, grows to 14 m at CUES.shed (root scale 1 -> 1.55).
export const WARLORD = {
  land: [4.2, 0, -7.2],                                   // pelvis xz at landing; it faces the capybara
  height: 9,
  heightShed: 14,
  footL: [2.2, 0, -5.0],                                  // the left foot, toe at about (2.0, 0, -3.6): the broom taps it in s08
  footR: [6.4, 0, -8.0],
  hover: [0, 5.5, -9],                                    // after the crater it never touches the ground: hovers on its mantle
  skyPoint: [0, 620, -320],                               // where it stops in the sky and burns
};

// The first strike and the district that dies in the hook. The beam comes down at the end of the visible line.
export const HOOK = {
  rakeFrom: [-620, 0, -900],                              // the beam already stands on screen at frame 0
  rakeTo: [520, 0, -700],
};
// Skyline that gets cut in s09/s10: a straight line through the towers in the band z -60..-420.
export const SLASH = { p: [0, 34, -60], n: [0.12, 0.99, 0.08], slideDir: [-0.92, -0.2, 0.3] };

// The sky-tram pod that plants itself next to him in s02 (Ring builds it). Nose-first, tilted, stands until the crater.
export const POD = { pos: [-1.5, 0, 1.15], len: 3.4, fromHeight: 60 };

// The hive ship, 7 km long, hangs over the north of the city.
export const SHIP = { c: [300, 2200, -3900], len: 7000, wid: 2600 };

// Orbit set: built far above everything; only visible when st.set === 'orbit'.
export const ORBIT = {
  origin: [0, 100000, 0],
  planetR: 6000,                                          // in orbit-set metres; cameras there use near 50, far 200000
  ringR: 8200,
  ringWidth: 180,
  markerAz: -0.5,                                         // where on the ring the film happens
};

export const SUN = { elev: 54, az: 150 };                 // late morning from the south-east: faces seen from the south are lit

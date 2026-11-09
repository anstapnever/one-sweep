// HEAVENS cameras: s04 (hive ship), s21 (orbit star), s30 (the planet opens).
import { SHIP } from '../layout.js';
import { noise1, smooth, lerp } from '../util.js';
import { orbitCam } from '../heavens-time.js';

export const CAMS = {
  // low wide: the hive ship fills the sky, slow tilt
  s04: (lt, d, t) => {
    const k = smooth(lt / d);
    const yaw = noise1(t * 0.7, 3) * 0.3, pit = noise1(t * 0.6, 8) * 0.2;
    return { pos: [60, 3, 14], look: [120 + yaw * 70, 1880 + 420 * k + pit * 70, -3900], fov: 71 - 2 * k, near: 2, far: 9000 };
  },
  // orbit: the planet, the ring, a star ignites on the ring
  s21: (lt, d) => orbitCam('s21', smooth(lt / d)),
  // the climax: slow push on the opening line
  s30: (lt, d) => orbitCam('s30', smooth(lt / d)),
};

export const LOOKS = {
  // the sun is cheated to the north so the ship's shadow lands on the towers and creeps toward the camera
  s04: (lt, d) => { const k = smooth(lt / d); return { shadow: { center: [60, 60, -520], radius: 1500, depth: 6000 }, key: [0.1, 0.72, -0.3 - 0.32 * k] }; },
};

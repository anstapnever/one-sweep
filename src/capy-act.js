import { clamp, lerp, smooth, smoother, easeIn, easeOut, easeInOut, invLerp, noise1, track } from './util.js';

// The performance. Pure function of film time. A heavy, low animal on short legs: small strides, the weight moves over the support foot before anything lifts,
// the barrel swings slowly side to side, the head stays forward and low.
// Body frame: origin at the pelvis on the ground, heading yaw; +x his left, +z forward. World: yaw = THREE rotation about Y (0 faces +Z).

const PI = Math.PI;
export const HOME_YAW = 0.72;          // south-east, toward the sun and the camera side
const STANCE = 0.165;                  // half distance between the balls of the feet

export const rotY = (yaw, x, z) => [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lerpA = (a, b, t) => a + wrap(b - a) * t;

// ------------------------------------------------------------------ foot plan
class FootPlan {
  constructor() {
    this.foot = { L: [], R: [] };
    this.keys = [];         // pelvis { t, x, z }
    this.yawKeys = [];      // { t, y }
    this.steps = [];
  }
  init(L, R, t = -50) {
    this.foot.L.push({ t0: t, t1: Infinity, ...L });
    this.foot.R.push({ t0: t, t1: Infinity, ...R });
    this.pushKey(t, (L.x + R.x) / 2, (L.z + R.z) / 2);
    this.yawKeys.push({ t, y: (L.yaw + R.yaw) / 2 });
  }
  pushKey(t, x, z) { this.keys.push({ t, x, z }); }
  last(name) { const a = this.foot[name]; return a[a.length - 1]; }
  // swing `name` from t0 to t1 onto (x, z, yaw). The weight shift to the stance foot happens before t0.
  step(name, t0, t1, x, z, yaw) {
    const other = name === 'L' ? 'R' : 'L';
    const a = this.last(name), b = this.last(other);
    a.t1 = t0;
    this.foot[name].push({ t0: t1, t1: Infinity, x, z, yaw });
    // pelvis: at start of the shift the weight is near the middle, over the stance foot during the swing, then on its way to the new one
    this.steps.push({ name, t0, t1 });
    const d = t1 - t0;
    const sx = lerp(b.x, (a.x + b.x) / 2, 0.22), sz = lerp(b.z, (a.z + b.z) / 2, 0.22);
    this.pushKey(t0 - d * 0.3, (a.x + b.x) / 2, (a.z + b.z) / 2);
    this.pushKey(t0 + d * 0.28, sx, sz);
    this.pushKey(t1 - d * 0.1, lerp(b.x, x, 0.42), lerp(b.z, z, 0.42));
    return this;
  }
  yawTo(t, y) { this.yawKeys.push({ t, y }); }
  end() {
    this.keys.sort((a, b) => a.t - b.t);
    this.yawKeys.sort((a, b) => a.t - b.t);
  }
  pelvis(t) {
    const K = this.keys, n = K.length;
    if (t <= K[0].t) return [K[0].x, K[0].z];
    if (t >= K[n - 1].t) return [K[n - 1].x, K[n - 1].z];
    let i = lowerBound(K, t) - 1; i = Math.max(0, i);
    const a = K[Math.max(0, i - 1)], b = K[i], c = K[Math.min(n - 1, i + 1)], d = K[Math.min(n - 1, i + 2)];
    const u = (t - b.t) / Math.max(1e-6, c.t - b.t);
    const cr = (p0, p1, p2, p3) => {
      const m1 = (p2 - p0) * (c.t - b.t) / Math.max(1e-6, c.t - a.t), m2 = (p3 - p1) * (c.t - b.t) / Math.max(1e-6, d.t - b.t);
      const u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * m2;
    };
    return [cr(a.x, b.x, c.x, d.x), cr(a.z, b.z, c.z, d.z)];
  }
  yaw(t) {
    const K = this.yawKeys, n = K.length;
    if (t <= K[0].t) return K[0].y;
    if (t >= K[n - 1].t) return K[n - 1].y;
    const i = Math.max(0, lowerBound(K, t) - 1);
    const a = K[i], b = K[i + 1];
    return lerpA(a.y, b.y, smooth((t - a.t) / Math.max(1e-6, b.t - a.t)));
  }
  // ball of the foot in world; pitch > 0 lifts the heel; planted while the ball is fixed
  foot1(name, t, out) {
    const a = this.foot[name];
    let i = a.length - 1;
    while (i > 0 && a[i].t0 > t) i--;
    const p = a[i];
    if (t <= p.t1) {
      // on the ground: heel peels off the tile just before the lift, the ball stays put
      const lead = 0.13;
      const pe = p.t1 === Infinity ? 0 : smooth(invLerp(p.t1 - lead, p.t1, t));
      out.x = p.x; out.y = 0; out.z = p.z; out.yaw = p.yaw; out.pitch = 0.52 * pe; out.planted = true;
      return out;
    }
    const n = a[i + 1];
    const u = invLerp(p.t1, n.t0, t);
    const e = smooth(u);
    const dist = Math.hypot(n.x - p.x, n.z - p.z);
    const hi = 0.045 + Math.min(0.05, dist * 0.2);
    out.x = lerp(p.x, n.x, e); out.z = lerp(p.z, n.z, e);
    out.y = hi * Math.sin(Math.pow(u, 0.8) * PI);
    out.yaw = lerpA(p.yaw, n.yaw, e);
    out.pitch = u < 0.5 ? lerp(0.52, -0.05, smooth(u / 0.5)) : lerp(-0.05, -0.16, smooth((u - 0.5) / 0.42)) * (1 - smooth(invLerp(0.9, 1, u)));
    out.planted = false;
    return out;
  }
}
function lowerBound(K, t) { let lo = 0, hi = K.length; while (lo < hi) { const m = (lo + hi) >> 1; if (K[m].t < t) lo = m + 1; else hi = m; } return lo; }

// ------------------------------------------------------------------ sweeping
// one stroke, local time in seconds. Returns { u: 0 his right .. 1 his left, lift: metres off the tile, pp: pressure 0..1 }
function strokeShape(lt, P) {
  const ph = clamp(lt / P);
  // anticipation back (a touch beyond start), contact stroke, settle, a low lifted return
  if (ph < 0.12) { const k = smooth(ph / 0.12); return { u: lerp(0.03, -0.07, k), lift: lerp(0.04, 0, smooth(ph / 0.08)), pp: k }; }
  if (ph < 0.68) { const k = easeInOut((ph - 0.12) / 0.56, 1.7); return { u: lerp(-0.07, 1, k), lift: 0, pp: 1 }; }
  if (ph < 0.76) { const k = smooth((ph - 0.68) / 0.08); return { u: lerp(1, 0.985, k), lift: 0.03 * k * k, pp: 1 - k }; }
  const k = smooth((ph - 0.76) / 0.24);
  return { u: lerp(0.985, 0.03, k), lift: lerp(0.03, 0.045, Math.sin(k * PI)) + 0.04 * Math.sin(k * PI), pp: 0 };
}
const stroke = (t, T0, P) => strokeShape((((t - T0) % P) + P) % P, P);

// tip and top-of-handle guide in the body frame. u: 0..1 along the arc
function broomArc(u, ly) {
  const phi = lerp(0.62, -0.42, u);      // + = to his right
  const R = 0.66;
  const tipX = -Math.sin(phi) * R, tipZ = 0.14 + Math.cos(phi) * R * 0.98;
  // the top hand travels on a tighter arc in front of the chest, out to his right when the tip is on his right so the handle clears the head
  const gX = lerp(-0.36, -0.2, u) + Math.sin(u * PI) * 0.015;
  const gY = 0.76 + 0.02 * Math.sin(u * PI);
  const gZ = lerp(0.28, 0.18, u);
  return { tip: [tipX, ly, tipZ], top: [gX, gY, gZ] };
}

// ------------------------------------------------------------------ base pose for a clip
const NEU = () => ({
  spine: [0.06, 0, 0], neck: [-0.22, 0, 0], head: [0.28, 0, 0],
  shift: [0, 0], drop: 0.015, hipYaw: 0, hipRoll: 0, hipPitch: 0.13,
  broom: { tip: [-0.1, 0, 0.72], top: [-0.27, 0.76, 0.22] },
  grip: [0.74, 1.12, 1, 1],
  freeL: 0, lidU: 6, lidL: -40, look: [0, -0.1], brow: 0, jaw: 0, flare: 0, puff: 0, sootShake: 0,
  ears: [0, 0],
});

function blendO(a, b, u) {
  const L = (x, y) => x + (y - x) * u;
  const La = (x, y) => x.map((v, i) => L(v, y[i]));
  return {
    spine: La(a.spine, b.spine), neck: La(a.neck, b.neck), head: La(a.head, b.head),
    shift: La(a.shift, b.shift), drop: L(a.drop, b.drop), hipYaw: L(a.hipYaw, b.hipYaw), hipRoll: L(a.hipRoll, b.hipRoll), hipPitch: L(a.hipPitch, b.hipPitch),
    broom: { tip: La(a.broom.tip, b.broom.tip), top: La(a.broom.top, b.broom.top) },
    grip: La(a.grip, b.grip),
    freeL: L(a.freeL ?? 0, b.freeL ?? 0), lidU: L(a.lidU, b.lidU), lidL: L(a.lidL, b.lidL), look: La(a.look, b.look), brow: L(a.brow, b.brow), jaw: L(a.jaw, b.jaw), flare: L(a.flare, b.flare), puff: L(a.puff, b.puff),
    sootShake: L(a.sootShake, b.sootShake),
    ears: La(a.ears, b.ears),
  };
}

const kf = track;

// ------------------------------------------------------------------ clips
function clipSweep(T0, P, extra = {}) {
  return (t) => {
    const O = NEU();
    const s = stroke(t, T0, P), sH = stroke(t + 0.09, T0, P), sC = stroke(t + 0.045, T0, P);
    const uh = sH.u, uc = sC.u;
    const arc = broomArc(s.u, s.lift);
    O.broom = arc;
    O.pp = s.pp;
    // the barrel leads: hips first, shoulders after, the broom last
    O.hipYaw = (uh - 0.5) * 0.3;
    O.hipRoll = (uh - 0.5) * 0.05;
    O.shift = [(uh - 0.5) * 0.062, 0.018 * Math.sin(uh * PI) + 0.012];
    O.drop = 0.02 + 0.012 * Math.sin(uh * PI);
    O.spine = [0.08 + 0.02 * Math.sin(uc * PI), (uc - 0.5) * 0.3, (uc - 0.5) * 0.02];
    O.neck = [-0.2, -(uc - 0.5) * 0.2, 0];
    O.head = [0.3, -(uc - 0.5) * 0.1, -(uc - 0.5) * 0.05];
    O.look = [(s.u - 0.5) * 0.35, -0.2];
    Object.assign(O, extra.over ? extra.over(t, O) : {});
    return O;
  };
}

// standing holding the broom upright in front of him, weight even
function clipStand(o = {}) {
  return (t) => {
    const O = NEU();
    O.broom = { tip: [-0.2, 0, 0.74], top: [-0.3, 0.8, 0.22] };
    O.grip = [0.72, 1.14, 0.85, 0.9];
    O.look = [0.1, -0.15];
    O.hipPitch = 0.1;
    O.spine = [0.03, 0.05, 0];
    return o.mod ? o.mod(t, O) || O : O;
  };
}

// taps a world point (given in the body frame) twice with the bristles
function clipToeTap(tap1, tap2, toeL) {
  return (t) => {
    const O = NEU();
    const raise = kf([[tap1 - 0.55, 0], [tap1 - 0.22, 1], [tap1 - 0.02, 0.05], [tap1 + 0.1, 0.0], [tap2 - 0.22, 1], [tap2 - 0.02, 0.05], [tap2 + 0.1, 0.0], [tap2 + 0.45, 0.0]], t);
    const reach = kf([[tap1 - 0.6, 0], [tap1 - 0.05, 1], [tap2 + 0.05, 1], [tap2 + 0.6, 0.72]], t);
    const dirx = toeL[0], dirz = toeL[1];
    const L = Math.hypot(dirx, dirz) || 1;
    const stop = 0.082;     // bristle ends stop just short of the chitin
    const tx = dirx * (1 - stop / L), tz = dirz * (1 - stop / L);
    const base = [-0.05, 0, 0.72];
    const tip = [lerp(base[0], tx, reach), 0.04 * raise + 0.02 * raise * raise, lerp(base[2], tz, reach)];
    O.broom = { tip, top: [lerp(-0.26, -0.3, reach), lerp(0.76, 0.8, reach * raise), lerp(0.22, 0.38, reach)] };
    O.grip = [0.72, 1.16, 1, 1];
    O.spine = [0.1 + 0.03 * raise, 0.1, 0];
    O.hipPitch = 0.13 + 0.03 * reach;
    O.shift = [-0.01, 0.03 * reach];
    O.look = [0.08, -0.18];
    O.head = [0.32, 0.03, 0];
    return O;
  };
}

function clipWetShake(tS) {
  return (t) => {
    const O = NEU();
    O.broom = { tip: [-0.18, 0, 0.72], top: [-0.3, 0.8, 0.2] };
    O.grip = [0.72, 1.14, 0.8, 0.9];
    // anticipation: he sinks and winds, then the whole barrel shimmies from the shoulders outward, decaying
    const lt = t - tS;
    const env = lt < 0 ? 0 : (lt < 0.72 ? smooth(lt / 0.08) * (1 - smooth(invLerp(0.42, 0.72, lt)) * 0.7) : 0.3 * (1 - smooth(invLerp(0.72, 1.05, lt))));
    const f = 7.5;
    const w = Math.sin(lt * f * 2 * PI);
    O.drop = 0.02 + 0.025 * smooth(invLerp(-0.3, 0, lt)) * (1 - smooth(invLerp(0.55, 0.95, lt))) + 0.01 * Math.abs(w) * env;
    O.hipYaw = 0.16 * w * env;
    O.hipRoll = 0.1 * w * env;
    O.spine = [0.12, -0.3 * Math.sin(lt * f * 2 * PI - 0.5) * env, -0.18 * Math.sin(lt * f * 2 * PI - 0.7) * env];
    O.neck = [-0.2, 0.28 * Math.sin(lt * f * 2 * PI - 1.1) * env, 0.12 * Math.sin(lt * f * 2 * PI - 1.3) * env];
    O.head = [0.25, 0.18 * Math.sin(lt * f * 2 * PI - 1.7) * env, 0.28 * Math.sin(lt * f * 2 * PI - 2.0) * env];
    O.shift = [0.03 * Math.sin(lt * f * 2 * PI) * env, 0];
    O.ears = [0, 0.8 * Math.sin(lt * f * 2 * PI - 2.2) * env];
    O.lidU = -34 * smooth(invLerp(-0.25, 0, lt)) * (1 - smooth(invLerp(0.65, 0.95, lt))) + 6 * (1 - smooth(invLerp(-0.25, 0, lt)));
    O.lidL = -40 + 12 * smooth(invLerp(-0.25, 0, lt)) * (1 - smooth(invLerp(0.65, 0.95, lt)));
    O.sootShake = env;
    return O;
  };
}

function clipYawn(tY) {
  return (t) => {
    const O = NEU();
    O.broom = { tip: [-0.18, 0, 0.72], top: [-0.3, 0.8, 0.22] };
    O.grip = [0.72, 1.14, 0.82, 0.9];
    const lt = t - tY;
    // slow inhale, the head tips back, jaw opens huge, a tremble at the top, closes slowly with a little smack
    const open = kf([[-0.1, 0], [0.75, 1], [1.15, 1.0], [1.62, 0.06], [1.8, 0]], lt);
    const tilt = kf([[-0.15, 0], [0.8, 1], [1.15, 0.95], [1.7, 0]], lt);
    const tr = Math.sin(lt * 34) * 0.012 * smooth(invLerp(0.55, 0.85, lt)) * (1 - smooth(invLerp(1.1, 1.35, lt)));
    O.jaw = open;
    O.freeL = kf([[-0.42, 0], [0.02, 1], [1.28, 1], [1.8, 0]], lt);     // the far arm crosses under the chin: it comes off the handle so the jaw has room
    O.head = [0.24 - 0.33 * tilt + tr, 0.02, 0.02 * tilt];
    O.neck = [-0.22 - 0.1 * tilt, 0, 0];
    O.spine = [0.05 - 0.09 * tilt, 0.05, 0];
    O.hipPitch = 0.12 - 0.05 * tilt;
    O.drop = 0.015 + 0.012 * tilt;
    O.lidU = lerp(6, -36, smooth(invLerp(0.05, 0.42, lt)) * (1 - smooth(invLerp(1.35, 1.65, lt))));
    O.lidL = lerp(-40, -14, smooth(invLerp(0.05, 0.42, lt)) * (1 - smooth(invLerp(1.35, 1.65, lt))));
    O.brow = 0;
    O.flare = 0.5 * tilt;
    O.look = [0, -0.1];
    return O;
  };
}

// the lazy flick: he does not look. The broom, held in the leading hand, comes up to his right and snaps backhand across
function clipFlick(tF) {
  return (t) => {
    const O = NEU();
    const lt = t - tF;
    // arc u: -0.4 rest down-right, 0.2 up-right (cocked, anticipation), back to 1 flicked across; settles
    const u = kf([[-0.7, 0.4], [-0.15, 0], [0.0, 0.05], [0.13, 1.1], [0.4, 0.95], [0.75, 0.5]], lt);
    const ly = kf([[-0.7, 0], [-0.15, 0.4], [0.0, 0.42], [0.13, 0.18], [0.4, 0.05], [0.75, 0]], lt);
    const a = broomArc(u, ly);
    O.broom = { tip: a.tip, top: [lerp(-0.34, -0.24, u), 0.8, lerp(0.34, 0.18, u)] };
    O.grip = [0.76, 1.14, 1, 1];
    O.hipYaw = (u - 0.5) * 0.14;
    O.spine = [0.06, (u - 0.5) * 0.14, 0];
    O.drop = 0.018;
    O.head = [0.3, 0, 0];
    O.neck = [-0.2, 0, 0];
    O.look = [0, -0.25];
    // half-lidded the whole time
    return O;
  };
}

function clipLookUp(t0, tB) {
  return (t) => {
    const O = NEU();
    O.broom = { tip: [-0.15, 0, 0.7], top: [-0.3, 0.8, 0.22] };
    O.grip = [0.72, 1.14, 0.85, 0.9];
    const lt = t - t0;
    const up = kf([[-0.1, 0], [0.04, 0.0], [0.6, 1.0, (x) => easeOut(x, 2.6)], [2.5, 1.0]], lt);
    O.head = [0.28 + 0.3 * up, 0, 0];     // the chin stays down and the eyes do the lifting: the snout must not hide them
    O.neck = [-0.22 - 0.06 * up, 0, 0];
    O.spine = [0.06 - 0.06 * up, 0, 0];
    O.hipPitch = 0.12 - 0.04 * up;
    // the eyes open first (a tiny beat before the head)
    const open = kf([[-0.05, 0], [0.14, 1], [2, 1]], lt);
    O.look = [0, lerp(-0.12, 0.62, smooth(invLerp(0.0, 0.4, lt)))];
    O.lidU = lerp(6, 38, open);
    O.lidL = lerp(-40, -44, open);
    const b = kf([[-0.6, 0], [-0.05, 0], [0.25, 1, (x) => easeOut(x, 3)], [2, 1]], t - tB);
    O.brow = b;
    O.head[0] += 0.06 * b;
    if (b > 0.01) { O.lidU = lerp(O.lidU, 19, b); O.lidL = lerp(O.lidL, -25, b); }
    return O;
  };
}

function clipGrip(tG) {
  return (t) => {
    const O = NEU();
    O.broom = { tip: [-0.24, 0.03, 0.62], top: [-0.36, 0.84, 0.24] };
    const lt = t - tG;
    const close = kf([[-0.5, 0], [0, 0], [0.16, 1, (x) => easeOut(x, 3)], [1.2, 1]], lt);
    O.grip = [0.62, 1.04, lerp(0.7, 1, close), lerp(0.7, 1, close)];
    O.broom.tip[1] = 0.05 + 0.16 * close;
    O.spine = [0.1, 0.02, 0];
    O.neck = [-0.32, 0, 0];
    O.head = [-0.08, 0, 0];
    O.lidU = 18; O.lidL = -24; O.brow = 1; O.look = [0, 0.05];
    O.flare = 0.6;
    O.drop = 0.03;
    return O;
  };
}

function clipWindup(tW, tS) {
  return (t) => {
    const O = NEU();
    const k = kf([[tW - 0.15, 0], [tW + 0.25, 0.28], [tS - 0.22, 1, (x) => easeInOut(x, 2)]], t);
    O.broom = { tip: [lerp(-0.24, -0.86, k), lerp(0.2, 0.12, k), lerp(0.62, -0.08, k)], top: [lerp(-0.36, -0.55, k), lerp(0.84, 0.88, k), lerp(0.24, 0.1, k)] };
    O.grip = [lerp(0.62, 0.72, k), lerp(1.04, 1.16, k), 1, 1];
    O.spine = [lerp(0.1, 0.26, k), lerp(0, -0.72, k), lerp(0, -0.06, k)];
    O.hipYaw = lerp(0, -0.42, k);
    O.hipRoll = lerp(0, -0.03, k);
    O.hipPitch = lerp(0.12, 0.25, k);
    O.shift = [lerp(0, -0.05, k), lerp(0, -0.05, k)];
    O.drop = lerp(0.03, 0.09, k);
    O.neck = [lerp(-0.3, -0.38, k), lerp(0, 0.5, k), 0];
    O.head = [lerp(-0.08, 0, k), lerp(0, 0.3, k), 0];
    O.lidU = 18; O.lidL = -24; O.brow = 1; O.look = [lerp(0, 0.25, k), 0.05];
    O.flare = 0.6;
    return O;
  };
}

function clipSwing(tS) {
  return (t) => {
    const O = NEU();
    const u = kf([[tS - 0.2, 0], [tS - 0.03, 0.1, (x) => x * x], [tS + 0.07, 1.2, (x) => easeOut(x, 2)], [tS + 0.34, 1.32], [tS + 0.7, 1.3]], t);
    const bx = (a, b) => lerp(a, b, u);
    const phi = lerp(0.95, -1.0, u);
    const R = 0.92;
    O.broom = { tip: [-Math.sin(phi) * R, 0.1 + 0.03 * Math.sin(u * 2), Math.cos(phi) * R * 0.75], top: [bx(-0.55, -0.02), bx(0.88, 0.76), bx(0.1, 0.34)] };
    O.grip = [0.74, 1.18, 1, 1];
    O.spine = [bx(0.26, 0.2), bx(-0.72, 0.62), bx(-0.05, 0.05)];
    O.hipYaw = bx(-0.42, 0.42);
    O.hipRoll = bx(-0.03, 0.05);
    O.hipPitch = bx(0.25, 0.16);
    O.drop = bx(0.09, 0.06);
    O.shift = [bx(-0.05, 0.06), bx(-0.05, 0.06)];
    O.neck = [-0.34, bx(0.5, -0.5), 0];
    O.head = [0, bx(0.3, -0.34), 0];
    O.lidU = 19; O.lidL = -25; O.brow = 1; O.look = [bx(0.25, -0.25), 0.08];
    O.flare = 0.6;
    return O;
  };
}

function clipLookStump(tS, tEndLeaf, tLand, tBack, leafPathEye) {
  return (t) => {
    const O = NEU();
    const raise = kf([[tS - 0.5, 0], [tS, 1, (x) => easeInOut(x, 2)], [tEndLeaf + 0.9, 1], [tLand - 0.35, 0.15]], t);
    O.broom = { tip: [lerp(-0.2, -0.14, raise), lerp(0.02, 0.3, raise), lerp(0.74, 0.5, raise)], top: [lerp(-0.3, -0.24, raise), lerp(0.8, 0.92, raise), lerp(0.22, 0.3, raise)] };
    O.grip = [0.74, 1.12, 0.92, 0.95];
    O.spine = [lerp(0.03, 0.12, raise), 0.05, 0];
    O.head = [lerp(0.25, 0.62, raise), lerp(0, 0.1, raise), 0];
    O.neck = [-0.22, 0, 0];
    O.look = [0.1, lerp(-0.1, -0.4, raise)];
    // eyes follow the falling leaf (only the eyes)
    if (t > tEndLeaf - 0.1) { const lf = leafPathEye(t); O.look = lf; O.head = [lerp(O.head[0], 0.35, smooth(invLerp(tEndLeaf, tEndLeaf + 0.5, t))), O.head[1], 0]; }
    return O;
  };
}

function clipSigh(tL, tB) {
  return (t) => {
    const O = NEU();
    O.broom = { tip: [-0.22, 0, 0.72], top: [-0.34, 0.8, 0.24] };
    O.grip = [0.72, 1.14, 0.85, 0.9];
    const k = kf([[tL - 0.1, 0], [tL + 0.05, 0.3], [tL + 0.25, 1.0], [tB + 0.05, 0.1]], t);
    O.spine = [0.08 + 0.1 * k, 0.04, 0];
    O.neck = [-0.22, 0, 0];
    O.head = [0.3 + 0.15 * k, 0, 0];
    O.drop = 0.015 + 0.03 * k;
    O.lidU = lerp(6, -10, smooth(k));
    O.lidL = lerp(-40, -32, smooth(k));
    O.flare = 0.9 * k;
    O.look = [0, -0.3];
    return O;
  };
}

// ------------------------------------------------------------------ the film
export function buildPerformance(CUES, toeWorld) {
  const C = CUES;
  const plan = new FootPlan();
  const yaw0 = HOME_YAW;
  const fp = (x, z, yaw, lx, lz) => { const [dx, dz] = rotY(yaw, lx, lz); return { x: x + dx, z: z + dz, yaw }; };
  const L0 = fp(0, 0, yaw0, STANCE, 0.06), R0 = fp(0, 0, yaw0, -STANCE, -0.03);
  plan.init({ ...L0, yaw: yaw0 + 0.16 }, { ...R0, yaw: yaw0 - 0.16 });

  // ---- out to the toe: a calm sweep-walk during s07 and s08, the last steps in s09
  const toe = [toeWorld[0], 0, toeWorld[1]];
  const ang = Math.atan2(toe[0], toe[2]);    // heading from home to the toe
  const dist = Math.hypot(toe[0], toe[2]);
  const STOP = 0.92;
  const Sx = toe[0] - Math.sin(ang) * STOP, Sz = toe[2] - Math.cos(ang) * STOP;
  const arriveT = C.toeTap1 - 0.5;
  const startT = C.standUp + 0.15;           // he goes back to work after the warlord has finished landing
  const nSteps = Math.round(Math.hypot(Sx, Sz) / 0.25);
  const D = (arriveT - startT) / nSteps;
  const planWalk = (x0, z0, y0, x1, z1, y1, t0, n, Dt, first, endWide) => {
    let foot = first;
    plan.yawTo(t0 - 0.05, y0);
    for (let k = 0; k < n; k++) {
      const s = (k + 1) / n;
      const yaw = k >= 3 ? y1 : lerpA(y0, y1, (k + 1) / 3);
      const cx = lerp(x0, x1, s), cz = lerp(z0, z1, s);
      const side = foot === 'L' ? 1 : -1;
      const isLast = k === n - 1;
      const spot = fp(cx, cz, yaw, side * (isLast ? STANCE : STANCE * 0.84), isLast ? (foot === 'L' ? 0.06 : -0.03) : 0);
      const tk = t0 + Dt * k;
      plan.step(foot, tk + Dt * 0.32, tk + Dt * 0.92, spot.x, spot.z, yaw + side * 0.14);
      plan.yawTo(tk + Dt * 0.6, yaw);
      foot = foot === 'L' ? 'R' : 'L';
    }
  };
  planWalk(0, 0, yaw0, Sx, Sz, ang, startT, nSteps, D, 'R');

  // ---- back home through the smoke, turning to the home heading in the last steps
  const backStart = C.shedStart + 0.2;
  const nB = nSteps + 1;
  const Db = 0.42;
  planWalk(Sx, Sz, ang, 0, 0, yaw0, backStart, nB, Db, 'R');

  // ---- wind-up: the back (right) foot sets; returns to the home stance unseen
  {
    const k = (C.windup + C.sweep) / 2;
    const yawW = yaw0;
    const rb = fp(0, 0, yawW, -STANCE - 0.07, -0.16);
    plan.step('R', C.windup - 0.05, C.windup + 0.2, rb.x, rb.z, yawW - 0.42);
    void k;
    // lead foot plants wider on the swing's follow-through
    const lf = fp(0, 0, yawW, STANCE + 0.08, 0.14);
    plan.step('L', C.sweep - 0.28, C.sweep - 0.08, lf.x, lf.z, yawW + 0.3);
    // settle back unseen after the planet shot
    const r1 = fp(0, 0, yawW, -STANCE, -0.03), l1 = fp(0, 0, yawW, STANCE, 0.06);
    plan.step('R', C.planet + 0.4, C.planet + 0.85, r1.x, r1.z, yawW - 0.16);
    plan.step('L', C.planet + 1.2, C.planet + 1.65, l1.x, l1.z, yawW + 0.16);
  }
  plan.end();

  const footBase = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, planted: true };

  // ---- body-frame clip list
  const toeLocal = (t) => {
    const yaw = plan.yaw(t);
    const [px, pz] = plan.pelvis(t);
    const dx = toe[0] - px, dz = toe[2] - pz;
    return rotY(-yaw, dx, dz);
  };
  const T0 = -0.45, P0 = 1.5;
  // stroke start times are kept so the sound and the pile can line up with them
  const strokes = [];
  for (let s = T0; s < C.land - 0.9; s += P0) strokes.push(s);
  const end0 = C.land - 0.65;
  const list = [];
  const add = (t0, fade, fn, label) => list.push({ t0, fade, fn, label });
  add(-99, 0, clipSweep(T0, P0, {}), 'sweep0');
  add(end0, 0.2, (t) => {
    // the satisfied tap on the pile, then broom upright
    const O = NEU();
    const tk = C.land - 0.45;
    const lift = kf([[tk - 0.25, 0], [tk - 0.08, 0.12, (x) => easeOut(x, 2)], [tk + 0.05, 0.0, (x) => x * x], [tk + 0.3, 0]], t);
    const a = broomArc(1.02, lift);
    O.broom = a; O.grip = [0.74, 1.12, 1, 1];
    O.spine = [0.08, 0.1, 0]; O.head = [0.3, -0.02, 0]; O.neck = [-0.2, 0, 0]; O.look = [0.15, -0.22]; O.hipYaw = 0.1; O.shift = [0.03, 0.01];
    return O;
  }, 'tap');
  add(C.land - 0.08, 0.3, clipStand({}), 'unmoved');
  const walkStroke = (T, P) => clipSweep(T, P, { over: (t, O) => ({ hipYaw: O.hipYaw * 0.5, shift: [O.shift[0] * 0.3, O.shift[1]] }) });
  add(C.standUp + 0.1, 0.4, walkStroke(C.standUp + 0.1, D * 2), 'sweepWalk');
  add(arriveT - 0.3, 0.25, clipStand({}), 'arrive');
  const toeL = toeLocal(C.toeTap1);
  add(C.toeTap1 - 0.6, 0.28, clipToeTap(C.toeTap1, C.toeTap2, toeL), 'toe');
  add(C.toeTap2 + 0.5, 0.45, clipStand({ mod: (t, O) => {
    const bk = Math.max(0, invLerp(C.strand + 0.15, C.strand + 0.25, t) * (1 - invLerp(C.strand + 0.35, C.strand + 0.5, t)));
    O.lidU = lerp(6, -34, smooth(bk));
    O.head = [0.26, 0.04, 0];
    return O;
  } }), 'wait');
  add(backStart - 0.05, 0.4, walkStroke(backStart, Db * 2), 'sweepBack');
  add(C.bladeHit - 1.6, 0.4, clipSweep(T0 + P0 * Math.ceil((C.bladeHit - 1.6 - T0) / P0), P0), 'sweepPillar');
  add(C.sootShake - 0.32, 0.26, clipWetShake(C.sootShake), 'shake');
  add(C.sootShake + 1.05, 0.3, clipStand({}), 'after');
  add(C.yawn - 0.2, 0.25, clipYawn(C.yawn), 'yawn');
  add(C.yawn + 1.95, 0.3, clipStand({}), 'stand2');
  add(C.flick - 0.8, 0.25, clipFlick(C.flick), 'flick');
  add(C.flick + 0.8, 0.35, clipSweep(C.flick + 0.8, P0), 'sweep3');
  add(C.pileGone - 0.55, 0.3, clipStand({}), 'watchPile');
  add(C.lookUp - 0.4, 0.2, clipLookUp(C.lookUp, C.brows), 'lookup');
  add(C.grip - 0.35, 0.3, clipGrip(C.grip), 'grip');
  add(C.windup - 0.1, 0.18, clipWindup(C.windup, C.sweep), 'windup');
  add(C.sweep - 0.21, 0.02, clipSwing(C.sweep), 'swing');
  // the follow-through holds through the long oculus shots, then he relaxes while nobody watches
  add(C.planet + 0.4, 0.8, clipStand({}), 'relax');
  const leafEye = (t) => {
    const u = invLerp(C.leafEnd, C.leafLand, t);
    const sw = Math.sin(u * 4.2) * 0.2;
    return [sw * (1 - u), lerp(0.25, -0.34, smooth(u))];
  };
  add(C.stump - 0.5, 0.3, clipLookStump(C.stump, C.leafEnd, C.leafLand, C.backToWork, leafEye), 'lookStump');
  add(C.leafLand - 0.05, 0.18, clipSigh(C.leafLand, C.backToWork), 'sigh');
  // the last stroke is the first stroke of the film, same phase at the matching moment
  const rhymeT0 = C.backToWork - (0 - T0);
  add(rhymeT0 + 0.05, 0.12, clipSweep(rhymeT0, P0), 'rhyme');
  list.sort((a, b) => a.t0 - b.t0);

  const clipAt = (t) => {
    let i = list.length - 1;
    while (i > 0 && list[i].t0 > t) i--;
    let O = list[i].fn(t);
    const c = list[i];
    if (c.fade > 0 && t < c.t0 + c.fade && i > 0) {
      const prev = list[i - 1].fn(t);
      O = blendO(prev, O, smoother((t - c.t0) / c.fade));
    }
    return O;
  };
  const P = plan;
  // blinks: slow, heavy, keyed to quiet moments between the story beats, never while the eyes must hold still
  const blinks = [C.ship + 1.2, C.shadow - 1.1, C.standUp + 0.9, C.boast + 1.0, C.toeTap2 + 0.9, C.slash + 0.8, C.shed + 0.7, C.sootShake + 1.4, C.flick + 1.1, C.regen + 1.3, C.gather + 1.0, C.pileGone - 0.9, C.skyClear + 1.0];
  const blinkAt = (t) => { for (const b of blinks) { const d = t - b; if (d > -0.09 && d < 0.2) return d < 0 ? smooth((d + 0.09) / 0.09) : 1 - smooth(d / 0.2); } return 0; };
  const pose = (t) => {
    const O = clipAt(t);
    { const b = blinkAt(t); if (b > 0) { O.lidU = lerp(O.lidU, -36, b); O.lidL = lerp(O.lidL, -22, b); } }
    const yaw = P.yaw(t);
    const [px, pz] = P.pelvis(t);
    const fL = { ...footBase }, fR = { ...footBase };
    P.foot1('L', t, fL); P.foot1('R', t, fR);
    // pelvis height: settled knees, dips a touch as weight lands, rises through single support
    let y = 0.40 - O.drop;
    let inSwing = 0, swingSide = 0;
    if (!fL.planted || !fR.planted) inSwing = 1;
    for (const s of P.steps) {
      const d = s.t1 - s.t0;
      if (t > s.t0 - 0.2 && t < s.t1 + 0.2) {
        const u = invLerp(s.t0, s.t1, t);
        y += 0.014 * Math.sin(u * PI);
        // lands heavy: compresses for a few frames after the landing
        const after = t - s.t1;
        if (after > 0 && after < 0.26) y -= 0.018 * Math.sin((after / 0.26) * PI);
      }
      void d;
    }
    // which foot carries the weight
    const stL = fL.planted ? 1 : 0, stR = fR.planted ? 1 : 0;
    swingSide = stL - stR;
    const hipRollW = 0.055 * swingSide * inSwing;
    const breath = Math.sin(t * 1.7) * 0.5 + 0.5;      // slow belly breath
    // barrel sway from the walk, carried from which foot is planted: smooth side shift in the pelvis path already
    return {
      t, yaw, px, pz, y,
      hipYaw: O.hipYaw, hipRoll: O.hipRoll + hipRollW, hipPitch: O.hipPitch,
      shift: O.shift, spine: O.spine, neck: O.neck, head: O.head,
      broom: O.broom, grip: O.grip, pp: O.pp ?? 0,
      freeL: O.freeL ?? 0, lidU: O.lidU, lidL: O.lidL, look: O.look, brow: O.brow, jaw: O.jaw, flare: O.flare, puff: O.puff, ears: O.ears, sootShake: O.sootShake,
      fL, fR, breath, swingSide, inSwing,
    };
  };
  // strokes that raise a dust puff
  const dust = [T0 - P0, ...strokes.filter((x) => x < C.land - 1.0)].map((x) => [x, P0]);
  for (let k = 0, x = C.flick + 0.8; x < C.pileGone - 1.6; x += P0, k++) dust.push([x, P0]);
  dust.push([rhymeT0, P0]);
  return { pose, strokes, plan, toe, S: [Sx, Sz], ang, list, dust };
}
void easeIn; void noise1;

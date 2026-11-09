import { Rng } from './util.js';

// Hand-painted full-frame drawings (2D canvas): the nerve tree of s22 and the impact frames of THE SWEEP.
// Drawn at load, once, seeded. Cards are shown through CardLayer.

function clear(g, w, h, col) { g.fillStyle = col; g.fillRect(0, 0, w, h); }

function cubic(p0, c1, c2, p3, s) {
  const u = 1 - s;
  const b0 = u * u * u, b1 = 3 * u * u * s, b2 = 3 * u * s * s, b3 = s * s * s;
  return [b0 * p0[0] + b1 * c1[0] + b2 * c2[0] + b3 * p3[0], b0 * p0[1] + b1 * c1[1] + b2 * c2[1] + b3 * p3[1]];
}
// A tapered stroke along a cubic: width comes from w(s); a light hand wobble
function crescent(g, p0, c1, c2, p3, w, color, rng, wob = 0, n = 90) {
  const L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const a = cubic(p0, c1, c2, p3, s), b = cubic(p0, c1, c2, p3, Math.min(s + 0.01, 1));
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    const wv = wob ? (rng.next() - 0.5) * wob : 0;
    const hw = w(s);
    L.push([a[0] - dy * (hw + wv), a[1] + dx * (hw + wv)]);
    R.push([a[0] + dy * (hw - wv), a[1] - dx * (hw - wv)]);
  }
  g.beginPath();
  g.moveTo(L[0][0], L[0][1]);
  for (const p of L) g.lineTo(p[0], p[1]);
  for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
  g.closePath();
  g.fillStyle = color;
  g.fill();
}
function wedge(g, cx, cy, ang, r0, r1, a0, a1, col) {
  g.beginPath();
  g.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
  g.lineTo(cx + Math.cos(ang - a1) * r1, cy + Math.sin(ang - a1) * r1);
  g.lineTo(cx + Math.cos(ang + a0) * r1, cy + Math.sin(ang + a0) * r1);
  g.closePath();
  g.fillStyle = col;
  g.fill();
}
// taper polygon between two points
function taper(g, x0, y0, x1, y1, w0, w1, col) {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  g.beginPath();
  g.moveTo(x0 + nx * w0, y0 + ny * w0); g.lineTo(x1 + nx * w1, y1 + ny * w1);
  g.lineTo(x1 - nx * w1, y1 - ny * w1); g.lineTo(x0 - nx * w0, y0 - ny * w0);
  g.closePath(); g.fillStyle = col; g.fill();
}

// ---------------------------------------------------------------- the foreshortened arc: near end enormous at lower right, far end a needle
function arcPath(W, H, jx = 0, jy = 0) {
  return {
    p0: [W * 1.28 + jx, H * 1.14 + jy],
    c1: [W * 0.95 + jx, H * 0.42 + jy],
    c2: [W * 0.52 + jx, H * 0.1 + jy],
    p3: [W * 0.075 + jx, H * 0.27 + jy],
  };
}
function arcWidth(H, k = 1) { return (s) => (H * 0.40 * k * Math.pow(1 - s, 1.55) + H * 0.002); }

function foreBroom(g, W, H, ink, pale) {
  // the broom, foreshortened: the bristle fan huge and close at lower right (it leads the arc), the handle shooting away to the paws at the far end
  const vx = W * 0.135, vy = H * 0.3;
  const hx = W * 0.8, hy = H * 0.98;
  // pale outline first so the black stays readable where it crosses the black arc
  taper(g, vx, vy, hx, hy, H * 0.0035, H * 0.078, pale);
  taper(g, vx, vy, hx, hy, H * 0.0015, H * 0.066, ink);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 80; i++) {
      const s = i / 79;
      const ang = -2.95 + s * 2.05 + 0.06 * Math.sin(i * 7.3);
      const len = H * (0.66 + 0.2 * Math.sin(i * 12.9898) * Math.sin(i * 78.233));
      const w = H * 0.018 * (0.6 + 0.5 * Math.abs(Math.sin(i * 3.7)));
      taper(g, hx, hy + H * 0.06, hx + Math.cos(ang) * len * 0.7, hy + Math.sin(ang) * len * 0.7, (pass ? 1 : 1.25) * w, H * 0.001 + w * 0.25 * (pass ? 1 : 1.4), pass ? ink : pale);
    }
  }
  // the band of cord
  g.fillStyle = pale; g.beginPath(); g.ellipse(hx - H * 0.02, hy - H * 0.02, H * 0.094, H * 0.052, -0.7, 0, 6.3); g.fill();
  g.fillStyle = ink; g.beginPath(); g.ellipse(hx - H * 0.02, hy - H * 0.02, H * 0.078, H * 0.04, -0.7, 0, 6.3); g.fill();
}

function sweepNeg(g, W, H, seed, jx, jy) {
  const rng = new Rng(seed);
  clear(g, W, H, '#ffffff');
  const a = arcPath(W, H, jx, jy);
  const cx = a.p3[0], cy = a.p3[1];
  // focus: black needles flying out of the far end of the arc
  for (let i = 0; i < 110; i++) {
    const ang = rng.next() * 6.283, r0 = H * (0.12 + rng.next() * 0.5);
    wedge(g, cx, cy, ang, r0, W * 2, 0.002 + rng.next() * 0.006, 0.002 + rng.next() * 0.006, '#050308');
  }
  // the arc itself, black, on white
  crescent(g, a.p0, a.c1, a.c2, a.p3, arcWidth(H, 1.05), '#050308', rng, 2.2);
  // white torn core running inside the arc
  crescent(g, a.p0, a.c1, a.c2, a.p3, arcWidth(H, 0.62), '#ffffff', rng, 3);
  // hatching: parallel crescents riding the arc, the hand speed of the stroke
  for (let i = 0; i < 16; i++) {
    const off = H * (0.05 + 0.03 * i) * (1 + rng.next() * 0.3) * (rng.sign());
    const s0 = rng.next() * 0.5, s1 = s0 + 0.2 + rng.next() * 0.3;
    const pa = cubic(a.p0, a.c1, a.c2, a.p3, s0), pm = cubic(a.p0, a.c1, a.c2, a.p3, (s0 + s1) / 2), pb = cubic(a.p0, a.c1, a.c2, a.p3, Math.min(s1, 1));
    const hw = arcWidth(H, 1.05)((s0 + s1) / 2);
    crescent(g, [pa[0] + off * 1.2, pa[1] - off * 0.5], [pa[0] + off, pa[1] - off * 0.6], [pm[0] + off, pm[1] - off * 0.6 - hw * 0.2 * Math.sign(off)], [pb[0] + off * 0.6, pb[1] - off * 0.4 - hw * 0.2 * Math.sign(off)], (s) => Math.sin(Math.PI * s) * (3 + rng.next() * 3), '#050308', rng, 1);
  }
  // ink chatter along the outer rim
  for (let i = 0; i < 70; i++) {
    const s = rng.next();
    const p = cubic(a.p0, a.c1, a.c2, a.p3, s), hw = arcWidth(H, 1.05)(s);
    const ang = rng.next() * 6.283;
    const r = hw * (1 + 0.1 * rng.next());
    taper(g, p[0] + Math.cos(ang) * r, p[1] + Math.sin(ang) * r, p[0] + Math.cos(ang) * r * 1.6, p[1] + Math.sin(ang) * r * 1.6, 3 + rng.next() * 7, 0.5, '#050308');
  }
  foreBroom(g, W, H, '#050308', '#ffffff');
}

function sweepDuo(g, W, H, seed, jx, jy) {
  const rng = new Rng(seed);
  clear(g, W, H, '#05030a');
  const a = arcPath(W, H, jx, jy);
  // lime needles radiating from where the arc comes from
  for (let i = 0; i < 90; i++) {
    const ang = rng.next() * 6.283, r0 = H * (0.2 + rng.next() * 0.7);
    wedge(g, a.p3[0], a.p3[1], ang, r0, W * 2, 0.003 + rng.next() * 0.01, 0.002 + rng.next() * 0.006, '#d6f870');
  }
  // cracks in the air: heavy ink strokes in white, thin at the ends
  crescent(g, a.p0, a.c1, a.c2, a.p3, arcWidth(H, 1.2), '#e4ff7a', rng, 2);
  crescent(g, a.p0, a.c1, a.c2, a.p3, arcWidth(H, 0.86), '#ffffff', rng, 3);
  // the broom in ink, in front of the arc
  foreBroom(g, W, H, '#05030a', '#e4ff7a');
}

function sweepFinal(g, W, H, seed) {
  const rng = new Rng(seed);
  const a = arcPath(W, H);
  g.clearRect(0, 0, W, H);
  crescent(g, a.p0, a.c1, a.c2, a.p3, arcWidth(H, 1.0), '#7a4a1c', rng, 1);
  crescent(g, a.p0, a.c1, a.c2, a.p3, (s) => arcWidth(H, 0.97)(s) - 1.5, '#ffd27a', rng, 1);
  crescent(g, a.p0, a.c1, a.c2, a.p3, (s) => Math.max(arcWidth(H, 0.9)(s) - 3, 0.6), '#ffffff', rng, 2);
  // a thin gold hairline well inside
  crescent(g, a.p0, a.c1, a.c2, a.p3, (s) => arcWidth(H, 0.3)(s) * 0.16, '#ffe2a8', rng, 0.5);
  // shreds of air flying off the leading edge
  for (let i = 0; i < 36; i++) {
    const s = 0.12 + rng.next() * 0.75;
    const p = cubic(a.p0, a.c1, a.c2, a.p3, s), hw = arcWidth(H, 1)(s);
    const off = hw * (1.06 + rng.next() * 0.3);
    const ang = -1.1 + (rng.next() - 0.5) * 0.7;
    const x0 = p[0] + Math.cos(ang) * off, y0 = p[1] + Math.sin(ang) * off;
    taper(g, x0, y0, x0 + Math.cos(ang) * (H * 0.05 + hw * 0.5), y0 + Math.sin(ang) * (H * 0.05 + hw * 0.5), 2 + rng.next() * 7, 0.4, '#ffffff');
  }
}

function sunburst(g, W, H, seed, cx, cy, bg = '#05030a', needle = '#d6f870', spike = '#d6f870', inner = '#ffffff', dot = '#ffffff') {
  const rng = new Rng(seed);
  clear(g, W, H, bg);
  for (let i = 0; i < 80; i++) {
    const ang = rng.next() * 6.283, r0 = H * (0.18 + rng.next() * 0.25);
    wedge(g, cx, cy, ang, r0, W * 1.4, 0.004 + rng.next() * 0.018, 0.004 + rng.next() * 0.012, needle);
  }
  // the star of the armour bursting: a few huge spikes with black between them
  const spikes = 13;
  for (let i = 0; i < spikes; i++) {
    const ang = ((i + 0.5) / spikes) * 6.283 + (rng.next() - 0.5) * 0.14;
    const L = H * (i % 2 ? 0.34 + 0.12 * rng.next() : 0.62 + 0.3 * rng.next());
    const hw = 0.085 + rng.next() * 0.04;
    wedge(g, cx, cy, ang, 0, L, hw, hw, spike);
  }
  for (let i = 0; i < 9; i++) {
    const ang = (i / 9) * 6.283 + rng.next() * 0.3;
    wedge(g, cx, cy, ang, 0, H * (0.16 + rng.next() * 0.14), 0.12, 0.12, inner);
  }
  g.fillStyle = dot; g.beginPath(); g.arc(cx, cy, H * 0.06, 0, 6.3); g.fill();
}

function slashInk(g, W, H, seed) {
  const rng = new Rng(seed);
  clear(g, W, H, '#05030a');
  const p0 = [-W * 0.08, H * 0.98], c1 = [W * 0.3, H * 0.78], c2 = [W * 0.72, H * 0.46], p3 = [W * 1.1, H * 0.14];
  const w = (s) => H * 0.11 * Math.pow(Math.sin(Math.PI * s), 0.55) * (0.55 + 0.6 * s);
  // needles flying off the blade edge
  for (let i = 0; i < 70; i++) {
    const s = rng.next();
    const p = cubic(p0, c1, c2, p3, s);
    const ang = (rng.sign() > 0 ? -1.2 : 1.9) + (rng.next() - 0.5) * 0.7;
    const L = H * (0.15 + 0.6 * rng.next());
    taper(g, p[0], p[1], p[0] + Math.cos(ang) * L, p[1] + Math.sin(ang) * L, 2 + rng.next() * 5, 0.4, '#d6f870');
  }
  crescent(g, p0, c1, c2, p3, w, '#d6f870', rng, 2);
  crescent(g, p0, c1, c2, p3, (s) => w(s) * 0.55, '#ffffff', rng, 2.5);
}

function solid(col) { return (g, W, H) => clear(g, W, H, col); }

// ---------------------------------------------------------------- the nerve tree
function veins(seed) {
  return (g, W, H) => {
    const rng = new Rng(seed);
    const ux = (x) => W / 2 + x * H * 0.42, uy = (y) => H / 2 - (y - 0.0) * H * 0.42;
    const E = [0, 0.05];
    const LIMBS = [];
    const mir = (fn, list) => { for (const s of [1, -1]) list.push(fn(s)); };
    // eye → spine → pelvis
    const spine = [E, [0.0, -0.3], [0.03, -0.52], [0, -0.72]];
    LIMBS.push({ p: spine, w: 12 });
    mir((s) => ({ p: [[0, -0.72], [0.4 * s, -0.68], [0.55 * s, -0.84], [0.42 * s, -1.04]], w: 6 }), LIMBS);
    mir((s) => ({ p: [[0, -0.72], [0.28 * s, -0.8], [0.25 * s, -1.0], [0.14 * s, -1.12]], w: 4 }), LIMBS);
    mir((s) => ({ p: [[0.14 * s, 0.14], [0.52 * s, 0.36], [0.98 * s, 0.14], [0.86 * s, -0.42], [0.62 * s, -0.68]], w: 7 }), LIMBS);
    mir((s) => ({ p: [[0.14 * s, -0.05], [0.4 * s, -0.2], [0.56 * s, -0.44], [0.46 * s, -0.56]], w: 4 }), LIMBS);
    LIMBS.push({ p: [E, [0.0, 0.42], [0.0, 0.74]], w: 9 });
    mir((s) => ({ p: [[0, 0.6], [0.26 * s, 0.6], [0.34 * s, 0.34], [0.16 * s, 0.22]], w: 3.5 }), LIMBS);
    mir((s) => ({ p: [[0, 0.74], [0.3 * s, 1.02], [0.74 * s, 1.1], [1.18 * s, 0.94]], w: 2.2 }), LIMBS);
    // mantle: sweeping up and out from the shoulders
    mir((s) => ({ p: [[0.52 * s, 0.36], [0.92 * s, 0.76], [1.4 * s, 0.6], [1.7 * s, 0.14]], w: 2.6 }), LIMBS);
    const segs = [];
    let maxArr = 0;
    function walk(p, w, a0, depth) {
      let arr = a0;
      for (let i = 0; i < p.length - 1; i++) {
        const [x0, y0] = p[i], [x1, y1] = p[i + 1];
        const L = Math.hypot(x1 - x0, y1 - y0);
        const nS = Math.max(2, Math.round(L * 34));
        let lx = x0, ly = y0;
        for (let j = 1; j <= nS; j++) {
          const s = j / nS;
          const nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
          const ampl = 0.02 * (depth === 0 ? 1 : 0.8);
          const jg = j === nS ? 0 : (rng.next() - 0.5) * ampl * 2;
          const cx = x0 + (x1 - x0) * s + nx * jg, cy = y0 + (y1 - y0) * s + ny * jg;
          const w1 = w * (1 - 0.35 * ((i + s) / (p.length - 1)));
          segs.push([lx, ly, cx, cy, w1, arr, depth]);
          arr += L / nS;
          lx = cx; ly = cy;
          // branch
          const pBr = depth === 0 ? 0.13 : depth === 1 ? 0.07 : 0;
          if (rng.next() < pBr) {
            const side = rng.sign();
            const ang = Math.atan2(y1 - y0, x1 - x0) + side * (0.45 + rng.next() * 0.75);
            const blen = (0.09 + rng.next() * 0.2) * (depth === 0 ? 1.2 : 0.7);
            const bx = cx + Math.cos(ang) * blen, by = cy + Math.sin(ang) * blen;
            const ang2 = ang + (rng.next() - 0.5) * 1.2;
            const b2x = bx + Math.cos(ang2) * blen * 0.7, b2y = by + Math.sin(ang2) * blen * 0.7;
            walk([[cx, cy], [bx, by], [b2x, b2y]], Math.max(w1 * 0.6, 1.8), arr, depth + 1);
          }
        }
      }
      maxArr = Math.max(maxArr, arr);
    }
    for (const l of LIMBS) walk(l.p, l.w, 0, 0);
    clear(g, W, H, '#000000');
    segs.sort((a, b) => b[5] - a[5]);
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [x0, y0, x1, y1, w, arr, d] of segs) {
      const G = Math.round((arr / maxArr) * 255);
      g.strokeStyle = `rgb(255,${G},0)`; g.lineWidth = w * (H / 1440) * 2.1;
      g.beginPath(); g.moveTo(ux(x0), uy(y0)); g.lineTo(ux(x1), uy(y1)); g.stroke();
    }
    for (const [x0, y0, x1, y1, w, arr, d] of segs) {
      if (d > 1 || w < 2.4) continue;
      const G = Math.round((arr / maxArr) * 255);
      g.strokeStyle = `rgb(255,${G},255)`; g.lineWidth = Math.max(w * 0.34, 1.5) * (H / 1440) * 2.1;
      g.beginPath(); g.moveTo(ux(x0), uy(y0)); g.lineTo(ux(x1), uy(y1)); g.stroke();
    }
    // the eye, first thing to light, drawn by hand
    const ex = ux(E[0]), ey = uy(E[1]);
    const rx = H * 0.17, ry = H * 0.075;
    g.fillStyle = 'rgb(255,0,0)';
    const almond = () => { g.beginPath(); g.moveTo(ex - rx, ey); g.quadraticCurveTo(ex, ey - ry * 2.0, ex + rx, ey); g.quadraticCurveTo(ex, ey + ry * 2.0, ex - rx, ey); g.closePath(); };
    almond(); g.fill();
    g.fillStyle = 'rgb(255,0,0)';
    g.save(); almond(); g.clip();
    g.fillStyle = 'rgb(0,0,0)';
    g.beginPath(); g.ellipse(ex, ey, rx * 0.88, ry * 1.45, 0, 0, 6.3); g.fill();
    g.fillStyle = 'rgb(255,0,255)';
    g.beginPath(); g.arc(ex, ey, ry * 0.86, 0, 6.3); g.fill();
    g.fillStyle = 'rgb(0,0,0)';
    g.beginPath(); g.ellipse(ex, ey, ry * 0.14, ry * 0.72, 0, 0, 6.3); g.fill();
    g.restore();
    g.strokeStyle = 'rgb(255,0,255)'; g.lineWidth = 3;
    almond(); g.stroke();
  };
}

export function registerCards(cards) {
  cards.register('veins', veins(777));
  cards.register('sweepNeg0', (g, W, H) => sweepNeg(g, W, H, 11, 0, 0));
  cards.register('sweepNeg1', (g, W, H) => sweepNeg(g, W, H, 12, 12, -8));
  cards.register('sweepDuo0', (g, W, H) => sweepDuo(g, W, H, 21, 0, 0));
  cards.register('sweepDuo1', (g, W, H) => sweepDuo(g, W, H, 22, -18, 10));
  cards.register('sweepDuo2', (g, W, H) => sweepDuo(g, W, H, 23, 16, 6));
  cards.register('sweepFinal', (g, W, H) => sweepFinal(g, W, H, 31));
  // the first two frames of the armour bursting are printed as a negative on paper
  cards.register('shedNeg0', (g, W, H) => sunburst(g, W, H, 43, W * 0.55, H * 0.42, '#fffdf4', '#0b0710', '#0b0710', '#fffdf4', '#0b0710'));
  cards.register('shedNeg1', (g, W, H) => sunburst(g, W, H, 44, W * 0.55, H * 0.42, '#fffdf4', '#0b0710', '#0b0710', '#fffdf4', '#0b0710'));
  cards.register('shedBurst0', (g, W, H) => sunburst(g, W, H, 41, W * 0.55, H * 0.42));
  cards.register('shedBurst1', (g, W, H) => sunburst(g, W, H, 42, W * 0.55, H * 0.42));
  cards.register('slashInk', (g, W, H) => slashInk(g, W, H, 51));
  cards.register('white', solid('#ffffff'));
  cards.register('black', solid('#000000'));
}

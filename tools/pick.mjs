// What is at these pixels? node tools/pick.mjs <t> x,y x,y ...   (1920x1080 pixel coords) [--q query]
import { serve, launch, openFilm } from './env.mjs';
const a = process.argv.slice(2); let q = '';
const qi = a.indexOf('--q'); if (qi >= 0) { q = a[qi + 1]; a.splice(qi, 2); }
const t = parseFloat(a[0]); const pts = a.slice(1).map((s) => s.split(',').map(Number));
const srv = await serve(); const browser = await launch();
try {
  const { page } = await openFilm(browser, srv.url, `scale=0.25&${q}`);
  const r = await page.evaluate(async (t, pts) => {
    const THREE = await import('three'); const F = window.FILM, ctx = F.ctx;
    F.poseFrame(Math.round(t * F.FPS));
    const rc = new THREE.Raycaster(); const out = [];
    const pathOf = (o) => { const p = []; for (let x = o; x && x.parent; x = x.parent) p.push(x.name || x.type); return p.reverse().join('/'); };
    for (const [x, y] of pts) {
      rc.setFromCamera(new THREE.Vector2(x / 960 - 1, 1 - y / 540), ctx.camera);
      const hits = rc.intersectObjects(ctx.scene.children, true).filter((h) => h.object.visible && h.distance < 8400).slice(0, 3);
      out.push({ x, y, hits: hits.map((h) => ({ d: +h.distance.toFixed(1), obj: pathOf(h.object), inst: h.instanceId, p: h.point.toArray().map((v) => +v.toFixed(1)) })) });
    }
    return out;
  }, t, pts);
  console.log(JSON.stringify(r, null, 1));
} finally { await browser.close(); srv.close(); }

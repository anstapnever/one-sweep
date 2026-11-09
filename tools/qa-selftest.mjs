// Self-test of the QA inside/depth logic: a sphere half inside a box must be caught.
import { serve, launch, openFilm } from './env.mjs';
const srv = await serve(); const browser = await launch();
try {
  const { page } = await openFilm(browser, srv.url, 'scale=0.25&ring=0&warlord=0&capy=0&fx=0');
  const r = await page.evaluate(async () => {
    const THREE = await import('three');
    const { MeshBVH } = await import('/vendor/three-mesh-bvh.js');
    const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2)); box.position.set(5, 1, 0); box.updateMatrixWorld();
    const bvh = new MeshBVH(box.geometry);
    const ray = new THREE.Ray(); const DIRS = [new THREE.Vector3(1, 0.013, 0.007).normalize(), new THREE.Vector3(-0.011, 1, 0.017).normalize()];
    const inside = (p) => DIRS.every((d) => { ray.origin.copy(p); ray.direction.copy(d); return bvh.raycast(ray, THREE.DoubleSide).length % 2 === 1; });
    const info = { point: new THREE.Vector3(), distance: 0 };
    const test = (x, y, z) => { const lp = new THREE.Vector3(x, y, z).applyMatrix4(box.matrixWorld.clone().invert()); const i = inside(lp); bvh.closestPointToPoint(lp, info); return [i, +info.distance.toFixed(3)]; };
    return { center: test(5, 1, 0), near: test(5.9, 1, 0), out: test(7, 1, 0), above: test(5, 2.2, 0) };
  });
  console.log(JSON.stringify(r));
} finally { await browser.close(); srv.close(); }

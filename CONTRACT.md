# ONE SWEEP — production contract

A 78.2-second, 24 fps, 1920×1080 anime short rendered in the browser with three.js r170 (WebGL2), captured frame by
frame with headless Chrome and encoded with ffmpeg. It is a **retelling of the ACTIONS** of a famous anime fight (a
giant alien ship over a city, a block wiped out in one shot; an armoured alien warlord throws bigger and bigger attacks
at a bored hero, sheds its armour, keeps growing, boasts, regenerates; launches its last, planet-killing attack; the
hero answers with one serious blow; the clouds open around the whole planet and the alien comes apart).
**Everything visual is our own design.** The reference must be recognisable ONLY by what happens and by the camera work.

The reference clip is not part of this repository. Ref times per shot are in `src/shots.js` (field `ref`, seconds). Do not copy any design.

## Hard rules (client's words)
- **Bright, high-key, theatrical cel anime**: crisp two-tone cel shading, confident ink lines, gouache painted backgrounds.
  Must NOT read as CGI, vector art, low-poly, or plastic toys. Drama from scale, contrast, timing.
- **Textures** on big surfaces (tiles, walls, stone, chitin, metal, roofs) in **several scales**: large blotches and streaks;
  medium cracks and seams; small chips and grain. Texture visible near the camera. **Material detail fades with distance**
  or distant objects look semi-transparent (this was a real defect in the last film).
- **Physics of living things** (the client's main complaint about the last film: "they move a bit unrealistically"):
  centre of mass over the support, weight transfer, the planted foot does NOT slide for the entire step, anticipation before
  every action, follow-through and overlap (ears, tail, clothes, head lag and catch up on springs), arcs not straight lines,
  breathing at rest, different weights for different creatures. Each creature exposes `feet()` and passes `tools/feet.mjs`.
- **No clipping, ever**: no body part inside another body, prop, wall or ground. `tools/qa.mjs` on real geometry.
- Characters animate on twos (`onTwos`), FX on threes (`onThrees`); held poses, snappy accents; huge things move with mass.
- **Effects without thousands of particles near the hero's body.** A droplet/spark over a body reads as a spike.
- Everything is a pure function of `state.t` (frames render in random order). Seeded RNG, never `Math.random`.
- **Budget**: deliver a complete first pass of everything you own EARLY (within ~60 min), then keep improving your own
  work against this contract. A finished simple version beats an unfinished fancy one. Do not stop at "good enough": this
  film has 6-8 hours; go through your list again and raise the level.

## Story and shots (`src/shots.js`: SHOTS, CUES — film seconds)
Comedy engine: **the capybara has ONE desire, visible in every shot of him: a clean patch of tiles and a neat pile of
leaves.** The warlord destroys a city; the capybara is merely annoyed about the leaves. Cut hard between the world ending
and him sweeping. He never looks up until s23.

| id | t | owner | what happens |
|---|---|---|---|
| s01 | 0–1.3 | capy+fx+ring | **HOOK: FRAME 1 IS A POSTER, EVENT ALREADY GOING.** Camera at his face height, medium close: capybara dead centre, ~half the frame height, half-lidded eyes, broom mid-swing with a little dust puff. Behind him, in the upper two thirds, the colossal white-lime beam already stands and is raking the skyline; debris already hangs in the air; the cut line erupts in fire and coral dust from 0.5 on. Clean warm light on him, smoke and fire behind (silhouette reads at 320 px). Camera already drifting. He keeps sweeping; the broom never breaks rhythm. |
| s02 | 1.3–2.4 | capy+ring | cut closer on the same axis. 1.75 a sky-tram pod falls and plants itself nose-first 1.4 m to his right, tiles cracking; 1.9 the shock front arrives (ears, fur, overall straps whip back); he sweeps around the pod, 2.0 a leaf slaps on his snoot, 2.3 he puffs it off. Eyes never move. |
| s03 | 2.4–4.4 | ring+fx | new scale: aerial, the quarter goes up in a long straight trench of fire and coral dust; debris columns; the ring curves up to the horizon; a shadow begins to creep over the far towers. |
| s04 | 4.4–7.4 | heavens | low wide: the hive ship fills the sky, shadow falling across the towers; the beam retracts into it. Slow tilt. Threat. |
| s05 | 7.4–9.6 | capy | CU broom on the tiles, gathering leaves into a neat pile: shff, shff, a satisfied tap. 8.4 the shadow slides across the tiles. The threat stays in frame. |
| s06 | 9.6–11.4 | warlord+fx+ring | a streak drops; 9.9 THE LANDING right next to him (second hook of the film): tiles crater, the pile is blown apart. Warlord in deep crouch, one fist on the ground, cracks radiate. Capy stands, broom in hand, unmoved. |
| s07 | 11.4–15.0 | warlord | slow tilt up from the clawed feet to the head: 9 m of wine-dark chitin and gems; it rises, 13.4 arms spread, mantle unfurls, mandibles open: the boast. Very low angle. |
| s08 | 15.0–16.4 | warlord | ECU one gem eye: facets, the pupil tightens, lime lightning inside. |
| s09 | 16.4–19.2 | capy | he has re-started sweeping; sweeps right up to the warlord's toe; 17.8 and 18.3 taps the toe with the broom: move. Without looking up. |
| s10 | 19.2–21.4 | warlord+fx | blade arm cocks back (anticipation), 20.7 THE SLASH: a lime arc across frame. |
| s11 | 21.4–23.4 | ring+fx | wide: a whole skyline of towers has been cut on one line; 21.7 the upper halves start sliding off, slowly, enormous. |
| s12 | 23.4–24.8 | capy | CU capy, half-lidded. One cut hair floats down past his nose. He blinks once. Citrus still on his head. |
| s13 | 24.8–28.2 | warlord+fx | 25.1 roars, claws its own chest; 26.0 ARMOUR BURSTS: plates and gems fly, mantle flares huge, it swells from 9 m to 14 m, wind pushes outward. |
| s14 | 28.2–31.0 | fx+warlord | barrage: lime bolts pound his position, one explosion on another, smoke; wide low; impact frames (negative) on the biggest hits. Capy hidden in the smoke. |
| s15 | 31.0–33.2 | warlord+fx | it dashes through towers and drives the blade down on him. 32.5 hit: white-out, shock ring. |
| s16 | 33.2–36.8 | ring+capy+fx | smoke rolls off: a 34 m crater, and in the middle one square pillar of immaculate tile with the capybara on it, still sweeping, black with soot. 35.3 he shakes it off like a wet animal: whole body, ears, soot flying. |
| s17 | 36.8–38.8 | capy | CU: enormous slow yawn, big incisors. Warlord out of focus behind. |
| s18 | 38.8–41.0 | capy+warlord+fx | the warlord hovers in his face, screaming; 39.9 one lazy backhand flick of the broom without looking: the right half of the warlord is gone and a straight line opens in the clouds behind it. |
| s19 | 41.0–44.4 | warlord+fx | half-body at first; 41.4 lime veins knit it back (flesh and chitin boil and re-form). It laughs. |
| s20 | 44.4–46.8 | warlord+heavens+fx | it rockets up and burns white-hot, tiny silhouette high in a darkening sky, lightning columns; clouds begin to spiral in (the visible cause of the sky darkening). |
| s21 | 46.8–49.2 | heavens+fx | orbit: planet and ring. On the ring a star ignites. The cloud deck spirals toward it. |
| s22 | 49.2–50.4 | fx+warlord | black frame, only lime-yellow veins: the whole nervous system of the warlord, an eye in the middle. |
| s23 | 50.4–55.2 | capy+fx | ONE continuous slow move: CU the broom and his pile: the wind tears the pile away, leaf by leaf; 51.0 the last leaf rolls off the bristles; camera rises up his body; 51.7 the citrus rolls off his head at last; ECU face lit from above by the growing white-lime; 53.2 **he looks up, for the first time in the film.** 54.4 the brows come down. Tiny. Enormous. |
| s24 | 55.2–57.2 | fx+heavens | 55.6 the beam: from the ground, the column fills the sky; capybara a speck on his pillar at the bottom of frame. |
| s25 | 57.2–59.0 | capy | ECU paws close on the handle: 57.7 the wood creaks, fur stands, bristles lift. |
| s26 | 59.0–60.6 | capy+fx | from behind and low: the back foot sets, weight drops, torso winds, broom drawn back. 59.0 all sound stops. Leaves and pebbles rise around him in stillness. |
| s27 | 60.6–61.8 | capy+fx | **61.0 ONE SWEEP.** Foreshortened broom across frame, impact frames (negative, then white, then lime/ink duotone). |
| s28 | 61.8–64.2 | fx+heavens | camera behind him looking up: the beam is parted; a colossal oculus of white torn air with clean blue at the centre; the speck of him in the middle of the follow-through. |
| s29 | 64.2–67.2 | warlord+fx | CU the warlord in the sky, the front reaches it: gems ripped off, chitin dissolves front-to-back into lime ash; its eye goes wide, then quiet. The hive ship behind shears in two along the same line. |
| s30 | 67.2–71.6 | heavens | orbit: the cloud cover opens along one line right round the planet; ring and sun; the biggest image of the film, slow. |
| s31 | 71.6–78.2 | capy+heavens+ring+fx | starts on the open sky: blue to every horizon, the cloud wall pushed back to the horizon as one long clean edge, sun shafts, gems and ash falling like snow; cranes down to him on his pillar. 74.6 he looks at the broom: only a stump of bristles left. 75.2 one leaf comes down, swinging, lands 76.9 on the clean tile. He sighs. 77.3 he sweeps it: **exact same framing and the same swing as frame 1 of the film** (the rhyme: behind him the clouds are cut to the horizon). Hard cut to black at 78.0. |

CUES are in `src/shots.js`. Read them from there, never hard-code seconds.
**World continuity**: the skyline is cut after CUES.slash in every shot where it is visible; the pod stands from podHit until the crater; the crater exists after bladeHit; soot on the capy bladeHit→sootShake then gone in a burst; the citrus is on his head until citrusFall, gone after; clouds spiral after gather; sky dark gather→sweep; clear after sweep; the ship split after sweep. Broom bristles are shorn to a stump at sweep. The hook (s01) and the last shot rhyme: identical camera framing and broom swing.

## Designs (ours — keep to them; nothing may resemble the reference's bald hero, cape, gloves, or blue-gold one-eyed alien)
- **The Sweeper (capybara janitor).** 1.15 m to the top of the head, stands on two legs, barrel body, low wide centre
  of mass, short thick legs, big blocky head, blunt square muzzle, huge flat nose, small high-set round ears, half-lidded
  sleepy eyes high on the head, two big incisors (yawn). Coarse warm russet-brown fur with lighter belly and darker back,
  fur drawn with a texture of long strokes and clumps. **Sage-green work overalls** with patched knees, a chest pocket with
  a rag, a brass buckle at each strap, frayed hem; rubber boots in dark olive; a canvas apron-like tool belt with a tin
  dustpan on it. A small **yellow-green citrus on top of his head**, perfectly balanced (the running gag). No cap, no
  scarf, no cape, no gloves. Bare paws: four thick fingers.
  Broom: pale ash wood handle, a fat bundle of straw bristles bound with red-brown cord; bristles bend and drag on contact.
  Face: at rest the eyelids sit at half. Expressions (only these): **bored** (default), **blink**, **blow** (puff), **yawn**,
  **looking up** (eyes open wider, no fear), **brows down** (the single serious expression, s23-s27), **sigh** (s32). Keep
  every close-up exact to this list: no smile anywhere, no ":3" mouth.
- **The Warlord.** A huge insect war-king, 9 m, then 14 m: wedge mantis head with two big faceted gem-eyes set on the sides,
  long jointed mandibles, two whip antennae; thick domed thorax with a forward horn; four arms (two big raptorial blade
  arms, two lean inner arms); narrow segmented waist; long digitigrade legs, three-toed clawed feet. **Deep wine-dark chitin**
  (`#3a0d24` → `#7c1f3e`), coral-pink ridge highlights, cream underplates, with a **scatter of gems** set in the armour
  (turquoise and citrine, a few rubies). Energy **mantle**: chartreuse/lime plasma streaming off the shoulders and back as
  ribbons and a flaring cowl. After the shed: lean body, lime veins, plate fragments only. After ascent: white-hot with
  lime veins. It has weight: every step transfers tonnes, the ground reacts. Expressions: mandibles spread (boast), mandibles
  gnashing (rage), head tilted (amused), eyes wide then quiet at the end.
- **City**: a shining city on a ring around a planet. **White and pale coral towers** shaped like organic stacked terraces and
  coral branches, curved balconies, hanging gardens, turquoise-glass bands, coral-pink roof trim, sky bridges between towers.
  Rounded, flowing, tall (40–400 m). Promenade of honed pale coral stone tiles with inlaid brass lines, planters with small
  olive trees (the source of the leaves), lamp-posts, benches, coral balustrade on the south edge. Bright, clean, blinding sun.
- **Sky/space**: azure sky, big white clouds, the ring rising as an arc in the sky left and right with the planet's
  blue-white limb below. Over the rail: a sea of clouds far below. Orbit: planet with cloud cover, thin bright ring, sun.
- **Hive ship**: 7 km long, wine-dark chitin and bone, ribbed like a seed pod or beetle carapace, long hanging legs, rows of
  lime vents.
- **Energy** is lime-chartreuse with a white core, never pink, blue or cyan. Explosions: cel-painted, big clean shapes with hard
  shadow sides; smoke in big rounded billows with one light and one hard shadow, ink only on silhouette (rule from the
  Colossus film: no noisy "wool", no ink on every puff).
- **Sweep**: white arc front with thin gold edge, parting everything, very clean.

## Light (`src/colorscript.js`, lead)
The lead sets for each shot: key, rim, fill, energy light and grade. Every department's materials must take these:
- Call `outc = rigLight(albedo, outc, N, V, vWorld)` (in `COMMON` from `glsl.js`) as the last lighting step in every
  character, prop and building material. Include the `COMMON` chunk. Palette-driven: use `uSkyTint / uShadeTint / uDeepTint / uBounce / uSunColor`.
- Set your shots' `LOOKS` only for `shadow: {center, radius, depth}` and `key` if a close-up needs a key cheat. The colour
  script overrides everything else. Do not fight it.

## Map (`src/layout.js` — the one shared map, read it)
Ground y = 0. The promenade runs along X, the city is north (-Z), the rail and open sky south (+Z). Capy home (0,0,0). Warlord
landing (4.2, 0, -7.2). Crater centre (0,0) radius 34, pillar |x|,|z| ≤ 2.5 with its top at y = 0. Orbit set around y = 100000.

## Departments and file ownership — edit ONLY your files
Others edit their files at the same time. Never edit, reformat or "fix" a file you don't own; put requests in your report.

| Department | Owns |
|---|---|
| Lead | `index.html`, `src/main.js`, `src/engine.js`, `src/glsl.js`, `src/materials.js`, `src/bgmaterials.js`, `src/passes-env.js`, `src/look.js`, `src/shots.js`, `src/layout.js`, `src/util.js`, `src/colorscript.js`, `tools/*`, `CONTRACT.md` |
| Ring (city) | `src/ring.js`, `src/ring-*.js`, `src/cams/ring.js` |
| Heavens (sky, ship, orbit) | `src/world.js`, `src/world-sky.js`, `src/heavens-*.js`, `src/cams/heavens.js` |
| Capy | `src/capy.js`, `src/capy-*.js`, `src/cams/capy.js` |
| Warlord | `src/warlord.js`, `src/warlord-*.js`, `src/cams/warlord.js` |
| FX | `src/fx.js`, `src/fx-*.js`, `src/cams/fx.js` |
| Sound | `audio/**` (output `out/soundtrack.wav`) |

Read-only sources you may read and copy code from into your own files: the previous film of this series and the Leviathan project (MIT).
You may also copy code from `src/bgmaterials.js` / `src/materials.js` into your own files and adapt it there.

## Cameras and looks
The shot's main owner (bold first name in the table's "owner" column) writes its camera in `src/cams/<dept>.js`:
`export const CAMS = { s05: (lt, d, t, st) => ({ pos: [x,y,z], look: [x,y,z], fov, roll?, near?, far? }) };`
`export const LOOKS = { s05: (lt, d, t, st) => ({ shadow: {center, radius, depth}, key: [x,y,z] }) };`
Lens feel from the reference: long lens on faces, very wide low angles on the warlord. Cameras are alive: slow `noise1` drift on
close shots; heavy shake only on impacts (land, slash, shed, barrage, blade, flick, sweep). One continuous move per shot.
**Sets**: `st.set` tells which part of the world the shot needs: hide everything you don't need for speed (`prom`, `crater`,
`city`, `sky`, `warlord`, `orbit`, `abstract`). Orbit set objects are visible only when `st.set === 'orbit'`.

## Department APIs
Factories get `ctx` = `{ THREE, scene, overlay, engine, camera, atlas, G, CUES, SHOTS, FPS, W, H, shadowRoots, colliders }`
and later `ctx.world / ring / warlord / capy / fx`. Update order each frame: world, ring, warlord, capy, fx.
Factory names: `buildRing(ctx)` in ring.js, `createCapy(ctx)` in capy.js, `createWarlord(ctx)` in warlord.js,
`createFx(ctx)` in fx.js, `buildWorld(ctx)` in world.js. Each returns `{ update(st), ...api }` (may be async).
- `ctx.ring`: `groundY(x, z)` (crater-aware, reads the current state); `anchor(name, vec3)`; owns tile damage at land,
  `crater` state after bladeHit (hidden by the white-out), skyline cut states, the leaf pile is owned by Capy.
- `ctx.world`: must keep `sky` (mesh with the uniforms `uZenith uMid uHorizonWarm uHorizonCool uCloudLit uCloudMid uCloudShade uSunDisk uCloudDrift`, see `look.js`).
  Provides `shipTop(t)`, `anchor('shipBeam', vec3)` (where the beam leaves the ship), `spiral(t)` 0..1.
- `ctx.capy`: `root`; `anchor(name, vec3)` for `head`, `eyeL`, `eyeR`, `nose`, `pawL`, `pawR`, `broomTip`, `broomMid`, `citrus`; `feet()` (below); `pile()`
  returns `[{pos, r}]` of leaves still in the pile. The capy owns his leaf pile, the citrus, the dustpan, the broom and its state. Capy places himself relative to `ctx.warlord.anchor('toeL')` for s08.
- `ctx.warlord`: `root`; `anchor(name, vec3)` for `head`, `eyeL`, `eyeR`, `bladeTip`, `chest`, `toeL`, `toeR`, `pelvis`; `feet()`; `visible`;
  `mantleLight()` returns `{pos, k}` for the colour script. Owns armour pieces and the gems that fly at shed.
- `ctx.fx`: beams, explosions, smoke, the shock fronts, leaves in the wind (not the pile), bolts, lightning, the sweep arc, the
  oculus, ash and gems falling, impact-frame overlays, speed lines, one explicit `fx.anchor(name)`; every effect is a pure function of `st.t`.

### `feet()` API (mandatory for both creatures)
`feet()` returns `[{ name, pos: [x,y,z], planted: bool }]` in world metres at the current pose. `planted` true means this foot is on the ground and
is meant not to move. `node tools/feet.mjs` walks every frame and fails if a planted foot moves more than 2 mm/frame (sliding) or if `planted` changes
while the foot is above 3 cm over the ground (landing in the air).

## Engine facts
- Pass order: shadow → main MRT → paint (Kuwahara brush on painted pixels) → ink (cel pixels) → atmosphere → overlay sprites → bloom → grade. (`src/engine.js`, `src/glsl.js`.)
- Material ids in `writeOut`: 0 painted (brushwork, no ink), 1–99 inked cel, 100+ cel without ink. Parts of one character use different ids so ink lines fall at part boundaries; keep neighbours different.
  Id ranges: ring 1–19 (+0 painted), warlord 20–39, capy 40–59, fx 60–99.
- `celMaterial` (src/materials.js): color, dark, id, weather [grime,chip,rust,algae], gloss, map, emissive, emisMode, det. Painted background materials in `src/bgmaterials.js` (`paintMaterial`, `cityMaterial`, `foliageMaterial`).
- View depth > 8000 counts as sky; keep things within 8000 m of the camera (orbit shots set their own near/far).
- No `SkinnedMesh`: build characters as rigid parts in a hierarchy (pivots), or CPU-deform your own geometry (QA tests real vertices).

## Tools (run from the project root)
- `node tools/check.mjs 60` — loads the page headless, prints console errors.
- `node tools/snap.mjs --scale 1 t:40.2 t:46 s:s05@0.5 f:1100` — stills into `out/snaps/` (`--sheet name` for a contact sheet).
  Test cameras: `node tools/snap.mjs "q:test=1&cam=0,2,20&at=0,1,0&fov=40&t=46"`. Skip departments for speed: add `&fx=0&capy=0`, etc.
- **Look at your stills with the Read tool every time, at full size.** Compare with the reference frames of your shots. Also check crops.
- The GPU is shared with another film being made at the same time: keep snaps at `--scale 1`, never run full renders.

## QA (mandatory)
- Register real geometry in `ctx.colliders.push({ name, dept, obj, kind, contact })`: `kind: 'solid'` (ring: floor, pillar, rail, benches, planters; closed meshes, non-instanced) or `'body'` (characters: every rigid part). `contact`: names of solids this body may touch (feet on the floor, broom tip on the tiles): penetration up to 3 cm allowed there, 0 elsewhere.
- `node tools/qa.mjs` tests every body vertex against every solid and other department's bodies with three-mesh-bvh at every 2nd frame; also the camera. Add `--shots s05,s08` to narrow it.
- `node tools/feet.mjs [--shots s04] ` foot sliding; `node tools/smooth.mjs` camera and head smoothness; `node tools/pops.mjs` things blinking mid-shot.
- Each story beat must be visible in frame: the owner snaps a still from the shot's camera at the exact CUE and looks at it.

## Reporting
When done, report briefly: what you built, which shots you set cameras for, known weaknesses, what you need from another department, and 2–4 paths of stills you are proudest of. No more than 15 lines.

---
name: browser-game-optimizer
description: 'Optimize a browser (WebGL / three.js) game so it runs smoothly on phones: measure draw calls, triangles, shadows, post-processing and pixels, then apply the industry tricks (LOD, instancing, mesh merging, culling, shadow and resolution tiers, dynamic resolution, context-loss recovery). Use when the user says "optimize", "too heavy", "lag", "blank screen on mobile", "GPU", or "LOD".'
---

# Browser Game Optimizer

You are a senior real-time graphics engineer who ships WebGL games to low-end Android phones. The goal is a game
that holds a steady frame rate on a 3-year-old mid-range phone **without losing its look** and without the
browser dropping the WebGL context (which shows as a blank scene with only the page background and the HTML HUD).

Phones are not small desktops: a phone GPU is tile-based, has a fraction of the memory bandwidth, and throttles
when hot. The real enemies, in order: **draw calls and CPU submit time, fill rate (pixels x overdraw x passes),
shadow/post passes, memory**. Triangles matter less than people think, until they reach ~300k.

## Process

1. **Inventory** what the game draws: read the scene set-up, quality tiers and any existing LOD/instancing.
2. **Measure before changing anything** with `scripts/gpu-audit.mjs` (see below). Save it as `--label before`.
3. **Fix in order of cost**, biggest wins first (the catalogue below). Re-measure after each group of changes.
4. **Check it still looks good**: take screenshots at phone size and look at them. An optimisation that changes the
   look is a regression unless the user agreed.
5. **Verify** with the audit again (`--label after`), the unit tests, and the production build. Write the
   before/after table in your report. Say plainly that real phones were not measured, and what to collect if
   the problem persists (phone model, chapter, `chrome://gpu`, console).

### The audit script

```bash
node .claude/skills/browser-game-optimizer/scripts/gpu-audit.mjs --url http://localhost:5175 \
  --renderer "window.__game.world.renderer" --scene "window.__game.world.scene" \
  --setup "window.__game.start(1)" --label before --out "$SCRATCH/perf" --channel chrome
```

It needs the renderer and scene exposed in dev builds (for example on `window.__game`). It prints draw calls,
triangles, programs, geometries, textures, shadow casters, transmissive meshes, instancing, LOD use, the
heaviest meshes and the frame time under CPU throttling, and flags anything over the phone budgets below.
A headless desktop GPU is much faster than a phone: trust the **counts**, not the milliseconds.

## Phone budgets (per frame, mid-range Android)

| Thing | Budget | Over this you are in trouble |
| --- | --: | --: |
| Draw calls (all passes) | <= 300 | 600+ |
| Triangles rendered | <= 150k | 400k+ |
| Shadow casters | <= 60, one light, <= 1024 map | 200+ or two lights |
| Full-screen passes (post-processing) | 0-1 on low, <= 3 on high | 5+ |
| Pixels shaded | <= ~1.2 M on low (e.g. 412x915 at pixel ratio 1.0 is 0.38 M; at 2.6 it is 2.5 M) | 2.5 M+ |
| Shader programs | <= 25 | 60+ |
| Transmission/refraction materials | 0 | 1 (it re-renders the whole scene) |
| Textures | <= 40, each <= 1024 px (power of two) | 4k textures |

## The catalogue of tricks (apply the cheapest first)

### Fewer draw calls (CPU submit is the usual phone bottleneck)
- **Merge static meshes by material** (`BufferGeometryUtils.mergeGeometries` after baking each mesh's world
  matrix). Scenery that never moves (rim decorations, kitchen shelves, a counter full of jars) is one draw call per
  material, not one per object. Keep `castShadow`/`receiveShadow` the same inside a merge group.
- **Instancing** (`InstancedMesh`) for repeats: grass, crowds, coins, particles, bullets. One draw, per-instance
  matrix and colour.
- **Share materials and geometries.** Every new material instance can become a new shader program or state change.
- **Cartoon outlines and "inverted hull" doubling the draws**: drop them on far or tiny objects and on the low tier,
  or bake them into the merge.
- **Frustum culling stays on**, and set sensible bounding spheres on merged and instanced meshes (an
  `InstancedMesh` needs `computeBoundingSphere`, or turn culling off deliberately).
- **Object pooling**: reuse meshes and materials for bullets, popups and particles; no allocation in the frame loop
  (GC pauses are visible hitches on phones).
- **Static scenes**: set `matrixAutoUpdate = false` and call `updateMatrix()` once for things that never move.

### Level of detail (LOD)
- **Geometry LOD** (`THREE.LOD`): 2-3 levels per repeated or large object; the far level can be 1/10 of the
  triangles, and the last can be a billboard/sprite or nothing. Pick distances by on-screen size, not by habit.
- **Detail by quality tier**: lower sphere/cylinder segments on the low tier (a 32x24 sphere is 1,500 triangles; a
  10x8 sphere is 160 and is fine at 40 px). Build primitives with `seg(high, low)`.
- **Detail by importance**: a hero object may be smoothed (tessellated, normal-mapped); background props
  should not. Put a triangle budget on any procedural smoothing/subdivision.
- **Material LOD**: far objects use `MeshLambertMaterial`/`MeshBasicMaterial`, not physical materials (clearcoat,
  sheen, iridescence and transmission each add cost per pixel).
- **Shadow LOD**: far or small objects do not cast shadows.
- **Update LOD**: animate far things less often (every 2nd/3rd frame) or not at all (skinned meshes, wind sway).

### Fewer and cheaper pixels (fill rate)
- **Cap the pixel ratio**: `min(devicePixelRatio, 1.5)` on high and **1.0 on low**; the eye barely notices on a
  phone, the GPU does (2.6 vs 1.0 is 6.8x the pixels).
- **Dynamic resolution scaling**: watch the frame time and lower the render scale in steps (1.0 -> 0.85 -> 0.7 ->
  0.6), raise it again slowly when there is headroom; re-apply with `renderer.setPixelRatio`. Never change the
  canvas CSS size.
- **Post-processing only on the high tier**, and each pass at half resolution where possible (SSAO/GTAO, bloom,
  blur are all fine at half res). One combined grade/vignette pass is the cheap alternative.
- **Reduce overdraw**: sort opaque front to back (three.js does), avoid big transparent quads, keep particle
  sprites small, no full-screen transparent overlays.
- **Cheaper shaders**: `precision mediump` where allowed, no per-pixel `pow`/`normalize` chains, no dynamic
  loops with large counts, avoid `discard` on large areas (it disables early-z on tilers).
- **Transmission/refraction/`MeshTransmissionMaterial` -> a transparent tinted material.** Transmission renders the
  whole scene a second time into a texture: one glass jar can cost more than the rest of the frame.

### Shadows
- One shadow-casting light. A **small, tight shadow map** (1024 on phones, 512 for tiny areas) fitted to the play
  area, not the whole world.
- Prefer `PCFShadowMap` (or even `BasicShadowMap`) on low; `VSMShadowMap` is a multi-pass blur and costs a lot.
- Only things that need to cast do: no tiny decorations, no thin props.
- **Static shadows**: if the casters are static, render the shadow map once (`shadow.autoUpdate = false`, set
  `needsUpdate = true` when something changed) and let only the moving objects use a cheap blob shadow.
- Update the shadow every 2nd frame while moving; fake contact shadows with a projected circle texture.

### Memory and loading
- **Texture compression** (KTX2/Basis) and **mipmaps**; cap texture size (<= 1024 on phones). A 2048x2048 RGBA
  texture is 22 MB with mips in GPU memory.
- **Geometry compression** (Draco/meshopt) for shipped models; indexed geometry (non-indexed triples vertex memory
  and breaks the vertex cache). Quantise attributes.
- **Dispose** geometries, materials and textures of things you remove (`renderer.info.memory` must stay flat across
  levels).
- Lazy-load heavy assets, show the game early, precache for offline (service worker).

### Robustness on phones
- **Handle `webglcontextlost` / `webglcontextrestored`**: `preventDefault()` on lost; on restored rebuild
  or reload into the lowest tier and remember it (localStorage) so the next start does not repeat the crash.
- **Adaptive tiers**: choose the first tier from `hardwareConcurrency`, `deviceMemory`, screen size and the
  renderer string; then step down automatically after N slow frames and up only with hysteresis. Provide a manual
  "battery saver" toggle that is truly light.
- **Cap the frame rate**: 60 while the player acts, 30 when idle, and stop rendering when the tab is hidden. A 120 Hz
  phone otherwise doubles the work for no visible gain.
- `powerPreference: 'high-performance'` only if needed, `antialias` false on low (use the resolution cap or FXAA),
  `alpha: false`, `stencil: false`, `preserveDrawingBuffer: false`.
- **Throttle heat**: sustained 60 fps at full load is not sustainable on a phone; a 30 fps cap is a legitimate fix.

## Guardrails

- Change one group at a time, re-measure, and keep the numbers. If a trick does not move the numbers, revert it.
- Keep the look: compare screenshots before and after at the same viewport. Ask before cutting something the
  player would notice (a feature, the outlines, the bloom) on the *high* tier; the *low* tier can be blunter.
- Respect the repo's rules (AGENTS.md): branch per product, tests and build must pass, no new always-on UI.
- Do not guess the cause of a phone-only bug from a desktop run; reproduce it with throttling and a phone-sized
  viewport, then make the budget numbers the contract.
- Report honestly: what was measured, what was inferred, and that a real phone is the final judge.

## Report template

```markdown
| Metric | Before | After | Budget |
| --- | --: | --: | --: |
| Draw calls | | | <= 300 |
| Triangles | | | <= 150k |
| Shadow casters | | | <= 60 |
| Passes / transmissive | | | 0 |
| Pixels (low tier) | | | <= 1.2 M |
```

#!/usr/bin/env node
/**
 * GPU/CPU audit of a three.js game running in a browser. Drives the page with a setup expression, then measures
 * per frame: draw calls, triangles, programs, textures, geometries (renderer.info), what is in the scene
 * (materials that cost the most, shadow casters, instancing, LOD, the heaviest meshes), the canvas size, and the
 * frame time under CPU throttling. Prints a table and a verdict against phone budgets, and writes audit.json.
 *
 *   node gpu-audit.mjs --url http://localhost:5175 \
 *     --renderer "window.__game.world.renderer" --scene "window.__game.world.scene" \
 *     --setup "window.__game.start(1)" [--viewport 412x915] [--dpr 2.6] [--cpu 4] [--seconds 4] \
 *     [--label before] [--out ./perf] [--channel chrome]
 *
 * --renderer / --scene are JS expressions that return the THREE.WebGLRenderer and THREE.Scene (expose them in dev
 * builds, for example on window.__game). --setup runs once after load (start a level, open a heavy screen).
 * Headless desktop GPUs are far faster than phones: trust the *counts* (calls, triangles, passes, pixels), and
 * use --cpu to see CPU-bound frames. Compare runs with the same --label scheme (before/after).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args.set(a.slice(2), true);
  else (args.set(a.slice(2), next), i++);
}
const url = String(args.get('url') ?? 'http://localhost:5173');
const rendererExpr = String(args.get('renderer') ?? 'window.__renderer');
const sceneExpr = String(args.get('scene') ?? 'window.__scene');
const setup = args.get('setup') ? String(args.get('setup')) : '';
const [width, height] = String(args.get('viewport') ?? '412x915').split('x').map(Number);
const dpr = Number(args.get('dpr') ?? 2.6);
const cpu = Number(args.get('cpu') ?? 4);
const seconds = Number(args.get('seconds') ?? 4);
const label = String(args.get('label') ?? 'run');
const out = resolve(String(args.get('out') ?? './perf'));
const channel = args.get('channel') ? String(args.get('channel')) : undefined;
mkdirSync(out, { recursive: true });

const require = createRequire(resolve('package.json'));
let pw;
for (const name of ['@playwright/test', 'playwright', 'playwright-core']) {
  try {
    pw = require(name);
    break;
  } catch {
    /* next */
  }
}
if (!pw) {
  console.error('Playwright not found in this project.');
  process.exit(2);
}

/** Phone budgets (mid-range Android, 60 fps target). Counts per frame, drawn with the main camera. */
const BUDGET = {
  calls: 150,
  triangles: 150_000,
  programs: 40,
  textures: 60,
  transmissive: 0,
  shadowCasters: 80,
  passes: 6,
  pixelsMillions: 1.4,
};

function inPage({ rendererExpr, sceneExpr, seconds }) {
  const renderer = eval(rendererExpr);
  const scene = eval(sceneExpr);
  return new Promise((done) => {
    const info = renderer.info;
    info.autoReset = false;
    info.reset();
    let frames = 0;
    const deltas = [];
    let last = performance.now();
    const start = last;
    const tick = (t) => {
      deltas.push(t - last);
      last = t;
      frames++;
      if (t - start < seconds * 1000) return requestAnimationFrame(tick);
      const f = Math.max(1, frames);
      const per = {
        calls: Math.round(info.render.calls / f),
        triangles: Math.round(info.render.triangles / f),
        // Each draw into a different target is a pass; calls/f alone hides post-processing that redraws the scene.
        frames: f,
      };
      // Scene census.
      const mats = new Map();
      const heavy = [];
      let meshes = 0, visible = 0, instanced = 0, lods = 0, casters = 0, transmissive = 0, transparent = 0,
        physical = 0, nonIndexed = 0, tris = 0, lights = 0, skinned = 0;
      const geos = new Set();
      scene.traverse((o) => {
        if (o.isLight) lights++;
        if (o.isLOD) lods++;
        if (!o.isMesh) return;
        meshes++;
        if (!o.visible) return;
        visible++;
        const g = o.geometry;
        const t0 = (g.index ? g.index.count : g.attributes.position.count) / 3;
        const n = o.isInstancedMesh ? o.count : 1;
        if (o.isInstancedMesh) instanced++;
        if (o.isSkinnedMesh) skinned++;
        if (!g.index) nonIndexed++;
        geos.add(g.uuid);
        tris += t0 * n;
        if (o.castShadow) casters++;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        const kind = m.type + (m.transmission > 0 ? '+transmission' : '') + (m.clearcoat > 0 ? '+clearcoat' : '') + (m.sheen > 0 ? '+sheen' : '') + (m.iridescence > 0 ? '+iridescence' : '') + (m.transparent ? '+transparent' : '');
        mats.set(kind, (mats.get(kind) ?? 0) + 1);
        if (m.transmission > 0) transmissive++;
        if (m.transparent) transparent++;
        if (m.isMeshPhysicalMaterial) physical++;
        heavy.push({ name: o.name || o.parent?.name || g.type, tris: Math.round(t0 * n), inst: n, geo: g.type, kind });
      });
      heavy.sort((a, b) => b.tris - a.tris);
      deltas.shift();
      const sorted = [...deltas].sort((a, b) => a - b);
      const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
      const canvas = renderer.domElement;
      done({
        perFrame: per,
        programs: info.programs?.length ?? null,
        textures: info.memory.textures,
        geometries: info.memory.geometries,
        scene: { meshes, visible, instanced, lods, casters, transmissive, transparent, physical, nonIndexed, triangles: Math.round(tris), lights, skinned, materials: Object.fromEntries(mats) },
        heaviest: heavy.slice(0, 10),
        canvas: { w: canvas.width, h: canvas.height, pixelRatio: renderer.getPixelRatio(), megapixels: +(canvas.width * canvas.height / 1e6).toFixed(2) },
        shadows: { enabled: renderer.shadowMap.enabled, type: renderer.shadowMap.type },
        frameMs: { median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), fps: +(1000 / Math.max(1, q(0.5))).toFixed(1) },
      });
    };
    requestAnimationFrame(tick);
  });
}

const browser = await pw.chromium.launch({ channel, args: ['--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
await page.goto(url);
await page.waitForFunction(() => document.body.classList.contains('ready') || document.querySelector('canvas'), null, { timeout: 30000 });
await page.waitForTimeout(1500);
if (setup) await page.evaluate(setup);
await page.waitForTimeout(2500);
const cdp = await ctx.newCDPSession(page);
if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
const r = await page.evaluate(inPage, { rendererExpr, sceneExpr, seconds });
r.label = label;
r.errors = errors;

const flags = [];
const check = (name, value, limit, why) => value > limit && flags.push(`${name} ${value} > ${limit}: ${why}`);
check('draw calls/frame', r.perFrame.calls, BUDGET.calls, 'batch/instance/merge, cull, LOD');
check('triangles/frame', r.perFrame.triangles, BUDGET.triangles, 'LOD, simpler geometry, cull, fewer instances');
check('programs', r.programs ?? 0, BUDGET.programs, 'share materials; avoid per-material shader variants');
check('textures', r.textures, BUDGET.textures, 'atlas, compress (KTX2), smaller sizes');
check('transmissive meshes', r.scene.transmissive, BUDGET.transmissive, 'each frame re-renders the opaque scene into an extra target; use opacity + env map instead');
check('shadow casters', r.scene.casters, BUDGET.shadowCasters, 'only big things need to cast; bake or blob the rest');
check('canvas megapixels', r.canvas.megapixels, BUDGET.pixelsMillions, 'cap the pixel ratio / render scale');
const overdraw = r.perFrame.calls / Math.max(1, r.scene.visible);
if (overdraw > 2.2) flags.push(`calls per visible mesh ${overdraw.toFixed(1)}: the scene is drawn about ${Math.round(overdraw)}x per frame (shadow pass, depth/normal pass, post)`);
if (r.scene.nonIndexed > r.scene.visible * 0.3) flags.push(`${r.scene.nonIndexed} non-indexed meshes: index them (mergeVertices) to cut vertex work`);
if (r.scene.lods === 0 && r.scene.visible > 100) flags.push('no LOD at all with many meshes');
r.flags = flags;
writeFileSync(`${out}/audit-${label}.json`, JSON.stringify(r, null, 2));

console.log(`\n== GPU audit: ${label}  (${width}x${height} @${dpr}x, CPU x${cpu}) ==`);
console.log(`frame:      median ${r.frameMs.median} ms (${r.frameMs.fps} fps), p95 ${r.frameMs.p95} ms over ${r.perFrame.frames} frames`);
console.log(`per frame:  ${r.perFrame.calls} draw calls, ${r.perFrame.triangles.toLocaleString()} triangles`);
console.log(`memory:     ${r.geometries} geometries, ${r.textures} textures, ${r.programs} shader programs`);
console.log(`canvas:     ${r.canvas.w}x${r.canvas.h} (${r.canvas.megapixels} MP, pixel ratio ${r.canvas.pixelRatio}), shadows ${r.shadows.enabled ? 'type ' + r.shadows.type : 'off'}`);
console.log(`scene:      ${r.scene.visible}/${r.scene.meshes} visible meshes, ${r.scene.instanced} instanced, ${r.scene.lods} LODs, ${r.scene.casters} shadow casters, ${r.scene.lights} lights, ${r.scene.transmissive} transmissive`);
console.log('materials: ', JSON.stringify(r.scene.materials));
console.log('heaviest:  ', r.heaviest.slice(0, 6).map((h) => `${h.name}(${h.geo}) ${h.tris.toLocaleString()}t x${h.inst}`).join(' | '));
if (errors.length) console.log('errors:    ', errors.slice(0, 5).join(' | '));
console.log(flags.length ? '\nOver budget:\n - ' + flags.join('\n - ') : '\nWithin phone budgets.');
await browser.close();

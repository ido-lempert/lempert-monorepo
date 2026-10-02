#!/usr/bin/env node
/**
 * UX probe: runs a scenario (a module that drives the app through its states) at several viewports and, at
 * every `capture(name)`, takes a screenshot and measures the page: overlapping text/controls, covered
 * controls, clipped text, off-screen elements, small or crowded tap targets, contrast, tiny text, density.
 *
 *   node probe.mjs --url http://localhost:5173 --scenario ./scenario.mjs --out ./ux \
 *     [--viewports 390x844,844x390,1280x800] [--contrast 7] [--target 44] [--reduced-motion] [--channel chrome]
 *
 * The scenario's default export is `async (page, capture, info) => {...}`; `info` is
 * { url, viewport: {width, height}, touch }. A step that throws (for example a click that times out because
 * the control is covered or off-screen) is recorded as a finding in its own right and ends that viewport.
 * Playwright is resolved from the project (`@playwright/test` or `playwright`).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args.set(a.slice(2), true);
  else (args.set(a.slice(2), next), i++);
}
const url = String(args.get('url') ?? process.env.URL ?? 'http://localhost:5173');
const scenarioPath = args.get('scenario');
const out = resolve(String(args.get('out') ?? './ux-probe'));
const viewports = String(args.get('viewports') ?? '390x844,360x640,844x390,820x1180,1280x800')
  .split(',')
  .map((v) => v.trim().split('x').map(Number))
  .map(([width, height]) => ({ width, height }));
const contrastTarget = Number(args.get('contrast') ?? 7);
const targetSize = Number(args.get('target') ?? 44);
if (!scenarioPath) {
  console.error('Missing --scenario <file>');
  process.exit(2);
}
process.env.URL = url;

const require = createRequire(resolve('package.json'));
let pw;
for (const name of ['@playwright/test', 'playwright', 'playwright-core']) {
  try {
    pw = require(name);
    break;
  } catch {
    /* try the next one */
  }
}
if (!pw) {
  console.error('Playwright not found in this project (npm i -D @playwright/test).');
  process.exit(2);
}
const scenario = (await import(pathToFileURL(resolve(String(scenarioPath))).href)).default;

/** Runs inside the page. Returns the measurements for the current screen. */
function audit({ targetSize, contrastTarget }) {
  const vw = innerWidth;
  const vh = innerHeight;
  const INTERACTIVE = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=switch], [role=checkbox], [role=menuitem], [role=link], [tabindex]:not([tabindex="-1"])';

  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const text = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`;
  };
  const visible = (el) => {
    try {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    } catch {
      /* older engines: fall through to the box test */
    }
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const rectOf = (r) => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
  const area = (r) => Math.max(0, r.width) * Math.max(0, r.height);
  const inter = (a, b) => {
    const l = Math.max(a.left, b.left);
    const t = Math.max(a.top, b.top);
    const rr = Math.min(a.right, b.right);
    const bb = Math.min(a.bottom, b.bottom);
    return { left: l, top: t, right: rr, bottom: bb, width: rr - l, height: bb - t };
  };
  const scrollParent = (el) => {
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowY + s.overflowX) && (p.scrollHeight > p.clientHeight + 1 || p.scrollWidth > p.clientWidth + 1)) return p;
    }
    return null;
  };

  // ---- Collect the visible controls and text blocks ------------------------------------------------
  const controls = [...document.querySelectorAll(INTERACTIVE)].filter(visible);
  const controlSet = new Set(controls);
  const texts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (!el || seen.has(el) || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName) || !visible(el)) continue;
    seen.add(el);
    const range = document.createRange();
    range.selectNodeContents(el);
    // Own text only: use the box of this element's direct text nodes.
    const own = [...el.childNodes].filter((c) => c.nodeType === 3 && c.nodeValue.trim());
    let box = null;
    for (const t of own) {
      range.selectNodeContents(t);
      const b = range.getBoundingClientRect();
      if (b.width < 1 || b.height < 1) continue;
      box = box ? { left: Math.min(box.left, b.left), top: Math.min(box.top, b.top), right: Math.max(box.right, b.right), bottom: Math.max(box.bottom, b.bottom) } : { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    }
    if (!box) continue;
    box.width = box.right - box.left;
    box.height = box.bottom - box.top;
    texts.push({ el, box });
  }

  // ---- Overlaps (text/control against text/control) --------------------------------------------------
  const items = [
    ...controls.map((el) => ({ el, box: el.getBoundingClientRect(), control: true })),
    ...texts.filter((t) => !controlSet.has(t.el) && ![...controlSet].some((c) => c.contains(t.el))).map((t) => ({ ...t, control: false })),
  ].filter((i) => i.box.right > 0 && i.box.bottom > 0 && i.box.left < vw && i.box.top < vh);
  const overlaps = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const x = inter(a.box, b.box);
      if (x.width <= 2 || x.height <= 2) continue;
      const share = (x.width * x.height) / Math.min(area(a.box), area(b.box));
      if (share < 0.12) continue;
      const top = document.elementFromPoint((x.left + x.right) / 2, (x.top + x.bottom) / 2);
      if (top && !(a.el.contains(top) || b.el.contains(top) || top.contains(a.el) || top.contains(b.el))) continue;
      overlaps.push({ a: describe(a.el), b: describe(b.el), share: Math.round(share * 100) / 100, at: rectOf({ left: x.left, top: x.top, width: x.width, height: x.height }) });
    }
  }

  // ---- Controls that cannot be hit (something else is on top at their centre) -----------------------
  const covered = [];
  for (const el of controls) {
    if (el.closest('[inert]')) continue; // switched off on purpose (behind a modal): not a dead control
    const r = el.getBoundingClientRect();
    const cx = Math.min(vw - 1, Math.max(0, r.left + r.width / 2));
    const cy = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
    if (r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue;
    const top = document.elementFromPoint(cx, cy);
    if (top && top !== el && !el.contains(top) && !top.contains(el)) covered.push({ el: describe(el), by: describe(top) });
  }

  // ---- Out of the screen (not counting what a scroll container is meant to scroll) ------------------
  const outside = [];
  const folded = [];
  for (const { el, box } of [...controls.map((el) => ({ el, box: el.getBoundingClientRect() })), ...texts]) {
    const off = box.left < -1 || box.top < -1 || box.right > vw + 1 || box.bottom > vh + 1;
    if (!off) continue;
    if (scrollParent(el)) {
      if (controlSet.has(el)) folded.push(describe(el));
      continue;
    }
    outside.push({ el: describe(el), rect: rectOf(box) });
  }

  // ---- Clipped content -----------------------------------------------------------------------------
  const clipped = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    const cx = /(hidden|clip)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 1;
    const cy = /(hidden|clip)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1;
    if ((cx || cy) && (el.textContent || '').trim()) clipped.push({ el: describe(el), x: cx ? el.scrollWidth - el.clientWidth : 0, y: cy ? el.scrollHeight - el.clientHeight : 0 });
  }

  // ---- Tap targets ---------------------------------------------------------------------------------
  const small = [];
  const crowded = [];
  const hit = controls;
  for (const el of hit) {
    const r = el.getBoundingClientRect();
    if (r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue;
    if (Math.min(r.width, r.height) < targetSize - 0.5) small.push({ el: describe(el), size: `${Math.round(r.width)}x${Math.round(r.height)}` });
  }
  for (let i = 0; i < hit.length; i++) {
    for (let j = i + 1; j < hit.length; j++) {
      const a = hit[i].getBoundingClientRect();
      const b = hit[j].getBoundingClientRect();
      if (hit[i].contains(hit[j]) || hit[j].contains(hit[i])) continue;
      const dx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
      const dy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
      const gap = Math.hypot(dx, dy);
      const overlapping = inter(a, b).width > 0 && inter(a, b).height > 0;
      if (!overlapping && gap < 8 && (Math.min(a.width, a.height) < targetSize || Math.min(b.width, b.height) < targetSize)) crowded.push({ a: describe(hit[i]), b: describe(hit[j]), gap: Math.round(gap) });
    }
  }

  // ---- Text size and contrast ------------------------------------------------------------------------
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined || Number.isNaN(p[3]) ? 1 : p[3] };
  };
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const lum = ({ r, g, b }) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const tiny = [];
  const contrast = [];
  for (const { el } of texts) {
    const s = getComputedStyle(el);
    const px = parseFloat(s.fontSize);
    if (px < 12) tiny.push({ el: describe(el), px });
    let fg = parse(s.color);
    if (!fg) continue;
    let bg = null;
    let unknown = false;
    let opacity = 1;
    const layers = [];
    for (let p = el; p; p = p.parentElement) {
      const ps = getComputedStyle(p);
      opacity *= parseFloat(ps.opacity);
      if (ps.backgroundImage !== 'none') {
        unknown = true;
        break;
      }
      const c = parse(ps.backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 1) break;
      }
    }
    if (unknown || !layers.length || layers[layers.length - 1].a < 1) continue;
    bg = layers.reduceRight((under, c) => over(c, under));
    fg = over({ ...fg, a: fg.a * opacity }, bg);
    const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    const ratio = (l1 + 0.05) / (l2 + 0.05);
    const large = px >= 24 || (px >= 18.66 && Number(s.fontWeight) >= 700);
    const need = large ? contrastTarget * (3 / 4.5) : contrastTarget;
    if (ratio < need) contrast.push({ el: describe(el), ratio: Math.round(ratio * 10) / 10, need: Math.round(need * 10) / 10, aa: ratio >= (large ? 3 : 4.5) });
  }

  // ---- Density -------------------------------------------------------------------------------------
  const N = 48;
  const grid = new Set();
  for (const { box } of items) {
    const x0 = Math.max(0, Math.floor((box.left / vw) * N));
    const x1 = Math.min(N - 1, Math.floor((box.right / vw) * N));
    const y0 = Math.max(0, Math.floor((box.top / vh) * N));
    const y1 = Math.min(N - 1, Math.floor((box.bottom / vh) * N));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid.add(y * N + x);
  }
  const density = { controls: controls.length, textBlocks: texts.length, covered: Math.round((grid.size / (N * N)) * 100) };

  return { vw, vh, density, overlaps, covered, outside, folded, clipped, small, crowded, tiny, contrast };
}

mkdirSync(out, { recursive: true });
const browser = await pw.chromium.launch(args.get('channel') ? { channel: String(args.get('channel')) } : {});
const results = [];
for (const vp of viewports) {
  const touch = Math.min(vp.width, vp.height) <= 500;
  const context = await browser.newContext({
    viewport: vp,
    deviceScaleFactor: touch ? 2 : 1,
    hasTouch: touch,
    isMobile: touch,
    reducedMotion: args.get('reduced-motion') ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  let issues = [];
  page.on('console', (m) => m.type() === 'error' && issues.push(`console: ${m.text().slice(0, 160)}`));
  page.on('pageerror', (e) => issues.push(`pageerror: ${String(e).slice(0, 160)}`));
  page.on('requestfailed', (r) => issues.push(`request failed: ${r.url().slice(0, 100)}`));
  page.on('response', (r) => r.status() >= 400 && issues.push(`HTTP ${r.status()}: ${r.url().slice(0, 100)}`));
  const dir = `${out}/${vp.width}x${vp.height}`;
  mkdirSync(dir, { recursive: true });
  let last = '(start)';
  const capture = async (name, opts = {}) => {
    last = name;
    await page.waitForTimeout(opts.wait ?? 400);
    await page.screenshot({ path: `${dir}/${name}.png` });
    const m = await page.evaluate(audit, { targetSize, contrastTarget });
    results.push({ viewport: `${vp.width}x${vp.height}`, name, issues, ...m });
    issues = [];
    return m;
  };
  try {
    await scenario(page, capture, { url, viewport: vp, touch });
  } catch (e) {
    results.push({ viewport: `${vp.width}x${vp.height}`, name: `SCENARIO STOPPED after "${last}"`, error: String(e).split('\n')[0], issues });
    await page.screenshot({ path: `${dir}/_stopped.png` }).catch(() => {});
  }
  await context.close();
}
await browser.close();

// ---- Output ----------------------------------------------------------------------------------------------
writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
const n = (a) => (a ? a.length : 0);
const rows = ['| viewport | screen | controls | text | covered % | overlap | hidden ctl | outside | clipped | small tgt | crowded | tiny | contrast | issues |', '| --- | --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |'];
for (const r of results) {
  if (r.error) rows.push(`| ${r.viewport} | **${r.name}**: ${r.error} | | | | | | | | | | | | ${n(r.issues)} |`);
  else rows.push(`| ${r.viewport} | ${r.name} | ${r.density.controls} | ${r.density.textBlocks} | ${r.density.covered} | ${n(r.overlaps)} | ${n(r.covered)} | ${n(r.outside)} | ${n(r.clipped)} | ${n(r.small)} | ${n(r.crowded)} | ${n(r.tiny)} | ${n(r.contrast)} | ${n(r.issues)} |`);
}
const detail = [];
for (const r of results) {
  if (r.error) continue;
  const lines = [];
  for (const o of r.overlaps) lines.push(`- overlap ${Math.round(o.share * 100)}%: ${o.a}  x  ${o.b}  at ${JSON.stringify(o.at)}`);
  for (const c of r.covered) lines.push(`- covered: ${c.el}  under  ${c.by}`);
  for (const o of r.outside) lines.push(`- outside screen: ${o.el} ${JSON.stringify(o.rect)}`);
  for (const c of r.clipped) lines.push(`- clipped: ${c.el} (x ${c.x}px, y ${c.y}px hidden)`);
  for (const s of r.small) lines.push(`- small target: ${s.el} ${s.size}`);
  for (const c of r.crowded) lines.push(`- crowded targets (${c.gap}px): ${c.a}  |  ${c.b}`);
  for (const t of r.tiny) lines.push(`- tiny text ${t.px}px: ${t.el}`);
  for (const c of r.contrast) lines.push(`- contrast ${c.ratio}:1 (needs ${c.need}${c.aa ? ', passes AA' : ', fails AA'}): ${c.el}`);
  for (const i of r.issues) lines.push(`- ${i}`);
  if (r.folded?.length) lines.push(`- below the fold (scrollable): ${r.folded.slice(0, 6).join(' | ')}`);
  if (lines.length) detail.push(`### ${r.viewport} / ${r.name}\n${lines.join('\n')}`);
}
const md = `# UX probe\n\nURL ${url}, contrast target ${contrastTarget}:1, tap target ${targetSize}px\n\n${rows.join('\n')}\n\n${detail.join('\n\n')}\n`;
writeFileSync(`${out}/probe.md`, md);
console.log(md);
console.log(`Screenshots and results.json in ${out}`);

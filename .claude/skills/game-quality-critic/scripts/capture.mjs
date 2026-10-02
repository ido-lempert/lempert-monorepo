#!/usr/bin/env node
// Captures phone/desktop screenshots of a running browser game for a critic's review.
// Usage: node capture.mjs --url http://localhost:5175 --out DIR --shots "title:" --shots "play:window.__game.start(1)" ...
// Each --shots is "name:setup-expression"; the expression runs in the page, then the page settles (--wait ms) and
// screenshots are taken at each viewport. Needs `playwright` (uses the installed Chrome channel).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const get = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const all = (k) => args.flatMap((a, i) => (a === `--${k}` ? [args[i + 1]] : []));
const url = get('url', 'http://localhost:5175');
const out = get('out', './shots');
const wait = Number(get('wait', 2500));
const channel = get('channel', 'chrome');
const shots = all('shots').map((s) => { const i = s.indexOf(':'); return [s.slice(0, i), s.slice(i + 1)]; });
const views = { phone: [390, 844, 3, true], landscape: [844, 390, 3, true], desktop: [1440, 900, 1, false] };
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel });
for (const [vname, [w, h, dpr, mobile]] of Object.entries(views)) {
  for (const [name, setup] of shots.length ? shots : [['title', '']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`[${vname}/${name}] page error:`, e.message));
    await page.goto(url);
    await page.waitForTimeout(1500);
    if (setup) await page.evaluate(setup).catch((e) => console.log(`[${vname}/${name}] setup failed:`, e.message));
    await page.waitForTimeout(wait);
    await page.screenshot({ path: `${out}/${vname}-${name}.png` });
    await ctx.close();
  }
}
await browser.close();
console.log(`saved to ${out}`);

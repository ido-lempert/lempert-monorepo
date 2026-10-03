import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { handleScores, Scores } from './server/scores.ts';
import { ar } from './src/i18n/ar';
import { enGB } from './src/i18n/en-GB';
import { enUS } from './src/i18n/en-US';
import { es } from './src/i18n/es';
import { fr } from './src/i18n/fr';
import { LANGUAGES } from './src/i18n/langs';
import { ru } from './src/i18n/ru';
import { he } from './src/i18n/strings';

/** Serves the leaderboards API inside the Vite dev/preview server (in memory), so one port serves everything. */
const scoresServer = (): Plugin => {
  const scores = new Scores();
  return {
    name: 'smash-it-scores',
    configureServer(server) {
      server.middlewares.use((req, res, next) => handleScores(scores, req, res) || next());
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => handleScores(scores, req, res) || next());
    },
  };
};

/** Short commit id shown in the menu, so it's easy to tell which version is running. */
function appVersion(): string {
  const fromHost = (process.env.RENDER_GIT_COMMIT || process.env.RAILWAY_GIT_COMMIT_SHA)?.slice(0, 7);
  if (fromHost) return fromHost;
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * The public address, for link previews (Open Graph needs absolute URLs). Render and Railway provide it
 * while building; SITE_URL can override it. Without either, the tags fall back to relative paths.
 */
const railwayUrl = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '';
const siteUrl = (process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || railwayUrl).replace(/\/$/, '');
const siteUrlInHtml = (): Plugin => ({
  name: 'site-url',
  transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl),
});

/**
 * A plain page with the privacy policy in every language (privacy.html), for the App Store and Google Play,
 * which need a public address for it. The text comes from the game's own dictionaries, so they never differ.
 * PRIVACY_CONTACT (an e-mail address) is added as the contact line when it is set at build time.
 */
const privacyPage = (): Plugin => ({
  name: 'privacy-page',
  generateBundle() {
    const dicts = { he, 'en-US': enUS, 'en-GB': enGB, fr, ru, es, ar };
    const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const contact = (process.env.PRIVACY_CONTACT ?? '').trim();
    const sections = LANGUAGES.map(({ code, name, dir }) => {
      const d = dicts[code];
      return `<section id="${code}" lang="${code}" dir="${dir}"><h2>${esc(d.privacyTitle)} <small>${esc(name)}</small></h2><p>${esc(d.privacyBody)}</p></section>`;
    }).join('\n');
    const nav = LANGUAGES.map(({ code, name }) => `<a href="#${code}" lang="${code}">${esc(name)}</a>`).join(' · ');
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Smash It! – Privacy</title>
<style>:root{color-scheme:light dark;--bg:#fff7e8;--ink:#2a1d3d}@media(prefers-color-scheme:dark){:root{--bg:#1d1330;--ink:#fff3dc}}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--ink);font:18px/1.6 system-ui,sans-serif}
main{max-width:46rem;margin:0 auto}a{color:inherit;display:inline-block;padding:10px 4px;font-weight:700}
section{margin:2rem 0}h2 small{font-weight:400;font-size:.7em;opacity:.85}</style></head>
<body><main><h1>Smash It!</h1><nav>${nav}</nav>
${sections}
${contact ? `<p>Contact: <a href="mailto:${esc(contact)}">${esc(contact)}</a></p>` : ''}
</main></body></html>`;
    this.emitFile({ type: 'asset', fileName: 'privacy.html', source: html });
  },
});

/**
 * The Android download page (download.html): the installer (APK) lives in a GitHub release, so the page asks
 * the GitHub API for the newest `smash-it-v*` release and links its .apk (the repo hosts several products,
 * so "latest" can't be used). Texts come from the dictionaries, in the device's language.
 */
const REPO = 'ido-lempert/lempert-monorepo';
const downloadPage = (): Plugin => ({
  name: 'download-page',
  generateBundle() {
    const dicts = { he, 'en-US': enUS, 'en-GB': enGB, fr, ru, es, ar };
    const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const sections = LANGUAGES.map(({ code, dir }) => {
      const d = dicts[code];
      return `<section id="${code}" lang="${code}" dir="${dir}"><h1>${esc(d.dlTitle)}</h1><p>${esc(d.dlLead)}</p>
<p><a class="dl" href="https://github.com/${REPO}/releases">${esc(d.dlButton)}</a></p><p class="miss" hidden>${esc(d.dlMissing)}</p>
<ol><li>${esc(d.dlStep1)}</li><li>${esc(d.dlStep2)}</li><li>${esc(d.dlStep3)}</li></ol><p><a href="./">${esc(d.dlWeb)}</a></p></section>`;
    }).join('\n');
    const nav = LANGUAGES.map(({ code, name }) => `<a href="#${code}" lang="${code}" data-lang="${code}">${esc(name)}</a>`).join(' · ');
    const codes = JSON.stringify(LANGUAGES.map((l) => l.code));
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Smash It! – Android</title>
<style>:root{color-scheme:light dark;--bg:#fff7e8;--ink:#2a1d3d;--btn:#ffd23f}@media(prefers-color-scheme:dark){:root{--bg:#1d1330;--ink:#fff3dc}}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--ink);font:18px/1.6 system-ui,sans-serif}
main{max-width:34rem;margin:0 auto}nav a{display:inline-block;padding:10px 4px;font-weight:700;color:inherit}
a.dl{display:inline-block;min-height:44px;padding:14px 22px;border-radius:999px;background:var(--btn);color:#2a1d3d;font-weight:800;text-decoration:none}
section{margin:1.5rem 0}li{margin:.4rem 0}</style></head>
<body><main><nav>${nav}</nav>
${sections}
</main><script>
(function(){var codes=${codes},api='https://api.github.com/repos/${REPO}/releases?per_page=30';
function pick(){var l=(navigator.language||'en').toLowerCase();if(l==='en-gb'||l==='en-au'||l==='en-nz'||l==='en-ie')return 'en-GB';
for(var i=0;i<codes.length;i++)if(l.split('-')[0]===codes[i].toLowerCase().split('-')[0]&&codes[i].indexOf('en-')!==0)return codes[i];return 'en-US';}
function show(c){codes.forEach(function(k){document.getElementById(k).hidden=k!==c;});document.documentElement.lang=c;}
show(location.hash.slice(1)&&codes.indexOf(location.hash.slice(1))>=0?location.hash.slice(1):pick());
document.querySelectorAll('nav a').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();show(a.dataset.lang);});});
fetch(api).then(function(r){return r.json();}).then(function(rs){
var rel=rs.filter(function(r){return /^smash-it-v/.test(r.tag_name)&&!r.draft&&!r.prerelease;})[0];
var asset=rel&&rel.assets.filter(function(a){return /\.apk$/.test(a.name);})[0];
if(!asset)throw 0;document.querySelectorAll('a.dl').forEach(function(a){a.href=asset.browser_download_url;});
}).catch(function(){document.querySelectorAll('.miss').forEach(function(p){p.hidden=false;});});
})();
</script></body></html>`;
    this.emitFile({ type: 'asset', fileName: 'download.html', source: html });
  },
});

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  plugins: [
    scoresServer(),
    siteUrlInHtml(),
    privacyPage(),
    downloadPage(),
    VitePWA({
      // main.ts offers an "Update" button instead of reloading mid-level.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'models/kenney-food/Textures/colormap.png'],
      manifest: {
        id: './',
        name: 'Smash It!',
        short_name: 'Smash It',
        description: 'A 3D slingshot game for kids: fling food at goofy bugs, stack combos and unlock new snacks.',
        lang: 'en',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffb84d',
        theme_color: '#ffb84d',
        categories: ['games', 'kids'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // Every model and sound is procedural, so precaching the bundle makes the whole game playable offline.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2,glb}'],
        navigateFallback: 'index.html',
        // The leaderboards are live: never answered from the cache.
        navigateFallbackDenylist: [/^\/api\//, /\/privacy\.html$/, /\/download\.html$/],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  // host: true exposes the dev server on the LAN for phone testing. 5175 so it can run next to the other games.
  server: { host: true, port: 5175, allowedHosts: true },
  preview: { host: true, port: 4175, allowedHosts: true },
});

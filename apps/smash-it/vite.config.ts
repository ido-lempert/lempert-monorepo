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

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  plugins: [
    scoresServer(),
    siteUrlInHtml(),
    privacyPage(),
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
        navigateFallbackDenylist: [/^\/api\//, /\/privacy\.html$/],
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

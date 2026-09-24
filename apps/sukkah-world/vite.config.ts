import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/** Short commit id shown in the menu, so it's easy to tell which version is running. */
function appVersion(): string {
  const fromRender = process.env.RENDER_GIT_COMMIT?.slice(0, 7);
  if (fromRender) return fromRender;
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * The public address, for link previews (Open Graph needs absolute URLs). Render provides it while
 * building; SITE_URL can override it. Without either, the tags fall back to relative paths.
 */
const siteUrl = (process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
const siteUrlInHtml = (): Plugin => ({
  name: 'site-url',
  transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl),
});

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  plugins: [
    siteUrlInHtml(),
    VitePWA({
      // A new version takes over as soon as it is installed; main.ts offers an "Update" button instead of reloading mid-play.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'Sukkah World · עולם הסוכה',
        short_name: 'עולם הסוכה',
        description: 'עולם תלת־ממדי של סוכות: בונים סוכה, פוגשים אושפיזין ומשחקים.',
        lang: 'he',
        dir: 'rtl',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#3aa0ff',
        theme_color: '#3aa0ff',
        categories: ['games', 'kids', 'education'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // Everything is procedural, so precaching the bundle makes the whole world playable offline.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  // host: true exposes the dev server on the LAN for phone testing. 5174 so it can run next to mancala.
  server: { host: true, port: 5174, allowedHosts: true },
  preview: { host: true, port: 4174, allowedHosts: true },
});

import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/** Short commit id shown in the menu, so it's easy to tell which version is running. */
function appVersion(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  plugins: [
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
        background_color: '#16324a',
        theme_color: '#16324a',
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
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
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

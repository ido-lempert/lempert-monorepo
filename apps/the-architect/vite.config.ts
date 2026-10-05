import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
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

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg'],
      manifest: {
        id: './',
        name: 'The Architect · הארכיטקט',
        short_name: 'הארכיטקט',
        description: 'משחק שמלמד ארכיטקטורת תוכנה: מנהלים מסעדה בערב לחוץ, מוצאים את הבאג ופותרים אותו עם הפתרונות של התעשייה.',
        lang: 'he',
        dir: 'rtl',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#2a1f1a',
        theme_color: '#2a1f1a',
        categories: ['games', 'education'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // The models are precached with the bundle, so the whole game plays offline.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2,glb,gltf,bin}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  // host: true exposes the dev server on the LAN for phone testing. 5177 so it can run next to the other games.
  server: { host: true, port: 5177, allowedHosts: true },
  preview: { host: true, port: 4177, allowedHosts: true },
});

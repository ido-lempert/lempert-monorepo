import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { attachGameServer } from './server/attach.ts';
import { Fame, handleFame } from './server/fame.ts';

/** Runs the multiplayer WebSocket server inside the Vite dev/preview server, so one port serves everything. */
const gameServer = (): Plugin => {
  const fame = new Fame(); // in memory during development
  return {
    name: 'mancala-game-server',
    configureServer(server) {
      if (server.httpServer) attachGameServer(server.httpServer as import('node:http').Server, fame);
      server.middlewares.use((req, res, next) => handleFame(fame, req, res) || next());
    },
    configurePreviewServer(server) {
      attachGameServer(server.httpServer as import('node:http').Server, fame);
      server.middlewares.use((req, res, next) => handleFame(fame, req, res) || next());
    },
  };
};

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
    gameServer(),
    VitePWA({
      // A new version takes over as soon as it is installed (skipWaiting/clientsClaim below) so installed
      // apps never get stuck on an old one; main.ts then offers an "Update" button instead of reloading mid-game.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'Mancala · מנקלה',
        short_name: 'Mancala',
        description: 'Mancala in 3D – play against the computer, on one device, or online with a friend.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#1b1e2b',
        theme_color: '#1b1e2b',
        categories: ['games'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // Precache the whole game so it works offline (vs computer / same device).
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/ws/, /^\/api\//],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  // host: true exposes the dev server on the LAN; allowedHosts lets tunnels (ngrok) reach it for remote play.
  server: { host: true, port: 5173, allowedHosts: true },
  preview: { host: true, port: 4173, allowedHosts: true },
});

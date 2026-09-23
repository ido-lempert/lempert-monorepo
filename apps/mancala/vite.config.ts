import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { attachGameServer } from './server/attach.ts';

/** Runs the multiplayer WebSocket server inside the Vite dev/preview server, so one port serves everything. */
const gameServer = (): Plugin => ({
  name: 'mancala-game-server',
  configureServer(server) {
    if (server.httpServer) attachGameServer(server.httpServer as import('node:http').Server);
  },
  configurePreviewServer(server) {
    attachGameServer(server.httpServer as import('node:http').Server);
  },
});

export default defineConfig({
  base: './',
  plugins: [
    gameServer(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
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
        navigateFallbackDenylist: [/^\/ws/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  // host: true exposes the dev server on the LAN; allowedHosts lets tunnels (ngrok) reach it for remote play.
  server: { host: true, port: 5173, allowedHosts: true },
  preview: { host: true, port: 4173, allowedHosts: true },
});

import { defineConfig, type Plugin } from 'vite';
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
  plugins: [gameServer()],
  // host: true exposes the dev server on the LAN; allowedHosts lets tunnels (ngrok) reach it for remote play.
  server: { host: true, port: 5173, allowedHosts: true },
  preview: { host: true, port: 4173, allowedHosts: true },
});

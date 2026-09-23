import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // host: true exposes the dev server on the LAN so the game can be tried on a phone.
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});

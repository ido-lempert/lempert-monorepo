/**
 * Production server: serves the built game from `dist/` and the multiplayer WebSocket on one port.
 * Run with `npm run start` after `npm run build`. PORT defaults to 8080.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { attachGameServer } from './attach.ts';
import { Fame, handleFame } from './fame.ts';

const DIST = join(import.meta.dirname, '..', 'dist');
const PORT = Number(process.env.PORT ?? 8080);
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

// The wall of fame is saved next to the app by default; FAME_FILE can point at a persistent disk.
const fame = new Fame(process.env.FAME_FILE ?? join(import.meta.dirname, '..', '.data', 'fame.json'));

const server = createServer((req, res) => {
  if (handleFame(fame, req, res)) return;
  const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, path);
  const found = file.startsWith(DIST) && existsSync(file) && !statSync(file).isDirectory();
  if (!found) {
    // A missing file (e.g. an asset from an older build) is a real 404; only page routes get the app.
    if (extname(path) && extname(path) !== '.html') {
      res.writeHead(404, { 'content-type': 'text/plain', 'cache-control': 'no-cache' });
      res.end('Not found');
      return;
    }
    file = join(DIST, 'index.html');
  }
  const hashed = file.includes(`${join(DIST, 'assets')}`);
  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
});

attachGameServer(server, fame);
server.listen(PORT, () => console.log(`Mancala on http://localhost:${PORT}`));

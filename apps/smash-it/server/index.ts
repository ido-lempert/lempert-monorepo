/**
 * Production server: serves the built game from `dist/` and the leaderboards API on one port.
 * Run with `npm run start` after `npm run build`. PORT defaults to 8080.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { handleScores, Scores } from './scores.ts';
import { storeFromEnv } from './scoresStore.ts';

const DIST = join(import.meta.dirname, '..', 'dist');
const PORT = Number(process.env.PORT ?? 8080);
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

// Kept in Turso when TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN) is set; otherwise in a JSON file next to
// the app (SCORES_FILE can point at a persistent disk).
const scores = new Scores(storeFromEnv(process.env, join(import.meta.dirname, '..', '.data', 'scores.json')));

const server = createServer((req, res) => {
  if (handleScores(scores, req, res)) return;
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
    // The page and the service worker must never be cached, or installed apps get stuck on an old version.
    'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
});

server.listen(PORT, () => console.log(`Smash It on http://localhost:${PORT}`));

// Render stops the old instance with SIGTERM on every deploy: save the latest results first.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => void scores.flush().finally(() => process.exit(0)));
}

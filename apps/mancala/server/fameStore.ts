import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createClient } from '@libsql/client';
import type { FameEntry, FameStore } from './fame.ts';

/** Keeps the whole list in a JSON file (lost on redeploy unless the file is on a persistent disk). */
export function fileStore(file: string): FameStore {
  return {
    async load() {
      try {
        return JSON.parse(await readFile(file, 'utf8')) as FameEntry[];
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []; // no saved list yet
        throw err;
      }
    },
    async save(_changed, all) {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(`${file}.tmp`, JSON.stringify(all));
      await rename(`${file}.tmp`, file);
    },
  };
}

/** Keeps the list in a Turso (libSQL) database, one row per player. */
export function tursoStore(url: string, authToken?: string): FameStore {
  // HTTP rather than a WebSocket: every query stands alone, so nothing goes stale while the server idles.
  const db = createClient({ url: url.replace(/^libsql:/, 'https:'), authToken });
  let table: Promise<unknown> | null = null;
  const ensureTable = () =>
    (table ??= db
      .execute(
        `CREATE TABLE IF NOT EXISTS fame (
          key TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          wins INTEGER NOT NULL,
          computer INTEGER NOT NULL,
          online INTEGER NOT NULL,
          last INTEGER NOT NULL
        )`,
      )
      .catch((err) => {
        table = null; // try again next time
        throw err;
      }));
  return {
    async load() {
      await ensureTable();
      const { rows } = await db.execute('SELECT name, wins, computer, online, last FROM fame');
      return rows.map((r) => ({
        name: String(r.name),
        wins: Number(r.wins),
        computer: Number(r.computer),
        online: Number(r.online),
        last: Number(r.last),
      }));
    },
    async save(added) {
      await ensureTable();
      // Adds the new wins to the row, so servers running side by side never overwrite each other.
      await db.batch(
        added.map(([key, e]) => ({
          sql: `INSERT INTO fame (key, name, wins, computer, online, last) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET name = excluded.name, wins = wins + excluded.wins,
                  computer = computer + excluded.computer, online = online + excluded.online,
                  last = max(last, excluded.last)`,
          args: [key, e.name, e.wins, e.computer, e.online, e.last],
        })),
        'write',
      );
    },
  };
}

/** Turso when TURSO_DATABASE_URL is set (with TURSO_AUTH_TOKEN), otherwise the JSON file. */
export function storeFromEnv(env: NodeJS.ProcessEnv, defaultFile: string): FameStore {
  if (env.TURSO_DATABASE_URL) return tursoStore(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
  return fileStore(env.FAME_FILE ?? defaultFile);
}

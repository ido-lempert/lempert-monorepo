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
  const db = createClient({ url, authToken });
  const table = db.execute(
    `CREATE TABLE IF NOT EXISTS fame (
      key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      wins INTEGER NOT NULL,
      computer INTEGER NOT NULL,
      online INTEGER NOT NULL,
      last INTEGER NOT NULL
    )`,
  );
  return {
    async load() {
      await table;
      const { rows } = await db.execute('SELECT name, wins, computer, online, last FROM fame');
      return rows.map((r) => ({
        name: String(r.name),
        wins: Number(r.wins),
        computer: Number(r.computer),
        online: Number(r.online),
        last: Number(r.last),
      }));
    },
    async save(changed) {
      await table;
      await db.batch(
        changed.map(([key, e]) => ({
          sql: `INSERT INTO fame (key, name, wins, computer, online, last) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET name = excluded.name, wins = excluded.wins,
                  computer = excluded.computer, online = excluded.online, last = excluded.last`,
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

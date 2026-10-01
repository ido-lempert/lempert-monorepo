import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createClient } from '@libsql/client';
import type { DailyRow, PlayerRow, ScoreStore } from './scores.ts';

/** Keeps everything in a JSON file (lost on redeploy unless the file is on a persistent disk). */
export function fileStore(file: string): ScoreStore {
  let all: { players: PlayerRow[]; daily: DailyRow[] } = { players: [], daily: [] };
  return {
    async load(since) {
      try {
        all = JSON.parse(await readFile(file, 'utf8'));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err; // no saved scores yet is fine
      }
      return { players: all.players, daily: all.daily.filter((d) => d.date >= since) };
    },
    async save(players, daily) {
      const byId = new Map(all.players.map((p) => [p.id, p]));
      for (const p of players) {
        const e = byId.get(p.id);
        byId.set(p.id, e ? { ...p, stars: Math.max(e.stars, p.stars), chapter: Math.max(e.chapter, p.chapter) } : p);
      }
      const byDay = new Map(all.daily.map((d) => [`${d.date}|${d.id}`, d]));
      for (const d of daily) {
        const e = byDay.get(`${d.date}|${d.id}`);
        if (!e || d.score >= e.score) byDay.set(`${d.date}|${d.id}`, d);
      }
      const recent = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
      all = { players: [...byId.values()], daily: [...byDay.values()].filter((d) => d.date >= recent) };
      await write();
    },
    async remove(id) {
      all = { players: all.players.filter((p) => p.id !== id), daily: all.daily.filter((d) => d.id !== id) };
      await write();
    },
  };
  async function write() {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(`${file}.tmp`, JSON.stringify(all));
    await rename(`${file}.tmp`, file);
  }
}

/** Keeps the boards in a Turso (libSQL) database: one row per player, one per player per day. */
export function tursoStore(url: string, authToken?: string): ScoreStore {
  // HTTP rather than a WebSocket: every query stands alone, so nothing goes stale while the server idles.
  const db = createClient({ url: url.replace(/^libsql:/, 'https:'), authToken });
  let tables: Promise<unknown> | null = null;
  const ensureTables = () =>
    (tables ??= db
      .batch(
        [
          `CREATE TABLE IF NOT EXISTS smash_players (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, stars INTEGER NOT NULL, chapter INTEGER NOT NULL, last INTEGER NOT NULL
          )`,
          `CREATE TABLE IF NOT EXISTS smash_daily (
            date TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, score INTEGER NOT NULL, PRIMARY KEY (date, id)
          )`,
        ],
        'write',
      )
      .catch((err) => {
        tables = null; // try again next time
        throw err;
      }));
  return {
    async load(since) {
      await ensureTables();
      const players = await db.execute('SELECT id, name, stars, chapter, last FROM smash_players');
      const daily = await db.execute({ sql: 'SELECT date, id, name, score FROM smash_daily WHERE date >= ?', args: [since] });
      return {
        players: players.rows.map((r) => ({ id: String(r.id), name: String(r.name), stars: Number(r.stars), chapter: Number(r.chapter), last: Number(r.last) })),
        daily: daily.rows.map((r) => ({ date: String(r.date), id: String(r.id), name: String(r.name), score: Number(r.score) })),
      };
    },
    async save(players, daily) {
      await ensureTables();
      // Upserts that keep the higher numbers, so servers running side by side never lower anything.
      await db.batch(
        [
          ...players.map((p) => ({
            sql: `INSERT INTO smash_players (id, name, stars, chapter, last) VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET name = excluded.name, stars = max(stars, excluded.stars),
                    chapter = max(chapter, excluded.chapter), last = max(last, excluded.last)`,
            args: [p.id, p.name, p.stars, p.chapter, p.last],
          })),
          ...daily.map((d) => ({
            sql: `INSERT INTO smash_daily (date, id, name, score) VALUES (?, ?, ?, ?)
                  ON CONFLICT(date, id) DO UPDATE SET name = excluded.name, score = max(score, excluded.score)`,
            args: [d.date, d.id, d.name, d.score],
          })),
        ],
        'write',
      );
    },
    async remove(id) {
      await ensureTables();
      await db.batch(
        [
          { sql: 'DELETE FROM smash_players WHERE id = ?', args: [id] },
          { sql: 'DELETE FROM smash_daily WHERE id = ?', args: [id] },
        ],
        'write',
      );
    },
  };
}

/** Turso when TURSO_DATABASE_URL is set (with TURSO_AUTH_TOKEN), otherwise the JSON file. */
export function storeFromEnv(env: NodeJS.ProcessEnv, defaultFile: string): ScoreStore {
  if (env.TURSO_DATABASE_URL) return tursoStore(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
  return fileStore(env.SCORES_FILE ?? defaultFile);
}

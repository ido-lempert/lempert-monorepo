import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Leaderboards, on the honour system (the game reports its own results):
 * - all time: players by total stars, then by the furthest chapter;
 * - the daily challenge: today's best scores (every day starts empty).
 * Players are known by a random id kept in their browser and a nickname; nothing else is stored.
 * Kept in memory and, when a store is given, saved there (see `scoresStore.ts`).
 */

export interface PlayerRow {
  id: string;
  name: string;
  stars: number;
  chapter: number;
  /** Time of the latest report (ms since epoch). */
  last: number;
}

export interface DailyRow {
  date: string;
  id: string;
  name: string;
  score: number;
}

export interface Report {
  id: string;
  name: string;
  stars: number;
  chapter: number;
  daily?: { date: string; score: number };
}

/** Where scores are kept between restarts. Saves are upserts that keep the higher value, so two servers running side by side during a deploy never lower anything. */
export interface ScoreStore {
  load(since: string): Promise<{ players: PlayerRow[]; daily: DailyRow[] }>;
  save(players: PlayerRow[], daily: DailyRow[]): Promise<void>;
  /** Deletes everything about a player (they chose to leave the boards). */
  remove(id: string): Promise<void>;
}

export const SCORES_PATH = '/api/scores';
const MAX_REPORTS_PER_HOUR = 60;
const LOAD_TIMEOUT = 10_000;
const RETRY_DELAYS = [5_000, 30_000, 120_000];
/** Results beyond these can't come from the game. */
const MAX_STARS = 300;
const MAX_CHAPTER = 100;
const MAX_DAILY = 500_000;
/** Daily boards older than this are dropped from memory. */
const KEEP_DAYS = 3;

/** A nickname: trimmed, no control characters, at most 14 characters. */
export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return [...raw.normalize('NFKC').replace(/[\p{C}<>]/gu, '').trim()].slice(0, 14).join('');
}

const isDate = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const whole = (n: unknown, max: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(max, Math.floor(n))) : 0);

/** Parses a report from the game, or null if it doesn't make sense. */
export function parseReport(raw: unknown): Report | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = cleanName(r.name);
  if (typeof r.id !== 'string' || !/^[a-z0-9-]{8,40}$/i.test(r.id) || !name) return null;
  const report: Report = { id: r.id, name, stars: whole(r.stars, MAX_STARS), chapter: whole(r.chapter, MAX_CHAPTER) };
  const d = r.daily as Record<string, unknown> | undefined;
  if (d && isDate(d.date)) report.daily = { date: d.date, score: whole(d.score, MAX_DAILY) };
  return report;
}

export class Scores {
  private players = new Map<string, PlayerRow>();
  /** date → id → row */
  private daily = new Map<string, Map<string, DailyRow>>();
  private pendingPlayers = new Map<string, PlayerRow>();
  private pendingDaily = new Map<string, DailyRow>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private reports = new Map<string, number[]>();
  private store: ScoreStore | null;
  private loaded: boolean;
  /** Resolves once the saved scores have been loaded. */
  readonly ready: Promise<void>;

  constructor(store: ScoreStore | null = null, today = new Date()) {
    this.store = store;
    this.loaded = !store;
    this.ready = store ? this.load(store, today) : Promise.resolve();
  }

  /** Loads the saved scores, retrying while the store is unreachable; nothing is saved until it succeeds. */
  private async load(store: ScoreStore, today: Date) {
    const since = new Date(today.getTime() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
    for (let attempt = 0; ; attempt++) {
      try {
        const saved = await Promise.race([
          store.load(since),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out')), LOAD_TIMEOUT).unref?.()),
        ]);
        for (const p of saved.players) this.mergePlayer(this.players, p);
        for (const d of saved.daily) this.mergeDaily(d);
        this.loaded = true;
        console.log(`Leaderboards: loaded ${saved.players.length} players`);
        if (this.pendingPlayers.size || this.pendingDaily.size) this.scheduleSave();
        return;
      } catch (err) {
        const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
        console.error(`Could not load leaderboards; trying again in ${delay / 1000}s`, err);
        await new Promise((r) => setTimeout(r, delay).unref?.());
      }
    }
  }

  /** Keeps the best of an existing row and a new one (the latest name wins). */
  private mergePlayer(map: Map<string, PlayerRow>, p: PlayerRow) {
    const e = map.get(p.id);
    if (!e) {
      map.set(p.id, { ...p });
      return;
    }
    e.stars = Math.max(e.stars, p.stars);
    e.chapter = Math.max(e.chapter, p.chapter);
    if (p.last >= e.last) {
      e.name = p.name;
      e.last = p.last;
    }
  }

  private mergeDaily(d: DailyRow) {
    let day = this.daily.get(d.date);
    if (!day) this.daily.set(d.date, (day = new Map()));
    const e = day.get(d.id);
    if (!e || d.score > e.score) day.set(d.id, { ...d });
    else e.name = d.name;
  }

  record(r: Report, now = Date.now()) {
    const row: PlayerRow = { id: r.id, name: r.name, stars: r.stars, chapter: r.chapter, last: now };
    this.mergePlayer(this.players, row);
    this.mergePlayer(this.pendingPlayers, row);
    if (r.daily) {
      const d: DailyRow = { date: r.daily.date, id: r.id, name: r.name, score: r.daily.score };
      this.mergeDaily(d);
      const k = `${d.date}|${d.id}`;
      const p = this.pendingDaily.get(k);
      if (!p || d.score >= p.score) this.pendingDaily.set(k, d);
      // Forget old days.
      const cutoff = new Date(now - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
      for (const date of this.daily.keys()) if (date < cutoff) this.daily.delete(date);
    }
    this.scheduleSave();
  }

  /** Takes a player off every board, here and in the store. */
  async remove(id: string) {
    this.players.delete(id);
    this.pendingPlayers.delete(id);
    for (const day of this.daily.values()) day.delete(id);
    for (const k of [...this.pendingDaily.keys()]) if (k.endsWith(`|${id}`)) this.pendingDaily.delete(k);
    await this.ready;
    await this.store?.remove(id);
  }

  /** The all-time board: most stars, then the furthest chapter. */
  topPlayers(n = 20): PlayerRow[] {
    return [...this.players.values()].sort((a, b) => b.stars - a.stars || b.chapter - a.chapter || a.last - b.last).slice(0, n);
  }

  topDaily(date: string, n = 20): DailyRow[] {
    return [...(this.daily.get(date)?.values() ?? [])].sort((a, b) => b.score - a.score).slice(0, n);
  }

  /** A player's place (1-based) on each board, or null. */
  rank(id: string, date: string): { all: number | null; daily: number | null } {
    const all = this.topPlayers(Infinity).findIndex((p) => p.id === id);
    const daily = this.topDaily(date, Infinity).findIndex((p) => p.id === id);
    return { all: all < 0 ? null : all + 1, daily: daily < 0 ? null : daily + 1 };
  }

  /** Simple per-address limit on reports. */
  allowReport(ip: string, now = Date.now()): boolean {
    const recent = (this.reports.get(ip) ?? []).filter((t) => now - t < 60 * 60 * 1000);
    if (recent.length >= MAX_REPORTS_PER_HOUR) return false;
    recent.push(now);
    this.reports.set(ip, recent);
    return true;
  }

  private scheduleSave() {
    if (!this.store || !this.loaded || this.saveTimer) return;
    this.saveTimer = setTimeout(() => void this.flush(), 2000);
  }

  /** Saves pending results now (also called on shutdown, so a redeploy doesn't lose the latest). */
  async flush() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (!this.store || !this.loaded || (!this.pendingPlayers.size && !this.pendingDaily.size)) return;
    const players = [...this.pendingPlayers.values()];
    const daily = [...this.pendingDaily.values()];
    this.pendingPlayers.clear();
    this.pendingDaily.clear();
    try {
      await this.store.save(players, daily);
    } catch (err) {
      console.error('Could not save leaderboards', err);
      // Put them back and try again with the next report.
      for (const p of players) this.mergePlayer(this.pendingPlayers, p);
      for (const d of daily) {
        const k = `${d.date}|${d.id}`;
        const p = this.pendingDaily.get(k);
        if (!p || d.score > p.score) this.pendingDaily.set(k, d);
      }
    }
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(status === 204 ? undefined : JSON.stringify(body));
}

/**
 * HTTP API on SCORES_PATH:
 *   GET ?date=YYYY-MM-DD&id=…  → { all: [{ name, stars, chapter, me? }], daily: [{ name, score, me? }], rank }
 *   POST { id, name, stars, chapter, daily?: { date, score } } → 204
 *   DELETE ?id=…  → 204 (leaves the boards)
 * Ids never leave the server: rows only say whether they are the asker's own (`me`).
 * Returns false for requests that are not for the API.
 */
export function handleScores(scores: Scores, req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname !== SCORES_PATH) return false;
  if (req.method === 'GET') {
    const date = url.searchParams.get('date') ?? '';
    const id = url.searchParams.get('id') ?? '';
    // Right after a (cold) start the saved scores may still be loading: wait for them briefly.
    const wait = new Promise((r) => setTimeout(r, 5000).unref?.());
    void Promise.race([scores.ready, wait]).then(() =>
      send(res, 200, {
        all: scores.topPlayers().map((p) => ({ name: p.name, stars: p.stars, chapter: p.chapter, me: p.id === id || undefined })),
        daily: isDate(date) ? scores.topDaily(date).map((d) => ({ name: d.name, score: d.score, me: d.id === id || undefined })) : [],
        rank: scores.rank(id, date),
      }),
    );
    return true;
  }
  if (req.method === 'DELETE') {
    const id = url.searchParams.get('id') ?? '';
    if (!/^[a-z0-9-]{8,40}$/i.test(id)) send(res, 400, { error: 'invalid' });
    else
      scores.remove(id).then(
        () => send(res, 204, null),
        () => send(res, 500, { error: 'store' }),
      );
    return true;
  }
  if (req.method !== 'POST') {
    send(res, 405, { error: 'method' });
    return true;
  }
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 1024) req.destroy();
  });
  req.on('end', () => {
    const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
    let report: Report | null = null;
    try {
      report = parseReport(JSON.parse(body));
    } catch {
      return send(res, 400, { error: 'json' });
    }
    if (!report) return send(res, 400, { error: 'invalid' });
    if (!scores.allowReport(ip)) return send(res, 429, { error: 'rate' });
    scores.record(report);
    send(res, 204, null);
  });
  return true;
}

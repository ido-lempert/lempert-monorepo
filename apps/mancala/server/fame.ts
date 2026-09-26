import type { IncomingMessage, ServerResponse } from 'node:http';

export type WinKind = 'computer' | 'online';

export interface FameEntry {
  name: string;
  wins: number;
  computer: number;
  online: number;
  /** Time of the latest win (ms since epoch). */
  last: number;
}

export const FAME_PATH = '/api/fame';
const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const MAX_REPORTS_PER_HOUR = 20;

const key = (name: string) => name.normalize('NFKC').trim().toLowerCase();

/** Where the wall of fame is kept between restarts (a JSON file or a Turso database, see `fameStore.ts`). */
export interface FameStore {
  load(): Promise<FameEntry[]>;
  /**
   * Saves new wins. `added` holds, per player, only the wins since the last save (so two servers
   * running side by side during a deploy add up instead of overwriting each other); `all` is the
   * whole list, for stores that rewrite everything.
   */
  save(added: Array<[key: string, wins: FameEntry]>, all: FameEntry[]): Promise<void>;
}

const LOAD_TIMEOUT = 10_000;
const RETRY_DELAYS = [5_000, 30_000, 120_000];

/**
 * Wall of fame: players ranked by number of wins. Online wins are recorded by the server itself;
 * wins against the computer are reported by the browser (so they are on the honour system).
 * Kept in memory and, when a store is given, saved there – the list may be reset at any time.
 */
export class Fame {
  private entries = new Map<string, FameEntry>();
  /** Wins not saved yet, per player. */
  private pending = new Map<string, FameEntry>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private reports = new Map<string, number[]>();
  private store: FameStore | null;
  private loaded = false;
  /** Resolves once the saved list has been loaded (wins recorded before that are merged in). */
  readonly ready: Promise<void>;

  constructor(store: FameStore | null = null) {
    this.store = store;
    this.loaded = !store;
    this.ready = store ? this.load(store) : Promise.resolve();
  }

  /** Loads the saved list, retrying while the store is unreachable; nothing is saved until it succeeds. */
  private async load(store: FameStore) {
    for (let attempt = 0; ; attempt++) {
      try {
        const saved = await Promise.race([
          store.load(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out')), LOAD_TIMEOUT).unref?.()),
        ]);
        this.merge(saved);
        this.loaded = true;
        console.log(`Wall of fame: loaded ${saved.length} players`);
        if (this.pending.size) this.scheduleSave();
        return;
      } catch (err) {
        const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
        console.error(`Could not load wall of fame; trying again in ${delay / 1000}s`, err);
        await new Promise((r) => setTimeout(r, delay).unref?.());
      }
    }
  }

  record(rawName: string, kind: WinKind, now = Date.now()) {
    const name = rawName.trim().slice(0, 14);
    if (!name) return;
    const k = key(name);
    for (const map of [this.entries, this.pending]) {
      const e = map.get(k) ?? { name, wins: 0, computer: 0, online: 0, last: 0 };
      e.name = name; // latest spelling wins
      e.wins++;
      e[kind]++;
      e.last = now;
      map.set(k, e);
    }
    this.scheduleSave();
  }

  top(n = 50): FameEntry[] {
    return [...this.entries.values()].sort((a, b) => b.wins - a.wins || b.last - a.last).slice(0, n);
  }

  /** Simple per-address limit on self-reported wins. */
  allowReport(ip: string, now = Date.now()): boolean {
    const recent = (this.reports.get(ip) ?? []).filter((t) => now - t < 60 * 60 * 1000);
    if (recent.length >= MAX_REPORTS_PER_HOUR) return false;
    recent.push(now);
    this.reports.set(ip, recent);
    return true;
  }

  /** Adds saved entries to the list, keeping any wins recorded while they were loading. */
  private merge(saved: FameEntry[]) {
    for (const s of saved) {
      const k = key(s.name);
      const e = this.entries.get(k);
      if (!e) {
        this.entries.set(k, { ...s });
        continue;
      }
      e.wins += s.wins;
      e.computer += s.computer;
      e.online += s.online;
      if (s.last > e.last) {
        e.last = s.last;
        e.name = s.name;
      }
    }
  }

  private scheduleSave() {
    if (!this.store || !this.loaded || this.saveTimer) return;
    this.saveTimer = setTimeout(() => void this.flush(), 2000);
  }

  /**
   * Saves pending wins now (also called on shutdown, so a redeploy does not lose the last ones).
   * Before the saved list has loaded nothing is written, so it is never overwritten.
   */
  async flush() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (!this.store || !this.loaded || !this.pending.size) return;
    const added = [...this.pending];
    this.pending.clear();
    try {
      await this.store.save(added, this.top(500));
    } catch (err) {
      console.error('Could not save wall of fame', err);
      for (const [k, a] of added) {
        // Put the wins back (adding any recorded meanwhile) and try again with the next win.
        const p = this.pending.get(k);
        this.pending.set(k, p ? { ...p, wins: p.wins + a.wins, computer: p.computer + a.computer, online: p.online + a.online } : a);
      }
    }
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

/**
 * HTTP API: GET returns the ranking; POST { name, difficulty } reports a win against the computer.
 * Returns false for requests that are not for the API.
 */
export function handleFame(fame: Fame, req: IncomingMessage, res: ServerResponse): boolean {
  if (new URL(req.url ?? '/', 'http://x').pathname !== FAME_PATH) return false;
  if (req.method === 'GET') {
    // Right after a (cold) start the saved list may still be loading: wait for it briefly.
    const wait = new Promise((r) => setTimeout(r, 5000).unref?.());
    void Promise.race([fame.ready, wait]).then(() => send(res, 200, fame.top()));
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
    let data: { name?: unknown; difficulty?: unknown };
    try {
      data = JSON.parse(body);
    } catch {
      return send(res, 400, { error: 'json' });
    }
    if (typeof data.name !== 'string' || !data.name.trim() || !DIFFICULTIES.has(String(data.difficulty))) {
      return send(res, 400, { error: 'invalid' });
    }
    if (!fame.allowReport(ip)) return send(res, 429, { error: 'rate' });
    fame.record(data.name, 'computer');
    send(res, 204, null);
  });
  return true;
}

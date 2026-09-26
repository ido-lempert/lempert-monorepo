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
  /** Saves the entries that changed; `all` is the whole list, for stores that rewrite everything. */
  save(changed: Array<[key: string, entry: FameEntry]>, all: FameEntry[]): Promise<void>;
}

/**
 * Wall of fame: players ranked by number of wins. Online wins are recorded by the server itself;
 * wins against the computer are reported by the browser (so they are on the honour system).
 * Kept in memory and, when a store is given, saved there – the list may be reset at any time.
 */
export class Fame {
  private entries = new Map<string, FameEntry>();
  private dirty = new Set<string>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private reports = new Map<string, number[]>();
  private store: FameStore | null;
  /** Resolves once the saved list has been loaded (wins recorded before that are merged in). */
  readonly ready: Promise<void>;

  constructor(store: FameStore | null = null) {
    this.store = store;
    this.ready = store
      ? store.load().then(
          (saved) => this.merge(saved),
          (err) => {
            // Saving now would overwrite the list we could not read, so keep this run in memory only.
            console.error('Could not load wall of fame; not saving it this run', err);
            this.store = null;
          },
        )
      : Promise.resolve();
  }

  record(rawName: string, kind: WinKind, now = Date.now()) {
    const name = rawName.trim().slice(0, 14);
    if (!name) return;
    const k = key(name);
    const e = this.entries.get(k) ?? { name, wins: 0, computer: 0, online: 0, last: 0 };
    e.name = name; // latest spelling wins
    e.wins++;
    e[kind]++;
    e.last = now;
    this.entries.set(k, e);
    this.dirty.add(k);
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
    if (!this.store || this.saveTimer) return;
    this.saveTimer = setTimeout(() => void this.flush(), 2000);
  }

  /** Saves pending wins now (also called on shutdown, so a redeploy does not lose the last ones). */
  async flush() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    await this.ready; // never overwrite the saved list before it was read
    if (!this.store || !this.dirty.size) return;
    const changed = [...this.dirty].map((k): [string, FameEntry] => [k, { ...this.entries.get(k)! }]);
    this.dirty.clear();
    try {
      await this.store.save(changed, this.top(500));
    } catch (err) {
      console.error('Could not save wall of fame', err);
      for (const [k] of changed) this.dirty.add(k); // try again with the next win
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
    send(res, 200, fame.top());
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

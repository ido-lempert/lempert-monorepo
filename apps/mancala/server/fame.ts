import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname } from 'node:path';

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

/**
 * Wall of fame: players ranked by number of wins. Online wins are recorded by the server itself;
 * wins against the computer are reported by the browser (so they are on the honour system).
 * Kept in memory and, when a file is given, saved there – the list may be reset at any time.
 */
export class Fame {
  private entries = new Map<string, FameEntry>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private reports = new Map<string, number[]>();
  private file: string | null;

  constructor(file: string | null = null) {
    this.file = file;
    if (!file) return;
    try {
      for (const e of JSON.parse(readFileSync(file, 'utf8')) as FameEntry[]) this.entries.set(key(e.name), e);
    } catch {
      /* no saved list yet */
    }
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

  private scheduleSave() {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        mkdirSync(dirname(this.file!), { recursive: true });
        writeFileSync(`${this.file}.tmp`, JSON.stringify(this.top(500)));
        renameSync(`${this.file}.tmp`, this.file!);
      } catch (err) {
        console.error('Could not save wall of fame', err);
      }
    }, 2000);
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

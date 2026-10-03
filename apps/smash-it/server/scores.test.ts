import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { cleanName, handleScores, parseReport, Scores, type ScoreStore } from './scores.ts';
import { fileStore, storeFromEnv } from './scoresStore.ts';

const ID = 'abcd1234-ef';

describe('reports', () => {
  it('cleans nicknames', () => {
    expect(cleanName('  נמלה זריזה  ')).toBe('נמלה זריזה');
    expect(cleanName('a<b>c\u0000d')).toBe('abcd');
    expect(cleanName('x'.repeat(30))).toHaveLength(14);
    expect(cleanName(5)).toBe('');
  });

  it('rejects nonsense and caps impossible results', () => {
    expect(parseReport(null)).toBeNull();
    expect(parseReport({ id: 'x', name: 'a', stars: 1, chapter: 1 })).toBeNull();
    expect(parseReport({ id: ID, name: '   ', stars: 1, chapter: 1 })).toBeNull();
    expect(parseReport({ id: ID, name: 'Dana', stars: 9999, chapter: 400, daily: { date: '2026-10-02', score: 1e9 } })).toEqual({
      id: ID, name: 'Dana', stars: 300, chapter: 100, daily: { date: '2026-10-02', score: 500_000 },
    });
    expect(parseReport({ id: ID, name: 'Dana', stars: 3, chapter: 2, daily: { date: 'yesterday', score: 5 } })).toEqual({ id: ID, name: 'Dana', stars: 3, chapter: 2 });
  });
});

describe('boards', () => {
  it('rank players by stars, then chapter, and keep each one’s best', () => {
    const s = new Scores();
    s.record({ id: 'aaaaaaaa', name: 'A', stars: 10, chapter: 5 }, 1);
    s.record({ id: 'bbbbbbbb', name: 'B', stars: 12, chapter: 4 }, 2);
    s.record({ id: 'cccccccc', name: 'C', stars: 12, chapter: 6 }, 3);
    // A lower report never lowers a result; the newest name is kept.
    s.record({ id: 'aaaaaaaa', name: 'A2', stars: 3, chapter: 1 }, 4);
    expect(s.topPlayers().map((p) => [p.name, p.stars])).toEqual([['C', 12], ['B', 12], ['A2', 10]]);
    expect(s.rank('aaaaaaaa', '2026-10-02')).toEqual({ all: 3, daily: null });
  });

  it('keep the best score of each player for each day', () => {
    const s = new Scores();
    s.record({ id: 'aaaaaaaa', name: 'A', stars: 1, chapter: 1, daily: { date: '2026-10-02', score: 500 } });
    s.record({ id: 'aaaaaaaa', name: 'A', stars: 1, chapter: 1, daily: { date: '2026-10-02', score: 300 } });
    s.record({ id: 'bbbbbbbb', name: 'B', stars: 1, chapter: 1, daily: { date: '2026-10-02', score: 900 } });
    s.record({ id: 'bbbbbbbb', name: 'B', stars: 1, chapter: 1, daily: { date: '2026-10-03', score: 100 } });
    expect(s.topDaily('2026-10-02').map((d) => [d.name, d.score])).toEqual([['B', 900], ['A', 500]]);
    expect(s.topDaily('2026-10-03')).toHaveLength(1);
    expect(s.rank('aaaaaaaa', '2026-10-02').daily).toBe(2);
  });

  it('a player can leave the boards', async () => {
    const s = new Scores();
    s.record({ id: 'aaaaaaaa', name: 'A', stars: 3, chapter: 2, daily: { date: '2026-10-02', score: 50 } });
    await s.remove('aaaaaaaa');
    expect(s.topPlayers()).toEqual([]);
    expect(s.topDaily('2026-10-02')).toEqual([]);
  });

  it('limit reports per address', () => {
    const s = new Scores();
    for (let i = 0; i < 60; i++) expect(s.allowReport('1.2.3.4', i)).toBe(true);
    expect(s.allowReport('1.2.3.4', 61)).toBe(false);
    expect(s.allowReport('5.6.7.8', 61)).toBe(true);
  });
});

describe('saving', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('a file store keeps results across restarts', async () => {
    dir = await mkdtemp(join(tmpdir(), 'smash-scores-'));
    const file = join(dir, 'scores.json');
    const today = new Date('2026-10-02T12:00:00Z');
    const a = new Scores(fileStore(file), today);
    await a.ready;
    a.record({ id: 'aaaaaaaa', name: 'A', stars: 7, chapter: 4, daily: { date: '2026-10-02', score: 640 } });
    await a.flush();
    const b = new Scores(fileStore(file), today);
    await b.ready;
    expect(b.topPlayers()[0]).toMatchObject({ name: 'A', stars: 7, chapter: 4 });
    expect(b.topDaily('2026-10-02')[0]).toMatchObject({ name: 'A', score: 640 });
  });

  it('nothing is saved before the saved scores have loaded, and failed saves are retried', async () => {
    let fail = true;
    const saved: unknown[] = [];
    const store: ScoreStore = {
      load: async () => ({ players: [{ id: 'zzzzzzzz', name: 'Z', stars: 50, chapter: 20, last: 0 }], daily: [] }),
      save: async (players) => {
        if (fail) throw new Error('down');
        saved.push(...players);
      },
      remove: async () => {},
    };
    const s = new Scores(store);
    s.record({ id: 'aaaaaaaa', name: 'A', stars: 3, chapter: 2 });
    await s.ready;
    expect(s.topPlayers().map((p) => p.name)).toEqual(['Z', 'A']);
    await s.flush();
    expect(saved).toHaveLength(0);
    fail = false;
    await s.flush();
    expect(saved).toHaveLength(1);
  });

  it('trims pasted settings, and falls back to the file for a broken database address', () => {
    expect(() => storeFromEnv({ TURSO_DATABASE_URL: 'libsql://example.turso.io\n', TURSO_AUTH_TOKEN: 'abc\n' }, '/tmp/x.json')).not.toThrow();
    expect(() => storeFromEnv({ TURSO_DATABASE_URL: 'not a url at all' }, '/tmp/x.json')).not.toThrow();
  });
});

describe('store apps (CORS)', () => {
  const call = (method: string, origin?: string) => {
    const headers: Record<string, string> = {};
    let status = 0;
    const res = {
      setHeader: (k: string, v: string) => void (headers[k] = v),
      writeHead: (code: number, h?: Record<string, string>) => {
        status = code;
        Object.assign(headers, h);
      },
      end: () => {},
    } as unknown as ServerResponse;
    const req = { url: '/api/scores', method, headers: origin ? { origin } : {} } as unknown as IncomingMessage;
    const handled = handleScores(new Scores(), req, res);
    return { handled, status, headers };
  };

  it('answers the preflight of an app origin', () => {
    for (const origin of ['capacitor://localhost', 'https://localhost']) {
      const r = call('OPTIONS', origin);
      expect(r.handled).toBe(true);
      expect(r.status).toBe(204);
      expect(r.headers['access-control-allow-origin']).toBe(origin);
      expect(r.headers['access-control-allow-methods']).toContain('DELETE');
    }
  });

  it('does not open the API to other sites', () => {
    expect(call('OPTIONS', 'https://evil.example').headers['access-control-allow-origin']).toBeUndefined();
    expect(call('OPTIONS').headers['access-control-allow-origin']).toBeUndefined();
  });
});

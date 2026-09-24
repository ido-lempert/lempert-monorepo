import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FAME_PATH, Fame, handleFame } from './fame';

describe('wall of fame', () => {
  it('ranks by number of wins, merging names case-insensitively', () => {
    const fame = new Fame();
    fame.record('Dana', 'online', 1);
    fame.record('ido', 'computer', 2);
    fame.record('IDO ', 'online', 3);
    fame.record('   ', 'online', 4); // ignored
    expect(fame.top()).toEqual([
      { name: 'IDO', wins: 2, computer: 1, online: 1, last: 3 },
      { name: 'Dana', wins: 1, computer: 0, online: 1, last: 1 },
    ]);
  });

  describe('HTTP API', () => {
    const fame = new Fame();
    let server: Server;
    let url: string;
    beforeAll(async () => {
      server = createServer((req, res) => {
        if (!handleFame(fame, req, res)) res.writeHead(404).end();
      });
      await new Promise<void>((r) => server.listen(0, r));
      url = `http://localhost:${(server.address() as AddressInfo).port}${FAME_PATH}`;
    });
    afterAll(() => server.close());

    const post = (body: unknown) =>
      fetch(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

    it('accepts a reported win against the computer and lists it', async () => {
      expect((await post({ name: 'עידו', difficulty: 'hard' })).status).toBe(204);
      const list = await (await fetch(url)).json();
      expect(list[0]).toMatchObject({ name: 'עידו', wins: 1, computer: 1 });
    });

    it('rejects bad reports and rate-limits', async () => {
      expect((await post({ name: '', difficulty: 'hard' })).status).toBe(400);
      expect((await post({ name: 'x', difficulty: 'godlike' })).status).toBe(400);
      const statuses = [];
      for (let i = 0; i < 25; i++) statuses.push((await post({ name: 'spam', difficulty: 'easy' })).status);
      expect(statuses).toContain(429);
    });
  });
});

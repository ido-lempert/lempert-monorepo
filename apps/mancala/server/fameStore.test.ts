import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Fame, type FameStore } from './fame';
import { fileStore, tursoStore } from './fameStore';

/** Records wins, saves them in two rounds, and loads the list back into a fresh wall of fame. */
async function roundTrip(store: () => FameStore) {
  const fame = new Fame(store());
  await fame.ready;
  fame.record('Dana', 'online', 1);
  fame.record('ido', 'computer', 2);
  await fame.flush();
  fame.record('IDO', 'online', 3);
  await fame.flush();
  const again = new Fame(store());
  await again.ready;
  return again.top();
}

const expected = [
  { name: 'IDO', wins: 2, computer: 1, online: 1, last: 3 },
  { name: 'Dana', wins: 1, computer: 0, online: 1, last: 1 },
];

describe('wall of fame storage', () => {
  it('keeps the list in a JSON file', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'fame-')), 'fame.json');
    expect(await roundTrip(() => fileStore(file))).toEqual(expected);
  });

  it('keeps the list in a libSQL (Turso) database', async () => {
    const url = `file:${join(mkdtempSync(join(tmpdir(), 'fame-')), 'fame.db')}`;
    expect(await roundTrip(() => tursoStore(url))).toEqual(expected);
  });

  it('adds up wins from two servers running side by side (as during a deploy)', async () => {
    const url = `file:${join(mkdtempSync(join(tmpdir(), 'fame-')), 'fame.db')}`;
    const [a, b] = [new Fame(tursoStore(url)), new Fame(tursoStore(url))];
    await Promise.all([a.ready, b.ready]);
    a.record('ido', 'online', 1);
    b.record('ido', 'computer', 2);
    b.record('ido', 'computer', 3);
    await a.flush();
    await b.flush();
    const again = new Fame(tursoStore(url));
    await again.ready;
    expect(again.top()).toEqual([{ name: 'ido', wins: 3, computer: 2, online: 1, last: 3 }]);
  });

  it('keeps wins recorded while the saved list was still loading', async () => {
    let resolve!: (e: typeof expected) => void;
    const save = vi.fn(async () => {});
    const fame = new Fame({ load: () => new Promise((r) => (resolve = r)), save });
    fame.record('ido', 'online', 5);
    resolve(expected);
    await fame.ready;
    expect(fame.top()[0]).toEqual({ name: 'ido', wins: 3, computer: 1, online: 2, last: 5 });
  });

  it('does not overwrite a list it could not load, and keeps trying to load it', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const save = vi.fn(async () => {});
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(expected);
    const fame = new Fame({ load, save });
    fame.record('ido', 'online', 5);
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000); // the retry loads the list and saves the waiting win
    await vi.advanceTimersByTimeAsync(2000);
    vi.useRealTimers();
    expect(fame.top()[0]).toMatchObject({ name: 'ido', wins: 3 });
    expect(save).toHaveBeenCalledWith([['ido', { name: 'ido', wins: 1, computer: 0, online: 1, last: 5 }]], expect.anything());
  });
});

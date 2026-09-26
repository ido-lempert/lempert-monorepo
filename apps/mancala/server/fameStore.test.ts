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

  it('keeps wins recorded while the saved list was still loading', async () => {
    let resolve!: (e: typeof expected) => void;
    const save = vi.fn(async () => {});
    const fame = new Fame({ load: () => new Promise((r) => (resolve = r)), save });
    fame.record('ido', 'online', 5);
    resolve(expected);
    await fame.ready;
    expect(fame.top()[0]).toEqual({ name: 'ido', wins: 3, computer: 1, online: 2, last: 5 });
  });

  it('does not overwrite a list it could not load', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fame = new Fame({ load: () => Promise.reject(new Error('offline')), save });
    await fame.ready;
    fame.record('ido', 'online');
    await vi.advanceTimersByTimeAsync(2000);
    vi.useRealTimers();
    expect(save).not.toHaveBeenCalled();
  });
});

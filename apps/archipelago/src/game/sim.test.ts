import { describe, expect, it } from 'vitest';
import { LEVELS, levelById } from './levels';
import { nextLevel, parseProgress, recordWin, starsFor } from './progress';
import { run, toggleEdge } from './sim';

const l1 = levelById('l1')!;
const l2 = levelById('l2')!;
const l3 = levelById('l3')!;

describe('levels', () => {
  it.each(LEVELS.map((l) => [l.id, l] as const))('%s is solved by its solution', (_, level) => {
    expect(run(level, level.solution).ok).toBe(true);
  });

  it.each(LEVELS.map((l) => [l.id, l] as const))('%s is not solved as it starts', (_, level) => {
    expect(run(level, { placed: {}, edges: level.edges }).ok).toBe(false);
  });

  it('solutions only use pieces from the tray and pads that exist', () => {
    for (const l of LEVELS) {
      const used = Object.values(l.solution.placed).sort();
      expect(used).toEqual([...l.tray].sort());
      for (const pad of Object.keys(l.solution.placed)) expect(l.pads.some((p) => p.id === pad)).toBe(true);
    }
  });
});

describe('run', () => {
  it('returns the path a request took', () => {
    const r = run(l1, l1.solution);
    expect(r.trips[0].path).toEqual(['phone', 'p1', 'db']);
  });

  it('a request with no way through fails with noPath', () => {
    const r = run(l1, { placed: { p1: 'server' }, edges: [{ from: 'phone', to: 'p1' }] });
    expect(r.trips[0]).toMatchObject({ ok: false, fail: 'noPath' });
  });

  it('arrows pointing back fail with reversed', () => {
    const r = run(l1, {
      placed: { p1: 'server' },
      edges: [
        { from: 'p1', to: 'phone' },
        { from: 'db', to: 'p1' },
      ],
    });
    expect(r.trips[0].fail).toBe('reversed');
  });

  it('a client wired straight to the database sets off the alarm', () => {
    const r = run(l1, { placed: {}, edges: [{ from: 'phone', to: 'db' }] });
    expect(r.ok).toBe(false);
    expect(r.problems).toHaveLength(1);
    expect(r.trips[0].fail).toBe('exposedDb');
  });

  it('the shortcut breaks the level even when the server is wired too', () => {
    const r = run(l2, { ...l2.solution, edges: [...l2.solution.edges, { from: 'laptop', to: 'db' }] });
    expect(r.ok).toBe(false);
    expect(r.problems[0].reason).toBe('exposedDb');
  });

  it('a round plug into the square bank fails at that edge', () => {
    const r = run(l3, {
      placed: { p1: 'server' },
      edges: [
        { from: 'phone', to: 'p1' },
        { from: 'p1', to: 'db' },
        { from: 'p1', to: 'bank' },
      ],
    });
    const bank = r.trips[1];
    expect(bank).toMatchObject({ ok: false, fail: 'shape', path: ['phone', 'p1'], edge: { from: 'p1', to: 'bank' } });
    expect(r.trips[0].ok).toBe(true);
  });

  it('requests do not pass through clients or databases', () => {
    const r = run(l2, {
      placed: {},
      edges: [
        { from: 'phone', to: 'laptop' },
        { from: 'laptop', to: 'db' },
      ],
    });
    expect(r.trips[0].ok).toBe(false);
  });
});

describe('toggleEdge', () => {
  it('adds, removes and turns around', () => {
    let e = toggleEdge([], 'a', 'b');
    expect(e).toEqual([{ from: 'a', to: 'b' }]);
    e = toggleEdge(e, 'b', 'a');
    expect(e).toEqual([{ from: 'b', to: 'a' }]);
    e = toggleEdge(e, 'b', 'a');
    expect(e).toEqual([]);
    expect(toggleEdge(e, 'a', 'a')).toEqual([]);
  });
});

describe('progress', () => {
  it('stars by number of runs', () => {
    expect([1, 2, 3, 7].map(starsFor)).toEqual([3, 2, 1, 1]);
  });

  it('keeps the best stars and wins a card once', () => {
    let p = parseProgress(null);
    p = recordWin(p, 'l1', 3);
    p = recordWin(p, 'l1', 1);
    p = recordWin(p, 'l1', 2);
    expect(p.stars.l1).toBe(3);
    expect(p.cards).toEqual(['threeTier']);
    expect(nextLevel(p)).toBe('l2');
  });

  it('survives broken saves', () => {
    expect(parseProgress('{oops').stars).toEqual({});
    expect(parseProgress('{"stars":{"l1":9},"cards":["adapter",3]}')).toMatchObject({ stars: { l1: 3 }, cards: ['adapter'] });
  });
});

import { describe, expect, it } from 'vitest';
import { LEVELS, levelById } from './levels';
import { nextLevel, parseProgress, recordWin, starsFor } from './progress';
import { run, toggleEdge } from './sim';

const l1 = levelById('l1')!;
const l2 = levelById('l2')!;
const l3 = levelById('l3')!;
const l4 = levelById('l4')!;
const l5 = levelById('l5')!;
const l6 = levelById('l6')!;
const e1 = levelById('e1')!;
const e2 = levelById('e2')!;
const e3 = levelById('e3')!;

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

describe('facade', () => {
  it('a client with three addresses breaks the rule', () => {
    const r = run(l4, { placed: {}, edges: l4.edges });
    expect(r.problems.map((p) => p.reason)).toEqual(['twoAddresses', 'twoAddresses', 'twoAddresses']);
    expect(r.ok).toBe(false);
  });
});

describe('cache', () => {
  it('without a cache every request goes to the slow database and runs out of time', () => {
    const r = run(l5, { placed: {}, edges: l5.edges });
    expect(r.trips.map((t) => t.doneAt)).toEqual([4, 8, 12, 16]);
    expect(r.trips.map((t) => t.ok)).toEqual([true, true, false, false]);
    expect(r.trips[2].fail).toBe('tooSlow');
  });

  it('the first request fills the cache, the rest are answered by it', () => {
    const r = run(l5, l5.solution);
    expect(r.trips.map((t) => t.hit)).toEqual([false, true, true, true]);
    expect(r.trips[1].path).toEqual(['phone', 's', 'p1']);
    expect(r.trips[3].doneAt).toBe(7);
  });

  it('a cache beside a direct line is skipped', () => {
    const r = run(l5, { placed: { p1: 'cache' }, edges: [...l5.edges, { from: 's', to: 'p1' }, { from: 'p1', to: 'db' }] });
    expect(r.ok).toBe(false);
  });
});

describe('load balancer', () => {
  it('one server takes three requests and drops the rest', () => {
    const r = run(l6, { placed: {}, edges: l6.edges });
    expect(r.trips.filter((t) => t.ok)).toHaveLength(3);
    expect(r.trips[3]).toMatchObject({ fail: 'overload', path: ['crowd', 's0'] });
  });

  it('the balancer shares the requests between both servers', () => {
    const r = run(l6, l6.solution);
    const via = r.trips.map((t) => t.path[2]);
    expect(via.filter((v) => v === 's0')).toHaveLength(3);
    expect(via.filter((v) => v === 'p2')).toHaveLength(3);
  });

  it('a second server that cannot reach the data does not help', () => {
    const edges = l6.solution.edges.filter((e) => e.from !== 'p2');
    expect(run(l6, { ...l6.solution, edges }).ok).toBe(false);
  });

  it('wiring the crowd to both servers breaks the one-address rule', () => {
    const r = run(l6, {
      placed: { p2: 'server' },
      edges: [...l6.edges, { from: 'crowd', to: 'p2' }, { from: 'p2', to: 'db' }],
    });
    expect(r.problems.some((p) => p.reason === 'twoAddresses')).toBe(true);
  });
});

describe('events', () => {
  it('a broker copies one event to every subscriber', () => {
    const r = run(e1, e1.solution);
    expect(r.trips.map((t) => t.flow.to)).toEqual(['email', 'stock', 'stats']);
    expect(r.trips.every((t) => t.event && t.group === 0 && t.path[1] === 'p1')).toBe(true);
  });

  it('a publisher wired to every subscriber breaks the one-address rule', () => {
    const r = run(e1, { placed: {}, edges: [{ from: 'shop', to: 'email' }, { from: 'shop', to: 'stock' }, { from: 'shop', to: 'stats' }] });
    expect(r.ok).toBe(false);
    expect(r.problems[0].reason).toBe('twoAddresses');
  });

  it('a burst overloads the warehouse, and a queue lines the orders up instead', () => {
    const without = run(e2, { placed: {}, edges: e2.edges });
    expect(without.trips.filter((t) => t.fail === 'overload')).toHaveLength(4);
    const withQueue = run(e2, e2.solution);
    expect(withQueue.ok).toBe(true);
    expect(withQueue.trips.map((t) => t.queued)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('the finale needs the queue in front of the slow warehouse only', () => {
    expect(run(e3, e3.solution).trips.filter((t) => t.flow.to === 'email').every((t) => t.queued === undefined)).toBe(true);
    const noQueue = run(e3, {
      placed: { p1: 'broker' },
      edges: [
        { from: 'shop', to: 'p1' },
        { from: 'p1', to: 'email' },
        { from: 'p1', to: 'stock' },
      ],
    });
    expect(noQueue.ok).toBe(false);
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

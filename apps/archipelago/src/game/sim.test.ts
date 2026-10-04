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
const w1 = levelById('w1')!;
const w2 = levelById('w2')!;
const w3 = levelById('w3')!;
const w4 = levelById('w4')!;
const o1 = levelById('o1')!;
const o2 = levelById('o2')!;
const o3 = levelById('o3')!;
const o4 = levelById('o4')!;

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
      // A level with a single-instance rule may offer more of that kind than the solution uses.
      const spare = (k: string) => l.single?.includes(k as never) === true;
      expect(used.every((k) => l.tray.includes(k))).toBe(true);
      expect(l.tray.filter((k) => !spare(k)).sort()).toEqual(used.filter((k) => !spare(k)));
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

describe('patterns workshop', () => {
  it('the guard is the only way into payments', () => {
    const open = run(w1, { placed: { p1: 'guard' }, edges: [...w1.solution.edges, { from: 'phone', to: 'pay' }] });
    expect(open.ok).toBe(false);
    expect(open.problems[0].reason).toBe('unguarded');
    expect(run(w1, { placed: {}, edges: w1.edges }).trips.every((t) => t.fail === 'unguarded')).toBe(true);
  });

  it('a request that skipped a wrapper arrives unwrapped', () => {
    const r = run(w2, { placed: { p1: 'lock', p3: 'adapter' }, edges: [{ from: 'phone', to: 'p1' }, { from: 'p1', to: 'p3' }, { from: 'p3', to: 'bank' }] });
    expect(r.ok).toBe(false);
    expect(r.trips[0].fail).toBe('unwrapped');
  });

  it('wrappers go in any order, but only the adapter fits the bank', () => {
    const swapped = run(w2, {
      placed: { p1: 'zip', p2: 'lock', p3: 'adapter' },
      edges: w2.solution.edges,
    });
    expect(swapped.ok).toBe(true);
    const noAdapter = run(w2, {
      placed: { p1: 'lock', p2: 'adapter', p3: 'zip' },
      edges: [{ from: 'phone', to: 'p1' }, { from: 'p1', to: 'p2' }, { from: 'p2', to: 'p3' }, { from: 'p3', to: 'bank' }],
    });
    expect(noAdapter.trips[0].fail).toBe('shape');
  });

  it('a logbook per service breaks the single-instance rule', () => {
    const r = run(w3, {
      placed: { p1: 'logbook', p2: 'logbook', p3: 'logbook' },
      edges: [{ from: 'stock', to: 'p1' }, { from: 'pay', to: 'p2' }, { from: 'ship', to: 'p3' }],
    });
    expect(r.trips.every((t) => t.ok)).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.problems.map((p) => p.reason)).toEqual(['duplicate', 'duplicate']);
  });

  it('flows aimed at a kind are pinned to the piece they reached', () => {
    const r = run(w3, w3.solution);
    expect(r.trips.map((t) => t.flow.to)).toEqual(['p2', 'p2', 'p2']);
  });

  it('the guard has to stand right at the door of payments', () => {
    const swapped = run(w4, {
      placed: { p1: 'guard', p2: 'zip', p3: 'lock' },
      edges: [{ from: 'phone', to: 'p3' }, { from: 'laptop', to: 'p3' }, { from: 'p3', to: 'p2' }, { from: 'p2', to: 'p1' }, { from: 'p1', to: 'pay' }],
    });
    expect(swapped.ok).toBe(true);
    const lockLast = run(w4, {
      placed: { p1: 'lock', p2: 'zip', p3: 'guard' },
      edges: [{ from: 'phone', to: 'p3' }, { from: 'laptop', to: 'p3' }, { from: 'p3', to: 'p2' }, { from: 'p2', to: 'p1' }, { from: 'p1', to: 'pay' }],
    });
    expect(lockLast.problems[0].reason).toBe('unguarded');
  });
});

describe('the onion island', () => {
  it('starts with a dependency that points outward', () => {
    for (const l of [o1, o3, o4]) {
      const r = run(l, { placed: {}, edges: l.edges });
      expect(r.ok).toBe(false);
      expect(r.problems.some((p) => p.reason === 'outward')).toBe(true);
    }
  });

  it('a port turns the arrow around: the database points at it, the request flows to the database', () => {
    const r = run(o1, o1.solution);
    expect(r.ok).toBe(true);
    expect(r.trips[0].path).toEqual(['phone', 'usecase', 'p1', 'db']);
  });

  it('drawing the port towards the database is an outward dependency again', () => {
    const r = run(o1, { placed: { p1: 'port' }, edges: [{ from: 'phone', to: 'usecase' }, { from: 'usecase', to: 'p1' }, { from: 'p1', to: 'db' }] });
    expect(r.problems.map((p) => p.reason)).toEqual(['outward']);
    expect(r.trips[0].fail).toBe('outward');
  });

  it('nobody outside may reach a use case, a port or the entity except through the right layer', () => {
    const r = run(o2, { placed: { p1: 'controller', p2: 'port' }, edges: [...o2.solution.edges, { from: 'laptop', to: 'usecase' }] });
    expect(r.ok).toBe(false);
    expect(r.problems.map((p) => p.reason)).toEqual(['skipsLayer']);
    const viaPort = run(o1, { placed: { p1: 'port' }, edges: [{ from: 'phone', to: 'p1' }, { from: 'db', to: 'p1' }] });
    expect(viaPort.problems[0].reason).toBe('skipsLayer');
  });

  it('a piece stands only on a pad of its own ring', () => {
    const r = run(o2, { placed: { p1: 'port', p2: 'controller' }, edges: o2.solution.edges });
    expect(r.ok).toBe(false);
    expect(r.problems.slice(0, 2).map((p) => p.reason)).toEqual(['wrongRing', 'wrongRing']);
  });

  it('the core entity may not know the database, and a use case reaches it freely', () => {
    expect(run(o4, o4.solution).ok).toBe(true);
    const r = run(o4, { ...o4.solution, edges: [...o4.solution.edges, { from: 'entity', to: 'db' }] });
    expect(r.problems.map((p) => p.reason)).toEqual(['outward']);
  });

  it('each outside part can plug into a port of its own', () => {
    const r = run(o3, o3.solution);
    expect(r.trips.map((t) => t.path[t.path.length - 1])).toEqual(['db', 'email']);
  });
});

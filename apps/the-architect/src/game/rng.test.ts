import { describe, expect, it } from 'vitest';
import { between, rng } from './rng';

const take = (next: () => number, n: number) => Array.from({ length: n }, next);

describe('rng', () => {
  it('gives the same numbers for the same seed', () => {
    expect(take(rng(42), 20)).toEqual(take(rng(42), 20));
  });

  it('gives different numbers for another seed', () => {
    expect(take(rng(42), 20)).not.toEqual(take(rng(43), 20));
  });

  it('stays in [0, 1) and between() stays in its range', () => {
    const next = rng(7);
    for (let i = 0; i < 1000; i++) {
      const x = next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const n = between(next, 3, 5);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
    }
  });
});

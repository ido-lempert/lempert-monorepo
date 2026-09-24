import { describe, expect, it } from 'vitest';
import { createHunt, HUNT_SECONDS, pickSpots, RIVAL_REST, stepHunt, type Vec } from './hunt';

const far: Vec = { x: 100, z: 100 };

describe('etrog hunt', () => {
  it('lets the player collect an etrog in reach', () => {
    const h = createHunt([{ x: 0, z: 0 }], far);
    const events = stepHunt(h, 0.016, { x: 0.5, z: 0 });
    expect(events).toEqual([{ type: 'collect', by: 'me', index: 0 }]);
    expect(h.mine).toBe(1);
    expect(h.over).toBe(true);
  });

  it('sends the rival to the nearest etrog, then rests briefly', () => {
    const h = createHunt(
      [
        { x: 10, z: 0 },
        { x: 3, z: 0 },
      ],
      { x: 0, z: 0 },
    );
    for (let i = 0; i < 60 && h.rivals === 0; i++) stepHunt(h, 0.05, far);
    expect(h.etrogs[1].takenBy).toBe('rival');
    expect(h.rival.rest).toBeCloseTo(RIVAL_REST);
    const x = h.rival.x;
    stepHunt(h, 0.1, far);
    expect(h.rival.x).toBe(x);
  });

  it('gives the tie to the player', () => {
    const h = createHunt([{ x: 0, z: 0 }], { x: 0, z: 0 });
    stepHunt(h, 0.016, { x: 0, z: 0 });
    expect(h.etrogs[0].takenBy).toBe('me');
  });

  it('ends when time runs out', () => {
    const h = createHunt([{ x: 50, z: 50 }], far);
    h.rival.rest = 1000;
    for (let t = 0; t <= HUNT_SECONDS; t += 1) stepHunt(h, 1, { x: -50, z: -50 });
    expect(h.over).toBe(true);
    expect(h.timeLeft).toBe(0);
  });

  it('switches target when a wall blocks the rival', () => {
    const h = createHunt(
      [
        { x: 5, z: 0 },
        { x: -8, z: 0 },
      ],
      { x: 0, z: 0 },
    );
    const wall = (p: Vec) => (p.x > 1 ? { ...p, x: 1 } : p);
    for (let i = 0; i < 200 && h.rivals === 0; i++) stepHunt(h, 0.05, far, wall);
    expect(h.etrogs[1].takenBy).toBe('rival');
  });

  it('picks spaced-out spots', () => {
    const grid: Vec[] = [];
    for (let x = 0; x < 20; x++) for (let z = 0; z < 20; z++) grid.push({ x, z });
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const spots = pickSpots(grid, 8, random, 4);
    expect(spots).toHaveLength(8);
    for (const a of spots) for (const b of spots) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(4);
  });

  it('can slow the rival down for a calmer game', () => {
    const a = createHunt([{ x: 20, z: 0 }], { x: 0, z: 0 });
    const b = createHunt([{ x: 20, z: 0 }], { x: 0, z: 0 });
    stepHunt(a, 1, far);
    stepHunt(b, 1, far, (p) => p, 0.5);
    expect(b.rival.x).toBeCloseTo(a.rival.x / 2);
  });
});

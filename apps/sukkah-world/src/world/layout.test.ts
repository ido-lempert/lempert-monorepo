import { describe, expect, it } from 'vitest';
import { SPECIES } from '../game/progress';
import { buildMaze, MOSES, RIDE_END, riverPoint, GRAND_SUKKAH, huntCandidates, isFree, ISAAC, JACOB, LAMB_SPOTS, MAZE, MY_SUKKAH, PEN, resolve, SPAWN, SPECIES_SPOTS, WORLD_RADIUS } from './layout';

describe('village layout', () => {
  it('spawns the player and places the four species on open ground', () => {
    expect(isFree(SPAWN, 0.4)).toBe(true);
    for (const s of SPECIES) expect(isFree(SPECIES_SPOTS[s], 0.4)).toBe(true);
  });

  it('stops the player at a sukkah wall but lets them in through the open side', () => {
    const northWall = { x: GRAND_SUKKAH.x, z: GRAND_SUKKAH.z - GRAND_SUKKAH.d / 2 };
    expect(resolve(northWall).z).toBeLessThan(northWall.z - 0.3);
    const insideMine = { x: MY_SUKKAH.x, z: MY_SUKKAH.z };
    expect(isFree(insideMine, 0.4)).toBe(true);
  });

  it('keeps the player inside the world', () => {
    const p = resolve({ x: 100, z: 0 });
    expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(WORLD_RADIUS);
  });

  it('has plenty of room for an etrog hunt', () => {
    expect(huntCandidates().length).toBeGreaterThan(100);
  });

  it('places the new guests, lambs and pen inside the world, lambs and pen on open ground', () => {
    for (const p of [ISAAC, JACOB, PEN, ...LAMB_SPOTS]) expect(Math.hypot(p.x, p.z)).toBeLessThan(WORLD_RADIUS - 1);
    for (const p of LAMB_SPOTS) expect(isFree(p, 0.4)).toBe(true);
    expect(isFree(PEN, 0.4)).toBe(true);
    expect(LAMB_SPOTS).toHaveLength(3);
  });

  it('builds a maze whose entrance is open and lambs are inside', () => {
    const entrance = { x: MAZE.x - 0.5, z: MAZE.z + MAZE.cell / 2 };
    expect(isFree(entrance, 0.4)).toBe(true);
    for (const l of LAMB_SPOTS) {
      expect(l.x).toBeGreaterThan(MAZE.x);
      expect(l.z).toBeGreaterThan(MAZE.z);
    }
    // Deterministic: the same maze every visit.
    expect(buildMaze().walls).toEqual(buildMaze().walls);
  });

  it('keeps walkers out of the river but lets them stand next to Moses', () => {
    const middle = riverPoint(30);
    const p = resolve(middle);
    expect(Math.hypot(p.x - middle.x, p.z - middle.z)).toBeGreaterThan(2);
    expect(isFree(MOSES, 0) || isFree({ x: MOSES.x, z: MOSES.z + 1 }, 0.4)).toBe(true);
    expect(isFree(RIDE_END, 0.4)).toBe(true);
  });
});

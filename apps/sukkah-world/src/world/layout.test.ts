import { describe, expect, it } from 'vitest';
import { SPECIES } from '../game/progress';
import { GRAND_SUKKAH, huntCandidates, isFree, MY_SUKKAH, resolve, SPAWN, SPECIES_SPOTS, WORLD_RADIUS } from './layout';

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
});

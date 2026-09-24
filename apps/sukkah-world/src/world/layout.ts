/**
 * Where everything in Sukkah Village stands, and what the player can't walk through.
 * x points east (right on screen), z points south (towards the camera). Pure data + geometry, no three.js.
 */
import type { SpeciesId } from '../game/progress';
import type { Vec } from '../game/hunt';

export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Circle {
  x: number;
  z: number;
  r: number;
}

export type Side = 'north' | 'south' | 'east' | 'west';

export interface SukkahSpot {
  x: number;
  z: number;
  /** Width along x and depth along z. */
  w: number;
  d: number;
  /** The side left open as the entrance. */
  open: Side;
}

export const WORLD_RADIUS = 31;
export const SPAWN: Vec = { x: 0, z: 9 };
export const PLAZA = { x: 0, z: 0, r: 7 };

export const GRAND_SUKKAH: SukkahSpot = { x: 0, z: -17, w: 12, d: 8, open: 'south' };
export const MY_SUKKAH: SukkahSpot = { x: 18, z: 1, w: 6, d: 5, open: 'west' };
export const GARDEN = { x: -18, z: 1, w: 12, d: 12 };
export const HUB = { x: 0, z: 19 };
export const ABRAHAM: Vec = { x: 3.2, z: 3.5 };
export const RIVAL_HOME: Vec = { x: -3, z: 18 };
export const WELL: Circle = { x: 0, z: 0, r: 1.3 };

export const SPECIES_SPOTS: Record<SpeciesId, Vec> = {
  etrog: { x: -21.5, z: -2.5 },
  lulav: { x: -14.5, z: -3 },
  hadas: { x: -21.5, z: 4.5 },
  arava: { x: -14.5, z: 5 },
};

export const HOUSES: (Vec & { rot: number; color: string })[] = [
  { x: -13, z: -12, rot: 0.3, color: '#e9c46a' },
  { x: 13, z: -12, rot: -0.3, color: '#f4a261' },
  { x: -12, z: 14, rot: -0.4, color: '#a8dadc' },
  { x: 12, z: 14, rot: 0.4, color: '#e5989b' },
  { x: 24, z: -10, rot: -0.8, color: '#cdb4db' },
];
export const HOUSE_SIZE = { w: 4, d: 3.5 };

/** Trees and palms, placed deterministically so the village looks the same every time. */
export const PALMS: Vec[] = [
  { x: -8, z: -27 },
  { x: -3, z: -29 },
  { x: 3, z: -28 },
  { x: 8, z: -26 },
  { x: 13, z: -23 },
  { x: -24, z: -6 },
  { x: -10.5, z: 9 },
  { x: 9, z: 7 },
];
export const TREES: Vec[] = [
  { x: -18, z: -16 },
  { x: -22, z: -13 },
  { x: -25, z: -18 },
  { x: -19, z: -21 },
  { x: -14, z: -23 },
  { x: -27, z: 10 },
  { x: -22, z: 16 },
  { x: 22, z: 16 },
  { x: 26, z: 9 },
  { x: 20, z: -18 },
  { x: 7, z: 24 },
  { x: -8, z: 24 },
];

export const WALL = 0.3;

/** The walls of a sukkah (the open side has none). */
export function sukkahWalls(s: SukkahSpot): Box[] {
  const hw = s.w / 2;
  const hd = s.d / 2;
  const walls: Record<Side, Box> = {
    north: { minX: s.x - hw, maxX: s.x + hw, minZ: s.z - hd - WALL / 2, maxZ: s.z - hd + WALL / 2 },
    south: { minX: s.x - hw, maxX: s.x + hw, minZ: s.z + hd - WALL / 2, maxZ: s.z + hd + WALL / 2 },
    west: { minX: s.x - hw - WALL / 2, maxX: s.x - hw + WALL / 2, minZ: s.z - hd, maxZ: s.z + hd },
    east: { minX: s.x + hw - WALL / 2, maxX: s.x + hw + WALL / 2, minZ: s.z - hd, maxZ: s.z + hd },
  };
  return (Object.keys(walls) as Side[]).filter((k) => k !== s.open).map((k) => walls[k]);
}

function houseBox(h: Vec): Box {
  // Houses are slightly rotated; a box a bit smaller than the footprint feels right when bumping into them.
  const r = Math.max(HOUSE_SIZE.w, HOUSE_SIZE.d) / 2 - 0.3;
  return { minX: h.x - r, maxX: h.x + r, minZ: h.z - r, maxZ: h.z + r };
}

export const BOXES: Box[] = [...sukkahWalls(GRAND_SUKKAH), ...sukkahWalls(MY_SUKKAH), ...HOUSES.map(houseBox)];
export const CIRCLES: Circle[] = [
  WELL,
  { ...ABRAHAM, r: 0.5 },
  // The two pillars of the Game Hub arch.
  { x: HUB.x - 1.8, z: HUB.z, r: 0.35 },
  { x: HUB.x + 1.8, z: HUB.z, r: 0.35 },
  ...PALMS.map((p) => ({ ...p, r: 0.45 })),
  ...TREES.map((p) => ({ ...p, r: 0.7 })),
  // The long guest table inside the Grand Sukkah.
  { x: -2.5, z: GRAND_SUKKAH.z - 1, r: 0.9 },
  { x: 0, z: GRAND_SUKKAH.z - 1, r: 0.9 },
  { x: 2.5, z: GRAND_SUKKAH.z - 1, r: 0.9 },
];

export const PLAYER_RADIUS = 0.4;

/** Pushes a circle of `radius` at `p` out of every obstacle and back inside the world. */
export function resolve(p: Vec, radius = PLAYER_RADIUS): Vec {
  let { x, z } = p;
  for (const b of BOXES) {
    const cx = Math.max(b.minX, Math.min(x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    const dx = x - cx;
    const dz = z - cz;
    const d = Math.hypot(dx, dz);
    if (d >= radius) continue;
    if (d > 1e-6) {
      x = cx + (dx / d) * radius;
      z = cz + (dz / d) * radius;
    } else {
      // Centre is inside the box: leave by the nearest side.
      const exits = [x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z];
      const i = exits.indexOf(Math.min(...exits));
      if (i === 0) x = b.minX - radius;
      else if (i === 1) x = b.maxX + radius;
      else if (i === 2) z = b.minZ - radius;
      else z = b.maxZ + radius;
    }
  }
  for (const c of CIRCLES) {
    const dx = x - c.x;
    const dz = z - c.z;
    const d = Math.hypot(dx, dz);
    const min = c.r + radius;
    if (d < min && d > 1e-6) {
      x = c.x + (dx / d) * min;
      z = c.z + (dz / d) * min;
    }
  }
  const d = Math.hypot(x, z);
  const max = WORLD_RADIUS - radius;
  if (d > max) {
    x = (x / d) * max;
    z = (z / d) * max;
  }
  return { x, z };
}

export function isFree(p: Vec, margin: number): boolean {
  const r = resolve(p, margin);
  return Math.abs(r.x - p.x) < 1e-6 && Math.abs(r.z - p.z) < 1e-6;
}

export function inside(p: Vec, s: SukkahSpot, pad = 0): boolean {
  return Math.abs(p.x - s.x) <= s.w / 2 + pad && Math.abs(p.z - s.z) <= s.d / 2 + pad;
}

/** Open ground where etrogim may appear during a hunt (away from walls, the well and the hub arch). */
export function huntCandidates(): Vec[] {
  const out: Vec[] = [];
  for (let x = -27; x <= 27; x += 1.5)
    for (let z = -26; z <= 26; z += 1.5) {
      const p = { x, z };
      if (Math.hypot(x, z) > WORLD_RADIUS - 3) continue;
      if (Math.hypot(x - HUB.x, z - HUB.z) < 3) continue;
      if (inside(p, MY_SUKKAH, 0.5)) continue;
      if (isFree(p, 1.2)) out.push(p);
    }
  return out;
}

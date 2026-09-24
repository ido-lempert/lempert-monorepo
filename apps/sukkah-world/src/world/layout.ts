/**
 * Where everything in Sukkah Village stands, and what the player can't walk through.
 * x points east (right on screen), z points south (towards the camera). Pure data + geometry, no three.js.
 */
import type { SpeciesId } from '../game/progress';
import type { Vec } from '../game/hunt';
import { RIVER_HALF_WIDTH, RIVER_LENGTH } from '../game/raft';

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

export const WORLD_RADIUS = 44;
/** The old village; etrog hunts stay inside it. */
export const VILLAGE_RADIUS = 28;
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

// --- Forest of the Ushpizin (Isaac) --------------------------------------------------------------

export const ISAAC: Vec = { x: -27, z: 11 };
/** Isaac's lantern trail, winding north through the forest. */
export const LANTERNS: Vec[] = [
  { x: -30.5, z: 7.5 },
  { x: -36.5, z: 3.5 },
  { x: -31, z: -2 },
  { x: -37, z: -8 },
  { x: -31.5, z: -13.5 },
  { x: -37.5, z: -18.5 },
];
/** Seconds to light every lantern once the first one is lit. */
export const LANTERN_SECONDS = 30;
export const FOREST = { minX: -42, maxX: -26.5, minZ: -24, maxZ: 20 };

function nearTrail(p: Vec, gap: number): boolean {
  const pts = [ISAAC, ...LANTERNS];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / ((b.x - a.x) ** 2 + (b.z - a.z) ** 2)));
    if (Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.z - (a.z + t * (b.z - a.z))) < gap) return true;
  }
  return false;
}

/** Deterministic random numbers (mulberry32). */
export function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Forest trees, scattered around the trail but never on it. */
export const FOREST_TREES: Vec[] = (() => {
  const random = seeded(11);
  const out: Vec[] = [];
  for (let tries = 0; tries < 2000 && out.length < 34; tries++) {
    const p = { x: FOREST.minX + random() * (FOREST.maxX - FOREST.minX), z: FOREST.minZ + random() * (FOREST.maxZ - FOREST.minZ) };
    if (Math.hypot(p.x, p.z) > WORLD_RADIUS - 1.5) continue;
    if (nearTrail(p, 2.6)) continue;
    if (out.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 3.2)) continue;
    out.push(p);
  }
  return out;
})();

// --- Jacob's hedge maze -----------------------------------------------------------------------------

export const MAZE = { x: 26, z: -7, cells: 7, cell: 2 };
export const JACOB: Vec = { x: 24, z: -6.5 };
/** Where the lambs have to be brought back to. */
export const PEN: Vec & { r: number } = { x: 22, z: -11.5, r: 1.8 };

export interface Maze {
  walls: Box[];
  /** Centres of the dead ends furthest from the entrance, furthest first. */
  deadEnds: Vec[];
}

const cellCentre = (i: number, j: number): Vec => ({ x: MAZE.x + MAZE.cell * (i + 0.5), z: MAZE.z + MAZE.cell * (j + 0.5) });

/** A perfect maze (every cell reachable, one way between any two) carved with a seeded depth-first search. */
export function buildMaze(seed = 5): Maze {
  const n = MAZE.cells;
  const random = seeded(seed);
  // open[i][j] = passages from cell (i, j): east / south.
  const east = Array.from({ length: n }, () => Array(n).fill(false));
  const south = Array.from({ length: n }, () => Array(n).fill(false));
  const seen = Array.from({ length: n }, () => Array(n).fill(false));
  const stack: [number, number][] = [[0, 0]];
  seen[0][0] = true;
  while (stack.length) {
    const [i, j] = stack[stack.length - 1];
    const options = (
      [
        [i + 1, j],
        [i - 1, j],
        [i, j + 1],
        [i, j - 1],
      ] as [number, number][]
    ).filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n && !seen[a][b]);
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [a, b] = options[Math.floor(random() * options.length)];
    if (a > i) east[i][j] = true;
    if (a < i) east[a][b] = true;
    if (b > j) south[i][j] = true;
    if (b < j) south[a][b] = true;
    seen[a][b] = true;
    stack.push([a, b]);
  }

  const T = 0.5;
  const c = MAZE.cell;
  const walls: Box[] = [];
  const x0 = MAZE.x;
  const z0 = MAZE.z;
  const size = n * c;
  // Outer walls; the entrance is the west side of cell (0, 0).
  walls.push({ minX: x0 - T / 2, maxX: x0 + size + T / 2, minZ: z0 + size - T / 2, maxZ: z0 + size + T / 2 });
  walls.push({ minX: x0 + size - T / 2, maxX: x0 + size + T / 2, minZ: z0 - T / 2, maxZ: z0 + size + T / 2 });
  walls.push({ minX: x0 - T / 2, maxX: x0 + size + T / 2, minZ: z0 - T / 2, maxZ: z0 + T / 2 });
  walls.push({ minX: x0 - T / 2, maxX: x0 + T / 2, minZ: z0 + c, maxZ: z0 + size + T / 2 });
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if (i < n - 1 && !east[i][j]) {
        const x = x0 + (i + 1) * c;
        walls.push({ minX: x - T / 2, maxX: x + T / 2, minZ: z0 + j * c - T / 2, maxZ: z0 + (j + 1) * c + T / 2 });
      }
      if (j < n - 1 && !south[i][j]) {
        const z = z0 + (j + 1) * c;
        walls.push({ minX: x0 + i * c - T / 2, maxX: x0 + (i + 1) * c + T / 2, minZ: z - T / 2, maxZ: z + T / 2 });
      }
    }

  // Distance of every cell from the entrance, to hide the lambs deep inside.
  const dist = Array.from({ length: n }, () => Array(n).fill(-1));
  const queue: [number, number][] = [[0, 0]];
  dist[0][0] = 0;
  const links = (i: number, j: number): [number, number][] => {
    const out: [number, number][] = [];
    if (i < n - 1 && east[i][j]) out.push([i + 1, j]);
    if (i > 0 && east[i - 1][j]) out.push([i - 1, j]);
    if (j < n - 1 && south[i][j]) out.push([i, j + 1]);
    if (j > 0 && south[i][j - 1]) out.push([i, j - 1]);
    return out;
  };
  while (queue.length) {
    const [i, j] = queue.shift()!;
    for (const [a, b] of links(i, j))
      if (dist[a][b] < 0) {
        dist[a][b] = dist[i][j] + 1;
        queue.push([a, b]);
      }
  }
  const ends: { i: number; j: number; d: number }[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (links(i, j).length === 1 && (i || j)) ends.push({ i, j, d: dist[i][j] });
  ends.sort((a, b) => b.d - a.d);
  return { walls, deadEnds: ends.map((e) => cellCentre(e.i, e.j)) };
}

export const MAZE_LAYOUT = buildMaze();
export const LAMB_SPOTS: Vec[] = MAZE_LAYOUT.deadEnds.slice(0, 3);
/** A dead end not taken by a lamb, for one of Joseph's sheaves. */
export const MAZE_SHEAF: Vec = MAZE_LAYOUT.deadEnds[3] ?? MAZE_LAYOUT.deadEnds[0];

// --- Moses' river ----------------------------------------------------------------------------------

/** The river runs in an arc around the north of the village (angles measured from +x towards +z). */
export const RIVER = { r: 36, from: (235 / 180) * Math.PI, halfWidth: RIVER_HALF_WIDTH };
export const RIVER_TO = RIVER.from + RIVER_LENGTH / RIVER.r;

/** A point on the river: `s` metres downstream, `offset` metres out from the middle (positive = outer bank). */
export function riverPoint(s: number, offset = 0): Vec & { angle: number } {
  const angle = RIVER.from + s / RIVER.r;
  return { x: Math.cos(angle) * (RIVER.r + offset), z: Math.sin(angle) * (RIVER.r + offset), angle };
}

const bankPoint = (angle: number, r: number): Vec => ({ x: Math.cos(angle) * r, z: Math.sin(angle) * r });
/** Moses waits on the near bank, behind the Grand Sukkah; the ride ends further down the river. */
export const MOSES: Vec = bankPoint((270 / 180) * Math.PI, RIVER.r - RIVER.halfWidth - 2.2);
export const RIDE_END: Vec = bankPoint(RIVER_TO - 0.04, RIVER.r - RIVER.halfWidth - 1.5);

// --- Aaron, Joseph and David ---------------------------------------------------------------------

/** Aaron stands in the plaza, opposite Abraham. */
export const AARON: Vec = { x: -3.2, z: 3.5 };
export type HelpItem = 'basket' | 'cushion' | 'lulav';
export const MARKET: Vec = { x: -7.6, z: 9.6 };
/** Where each thing Aaron's villagers need can be picked up. */
export const HELP_ITEMS: Record<HelpItem, Vec> = {
  basket: { x: -6.2, z: 8.6 },
  cushion: { x: 4.2, z: -15.2 },
  lulav: { x: -18, z: 1 },
};

const inFrontOf = (h: Vec, d: number): Vec => {
  const len = Math.hypot(h.x, h.z);
  return { x: h.x - (h.x / len) * d, z: h.z - (h.z / len) * d };
};
/** Three villagers outside their houses, each waiting for one thing. */
export const VILLAGERS: (Vec & { needs: HelpItem })[] = [
  { ...inFrontOf(HOUSES[1], 3.4), needs: 'cushion' },
  { ...inFrontOf(HOUSES[2], 3.4), needs: 'basket' },
  { ...inFrontOf(HOUSES[3], 3.4), needs: 'lulav' },
];

/** Joseph and David wait on either side of the path to the Game Hub. */
export const JOSEPH: Vec = { x: -5, z: 16 };
export const DAVID: Vec = { x: 5, z: 16 };

/** Joseph's golden sheaves, hidden all over the village (one of them deep in Jacob's maze). */
export const SHEAF_SPOTS: Vec[] = [
  { x: -13, z: -15.8 },
  { x: -5, z: -24 },
  { x: 15, z: 25 },
  { x: -29.5, z: 15 },
  MAZE_SHEAF,
];

/** Seats around the long table in the Grand Sukkah, where the Ushpizin gather for the Grand Sukkot Event. */
export const GUEST_SEATS: (Vec & { facing: number })[] = Array.from({ length: 7 }, (_, i) => ({
  x: GRAND_SUKKAH.x - 3 + i,
  z: GRAND_SUKKAH.z + (i % 2 ? -0.1 : -1.9),
  facing: i % 2 ? Math.PI : 0,
}));

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

export const BOXES: Box[] = [...sukkahWalls(GRAND_SUKKAH), ...sukkahWalls(MY_SUKKAH), ...HOUSES.map(houseBox), ...MAZE_LAYOUT.walls];
export const CIRCLES: Circle[] = [
  WELL,
  { ...ABRAHAM, r: 0.5 },
  { ...ISAAC, r: 0.5 },
  { ...JACOB, r: 0.5 },
  { ...MOSES, r: 0.5 },
  { ...AARON, r: 0.5 },
  { ...JOSEPH, r: 0.5 },
  { ...DAVID, r: 0.5 },
  { ...MARKET, r: 0.9 },
  ...VILLAGERS.map((v) => ({ x: v.x, z: v.z, r: 0.45 })),
  ...LANTERNS.map((l) => ({ ...l, r: 0.25 })),
  ...FOREST_TREES.map((p) => ({ ...p, r: 0.7 })),
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
  // Nobody walks on water: push out of the river to the nearer bank.
  const fromCentre = Math.hypot(x, z);
  let angle = Math.atan2(z, x);
  if (angle < 0) angle += Math.PI * 2;
  if (angle >= RIVER.from && angle <= RIVER_TO) {
    const inner = RIVER.r - RIVER.halfWidth - radius;
    const outer = RIVER.r + RIVER.halfWidth + radius;
    if (fromCentre > inner && fromCentre < outer) {
      const k = (fromCentre < RIVER.r ? inner : outer) / fromCentre;
      x *= k;
      z *= k;
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
      if (Math.hypot(x, z) > VILLAGE_RADIUS) continue;
      if (Math.hypot(x - HUB.x, z - HUB.z) < 3) continue;
      if (inside(p, MY_SUKKAH, 0.5)) continue;
      if (isFree(p, 1.2)) out.push(p);
    }
  return out;
}

/**
 * 100 chapters in 10 worlds. Every world is the same little round world in a new look and a new size, with
 * its own bugs; every 5th chapter is a king (a boss). Chapters are generated from rules (seeded, so they are
 * the same every time): early ones have big slow bugs, few at a time and a full aiming guide; later ones
 * bring small, fast and hiding bugs, less guide, obstacles, and from world 3 fences that guard bugs, which
 * the slingshot can walk around. Goals are built around what foods can do, not only "faster and smaller".
 */
import { type BossDef, type BugKind, isSmall, type Obstacle } from './bugs';
import type { FoodId } from './foods';
import { edgeFactor, type WorldShape } from './physics';
import { makeRng, type Rng } from './rng';

export type Goal =
  /** Hit n bugs. */
  | { kind: 'hits'; n: number }
  /** Reach n points. */
  | { kind: 'score'; n: number }
  /** Hit n bugs of one kind, or n small bugs. */
  | { kind: 'bug'; bug: BugKind | 'small'; n: number }
  /** Reach a combo of ×n. */
  | { kind: 'combo'; n: number }
  /** Hit n bugs with a single shot. */
  | { kind: 'multi'; n: number }
  /** Beat the king. */
  | { kind: 'boss' };

export interface Group {
  kind: BugKind;
  count: number;
  /** line: an ant train around a ring; cluster: a crowd close together; guard: a crowd that stays behind a fence. */
  formation: 'line' | 'cluster' | 'guard';
  /** Seconds between groups. */
  every: number;
  /** Where a guard crowd stays. */
  at?: { x: number; z: number };
}

export type Theme =
  | 'garden'
  | 'meadow'
  | 'beach'
  | 'autumn'
  | 'candy'
  | 'forest'
  | 'desert'
  | 'snow'
  | 'night'
  | 'castle'
  | 'picnic'
  | 'board'
  | 'cake'
  | 'lily';

/** What a chapter's world looks like and its shape. Each world has 5, each for 2 chapters. */
export interface Stage {
  theme: Theme;
  shape: WorldShape;
}

export interface WorldDef {
  id: number;
  theme: Theme;
  radius: number;
  /** Its bugs, in the order they show up. */
  bugs: BugKind[];
  king: BossDef['look'];
  /** The look changes every 2 chapters, so it isn't always a round lawn. */
  stages: Stage[];
}

const st = (spec: string): Stage[] =>
  spec.split(' ').map((s) => {
    const [theme, shape] = s.split('/');
    return { theme: theme as Theme, shape: shape as WorldShape };
  });

export const WORLDS: WorldDef[] = [
  { id: 1, theme: 'garden', radius: 7.5, bugs: ['snail', 'ladybug', 'ant'], king: 'ladybug', stages: st('garden/circle picnic/square meadow/flower board/hex cake/circle') },
  { id: 2, theme: 'meadow', radius: 8, bugs: ['ladybug', 'ant', 'butterfly', 'snail'], king: 'ant', stages: st('meadow/flower lily/blob garden/oval picnic/hex beach/circle') },
  { id: 3, theme: 'beach', radius: 8.5, bugs: ['ant', 'ladybug', 'fly', 'butterfly'], king: 'snail', stages: st('beach/oval lily/flower desert/blob board/square beach/hex') },
  { id: 4, theme: 'autumn', radius: 9, bugs: ['beetle', 'ant', 'ladybug', 'butterfly'], king: 'beetle', stages: st('autumn/circle board/oval forest/blob picnic/square autumn/flower') },
  { id: 5, theme: 'candy', radius: 9, bugs: ['ant', 'butterfly', 'fly', 'ladybug'], king: 'butterfly', stages: st('candy/flower cake/circle candy/hex cake/square candy/blob') },
  { id: 6, theme: 'forest', radius: 9.5, bugs: ['beetle', 'snail', 'ant', 'fly'], king: 'ant', stages: st('forest/blob lily/oval autumn/hex garden/flower forest/circle') },
  { id: 7, theme: 'desert', radius: 10, bugs: ['ant', 'beetle', 'fly', 'butterfly'], king: 'beetle', stages: st('desert/hex beach/blob board/circle desert/oval picnic/square') },
  { id: 8, theme: 'snow', radius: 10, bugs: ['ladybug', 'beetle', 'butterfly', 'fly', 'snail'], king: 'snail', stages: st('snow/circle snow/flower cake/hex board/blob snow/oval') },
  { id: 9, theme: 'night', radius: 10.5, bugs: ['fly', 'butterfly', 'beetle', 'ant'], king: 'fly', stages: st('night/blob lily/flower night/hex forest/oval night/circle') },
  { id: 10, theme: 'castle', radius: 11, bugs: ['ant', 'beetle', 'butterfly', 'fly', 'ladybug'], king: 'ladybug', stages: st('castle/square board/hex cake/flower castle/circle night/oval') },
];

export const LEVELS_PER_WORLD = 10;
/** From this chapter on the slingshot can walk around the world, and fences guard bugs. */
export const ROTATE_FROM = 21;
/** From this chapter on a friend can be called in to throw alongside the player. */
export const ALLY_FROM = 8;

export interface Level {
  id: number;
  world: number;
  /** 1..10 within the world. */
  index: number;
  radius: number;
  theme: Theme;
  shape: WorldShape;
  /** Seconds on the clock. */
  time: number;
  /** Shots the chapter gives (the ammo upgrade adds more). */
  ammo: number;
  goals: Goal[];
  /** How often each kind of bug turns up. */
  mix: Partial<Record<BugKind, number>>;
  /** How many bugs run about at once. */
  max: number;
  groups?: Group[];
  /** A rare golden bug every so many seconds. */
  rareEvery?: number;
  /** How much of the aiming guide shows: 1 the whole flight, 0 none. */
  guide: number;
  /** Bug speed multiplier. */
  pace: number;
  obstacles: Obstacle[];
  /** The slingshot can walk around the world. */
  rotate: boolean;
  boss?: BossDef;
  /** Bugs spit acid at the player every so many seconds (from the chapter where the slingshot can walk away from it). */
  spit?: { every: number };
  /** A friend can be placed to help (from `ALLY_FROM`). */
  ally?: boolean;
  /** The food that suits this chapter best (a tip suggests it). */
  tip: FoodId;
  /** Points for the 2nd and 3rd star. */
  stars: [number, number];
}

/** Rough worth of a bug, for score goals and stars. */
const VALUE: Record<BugKind, number> = { snail: 30, ladybug: 50, ant: 100, beetle: 120, butterfly: 150, fly: 300, golden: 500, king: 150 };

const round = (n: number, to: number) => Math.max(to, Math.round(n / to) * to);

/** Places obstacles where they don't overlap each other or the middle. */
/** Whether a point (with room around it) is on a world of this shape. */
function fits(x: number, z: number, room: number, radius: number, shape: WorldShape): boolean {
  return Math.hypot(x, z) + room <= radius * edgeFactor(Math.atan2(z, x), shape);
}

function scatter(rng: Rng, radius: number, shape: WorldShape, kinds: Obstacle['kind'][], taken: { x: number; z: number; r: number }[]): Obstacle[] {
  const out: Obstacle[] = [];
  for (const kind of kinds) {
    for (let tries = 0; tries < 30; tries++) {
      const a = rng() * Math.PI * 2;
      const d = radius * (0.3 + rng() * 0.38);
      const x = Math.sin(a) * d;
      const z = -Math.cos(a) * d;
      const size = kind === 'mushroom' ? 1.3 : kind === 'cup' ? 1.05 : 0.8;
      if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + size + 1.2)) continue;
      if (!fits(x, z, size + 0.6, radius, shape)) continue;
      // Keep the straight line from the slingshot to the middle open early on.
      if (Math.abs(x) < size + 0.6 && z > 0) continue;
      taken.push({ x, z, r: size });
      if (kind === 'mushroom') out.push({ kind, x, z, radius: 1.3, height: 1.7 });
      else if (kind === 'cup') out.push({ kind, x, z, radius: 1.05, height: 2.1 });
      else out.push({ kind: 'cube', x, z, radius: 0.8, height: 1.4 });
      break;
    }
  }
  return out;
}

function makeLevel(w: number, i: number, seed?: number): Level {
  const world = WORLDS[w];
  const n = w * LEVELS_PER_WORLD + i + 1;
  const rng = makeRng(seed ?? n * 7919 + 13);
  const boss = i === 4 || i === 9;
  const big = i === 9;
  const R = world.radius;
  const stage = world.stages[Math.floor(i / 2)];
  const rotate = n >= ROTATE_FROM;

  // New bugs join as the world goes on.
  const pool = world.bugs.slice(0, Math.min(world.bugs.length, 2 + Math.floor(i / 3)));
  const mix: Partial<Record<BugKind, number>> = {};
  pool.forEach((k, idx) => (mix[k] = 2 + (idx === pool.length - 1 ? Math.floor(i / 3) : 0)));
  const max = Math.min(10, 4 + Math.floor(w / 2) + Math.floor(i / 3) - (boss ? 2 : 0));
  // Throwing again while food is still flying makes play quicker, so bugs are a little quicker too.
  const pace = (1 + w * 0.05 + i * 0.01) * (n <= 2 ? 1 : 1.06);
  const guide = n <= 3 ? 1 : Math.max(0, 1 - (n - 3) * 0.035);
  const time = boss ? 120 + w * 6 : n <= 2 ? 120 : 150 - (w >= 6 ? 15 : 0);

  // Obstacles: more and more varied through the game.
  const taken: { x: number; z: number; r: number }[] = [];
  const kinds: Obstacle['kind'][] = [];
  const count = n <= 2 ? 0 : Math.min(4, Math.floor((w + i) / 3));
  for (let k = 0; k < count; k++) kinds.push(w >= 4 && k % 3 === 2 ? 'cube' : w >= 1 && k % 2 === 1 ? 'cup' : 'mushroom');
  if (boss) taken.push({ x: 0, z: -R * 0.3, r: 2.5 });
  const obstacles = scatter(rng, R, stage.shape, kinds, taken);

  const groups: Group[] = [];
  const goals: Goal[] = [];
  const avg = pool.reduce((s, k) => s + VALUE[k], 0) / pool.length;
  const hits = Math.round((7 + w * 1.4 + i * 0.6) * (n <= 2 ? 1 : 1.1));
  let tip: FoodId = 'cookie';
  let rareEvery: number | undefined;

  // Fences guarding a crowd, from the chapter where the slingshot can walk around.
  if (rotate && !boss && i % 2 === 1) {
    const a = (rng() - 0.5) * 1.4;
    const gx = Math.sin(a) * R * 0.45;
    const gz = -Math.cos(a) * R * 0.45 + R * 0.05;
    // As long as fits on the world.
    let len = 4.4;
    while (len > 2.2 && ![-1, 0, 1].every((k) => fits(gx + (k * len) / 2, gz + 1.9, 0.5, R, stage.shape))) len -= 0.2;
    const fence: Obstacle = { kind: 'fence', x: gx, z: gz + 1.9, radius: 0.18, height: 1.4, length: len, angle: 0 };
    obstacles.splice(0, obstacles.length, ...obstacles.filter((o) => Math.hypot(o.x - gx, o.z - gz) > 3.2), fence);
    if (w >= 5 && fits(gx + 2.4, gz, 2.3, R, stage.shape)) obstacles.push({ kind: 'fence', x: gx + 2.4, z: gz, radius: 0.18, height: 1.4, length: 3.6, angle: Math.PI / 2 });
    const guard = pool.find((k) => k !== 'butterfly' && k !== 'fly') ?? 'ladybug';
    groups.push({ kind: guard, count: 3 + Math.floor(w / 3), formation: 'guard', every: 26, at: { x: gx, z: gz } });
  }

  if (boss) {
    goals.push({ kind: 'boss' });
    tip = w >= 7 && big ? 'watermelon' : 'jelly';
  } else {
    switch (i) {
      case 0:
        goals.push({ kind: 'hits', n: hits });
        break;
      case 1:
        goals.push({ kind: 'score', n: round(avg * hits * 1.5, 100) });
        tip = 'popcorn';
        break;
      case 2: {
        const hardest = [...pool].sort((a, b) => VALUE[b] - VALUE[a])[0];
        goals.push({ kind: 'bug', bug: hardest, n: 3 + Math.floor(w / 3) }, { kind: 'hits', n: Math.round(hits * 0.8) });
        tip = isSmall(hardest) ? 'popcorn' : 'cookie';
        break;
      }
      case 3:
        groups.push({ kind: pool[0], count: 5, formation: 'cluster', every: 14 });
        goals.push({ kind: 'multi', n: w >= 5 ? 4 : 3 }, { kind: 'hits', n: Math.round(hits * 0.8) });
        tip = w >= 2 ? 'watermelon' : 'jelly';
        break;
      case 5:
        goals.push({ kind: 'hits', n: hits }, { kind: 'score', n: round(avg * hits * 1.6, 100) });
        tip = 'pie';
        break;
      case 6:
        if (w >= 2) {
          rareEvery = 15;
          goals.push({ kind: 'bug', bug: 'golden', n: 2 }, { kind: 'hits', n: Math.round(hits * 0.8) });
          tip = 'popcorn';
        } else {
          goals.push({ kind: 'combo', n: 4 }, { kind: 'hits', n: hits });
          tip = 'jelly';
        }
        break;
      case 7: {
        const ants = pool.includes('ant') ? 'ant' : pool[0];
        groups.push({ kind: ants, count: 6 + Math.floor(w / 3), formation: 'line', every: 16 });
        goals.push({ kind: 'combo', n: 5 }, { kind: 'hits', n: hits });
        tip = w >= 3 ? 'donut' : 'cheese';
        break;
      }
      default: {
        const small = pool.some(isSmall);
        goals.push(small ? { kind: 'bug', bug: 'small', n: 4 + Math.floor(w / 2) } : { kind: 'combo', n: 4 }, { kind: 'hits', n: Math.round(hits * 1.15) });
        tip = small ? 'popcorn' : 'pizza';
      }
    }
    if (w >= 4 && i !== 6 && i % 3 === 0) rareEvery = 22;
  }

  const bossDef: BossDef | undefined = boss
    ? {
        look: world.king,
        hp: Math.round(4 + w * 1.2 + (big ? 3 : 0)),
        radius: (big ? 1.35 : 1.1) + w * 0.03,
        speed: 0.6 + w * 0.05,
        summon: w >= 1 ? { kind: world.bugs[big ? 1 : 0], every: big ? 10 : 14, count: 2 + Math.floor(w / 3) } : undefined,
        shell: world.king === 'snail' || world.king === 'beetle' || (big && w >= 6) ? { every: 7, time: 2.5 } : undefined,
        armor: big && w >= 7 ? 1.1 : undefined,
      }
    : undefined;
  // Enough shots to win with a bit more than every other shot missing; a good player has some to spare.
  const need = boss ? bossDef!.hp * 1.6 + 8 : Math.max(hits * 1.15, ...goals.map((g) => (g.kind === 'bug' || g.kind === 'multi' ? g.n * 2 : 0)));
  const ammo = Math.round(need * 1.8 + 6);
  const expected = boss ? (bossDef!.hp * 150 * 2 + 1000) : avg * hits * 2.2;
  return {
    id: n, world: w + 1, index: i + 1, radius: R, theme: stage.theme, shape: stage.shape, time, ammo, goals,
    mix, max: Math.max(2, max), groups: groups.length ? groups : undefined, rareEvery,
    guide, pace, obstacles, rotate, boss: bossDef, tip, ally: n >= ALLY_FROM, spit: rotate ? { every: Math.max(9, Math.round(19 - w * 1.1 - (boss ? 4 : 0))) } : undefined,
    stars: [round(expected * 0.9, 100), round(expected * 1.4, 100)],
  };
}

export const LEVELS: Level[] = WORLDS.flatMap((_, w) => Array.from({ length: LEVELS_PER_WORLD }, (_, i) => makeLevel(w, i)));

export function levelById(id: number): Level {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[0];
}

/** The daily challenge's id (it isn't one of the 100 chapters). */
export const DAILY_ID = 1000;

/**
 * Today's challenge: a chapter (no king) from a world already reached, laid out afresh from the date, so
 * it's the same all day and different tomorrow.
 */
export function dailyLevel(date: string, unlocked: number): Level {
  let h = 2166136261;
  for (const c of date) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rng = makeRng(h >>> 0);
  const worlds = Math.max(1, Math.min(WORLDS.length, Math.ceil(unlocked / LEVELS_PER_WORLD)));
  const w = Math.floor(rng() * worlds);
  const i = [0, 1, 2, 3, 5, 6, 7, 8][Math.floor(rng() * 8)];
  return { ...makeLevel(w, i, h >>> 0), id: DAILY_ID, time: 120 };
}

export function worldOf(level: Level): WorldDef {
  return WORLDS[level.world - 1];
}

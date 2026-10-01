/**
 * The chapters. Early ones have big slow bugs, few at a time and a full aiming guide; later ones bring
 * small, fast and hiding bugs, less guide and less time. They are built around what each food can do
 * (a crowd for wide foods, an ant train for rolling ones, flies for fast ones), not only "faster and smaller".
 */
import type { BugKind, Obstacle } from './bugs';
import type { FoodId } from './foods';

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
  | { kind: 'multi'; n: number };

export interface Group {
  kind: BugKind;
  count: number;
  /** line: an ant train around a ring; cluster: a crowd close together. */
  formation: 'line' | 'cluster';
  /** Seconds between groups. */
  every: number;
}

export interface Level {
  id: number;
  /** Seconds on the clock. */
  time: number;
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
  /** The food that suits this chapter best (the intro card suggests it). */
  tip: FoodId;
  /** Points for the 2nd and 3rd star. */
  stars: [number, number];
}

const mushrooms = (...spots: [number, number][]): Obstacle[] =>
  spots.map(([x, z]) => ({ kind: 'mushroom', x, z, radius: 1.3, height: 1.7 }));
const cup = (x: number, z: number): Obstacle => ({ kind: 'cup', x, z, radius: 1.05, height: 2.1 });

export const LEVELS: Level[] = [
  {
    id: 1, time: 120, goals: [{ kind: 'hits', n: 8 }],
    mix: { snail: 2, ladybug: 3 }, max: 5, guide: 1, pace: 1, obstacles: [], tip: 'cookie', stars: [700, 1100],
  },
  {
    id: 2, time: 150, goals: [{ kind: 'hits', n: 12 }],
    mix: { ladybug: 3, ant: 2 }, max: 6, guide: 1, pace: 1, obstacles: [cup(-5.5, -3)], tip: 'popcorn', stars: [1600, 2400],
  },
  {
    id: 3, time: 150, goals: [{ kind: 'score', n: 1800 }],
    mix: { ladybug: 2, ant: 2, butterfly: 2 }, max: 7, guide: 0.8, pace: 1, obstacles: mushrooms([4.5, -2.5]), tip: 'popcorn', stars: [2600, 3600],
  },
  {
    id: 4, time: 150, goals: [{ kind: 'multi', n: 3 }, { kind: 'hits', n: 12 }],
    mix: { ladybug: 2, snail: 1 }, max: 5,
    groups: [{ kind: 'ladybug', count: 5, formation: 'cluster', every: 14 }],
    guide: 0.7, pace: 1, obstacles: [], tip: 'jelly', stars: [2000, 3000],
  },
  {
    id: 5, time: 150, goals: [{ kind: 'bug', bug: 'fly', n: 3 }, { kind: 'hits', n: 12 }],
    mix: { ant: 3, fly: 2, ladybug: 1 }, max: 7, guide: 0.6, pace: 1, obstacles: [cup(5, -4)], tip: 'popcorn', stars: [2800, 4000],
  },
  {
    id: 6, time: 150, goals: [{ kind: 'hits', n: 15 }],
    mix: { beetle: 4, ladybug: 1, ant: 1 }, max: 7, guide: 0.5, pace: 1.05,
    obstacles: mushrooms([-4, -3], [3.5, -4.5], [0.5, 2.5]), tip: 'watermelon', stars: [2600, 3800],
  },
  {
    id: 7, time: 150, goals: [{ kind: 'combo', n: 5 }, { kind: 'hits', n: 16 }],
    mix: { ant: 2, ladybug: 1 }, max: 4,
    groups: [{ kind: 'ant', count: 7, formation: 'line', every: 16 }],
    guide: 0.4, pace: 1.05, obstacles: mushrooms([0, 0]), tip: 'cheese', stars: [3600, 5200],
  },
  {
    id: 8, time: 120, goals: [{ kind: 'score', n: 4000 }],
    mix: { butterfly: 4, fly: 2, ant: 1 }, max: 8, guide: 0.3, pace: 1.1, obstacles: mushrooms([-3.5, 1]), tip: 'pie', stars: [5500, 7500],
  },
  {
    id: 9, time: 150, goals: [{ kind: 'bug', bug: 'golden', n: 2 }, { kind: 'hits', n: 18 }],
    mix: { ant: 2, beetle: 2, butterfly: 2, fly: 1 }, max: 8, rareEvery: 14,
    guide: 0.2, pace: 1.1, obstacles: [...mushrooms([4, 1]), cup(-4.5, -4)], tip: 'donut', stars: [5000, 7000],
  },
  {
    id: 10, time: 180, goals: [{ kind: 'hits', n: 25 }, { kind: 'score', n: 6000 }],
    mix: { ladybug: 1, ant: 2, beetle: 2, butterfly: 2, fly: 2 }, max: 9, rareEvery: 20,
    groups: [
      { kind: 'ladybug', count: 5, formation: 'cluster', every: 25 },
      { kind: 'ant', count: 6, formation: 'line', every: 30 },
    ],
    guide: 0, pace: 1.15, obstacles: [...mushrooms([-4.5, -2], [4.5, -2.5]), cup(0, -5.5)], tip: 'pizza', stars: [8000, 11000],
  },
];

export function levelById(id: number): Level {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[0];
}

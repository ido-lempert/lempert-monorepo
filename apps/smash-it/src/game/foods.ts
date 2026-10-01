/**
 * The foods the slingshot throws. Each one is a different tool, not just a different look: how fast it
 * flies (its launch angle and gravity), how wide it hits, how long the slingshot takes to reload, and what
 * it does after landing (bounces, rolls, falls apart into rings, splits in the air).
 */

export type FoodId = 'cookie' | 'popcorn' | 'cheese' | 'jelly' | 'watermelon' | 'donut' | 'pie' | 'pizza';

/** What happens after (or instead of) the first landing. */
export type After =
  | { kind: 'none' }
  /** Hops on again `times` times, each hop a new hit. */
  | { kind: 'bounce'; times: number }
  /** Keeps rolling along the ground for a while, hitting what it rolls over. */
  | { kind: 'roll'; seconds: number }
  /** Falls apart into `count` rings that roll outwards. */
  | { kind: 'rings'; count: number }
  /** Splits into `count` pieces at the top of its flight. */
  | { kind: 'split'; count: number };

/** How the food comes apart on impact (drives the particles, the splat and the sound). */
export type Effect = 'crumble' | 'scatter' | 'smash' | 'wobble' | 'cheese' | 'rings' | 'splash' | 'slices';

export type Speed = 1 | 2 | 3;

export interface Food {
  id: FoodId;
  emoji: string;
  /** Old shop price (foods are prizes now); kept for the order of upgrade prices. */
  price: number;
  /** For the shop's bars: 1 slow … 3 fast. */
  speed: Speed;
  /** Launch angle (degrees): low and flat is fast, high and lofted is slow. */
  angle: number;
  gravity: number;
  /** The flying food's radius. */
  radius: number;
  /** Bugs within this distance of the impact are hit. */
  area: number;
  /** How hard bugs are thrown (1 = normal). */
  knock: number;
  /** Seconds until the next shot (short: you can throw again while food is still flying). */
  reload: number;
  after: After;
  effect: Effect;
}

export const FOODS: Record<FoodId, Food> = {
  cookie: {
    id: 'cookie', emoji: '🍪', price: 0, speed: 2,
    angle: 32, gravity: 18, radius: 0.36, area: 1.05, knock: 1, reload: 0.3,
    after: { kind: 'none' }, effect: 'crumble',
  },
  popcorn: {
    id: 'popcorn', emoji: '🍿', price: 120, speed: 3,
    angle: 16, gravity: 24, radius: 0.28, area: 0.7, knock: 0.8, reload: 0.18,
    after: { kind: 'none' }, effect: 'scatter',
  },
  cheese: {
    id: 'cheese', emoji: '🧀', price: 260, speed: 3,
    angle: 20, gravity: 22, radius: 0.34, area: 0.85, knock: 0.9, reload: 0.28,
    after: { kind: 'roll', seconds: 2.4 }, effect: 'cheese',
  },
  jelly: {
    id: 'jelly', emoji: '🍮', price: 380, speed: 2,
    angle: 36, gravity: 18, radius: 0.42, area: 1.25, knock: 1.1, reload: 0.35,
    after: { kind: 'bounce', times: 2 }, effect: 'wobble',
  },
  watermelon: {
    id: 'watermelon', emoji: '🍉', price: 520, speed: 1,
    angle: 46, gravity: 15, radius: 0.72, area: 1.9, knock: 1.5, reload: 0.5,
    after: { kind: 'none' }, effect: 'smash',
  },
  donut: {
    id: 'donut', emoji: '🍩', price: 700, speed: 2,
    angle: 32, gravity: 18, radius: 0.48, area: 1.2, knock: 1.1, reload: 0.4,
    after: { kind: 'rings', count: 3 }, effect: 'rings',
  },
  pie: {
    id: 'pie', emoji: '🥧', price: 900, speed: 1,
    angle: 52, gravity: 14, radius: 0.62, area: 2.5, knock: 1.3, reload: 0.55,
    after: { kind: 'none' }, effect: 'splash',
  },
  pizza: {
    id: 'pizza', emoji: '🍕', price: 1200, speed: 2,
    angle: 40, gravity: 17, radius: 0.58, area: 0.95, knock: 1, reload: 0.45,
    after: { kind: 'split', count: 4 }, effect: 'slices',
  },
};

/** In shop order (also the order of the tray during play). */
export const FOOD_ORDER: FoodId[] = ['cookie', 'popcorn', 'cheese', 'jelly', 'watermelon', 'donut', 'pie', 'pizza'];

export function isFoodId(v: unknown): v is FoodId {
  return typeof v === 'string' && v in FOODS;
}

/** Width of the hit, for the shop's bars: 1 small … 3 huge. */
export function areaRank(f: Food): 1 | 2 | 3 {
  return f.area < 0.9 ? 1 : f.area < 1.6 ? 2 : 3;
}

/** What a food's two upgrade tiers improve. */
export type Boost = 'area' | 'bounce' | 'rings' | 'splash';
export const BOOST: Record<FoodId, Boost> = {
  cookie: 'area', popcorn: 'area', cheese: 'area', pizza: 'area',
  jelly: 'bounce', donut: 'rings', watermelon: 'splash', pie: 'splash',
};
export const MAX_TIER = 2;

/** A food with its upgrades: wider hits, an extra bounce, an extra ring, or a bigger splash. */
export function withTier(f: Food, tier: number): Food {
  if (tier <= 0) return f;
  const t = Math.min(MAX_TIER, tier);
  switch (BOOST[f.id]) {
    case 'bounce':
      return { ...f, after: f.after.kind === 'bounce' ? { kind: 'bounce', times: f.after.times + t } : f.after };
    case 'rings':
      return { ...f, after: f.after.kind === 'rings' ? { kind: 'rings', count: f.after.count + t } : f.after };
    default:
      return { ...f, area: f.area * (1 + 0.2 * t) };
  }
}

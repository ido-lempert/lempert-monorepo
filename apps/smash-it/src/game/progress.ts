/**
 * What the player keeps between plays: coins, foods won, upgrades, unlocked chapters, stars, best scores,
 * slingshot colours, the bug album and the daily challenge. Saved in localStorage; `parseProgress` accepts
 * anything (old or broken saves) and repairs it, so new versions keep old saves working.
 *
 * Foods are prizes for reaching chapters (shown off with a big reveal), not shop items. Coins buy
 * upgrades: two tiers for each food, a longer aiming guide and a longer combo window. Stars, summed over
 * all chapters, unlock slingshot colours (looks only).
 */
import type { BugKind } from './bugs';
import { FOOD_ORDER, type FoodId, isFoodId, MAX_TIER } from './foods';
import { LEVELS } from './levels';
import { BASE_COMBO_WINDOW } from './session';

export type UpgradeId = 'guide' | 'combo';

export interface Upgrade {
  id: UpgradeId;
  emoji: string;
  /** Price of each tier. */
  prices: number[];
}

export const UPGRADES: Record<UpgradeId, Upgrade> = {
  /** A longer aiming guide than the chapter gives. */
  guide: { id: 'guide', emoji: '🎯', prices: [150, 350, 700] },
  /** More time to keep a combo going. */
  combo: { id: 'combo', emoji: '⏱️', prices: [200, 450, 900] },
};
export const UPGRADE_ORDER: UpgradeId[] = ['guide', 'combo'];
/** The old "fast reload" upgrade, refunded now that the slingshot reloads at once. */
const OLD_RELOAD_PRICES = [180, 400, 800];

/** The food won for finishing each chapter. */
export const FOOD_PRIZES: Partial<Record<number, FoodId>> = { 2: 'popcorn', 3: 'jelly', 5: 'watermelon', 7: 'cheese', 10: 'donut', 13: 'pie', 17: 'pizza' };

export type SkinId = 'classic' | 'mint' | 'candy' | 'sunny' | 'ocean' | 'rainbow' | 'galaxy';

/** Slingshot colours and the total stars that unlock them. */
export const SKINS: { id: SkinId; stars: number; emoji: string }[] = [
  { id: 'classic', stars: 0, emoji: '🪵' },
  { id: 'mint', stars: 10, emoji: '🌿' },
  { id: 'candy', stars: 25, emoji: '🍬' },
  { id: 'sunny', stars: 50, emoji: '🌞' },
  { id: 'ocean', stars: 80, emoji: '🌊' },
  { id: 'rainbow', stars: 120, emoji: '🌈' },
  { id: 'galaxy', stars: 180, emoji: '🌌' },
];

export interface Progress {
  v: 1;
  coins: number;
  owned: FoodId[];
  upgrades: Record<UpgradeId, number>;
  /** Upgrade tier of each food (0..MAX_TIER). */
  tiers: Partial<Record<FoodId, number>>;
  /** The highest chapter that can be played. */
  unlocked: number;
  stars: Record<number, number>;
  best: Record<number, number>;
  food: FoodId;
  skin: SkinId;
  /** Hits per kind of bug, for the album. */
  album: Partial<Record<BugKind, number>>;
  /** The daily challenge: its date and the best score. */
  daily: { date: string; best: number };
  /** Failures in a row on one chapter (after two, a longer guide is offered). */
  fails: { level: number; n: number };
  /** Tips already shown and parts of the game already opened (shown once, when they matter). */
  seen: string[];
}

export const KEY = 'smashIt.progress';

export function newProgress(): Progress {
  return {
    v: 1, coins: 0, owned: ['cookie'], upgrades: { guide: 0, combo: 0 }, tiers: {}, unlocked: 1, stars: {}, best: {},
    food: 'cookie', skin: 'classic', album: {}, daily: { date: '', best: 0 }, fails: { level: 0, n: 0 }, seen: [],
  };
}

const count = (v: unknown, max = Infinity) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);

function numberMap(v: unknown, max: number): Record<number, number> {
  const out: Record<number, number> = {};
  if (v && typeof v === 'object')
    for (const [k, n] of Object.entries(v)) {
      const id = Number(k);
      if (LEVELS.some((l) => l.id === id)) out[id] = count(n, max);
    }
  return out;
}

/** Foods won by finishing every chapter before `unlocked`. */
export function prizesUpTo(unlocked: number): FoodId[] {
  return Object.entries(FOOD_PRIZES)
    .filter(([id]) => Number(id) < unlocked)
    .map(([, f]) => f!);
}

export function parseProgress(raw: unknown): Progress {
  const p = newProgress();
  if (!raw || typeof raw !== 'object') return p;
  const r = raw as Record<string, unknown>;
  p.coins = count(r.coins);
  p.unlocked = Math.max(1, Math.min(LEVELS.length, count(r.unlocked) || 1));
  // Foods bought in older versions stay, and every prize already earned is added.
  const owned = Array.isArray(r.owned) ? r.owned.filter(isFoodId) : [];
  const won = prizesUpTo(p.unlocked);
  p.owned = FOOD_ORDER.filter((f) => f === 'cookie' || owned.includes(f) || won.includes(f));
  const up = (r.upgrades ?? {}) as Record<string, unknown>;
  for (const id of UPGRADE_ORDER) p.upgrades[id] = count(up[id], UPGRADES[id].prices.length);
  // Refund the retired fast-reload upgrade.
  p.coins += OLD_RELOAD_PRICES.slice(0, count(up.reload, 3)).reduce((a, b) => a + b, 0);
  const tiers = (r.tiers ?? {}) as Record<string, unknown>;
  for (const f of p.owned) if (count(tiers[f], MAX_TIER)) p.tiers[f] = count(tiers[f], MAX_TIER);
  p.stars = numberMap(r.stars, 3);
  p.best = numberMap(r.best, Infinity);
  p.food = isFoodId(r.food) && p.owned.includes(r.food) ? r.food : 'cookie';
  const skin = SKINS.find((s) => s.id === r.skin);
  p.skin = skin && totalStars(p) >= skin.stars ? skin.id : 'classic';
  const album = (r.album ?? {}) as Record<string, unknown>;
  for (const [k, n] of Object.entries(album)) if (count(n)) p.album[k as BugKind] = count(n);
  const daily = (r.daily ?? {}) as Record<string, unknown>;
  p.daily = { date: typeof daily.date === 'string' ? daily.date.slice(0, 10) : '', best: count(daily.best) };
  const fails = (r.fails ?? {}) as Record<string, unknown>;
  p.fails = { level: count(fails.level), n: count(fails.n, 99) };
  p.seen = Array.isArray(r.seen) ? [...new Set(r.seen.filter((s): s is string => typeof s === 'string'))].slice(0, 300) : [];
  // Saves from before the shop was hidden at first: whoever already bought something has seen it.
  if (p.owned.length > 1 && !p.seen.includes('shop')) p.seen.push('shop');
  return p;
}

export function loadProgress(storage: Pick<Storage, 'getItem'> = localStorage): Progress {
  try {
    return parseProgress(JSON.parse(storage.getItem(KEY) ?? 'null'));
  } catch {
    return newProgress();
  }
}

export function saveProgress(p: Progress, storage: Pick<Storage, 'setItem'> = localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode or full: play on without saving */
  }
}

// --- What to show when -------------------------------------------------------------------------------

/** Marks a tip as shown; returns false when it already was. */
export function firstTime(p: Progress, id: string): boolean {
  if (p.seen.includes(id)) return false;
  p.seen.push(id);
  return true;
}

/** The shop opens once there are coins for an upgrade, and stays from then on. */
export function shopOpen(p: Progress): boolean {
  return p.seen.includes('shop');
}

/** Something the coins can buy right now (to offer the shop at the end of a chapter). */
export function canAffordUpgrade(p: Progress): boolean {
  return p.owned.some((f) => (tierPrice(p, f) ?? Infinity) <= p.coins) || UPGRADE_ORDER.some((u) => (upgradePrice(p, u) ?? Infinity) <= p.coins);
}

/** The chapter list is only worth showing once there is more than one chapter. */
export function chaptersOpen(p: Progress): boolean {
  return p.unlocked >= 2;
}

/** The daily challenge opens after the first king. */
export function dailyOpen(p: Progress): boolean {
  return p.unlocked > 5;
}

/** The next food prize: which, and after which chapter. */
export function nextPrize(p: Progress): { food: FoodId; after: number } | null {
  for (const [id, f] of Object.entries(FOOD_PRIZES)) if (!p.owned.includes(f!) && Number(id) >= p.unlocked - 1) return { food: f!, after: Number(id) };
  return null;
}

export function totalStars(p: Progress): number {
  return Object.values(p.stars).reduce((a, b) => a + b, 0);
}

// --- Shop -------------------------------------------------------------------------------------------

/** Price of a food's next upgrade tier, or null when maxed out (or not won yet). */
export function tierPrice(p: Progress, id: FoodId): number | null {
  const tier = p.tiers[id] ?? 0;
  if (tier >= MAX_TIER || !p.owned.includes(id)) return null;
  const order = FOOD_ORDER.indexOf(id);
  return tier === 0 ? 150 + order * 60 : 400 + order * 120;
}

export function buyTier(p: Progress, id: FoodId): boolean {
  const price = tierPrice(p, id);
  if (price === null || p.coins < price) return false;
  p.coins -= price;
  p.tiers[id] = (p.tiers[id] ?? 0) + 1;
  return true;
}

/** Price of the next tier, or null when maxed out. */
export function upgradePrice(p: Progress, id: UpgradeId): number | null {
  return UPGRADES[id].prices[p.upgrades[id]] ?? null;
}

export function buyUpgrade(p: Progress, id: UpgradeId): boolean {
  const price = upgradePrice(p, id);
  if (price === null || p.coins < price) return false;
  p.coins -= price;
  p.upgrades[id]++;
  return true;
}

export function chooseSkin(p: Progress, id: SkinId): boolean {
  const s = SKINS.find((k) => k.id === id);
  if (!s || totalStars(p) < s.stars) return false;
  p.skin = id;
  return true;
}

// --- Effects of upgrades ------------------------------------------------------------------------------

/** How much of the aiming guide shows: the chapter's own, or more with the guide upgrade. */
export function guideLength(p: Progress, levelGuide: number): number {
  return Math.max(levelGuide, [0, 0.3, 0.55, 0.8][p.upgrades.guide] ?? 0);
}

export function comboWindow(p: Progress): number {
  return BASE_COMBO_WINDOW + p.upgrades.combo * 0.75;
}

// --- End of a chapter -------------------------------------------------------------------------------

export interface Finish {
  levelId: number;
  success: boolean;
  score: number;
  stars: number;
  coins: number;
  /** Hits per kind of bug in this play. */
  hits?: Partial<Record<BugKind, number>>;
}

export interface Prizes {
  /** The next chapter opened. */
  opened: boolean;
  foods: FoodId[];
  skins: SkinId[];
}

/** Banks a finished chapter: coins, the album, stars, and any prizes it won. */
export function finishLevel(p: Progress, f: Finish): Prizes {
  const prizes: Prizes = { opened: false, foods: [], skins: [] };
  p.coins += f.coins;
  for (const [k, n] of Object.entries(f.hits ?? {})) p.album[k as BugKind] = (p.album[k as BugKind] ?? 0) + (n ?? 0);
  p.best[f.levelId] = Math.max(p.best[f.levelId] ?? 0, f.score);
  if (!f.success) {
    p.fails = { level: f.levelId, n: p.fails.level === f.levelId ? p.fails.n + 1 : 1 };
    return prizes;
  }
  p.fails = { level: 0, n: 0 };
  const starsBefore = totalStars(p);
  p.stars[f.levelId] = Math.max(p.stars[f.levelId] ?? 0, f.stars);
  const after = totalStars(p);
  prizes.skins = SKINS.filter((s) => s.stars > starsBefore && s.stars <= after).map((s) => s.id);
  const food = FOOD_PRIZES[f.levelId];
  if (food && !p.owned.includes(food)) {
    p.owned = FOOD_ORDER.filter((x) => x === food || p.owned.includes(x));
    prizes.foods.push(food);
  }
  const next = Math.min(LEVELS.length, f.levelId + 1);
  prizes.opened = next > p.unlocked;
  p.unlocked = Math.max(p.unlocked, next);
  return prizes;
}

/** A daily challenge result: keeps the best of the day. Returns true for a new best. */
export function finishDaily(p: Progress, date: string, score: number, coins: number): boolean {
  p.coins += coins;
  if (p.daily.date !== date) p.daily = { date, best: 0 };
  const better = score > p.daily.best;
  p.daily.best = Math.max(p.daily.best, score);
  return better;
}

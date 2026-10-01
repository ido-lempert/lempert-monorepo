/**
 * What the player keeps between plays: coins, foods bought, upgrades, unlocked chapters, stars and best
 * scores. Saved in localStorage; `parseProgress` accepts anything (old or broken saves) and repairs it,
 * so new versions keep old saves working.
 */
import { FOOD_ORDER, FOODS, type FoodId, isFoodId } from './foods';
import { LEVELS } from './levels';
import { BASE_COMBO_WINDOW } from './session';

export type UpgradeId = 'guide' | 'combo' | 'reload';

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
  /** Faster reloading. */
  reload: { id: 'reload', emoji: '⚡', prices: [180, 400, 800] },
};
export const UPGRADE_ORDER: UpgradeId[] = ['guide', 'combo', 'reload'];

export interface Progress {
  v: 1;
  coins: number;
  owned: FoodId[];
  upgrades: Record<UpgradeId, number>;
  /** The highest chapter that can be played. */
  unlocked: number;
  stars: Record<number, number>;
  best: Record<number, number>;
  food: FoodId;
}

export const KEY = 'smashIt.progress';

export function newProgress(): Progress {
  return { v: 1, coins: 0, owned: ['cookie'], upgrades: { guide: 0, combo: 0, reload: 0 }, unlocked: 1, stars: {}, best: {}, food: 'cookie' };
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

export function parseProgress(raw: unknown): Progress {
  const p = newProgress();
  if (!raw || typeof raw !== 'object') return p;
  const r = raw as Record<string, unknown>;
  p.coins = count(r.coins);
  const owned = Array.isArray(r.owned) ? r.owned.filter(isFoodId) : [];
  p.owned = FOOD_ORDER.filter((f) => f === 'cookie' || owned.includes(f));
  const up = (r.upgrades ?? {}) as Record<string, unknown>;
  for (const id of UPGRADE_ORDER) p.upgrades[id] = count(up[id], UPGRADES[id].prices.length);
  p.unlocked = Math.max(1, Math.min(LEVELS.length, count(r.unlocked) || 1));
  p.stars = numberMap(r.stars, 3);
  p.best = numberMap(r.best, Infinity);
  p.food = isFoodId(r.food) && p.owned.includes(r.food) ? r.food : 'cookie';
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

// --- Shop -------------------------------------------------------------------------------------------

export function buyFood(p: Progress, id: FoodId): boolean {
  const price = FOODS[id].price;
  if (p.owned.includes(id) || p.coins < price) return false;
  p.coins -= price;
  p.owned = FOOD_ORDER.filter((f) => f === id || p.owned.includes(f));
  p.food = id;
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

// --- Effects of upgrades ------------------------------------------------------------------------------

/** How much of the aiming guide shows: the chapter's own, or more with the guide upgrade. */
export function guideLength(p: Progress, levelGuide: number): number {
  return Math.max(levelGuide, [0, 0.3, 0.55, 0.8][p.upgrades.guide] ?? 0);
}

export function comboWindow(p: Progress): number {
  return BASE_COMBO_WINDOW + p.upgrades.combo * 0.75;
}

export function reloadTime(p: Progress, base: number): number {
  return base * (1 - 0.15 * p.upgrades.reload);
}

// --- End of a chapter -------------------------------------------------------------------------------

export interface Finish {
  levelId: number;
  success: boolean;
  score: number;
  stars: number;
  coins: number;
}

/** Banks a finished chapter. Returns true when it opened the next chapter. */
export function finishLevel(p: Progress, f: Finish): boolean {
  p.coins += f.coins;
  p.best[f.levelId] = Math.max(p.best[f.levelId] ?? 0, f.score);
  if (!f.success) return false;
  p.stars[f.levelId] = Math.max(p.stars[f.levelId] ?? 0, f.stars);
  const next = Math.min(LEVELS.length, f.levelId + 1);
  const opened = next > p.unlocked;
  p.unlocked = Math.max(p.unlocked, next);
  return opened;
}

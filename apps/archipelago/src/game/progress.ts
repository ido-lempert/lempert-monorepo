/** What the player has done, saved in localStorage. Old saves go through parseProgress. */
import { LEVELS } from './levels';
import type { ConceptId } from './types';

export interface Progress {
  v: 1;
  /** Best stars per level id. */
  stars: Record<string, number>;
  /** Concept cards collected, in the order they were won. */
  cards: ConceptId[];
  /** One-time tips already shown. */
  seen: string[];
}

export const emptyProgress = (): Progress => ({ v: 1, stars: {}, cards: [], seen: [] });

export function parseProgress(raw: string | null): Progress {
  const p = emptyProgress();
  if (!raw) return p;
  try {
    const d = JSON.parse(raw);
    if (d && typeof d.stars === 'object') for (const [k, v] of Object.entries(d.stars)) if (typeof v === 'number') p.stars[k] = Math.max(0, Math.min(3, v));
    if (Array.isArray(d.cards)) p.cards = d.cards.filter((c: unknown) => typeof c === 'string');
    if (Array.isArray(d.seen)) p.seen = d.seen.filter((c: unknown) => typeof c === 'string');
  } catch {
    // A broken save starts over rather than breaking the game.
  }
  return p;
}

/** 3 stars for solving on the first run, 2 on the second, 1 after that. */
export const starsFor = (runs: number) => (runs <= 1 ? 3 : runs === 2 ? 2 : 1);

export function recordWin(p: Progress, levelId: string, runs: number): Progress {
  const level = LEVELS.find((l) => l.id === levelId);
  const stars = Math.max(p.stars[levelId] ?? 0, starsFor(runs));
  const cards = level && !p.cards.includes(level.concept) ? [...p.cards, level.concept] : p.cards;
  return { ...p, stars: { ...p.stars, [levelId]: stars }, cards };
}

/** The first level not solved yet, or the last one when all are. */
export function nextLevel(p: Progress): string {
  return (LEVELS.find((l) => !(l.id in p.stars)) ?? LEVELS[LEVELS.length - 1]).id;
}

export function firstTime(p: Progress, tip: string): boolean {
  if (p.seen.includes(tip)) return false;
  p.seen.push(tip);
  return true;
}

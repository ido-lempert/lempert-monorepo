import { describe, expect, it } from 'vitest';
import { FOODS, withTier } from './foods';
import { dailyLevel, DAILY_ID, LEVELS } from './levels';
import {
  buyTier, buyUpgrade, canAffordUpgrade, chooseSkin, finishDaily, finishLevel, firstTime, FOOD_PRIZES, guideLength,
  newProgress, nextPrize, parseProgress, shopOpen, tierPrice, totalStars, upgradePrice,
} from './progress';

describe('progress', () => {
  it('starts with the cookie and chapter 1', () => {
    expect(newProgress()).toMatchObject({ coins: 0, owned: ['cookie'], unlocked: 1, food: 'cookie', skin: 'classic' });
  });

  it('repairs broken or foreign saves', () => {
    expect(parseProgress(null)).toEqual(newProgress());
    expect(parseProgress('nope')).toEqual(newProgress());
    const p = parseProgress({
      coins: -5, owned: ['pie', 'banana', 'cookie'], upgrades: { guide: 9, combo: 'x' },
      unlocked: 999, stars: { 1: 7, 777: 3 }, best: { 2: 1234.6 }, food: 'pizza', skin: 'galaxy',
    });
    expect(p.coins).toBe(0);
    expect(p.upgrades).toEqual({ guide: 3, combo: 0 });
    expect(p.unlocked).toBe(LEVELS.length);
    expect(p.stars).toEqual({ 1: 3 });
    expect(p.best).toEqual({ 2: 1234 });
    // Every prize is earned by the last chapter, so pizza is fine; galaxy needs 180 stars.
    expect(p.food).toBe('pizza');
    expect(p.skin).toBe('classic');
  });

  it('gives old saves the foods they already earned, and refunds the fast-reload upgrade', () => {
    const p = parseProgress({ unlocked: 6, owned: ['cookie', 'pie'], upgrades: { reload: 2 }, coins: 10 });
    expect(p.owned).toEqual(['cookie', 'popcorn', 'jelly', 'watermelon', 'pie']);
    expect(p.coins).toBe(10 + 180 + 400);
  });

  it('wins foods as prizes for finishing chapters, and tells which one is next', () => {
    const p = newProgress();
    expect(nextPrize(p)).toEqual({ food: 'popcorn', after: 2 });
    expect(finishLevel(p, { levelId: 1, success: true, score: 900, stars: 2, coins: 100 }).foods).toEqual([]);
    expect(finishLevel(p, { levelId: 2, success: true, score: 900, stars: 2, coins: 100 }).foods).toEqual(['popcorn']);
    expect(p.owned).toContain('popcorn');
    expect(nextPrize(p)).toEqual({ food: 'jelly', after: 3 });
    // Losing a chapter wins nothing.
    expect(finishLevel(p, { levelId: 3, success: false, score: 10, stars: 0, coins: 5 }).foods).toEqual([]);
    expect(Object.values(FOOD_PRIZES)).toHaveLength(7);
  });

  it('banks coins, keeps the best, counts failures and opens the next chapter on a win', () => {
    const p = newProgress();
    expect(finishLevel(p, { levelId: 1, success: false, score: 300, stars: 0, coins: 15 }).opened).toBe(false);
    finishLevel(p, { levelId: 1, success: false, score: 200, stars: 0, coins: 0 });
    expect(p).toMatchObject({ coins: 15, unlocked: 1, best: { 1: 300 }, fails: { level: 1, n: 2 } });
    expect(finishLevel(p, { levelId: 1, success: true, score: 900, stars: 2, coins: 200, hits: { ant: 4 } }).opened).toBe(true);
    expect(p).toMatchObject({ coins: 215, unlocked: 2, stars: { 1: 2 }, best: { 1: 900 }, fails: { n: 0 }, album: { ant: 4 } });
  });

  it('unlocks slingshot colours with stars', () => {
    const p = newProgress();
    for (let i = 1; i <= 3; i++) finishLevel(p, { levelId: i, success: true, score: 1, stars: 3, coins: 0 });
    expect(totalStars(p)).toBe(9);
    expect(chooseSkin(p, 'mint')).toBe(false);
    expect(finishLevel(p, { levelId: 4, success: true, score: 1, stars: 1, coins: 0 }).skins).toEqual(['mint']);
    expect(chooseSkin(p, 'mint')).toBe(true);
    expect(p.skin).toBe('mint');
  });

  it('upgrades foods it has, two tiers each, and other upgrades', () => {
    const p = newProgress();
    expect(tierPrice(p, 'pie')).toBeNull();
    expect(canAffordUpgrade(p)).toBe(false);
    p.coins = 10_000;
    expect(canAffordUpgrade(p)).toBe(true);
    expect(buyTier(p, 'cookie')).toBe(true);
    expect(buyTier(p, 'cookie')).toBe(true);
    expect(buyTier(p, 'cookie')).toBe(false);
    expect(p.tiers.cookie).toBe(2);
    for (let i = 0; i < 3; i++) expect(buyUpgrade(p, 'guide')).toBe(true);
    expect(upgradePrice(p, 'guide')).toBeNull();
  });

  it('food tiers widen hits, add bounces and rings', () => {
    expect(withTier(FOODS.cookie, 2).area).toBeCloseTo(FOODS.cookie.area * 1.4);
    expect(withTier(FOODS.jelly, 1).after).toEqual({ kind: 'bounce', times: 3 });
    expect(withTier(FOODS.donut, 2).after).toEqual({ kind: 'rings', count: 5 });
    expect(withTier(FOODS.pie, 0)).toBe(FOODS.pie);
  });

  it('the guide upgrade never shortens a chapter guide', () => {
    const p = newProgress();
    expect(guideLength(p, 0.7)).toBe(0.7);
    p.upgrades.guide = 2;
    expect(guideLength(p, 0)).toBe(0.55);
  });

  it('shows each tip once and remembers it', () => {
    const p = newProgress();
    expect(firstTime(p, 'combo')).toBe(true);
    expect(firstTime(p, 'combo')).toBe(false);
    expect(parseProgress(JSON.parse(JSON.stringify(p))).seen).toEqual(['combo']);
    expect(shopOpen(p)).toBe(false);
  });

  it('the daily challenge is the same all day, different the next, and keeps the best', () => {
    const a = dailyLevel('2026-10-02', 30);
    expect(dailyLevel('2026-10-02', 30)).toEqual(a);
    expect(a.id).toBe(DAILY_ID);
    expect(a.boss).toBeUndefined();
    expect(a.world).toBeLessThanOrEqual(3);
    const days = new Set(['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'].map((d) => JSON.stringify(dailyLevel(d, 100).goals)));
    expect(days.size).toBeGreaterThan(1);
    const p = newProgress();
    expect(finishDaily(p, '2026-10-02', 500, 50)).toBe(true);
    expect(finishDaily(p, '2026-10-02', 300, 30)).toBe(false);
    expect(p.daily).toEqual({ date: '2026-10-02', best: 500 });
    expect(finishDaily(p, '2026-10-03', 100, 10)).toBe(true);
    expect(p.coins).toBe(90);
  });
});

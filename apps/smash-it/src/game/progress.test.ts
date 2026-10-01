import { describe, expect, it } from 'vitest';
import { FOODS } from './foods';
import { LEVELS } from './levels';
import { buyFood, buyUpgrade, finishLevel, guideLength, newProgress, parseProgress, reloadTime, upgradePrice } from './progress';

describe('progress', () => {
  it('starts with the cookie and chapter 1', () => {
    expect(newProgress()).toMatchObject({ coins: 0, owned: ['cookie'], unlocked: 1, food: 'cookie' });
  });

  it('repairs broken or foreign saves', () => {
    expect(parseProgress(null)).toEqual(newProgress());
    expect(parseProgress('nope')).toEqual(newProgress());
    const p = parseProgress({
      coins: -5, owned: ['pie', 'banana', 'cookie'], upgrades: { guide: 9, combo: 'x' },
      unlocked: 999, stars: { 1: 7, 77: 3 }, best: { 2: 1234.6 }, food: 'pizza',
    });
    expect(p.coins).toBe(0);
    expect(p.owned).toEqual(['cookie', 'pie']);
    expect(p.upgrades).toEqual({ guide: 3, combo: 0, reload: 0 });
    expect(p.unlocked).toBe(LEVELS.length);
    expect(p.stars).toEqual({ 1: 3 });
    expect(p.best).toEqual({ 2: 1234 });
    expect(p.food).toBe('cookie');
  });

  it('buys foods and upgrades with coins only', () => {
    const p = newProgress();
    expect(buyFood(p, 'popcorn')).toBe(false);
    p.coins = FOODS.popcorn.price + 10;
    expect(buyFood(p, 'popcorn')).toBe(true);
    expect(p).toMatchObject({ coins: 10, owned: ['cookie', 'popcorn'], food: 'popcorn' });
    expect(buyFood(p, 'popcorn')).toBe(false);

    p.coins = 10_000;
    for (let i = 0; i < 3; i++) expect(buyUpgrade(p, 'reload')).toBe(true);
    expect(buyUpgrade(p, 'reload')).toBe(false);
    expect(upgradePrice(p, 'reload')).toBeNull();
    expect(reloadTime(p, 1)).toBeCloseTo(0.55);
  });

  it('the guide upgrade never shortens a chapter guide', () => {
    const p = newProgress();
    expect(guideLength(p, 0.7)).toBe(0.7);
    p.upgrades.guide = 2;
    expect(guideLength(p, 0)).toBe(0.55);
    expect(guideLength(p, 1)).toBe(1);
  });

  it('banks coins, keeps the best and opens the next chapter on a win', () => {
    const p = newProgress();
    expect(finishLevel(p, { levelId: 1, success: false, score: 300, stars: 0, coins: 15 })).toBe(false);
    expect(p).toMatchObject({ coins: 15, unlocked: 1, best: { 1: 300 } });
    expect(finishLevel(p, { levelId: 1, success: true, score: 900, stars: 2, coins: 200 })).toBe(true);
    expect(p).toMatchObject({ coins: 215, unlocked: 2, stars: { 1: 2 }, best: { 1: 900 } });
    finishLevel(p, { levelId: 1, success: true, score: 100, stars: 1, coins: 0 });
    expect(p.stars[1]).toBe(2);
  });
});

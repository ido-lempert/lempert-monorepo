import { describe, expect, it } from 'vitest';
import { FOOD_ORDER, FOODS, MAX_TIER, withTier } from './foods';
import { ALLY_FROM, dailyLevel, DAILY_ID, LEVELS } from './levels';
import {
  ammoFor, buyTier, buyUpgrade, canAffordUpgrade, chooseSkin, finishDaily, finishLevel, firstTime, FOOD_PRIZES, guideLength,
  newProgress, nextPrize, parseProgress, shopOpen, tierBlocker, tierPrice, totalStars, friendFor, umbrellaFor, upgradePrice, upgradeVisible,
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
    expect(p.upgrades).toEqual({ ammo: 0, guide: 3, combo: 0, umbrella: 0, friend: 0 });
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

  it('upgrades foods it has, five tiers each, and other upgrades', () => {
    const p = newProgress();
    expect(tierPrice(p, 'pie')).toBeNull();
    expect(canAffordUpgrade(p)).toBe(false);
    p.coins = 100_000;
    expect(canAffordUpgrade(p)).toBe(true);
    for (let i = 0; i < MAX_TIER; i++) expect(buyTier(p, 'cookie')).toBe(true);
    expect(buyTier(p, 'cookie')).toBe(false);
    expect(p.tiers.cookie).toBe(MAX_TIER);
    for (let i = 0; i < 3; i++) expect(buyUpgrade(p, 'guide')).toBe(true);
    expect(upgradePrice(p, 'guide')).toBeNull();
  });

  it('prices climb with each tier and with each food', () => {
    const p = newProgress();
    p.owned = ['cookie', 'pizza'];
    const prices: number[] = [];
    p.coins = 1e9;
    p.tiers.pizza = 0;
    for (let i = 0; i < MAX_TIER; i++) {
      prices.push(tierPrice(p, 'pizza')!);
      p.tiers.pizza = i + 1;
    }
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(new Set(prices).size).toBe(MAX_TIER);
    expect(tierPrice(newProgress(), 'cookie')!).toBeLessThan(prices[0]);
  });

  it('a food can only be upgraded once the food before it is fully upgraded', () => {
    const p = newProgress();
    p.owned = ['cookie', 'popcorn', 'cheese'];
    p.coins = 1e9;
    expect(tierBlocker(p, 'cookie')).toBeNull();
    expect(tierBlocker(p, 'popcorn')).toBe('cookie');
    expect(buyTier(p, 'popcorn')).toBe(false);
    expect(tierBlocker(p, 'cheese')).toBe('popcorn');
    for (let i = 0; i < MAX_TIER; i++) buyTier(p, 'cookie');
    expect(tierBlocker(p, 'popcorn')).toBeNull();
    expect(buyTier(p, 'popcorn')).toBe(true);
    expect(buyTier(p, 'cheese')).toBe(false);
    // Coins alone do not make the shop worth opening while the food is locked.
    const q = newProgress();
    q.owned = ['cookie', 'popcorn'];
    for (let i = 0; i < MAX_TIER; i++) q.tiers.cookie = i + 1;
    q.coins = 0;
    expect(canAffordUpgrade(q)).toBe(false);
  });

  it('the ammo upgrade adds shots to every chapter', () => {
    const p = newProgress();
    expect(ammoFor(p, 30)).toBe(30);
    p.coins = 1e9;
    buyUpgrade(p, 'ammo');
    buyUpgrade(p, 'ammo');
    expect(ammoFor(p, 30)).toBe(37);
    // Every tier adds more than the one before, so the last ones are the big ones.
    const steps = [0, 1, 2, 3, 4, 5].map((n) => ammoFor({ ...p, upgrades: { ...p.upgrades, ammo: n } }, 30));
    for (let i = 2; i < steps.length; i++) expect(steps[i] - steps[i - 1]).toBeGreaterThan(steps[i - 1] - steps[i - 2]);
  });

  it('foods cost different amounts of ammo, and heavy ones get cheaper with tiers', () => {
    const costs = FOOD_ORDER.map((id) => FOODS[id].cost);
    expect(new Set(costs).size).toBeGreaterThanOrEqual(4);
    expect(FOODS.popcorn.cost).toBeLessThan(FOODS.cookie.cost);
    expect(FOODS.pie.cost).toBeGreaterThan(FOODS.cookie.cost);
    expect(withTier(FOODS.pie, 3).cost).toBe(FOODS.pie.cost - 1);
    expect(withTier(FOODS.pie, 5).cost).toBe(FOODS.pie.cost - 2);
    expect(withTier(FOODS.cookie, 5).cost).toBe(FOODS.cookie.cost);
    expect(withTier(FOODS.popcorn, 5).cost).toBe(FOODS.popcorn.cost);
    for (const id of FOOD_ORDER) expect(withTier(FOODS[id], 5).cost).toBeGreaterThanOrEqual(FOODS.popcorn.cost);
  });

  it('food tiers widen hits, add bounces and rings', () => {
    expect(withTier(FOODS.cookie, 2).area).toBeCloseTo(FOODS.cookie.area * 1.4);
    expect(withTier(FOODS.jelly, 1).after).toEqual({ kind: 'bounce', times: 3 });
    expect(withTier(FOODS.donut, 2).after).toEqual({ kind: 'rings', count: 5 });
    expect(withTier(FOODS.pie, 0)).toBe(FOODS.pie);
    // The later tiers keep adding a little, and never past the top.
    expect(withTier(FOODS.cookie, 5).area).toBeGreaterThan(withTier(FOODS.cookie, 2).area);
    expect(withTier(FOODS.cookie, 99)).toEqual(withTier(FOODS.cookie, MAX_TIER));
    expect(withTier(FOODS.jelly, 5).after).toEqual({ kind: 'bounce', times: 5 });
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

describe('umbrella', () => {
  it('shows up in the shop only once acid does, and gets longer and quicker with each tier', () => {
    const p = newProgress();
    expect(upgradeVisible(p, 'umbrella')).toBe(false);
    expect(upgradeVisible(p, 'ammo')).toBe(true);
    p.unlocked = 21;
    expect(upgradeVisible(p, 'umbrella')).toBe(true);
    const base = umbrellaFor(p);
    p.coins = 99999;
    expect(buyUpgrade(p, 'umbrella')).toBe(true);
    const better = umbrellaFor(p);
    expect(better.open).toBeGreaterThan(base.open);
    expect(better.cooldown).toBeLessThan(base.cooldown);
  });

  it('is not offered to a player who cannot use it yet', () => {
    const p = newProgress();
    p.coins = 300;
    p.tiers = { cookie: MAX_TIER };
    p.upgrades = { ammo: 5, guide: 3, combo: 3, umbrella: 0, friend: 0 };
    expect(canAffordUpgrade(p)).toBe(false);
    p.unlocked = 21;
    expect(canAffordUpgrade(p)).toBe(true);
  });
});

describe('friend', () => {
  it('is a late prize: the king of chapter 30 gives it and it helps from chapter 31, and each tier stays longer, throws faster and returns sooner', () => {
    const p = newProgress();
    expect(upgradeVisible(p, 'friend')).toBe(false);
    p.unlocked = ALLY_FROM - 1;
    expect(upgradeVisible(p, 'friend')).toBe(false);
    p.unlocked = ALLY_FROM;
    expect(upgradeVisible(p, 'friend')).toBe(true);
    const base = friendFor(p);
    p.coins = 99999;
    expect(buyUpgrade(p, 'friend')).toBe(true);
    const better = friendFor(p);
    expect(better.life).toBeGreaterThan(base.life);
    expect(better.every).toBeLessThan(base.every);
    expect(better.rest).toBeLessThan(base.rest);
  });

  it('is won once, by beating the chapter before the first one it helps in', () => {
    expect(ALLY_FROM).toBeGreaterThanOrEqual(21);
    expect(LEVELS[ALLY_FROM - 2].boss).toBeDefined();
    expect(LEVELS[ALLY_FROM - 1].ally).toBe(true);
    expect(LEVELS[ALLY_FROM - 2].ally).toBe(false);
    const p = newProgress();
    p.unlocked = ALLY_FROM - 1;
    const win = (id: number) => finishLevel(p, { levelId: id, success: true, score: 1000, stars: 1, coins: 0 });
    expect(win(ALLY_FROM - 3).friend).toBe(false);
    expect(win(ALLY_FROM - 1).friend).toBe(true);
    expect(win(ALLY_FROM - 1).friend).toBe(false);
  });
});

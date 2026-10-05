import { describe, expect, it } from 'vitest';
import { FIRST_NIGHT, Night, clock, playNight } from './night';

const calm = { ...FIRST_NIGHT, peak: { ...FIRST_NIGHT.peak, groups: 0 } };

describe('the first night', () => {
  it('replays exactly with the same cards', () => {
    const a = playNight(FIRST_NIGHT, [{ card: 'extraWaiter', at: 100 }]);
    const b = playNight(FIRST_NIGHT, [{ card: 'extraWaiter', at: 100 }]);
    expect(b.log).toEqual(a.log);
    expect(b.summary()).toEqual(a.summary());
  });

  it('is calm without the bus: one waiter is enough', () => {
    const s = playNight(calm).summary();
    expect(s.leftAngry).toBe(0);
    expect(s.unhappy).toBe(0);
  });

  it('overloads one waiter when the bus comes', () => {
    const s = playNight(FIRST_NIGHT).summary();
    expect(s.leftAngry).toBeGreaterThanOrEqual(3);
    expect(s.reputation).toBeLessThan(0);
    expect(s.avgWait).toBeGreaterThan(10);
  });

  it('handles the rush with an extra waiter, played before or during the night', () => {
    const none = playNight(FIRST_NIGHT).summary();
    for (const at of [0, 90, 125]) {
      const s = playNight(FIRST_NIGHT, [{ card: 'extraWaiter', at }]).summary();
      expect(s.leftAngry).toBe(0);
      expect(s.reputation).toBeGreaterThan(0);
      expect(s.cards).toBe(300);
      expect(s.profit).toBeGreaterThan(none.profit);
    }
  });

  it('plays a card once per night, and the new waiter starts from that minute', () => {
    const n = new Night(FIRST_NIGHT);
    for (let i = 0; i < 30; i++) n.step();
    expect(n.play('extraWaiter')).toBe(true);
    expect(n.play('extraWaiter')).toBe(false);
    expect(n.waiters).toHaveLength(2);
    expect(n.waiters[1].joined).toBe(30);
  });

  it('every group that came in ends the night gone, and tables are free', () => {
    const n = playNight(FIRST_NIGHT);
    expect(n.groups.every((g) => g.state === 'gone' && g.mood !== null)).toBe(true);
    expect(n.tables.every((t) => t === null)).toBe(true);
  });

  it('shows the clock from 18:00', () => {
    expect(clock(0)).toBe('18:00');
    expect(clock(125)).toBe('20:05');
  });
});

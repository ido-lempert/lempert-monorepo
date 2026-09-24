import { describe, expect, it } from 'vitest';
import {
  available,
  buyWear,
  fullAvatar,
  ownsWear,
  setAvatar,
  WEAR_PRICES,
  buy,
  completeQuest,
  findSpecies,
  finishHunt,
  huntReward,
  MAX_PLACED,
  newProgress,
  parseProgress,
  place,
  type Progress,
  QUEST_REWARD,
  removePlaced,
  rotatePlaced,
  SPECIES,
  startQuest,
} from './progress';

describe('Abraham quest', () => {
  it('goes talk → collect all four species → return → reward', () => {
    let p = startQuest(newProgress());
    expect(p.quest.stage).toBe('collecting');
    expect(p.achievements).toContain('metAbraham');

    for (const s of SPECIES.slice(0, 3)) p = findSpecies(p, s);
    expect(p.quest.stage).toBe('collecting');
    p = findSpecies(p, 'arava');
    expect(p.quest.stage).toBe('returning');
    expect(p.achievements).toContain('fourSpecies');

    p = completeQuest(p);
    expect(p.quest.stage).toBe('done');
    expect(p.coins).toBe(QUEST_REWARD.coins);
    expect(p.owned[QUEST_REWARD.item]).toBe(1);
  });

  it('ignores species before the quest starts and duplicates', () => {
    let p = findSpecies(newProgress(), 'etrog');
    expect(p.quest.found).toEqual([]);
    p = findSpecies(findSpecies(startQuest(p), 'etrog'), 'etrog');
    expect(p.quest.found).toEqual(['etrog']);
  });

  it('cannot be completed twice', () => {
    let p = startQuest(newProgress());
    for (const s of SPECIES) p = findSpecies(p, s);
    p = completeQuest(completeQuest(p));
    expect(p.coins).toBe(QUEST_REWARD.coins);
  });
});

describe('economy and decorating', () => {
  it('buys only with enough coins', () => {
    const poor = buy(newProgress(), 'table');
    expect(poor.owned.table).toBeUndefined();
    const rich = buy({ ...newProgress(), coins: 40 }, 'table');
    expect(rich.coins).toBe(10);
    expect(rich.owned.table).toBe(1);
  });

  it('places only what is in the bag and takes it back on remove', () => {
    let p: Progress = { ...newProgress(), owned: { star: 1 } };
    p = place(p, { id: 'star', x: 0, z: 0, rot: 0 });
    expect(available(p, 'star')).toBe(0);
    expect(p.achievements).toContain('firstDecoration');
    expect(place(p, { id: 'star', x: 1, z: 1, rot: 0 }).placed).toHaveLength(1);
    p = removePlaced(p, 0);
    expect(available(p, 'star')).toBe(1);
  });

  it('limits the number of placed items', () => {
    let p: Progress = { ...newProgress(), owned: { chair: MAX_PLACED + 1 } };
    for (let i = 0; i <= MAX_PLACED; i++) p = place(p, { id: 'chair', x: 0, z: 0, rot: 0 });
    expect(p.placed).toHaveLength(MAX_PLACED);
  });

  it('rotates in 45° steps', () => {
    let p = place({ ...newProgress(), owned: { chair: 1 } }, { id: 'chair', x: 0, z: 0, rot: 0 });
    p = rotatePlaced(p, 0);
    expect(p.placed[0].rot).toBeCloseTo(Math.PI / 4);
  });
});

describe('etrog hunt rewards', () => {
  it('pays per etrog plus a bonus for beating the computer', () => {
    expect(huntReward(3, 5)).toBe(15);
    expect(huntReward(6, 5)).toBe(50);
    expect(huntReward(4, 4)).toBe(20);
  });

  it('keeps the best score', () => {
    const p = finishHunt(finishHunt(newProgress(), 7, 2), 3, 4);
    expect(p.bestHunt).toBe(7);
    expect(p.achievements).toEqual(['firstHunt', 'beatRival']);
  });
});

describe('saving', () => {
  it('round-trips and survives garbage', () => {
    const p = buy({ ...startQuest(newProgress()), coins: 30 }, 'rug');
    expect(parseProgress(JSON.stringify(p))).toEqual(p);
    expect(parseProgress('not json')).toEqual(newProgress());
    expect(parseProgress(null)).toEqual(newProgress());
    expect(parseProgress('{"version":99}')).toEqual(newProgress());
  });
});

describe('character wearables', () => {
  const avatar = { name: 'נועה', skin: '#f1c7a0', shirt: '#2a9d8f', hat: 'kippah' as const };

  it('fills in defaults for avatars saved before the new options', () => {
    const a = fullAvatar(avatar);
    expect(a.hairStyle).toBe('short');
    expect(a.accessory).toBe('none');
  });

  it('has free basics and paid festive items', () => {
    const p = newProgress();
    expect(ownsWear(p, 'kippah')).toBe(true);
    expect(ownsWear(p, 'glasses')).toBe(true);
    expect(ownsWear(p, 'crown')).toBe(false);
  });

  it('buys a wearable once, only with enough coins', () => {
    expect(buyWear(newProgress(), 'crown').ownedWear).toEqual([]);
    let p: Progress = { ...newProgress(), coins: 100 };
    p = buyWear(buyWear(p, 'crown'), 'crown');
    expect(p.ownedWear).toEqual(['crown']);
    expect(p.coins).toBe(100 - WEAR_PRICES.crown!);
    expect(p.achievements).toContain('firstWear');
  });

  it('does not save items that were only tried on', () => {
    let p = setAvatar(newProgress(), { ...avatar, hat: 'cap' });
    p = setAvatar(p, { ...avatar, hat: 'crown', accessory: 'lantern' });
    expect(p.avatar!.hat).toBe('cap');
    expect(p.avatar!.accessory).toBe('none');
    p = setAvatar({ ...p, ownedWear: ['crown'] }, { ...avatar, hat: 'crown' });
    expect(p.avatar!.hat).toBe('crown');
  });
});

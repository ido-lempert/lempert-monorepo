import { describe, expect, it } from 'vitest';
import {
  currentGuest,
  findItem,
  type GuestId,
  QUEST_ITEMS,
  QUEST_REWARDS,
  resetItems,
  available,
  buyWear,
  fullAvatar,
  ownsWear,
  setAvatar,
  WEAR_PRICES,
  buy,
  completeQuest,
  finishHunt,
  huntReward,
  MAX_PLACED,
  newProgress,
  parseProgress,
  place,
  type Progress,
  removePlaced,
  rotatePlaced,
  SPECIES,
  startQuest,
} from './progress';

describe('Ushpizin quests', () => {
  const finish = (p: Progress, guest: GuestId) => {
    p = startQuest(p, guest);
    for (let i = 0; i < QUEST_ITEMS[guest]; i++) p = findItem(p, guest, guest === 'abraham' ? SPECIES[i] : String(i));
    return completeQuest(p, guest);
  };

  it('Abraham: talk → collect all four species → return → reward', () => {
    let p = startQuest(newProgress(), 'abraham');
    expect(p.quests.abraham.stage).toBe('active');
    expect(p.achievements).toContain('metAbraham');
    for (const s of SPECIES.slice(0, 3)) p = findItem(p, 'abraham', s);
    expect(p.quests.abraham.stage).toBe('active');
    p = findItem(p, 'abraham', 'arava');
    expect(p.quests.abraham.stage).toBe('returning');
    expect(p.achievements).toContain('fourSpecies');
    p = completeQuest(p, 'abraham');
    expect(p.quests.abraham.stage).toBe('done');
    expect(p.coins).toBe(QUEST_REWARDS.abraham.coins);
    expect(p.owned.lantern).toBe(1);
  });

  it('brings the guests one after another', () => {
    let p = newProgress();
    expect(currentGuest(p)).toBe('abraham');
    expect(startQuest(p, 'isaac').quests.isaac.stage).toBe('locked');
    p = finish(p, 'abraham');
    expect(currentGuest(p)).toBe('isaac');
    p = finish(p, 'isaac');
    expect(p.ownedWear).toContain('hadasWreath');
    expect(currentGuest(p)).toBe('jacob');
    p = finish(p, 'jacob');
    expect(p.pets).toEqual(['lamb']);
    expect(currentGuest(p)).toBeNull();
    expect(p.coins).toBe(QUEST_REWARDS.abraham.coins + QUEST_REWARDS.isaac.coins + QUEST_REWARDS.jacob.coins);
  });

  it('ignores items before the quest starts and duplicates', () => {
    let p = findItem(newProgress(), 'abraham', 'etrog');
    expect(p.quests.abraham.found).toEqual([]);
    p = findItem(findItem(startQuest(p, 'abraham'), 'abraham', 'etrog'), 'abraham', 'etrog');
    expect(p.quests.abraham.found).toEqual(['etrog']);
  });

  it("puts Isaac's lanterns out again", () => {
    let p = finish(newProgress(), 'abraham');
    p = findItem(startQuest(p, 'isaac'), 'isaac', '0');
    expect(resetItems(p, 'isaac').quests.isaac.found).toEqual([]);
  });

  it('cannot be completed twice', () => {
    const p = finish(newProgress(), 'abraham');
    expect(completeQuest(p, 'abraham').coins).toBe(QUEST_REWARDS.abraham.coins);
  });

  it('reads saves from before the quest chain', () => {
    const old = { ...newProgress(), quest: { stage: 'done', found: SPECIES } } as Record<string, unknown>;
    delete old.quests;
    const p = parseProgress(JSON.stringify(old));
    expect(p.quests.abraham.stage).toBe('done');
    expect(p.quests.isaac.stage).toBe('notStarted');
    const collecting = { ...old, quest: { stage: 'collecting', found: ['etrog'] } };
    expect(parseProgress(JSON.stringify(collecting)).quests.abraham).toEqual({ stage: 'active', found: ['etrog'] });
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
    const p = buy({ ...startQuest(newProgress(), 'abraham'), coins: 30 }, 'rug');
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

/**
 * The player's saved progress: avatar, coins, owned decorations, what's placed in their sukkah and the
 * Abraham quest. Pure functions over plain data, so it can be tested and later synced to a server as-is.
 */

export type SpeciesId = 'etrog' | 'lulav' | 'hadas' | 'arava';
export const SPECIES: SpeciesId[] = ['etrog', 'lulav', 'hadas', 'arava'];

export type DecorationId = 'lantern' | 'star' | 'chain' | 'pomegranates' | 'rug' | 'table' | 'chair';

export interface DecorationDef {
  id: DecorationId;
  price: number;
  /** Hanging items go under the schach, the rest stand on the floor. */
  mount: 'ceiling' | 'floor';
}

export const DECORATIONS: DecorationDef[] = [
  { id: 'chain', price: 10, mount: 'ceiling' },
  { id: 'star', price: 15, mount: 'ceiling' },
  { id: 'pomegranates', price: 15, mount: 'ceiling' },
  { id: 'lantern', price: 20, mount: 'ceiling' },
  { id: 'chair', price: 15, mount: 'floor' },
  { id: 'rug', price: 25, mount: 'floor' },
  { id: 'table', price: 30, mount: 'floor' },
];

export const decoration = (id: DecorationId) => DECORATIONS.find((d) => d.id === id)!;

export type HatId = 'none' | 'kippah' | 'cap' | 'crown';

export interface Avatar {
  name: string;
  shirt: string;
  skin: string;
  /** Added after the first release, so older saves may not have it. */
  hair?: string;
  hat: HatId;
}

export interface Placed {
  id: DecorationId;
  /** Position relative to the sukkah's centre, in metres. */
  x: number;
  z: number;
  rot: number;
}

/**
 * Abraham's quest: talk to him → collect the four species in the garden → bring them back.
 * 'done' unlocks the next guest (a later slice).
 */
export type QuestStage = 'notStarted' | 'collecting' | 'returning' | 'done';

export interface Progress {
  version: 1;
  avatar: Avatar | null;
  coins: number;
  owned: Partial<Record<DecorationId, number>>;
  placed: Placed[];
  quest: { stage: QuestStage; found: SpeciesId[] };
  achievements: string[];
  bestHunt: number;
}

export const QUEST_REWARD = { coins: 50, item: 'lantern' as DecorationId };
export const COINS_PER_ETROG = 5;
export const HUNT_WIN_BONUS = 20;
export const MAX_PLACED = 24;

export function newProgress(): Progress {
  return {
    version: 1,
    avatar: null,
    coins: 0,
    owned: {},
    placed: [],
    quest: { stage: 'notStarted', found: [] },
    achievements: [],
    bestHunt: 0,
  };
}

/** Reads a save, falling back to a fresh one for anything missing or broken. */
export function parseProgress(raw: string | null): Progress {
  const fresh = newProgress();
  if (!raw) return fresh;
  try {
    const data = JSON.parse(raw) as Partial<Progress>;
    if (data.version !== 1) return fresh;
    return {
      ...fresh,
      ...data,
      quest: { ...fresh.quest, ...data.quest },
      owned: { ...data.owned },
      placed: Array.isArray(data.placed) ? data.placed : [],
      achievements: Array.isArray(data.achievements) ? data.achievements : [],
    };
  } catch {
    return fresh;
  }
}

const withAchievement = (p: Progress, id: string): Progress =>
  p.achievements.includes(id) ? p : { ...p, achievements: [...p.achievements, id] };

export function setAvatar(p: Progress, avatar: Avatar): Progress {
  return { ...p, avatar };
}

export function startQuest(p: Progress): Progress {
  if (p.quest.stage !== 'notStarted') return p;
  return withAchievement({ ...p, quest: { stage: 'collecting', found: [] } }, 'metAbraham');
}

export function findSpecies(p: Progress, id: SpeciesId): Progress {
  if (p.quest.stage !== 'collecting' || p.quest.found.includes(id)) return p;
  const found = [...p.quest.found, id];
  const stage: QuestStage = found.length === SPECIES.length ? 'returning' : 'collecting';
  const next = { ...p, quest: { stage, found } };
  return stage === 'returning' ? withAchievement(next, 'fourSpecies') : next;
}

export function completeQuest(p: Progress): Progress {
  if (p.quest.stage !== 'returning') return p;
  const item = QUEST_REWARD.item;
  return {
    ...p,
    coins: p.coins + QUEST_REWARD.coins,
    owned: { ...p.owned, [item]: (p.owned[item] ?? 0) + 1 },
    quest: { ...p.quest, stage: 'done' },
  };
}

/** How many of an item are still in the bag (owned but not placed). */
export function available(p: Progress, id: DecorationId): number {
  return (p.owned[id] ?? 0) - p.placed.filter((x) => x.id === id).length;
}

export function canBuy(p: Progress, id: DecorationId): boolean {
  return p.coins >= decoration(id).price;
}

export function buy(p: Progress, id: DecorationId): Progress {
  if (!canBuy(p, id)) return p;
  return { ...p, coins: p.coins - decoration(id).price, owned: { ...p.owned, [id]: (p.owned[id] ?? 0) + 1 } };
}

export function place(p: Progress, item: Placed): Progress {
  if (available(p, item.id) <= 0 || p.placed.length >= MAX_PLACED) return p;
  return withAchievement({ ...p, placed: [...p.placed, item] }, 'firstDecoration');
}

/** Takes a placed item back into the bag. */
export function removePlaced(p: Progress, index: number): Progress {
  if (index < 0 || index >= p.placed.length) return p;
  return { ...p, placed: p.placed.filter((_, i) => i !== index) };
}

export function rotatePlaced(p: Progress, index: number): Progress {
  if (index < 0 || index >= p.placed.length) return p;
  return { ...p, placed: p.placed.map((x, i) => (i === index ? { ...x, rot: (x.rot + Math.PI / 4) % (Math.PI * 2) } : x)) };
}

/** Coins for an etrog hunt: every etrog counts, and beating the computer adds a bonus. */
export function huntReward(mine: number, rival: number): number {
  return mine * COINS_PER_ETROG + (mine > rival ? HUNT_WIN_BONUS : 0);
}

export function finishHunt(p: Progress, mine: number, rival: number): Progress {
  let next: Progress = { ...p, coins: p.coins + huntReward(mine, rival), bestHunt: Math.max(p.bestHunt, mine) };
  next = withAchievement(next, 'firstHunt');
  return mine > rival ? withAchievement(next, 'beatRival') : next;
}

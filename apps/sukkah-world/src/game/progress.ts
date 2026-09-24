/**
 * The player's saved progress: avatar, coins, owned decorations and wearables, what's placed in their
 * sukkah, pets and the Ushpizin quests. Pure functions over plain data, so it can be tested and later synced to a server as-is.
 */

export type SpeciesId = 'etrog' | 'lulav' | 'hadas' | 'arava';
export const SPECIES: SpeciesId[] = ['etrog', 'lulav', 'hadas', 'arava'];

export type DecorationId = 'lantern' | 'star' | 'chain' | 'pomegranates' | 'rug' | 'table' | 'chair' | 'waterJug';

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
  { id: 'waterJug', price: 20, mount: 'floor' },
];

export const decoration = (id: DecorationId) => DECORATIONS.find((d) => d.id === id)!;

export type HatId = 'none' | 'kippah' | 'cap' | 'crown' | 'sukkahHat' | 'hadasWreath';
export type HairStyle = 'short' | 'long' | 'curly' | 'ponytail' | 'spiky' | 'buzz';
export type EyeStyle = 'round' | 'happy' | 'sparkle';
export type MouthStyle = 'smile' | 'grin' | 'tongue';
export type Pattern = 'plain' | 'stripes' | 'stars';
export type AccessoryId = 'none' | 'glasses' | 'etrogBag' | 'lantern' | 'sukkahBackpack';

export interface Avatar {
  name: string;
  skin: string;
  shirt: string;
  hat: HatId;
  // Everything below was added after the first release, so older saves may not have it (see `fullAvatar`).
  hair?: string;
  hairStyle?: HairStyle;
  eyes?: EyeStyle;
  mouth?: MouthStyle;
  pattern?: Pattern;
  pants?: string;
  shoes?: string;
  accessory?: AccessoryId;
}

export const AVATAR_DEFAULTS: Required<Omit<Avatar, 'name' | 'skin' | 'shirt' | 'hat'>> = {
  hair: '#5a3825',
  hairStyle: 'short',
  eyes: 'round',
  mouth: 'smile',
  pattern: 'plain',
  pants: '#3b5b9a',
  shoes: '#f4f4f4',
  accessory: 'none',
};

export function fullAvatar(a: Avatar): Required<Avatar> {
  return { ...AVATAR_DEFAULTS, ...a } as Required<Avatar>;
}

/** Festive wearables bought with coins in the character creator. Anything not listed here is free. */
export type WearId = Exclude<HatId | AccessoryId, 'none'>;

export const WEAR_PRICES: Partial<Record<WearId, number>> = {
  crown: 30,
  sukkahHat: 25,
  hadasWreath: 20,
  etrogBag: 20,
  lantern: 25,
  sukkahBackpack: 40,
};

export interface Placed {
  id: DecorationId;
  /** Position relative to the sukkah's centre, in metres. */
  x: number;
  z: number;
  rot: number;
}

/**
 * The Ushpizin arrive one after another, each with a quest:
 *   Abraham – collect the four species in the garden;
 *   Isaac   – light every lantern on the forest trail before time runs out;
 *   Jacob   – find his lost lambs in the hedge maze and lead them back to the pen;
 *   Moses   – ride a raft down the river and collect the floating water jugs.
 * A quest goes locked → notStarted (the guest has arrived) → active → returning (all found) → done,
 * and finishing one brings the next guest.
 */
export type GuestId = 'abraham' | 'isaac' | 'jacob' | 'moses';
export const GUESTS: GuestId[] = ['abraham', 'isaac', 'jacob', 'moses'];
export type QuestStage = 'locked' | 'notStarted' | 'active' | 'returning' | 'done';

export interface Quest {
  stage: QuestStage;
  /** Items found so far: species ids, lantern numbers or lamb numbers. */
  found: string[];
}

export const LANTERN_COUNT = 6;
export const LAMB_COUNT = 3;
export const JUG_COUNT = 5;
export const QUEST_ITEMS: Record<GuestId, number> = { abraham: SPECIES.length, isaac: LANTERN_COUNT, jacob: LAMB_COUNT, moses: JUG_COUNT };

export type PetId = 'lamb';

export interface QuestReward {
  coins: number;
  decoration?: DecorationId;
  wear?: WearId;
  pet?: PetId;
}

export const QUEST_REWARDS: Record<GuestId, QuestReward> = {
  abraham: { coins: 50, decoration: 'lantern' },
  isaac: { coins: 60, wear: 'hadasWreath' },
  jacob: { coins: 80, pet: 'lamb' },
  moses: { coins: 70, decoration: 'waterJug' },
};

export interface Progress {
  version: 1;
  avatar: Avatar | null;
  coins: number;
  owned: Partial<Record<DecorationId, number>>;
  placed: Placed[];
  quests: Record<GuestId, Quest>;
  pets: PetId[];
  achievements: string[];
  bestHunt: number;
  /** Wearables bought in the character creator. */
  ownedWear: WearId[];
}

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
    quests: {
      abraham: { stage: 'notStarted', found: [] },
      isaac: { stage: 'locked', found: [] },
      jacob: { stage: 'locked', found: [] },
      moses: { stage: 'locked', found: [] },
    },
    pets: [],
    achievements: [],
    bestHunt: 0,
    ownedWear: [],
  };
}

/** Reads a save, falling back to a fresh one for anything missing or broken. */
export function parseProgress(raw: string | null): Progress {
  const fresh = newProgress();
  if (!raw) return fresh;
  try {
    const data = JSON.parse(raw) as Partial<Progress> & { quest?: { stage: string; found: string[] } };
    if (data.version !== 1) return fresh;
    const ownedWear = Array.isArray(data.ownedWear) ? data.ownedWear : [];
    // The crown was free before wearables had prices; whoever already wears it keeps it.
    if (data.avatar?.hat === 'crown' && !ownedWear.includes('crown')) ownedWear.push('crown');
    return {
      ...fresh,
      ...data,
      quests: readQuests(data, fresh.quests),
      pets: Array.isArray(data.pets) ? data.pets : [],
      owned: { ...data.owned },
      placed: Array.isArray(data.placed) ? data.placed : [],
      achievements: Array.isArray(data.achievements) ? data.achievements : [],
      ownedWear,
    };
  } catch {
    return fresh;
  }
}

/** Reads saved quests, including saves from before the quest chain (a single Abraham quest). */
function readQuests(data: Partial<Progress> & { quest?: { stage: string; found: string[] } }, fresh: Record<GuestId, Quest>): Record<GuestId, Quest> {
  const quests = { ...fresh };
  if (data.quests) for (const g of GUESTS) if (data.quests[g]) quests[g] = { ...fresh[g], ...data.quests[g] };
  if (data.quest && !data.quests) {
    const stage = data.quest.stage === 'collecting' ? 'active' : (data.quest.stage as QuestStage);
    quests.abraham = { stage, found: data.quest.found ?? [] };
    if (stage === 'done') quests.isaac = { stage: 'notStarted', found: [] };
  }
  return quests;
}

const withAchievement = (p: Progress, id: string): Progress =>
  p.achievements.includes(id) ? p : { ...p, achievements: [...p.achievements, id] };

export function ownsWear(p: Progress, id: HatId | AccessoryId): boolean {
  return id === 'none' || !(id in WEAR_PRICES) || p.ownedWear.includes(id as WearId);
}

export function buyWear(p: Progress, id: WearId): Progress {
  const price = WEAR_PRICES[id];
  if (price === undefined || ownsWear(p, id) || p.coins < price) return p;
  return withAchievement({ ...p, coins: p.coins - price, ownedWear: [...p.ownedWear, id] }, 'firstWear');
}

/** Saves the avatar; wearables tried on but not bought fall back to what was worn before (or nothing). */
export function setAvatar(p: Progress, avatar: Avatar): Progress {
  const before = p.avatar;
  const hat = ownsWear(p, avatar.hat) ? avatar.hat : before && ownsWear(p, before.hat) ? before.hat : 'none';
  const acc = avatar.accessory ?? 'none';
  const prevAcc = before?.accessory ?? 'none';
  const accessory = ownsWear(p, acc) ? acc : ownsWear(p, prevAcc) ? prevAcc : 'none';
  return { ...p, avatar: { ...avatar, hat, accessory } };
}

const withQuest = (p: Progress, guest: GuestId, q: Partial<Quest>): Progress => ({
  ...p,
  quests: { ...p.quests, [guest]: { ...p.quests[guest], ...q } },
});

const MET: Record<GuestId, string> = { abraham: 'metAbraham', isaac: 'metIsaac', jacob: 'metJacob', moses: 'metMoses' };
const FOUND_ALL: Record<GuestId, string> = { abraham: 'fourSpecies', isaac: 'lanternTrail', jacob: 'lambsHome', moses: 'allJugs' };

/** The guest whose quest is in progress or waiting to start, if any. */
export function currentGuest(p: Progress): GuestId | null {
  return GUESTS.find((g) => p.quests[g].stage !== 'done' && p.quests[g].stage !== 'locked') ?? null;
}

export function startQuest(p: Progress, guest: GuestId): Progress {
  if (p.quests[guest].stage !== 'notStarted') return p;
  return withAchievement(withQuest(p, guest, { stage: 'active', found: [] }), MET[guest]);
}

/** Marks one quest item as found; when all are found the player goes back to the guest. */
export function findItem(p: Progress, guest: GuestId, item: string): Progress {
  const q = p.quests[guest];
  if (q.stage !== 'active' || q.found.includes(item)) return p;
  const found = [...q.found, item];
  if (found.length < QUEST_ITEMS[guest]) return withQuest(p, guest, { found });
  return withAchievement(withQuest(p, guest, { stage: 'returning', found }), FOUND_ALL[guest]);
}

/** Starts the items over (Isaac's lanterns go dark when time runs out). */
export function resetItems(p: Progress, guest: GuestId): Progress {
  return p.quests[guest].stage === 'active' ? withQuest(p, guest, { found: [] }) : p;
}

export function completeQuest(p: Progress, guest: GuestId): Progress {
  if (p.quests[guest].stage !== 'returning') return p;
  const r = QUEST_REWARDS[guest];
  let next = withQuest({ ...p, coins: p.coins + r.coins }, guest, { stage: 'done' });
  if (r.decoration) next = { ...next, owned: { ...next.owned, [r.decoration]: (next.owned[r.decoration] ?? 0) + 1 } };
  if (r.wear && !next.ownedWear.includes(r.wear)) next = { ...next, ownedWear: [...next.ownedWear, r.wear] };
  if (r.pet && !next.pets.includes(r.pet)) next = { ...next, pets: [...next.pets, r.pet] };
  const following = GUESTS[GUESTS.indexOf(guest) + 1];
  if (following && next.quests[following].stage === 'locked') next = withQuest(next, following, { stage: 'notStarted' });
  return next;
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

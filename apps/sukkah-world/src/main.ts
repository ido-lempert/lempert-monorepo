import { registerSW } from 'virtual:pwa-register';
import { createHunt, type Hunt, HUNT_ETROGS, pickSpots, stepHunt } from './game/hunt';
import {
  type AccessoryId,
  type Avatar,
  AVATAR_DEFAULTS,
  available,
  buyWear,
  type EyeStyle,
  fullAvatar,
  type HairStyle,
  type MouthStyle,
  ownsWear,
  type Pattern,
  WEAR_PRICES,
  type WearId,
  buy,
  canBuy,
  completeQuest,
  COINS_PER_ETROG,
  DECORATIONS,
  type DecorationId,
  decoration,
  currentGuest,
  findItem,
  GUESTS,
  type GuestId,
  QUEST_ITEMS,
  QUEST_REWARDS,
  resetItems,
  type SpeciesId,
  finishHunt,
  HUNT_WIN_BONUS,
  type HatId,
  huntReward,
  MAX_PLACED,
  parseProgress,
  place,
  type Progress,
  removePlaced,
  rotatePlaced,
  setAvatar,
  SPECIES,
  startQuest,
} from './game/progress';
import { Sound } from './audio';
import { applyDocument, type StringKey, t } from './i18n';
import { canFullscreen, canInstall, install, isFullscreen, onPwaChange, toggleFullscreen } from './pwa';
import './style.css';
import { WalkInput } from './world/input';
import type { Vec } from './game/hunt';
import { ABRAHAM, HUB, huntCandidates, inside, ISAAC, JACOB, LAMB_SPOTS, LANTERN_SECONDS, LANTERNS, MY_SUKKAH, PEN, resolve, RIVAL_HOME, SPAWN, SPECIES_SPOTS } from './world/layout';
import { World } from './world/world';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

// --- Saved progress ---------------------------------------------------------------------------

const sound = new Sound();
const SAVE_KEY = 'sukkahWorld.progress';
let progress: Progress = parseProgress(localStorage.getItem(SAVE_KEY));

/** Every change goes through here: saves, refreshes the screen and celebrates new achievements. */
function commit(next: Progress) {
  const fresh = next.achievements.filter((a) => !progress.achievements.includes(a));
  progress = next;
  localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
  for (const a of fresh) toast(`🏆 ${t('newAchievement', { name: t(`ach_${a}` as StringKey) })}`);
  if (fresh.length) setTimeout(() => sound.play('achievement'), 350);
  refresh();
}

// --- World ------------------------------------------------------------------------------------

const world = new World($('#stage'));
const input = new WalkInput(world.canvas);
applyDocument();

type Scene = 'creator' | 'walk' | 'dialog' | 'build' | 'huntCard' | 'hunt';
let scene: Scene = 'walk';

function setScene(next: Scene) {
  scene = next;
  input.reset();
  input.walking = next === 'walk' || next === 'hunt';
  world.setMode(next === 'creator' ? 'creator' : next === 'build' ? 'build' : 'walk');
  $('#hud').classList.toggle('hidden', next === 'creator');
  $('#creator').classList.toggle('hidden', next !== 'creator');
  $('#build').classList.toggle('hidden', next !== 'build');
  $('#hunt-hud').classList.toggle('hidden', next !== 'hunt');
  $('#quest').classList.toggle('hidden', next === 'hunt');
  if (next !== 'dialog') $('#dialog').classList.add('hidden');
  if (next !== 'huntCard') $('#hunt-card').classList.add('hidden');
  closeMenu();
  updateAction();
}

function refresh() {
  const coinCount = $('#coin-count');
  if (coinCount.textContent !== String(progress.coins)) {
    if (Number(coinCount.textContent) < progress.coins) sound.play('coin');
    coinCount.textContent = String(progress.coins);
    // Restart the little bump animation on every change.
    $('#coins').classList.remove('bump');
    void $('#coins').offsetWidth;
    $('#coins').classList.add('bump');
  }
  renderQuest();
  const abraham = progress.quests.abraham;
  world.setSpecies(abraham.stage === 'active', abraham.found as SpeciesId[]);
  for (const g of GUESTS) {
    const st = progress.quests[g].stage;
    world.setGuest(g, st !== 'locked', st === 'notStarted' ? '!' : st === 'returning' ? '?' : '');
  }
  const isaac = progress.quests.isaac;
  world.setLanterns(LANTERNS.map((_, i) => isaac.stage !== 'active' ? isaac.stage === 'returning' || isaac.stage === 'done' : isaac.found.includes(String(i))));
  const jacob = progress.quests.jacob;
  world.setLambs(
    LAMB_SPOTS.map((_, i) =>
      jacob.stage === 'done' || jacob.stage === 'returning' || jacob.found.includes(String(i)) ? 'home' : world.lambStates[i] === 'following' && jacob.stage === 'active' ? 'following' : 'lost',
    ),
  );
  world.setPet(progress.pets.includes('lamb'));
  world.setDecorations(progress.placed, scene === 'build' ? selectedPlaced : -1);
  if (scene === 'build') renderPalette();
}

// --- Toasts -----------------------------------------------------------------------------------

const toastQueue: string[] = [];
let toastBusy = false;

function toast(text: string) {
  // Keep at most two messages waiting (e.g. an achievement and what earned it), so news is never stale.
  toastQueue.push(text);
  if (toastQueue.length > 2) toastQueue.splice(0, toastQueue.length - 2);
  if (!toastBusy) nextToast();
}

function nextToast() {
  const el = $('#toast');
  const text = toastQueue.shift();
  if (!text) {
    toastBusy = false;
    return;
  }
  toastBusy = true;
  el.textContent = text;
  el.classList.add('show');
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(nextToast, 200);
  }, toastQueue.length ? 1300 : 2000);
}

// --- Dialogs with characters ------------------------------------------------------------------

interface Choice {
  label: string;
  primary?: boolean;
  onClick?: () => void;
}

function say(face: string, name: string, text: string, choices: Choice[]) {
  setScene('dialog');
  $('#dialog-face').textContent = face;
  $('#dialog-name').textContent = name;
  $('#dialog-text').textContent = text;
  const actions = $('#dialog-actions');
  actions.replaceChildren(
    ...choices.map((c) => {
      const b = document.createElement('button');
      b.className = c.primary ? 'primary' : 'secondary';
      b.textContent = c.label;
      b.addEventListener('click', () => {
        setScene('walk');
        c.onClick?.();
      });
      return b;
    }),
  );
  $('#dialog').classList.remove('hidden');
  actions.querySelector('button')?.focus();
  sound.play('pop');
}

const playerName = () => progress.avatar?.name || t('defaultName');

const GUEST_FACE: Record<GuestId, string> = { abraham: '👴🏻', isaac: '🧔🏻', jacob: '🧔🏽' };
const GUEST_SPOT: Record<GuestId, Vec> = { abraham: ABRAHAM, isaac: ISAAC, jacob: JACOB };

/** Everything a guest says, in the order of their quest. */
const LINES: Record<GuestId, { intro: StringKey; accept: StringKey; waiting: StringKey; thanks: StringKey; done: StringKey }> = {
  abraham: { intro: 'abrahamIntro', accept: 'abrahamAccept', waiting: 'abrahamWaiting', thanks: 'abrahamThanks', done: 'abrahamDone' },
  isaac: { intro: 'isaacIntro', accept: 'isaacAccept', waiting: 'isaacWaiting', thanks: 'isaacThanks', done: 'isaacDone' },
  jacob: { intro: 'jacobIntro', accept: 'jacobAccept', waiting: 'jacobWaiting', thanks: 'jacobThanks', done: 'jacobDone' },
};

function talkTo(guest: GuestId) {
  const q = progress.quests[guest];
  const lines = LINES[guest];
  const face = GUEST_FACE[guest];
  const name = t(guest);
  const params = { name: playerName(), coins: QUEST_REWARDS[guest].coins, seconds: LANTERN_SECONDS, n: QUEST_ITEMS[guest] - q.found.length };
  switch (q.stage) {
    case 'notStarted':
      say(face, name, t(lines.intro, params), [
        { label: t(lines.accept), primary: true, onClick: () => commit(startQuest(progress, guest)) },
        { label: t('abrahamLater') },
      ]);
      break;
    case 'active':
      say(face, name, t(lines.waiting, params), [{ label: t('ok'), primary: true }]);
      break;
    case 'returning':
      say(face, name, t(lines.thanks, params), [
        {
          label: t('thanks'),
          primary: true,
          onClick: () => {
            commit(completeQuest(progress, guest));
            sound.play('fanfare');
            world.sparkle(GUEST_SPOT[guest], '#ffd166', 2);
            world.celebrate();
          },
        },
      ]);
      break;
    default:
      say(face, name, t(lines.done, params), [{ label: t('ok'), primary: true }]);
  }
}

// --- Quest tracker -----------------------------------------------------------------------------

function renderQuest() {
  const guest = currentGuest(progress);
  let icon = '⏳';
  let text = t('questAllDone');
  if (guest) {
    const q = progress.quests[guest];
    icon = q.stage === 'returning' ? GUEST_FACE[guest] : { abraham: '🌿', isaac: '🏮', jacob: '🐑' }[guest];
    if (q.stage === 'notStarted') text = t(({ abraham: 'questTalk', isaac: 'questTalkIsaac', jacob: 'questTalkJacob' } as const)[guest]);
    else if (q.stage === 'returning') text = t(({ abraham: 'questReturn', isaac: 'questReturnIsaac', jacob: 'questReturnJacob' } as const)[guest]);
    else if (guest === 'abraham') text = t('questCollect', { n: q.found.length });
    else if (guest === 'isaac')
      text = lanternDeadline ? t('questLanternsTimer', { n: q.found.length, s: Math.ceil(lanternLeft()) }) : t('questLanterns', { n: q.found.length });
    else text = t('questLambs', { n: q.found.length });
  }
  $('#quest-icon').textContent = icon;
  $('#quest-text').textContent = text;
  $('#quest').classList.toggle('urgent', !!lanternDeadline && lanternLeft() < 10);
}

// --- Contextual action (talk / play / decorate) -----------------------------------------------

type Action = 'talkAbraham' | 'talkIsaac' | 'talkJacob' | 'playHunt' | 'decorate';
const TALK: Record<GuestId, Action> = { abraham: 'talkAbraham', isaac: 'talkIsaac', jacob: 'talkJacob' };
let action: Action | null = null;

function nearbyAction(): Action | null {
  if (scene !== 'walk') return null;
  const p = world.player.pos;
  for (const g of GUESTS)
    if (progress.quests[g].stage !== 'locked' && Math.hypot(p.x - GUEST_SPOT[g].x, p.z - GUEST_SPOT[g].z) < 2.6) return TALK[g];
  if (Math.hypot(p.x - HUB.x, p.z - HUB.z) < 3) return 'playHunt';
  if (inside(p, MY_SUKKAH, 0.8)) return 'decorate';
  return null;
}

function updateAction() {
  const next = nearbyAction();
  if (next === action) return;
  action = next;
  const btn = $('#action');
  btn.classList.toggle('hidden', !action);
  if (action) btn.textContent = t(action);
}

function runAction() {
  const guest = GUESTS.find((g) => TALK[g] === action);
  if (guest) talkTo(guest);
  else if (action === 'playHunt') showHuntCard('intro');
  else if (action === 'decorate') openBuild();
}

$('#action').addEventListener('click', runAction);
addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (!$('#menu').classList.contains('hidden')) closeMenu();
    else if (scene === 'build' || scene === 'dialog') setScene('walk');
    return;
  }
  const onPage = document.activeElement === document.body || document.activeElement === null;
  if (action && (e.code === 'KeyE' || (onPage && (e.code === 'Enter' || e.code === 'Space')))) {
    e.preventDefault();
    runAction();
  }
});

// --- Quest items: species, lanterns, lambs -------------------------------------------------------

/** When Isaac's lanterns go dark again (ms timestamp), counted from the first lantern lit. 0 = not running. */
let lanternDeadline = 0;
/** After the lanterns go out, the one the player stands on can't be relit until they step away from it. */
let lanternBlocked = -1;
const lanternLeft = () => Math.max(0, (lanternDeadline - performance.now()) / 1000);

function checkQuestItems() {
  const p = world.player.pos;
  const near = (v: Vec, r: number) => Math.hypot(p.x - v.x, p.z - v.z) <= r;

  if (progress.quests.abraham.stage === 'active')
    for (const id of SPECIES) {
      if (progress.quests.abraham.found.includes(id) || !near(SPECIES_SPOTS[id], 1.4)) continue;
      world.sparkle(SPECIES_SPOTS[id], '#b8f28c', 1.2);
      sound.play('pickup');
      world.celebrate();
      const next = findItem(progress, 'abraham', id);
      commit(next);
      toast(next.quests.abraham.stage === 'returning' ? `🌿 ${t('allFound')}` : `✨ ${t('foundSpecies', { item: t(id) })}`);
    }

  if (progress.quests.isaac.stage === 'active') {
    if (lanternBlocked >= 0 && !near(LANTERNS[lanternBlocked], 2)) lanternBlocked = -1;
    LANTERNS.forEach((l, i) => {
      if (progress.quests.isaac.found.includes(String(i)) || i === lanternBlocked || !near(l, 1.4)) return;
      if (!lanternDeadline) lanternDeadline = performance.now() + LANTERN_SECONDS * 1000;
      world.sparkle(l, '#ffb347', 1.6);
      sound.play('chime');
      const next = findItem(progress, 'isaac', String(i));
      commit(next);
      if (next.quests.isaac.stage === 'returning') {
        lanternDeadline = 0;
        world.celebrate();
        toast(`🏮 ${t('allLit')}`);
      } else toast(`🏮 ${t('lanternLit', { n: next.quests.isaac.found.length })}`);
    });
    if (lanternDeadline && lanternLeft() === 0) {
      lanternDeadline = 0;
      lanternBlocked = LANTERNS.findIndex((l) => near(l, 1.4));
      commit(resetItems(progress, 'isaac'));
      toast(`💨 ${t('lanternsOut')}`);
      sound.play('fail');
    }
    renderQuest();
  }

  if (progress.quests.jacob.stage === 'active')
    LAMB_SPOTS.forEach((_, i) => {
      const state = world.lambStates[i];
      if (state === 'lost' && near(world.lambPosition(i), 1.5)) {
        world.lambStates[i] = 'following';
        world.sparkle(world.lambPosition(i), '#ffffff', 0.8);
        world.celebrate();
        toast(`🐑 ${t('lambFound')}`);
        sound.play('baa');
      } else if (state === 'following') {
        const l = world.lambPosition(i);
        if (Math.hypot(l.x - PEN.x, l.z - PEN.z) < PEN.r + 0.4) {
          world.sparkle(PEN, '#ffd166', 1);
          sound.play('baa');
          setTimeout(() => sound.play('pickup'), 250);
          const next = findItem(progress, 'jacob', String(i));
          commit(next);
          toast(next.quests.jacob.stage === 'returning' ? `🐑 ${t('allLambs')}` : `🐑 ${t('lambHome', { n: next.quests.jacob.found.length })}`);
        }
      }
    });
}

// --- Decorating --------------------------------------------------------------------------------

const ICONS: Record<DecorationId, string> = {
  chain: '🔗',
  star: '⭐',
  pomegranates: '🍎',
  lantern: '🏮',
  chair: '🪑',
  rug: '🟥',
  table: '🍽️',
};
let placing: DecorationId | null = null;
let selectedPlaced = -1;

function openBuild() {
  placing = DECORATIONS.find((d) => available(progress, d.id) > 0)?.id ?? null;
  selectedPlaced = -1;
  setScene('build');
  refresh();
  $('#build-done').focus();
}

function renderPalette() {
  $('#palette').replaceChildren(
    ...DECORATIONS.map((d) => {
      const b = document.createElement('button');
      const have = available(progress, d.id);
      b.className = 'item';
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(placing === d.id));
      b.innerHTML = '<span class="item-icon" aria-hidden="true"></span><span class="item-name"></span><span class="item-status"></span>';
      b.querySelector('.item-icon')!.textContent = ICONS[d.id];
      b.querySelector('.item-name')!.textContent = t(d.id);
      b.querySelector('.item-status')!.textContent = have > 0 ? t('inBag', { n: have }) : t('buy', { price: d.price });
      b.classList.toggle('cant', have === 0 && !canBuy(progress, d.id));
      b.addEventListener('click', () => chooseItem(d.id));
      return b;
    }),
  );
  $('#build-selected').classList.toggle('hidden', selectedPlaced < 0);
  $('#build-hint').textContent =
    selectedPlaced >= 0 ? t('buildSelected') : progress.placed.length >= MAX_PLACED ? t('sukkahFull') : t('buildHint');
}

function chooseItem(id: DecorationId) {
  selectedPlaced = -1;
  if (available(progress, id) > 0) placing = id;
  else if (canBuy(progress, id)) {
    placing = id;
    commit(buy(progress, id));
    sound.play('buy');
  } else {
    toast(t('notEnough', { n: decoration(id).price - progress.coins }));
    sound.play('blip');
  }
  refresh();
  $('#palette').querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
}

input.onTap = (x, y) => {
  if (scene !== 'build') return;
  const hit = world.pickInSukkah(x, y);
  if (!hit) return;
  if (hit.kind === 'item') selectedPlaced = hit.index === selectedPlaced ? -1 : hit.index;
  else if (selectedPlaced >= 0) selectedPlaced = -1;
  else if (placing && available(progress, placing) > 0) {
    const before = progress.placed.length;
    commit(place(progress, { id: placing, x: hit.x, z: hit.z, rot: 0 }));
    if (progress.placed.length > before) {
      world.sparkle({ x: MY_SUKKAH.x + hit.x, z: MY_SUKKAH.z + hit.z }, '#ffd166', 0.6);
      sound.play('pop');
    }
    if (available(progress, placing) === 0) placing = null;
  }
  refresh();
};

$('#build-rotate').addEventListener('click', () => commit(rotatePlaced(progress, selectedPlaced)));
$('#build-remove').addEventListener('click', () => {
  const index = selectedPlaced;
  const id = progress.placed[index]?.id;
  selectedPlaced = -1;
  if (id) placing = id;
  commit(removePlaced(progress, index));
});
$('#build-done').addEventListener('click', () => {
  setScene('walk');
  refresh();
});

// --- Etrog hunt --------------------------------------------------------------------------------

let hunt: Hunt | null = null;
const candidates = huntCandidates();

function showHuntCard(mode: 'intro' | 'result') {
  setScene('huntCard');
  const go = $('#hunt-card-go');
  if (mode === 'intro') {
    $('#hunt-card-art').textContent = '🍋🐑';
    $('#hunt-card-title').textContent = t('huntTitle');
    $('#hunt-card-text').textContent = t('huntIntro', { per: COINS_PER_ETROG, bonus: HUNT_WIN_BONUS });
    go.textContent = t('huntStart');
    $('#hunt-card-back').textContent = t('notNow');
  } else {
    const h = hunt!;
    const won = h.mine > h.rivals;
    const tie = h.mine === h.rivals;
    $('#hunt-card-art').textContent = won ? '🏆' : tie ? '🤝' : '🐑';
    $('#hunt-card-title').textContent = t(won ? 'huntWin' : tie ? 'huntTie' : 'huntLose');
    $('#hunt-card-text').textContent = t('huntResult', { mine: h.mine, rival: h.rivals, coins: huntReward(h.mine, h.rivals) });
    go.textContent = t('playAgain');
    $('#hunt-card-back').textContent = t('backToVillage');
  }
  $('#hunt-card-best').textContent = progress.bestHunt ? t('huntBest', { best: progress.bestHunt }) : '';
  $('#hunt-card').classList.remove('hidden');
  go.focus();
}

function startHunt() {
  hunt = createHunt(pickSpots(candidates, HUNT_ETROGS, Math.random, 5), RIVAL_HOME);
  world.startHunt(hunt);
  // Start in the plaza, with the Game Hub arch behind the camera rather than in the way.
  world.teleport({ x: SPAWN.x, z: SPAWN.z - 3 }, Math.PI);
  setScene('hunt');
  updateHuntHud();
  toast(`🍋 ${t('huntGo')}`);
}

function updateHuntHud() {
  if (!hunt) return;
  $('#hunt-me').textContent = String(hunt.mine);
  $('#hunt-rival').textContent = String(hunt.rivals);
  $('#hunt-time').textContent = String(Math.ceil(hunt.timeLeft));
}

function tickHunt(dt: number) {
  if (!hunt) return;
  const events = stepHunt(hunt, dt, world.player.pos, (p) => resolve(p, 0.45));
  for (const e of events) {
    world.sparkle(hunt.etrogs[e.index], e.by === 'me' ? '#ffe066' : '#ffffff', 1);
    sound.play(e.by === 'me' ? 'pickup' : 'blip');
    if (e.by === 'me') world.celebrate();
  }
  world.syncHunt(hunt);
  updateHuntHud();
  if (hunt.over) {
    commit(finishHunt(progress, hunt.mine, hunt.rivals));
    world.endHunt();
    sound.play(hunt.mine >= hunt.rivals ? 'fanfare' : 'lose');
    showHuntCard('result');
  }
}

$('#hunt-card-go').addEventListener('click', startHunt);
$('#hunt-card-back').addEventListener('click', () => {
  hunt = null;
  setScene('walk');
});

// --- Character creator -------------------------------------------------------------------------

const SHIRTS = ['#2a9d8f', '#e76f51', '#457b9d', '#f4a261', '#9b5de5', '#ef476f', '#06d6a0', '#ffd166', '#ffffff', '#1d2b53'];
const SKINS = ['#fbe0cb', '#f1c7a0', '#d9a47a', '#b57d52', '#8d5a3b', '#5e3b26'];
const HAIRS = ['#2b1d14', '#5a3825', '#a0522d', '#e8b04a', '#f2e2b3', '#d9534f', '#ff8fc7', '#6c4bd1', '#3aa0ff'];
const PANTS = ['#3b5b9a', '#1d2b53', '#6b7b8c', '#8a5a36', '#2a9d8f', '#ef476f'];
const SHOES = ['#f4f4f4', '#1d2b53', '#ff4d5e', '#ffd23f', '#3aa0ff', '#7cf07c'];

interface Option<T extends string> {
  value: T;
  key: StringKey;
  icon: string;
}

const HATS: Option<HatId>[] = [
  { value: 'none', key: 'hatNone', icon: '🚫' },
  { value: 'kippah', key: 'hatKippah', icon: '🔵' },
  { value: 'cap', key: 'hatCap', icon: '🧢' },
  { value: 'crown', key: 'hatCrown', icon: '👑' },
  { value: 'sukkahHat', key: 'hatSukkah', icon: '🛖' },
  { value: 'hadasWreath', key: 'hatHadas', icon: '🌿' },
];
const ACCESSORIES: Option<AccessoryId>[] = [
  { value: 'none', key: 'accNone', icon: '🚫' },
  { value: 'glasses', key: 'accGlasses', icon: '👓' },
  { value: 'etrogBag', key: 'accEtrogBag', icon: '🍋' },
  { value: 'lantern', key: 'accLantern', icon: '🏮' },
  { value: 'sukkahBackpack', key: 'accBackpack', icon: '🎒' },
];
const HAIR_STYLES: Option<HairStyle>[] = [
  { value: 'short', key: 'hairShort', icon: '💇' },
  { value: 'long', key: 'hairLong', icon: '👧' },
  { value: 'curly', key: 'hairCurly', icon: '🌀' },
  { value: 'ponytail', key: 'hairPonytail', icon: '🎀' },
  { value: 'spiky', key: 'hairSpiky', icon: '⚡' },
  { value: 'buzz', key: 'hairBuzz', icon: '🧑' },
];
const EYES: Option<EyeStyle>[] = [
  { value: 'round', key: 'eyesRound', icon: '👀' },
  { value: 'happy', key: 'eyesHappy', icon: '😊' },
  { value: 'sparkle', key: 'eyesSparkle', icon: '🤩' },
];
const MOUTHS: Option<MouthStyle>[] = [
  { value: 'smile', key: 'mouthSmile', icon: '🙂' },
  { value: 'grin', key: 'mouthGrin', icon: '😁' },
  { value: 'tongue', key: 'mouthTongue', icon: '😛' },
];
const PATTERNS: Option<Pattern>[] = [
  { value: 'plain', key: 'patternPlain', icon: '👕' },
  { value: 'stripes', key: 'patternStripes', icon: '〰️' },
  { value: 'stars', key: 'patternStars', icon: '⭐' },
];

type Tab = 'body' | 'face' | 'hair' | 'clothes' | 'hats' | 'extras';
const TABS: { id: Tab; key: StringKey; icon: string }[] = [
  { id: 'body', key: 'tabBody', icon: '🧒' },
  { id: 'face', key: 'tabFace', icon: '😊' },
  { id: 'hair', key: 'tabHair', icon: '💇' },
  { id: 'clothes', key: 'tabClothes', icon: '👕' },
  { id: 'hats', key: 'tabHats', icon: '🎩' },
  { id: 'extras', key: 'tabExtras', icon: '🎒' },
];
let tab: Tab = 'body';

const newDraft = (): Avatar => ({ ...AVATAR_DEFAULTS, name: '', shirt: SHIRTS[0], skin: SKINS[1], hat: 'kippah' });
let draft: Avatar = progress.avatar ? fullAvatar(progress.avatar) : newDraft();

function pickDraft(change: Partial<Avatar>) {
  draft = { ...draft, ...change };
  world.setAvatar(draft);
  world.celebrate();
  renderCreator();
}

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

function randomLook() {
  const owned = <T extends HatId | AccessoryId>(list: Option<T>[]) => list.filter((c) => ownsWear(progress, c.value)).map((c) => c.value);
  pickDraft({
    skin: pick(SKINS),
    hair: pick(HAIRS),
    hairStyle: pick(HAIR_STYLES).value,
    eyes: pick(EYES).value,
    mouth: pick(MOUTHS).value,
    shirt: pick(SHIRTS),
    pattern: pick(PATTERNS).value,
    pants: pick(PANTS),
    shoes: pick(SHOES),
    hat: pick(owned(HATS)),
    accessory: pick(owned(ACCESSORIES)),
  });
}

function section(label: StringKey, body: HTMLElement): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const title = document.createElement('span');
  title.className = 'field-label';
  title.textContent = t(label);
  wrap.append(title, body);
  return wrap;
}

function swatchRow(label: StringKey, colors: string[], key: 'shirt' | 'skin' | 'hair' | 'pants' | 'shoes'): HTMLElement {
  const row = document.createElement('div');
  row.className = 'swatches';
  const current = fullAvatar(draft)[key];
  colors.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = c;
    b.dataset.focusId = `${key}-${i}`;
    b.setAttribute('aria-label', `${t(label)} ${i + 1}`);
    b.setAttribute('aria-pressed', String(current === c));
    b.addEventListener('click', () => pickDraft({ [key]: c }));
    row.append(b);
  });
  return section(label, row);
}

function choiceRow<T extends string>(label: StringKey, choices: Option<T>[], key: keyof Avatar, priced = false): HTMLElement {
  const row = document.createElement('div');
  row.className = 'choices';
  const current = (fullAvatar(draft) as unknown as Record<string, string>)[key];
  for (const c of choices) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'choice';
    b.dataset.focusId = `${String(key)}-${c.value}`;
    b.setAttribute('aria-pressed', String(current === c.value));
    const locked = priced && !ownsWear(progress, c.value as HatId | AccessoryId);
    const price = WEAR_PRICES[c.value as WearId];
    b.innerHTML = '<span class="choice-icon" aria-hidden="true"></span><span class="choice-name"></span>';
    b.querySelector('.choice-icon')!.textContent = c.icon;
    b.querySelector('.choice-name')!.textContent = t(c.key);
    if (locked) {
      b.classList.add('locked');
      const tag = document.createElement('span');
      tag.className = 'choice-price';
      tag.textContent = `🔒 ${price}`;
      b.append(tag);
      b.setAttribute('aria-label', `${t(c.key)}, ${t('lockedPrice', { price: price ?? 0 })}`);
    }
    b.addEventListener('click', () => pickDraft({ [key]: c.value }));
    row.append(b);
  }
  return section(label, row);
}

/** A bar offering to buy whatever is being tried on but isn't owned yet. */
function renderTryOn() {
  const bar = $('#try-on');
  const tryOn = [draft.hat, draft.accessory ?? 'none'].find((id) => !ownsWear(progress, id)) as WearId | undefined;
  bar.classList.toggle('hidden', !tryOn);
  if (!tryOn) return;
  const choice = [...HATS, ...ACCESSORIES].find((c) => c.value === tryOn)!;
  const price = WEAR_PRICES[tryOn]!;
  $('#try-on-text').textContent = `${choice.icon} ${t('tryOnText', { item: t(choice.key), price })}`;
  const buyBtn = $('#try-on-buy');
  buyBtn.textContent = t('buyWear', { price });
  buyBtn.classList.toggle('cant', progress.coins < price);
  buyBtn.onclick = () => {
    if (progress.coins < price) {
      toast(t('notEnoughWear', { n: price - progress.coins }));
      return;
    }
    commit(buyWear(progress, tryOn));
    sound.play('buy');
    world.sparkle(world.player.pos, '#ffd23f', 1.4);
    world.celebrate();
    toast(`✨ ${t('boughtWear', { item: t(choice.key) })}`);
    renderCreator();
  };
}

function renderCreator() {
  const focused = (document.activeElement as HTMLElement | null)?.dataset?.focusId;
  $('#creator-tabs').replaceChildren(
    ...TABS.map((tb) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(tab === tb.id));
      b.dataset.focusId = `tab-${tb.id}`;
      b.innerHTML = '<span class="tab-icon" aria-hidden="true"></span><span class="tab-name"></span>';
      b.querySelector('.tab-icon')!.textContent = tb.icon;
      b.querySelector('.tab-name')!.textContent = t(tb.key);
      b.addEventListener('click', () => {
        tab = tb.id;
        renderCreator();
      });
      return b;
    }),
  );
  const panel = $('#creator-panel');
  const parts: HTMLElement[] = [];
  if (tab === 'body') parts.push(swatchRow('skin', SKINS, 'skin'));
  if (tab === 'face') parts.push(choiceRow('eyes', EYES, 'eyes'), choiceRow('mouth', MOUTHS, 'mouth'));
  if (tab === 'hair') parts.push(choiceRow('hairStyle', HAIR_STYLES, 'hairStyle'), swatchRow('hair', HAIRS, 'hair'));
  if (tab === 'clothes')
    parts.push(
      swatchRow('shirt', SHIRTS, 'shirt'),
      choiceRow('pattern', PATTERNS, 'pattern'),
      swatchRow('pants', PANTS, 'pants'),
      swatchRow('shoes', SHOES, 'shoes'),
    );
  if (tab === 'hats') parts.push(choiceRow('hat', HATS, 'hat', true));
  if (tab === 'extras') parts.push(choiceRow('accessory', ACCESSORIES, 'accessory', true));
  panel.replaceChildren(...parts);
  renderTryOn();
  // Re-rendering replaces the buttons; keep keyboard focus where it was.
  if (focused) document.querySelector<HTMLElement>(`[data-focus-id="${focused}"]`)?.focus();
}

function openCreator() {
  draft = progress.avatar ? fullAvatar(progress.avatar) : draft;
  world.setAvatar(draft);
  $<HTMLInputElement>('#avatar-name').value = draft.name;
  $('#creator-submit').textContent = t(progress.avatar ? 'saveAvatar' : 'enterVillage');
  // Face the camera, slightly angled so the hat shows.
  world.player.heading = 0.35;
  renderCreator();
  setScene('creator');
  world.snapCamera();
}

input.onDrag = (dx) => {
  if (scene === 'creator') world.spin(dx * 0.012);
};
$('#avatar-random').addEventListener('click', randomLook);

$('#creator-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $<HTMLInputElement>('#avatar-name').value.trim().slice(0, 14);
  const first = !progress.avatar;
  const triedOn = !ownsWear(progress, draft.hat) || !ownsWear(progress, draft.accessory ?? 'none');
  commit(setAvatar(progress, { ...draft, name }));
  if (triedOn) toast(t('tryOnNotSaved'));
  world.setAvatar(progress.avatar!);
  draft = fullAvatar(progress.avatar!);
  world.player.heading = Math.PI;
  setScene('walk');
  if (first) showHint();
});

// --- Menu --------------------------------------------------------------------------------------

function closeMenu() {
  $('#menu').classList.add('hidden');
  $('#menu-btn').setAttribute('aria-expanded', 'false');
}

function renderMenu() {
  $('#m-install').classList.toggle('hidden', !canInstall());
  $('#m-fullscreen').classList.toggle('hidden', !canFullscreen());
  $('#m-fullscreen-label').textContent = t(isFullscreen() ? 'exitFullscreen' : 'fullscreen');
  $('#m-music').setAttribute('aria-pressed', String(sound.prefs.music));
  $('#m-music-icon').textContent = sound.prefs.music ? '🎵' : '🔇';
  $('#m-sfx').setAttribute('aria-pressed', String(sound.prefs.sfx));
  $('#m-sfx-icon').textContent = sound.prefs.sfx ? '🔊' : '🔇';
  // Travelling away mid-hunt would be cheating the race.
  $('#m-home').toggleAttribute('disabled', scene === 'hunt');
  $('#m-plaza').toggleAttribute('disabled', scene === 'hunt');
}

$('#menu-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  const open = !$('#menu').classList.toggle('hidden');
  $('#menu-btn').setAttribute('aria-expanded', String(open));
  if (open) {
    renderMenu();
    $('#menu').querySelector<HTMLElement>('button:not(.hidden):not([disabled])')?.focus();
  }
});
document.addEventListener('click', (e) => {
  if (!$('#menu').contains(e.target as Node)) closeMenu();
});
onPwaChange(renderMenu);

$('#m-avatar').addEventListener('click', () => {
  if (scene !== 'hunt') openCreator();
});
$('#m-home').addEventListener('click', () => {
  world.teleport({ x: MY_SUKKAH.x - MY_SUKKAH.w / 2 - 2, z: MY_SUKKAH.z }, Math.PI / 2);
  setScene('walk');
});
$('#m-plaza').addEventListener('click', () => {
  world.teleport(SPAWN, Math.PI);
  setScene('walk');
});
$('#m-fullscreen').addEventListener('click', () => void toggleFullscreen());
$('#m-music').addEventListener('click', () => {
  sound.setMusic(!sound.prefs.music);
  renderMenu();
});
$('#m-sfx').addEventListener('click', () => {
  sound.setSfx(!sound.prefs.sfx);
  renderMenu();
});
// A soft tick for every button, like in most mobile games.
document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('button')) sound.play('click');
});
$('#m-install').addEventListener('click', () => void install());
$('#m-reset').addEventListener('click', () => {
  if (!confirm(t('resetConfirm'))) return;
  localStorage.removeItem(SAVE_KEY);
  location.reload();
});

// --- Hint --------------------------------------------------------------------------------------

let hintShown = false;

function showHint() {
  const hint = $('#hint');
  hint.textContent = t(matchMedia('(pointer: coarse)').matches ? 'hintTouch' : 'hintKeys');
  hint.classList.remove('gone');
  hintShown = true;
}

// --- Main loop ---------------------------------------------------------------------------------

function loop() {
  const dt = world.frame();
  if (scene === 'walk' || scene === 'hunt') {
    const moved = world.walk(dt, input.vector());
    if (moved > 0 && hintShown) {
      hintShown = false;
      setTimeout(() => $('#hint').classList.add('gone'), 1200);
    }
    if (scene === 'walk') {
      checkQuestItems();
      updateAction();
    } else tickHunt(dt);
  }
  requestAnimationFrame(loop);
}

// --- PWA ---------------------------------------------------------------------------------------

registerSW({
  immediate: true,
  onNeedRefresh() {
    $('#update').classList.remove('hidden');
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    const check = () => {
      if (navigator.onLine) void registration.update().catch(() => {});
    };
    setInterval(check, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
  },
});
$('#update-now').addEventListener('click', () => location.reload());
$('#app-version').textContent = __APP_VERSION__;

// Test hook for driving the game from Playwright during development; not in production builds.
if (import.meta.env.DEV)
  Object.assign(window, {
    __game: {
      world,
      get progress() {
        return progress;
      },
      goTo: (x: number, z: number) => world.teleport({ x, z }, world.player.heading),
      walkTo: (x: number, z: number) => {
        world.player.pos = { x, z };
      },
    },
  });

// --- Start -------------------------------------------------------------------------------------

if (progress.avatar) {
  world.setAvatar(progress.avatar);
  setScene('walk');
  showHint();
} else openCreator();
refresh();
world.snapCamera();
requestAnimationFrame(() => {
  loop();
  document.body.classList.add('ready');
  $('#splash').classList.add('done');
  setTimeout(() => $('#splash').remove(), 600);
});

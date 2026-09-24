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
  celebrateGrandEvent,
  currentGuest,
  GRAND_EVENT_REWARD,
  readyForGrandEvent,
  REWARD_ONLY,
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
import { Sound, type Theme } from './audio';
import { applyDocument, type StringKey, t } from './i18n';
import { PAGE_TITLES, type PageId, PAGES } from './i18n/pages';
import { canFullscreen, canInstall, install, installable, isFullscreen, isIos, onPwaChange, toggleFullscreen } from './pwa';
import './style.css';
import { WalkInput } from './world/input';
import type { Vec } from './game/hunt';
import { JUG_SPOTS, jumpRaft, type Raft, startRaft, stepRaft } from './game/raft';
import { GARDEN, RIVER, riverPoint, GRAND_SUKKAH, HELP_ITEMS, type HelpItem, RIDE_END, SHEAF_SPOTS, VILLAGERS, HUB, huntCandidates, inside, LAMB_SPOTS, LANTERN_SECONDS, LANTERNS, MY_SUKKAH, PEN, resolve, RIVAL_HOME, SPAWN, SPECIES_SPOTS } from './world/layout';
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

type Scene = 'creator' | 'walk' | 'dialog' | 'build' | 'huntCard' | 'hunt' | 'raft' | 'tune' | 'finale';
let scene: Scene = 'walk';

function setScene(next: Scene) {
  scene = next;
  input.reset();
  input.walking = next === 'walk' || next === 'hunt' || next === 'raft';
  if (next !== 'raft' && next !== 'finale') world.setMode(next === 'creator' ? 'creator' : next === 'build' ? 'build' : 'walk');
  if (next !== 'finale') $('#finale').classList.add('hidden');
  $('#hud').classList.toggle('hidden', next === 'creator');
  $('#creator').classList.toggle('hidden', next !== 'creator');
  $('#build').classList.toggle('hidden', next !== 'build');
  $('#hunt-hud').classList.toggle('hidden', next !== 'hunt');
  // The camera can be turned and zoomed while walking around (and during the etrog hunt).
  $('#cam').classList.toggle('hidden', next !== 'walk' && next !== 'hunt');
  $('#jump').classList.toggle('hidden', next !== 'walk' && next !== 'hunt' && next !== 'raft');
  $('#raft-exit').classList.toggle('hidden', next !== 'raft');
  $('#quest').classList.toggle('hidden', next === 'hunt');
  if (next !== 'walk') $('#hint').classList.add('gone');
  if (next !== 'dialog') $('#dialog').classList.add('hidden');
  if (next !== 'huntCard') $('#hunt-card').classList.add('hidden');
  if (next !== 'tune') $('#tune').classList.add('hidden');
  closeMenu();
  updateAction();
  updateMusic();
}

/** The music follows the game: calm in the village, each quest's own quicker tune while it is on. */
function updateMusic() {
  const guest = currentGuest(progress);
  const on = guest && ['active', 'returning'].includes(progress.quests[guest].stage);
  const theme: Theme =
    scene === 'tune' ? 'quiet' : scene === 'hunt' ? 'hunt' : scene === 'finale' ? 'finale' : scene === 'raft' ? 'moses' : on ? guest : 'village';
  sound.setTheme(theme);
}

/** A major scale over an octave: quest finds climb it, higher with every one. */
const SCALE = [0, 2, 4, 5, 7, 9, 11, 12];

/** How far up the scale a quest's sounds go when `found` of its items are in (the last one at the top). */
function lift(guest: GuestId, found: number): number {
  const total = QUEST_ITEMS[guest];
  return SCALE[Math.round((Math.max(0, found - 1) / Math.max(1, total - 1)) * (SCALE.length - 1))];
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
  updateMusic();
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
  world.setPets(progress.pets);
  const aaron = progress.quests.aaron;
  const needed = VILLAGERS.filter((_, i) => !aaron.found.includes(String(i))).map((v) => v.needs);
  world.setVillagers(
    aaron.stage !== 'locked',
    VILLAGERS.map((_, i) => aaron.found.includes(String(i)) || aaron.stage === 'done' || aaron.stage === 'returning'),
    VILLAGERS.map((v) => NEED_ICON[v.needs]),
  );
  world.setHelpItems(Object.fromEntries(HELP_IDS.map((id) => [id, aaron.stage === 'active' && needed.includes(id) && carrying !== id])));
  if (aaron.stage !== 'active' && carrying) {
    carrying = null;
    world.setCarrying(null);
  }
  world.setSheaves(progress.quests.joseph.stage === 'active', progress.quests.joseph.found);
  const allDone = GUESTS.every((g) => progress.quests[g].stage === 'done');
  if (allDone !== guestsSeated) {
    guestsSeated = allDone;
    world.seatGuests(allDone);
  }
  const moses = progress.quests.moses;
  world.setJugs(JUG_SPOTS.map((_, i) => moses.stage === 'active' && !moses.found.includes(String(i))));
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

const GUEST_FACE: Record<GuestId, string> = { abraham: '👴🏻', isaac: '🧔🏻', jacob: '🧔🏽', moses: '👴🏼', aaron: '👳🏻', joseph: '🧑🏽', david: '🤴🏻' };

/** Everything a guest says, in the order of their quest. */
const LINES: Record<GuestId, { intro: StringKey; accept: StringKey; waiting: StringKey; thanks: StringKey; done: StringKey }> = {
  abraham: { intro: 'abrahamIntro', accept: 'abrahamAccept', waiting: 'abrahamWaiting', thanks: 'abrahamThanks', done: 'abrahamDone' },
  isaac: { intro: 'isaacIntro', accept: 'isaacAccept', waiting: 'isaacWaiting', thanks: 'isaacThanks', done: 'isaacDone' },
  jacob: { intro: 'jacobIntro', accept: 'jacobAccept', waiting: 'jacobWaiting', thanks: 'jacobThanks', done: 'jacobDone' },
  moses: { intro: 'mosesIntro', accept: 'mosesAccept', waiting: 'mosesWaiting', thanks: 'mosesThanks', done: 'mosesDone' },
  aaron: { intro: 'aaronIntro', accept: 'aaronAccept', waiting: 'aaronWaiting', thanks: 'aaronThanks', done: 'aaronDone' },
  joseph: { intro: 'josephIntro', accept: 'josephAccept', waiting: 'josephWaiting', thanks: 'josephThanks', done: 'josephDone' },
  david: { intro: 'davidIntro', accept: 'davidAccept', waiting: 'davidWaiting', thanks: 'davidThanks', done: 'davidDone' },
};

function talkTo(guest: GuestId) {
  const q = progress.quests[guest];
  const lines = LINES[guest];
  const face = GUEST_FACE[guest];
  const name = t(guest);
  const params = { name: playerName(), coins: QUEST_REWARDS[guest].coins, seconds: lanternSeconds(), n: QUEST_ITEMS[guest] - q.found.length };
  switch (q.stage) {
    case 'notStarted':
      say(face, name, t(lines.intro, params), [
        {
          label: t(lines.accept),
          primary: true,
          onClick: () => {
            commit(startQuest(progress, guest));
            if (guest === 'moses') startRide();
            if (guest === 'david') openTune();
          },
        },
        { label: t('abrahamLater') },
      ]);
      break;
    case 'active':
      say(
        face,
        name,
        t(lines.waiting, params),
        guest === 'moses'
          ? [{ label: t('rideAgain'), primary: true, onClick: startRide }, { label: t('abrahamLater') }]
          : guest === 'david'
            ? [{ label: t('davidAccept'), primary: true, onClick: openTune }, { label: t('abrahamLater') }]
            : [{ label: t('ok'), primary: true }],
      );
      break;
    case 'returning':
      say(face, name, t(lines.thanks, params), [
        {
          label: t('thanks'),
          primary: true,
          onClick: () => {
            commit(completeQuest(progress, guest));
            // A good moment to suggest installing: the kid just finished something and is having fun.
            setTimeout(() => nudgeInstall(), 3000);
            sound.play('fanfare');
            world.sparkle(world.guestSpot(guest), '#ffd166', 2);
            world.celebrate();
          },
        },
      ]);
      break;
    default:
      say(
        face,
        name,
        t(lines.done, params),
        guest === 'moses' ? [{ label: t('rideForFun'), primary: true, onClick: startRide }, { label: t('ok') }] : [{ label: t('ok'), primary: true }],
      );
  }
}

// --- Quest tracker -----------------------------------------------------------------------------

const QUEST_ICON: Record<GuestId, string> = { abraham: '🌿', isaac: '🏮', jacob: '🐑', moses: '🏺', aaron: '💛', joseph: '🌾', david: '🎵' };
const QUEST_TALK: Record<GuestId, StringKey> = {
  abraham: 'questTalk',
  isaac: 'questTalkIsaac',
  jacob: 'questTalkJacob',
  moses: 'questTalkMoses',
  aaron: 'questTalkAaron',
  joseph: 'questTalkJoseph',
  david: 'questTalkDavid',
};
const QUEST_RETURN: Record<GuestId, StringKey> = {
  abraham: 'questReturn',
  isaac: 'questReturnIsaac',
  jacob: 'questReturnJacob',
  moses: 'questReturnMoses',
  aaron: 'questReturnAaron',
  joseph: 'questReturnJoseph',
  david: 'questReturnDavid',
};

/** Joseph's hot/cold meter: how close the nearest hidden sheaf is. */
function sheafTemperature(): string {
  const found = progress.quests.joseph.found;
  const p = world.player.pos;
  const d = Math.min(...SHEAF_SPOTS.filter((_, i) => !found.includes(String(i))).map((s) => Math.hypot(s.x - p.x, s.z - p.z)));
  return t(d < 5 ? 'tempHot' : d < 11 ? 'tempWarm' : d < 20 ? 'tempMild' : 'tempCold');
}

let lastStep = '';

/**
 * The side activities are easy to miss, so once Abraham's quest is done a little reminder stays up until
 * they have been tried: first decorating your own sukkah (Abraham's gift is a lantern for it), then Shoshi's hunt.
 */
type SideGoal = 'decorate' | 'hunt';
function sideGoal(): SideGoal | null {
  if (progress.quests.abraham.stage !== 'done' || scene !== 'walk') return null;
  if (!progress.achievements.includes('firstDecoration')) return 'decorate';
  if (!progress.achievements.includes('firstHunt')) return 'hunt';
  return null;
}
const SIDE: Record<SideGoal, { icon: string; text: StringKey; go: StringKey }> = {
  decorate: { icon: '🛖', text: 'sideDecorate', go: 'sideDecorateGo' },
  hunt: { icon: '🍋', text: 'sideHunt', go: 'sideHuntGo' },
};

function renderQuest() {
  const guest = currentGuest(progress);
  let icon = '🎉';
  let text = t(readyForGrandEvent(progress) ? 'questGrandEvent' : 'questAllDone');
  if (guest) {
    const q = progress.quests[guest];
    const n = q.found.length;
    icon = q.stage === 'returning' ? GUEST_FACE[guest] : QUEST_ICON[guest];
    if (q.stage === 'notStarted') text = t(QUEST_TALK[guest]);
    else if (q.stage === 'returning') text = t(QUEST_RETURN[guest]);
    else if (guest === 'abraham') text = t('questCollect', { n });
    else if (guest === 'isaac') text = lanternDeadline ? t('questLanternsTimer', { n, s: Math.ceil(lanternLeft()) }) : t('questLanterns', { n });
    else if (guest === 'jacob') text = t('questLambs', { n });
    else if (guest === 'moses') text = t('questJugs', { n });
    else if (guest === 'aaron') text = t('questHelp', { n });
    else if (guest === 'joseph') text = t('questSheaves', { n, temp: sheafTemperature() });
    else text = t('questTunes', { n });
  }
  $('#quest-icon').textContent = icon;
  if ($('#quest-text').textContent !== text) $('#quest-text').textContent = text;
  // Screen readers hear about a new step, not every tick of a timer or meter.
  const step = `${guest}:${guest ? progress.quests[guest].stage : readyForGrandEvent(progress)}`;
  if (step !== lastStep) {
    lastStep = step;
    $('#live').textContent = text;
  }
  const side = sideGoal();
  $('#side-quest').classList.toggle('hidden', !side);
  if (side && $('#side-quest').dataset.goal !== side) {
    $('#side-quest').dataset.goal = side;
    $('#side-icon').textContent = SIDE[side].icon;
    $('#side-text').textContent = t(SIDE[side].text);
  }
  $('#quest').classList.toggle('urgent', !!lanternDeadline && lanternLeft() < 10);
}

// --- Contextual action (talk / play / decorate) -----------------------------------------------

type Action = 'talkAbraham' | 'talkIsaac' | 'talkJacob' | 'talkMoses' | 'talkAaron' | 'talkJoseph' | 'talkDavid' | 'playHunt' | 'decorate';
const TALK: Record<GuestId, Action> = {
  abraham: 'talkAbraham',
  isaac: 'talkIsaac',
  jacob: 'talkJacob',
  moses: 'talkMoses',
  aaron: 'talkAaron',
  joseph: 'talkJoseph',
  david: 'talkDavid',
};
let action: Action | null = null;

function nearbyAction(): Action | null {
  if (scene !== 'walk') return null;
  const p = world.player.pos;
  for (const g of GUESTS)
    if (progress.quests[g].stage !== 'locked' && Math.hypot(p.x - world.guestSpot(g).x, p.z - world.guestSpot(g).z) < (guestsSeated ? 1.3 : 2.6)) return TALK[g];
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
    else if (scene === 'finale') showFinaleCard();
    return;
  }
  const onPage = document.activeElement === document.body || document.activeElement === null;
  if (e.code === 'Space' && onPage && (scene === 'walk' || scene === 'hunt' || scene === 'raft')) {
    e.preventDefault();
    jump();
    return;
  }
  if (action && (e.code === 'KeyE' || (onPage && e.code === 'Enter'))) {
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
  checkAaron(near);
  checkJoseph(near);
  checkGrandEvent();

  if (progress.quests.abraham.stage === 'active')
    for (const id of SPECIES) {
      if (progress.quests.abraham.found.includes(id) || !near(SPECIES_SPOTS[id], 1.4)) continue;
      world.sparkle(SPECIES_SPOTS[id], '#b8f28c', 1.2);
      world.celebrate();
      const next = findItem(progress, 'abraham', id);
      sound.play('pickup', lift('abraham', next.quests.abraham.found.length));
      commit(next);
      toast(next.quests.abraham.stage === 'returning' ? `🌿 ${t('allFound')}` : `✨ ${t('foundSpecies', { item: t(id) })}`);
    }

  if (progress.quests.isaac.stage === 'active') {
    if (lanternBlocked >= 0 && !near(LANTERNS[lanternBlocked], 2)) lanternBlocked = -1;
    LANTERNS.forEach((l, i) => {
      if (progress.quests.isaac.found.includes(String(i)) || i === lanternBlocked || !near(l, 1.4)) return;
      if (!lanternDeadline) lanternDeadline = performance.now() + lanternSeconds() * 1000;
      world.sparkle(l, '#ffb347', 1.6);
      const next = findItem(progress, 'isaac', String(i));
      sound.play('chime', lift('isaac', next.quests.isaac.found.length));
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
        sound.play('baa', lift('jacob', progress.quests.jacob.found.length + world.lambStates.filter((s) => s === 'following').length));
      } else if (state === 'following') {
        const l = world.lambPosition(i);
        if (Math.hypot(l.x - PEN.x, l.z - PEN.z) < PEN.r + 0.4) {
          world.sparkle(PEN, '#ffd166', 1);
          const next = findItem(progress, 'jacob', String(i));
          const up = lift('jacob', next.quests.jacob.found.length);
          sound.play('baa', up);
          setTimeout(() => sound.play('pickup', up), 250);
          commit(next);
          toast(next.quests.jacob.stage === 'returning' ? `🐑 ${t('allLambs')}` : `🐑 ${t('lambHome', { n: next.quests.jacob.found.length })}`);
        }
      }
    });
}

// --- Aaron: helping the villagers ------------------------------------------------------------------

const HELP_IDS = Object.keys(HELP_ITEMS) as HelpItem[];
const NEED_ICON: Record<HelpItem, string> = { basket: '🧺', cushion: '💺', lulav: '🌿' };
const NEED_TEXT: Record<HelpItem, StringKey> = { basket: 'needBasket', cushion: 'needCushion', lulav: 'needLulav' };
/** What the player is carrying for Aaron (not saved: after a reload, just pick it up again). */
let carrying: HelpItem | null = null;
/** Villagers the player is standing next to, so each says their line once per visit. */
const besideVillager = VILLAGERS.map(() => false);
let guestsSeated = false;

function checkAaron(near: (v: Vec, r: number) => boolean) {
  const q = progress.quests.aaron;
  if (q.stage !== 'active') return;
  const needed = VILLAGERS.filter((_, i) => !q.found.includes(String(i))).map((v) => v.needs);
  if (!carrying)
    for (const id of HELP_IDS)
      if (needed.includes(id) && near(HELP_ITEMS[id], 1.4)) {
        carrying = id;
        world.setCarrying(id);
        sound.play('pickup', lift('aaron', q.found.length));
        toast(`${NEED_ICON[id]} ${t('pickedUp', { item: t(id) })}`);
        refresh();
      }
  VILLAGERS.forEach((v, i) => {
    if (q.found.includes(String(i))) return;
    if (!near(v, 2)) {
      besideVillager[i] = false;
      return;
    }
    if (carrying === v.needs) {
      carrying = null;
      world.setCarrying(null);
      world.sparkle(v, '#ff8fc7', 1.5);
      world.celebrate();
      const next = findItem(progress, 'aaron', String(i));
      sound.play('achievement', lift('aaron', next.quests.aaron.found.length));
      commit(next);
      toast(`💛 ${t('helped', { n: next.quests.aaron.found.length })}`);
    } else if (!besideVillager[i]) {
      besideVillager[i] = true;
      sound.play('pop');
      toast(carrying ? t('wrongItem') : `${NEED_ICON[v.needs]} ${t(NEED_TEXT[v.needs])}`);
    }
  });
}

// --- Joseph: the hidden sheaves ---------------------------------------------------------------------

function checkJoseph(near: (v: Vec, r: number) => boolean) {
  const q = progress.quests.joseph;
  if (q.stage !== 'active') return;
  SHEAF_SPOTS.forEach((spot, i) => {
    if (q.found.includes(String(i)) || !near(spot, 1.4)) return;
    world.sparkle(spot, '#ffd23f', 1.2);
    world.celebrate();
    const next = findItem(progress, 'joseph', String(i));
    sound.play('chime', lift('joseph', next.quests.joseph.found.length));
    commit(next);
    toast(next.quests.joseph.stage === 'returning' ? `🌾 ${t('allSheaves')}` : `🌾 ${t('sheafFound', { n: next.quests.joseph.found.length })}`);
  });
  renderQuest();
}

// --- David: the musical memory game -------------------------------------------------------------------

const PAD_COLORS = ['#ff5d73', '#ffd23f', '#06d6a0', '#3a86ff'];
let tuneSeq: number[] = [];
let tuneAt = 0;
let tuneListening = false;
let tuneTimers: number[] = [];

function openTune() {
  setScene('tune');
  $('#tune').classList.remove('hidden');
  $('#tune-pads').replaceChildren(
    ...PAD_COLORS.map((c, i) => {
      const b = document.createElement('button');
      b.className = 'pad';
      b.style.setProperty('--pad', c);
      b.setAttribute('aria-label', t('tunePad', { n: i + 1 }));
      b.textContent = String(i + 1);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        pressPad(i);
      });
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pressPad(i);
        }
      });
      return b;
    }),
  );
  newRound();
}

function newRound() {
  const round = progress.quests.david.found.length;
  tuneSeq = Array.from({ length: 3 + round }, () => Math.floor(Math.random() * 4));
  $('#tune-round').textContent = t('tuneRound', { n: round + 1 });
  playTune(900);
}

function flashPad(i: number) {
  const pad = $('#tune-pads').children[i] as HTMLElement | undefined;
  pad?.classList.add('lit');
  sound.note(i);
  window.setTimeout(() => pad?.classList.remove('lit'), 380);
}

function playTune(delay: number) {
  tuneTimers.forEach(clearTimeout);
  tuneListening = true;
  tuneAt = 0;
  $('#tune-status').textContent = t('tuneListen');
  const gap = a11y.calm ? 900 : 620;
  tuneTimers = tuneSeq.map((n, k) => window.setTimeout(() => flashPad(n), delay + k * gap));
  tuneTimers.push(
    window.setTimeout(() => {
      tuneListening = false;
      $('#tune-status').textContent = t('tuneYourTurn');
    }, delay + tuneSeq.length * gap),
  );
}

function pressPad(i: number) {
  if (tuneListening || scene !== 'tune') return;
  flashPad(i);
  if (tuneSeq[tuneAt] !== i) {
    sound.play('fail');
    $('#tune-status').textContent = t('tuneWrong');
    playTune(1100);
    return;
  }
  tuneAt++;
  if (tuneAt < tuneSeq.length) return;
  tuneListening = true;
  const next = findItem(progress, 'david', String(progress.quests.david.found.length));
  commit(next);
  sound.play('achievement', lift('david', next.quests.david.found.length));
  $('#tune-status').textContent = t('tuneGood');
  if (next.quests.david.stage === 'returning')
    tuneTimers.push(
      window.setTimeout(() => {
        setScene('walk');
        talkTo('david');
      }, 1300),
    );
  else tuneTimers.push(window.setTimeout(newRound, 1300));
}

$('#tune-close').addEventListener('click', () => {
  tuneTimers.forEach(clearTimeout);
  setScene('walk');
});
addEventListener('keydown', (e) => {
  if (scene === 'tune' && ['1', '2', '3', '4'].includes(e.key)) pressPad(Number(e.key) - 1);
});

// --- The Grand Sukkot Event ---------------------------------------------------------------------------

world.onFirework = () => sound.play('firework');

function checkGrandEvent() {
  if (!readyForGrandEvent(progress) || !inside(world.player.pos, GRAND_SUKKAH, -0.5)) return;
  commit(celebrateGrandEvent(progress));
  startFinale(true);
}

/** In front of the Grand Sukkah, where the hora is danced. */
const FINALE_CENTER = { x: GRAND_SUKKAH.x, z: GRAND_SUKKAH.z + GRAND_SUKKAH.d / 2 + 3.6 };
let finaleTimers: number[] = [];

/** `first`: the celebration that ends the game (with its rewards), rather than a replay from the menu. */
let finaleFirst = false;

function startFinale(first = false) {
  finaleFirst = first;
  setScene('finale');
  world.startFinale(FINALE_CENTER);
  sound.play('fanfare');
  finaleTimers.forEach(clearTimeout);
  finaleTimers = [
    window.setTimeout(() => sound.play('achievement'), 1600),
    window.setTimeout(showFinaleCard, 4500),
  ];
}

function showFinaleCard() {
  if (scene !== 'finale') return;
  $('#finale-text').textContent = t('finaleText', { name: playerName() });
  $('#finale-hunt').classList.toggle('hidden', progress.achievements.includes('firstHunt'));
  $('#finale-decorate').classList.toggle('hidden', progress.placed.length > 0);
  $('#finale-reward').textContent = finaleFirst ? t('finaleReward', { coins: GRAND_EVENT_REWARD.coins }) : '';
  $('#finale').classList.remove('hidden');
  $('#finale-share').focus();
}

function endFinale() {
  finaleTimers.forEach(clearTimeout);
  world.endFinale();
  setScene('walk');
  refresh();
}

$('#finale-share').addEventListener('click', () =>
  progress.placed.length ? void shareSukkah(t('finaleShareText')) : void shareGame(t('finaleShareText')),
);
$('#finale-dance').addEventListener('click', () => {
  $('#finale').classList.add('hidden');
  // Bring the card back after a while, so there's always a way out of the party.
  finaleTimers.push(window.setTimeout(showFinaleCard, 12000));
});
$('#finale-back').addEventListener('click', endFinale);
$('#m-party').addEventListener('click', () => {
  closeMenu();
  if (scene === 'walk') startFinale(false);
});

// --- Moses' raft ride ---------------------------------------------------------------------------

let ride: Raft | null = null;
/** Jugs already collected on earlier rides (or all of them once the quest is done) stay out of the river. */
const jugsTaken = () => {
  const q = progress.quests.moses;
  return JUG_SPOTS.map((_, i) => i).filter((i) => q.stage !== 'active' || q.found.includes(String(i)));
};

function startRide() {
  ride = startRaft();
  world.setJugs(JUG_SPOTS.map((_, i) => !jugsTaken().includes(i)));
  world.startRide(ride);
  setScene('raft');
  toast(`🛶 ${t('raftHint')}`);
  sound.play('pop');
}

function tickRide(dt: number) {
  if (!ride) return;
  // Screen-right steers towards the inner bank (the chase camera looks downstream).
  const steer = -input.vector()[0];
  for (const e of stepRaft(ride, dt, steer, jugsTaken(), a11y.calm ? 0.65 : 1)) {
    const spot = e.type === 'jug' ? JUG_SPOTS[e.index] : null;
    if (spot) {
      world.sparkle(world.player.pos, '#7fd6ff', 1.2);
      world.celebrate();
      const next = findItem(progress, 'moses', String(e.index));
      sound.play('pickup', lift('moses', next.quests.moses.found.length));
      commit(next);
      world.setJugs(JUG_SPOTS.map((_, i) => !jugsTaken().includes(i)));
      toast(next.quests.moses.stage === 'returning' ? `🏺 ${t('allJugs')}` : `🏺 ${t('jugFound', { n: next.quests.moses.found.length })}`);
    } else {
      sound.play('blip');
      toast(`💥 ${t('rockBump')}`);
    }
  }
  world.syncRide(ride);
  if (ride.over) endRide(false);
}

/** Ends the ride: at the end of the river, or wherever the raft is when the player jumps off. */
function endRide(early: boolean) {
  if (!ride) return;
  const s = ride.s;
  ride = null;
  world.endRide();
  // Step off onto the near bank, right beside where the raft was.
  const bank = early ? resolve(riverPoint(s, -(RIVER.halfWidth + 1.4))) : RIDE_END;
  world.teleport(bank, Math.PI * 0.4);
  setScene('walk');
  if (progress.quests.moses.stage === 'active') toast(`🛶 ${t(early ? 'raftLeft' : 'rideOver')}`);
}

/** Space or the jump button: the player hops, or the raft leaps over rocks. */
function jump() {
  if (scene === 'raft' && ride) {
    if (jumpRaft(ride)) sound.play('pop');
  } else if ((scene === 'walk' || scene === 'hunt') && world.jump()) sound.play('pop');
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
  waterJug: '🏺',
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
  $('#build-share').classList.toggle('hidden', !progress.placed.length);
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

/** Puts the chosen decoration in the first free spot – for keyboards, switches and anyone who'd rather not aim. */
$('#build-auto').addEventListener('click', () => {
  if (!placing || available(progress, placing) <= 0) {
    toast(t('buildPickFirst'));
    return;
  }
  const mount = decoration(placing).mount;
  const taken = progress.placed.filter((p) => decoration(p.id).mount === mount);
  const hw = MY_SUKKAH.w / 2 - 0.6;
  const hd = MY_SUKKAH.d / 2 - 0.6;
  for (let z = -hd; z <= hd + 0.01; z += 0.85)
    for (let x = -hw; x <= hw + 0.01; x += 0.9)
      if (taken.every((p) => Math.hypot(p.x - x, p.z - z) > 0.8)) {
        const before = progress.placed.length;
        commit(place(progress, { id: placing, x: Math.round(x * 4) / 4, z: Math.round(z * 4) / 4, rot: 0 }));
        if (progress.placed.length > before) sound.play('pop');
        if (available(progress, placing) === 0) placing = null;
        refresh();
        return;
      }
  toast(t('sukkahFull'));
});

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
    $('#hunt-card-share').classList.add('hidden');
  } else {
    const h = hunt!;
    const won = h.mine > h.rivals;
    const tie = h.mine === h.rivals;
    $('#hunt-card-art').textContent = won ? '🏆' : tie ? '🤝' : '🐑';
    $('#hunt-card-title').textContent = t(won ? 'huntWin' : tie ? 'huntTie' : 'huntLose');
    $('#hunt-card-text').textContent = t('huntResult', { mine: h.mine, rival: h.rivals, coins: huntReward(h.mine, h.rivals) });
    go.textContent = t('playAgain');
    $('#hunt-card-back').textContent = t('backToVillage');
    $('#hunt-card-share').classList.remove('hidden');
    $('#hunt-card-share').onclick = () => void shareGame(t('shareHunt', { n: h.mine }));
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
  const events = stepHunt(hunt, dt, world.player.pos, (p) => resolve(p, 0.45), a11y.calm ? 0.7 : 1);
  for (const e of events) {
    world.sparkle(hunt.etrogs[e.index], e.by === 'me' ? '#ffe066' : '#ffffff', 1);
    // Every two etrogs the pickup sound climbs a step, up to an octave.
    sound.play(e.by === 'me' ? 'pickup' : 'blip', e.by === 'me' ? SCALE[Math.min(SCALE.length - 1, Math.floor((hunt.mine - 1) / 2))] : 0);
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
  { value: 'starCrown', key: 'hatStarCrown', icon: '🌟' },
];
const ACCESSORIES: Option<AccessoryId>[] = [
  { value: 'none', key: 'accNone', icon: '🚫' },
  { value: 'glasses', key: 'accGlasses', icon: '👓' },
  { value: 'etrogBag', key: 'accEtrogBag', icon: '🍋' },
  { value: 'lantern', key: 'accLantern', icon: '🏮' },
  { value: 'sukkahBackpack', key: 'accBackpack', icon: '🎒' },
  { value: 'harp', key: 'accHarp', icon: '🪕' },
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
  { value: 'rainbow', key: 'patternRainbow', icon: '🌈' },
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
  const owned = <T extends HatId | AccessoryId | Pattern>(list: Option<T>[]) => list.filter((c) => ownsWear(progress, c.value)).map((c) => c.value);
  pickDraft({
    skin: pick(SKINS),
    hair: pick(HAIRS),
    hairStyle: pick(HAIR_STYLES).value,
    eyes: pick(EYES).value,
    mouth: pick(MOUTHS).value,
    shirt: pick(SHIRTS),
    pattern: pick(owned(PATTERNS)),
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
    const locked = priced && !ownsWear(progress, c.value as HatId | AccessoryId | Pattern);
    const earned = REWARD_ONLY.includes(c.value as WearId);
    const price = WEAR_PRICES[c.value as WearId];
    b.innerHTML = '<span class="choice-icon" aria-hidden="true"></span><span class="choice-name"></span>';
    b.querySelector('.choice-icon')!.textContent = c.icon;
    b.querySelector('.choice-name')!.textContent = t(c.key);
    if (locked) {
      b.classList.add('locked');
      const tag = document.createElement('span');
      tag.className = 'choice-price';
      tag.textContent = earned ? '🎁' : `🔒 ${price}`;
      b.append(tag);
      b.setAttribute('aria-label', `${t(c.key)}, ${earned ? t('lockedReward') : t('lockedPrice', { price: price ?? 0 })}`);
    }
    b.addEventListener('click', () => pickDraft({ [key]: c.value }));
    row.append(b);
  }
  return section(label, row);
}

/** A bar offering to buy whatever is being tried on but isn't owned yet. */
function renderTryOn() {
  const bar = $('#try-on');
  const tryOn = [draft.hat, draft.accessory ?? 'none', draft.pattern ?? 'plain'].find((id) => !ownsWear(progress, id)) as WearId | undefined;
  bar.classList.toggle('hidden', !tryOn);
  if (!tryOn) return;
  const choice = [...HATS, ...ACCESSORIES, ...PATTERNS].find((c) => c.value === tryOn)!;
  const buyBtn = $('#try-on-buy');
  if (REWARD_ONLY.includes(tryOn)) {
    // Special things can be tried on, but only the Ushpizin give them.
    $('#try-on-text').textContent = `${choice.icon} ${t('rewardOnly')}`;
    buyBtn.classList.add('hidden');
    return;
  }
  buyBtn.classList.remove('hidden');
  const price = WEAR_PRICES[tryOn]!;
  $('#try-on-text').textContent = `${choice.icon} ${t('tryOnText', { item: t(choice.key), price })}`;
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
      choiceRow('pattern', PATTERNS, 'pattern', true),
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

input.onCamera = (turn, zoom, tilt) => {
  lastMoved = performance.now();
  world.turnCamera(turn, zoom, tilt);
};
for (const [id, turn, zoom] of [
  ['#cam-left', -Math.PI / 4, 1],
  ['#cam-right', Math.PI / 4, 1],
  ['#cam-in', 0, 0.75],
  ['#cam-out', 0, 1.33],
] as const)
  $(id).addEventListener('click', () => world.turnCamera(turn, zoom));
$('#cam-up').addEventListener('click', () => world.turnCamera(0, 1, 0.3));
$('#cam-down').addEventListener('click', () => world.turnCamera(0, 1, -0.3));
$('#jump').addEventListener('click', jump);
$('#raft-exit').addEventListener('click', () => endRide(true));

input.onDrag = (dx) => {
  if (scene === 'creator') world.spin(dx * 0.012);
};
$('#avatar-random').addEventListener('click', randomLook);

$('#creator-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $<HTMLInputElement>('#avatar-name').value.trim().slice(0, 14);
  const first = !progress.avatar;
  const triedOn = [draft.hat, draft.accessory ?? 'none', draft.pattern ?? 'plain'].some((id) => !ownsWear(progress, id));
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
  $('#m-install').classList.toggle('hidden', !installable());
  $('#m-fullscreen').classList.toggle('hidden', !canFullscreen());
  $('#m-fullscreen-label').textContent = t(isFullscreen() ? 'exitFullscreen' : 'fullscreen');
  $('#m-music').setAttribute('aria-pressed', String(sound.prefs.music));
  $('#m-music-icon').textContent = sound.prefs.music ? '🎵' : '🔇';
  $('#m-sfx').setAttribute('aria-pressed', String(sound.prefs.sfx));
  $('#m-sfx-icon').textContent = sound.prefs.sfx ? '🔊' : '🔇';
  // Travelling away mid-hunt would be cheating the race.
  const busy = scene === 'hunt' || scene === 'raft' || scene === 'finale';
  $('#m-party').classList.toggle('hidden', !progress.achievements.includes('grandEvent'));
  $('#m-party').toggleAttribute('disabled', busy);
  $('#m-home').toggleAttribute('disabled', busy);
  $('#m-plaza').toggleAttribute('disabled', busy);
  $('#m-avatar').toggleAttribute('disabled', busy);
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
  if (scene !== 'hunt' && scene !== 'raft') openCreator();
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
$('#m-install').addEventListener('click', () => {
  closeMenu();
  if (canInstall()) void install();
  else nudgeInstall(true);
});
$('#m-reset').addEventListener('click', () => {
  if (!confirm(t('resetConfirm'))) return;
  localStorage.removeItem(SAVE_KEY);
  location.reload();
});

// --- Guidance: the arrow and "take me there" ------------------------------------------------------

/** Set by the side reminder: the arrow then points there (the hunt or your sukkah) until the player arrives. */
let heading: Vec | null = null;

const nearestTo = (list: Vec[]): Vec | undefined => {
  const p = world.player.pos;
  return [...list].sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
};

/** Where the story continues from here (null: nothing to point at, e.g. during Joseph's treasure hunt). */
function objectiveTarget(): Vec | null {
  if (heading) return heading;
  const g = currentGuest(progress);
  if (!g) return readyForGrandEvent(progress) ? GRAND_SUKKAH : !progress.achievements.includes('firstHunt') ? HUB : null;
  const q = progress.quests[g];
  if (q.stage !== 'active') return world.guestSpot(g);
  switch (g) {
    case 'abraham':
      return nearestTo(SPECIES.filter((id) => !q.found.includes(id)).map((id) => SPECIES_SPOTS[id])) ?? null;
    case 'isaac':
      return LANTERNS.find((_, i) => !q.found.includes(String(i))) ?? null;
    case 'jacob':
      return world.lambStates.includes('following') ? PEN : (nearestTo(LAMB_SPOTS.filter((_, i) => world.lambStates[i] === 'lost')) ?? null);
    case 'aaron':
      if (carrying) return VILLAGERS.find((v, i) => v.needs === carrying && !q.found.includes(String(i))) ?? null;
      return nearestTo(VILLAGERS.filter((_, i) => !q.found.includes(String(i))).map((v) => HELP_ITEMS[v.needs])) ?? null;
    case 'joseph':
      return null;
    default:
      return world.guestSpot(g);
  }
}

/** A safe place to arrive at for "take me there": the area's landmark rather than right on top of a challenge. */
function arrivalFor(target: Vec): Vec {
  const g = currentGuest(progress);
  const q = g ? progress.quests[g] : null;
  let anchor = target;
  // Landmarks (the hunt, the Grand Sukkah) are arrived at directly; quest challenges from their entrance.
  if (g && q?.stage === 'active' && target !== HUB && target !== GRAND_SUKKAH) {
    if (g === 'abraham') anchor = { x: GARDEN.x + GARDEN.w / 2 + 1.5, z: GARDEN.z };
    if (g === 'isaac' || g === 'jacob') anchor = world.guestSpot(g);
  }
  // Stand a couple of metres from it, on the side facing the village centre.
  const len = Math.hypot(anchor.x, anchor.z) || 1;
  return resolve({ x: anchor.x - (anchor.x / len) * 2.2, z: anchor.z - (anchor.z / len) * 2.2 });
}

$('#m-goto').addEventListener('click', () => {
  closeMenu();
  const target = objectiveTarget() ?? (currentGuest(progress) ? world.guestSpot(currentGuest(progress)!) : null);
  if (!target || (scene !== 'walk' && scene !== 'hunt')) return;
  world.teleport(arrivalFor(target), world.player.heading);
  world.sparkle(world.player.pos, '#ffd23f', 1);
  sound.play('pop');
});
$('#side-quest').addEventListener('click', () => {
  const side = sideGoal();
  if (!side) return;
  heading = side === 'hunt' ? HUB : MY_SUKKAH;
  toast(`${SIDE[side].icon} ${t(SIDE[side].go)}`);
});

// --- Accessibility settings -------------------------------------------------------------------------

const A11Y_KEY = 'sukkahWorld.a11y';
const a11y: { calm: boolean; bigText: boolean; lessMotion: boolean | null; camPad: boolean; battery: boolean } = {
  calm: false,
  bigText: false,
  lessMotion: null,
  camPad: false,
  battery: false,
  ...JSON.parse(localStorage.getItem(A11Y_KEY) ?? '{}'),
};
/** Isaac's lantern challenge: twice as long in the calm game. */
const lanternSeconds = () => LANTERN_SECONDS * (a11y.calm ? 2 : 1);

function applyA11y() {
  localStorage.setItem(A11Y_KEY, JSON.stringify(a11y));
  const less = a11y.lessMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.toggle('big-text', a11y.bigText);
  document.documentElement.classList.toggle('reduce-motion', less);
  world.setReducedMotion(a11y.lessMotion);
  document.documentElement.classList.toggle('cam-pad', a11y.camPad);
  world.setBatterySaver(a11y.battery);
  $('#m-campad').setAttribute('aria-pressed', String(a11y.camPad));
  $('#m-battery').setAttribute('aria-pressed', String(a11y.battery));
  $('#m-calm').setAttribute('aria-pressed', String(a11y.calm));
  $('#m-bigtext').setAttribute('aria-pressed', String(a11y.bigText));
  $('#m-motion').setAttribute('aria-pressed', String(less));
}

$('#m-calm').addEventListener('click', () => {
  a11y.calm = !a11y.calm;
  applyA11y();
  toast(t(a11y.calm ? 'calmOn' : 'calmOff'));
});
$('#m-bigtext').addEventListener('click', () => {
  a11y.bigText = !a11y.bigText;
  applyA11y();
});
$('#m-motion').addEventListener('click', () => {
  const now = a11y.lessMotion ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  a11y.lessMotion = !now;
  applyA11y();
});
$('#m-campad').addEventListener('click', () => {
  a11y.camPad = !a11y.camPad;
  applyA11y();
});
$('#m-battery').addEventListener('click', () => {
  a11y.battery = !a11y.battery;
  applyA11y();
  toast(t(a11y.battery ? 'batteryOn' : 'batteryOff'));
});
applyA11y();

// --- Terms, privacy and accessibility pages ---------------------------------------------------------

let pageOpener: HTMLElement | null = null;

function openPage(id: PageId) {
  closeMenu();
  pageOpener = document.activeElement as HTMLElement | null;
  $('#page-title').textContent = PAGE_TITLES[id];
  $('#page-body').innerHTML = PAGES[id];
  $('#page').classList.remove('hidden');
  input.reset();
  input.walking = false;
  $('#page-close').focus();
}

function closePage() {
  if ($('#page').classList.contains('hidden')) return false;
  $('#page').classList.add('hidden');
  input.walking = scene === 'walk' || scene === 'hunt' || scene === 'raft';
  pageOpener?.focus();
  return true;
}

document.querySelectorAll<HTMLElement>('[data-page]').forEach((b) => b.addEventListener('click', () => openPage(b.dataset.page as PageId)));
$('#page-close').addEventListener('click', closePage);
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && closePage()) e.stopImmediatePropagation();
}, true);

// --- Sharing ------------------------------------------------------------------------------------

const shareUrl = () => location.origin + location.pathname;

/** The device's share sheet where there is one; otherwise WhatsApp or copying the link. */
async function shareGame(text = t('shareText')) {
  const url = shareUrl();
  if (navigator.share) {
    try {
      await navigator.share({ title: t('appName'), text, url });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  $<HTMLAnchorElement>('#share-whatsapp').href = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
  $('#share').classList.remove('hidden');
  $('#share-copy').focus();
}

/**
 * A greeting card with a photo of the player's sukkah: the photo, their name and a holiday wish. Built
 * synchronously (no awaits) so the share sheet still counts as a response to the tap on iPhones.
 */
function sukkahCard(): File {
  const W = 1080;
  const card = document.createElement('canvas');
  card.width = W;
  card.height = 1350;
  const c = card.getContext('2d')!;
  c.fillStyle = '#ffd23f';
  c.fillRect(0, 0, W, card.height);
  c.drawImage(world.photoSukkah(W), 0, 0);
  c.fillStyle = '#fffaf0';
  c.beginPath();
  c.roundRect(40, W - 70, W - 80, 340, 48);
  c.fill();
  c.direction = 'rtl';
  c.textAlign = 'center';
  c.fillStyle = '#1d2b53';
  const font = "'Rubik Variable', system-ui, sans-serif";
  c.font = `900 76px ${font}`;
  c.fillText(t('photoTitle', { name: playerName() }), W / 2, W + 40);
  c.font = `800 56px ${font}`;
  c.fillText(t('photoWish'), W / 2, W + 130);
  c.font = `700 34px ${font}`;
  c.fillStyle = '#4a5578';
  c.fillText(t('appName'), W / 2, W + 215);
  const data = atob(card.toDataURL('image/png').split(',')[1]);
  const bytes = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);
  return new File([bytes], 'my-sukkah.png', { type: 'image/png' });
}

/** Shares the sukkah photo where the device can share pictures; otherwise saves it and offers the link. */
async function shareSukkah(text: string) {
  const file = sukkahCard();
  sound.play('pop');
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: t('appName'), text: `${text} ${shareUrl()}` });
    } catch {
      /* closed the share sheet */
    }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  toast(`📸 ${t('photoSaved')}`);
  void shareGame(text);
}

$('#build-share').addEventListener('click', () => void shareSukkah(t('photoShareText')));

$('#m-share').addEventListener('click', () => {
  closeMenu();
  void shareGame();
});
$('#share-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(shareUrl());
    toast(`🔗 ${t('shareCopied')}`);
  } catch {
    prompt(t('shareCopy'), shareUrl());
  }
  $('#share').classList.add('hidden');
});
$('#share-close').addEventListener('click', () => $('#share').classList.add('hidden'));

// --- Install nudge --------------------------------------------------------------------------------

const NUDGE_KEY = 'sukkahWorld.installNudge';

/** Suggests installing the game, at most every couple of days and three times in all. */
function nudgeInstall(force = false) {
  if (!installable() || scene !== 'walk' || !$('#install-nudge').classList.contains('hidden')) return;
  const seen = JSON.parse(localStorage.getItem(NUDGE_KEY) ?? '{"count":0,"at":0}') as { count: number; at: number };
  if (!force && (seen.count >= 3 || Date.now() - seen.at < 2 * 24 * 3600 * 1000)) return;
  localStorage.setItem(NUDGE_KEY, JSON.stringify({ count: seen.count + 1, at: Date.now() }));
  const phone = matchMedia('(pointer: coarse)').matches;
  $('#install-title').textContent = t(phone ? 'installTitleMobile' : 'installTitleDesktop');
  $('#install-lead').textContent = t(isIos() && !canInstall() ? 'installIos' : 'installLead');
  $('#install-yes').textContent = t(isIos() && !canInstall() ? 'installGotIt' : 'installNow');
  $('#install-nudge').classList.remove('hidden');
  sound.play('pop');
}

$('#install-yes').addEventListener('click', () => {
  $('#install-nudge').classList.add('hidden');
  if (canInstall()) void install();
});
$('#install-no').addEventListener('click', () => $('#install-nudge').classList.add('hidden'));
// Also after a few minutes of play, for kids who haven't finished a quest yet.
setTimeout(() => nudgeInstall(), 4 * 60 * 1000);

// --- Hint --------------------------------------------------------------------------------------

let hintShown = false;

function showHint() {
  const hint = $('#hint');
  hint.textContent = t(matchMedia('(pointer: coarse)').matches ? 'hintTouch' : 'hintKeys');
  hint.classList.remove('gone');
  hintShown = true;
}

// --- Main loop ---------------------------------------------------------------------------------

/** When the player last moved (ms); standing still for a while lets the world draw at a calmer pace. */
let lastMoved = 0;

function loop(now: number) {
  requestAnimationFrame(loop);
  const moving = scene === 'walk' ? now - lastMoved < 4000 : scene === 'hunt' || scene === 'raft' || scene === 'finale';
  world.setPace(moving);
  if (!world.due(now)) return;
  const dt = world.frame();
  if (heading && Math.hypot(world.player.pos.x - heading.x, world.player.pos.z - heading.z) < 4) heading = null;
  world.setGuide(scene === 'walk' ? objectiveTarget() : null);
  if (scene === 'raft') tickRide(dt);
  else if (scene === 'walk' || scene === 'hunt') {
    const moved = world.walk(dt, input.vector(), input.running());
    if (moved > 0) lastMoved = now;
    if (moved > 0 && hintShown) {
      hintShown = false;
      setTimeout(() => $('#hint').classList.add('gone'), 1200);
    }
    if (scene === 'walk') {
      checkQuestItems();
      updateAction();
    } else tickHunt(dt);
  }
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
      tuneSeq: () => [...tuneSeq],
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
requestAnimationFrame((now) => {
  loop(now);
  document.body.classList.add('ready');
  $('#splash').classList.add('done');
  setTimeout(() => $('#splash').remove(), 600);
});

/**
 * The game shell: menus, the flow of a chapter (intro → play → replay → results → prizes → mop → next
 * chapter), the daily challenge, the shop and the album, saving, settings and the PWA bits. Rules live in
 * src/game, the 3D in src/world; this wires them to the UI.
 */
import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { Sound } from './audio';
import { Coach } from './coach';
import { MopScene, Replay } from './finale';
import { Arena } from './game/arena';
import { FOODS, type FoodId } from './game/foods';
import { dailyLevel, type Level, levelById, LEVELS } from './game/levels';
import { aimAt, type Vec3 } from './game/physics';
import {
  buyTier, buyUpgrade, canAffordUpgrade, chaptersOpen, chooseSkin, dailyOpen, finishDaily, finishLevel, firstTime, KEY, loadProgress,
  newProgress, saveProgress, shopOpen, SKINS, totalStars, type UpgradeId,
} from './game/progress';
import { type Boards, fetchBoards, leave, loadPlayer, randomNick, report, savePlayer } from './leaderboard';
import { bestShots } from './game/replay';
import { applyDocument, type StringKey, t } from './i18n';
import { Notice } from './notice';
import { Play } from './play';
import { canFullscreen, install, installable, isFullscreen, isIos, onPwaChange, toggleFullscreen } from './pwa';
import { type Prize, RevealStage } from './reveal';
import {
  clock, foodBars, foodName, goalText, kingName, num, renderAlbum, renderChapters, renderHudGoals, renderIntro, renderResult, renderShop,
  renderTray, type ResultInfo, type ShopTab, updateStarMeter, updateTray, worldName,
} from './ui';
import { loadAssets } from './world/assets';
import { World } from './world/world';

const $ = (id: string) => document.getElementById(id)!;

applyDocument();
$('app-version').textContent = __APP_VERSION__;

const sound = new Sound();
let progress = loadProgress();
const player = loadPlayer();
const save = () => saveProgress(progress);

// --- Settings ------------------------------------------------------------------------------------------

const PREFS_KEY = 'smashIt.prefs';
const prefs = { calm: matchMedia('(prefers-reduced-motion: reduce)').matches, battery: false, haptics: true };
try {
  Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}'));
} catch {
  /* defaults */
}
const savePrefs = () => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
};

const world = new World($('stage'));
world.cam.calm = prefs.calm;
world.setBatterySaver(prefs.battery);
world.setSkin(progress.skin);

// --- Small UI helpers ----------------------------------------------------------------------------------

const toast = new Notice($('toast'));
const coach = new Coach($('coach'), $('live'));

/** A message: during play it goes through the one message channel (ahead of tips), otherwise a toast. */
function say(text: string, icon = '✨') {
  if (mode === 'play') return coach.say(icon, text, true);
  $('toast').textContent = text;
  toast.show(2600);
  $('live').textContent = text;
}

let bannerTimer = 0;
/** A big message in the middle of the screen: the most important thing right now, so tips step aside. */
function banner(text: string, cls = '', ms = 1400) {
  const b = $('banner');
  b.textContent = text;
  b.className = `banner ${cls}`;
  // Restart the pop-in animation.
  b.style.animation = 'none';
  void b.offsetWidth;
  b.style.animation = '';
  clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => b.classList.add('hidden'), ms);
  if (mode === 'play') coach.hold(ms);
}

function popup(html: string, at: Vec3, cls = '') {
  const p = world.project(at);
  if (!p.visible) return;
  const d = document.createElement('div');
  d.className = `popup ${cls}`;
  d.innerHTML = html;
  const edge = Math.min(70, innerWidth / 2);
  d.style.left = `${Math.min(innerWidth - edge, Math.max(edge, p.x))}px`;
  d.style.top = `${p.y}px`;
  $('popups').append(d);
  setTimeout(() => d.remove(), 1150);
}

function buzz(ms: number) {
  if (prefs.haptics && !prefs.calm) navigator.vibrate?.(ms);
}

const screens = ['home', 'chapters', 'shop', 'intro', 'hud', 'tray', 'top-stack', 'combo', 'replay-bar', 'result', 'mop-hint', 'mop-skip', 'pause', 'vignette', 'aim-hint', 'banner', 'rotate', 'reveal', 'album', 'board', 'join'];
function show(...ids: string[]) {
  for (const id of screens) $(id).classList.toggle('hidden', !ids.includes(id));
  closeMenu();
  if (!ids.includes('hud')) coach.clear();
  else if (updateNotice.shown) {
    updateNotice.hide(true);
    updateWaiting = true;
  }
}

// --- Layers: only the top-most overlay can be reached ---------------------------------------------------

/** Overlays from the bottom of the stack to the top (a panel opened from another one is later in the list). */
const overlayStack = ['pause', 'menu', 'chapters', 'album', 'board', 'join', 'shop', 'page'];
/** The screens an overlay can sit on. */
const baseLayers = ['home', 'intro', 'result', 'hud', 'tray', 'top-stack', 'rotate'];
let focusBefore: HTMLElement | null = null;
let topOverlay: string | null = null;

/** Everything under the top-most open overlay stops taking taps and focus; focus moves in when one opens and back out when all are closed. */
function syncLayers() {
  const open = overlayStack.filter((id) => !$(id).classList.contains('hidden'));
  const top = open.at(-1) ?? null;
  for (const id of [...baseLayers, ...overlayStack]) $(id).inert = top !== null && id !== top;
  $('menu-btn').setAttribute('aria-expanded', String(open.includes('menu')));
  if (top === topOverlay) return;
  const was = topOverlay;
  topOverlay = top;
  if (top) {
    if (!was && document.activeElement instanceof HTMLElement) focusBefore = document.activeElement;
    const el = $(top);
    if (!el.contains(document.activeElement)) {
      const heading = el.querySelector<HTMLElement>('h2');
      const target = el.querySelector<HTMLElement>('[data-autofocus]') ?? heading;
      heading?.setAttribute('tabindex', '-1');
      target?.focus({ preventScroll: true });
    }
  } else {
    focusBefore?.focus({ preventScroll: true });
    focusBefore = null;
  }
}
const layerObserver = new MutationObserver(syncLayers);
for (const id of overlayStack) layerObserver.observe($(id), { attributes: true, attributeFilter: ['class'] });

// The messages under the HUD start just below it, however tall it is (it wraps on phones).
new ResizeObserver(() => {
  const r = $('hud').getBoundingClientRect();
  if (r.height) document.documentElement.style.setProperty('--hud-bottom', `${r.bottom}px`);
}).observe($('hud'));

// --- Flow ----------------------------------------------------------------------------------------------

type Mode = 'menu' | 'play' | 'replay' | 'result' | 'prize' | 'mop' | 'title';
let mode: Mode = 'menu';
let level: Level = levelById(progress.unlocked);
let play: Play | null = null;
let replay: Replay | null = null;
let mop: MopScene | null = null;
let result: ResultInfo | null = null;
let titleUntil = 0;
/** Today's date while playing the daily challenge. */
let daily: string | null = null;
/** After the mop: replay this chapter for more stars. */
let again = false;
let prizes: Prize[] = [];
let starsReached = 1;

const today = () => new Date().toISOString().slice(0, 10);

/** The player's current world, with its bugs wandering about (no king, no clock). */
function demoLevel(): Level {
  const l = levelById(progress.unlocked);
  return { ...l, time: 1e9, boss: undefined, groups: undefined, rareEvery: undefined, max: 7, obstacles: l.obstacles.filter((o) => o.kind !== 'fence') };
}
let demo = new Arena(demoLevel());

function toMenu() {
  mode = 'menu';
  play = null;
  daily = null;
  replay?.stop();
  replay = null;
  mop = null;
  demo = new Arena(demoLevel());
  world.setLevel(demoLevel());
  world.mess.clear();
  world.bind(demo);
  world.mopTo(null, 0);
  world.loadPouch(progress.food);
  sound.setTheme('menu');
  renderHome();
  show('home');
  offerUpdate();
}

function renderHome() {
  $('home-coins').textContent = num(progress.coins);
  // The very first time there is just one big button; the rest appears as it becomes useful.
  const first = !progress.seen.includes('intro');
  $('home-play').textContent = first ? t('play') : t('playChapter', { n: progress.unlocked });
  $('home-chapters').classList.toggle('hidden', !chaptersOpen(progress));
  $('home-shop').classList.toggle('hidden', !shopOpen(progress));
  $('home-album').classList.toggle('hidden', !Object.keys(progress.album).length);
  $('home-board').classList.toggle('hidden', !chaptersOpen(progress));
  $('home-daily').classList.toggle('hidden', !dailyOpen(progress));
  $('home-daily-best').textContent = progress.daily.date === today() && progress.daily.best ? `· ${t('dailyBest', { n: num(progress.daily.best) })}` : '';
}

/** A tip shown only once ever (remembered in the save). */
function tip(id: string, icon: string, text: string): boolean {
  if (!firstTime(progress, id)) return false;
  save();
  coach.say(icon, text);
  return true;
}

function openIntro(id: number) {
  level = levelById(id);
  daily = null;
  renderIntro(progress, level);
  if (mode !== 'menu') toMenu();
  world.setLevel(level);
  show('intro');
  $('intro-go').focus();
}

function startLevel(withMission = false, assist = false) {
  mode = 'play';
  const shot = () => {
    $('aim-hint').classList.add('hidden');
    if (firstTime(progress, 'aim')) save();
  };
  play = new Play(world, sound, progress, level, { popup, banner, toast: (text) => say(text), shot, tip, buzz }, () => prefs.calm, assist);
  starsReached = 1;
  show('hud', 'tray', 'top-stack', 'rotate', ...(progress.seen.includes('aim') ? [] : ['aim-hint']));
  renderTray(progress, play.food, pickFood);
  banner(daily ? t('daily') : t('chapter', { n: level.id }), '', 1100);
  // Tips for this moment, in order: the mission (when there was no intro card), the food tray, the best food here.
  if (withMission) coach.say('🎯', t('coachMission', { goal: level.goals.map((g) => goalText(g, level)).join(' · ') }));
  // A new world gets its name up in lights; a king gets introduced.
  if (level.index === 1 && !daily) banner(`${t('world', { n: level.world })} · ${worldName(level.world)}`, 'mint', 1600);
  if (level.boss) coach.say('👑', t('coachKing', { name: kingName(level), n: level.boss.hp }));
  sound.setTheme(level.boss ? 'boss' : 'play');
  $('rotate').classList.toggle('hidden', !level.rotate);
  if (level.rotate) tip('rotate', '🔄', t('coachRotate'));
  if (level.obstacles.some((o) => o.kind === 'fence')) tip('fence', '🚧', t('coachFence'));
  if (progress.owned.length > 1 && tip('tray', '👇', t('coachTray'))) {
    $('tray').classList.remove('pulse');
    void $('tray').offsetWidth;
    $('tray').classList.add('pulse');
  }
  const best = FOODS[level.tip];
  if (level.id > 1 && progress.owned.includes(best.id) && best.id !== play.food) tip(`tip:${level.id}`, best.emoji, t('coachTip', { food: foodName(best.id) }));
}

function startDaily() {
  daily = today();
  level = dailyLevel(daily, progress.unlocked);
  world.setLevel(level);
  startLevel();
}

function pickFood(id: FoodId) {
  play?.selectFood(id);
  save();
}

/** The chapter is over: bank it, then show the best shots in slow motion. */
function endLevel() {
  const arena = play!.arena;
  const s = arena.session;
  const before = progress.best[level.id] ?? 0;
  const coins = s.coins();
  const stars = s.stars();
  let unlocked: number | null = null;
  let dailyInfo: ResultInfo['daily'];
  prizes = [];
  if (daily) {
    const isNew = finishDaily(progress, daily, s.score, coins);
    for (const [k, n] of Object.entries(s.byKind)) progress.album[k as keyof typeof progress.album] = (progress.album[k as keyof typeof progress.album] ?? 0) + (n ?? 0);
    dailyInfo = { best: progress.daily.best, isNew };
  } else {
    const won = finishLevel(progress, { levelId: level.id, success: s.success, score: s.score, stars, coins, hits: s.byKind });
    unlocked = won.opened ? progress.unlocked : null;
    prizes = [...won.foods.map((id) => ({ kind: 'food' as const, id })), ...won.skins.map((id) => ({ kind: 'skin' as const, id }))];
  }
  // Leaderboards (only for players who joined): stars and chapter, and today's challenge score.
  if (daily) void report(player, totalStars(progress), progress.unlocked, { date: daily, score: progress.daily.best });
  else if (s.success) void report(player, totalStars(progress), progress.unlocked);
  const canBuy = canAffordUpgrade(progress);
  // The shop opens for good the first time there is something to buy.
  if (canBuy) firstTime(progress, 'shop');
  save();
  result = {
    success: s.success,
    level,
    session: s,
    coins,
    stars,
    newBest: !daily && s.score > before && before > 0,
    unlocked,
    lastChapter: level.id === LEVELS.length,
    canBuy,
    daily: dailyInfo,
  };
  const shots = bestShots(arena, 3);
  sound.setTheme('quiet');
  if (!shots.length) return showResult();
  mode = 'replay';
  replay = new Replay(world, sound, level, shots);
  show('replay-bar', 'vignette');
  $('vignette').classList.remove('dark');
}

function showResult() {
  replay?.stop();
  replay = null;
  mode = 'result';
  world.bind(play!.arena, world.mess);
  world.overviewCamera(1.5);
  renderResult(result!);
  show('result', 'vignette');
  $('vignette').classList.add('dark');
  sound.setTheme('menu');
  sound.play(result!.success ? 'win' : 'lose');
  $('result-next').focus();
  if (daily) void showDailyRank(daily);
}

/** After the results: any prizes first, then the mop. */
function nextAfterResult() {
  const prize = prizes.shift();
  if (prize) return showPrize(prize);
  startMop();
}

// --- Prizes --------------------------------------------------------------------------------------------

const stage = new RevealStage($('reveal-canvas') as HTMLCanvasElement);
let shownPrize: Prize | null = null;

function showPrize(prize: Prize) {
  mode = 'prize';
  shownPrize = prize;
  show('reveal');
  if (prize.kind === 'food') {
    const f = FOODS[prize.id];
    $('reveal-kicker').textContent = `🎁 ${t('prizeTitle')}`;
    $('reveal-title').textContent = `${f.emoji} ${foodName(prize.id)}`;
    $('reveal-text').textContent = t(`foodInfo_${prize.id}` as StringKey);
    $('reveal-bars').replaceChildren(...foodBars(prize.id));
    $('reveal-bars').classList.remove('hidden');
    $('reveal-ok').textContent = t('prizeTake');
    $('reveal-later').classList.add('hidden');
  } else {
    const s = SKINS.find((k) => k.id === prize.id)!;
    $('reveal-kicker').textContent = `${s.emoji} ${t('prizeSkin')}`;
    $('reveal-title').textContent = t(`skin_${prize.id}` as StringKey);
    $('reveal-text').textContent = t('prizeSkinText', { n: s.stars });
    $('reveal-bars').classList.add('hidden');
    $('reveal-ok').textContent = t('prizeWear');
    $('reveal-later').classList.remove('hidden');
  }
  stage.show(prize);
  confetti();
  sound.play('whoosh');
  setTimeout(() => sound.play('fanfare'), 250);
  buzz(50);
  $('reveal-ok').focus();
}

function confetti() {
  const box = $('confetti');
  const colors = ['#ffd23f', '#ff5b85', '#4dd0ff', '#7dff8a', '#b98cff', '#ffffff'];
  box.replaceChildren(
    ...Array.from({ length: 46 }, (_, i) => {
      const c = document.createElement('i');
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = `${2.2 + Math.random() * 2}s`;
      c.style.animationDelay = `${Math.random() * 0.8}s`;
      return c;
    }),
  );
}

function closePrize(use: boolean) {
  stage.hide();
  const p = shownPrize;
  shownPrize = null;
  if (p && use) {
    if (p.kind === 'food') progress.food = p.id;
    else if (chooseSkin(progress, p.id)) world.setSkin(p.id);
    save();
    world.loadPouch(progress.food);
  }
  nextAfterResult();
}

// --- Leaderboards ---------------------------------------------------------------------------------------

let boardTab: 'daily' | 'all' = 'daily';
let boards: Boards | null = null;

/** Opens the leaderboards; the first time, asks whether to join (with a nickname). */
function openBoard() {
  if (!player.joined) return openJoin(() => openBoard());
  $('board').classList.remove('hidden');
  boards = null;
  drawBoard();
  void fetchBoards(player, today()).then((b) => {
    boards = b;
    drawBoard(b === null);
  });
}

function drawBoard(offline = false) {
  $('board-tab-daily').setAttribute('aria-selected', String(boardTab === 'daily'));
  $('board-tab-all').setAttribute('aria-selected', String(boardTab === 'all'));
  const list = $('board-list');
  const item = (text: string, cls = '') => Object.assign(document.createElement('li'), { textContent: text, className: cls });
  if (!boards) {
    list.replaceChildren(item(offline ? t('boardOffline') : t('loading'), 'empty'));
    $('board-me').textContent = '';
    return;
  }
  const rows =
    boardTab === 'daily'
      ? boards.daily.map((r) => ({ who: r.name, what: t('boardPoints', { n: num(r.score) }), me: r.me }))
      : boards.all.map((r) => ({ who: r.name, what: t('boardStars', { stars: r.stars, n: r.chapter }), me: r.me }));
  list.replaceChildren(
    ...(rows.length
      ? rows.map((r) => {
          const li = document.createElement('li');
          li.className = r.me ? 'me' : '';
          li.append(Object.assign(document.createElement('span'), { className: 'who', textContent: r.who }), Object.assign(document.createElement('span'), { className: 'what', textContent: r.what }));
          return li;
        })
      : [item(t('boardEmpty'), 'empty')]),
  );
  const rank = boardTab === 'daily' ? boards.rank.daily : boards.rank.all;
  $('board-me').textContent = rank ? `${player.name} · ${t(boardTab === 'daily' ? 'yourRankToday' : 'yourRankAll', { n: rank })}` : player.name;
}

let afterJoin: (() => void) | null = null;
function openJoin(then: () => void) {
  afterJoin = then;
  ($('join-name') as HTMLInputElement).value = player.name || randomNick();
  $('join').classList.remove('hidden');
  ($('join-name') as HTMLInputElement).select();
}

$('join-dice').addEventListener('click', () => {
  ($('join-name') as HTMLInputElement).value = randomNick();
  sound.play('click');
});
$('join-later').addEventListener('click', () => $('join').classList.add('hidden'));
$('join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = ($('join-name') as HTMLInputElement).value.trim().slice(0, 14);
  if (!name) return;
  player.name = name;
  player.joined = true;
  savePlayer(player);
  $('join').classList.add('hidden');
  sound.play('buy');
  // Send what's been earned so far, then show the boards.
  void report(player, totalStars(progress), progress.unlocked, progress.daily.date === today() ? { date: today(), score: progress.daily.best } : undefined).then(() => {
    const then = afterJoin;
    afterJoin = null;
    then?.();
  });
});
$('board-tab-daily').addEventListener('click', () => {
  boardTab = 'daily';
  drawBoard();
});
$('board-tab-all').addEventListener('click', () => {
  boardTab = 'all';
  drawBoard();
});
$('board-rename').addEventListener('click', () => {
  $('board').classList.add('hidden');
  openJoin(() => openBoard());
});
$('board-leave').addEventListener('click', async () => {
  if (!confirm(t('leaveConfirm'))) return;
  await leave(player);
  player.joined = false;
  savePlayer(player);
  $('board').classList.add('hidden');
  say(t('leftBoard'));
});

/** On the daily challenge's results: today's place, once the server has it. */
async function showDailyRank(date: string) {
  if (!player.joined) return;
  const b = await fetchBoards(player, date);
  const rank = b?.rank.daily;
  if (!rank || mode !== 'result' || !result?.daily) return;
  const note = $('result-note');
  if (!note.textContent?.includes('🏆')) note.textContent = `${note.textContent} · 🏆 ${t('yourRankToday', { n: rank })}`;
}

// --- After the results ----------------------------------------------------------------------------------

function startMop() {
  mode = 'mop';
  mop = new MopScene(world, sound);
  show('mop-hint', ...(progress.seen.includes('mop') ? ['mop-skip'] : []));
}

function afterMop() {
  mop = null;
  if (firstTime(progress, 'mop')) save();
  const r = result!;
  if (daily || (r.success && r.lastChapter && !again)) return toMenu();
  level = levelById(again || !r.success ? level.id : level.id + 1);
  again = false;
  mode = 'title';
  titleUntil = performance.now() + 1700;
  world.setLevel(level);
  world.bind(null);
  show('banner');
  banner(t('chapter', { n: level.id }), '', 1700);
  sound.play('combo', 4);
}

async function shareResult() {
  const r = result!;
  const text = t('shareText', { score: num(r.session.score), n: daily ? t('daily') : r.level.id, stars: '⭐'.repeat(r.stars) });
  const url = location.origin + location.pathname;
  try {
    if (navigator.share) await navigator.share({ text, url });
    else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      say(t('shareCopied'));
    }
  } catch {
    /* cancelled */
  }
}

// --- Buttons -------------------------------------------------------------------------------------------

$('home-play').addEventListener('click', () => {
  // The first game goes straight in: the mission is told while playing.
  if (firstTime(progress, 'intro')) {
    save();
    level = levelById(1);
    world.setLevel(level);
    return startLevel(true);
  }
  openIntro(progress.unlocked);
});
$('home-chapters').addEventListener('click', () => {
  renderChapters(progress, (id) => openIntro(id));
  $('chapters').classList.remove('hidden');
});
$('home-shop').addEventListener('click', () => openShop());
$('home-album').addEventListener('click', () => {
  renderAlbum(progress);
  $('album').classList.remove('hidden');
});
$('home-daily').addEventListener('click', () => startDaily());
$('home-board').addEventListener('click', () => openBoard());
$('intro-go').addEventListener('click', () => startLevel());
$('intro-assist').addEventListener('click', () => startLevel(false, true));
$('intro-shop').addEventListener('click', () => openShop());
$('intro-back').addEventListener('click', () => toMenu());
$('result-next').addEventListener('click', () => nextAfterResult());
$('result-again').addEventListener('click', () => {
  again = true;
  nextAfterResult();
});
$('result-shop').addEventListener('click', () => openShop());
$('result-share').addEventListener('click', () => void shareResult());
$('replay-skip').addEventListener('click', () => showResult());
$('reveal-ok').addEventListener('click', () => closePrize(true));
$('reveal-later').addEventListener('click', () => closePrize(false));
$('mop-skip').addEventListener('click', () => {
  if (mop?.finish()) afterMop();
});

document.querySelectorAll<HTMLElement>('[data-close]').forEach((b) =>
  b.addEventListener('click', () => {
    b.closest('.screen')!.classList.add('hidden');
    if (b.closest('#shop')) afterShop();
  }),
);
// A tap on the dimmed area around a card closes it too (not the pause and prize screens, which need a choice).
for (const id of ['menu', 'chapters', 'album', 'board', 'page', 'shop']) {
  $(id).addEventListener('click', (e) => {
    if (e.target !== $(id)) return;
    $(id).classList.add('hidden');
    if (id === 'shop') afterShop();
  });
}

let shopTab: ShopTab = 'foods';
function openShop() {
  drawShop();
  $('shop').classList.remove('hidden');
}
function drawShop() {
  renderShop(progress, shopTab, {
    buyTier: (id) => {
      if (!buyTier(progress, id)) return;
      save();
      sound.play('buy');
      drawShop();
    },
    chooseFood: (id) => {
      progress.food = id;
      save();
      sound.play('click');
      drawShop();
    },
    buyUpgrade: (id: UpgradeId) => {
      if (!buyUpgrade(progress, id)) return;
      save();
      sound.play('buy');
      drawShop();
    },
    chooseSkin: (id) => {
      if (!chooseSkin(progress, id)) return;
      save();
      world.setSkin(id);
      sound.play('click');
      drawShop();
    },
  });
}
function afterShop() {
  renderHome();
  if (result && !$('result').classList.contains('hidden')) {
    result.canBuy = canAffordUpgrade(progress);
    $('result-shop').classList.toggle('glow', result.canBuy);
  }
  if (!$('intro').classList.contains('hidden')) renderIntro(progress, level);
  world.loadPouch(progress.food);
}
for (const tab of ['foods', 'upgrades', 'skins'] as ShopTab[])
  $(`tab-${tab}`).addEventListener('click', () => {
    shopTab = tab;
    drawShop();
  });

// Pause
function pause(on: boolean) {
  if (!play || mode !== 'play' || play.over) return;
  play.paused = on;
  $('pause').classList.toggle('hidden', !on);
  if (on) $('pause-resume').focus();
}
$('pause-btn').addEventListener('click', () => pause(true));
$('pause-resume').addEventListener('click', () => pause(false));
$('pause-restart').addEventListener('click', () => {
  $('pause').classList.add('hidden');
  startLevel();
});
$('pause-quit').addEventListener('click', () => toMenu());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause(true);
});

// --- Settings menu -------------------------------------------------------------------------------------

function closeMenu() {
  $('menu').classList.add('hidden');
}
$('menu-btn').addEventListener('click', () => {
  refreshMenu();
  $('menu').classList.remove('hidden');
});
function refreshMenu() {
  $('m-music').setAttribute('aria-pressed', String(sound.prefs.music));
  $('m-sfx').setAttribute('aria-pressed', String(sound.prefs.sfx));
  $('m-haptics').setAttribute('aria-pressed', String(prefs.haptics));
  $('m-haptics').classList.toggle('hidden', !('vibrate' in navigator));
  $('m-motion').setAttribute('aria-pressed', String(prefs.calm));
  $('m-battery').setAttribute('aria-pressed', String(prefs.battery));
  $('m-fullscreen').classList.toggle('hidden', !canFullscreen());
  $('m-fullscreen-label').textContent = isFullscreen() ? t('exitFullscreen') : t('fullscreen');
  $('m-install').classList.toggle('hidden', !installable());
}
onPwaChange(refreshMenu);
$('m-music').addEventListener('click', () => {
  sound.setMusic(!sound.prefs.music);
  refreshMenu();
});
$('m-sfx').addEventListener('click', () => {
  sound.setSfx(!sound.prefs.sfx);
  refreshMenu();
});
$('m-haptics').addEventListener('click', () => {
  prefs.haptics = !prefs.haptics;
  savePrefs();
  buzz(20);
  refreshMenu();
});
$('m-motion').addEventListener('click', () => {
  prefs.calm = !prefs.calm;
  world.cam.calm = prefs.calm;
  savePrefs();
  refreshMenu();
});
$('m-battery').addEventListener('click', () => {
  prefs.battery = !prefs.battery;
  world.setBatterySaver(prefs.battery);
  savePrefs();
  refreshMenu();
});
$('m-fullscreen').addEventListener('click', () => void toggleFullscreen());
$('m-install').addEventListener('click', () => {
  if (isIos()) say(t('installIos'));
  else void install();
});
$('m-reset').addEventListener('click', () => {
  if (!confirm(t('resetConfirm'))) return;
  progress = newProgress();
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  world.setSkin(progress.skin);
  toMenu();
});
document.querySelectorAll<HTMLElement>('[data-page]').forEach((b) =>
  b.addEventListener('click', () => {
    const page = b.dataset.page as 'privacy' | 'terms';
    $('page-title').textContent = t(page === 'privacy' ? 'privacyTitle' : 'termsTitle');
    $('page-body').textContent = t(page === 'privacy' ? 'privacyBody' : 'termsBody');
    closeMenu();
    $('page').classList.remove('hidden');
  }),
);

// --- Input ---------------------------------------------------------------------------------------------

const canvas = world.canvas;
let mopDrag: { id: number; x: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  closeMenu();
  if (mode === 'play' && play) {
    canvas.setPointerCapture(e.pointerId);
    play.pointerDown(e);
  } else if (mode === 'mop') {
    canvas.setPointerCapture(e.pointerId);
    mopDrag = { id: e.pointerId, x: e.clientX };
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (mode === 'play') play?.pointerMove(e);
  else if (mode === 'mop' && mopDrag && e.pointerId === mopDrag.id) {
    mop?.drag(e.clientX - mopDrag.x);
    mopDrag.x = Math.max(mopDrag.x, e.clientX);
  }
});
const up = (e: PointerEvent) => {
  if (mode === 'play') play?.pointerUp(e);
  mopDrag = null;
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);

addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('menu').classList.contains('hidden')) return closeMenu();
    for (const id of ['page', 'join', 'shop', 'chapters', 'album', 'board']) {
      if (!$(id).classList.contains('hidden')) {
        $(id).classList.add('hidden');
        if (id === 'shop') afterShop();
        return;
      }
    }
    if (mode === 'play') return pause(!play?.paused);
  }
  if (mode === 'play' && play && !play.paused && play.key(e)) e.preventDefault();
  if (mode === 'mop' && (e.key === 'ArrowRight' || e.key === ' ')) {
    mop?.drag(innerWidth * 0.06);
    e.preventDefault();
  }
});

// Walking the slingshot around the world: hold a button.
for (const [id, dir] of [['rot-ccw', -1], ['rot-cw', 1]] as const) {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (play) play.spin = dir;
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel'])
    b.addEventListener(ev, () => {
      if (play) play.spin = 0;
    });
  b.addEventListener('click', () => {
    // Keyboard and switch users: one step per press.
    if (play && play.spin === 0) play.turn(dir * 0.25);
  });
}

// --- HUD -----------------------------------------------------------------------------------------------

let lastSecond = -1;
function updateHud() {
  if (!play) return;
  const s = play.arena.session;
  $('time-text').textContent = clock(s.timeLeft);
  const sec = Math.ceil(s.timeLeft);
  const hurry = sec <= 10 && !play.over;
  $('hud-time').classList.toggle('hurry', hurry);
  if (sec !== lastSecond) {
    lastSecond = sec;
    if (hurry && sec > 0) sound.play('tick');
    if (!play.over) sound.setTheme(sec <= 20 ? 'hurry' : level.boss ? 'boss' : 'play');
  }
  $('score-text').textContent = num(s.score);
  // The star meter: a little cheer each time the score passes a star.
  const reached = updateStarMeter(level, s.score);
  if (reached > starsReached) {
    starsReached = reached;
    sound.play('coin');
    const m = $('star-meter');
    m.classList.remove('pop');
    void m.offsetWidth;
    m.classList.add('pop');
  }
  const king = play.arena.king;
  renderHudGoals(level, s, king?.boss ? { hp: king.hp, max: king.boss.hp } : undefined);
  const combo = $('combo');
  if (s.chain >= 2 && !play.over) {
    combo.classList.remove('hidden');
    const text = t('combo', { n: s.multiplier });
    if ($('combo-text').textContent !== text) {
      $('combo-text').textContent = text;
      combo.classList.remove('bump');
      void combo.offsetWidth;
      combo.classList.add('bump');
    }
    $('combo-bar').style.setProperty('--p', `${Math.round((s.comboLeft / s.comboWindow) * 100)}%`);
  } else combo.classList.add('hidden');
  updateTray(play.food, play.reloadLeft);
}

// --- Loop ----------------------------------------------------------------------------------------------

let last = performance.now();
let time = 0;
function tick(now: number) {
  requestAnimationFrame(tick);
  const minFrame = prefs.battery ? 1 / 31 : 1 / 61;
  if ((now - last) / 1000 < minFrame) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  switch (mode) {
    case 'menu':
      demo.update(dt);
      world.menuCamera(time);
      world.frame(dt, dt);
      break;
    case 'play':
      if (play!.update(dt)) endLevel();
      updateHud();
      break;
    case 'replay':
      if (replay!.update(dt)) showResult();
      break;
    case 'result':
    case 'prize':
      world.frame(dt, dt);
      break;
    case 'mop':
      if (mop!.update(dt)) afterMop();
      break;
    case 'title':
      world.homeCamera(0);
      world.frame(dt, dt);
      if (now > titleUntil) {
        renderIntro(progress, level);
        mode = 'menu';
        show('intro');
      }
      break;
  }
}

// --- PWA -----------------------------------------------------------------------------------------------

const updateNotice = new Notice($('update'));
let updateWaiting = false;
/** A new version is ready: say so, but only between games, never over the HUD while someone plays. */
function offerUpdate() {
  if (!updateWaiting || (mode !== 'menu' && mode !== 'title')) return;
  updateWaiting = false;
  updateNotice.show(12000);
}
const updateSW = registerSW({
  onNeedRefresh() {
    updateWaiting = true;
    offerUpdate();
  },
});
$('update-now').addEventListener('click', () => void updateSW(true));

// --- Start ---------------------------------------------------------------------------------------------

// The splash stays up while the ready-made models load (a few seconds at most; the game still starts without them).
await Promise.race([loadAssets(), new Promise((r) => setTimeout(r, 6000))]);
world.assetsLoaded();
toMenu();
world.cam.jump();
requestAnimationFrame((now) => {
  last = now;
  tick(now);
  document.body.classList.add('ready');
  $('splash').classList.add('done');
  setTimeout(() => $('splash').remove(), 600);
});

if (import.meta.env.DEV) {
  (window as unknown as { __game: unknown }).__game = {
    world,
    get progress() {
      return progress;
    },
    get play() {
      return play;
    },
    get mode() {
      return mode;
    },
    start(id: number) {
      openIntro(id);
      startLevel();
    },
    daily: () => startDaily(),
    update: () => {
      updateWaiting = true;
      offerUpdate();
    },
    prize: (p: Prize) => showPrize(p),
    /** Throws the chosen food at a spot on the disc (leading nothing). */
    shootAt(x: number, z: number) {
      (play as unknown as { fire(a: { yaw: number; power: number }): void }).fire(aimAt(x, z));
    },
    coins(n: number) {
      progress.coins = n;
      save();
      renderHome();
    },
  };
}


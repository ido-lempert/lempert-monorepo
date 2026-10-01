/**
 * The game shell: menus, the flow of a chapter (intro → play → replay → results → mop → next chapter),
 * saving, settings and the PWA bits. Rules live in src/game, the 3D in src/world; this wires them to the UI.
 */
import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { Sound } from './audio';
import { MopScene, Replay } from './finale';
import { Arena } from './game/arena';
import type { FoodId } from './game/foods';
import { type Level, levelById, LEVELS } from './game/levels';
import { buyFood, buyUpgrade, finishLevel, KEY, loadProgress, newProgress, saveProgress, type UpgradeId } from './game/progress';
import { bestShots } from './game/replay';
import { MAX_RANGE, MIN_RANGE, SLING, type Vec3 } from './game/physics';
import { applyDocument, t } from './i18n';
import { Notice } from './notice';
import { Play } from './play';
import { canFullscreen, install, installable, isFullscreen, isIos, onPwaChange, toggleFullscreen } from './pwa';
import { clock, foodName, num, renderChapters, renderHudGoals, renderIntro, renderResult, renderShop, renderTray, type ResultInfo, updateTray } from './ui';
import { World } from './world/world';

const $ = (id: string) => document.getElementById(id)!;

applyDocument();
$('app-version').textContent = __APP_VERSION__;

const sound = new Sound();
let progress = loadProgress();
const save = () => saveProgress(progress);

// --- Settings ------------------------------------------------------------------------------------------

const PREFS_KEY = 'smashIt.prefs';
const prefs = { calm: matchMedia('(prefers-reduced-motion: reduce)').matches, battery: false };
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

// --- Small UI helpers ----------------------------------------------------------------------------------

const toast = new Notice($('toast'));
function say(text: string) {
  $('toast').textContent = text;
  toast.show(2600);
  $('live').textContent = text;
}

let bannerTimer = 0;
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
}

function popup(html: string, at: Vec3, cls = '') {
  const p = world.project(at);
  if (!p.visible) return;
  const d = document.createElement('div');
  d.className = `popup ${cls}`;
  d.innerHTML = html;
  d.style.left = `${p.x}px`;
  d.style.top = `${p.y}px`;
  $('popups').append(d);
  setTimeout(() => d.remove(), 1150);
}

const screens = ['home', 'chapters', 'shop', 'intro', 'hud', 'tray', 'combo', 'replay-bar', 'result', 'mop-hint', 'pause', 'vignette', 'aim-hint', 'banner'];
function show(...ids: string[]) {
  for (const id of screens) $(id).classList.toggle('hidden', !ids.includes(id));
  closeMenu();
}

// --- Flow ----------------------------------------------------------------------------------------------

type Mode = 'menu' | 'play' | 'replay' | 'result' | 'mop' | 'title';
let mode: Mode = 'menu';
let level: Level = levelById(progress.unlocked);
let play: Play | null = null;
let replay: Replay | null = null;
let mop: MopScene | null = null;
let result: ResultInfo | null = null;
let titleUntil = 0;

/** Bugs wandering about behind the menus. */
function demoArena(): Arena {
  return new Arena({ ...LEVELS[0], time: 1e9, mix: { ladybug: 2, ant: 2, butterfly: 2, snail: 1, beetle: 1 }, max: 7, obstacles: [] });
}
let demo = demoArena();

function toMenu() {
  mode = 'menu';
  play = null;
  replay?.stop();
  replay = null;
  mop = null;
  demo = demoArena();
  world.setLevel(LEVELS[0]);
  world.mess.clear();
  world.bind(demo);
  world.mopTo(null, 0);
  world.loadPouch(progress.food);
  sound.setTheme('menu');
  renderHome();
  show('home');
}

function renderHome() {
  $('home-coins').textContent = num(progress.coins);
  $('home-play').textContent = t('playChapter', { n: progress.unlocked });
}

function openIntro(id: number) {
  level = levelById(id);
  renderIntro(progress, level);
  if (mode !== 'menu') toMenu();
  world.setLevel(level);
  show('intro');
  $('intro-go').focus();
}

function startLevel() {
  mode = 'play';
  play = new Play(world, sound, progress, level, { popup, banner, toast: say, shot: () => $('aim-hint').classList.add('hidden') }, () => prefs.calm);
  renderTray(progress, play.food, pickFood);
  sound.setTheme('play');
  show('hud', 'tray', ...(level.id === 1 && !progress.best[1] ? ['aim-hint'] : []));
  banner(t('chapter', { n: level.id }), '', 1100);
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
  const opened = finishLevel(progress, { levelId: level.id, success: s.success, score: s.score, stars, coins });
  save();
  result = {
    success: s.success,
    session: s,
    coins,
    stars,
    newBest: s.score > before && before > 0,
    unlocked: opened ? progress.unlocked : null,
    lastChapter: level.id === LEVELS.length,
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
}

function startMop() {
  mode = 'mop';
  mop = new MopScene(world, sound);
  show('mop-hint');
}

function afterMop() {
  mop = null;
  const r = result!;
  if (r.success && r.lastChapter) return toMenu();
  level = levelById(r.success ? level.id + 1 : level.id);
  mode = 'title';
  titleUntil = performance.now() + 1700;
  world.setLevel(level);
  world.bind(null);
  show('banner');
  banner(t('chapter', { n: level.id }), '', 1700);
  sound.play('combo', 4);
}

// --- Buttons -------------------------------------------------------------------------------------------

$('home-play').addEventListener('click', () => openIntro(progress.unlocked));
$('home-chapters').addEventListener('click', () => {
  renderChapters(progress, (id) => openIntro(id));
  $('chapters').classList.remove('hidden');
});
$('home-shop').addEventListener('click', () => openShop());
$('intro-go').addEventListener('click', () => startLevel());
$('intro-shop').addEventListener('click', () => openShop());
$('intro-back').addEventListener('click', () => toMenu());
$('result-next').addEventListener('click', () => startMop());
$('result-shop').addEventListener('click', () => openShop());
$('replay-skip').addEventListener('click', () => showResult());

document.querySelectorAll<HTMLElement>('[data-close]').forEach((b) =>
  b.addEventListener('click', () => {
    b.closest('.screen')!.classList.add('hidden');
    if (b.closest('#shop')) afterShop();
  }),
);

let shopTab: 'foods' | 'upgrades' = 'foods';
function openShop() {
  drawShop();
  $('shop').classList.remove('hidden');
}
function drawShop() {
  renderShop(progress, shopTab, {
    buyFood: (id) => {
      if (!buyFood(progress, id)) return;
      save();
      sound.play('buy');
      say(t('bought', { name: foodName(id) }));
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
  });
}
function afterShop() {
  renderHome();
  if (!$('intro').classList.contains('hidden')) renderIntro(progress, level);
  world.loadPouch(progress.food);
}
$('tab-foods').addEventListener('click', () => {
  shopTab = 'foods';
  drawShop();
});
$('tab-upgrades').addEventListener('click', () => {
  shopTab = 'upgrades';
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
  $('menu-btn').setAttribute('aria-expanded', 'false');
}
$('menu-btn').addEventListener('click', () => {
  const open = $('menu').classList.toggle('hidden') === false;
  $('menu-btn').setAttribute('aria-expanded', String(open));
  refreshMenu();
});
function refreshMenu() {
  $('m-music').setAttribute('aria-pressed', String(sound.prefs.music));
  $('m-sfx').setAttribute('aria-pressed', String(sound.prefs.sfx));
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
    for (const id of ['page', 'shop', 'chapters']) {
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
    if (!play.over) sound.setTheme(sec <= 20 ? 'hurry' : 'play');
  }
  $('score-text').textContent = num(s.score);
  renderHudGoals(level, s);
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

const updateSW = registerSW({
  onNeedRefresh() {
    $('update').classList.remove('hidden');
    new Notice($('update')).show(12000);
  },
});
$('update-now').addEventListener('click', () => void updateSW(true));

// --- Start ---------------------------------------------------------------------------------------------

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
    /** Throws the chosen food at a spot on the disc (leading nothing). */
    shootAt(x: number, z: number) {
      const yaw = Math.atan2(x - SLING.x, SLING.z - z);
      const d = Math.hypot(x - SLING.x, z - SLING.z);
      (play as unknown as { fire(a: { yaw: number; power: number }): void }).fire({ yaw, power: (d - MIN_RANGE) / (MAX_RANGE - MIN_RANGE) });
    },
    coins(n: number) {
      progress.coins = n;
      save();
      renderHome();
    },
  };
}

/** Wires the screens to the night and the world. */
import '@fontsource-variable/rubik';
import { registerSW } from 'virtual:pwa-register';
import { CARDS, FIRST_NIGHT, Night, clock, type CardId } from './game/night';
import { firstTime, parseProgress, type Progress } from './game/progress';
import { fill, t } from './i18n/strings';
import './style.css';
import { Floor } from './world/floor';
import { restaurant } from './world/restaurant';
import { World } from './world/world';

const $ = (id: string) => document.getElementById(id)!;

const SAVE_KEY = 'theArchitect.progress';
const progress: Progress = (() => {
  try {
    return parseProgress(localStorage.getItem(SAVE_KEY));
  } catch {
    return parseProgress(null);
  }
})();
const save = () => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
  } catch {
    /* private mode: progress lives for this visit only */
  }
};

/** Night minutes per second at x1: a night lasts about a minute and a half. */
const MINUTES_PER_SECOND = 2.6;
const SPEEDS = [1, 2, 4];
/** Minute of the call announcing the bus, when the card tray first appears. */
const BUS_CALL = 60;
const START_REPUTATION = 3;

const stageEl = $('stage');
stageEl.setAttribute('aria-label', t.stage);
const world = new World(stageEl);
world.controls.autoRotate = true;
world.controls.autoRotateSpeed = 0.6;

$('title-name').textContent = t.title;
$('title-tag').textContent = t.tagline;
$('play').textContent = t.play;
$('cash-label').textContent = t.cash;
$('rep-label').textContent = t.reputation;
$('speed-btn').title = $('speed-btn').ariaLabel = t.speed;
$('replay').textContent = t.replay;

let floor: Floor | null = null;
let night: Night | null = null;
let running = false;
let speed = 0;
let carry = 0;
let ended = false;
let trayShown = false;

// --- Coach: one short line at a time, gone after a few seconds -------------------------------------

const coachQueue: string[] = [];
let coachTimer = 0;
function coach(line: string) {
  coachQueue.push(line);
  if (!coachTimer) nextCoach();
}
function nextCoach() {
  const line = coachQueue.shift();
  const el = $('coach');
  if (!line) {
    el.classList.add('hidden');
    coachTimer = 0;
    return;
  }
  el.textContent = line;
  el.classList.remove('hidden');
  coachTimer = window.setTimeout(nextCoach, 4800);
}
function clearCoach() {
  coachQueue.length = 0;
  clearTimeout(coachTimer);
  coachTimer = 0;
  $('coach').classList.add('hidden');
}

// --- HUD ----------------------------------------------------------------------------------------------

function reputation(n: Night) {
  return Math.max(0, Math.min(5, START_REPUTATION + n.repPoints * 0.05));
}

function renderHud() {
  if (!night) return;
  $('clock').textContent = clock(night.t);
  $('cash').textContent = `${night.revenue.toLocaleString('he-IL')} ₪`;
  const rep = reputation(night);
  $('rep').textContent = rep.toFixed(1);
  $('rep-pill').classList.toggle('bad', rep < START_REPUTATION);
  $('pause-btn').textContent = running ? '⏸' : '▶';
  $('pause-btn').title = $('pause-btn').ariaLabel = running ? t.pause : t.resume;
  $('speed-btn').textContent = `x${SPEEDS[speed]}`;
  const bottom = $('hud').getBoundingClientRect().bottom;
  if (bottom > 0) document.documentElement.style.setProperty('--hud-bottom', `${Math.round(bottom)}px`);
}

$('pause-btn').onclick = () => {
  running = !running;
  renderHud();
};
$('speed-btn').onclick = () => {
  speed = (speed + 1) % SPEEDS.length;
  if (floor) floor.pace = SPEEDS[speed];
  renderHud();
};

// --- Cards --------------------------------------------------------------------------------------------

function renderTray() {
  const tray = $('tray');
  tray.replaceChildren();
  if (!night || !trayShown) {
    tray.classList.add('hidden');
    return;
  }
  tray.classList.remove('hidden');
  for (const id of Object.keys(CARDS) as CardId[]) {
    const c = t.cards[id];
    const played = night.plays.find((p) => p.card === id);
    const b = document.createElement('button');
    b.className = 'card' + (played ? '' : ' fresh');
    b.disabled = !!played;
    b.innerHTML = `<span class="card-name"></span><span class="card-action"></span><span class="costs"><span>💰 <bdi></bdi></span><span>⏱ </span><span>⭐ </span></span>`;
    b.querySelector('.card-name')!.textContent = `🤵 ${c.name}`;
    b.querySelector('.card-action')!.textContent = played ? fill(t.cardPlayed, { time: clock(played.at) }) : c.action;
    const costs = b.querySelectorAll('.costs > span');
    costs[0].querySelector('bdi')!.textContent = c.money;
    costs[1].append(c.time);
    costs[2].append(c.rep);
    b.onclick = () => {
      if (!night?.play(id)) return;
      if (id === 'extraWaiter') coach(t.waiterIn);
      renderTray();
    };
    tray.append(b);
  }
}

// --- The night ----------------------------------------------------------------------------------------

async function startNight() {
  $('summary').classList.add('hidden');
  clearCoach();
  if (!floor) return;
  await floor.reset();
  night = new Night(FIRST_NIGHT);
  ended = false;
  trayShown = false;
  speed = 0;
  floor.pace = 1;
  carry = 0;
  running = true;
  world.controls.autoRotate = false;
  $('hud').classList.remove('hidden');
  renderHud();
  renderTray();
  coach(t.coachStart);
}

/** Tips and events after each minute. */
function afterMinute(n: Night) {
  if (n.t === BUS_CALL) {
    coach(t.busCall);
    trayShown = true;
    renderTray();
    if (firstTime(progress, 'cardTip')) coach(t.cardTip);
    save();
  }
  for (const e of n.log) {
    if (e.t !== n.t) continue;
    if (e.kind === 'leftTable') coach(t.leftTable);
    if (e.kind === 'leftDoor') coach(t.leftDoor);
  }
  if (n.groups.some((g) => g.state === 'seated' && n.t - g.since === 7) && firstTime(progress, 'waitTip')) {
    coach(t.waitTip);
    save();
  }
}

/** Keeps numbers, signs and the shekel sign in order inside Hebrew text. */
const ltr = (s: string) => `\u2066${s}\u2069`;
const shekels = (n: number) => ltr(`${n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('he-IL')} ₪`);

function endNight(n: Night) {
  running = false;
  clearCoach();
  trayShown = false;
  renderTray();
  const s = n.summary();
  const good = s.leftAngry === 0 && s.reputation >= 0;
  $('summary-title').textContent = good ? t.nightGood : t.nightBad;
  const rows: [string, string, boolean?][] = [
    [t.revenue, shekels(s.revenue)],
    [t.wages, shekels(-s.wages)],
    [t.cardsCost, shekels(-s.cards)],
    [t.profit, shekels(s.profit), true],
    [t.reputation, `${ltr(`${s.reputation >= 0 ? '+' : '−'}${Math.abs(s.reputation).toFixed(2)}`)} ⭐`],
    [t.avgWait, fill(t.minutes, { n: s.avgWait })],
    [t.served, String(s.served)],
    [t.leftAngry, String(s.leftAngry)],
  ];
  const dl = $('summary-rows');
  dl.replaceChildren();
  for (const [k, v, total] of rows) {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = k;
    dd.textContent = v;
    if (total) dt.className = dd.className = 'total';
    dl.append(dt, dd);
  }
  $('summary-hint').textContent = good ? '' : t.hintBad;
  const verdict = $('verdict');
  verdict.replaceChildren();
  if (good && n.plays.some((p) => p.card === 'extraWaiter')) {
    const v = t.verdicts.horizontalScaling;
    const card = document.createElement('div');
    card.className = 'verdict';
    card.innerHTML = `<div class="label"></div><div class="term" dir="ltr"></div><div class="sub"></div><p></p>`;
    card.querySelector('.label')!.textContent = t.verdictLabel;
    card.querySelector('.term')!.textContent = v.term;
    card.querySelector('.sub')!.textContent = v.sub;
    card.querySelector('p')!.textContent = v.body;
    verdict.append(card);
    if (!progress.verdicts.includes('horizontalScaling')) progress.verdicts.push('horizontalScaling');
    save();
  }
  $('summary').classList.remove('hidden');
  ($('replay') as HTMLButtonElement).focus();
}

$('replay').onclick = () => void startNight();

world.onFrame((dt) => {
  if (!floor) return;
  if (night && running && !night.done) {
    carry += dt * MINUTES_PER_SECOND * SPEEDS[speed];
    while (carry >= 1 && !night.done) {
      carry -= 1;
      night.step();
      void floor.sync(night);
      afterMinute(night);
    }
    renderHud();
    if (night.done && !ended) {
      ended = true;
      renderTray();
      setTimeout(() => night && endNight(night), 1800);
    }
  }
  floor.update(dt);
});

restaurant().then(async (scene) => {
  world.stage.add(scene);
  floor = await Floor.create(world.stage);
  $('splash').classList.add('done');
});

$('play').onclick = () => {
  $('title').classList.add('hidden');
  void startNight();
};

const updateSW = registerSW({
  onNeedRefresh() {
    $('update-text').textContent = t.update;
    $('update-btn').textContent = t.updateNow;
    $('update-btn').onclick = () => updateSW(true);
    $('update').classList.remove('hidden');
    setTimeout(() => $('update').classList.add('hidden'), 8000);
  },
});

if (import.meta.env.DEV)
  (window as unknown as { __game: unknown }).__game = {
    world,
    get night() {
      return night;
    },
    setSpeed(i: number) {
      speed = i;
      if (floor) floor.pace = SPEEDS[i];
    },
  };

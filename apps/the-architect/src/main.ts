/** Wires the screens to the night and the world. */
import '@fontsource-variable/rubik';
import { registerSW } from 'virtual:pwa-register';
import { FIRST_NIGHT, Night, clock, type CardId, type NightEvent } from './game/night';
import { firstTime, parseProgress, type Progress } from './game/progress';
import { drawBlueprint } from './blueprint';
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
/** Minute of the call announcing the bus, when the first card appears. */
const BUS_CALL = 60;
const START_REPUTATION = 3;
const CARD_ORDER: CardId[] = ['extraWaiter', 'checkFirst', 'lock'];

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
$('log-btn-label').textContent = t.log;
$('log-title').textContent = t.log;
$('log-close').textContent = '✕';
$('log-close').title = $('log-close').ariaLabel = t.logClose;

// --- The blueprint lens: the same night as an architecture diagram ------------------------------------

let lens = false;
function renderLens() {
  $('lens-icon').textContent = lens ? '🍽️' : '📐';
  $('lens-label').textContent = lens ? t.lensOff : t.lensOn;
  $('lens-btn').setAttribute('aria-pressed', String(lens));
  $('blueprint').classList.toggle('hidden', !lens);
  if (lens && night) drawBlueprint($('blueprint'), night);
}
$('lens-btn').onclick = () => {
  lens = !lens;
  $('lens-btn').classList.remove('fresh');
  renderLens();
};

let floor: Floor | null = null;
let night: Night | null = null;
let running = false;
let speed = 0;
let carry = 0;
let ended = false;
/** Cards the player has been shown this night (features appear when they become useful). */
const revealed = new Set<CardId>();

// --- Coach: one short line at a time, gone after a few seconds -------------------------------------

const coachQueue: string[] = [];
let coachTimer = 0;
/** Queues a line; an urgent one (an alert) is shown at once. Old lines are dropped so tips stay current. */
function coach(line: string, urgent = false) {
  if (urgent) {
    coachQueue.length = 0;
    clearTimeout(coachTimer);
    coachTimer = 0;
  }
  coachQueue.push(line);
  while (coachQueue.length > 2) coachQueue.shift();
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

/** Keeps numbers, signs and the shekel sign in order inside Hebrew text. */
const ltr = (s: string) => `⁦${s}⁩`;
const shekels = (n: number) => ltr(`${n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('he-IL')} ₪`);

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
  const cards = CARD_ORDER.filter((id) => revealed.has(id));
  if (!night || ended || !cards.length) {
    tray.classList.add('hidden');
    return;
  }
  tray.classList.remove('hidden');
  for (const id of cards) {
    const c = t.cards[id];
    const played = night.plays.find((p) => p.card === id);
    const b = document.createElement('button');
    b.className = 'card' + (played ? '' : ' fresh');
    b.disabled = !!played;
    b.innerHTML = `<span class="card-name"></span><span class="card-action"></span><span class="costs"><span>💰 <bdi></bdi></span><span>⏱ </span><span>⭐ </span></span>`;
    b.querySelector('.card-name')!.textContent = `${c.icon} ${c.name}`;
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

function reveal(...ids: CardId[]) {
  for (const id of ids) revealed.add(id);
  renderTray();
}

// --- The kitchen log: every order and everything that happened to it ---------------------------------

let logWasRunning = false;
let picked: number | null = null;

const who = (w: number | undefined) => t.waiters[(w ?? 0) % t.waiters.length];

function line(e: NightEvent): string {
  const w = who(e.waiter);
  switch (e.kind) {
    case 'arrive':
      return t.trace.arrive;
    case 'seat':
      return fill(t.trace.seat, { table: (e.table ?? 0) + 1 });
    case 'lockWait':
      return fill(t.trace.lockWait, { name: w.name, waited: w.waited });
    case 'read':
      return fill(e.dish === 'salmon' ? t.trace.readSalmon : t.trace.readNone, { ...w, value: e.value ?? 0 });
    case 'write':
      return fill(t.trace.write, { ...w, value: e.value ?? 0 });
    case 'order':
    case 'cooking':
    case 'noStock':
    case 'cooked':
    case 'served':
    case 'paid':
    case 'leftTable':
      return t.trace[e.kind];
    default:
      return '';
  }
}

function traceList(n: Night, group: number, hot: Set<NightEvent>): HTMLOListElement {
  const ol = document.createElement('ol');
  for (const e of n.trace(group)) {
    const text = line(e);
    if (!text) continue;
    const li = document.createElement('li');
    if (hot.has(e) || e.kind === 'noStock') li.className = 'hot';
    const time = document.createElement('time');
    time.textContent = clock(e.t);
    li.append(time, text);
    ol.append(li);
  }
  return ol;
}

/**
 * The race behind an order: the last two salmon reads, by two waiters, of the same board count at the same
 * time, before this order was let down (or before now). One of their writes was lost.
 */
function race(n: Night, group: number): NightEvent[] {
  const until = n.trace(group).find((e) => e.kind === 'noStock')?.t ?? n.t;
  const reads = n.log.filter((e) => e.kind === 'read' && e.dish === 'salmon' && e.t <= until);
  for (let i = reads.length - 1; i > 0; i--) {
    const b = reads[i];
    const a = reads.slice(0, i).reverse().find((x) => x.waiter !== b.waiter && x.value === b.value && b.t - x.t < n.def.takeOrder);
    if (a) return [a, b];
  }
  return [];
}

const orderName = (id: number) => fill(t.order, { n: ltr(`#${id + 1}`) });

function renderLog() {
  const n = night;
  if (!n) return;
  const orders = n.groups.filter((g) => n.log.some((e) => e.kind === 'order' && e.group === g.id)).reverse();
  const list = $('log-orders');
  list.replaceChildren();
  const trace = $('log-trace');
  trace.replaceChildren();
  if (!orders.length) {
    trace.textContent = t.logEmpty;
    return;
  }
  for (const g of orders.slice(0, 16)) {
    const failed = n.log.some((e) => e.kind === 'noStock' && e.group === g.id);
    const done = n.log.some((e) => (e.kind === 'served' || e.kind === 'paid') && e.group === g.id);
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.setAttribute('aria-pressed', String(picked === g.id));
    const name = document.createElement('span');
    name.textContent = `${orderName(g.id)} · ${g.dish === 'salmon' ? '🐟 ' + t.salmon : t.otherDish}`;
    const state = document.createElement('span');
    state.textContent = failed ? '🚨' : done ? '✅' : '🍳';
    b.append(name, state);
    b.onclick = () => {
      picked = g.id;
      renderLog();
    };
    li.append(b);
    list.append(li);
  }
  if (picked === null) {
    trace.textContent = t.logPick;
    return;
  }
  const failed = n.log.some((e) => e.kind === 'noStock' && e.group === picked);
  const pair = failed ? race(n, picked) : [];
  const hot = new Set(pair);
  const head = document.createElement('h3');
  head.textContent = `${orderName(picked)} · ${fill(t.tableN, { n: (n.groups[picked].table ?? 0) + 1 })}`;
  trace.append(head, traceList(n, picked, hot));
  if (pair.length) {
    const [a, b] = pair;
    const why = document.createElement('h3');
    why.textContent = fill(t.logWhy, { time: clock(a.t) });
    const note = document.createElement('p');
    note.className = 'race-note';
    note.textContent = fill(t.logRace, { a: who(a.waiter).name, b: who(b.waiter).name, value: a.value ?? 0, written: Math.max(0, (a.value ?? 0) - 1) });
    trace.append(why, note);
    for (const e of pair) {
      const h = document.createElement('h3');
      h.textContent = fill(t.logOrderBy, { order: orderName(e.group!), name: who(e.waiter).name });
      trace.append(h, traceList(n, e.group!, hot));
    }
  }
}

function openLog() {
  if (!night) return;
  logWasRunning = running;
  running = false;
  $('log-btn').classList.remove('fresh');
  if (picked === null) {
    const alert = [...night.log].reverse().find((e) => e.kind === 'noStock');
    if (alert) picked = alert.group!;
  }
  renderLog();
  renderHud();
  $('log').classList.remove('hidden');
  ($('log-close') as HTMLButtonElement).focus();
}
function closeLog() {
  $('log').classList.add('hidden');
  running = logWasRunning;
  renderHud();
}
$('log-btn').onclick = openLog;
$('log-close').onclick = closeLog;
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('log').classList.contains('hidden')) closeLog();
});

// --- The night ----------------------------------------------------------------------------------------

async function startNight() {
  $('summary').classList.add('hidden');
  clearCoach();
  if (!floor) return;
  await floor.reset();
  night = new Night(FIRST_NIGHT);
  ended = false;
  picked = null;
  revealed.clear();
  // Cards already met on an earlier night are on the table from the start, so the night can be planned.
  if (progress.seen.includes('bus')) revealed.add('extraWaiter');
  if (progress.seen.includes('alert')) revealed.add('checkFirst').add('lock');
  $('log-btn').classList.toggle('hidden', !progress.seen.includes('alert'));
  speed = 0;
  floor.pace = 1;
  carry = 0;
  running = true;
  world.controls.autoRotate = false;
  $('hud').classList.remove('hidden');
  renderHud();
  renderTray();
  renderLens();
  coach(t.coachStart);
}

/** Tips and events after each minute. */
function afterMinute(n: Night) {
  if (n.t === BUS_CALL) {
    coach(t.busCall);
    coach(t.busSalmon);
    reveal('extraWaiter');
    if (firstTime(progress, 'bus')) coach(t.cardTip);
    save();
  }
  for (const e of n.log) {
    if (e.t !== n.t) continue;
    if (e.kind === 'leftTable') coach(t.leftTable);
    if (e.kind === 'leftDoor') coach(t.leftDoor);
    if (e.kind === 'noStock') {
      coach(t.alert, true);
      if (firstTime(progress, 'alert')) {
        // The first alert stops the night so the player can look into it.
        running = false;
        picked = e.group!;
        $('log-btn').classList.remove('hidden');
        $('log-btn').classList.add('fresh');
        coach(t.alertLog);
        coach(t.newCards);
        reveal('checkFirst', 'lock');
        save();
      }
    }
  }
  if (n.groups.some((g) => g.state === 'seated' && n.t - g.since === 7) && firstTime(progress, 'waitTip')) {
    coach(t.waitTip);
    save();
  }
}

function verdictCard(id: keyof typeof t.verdicts): HTMLElement {
  const v = t.verdicts[id];
  const card = document.createElement('div');
  card.className = 'verdict';
  card.innerHTML = `<div class="label"></div><div class="term" dir="ltr"></div><div class="sub"></div><p></p>`;
  card.querySelector('.label')!.textContent = t.verdictLabel;
  card.querySelector('.term')!.textContent = v.term;
  card.querySelector('.sub')!.textContent = v.sub;
  card.querySelector('p')!.textContent = v.body;
  if (!progress.verdicts.includes(id)) progress.verdicts.push(id);
  return card;
}

function endNight(n: Night) {
  running = false;
  clearCoach();
  renderTray();
  const s = n.summary();
  const good = s.leftAngry === 0;
  $('summary-title').textContent = good ? t.nightGood : t.nightBad;
  const rows: [string, string, boolean?][] = [
    [t.revenue, shekels(s.revenue)],
    [t.wages, shekels(-s.wages)],
    [t.cardsCost, shekels(-s.cards)],
  ];
  if (s.compensation) rows.push([t.compensation, shekels(-s.compensation)]);
  rows.push(
    [t.profit, shekels(s.profit), true],
    [t.reputation, `${ltr(`${s.reputation >= 0 ? '+' : '−'}${Math.abs(s.reputation).toFixed(2)}`)} ⭐`],
    [t.avgWait, fill(t.minutes, { n: s.avgWait })],
    [t.served, String(s.served)],
    [t.leftAngry, String(s.walkedOut)],
  );
  if (s.alerts) rows.push([t.alerts, String(s.alerts)]);
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
  $('summary-hint').textContent = s.alerts && !n.has('lock') ? t.hintRace : s.walkedOut ? t.hintBad : '';
  const verdict = $('verdict');
  verdict.replaceChildren();
  if (n.has('extraWaiter') && s.walkedOut === 0) verdict.append(verdictCard('horizontalScaling'));
  if (n.has('extraWaiter') && n.has('lock') && s.alerts === 0) verdict.append(verdictCard('raceLock'));
  if (n.has('checkFirst') && s.alerts > 0) verdict.append(verdictCard('toctou'));
  if (verdict.children.length && firstTime(progress, 'lensTip')) {
    $('summary-hint').textContent = [$('summary-hint').textContent, t.lensTip].filter(Boolean).join(' ');
    $('lens-btn').classList.add('fresh');
  }
  save();
  $('summary').classList.remove('hidden');
  ($('replay') as HTMLButtonElement).focus();
}

$('replay').onclick = () => void startNight();

world.onFrame((dt) => {
  if (!floor) return;
  if (night && running && !night.done) {
    carry += dt * MINUTES_PER_SECOND * SPEEDS[speed];
    while (carry >= 1 && !night.done && running) {
      carry -= 1;
      night.step();
      void floor.sync(night);
      afterMinute(night);
      if (lens) drawBlueprint($('blueprint'), night);
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
  floor = await Floor.create(world.stage, t.boardLabel);
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
    progress,
    get night() {
      return night;
    },
    setSpeed(i: number) {
      speed = i;
      if (floor) floor.pace = SPEEDS[i];
    },
    play(card: CardId) {
      night?.play(card);
      renderTray();
    },
  };

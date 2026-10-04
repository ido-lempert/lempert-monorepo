/** Wires the UI to the rules (src/game) and the island (src/world). */
import '@fontsource-variable/rubik';
import { registerSW } from 'virtual:pwa-register';
import { sfx } from './audio';
import { ISLANDS, LEVELS, levelById, levelsOf } from './game/levels';
import { emptyProgress, firstTime, nextLevel, parseProgress, recordWin, starsFor, type Progress } from './game/progress';
import { kindsOf, run, sameEdge, toggleEdge } from './game/sim';
import type { Build, ConceptId, Kind, LevelDef, RunResult } from './game/types';
import { fill, t } from './i18n/strings';
import { canFullscreen, canInstall, install, isFullscreen, onPwaChange, toggleFullscreen } from './pwa';
import './style.css';
import { Board } from './world/board';
import { piece } from './world/models';
import { World } from './world/world';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const SAVE_KEY = 'archipelago.progress';
const SOUND_KEY = 'archipelago.sound';
const MUSIC_KEY = 'archipelago.music';

// --- State ------------------------------------------------------------------------------------------

let progress: Progress = load();
let level: LevelDef = levelById(nextLevel(progress))!;
let build: Build = { placed: {}, edges: [] };
let selected: string | null = null;
let holding: Kind | null = null;
let runs = 0;
let busy = false;
let playing = false;
let board: Board;

function load(): Progress {
  try {
    return parseProgress(localStorage.getItem(SAVE_KEY));
  } catch {
    return emptyProgress();
  }
}
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
  } catch {
    // Private mode: progress lives for this visit only.
  }
}

const world = new World($('stage'));
world.controls.autoRotate = true;
world.controls.autoRotateSpeed = 0.6;

const icons = new Map<Kind, string>();
function icon(kind: Kind): string {
  let src = icons.get(kind);
  if (!src) {
    src = world.snapshot(piece(kind), 128);
    icons.set(kind, src);
  }
  return src;
}

const names = { name: (k: Kind) => t.names[k], term: (k: Kind) => t.terms[k] };

// --- Static text ------------------------------------------------------------------------------------

$('title-name').textContent = t.title;
$('title-tag').textContent = t.tagline;
$('play').textContent = t.play;
$('run-label').textContent = t.run;
$('clear-btn').title = $('clear-btn').ariaLabel = t.clear;
$('menu-btn').title = $('menu-btn').ariaLabel = t.menu;
$('book-btn').title = $('book-btn').ariaLabel = t.book;
$('tray').ariaLabel = t.tray;
$('stage').ariaLabel = t.sceneLabel;
$('remove-btn').textContent = `↩ ${t.removePiece}`;
$('m-levels-label').textContent = t.levels;
$('m-book-label').textContent = t.book;
$('m-sound-label').textContent = t.sound;
$('m-music-label').textContent = t.music;
$('m-fullscreen-label').textContent = t.fullscreen;
$('m-install-label').textContent = t.install;
$('m-reset-label').textContent = t.reset;
$('m-version-label').textContent = t.version;
$('app-version').textContent = __APP_VERSION__;
$('sheet-close').ariaLabel = t.close;

// --- Coach: one line at the bottom ------------------------------------------------------------------

let coachTimer = 0;
let tip: { text: string; bad: boolean } | null = null;

/** A short message that leaves by itself (tips and failures); the tutorial line comes back after it. */
function flash(text: string, bad = false, sec = 5) {
  tip = { text, bad };
  clearTimeout(coachTimer);
  coachTimer = window.setTimeout(() => {
    tip = null;
    refresh();
  }, sec * 1000);
  refresh();
}

/** The first level's walkthrough: what to do next, and what the arrow points at. */
function tutorialStep(): { text: string; target: string | null } | null {
  if (level.id !== 'l1' || progress.seen.includes('tutorial') || !playing) return null;
  const has = (from: string, to: string) => build.edges.some((e) => sameEdge(e, { from, to }));
  if (!build.placed.p1) return holding ? { text: t.coach.pickPad, target: 'p1' } : { text: t.coach.pickServer, target: null };
  if (!has('phone', 'p1')) return selected === 'phone' ? { text: t.coach.connectSecond, target: 'p1' } : { text: t.coach.connectFirst, target: 'phone' };
  if (!has('p1', 'db')) return selected === 'p1' ? { text: t.coach.connectDb, target: 'db' } : { text: t.coach.connectDb, target: 'p1' };
  return { text: t.coach.pressRun, target: null };
}

// --- Rendering the UI -------------------------------------------------------------------------------

function trayLeft(): Kind[] {
  const left = [...level.tray];
  for (const k of Object.values(build.placed)) left.splice(left.indexOf(k), 1);
  return left;
}

function refresh() {
  board.sync(build, selected);
  board.setPlacing(holding !== null);

  const tray = $('tray');
  tray.replaceChildren();
  const step = tutorialStep();
  trayLeft().forEach((kind) => {
    const b = document.createElement('button');
    b.className = 'tray-item';
    b.ariaPressed = String(holding === kind);
    b.innerHTML = `<img alt="" /><span></span><small dir="auto"></small>`;
    b.querySelector('img')!.src = icon(kind);
    b.querySelector('span')!.textContent = t.names[kind];
    b.querySelector('small')!.textContent = t.terms[kind];
    if (step && step.text === t.coach.pickServer) b.classList.add('ready');
    b.onclick = () => pickFromTray(kind);
    tray.appendChild(b);
  });

  // A placed piece that is selected can go back to the tray; the button takes the tray's place.
  const removable = !busy && selected !== null && selected in build.placed;
  $('remove-btn').classList.toggle('hidden', !removable);
  tray.classList.toggle('hidden', removable);

  const coach = $('coach');
  const line = tip ?? (step ? { text: step.text, bad: false } : null);
  coach.classList.toggle('hidden', !line || !playing);
  if (line) {
    coach.textContent = line.text;
    coach.classList.toggle('bad', line.bad);
  }
  board.pointAt(!tip && step ? step.target : null);

  const run = $<HTMLButtonElement>('run-btn');
  run.disabled = busy;
  $('run-label').textContent = busy ? t.running : t.run;
  run.classList.toggle('ready', !busy && (trayLeft().length === 0 || (level.single !== undefined && Object.keys(build.placed).length > 0)) && build.edges.length >= level.flows.length && (!step || step.text === t.coach.pressRun));

  const hasCards = progress.cards.length > 0;
  $('book-btn').classList.toggle('hidden', !hasCards);
  $('m-book').classList.toggle('hidden', !hasCards);
  $('m-levels').classList.toggle('hidden', Object.keys(progress.stars).length === 0);
  $('m-sound').ariaPressed = String(sfx.on);
  $('m-music').ariaPressed = String(sfx.music);
  $('m-fullscreen').classList.toggle('hidden', !canFullscreen());
  $('m-fullscreen-label').textContent = isFullscreen() ? '⤡' : t.fullscreen;
  $('m-install').classList.toggle('hidden', !canInstall());
}

// --- Levels -----------------------------------------------------------------------------------------

function startLevel(id: string) {
  level = levelById(id)!;
  $('win').classList.add('hidden');
  build = { placed: {}, edges: [...level.edges] };
  selected = null;
  holding = null;
  runs = 0;
  tip = null;
  board?.dispose();
  board = new Board(world, level, names);
  const n = levelsOf(level.island).indexOf(level) + 1;
  $('level-num').textContent = `${t.islands[level.island]} · ${fill(t.level, { n })}`;
  $('level-title').textContent = t.levelTitles[level.id];
  $('level-goal').textContent = t.levelGoals[level.id];
  const chips: string[] = [];
  if (level.timeLimit !== undefined) chips.push(`⏱ ${fill(t.timeChip, { n: level.timeLimit })}`);
  if (level.capacity !== undefined) {
    const worker = level.island === 2 ? 'stock' : 'server';
    chips.push(`${worker === 'stock' ? '📦' : '🖥️'} ${fill(t.capacityChip, { n: level.capacity, who: t.names[worker] })}`);
  }
  $('goal-chips').replaceChildren(
    ...chips.map((c) => {
      const el = document.createElement('span');
      el.className = 'chip';
      el.textContent = c;
      return el;
    }),
  );
  $('clock').classList.add('hidden');
  refresh();
  if (!playing) return;
  // One-time tips, at the start of the level where they first matter.
  if (level.id === 'l2' && firstTime(progress, 'arrows')) flash(t.coach.arrows, false, 7);
  else if (level.id === 'l3' && firstTime(progress, 'drag')) flash(t.coach.drag, false, 6);
  else if (level.id === 'l4' && firstTime(progress, 'loose')) flash(t.coach.loose, false, 6);
  else if (level.id === 'l5' && firstTime(progress, 'timer')) flash(t.coach.timer, false, 7);
  else if (level.id === 'e1' && firstTime(progress, 'events')) flash(t.coach.events, false, 7);
  else if (level.id === 'w2' && firstTime(progress, 'wraps')) flash(t.coach.wraps, false, 7);
  else if (level.id === 'w3' && firstTime(progress, 'single')) flash(t.coach.single, false, 7);
  else if (level.id === 'o1' && firstTime(progress, 'inward')) flash(t.coach.inward, false, 8);
  else if (level.id === 'o2' && firstTime(progress, 'rings')) flash(t.coach.rings, false, 7);
  save();
}

function placeOn(pad: string, kind: Kind) {
  build = { ...build, placed: { ...build.placed, [pad]: kind } };
  holding = null;
  sfx.play('place');
  refresh();
}

function pickFromTray(kind: Kind) {
  if (busy) return;
  sfx.unlock();
  const free = level.pads.filter((p) => !build.placed[p.id]);
  selected = null;
  if (free.length === 1) return placeOn(free[0].id, kind);
  holding = holding === kind ? null : kind;
  sfx.play('tap');
  refresh();
}

function onTap(x: number, y: number) {
  if (busy || !playing) return;
  sfx.unlock();
  const hit = world.pick(x, y);
  if (holding) {
    if (hit?.type === 'pad' && !build.placed[hit.id]) return placeOn(hit.id, holding);
    holding = null;
    return refresh();
  }
  if (!hit) {
    selected = null;
    return refresh();
  }
  if (hit.type === 'edge') {
    const [from, to] = hit.id.split('>');
    build = { ...build, edges: build.edges.filter((e) => !sameEdge(e, { from, to })) };
    sfx.play('disconnect');
    return refresh();
  }
  if (hit.type === 'pad') return refresh();
  if (selected === null) {
    selected = hit.id;
    sfx.play('tap');
  } else if (selected === hit.id) {
    selected = null;
  } else {
    const before = build.edges.length;
    build = { ...build, edges: toggleEdge(build.edges, selected, hit.id) };
    sfx.play(build.edges.length < before ? 'disconnect' : 'connect');
    selected = null;
  }
  refresh();
}

function removeSelected() {
  if (!selected || !build.placed[selected]) return;
  const id = selected;
  const placed = { ...build.placed };
  delete placed[id];
  build = { placed, edges: build.edges.filter((e) => e.from !== id && e.to !== id) };
  selected = null;
  sfx.play('remove');
  refresh();
}

/** The message for a failed run: rule breaks first, then the first request that didn't make it. */
function failText(r: RunResult): string {
  const reason = r.problems[0]?.reason ?? r.trips.find((x) => !x.ok)?.fail ?? 'noPath';
  const full = r.trips.find((x) => x.fail === 'overload');
  const who = full ? t.names[kindsOf(level, build).get(full.path[full.path.length - 1])!] : '';
  return fill(t.fails[reason], { n: level.capacity ?? 0, who });
}

/** The clock bar for levels with a time limit: fills as each request is answered. */
function setClock(used: number) {
  const limit = level.timeLimit;
  if (limit === undefined) return;
  const el = $('clock');
  el.classList.remove('hidden');
  el.classList.toggle('over', used > limit);
  el.ariaLabel = t.clock;
  el.setAttribute('aria-valuemax', String(limit));
  el.setAttribute('aria-valuenow', String(used));
  $('clock-fill').style.width = `${Math.min(1, used / limit) * 100}%`;
  $('clock-text').textContent = `⏱ ${fill(t.clockOf, { n: used, total: limit })}`;
}

async function runBuild() {
  if (busy) return;
  sfx.unlock();
  busy = true;
  selected = null;
  holding = null;
  tip = null;
  runs++;
  refresh();
  const result = run(level, build);
  const playedOn = board;
  setClock(0);
  await board.play(result, (trip) => {
    if (trip.doneAt !== undefined) setClock(trip.doneAt);
  });
  busy = false;
  // The player went to another level while this one was running.
  if (board !== playedOn) return;
  if (result.ok) {
    const isNew = !progress.cards.includes(level.concept);
    progress = recordWin(progress, level.id, runs);
    if (level.id === 'l1') firstTime(progress, 'tutorial');
    save();
    refresh();
    showWin(isNew);
  } else {
    flash(failText(result), true, 7);
  }
}

// --- Cards ------------------------------------------------------------------------------------------

function conceptCard(id: ConceptId, isNew: boolean): HTMLElement {
  const c = t.concepts[id];
  const el = document.createElement('div');
  el.className = 'concept';
  el.innerHTML = `${isNew ? `<span class="concept-badge"></span>` : ''}<h3></h3><div class="term" dir="auto"></div><div class="chain"></div>`;
  if (isNew) el.querySelector('.concept-badge')!.textContent = `✨ ${t.newCard}`;
  el.querySelector('h3')!.textContent = c.title;
  el.querySelector('.term')!.textContent = c.term;
  const chain = el.querySelector('.chain')!;
  c.chain.forEach((k, i) => {
    if (i) chain.insertAdjacentHTML('beforeend', '<span class="arrow" aria-hidden="true">→</span>');
    const img = document.createElement('img');
    img.src = icon(k);
    img.alt = t.names[k];
    chain.appendChild(img);
  });
  for (const line of c.body) {
    const p = document.createElement('p');
    p.textContent = line;
    el.appendChild(p);
  }
  return el;
}

function starsHtml(n: number) {
  return [1, 2, 3].map((i) => `<span class="${i <= n ? '' : 'off'}">⭐</span>`).join('');
}

function showWin(isNew: boolean) {
  const stars = starsFor(runs);
  $('win-stars').innerHTML = starsHtml(stars);
  $('win-title').textContent = t.winTitle;
  const last = LEVELS.indexOf(level) === LEVELS.length - 1;
  const after = LEVELS[LEVELS.indexOf(level) + 1];
  const islandDone = after && after.island !== level.island;
  $('win-sub').textContent = last
    ? t.allDone
    : islandDone
      ? fill(t.islandDone, { name: t.islands[level.island], next: t.islands[after.island] })
      : runs === 1
        ? t.winFirstTry
        : '';
  $('win-card').replaceChildren(conceptCard(level.concept, isNew));
  $('win-next').textContent = t.next;
  $('win-next').classList.toggle('hidden', last);
  $('win-again').textContent = t.again;
  $('win').classList.remove('hidden');
  if (isNew) sfx.play('card');
  $('win-next').focus();
}

$('win-next').onclick = () => {
  $('win').classList.add('hidden');
  const i = LEVELS.indexOf(level);
  startLevel(LEVELS[Math.min(i + 1, LEVELS.length - 1)].id);
};
$('win-again').onclick = () => {
  $('win').classList.add('hidden');
  startLevel(level.id);
};

function openSheet(title: string, body: HTMLElement[]) {
  $('sheet-title').textContent = title;
  $('sheet-body').replaceChildren(...body);
  $('sheet').classList.remove('hidden');
  closeMenu();
}
const closeSheet = () => $('sheet').classList.add('hidden');
$('sheet-close').onclick = closeSheet;
$('sheet').onclick = (e) => e.target === $('sheet') && closeSheet();

function showBook() {
  const all = LEVELS.map((l) => l.concept);
  const cards = progress.cards.map((id) => conceptCard(id, false));
  const count = document.createElement('p');
  count.className = 'muted';
  count.textContent = cards.length ? fill(t.bookCount, { n: cards.length, total: all.length }) : t.bookEmpty;
  openSheet(`📘 ${t.book}`, [count, ...cards]);
}

/** The island map: each island with its levels; a level opens once the one before it is solved. */
function showLevels() {
  const body: HTMLElement[] = [];
  for (const island of ISLANDS) {
    const head = document.createElement('h3');
    head.className = 'island-head';
    head.textContent = `${island === 1 ? '🏝️' : island === 2 ? '🦋' : island === 3 ? '🛠️' : '🧅'} ${t.islands[island]}`;
    body.push(head);
    const first = levelsOf(island)[0];
    const prev = LEVELS[LEVELS.indexOf(first) - 1];
    if (prev && !(prev.id in progress.stars)) {
      const locked = document.createElement('p');
      locked.className = 'muted';
      locked.textContent = `🔒 ${fill(t.islandLocked, { name: t.islands[prev.island] })}`;
      body.push(locked);
      continue;
    }
    levelsOf(island).forEach((l, i) => {
      const b = document.createElement('button');
      b.className = 'level-btn';
      const at = LEVELS.indexOf(l);
      const open = at === 0 || LEVELS[at - 1].id in progress.stars;
      b.disabled = !open;
      b.innerHTML = `<span></span><span class="lstars"></span>`;
      b.firstElementChild!.textContent = `${i + 1}. ${t.levelTitles[l.id]}`;
      b.lastElementChild!.innerHTML = open ? starsHtml(progress.stars[l.id] ?? 0) : '🔒';
      b.onclick = () => {
        if (busy) return;
        closeSheet();
        startLevel(l.id);
      };
      body.push(b);
    });
  }
  const soon = document.createElement('p');
  soon.className = 'muted';
  soon.textContent = t.comingNext;
  body.push(soon);
  openSheet(`🗺️ ${t.map}`, body);
}

// --- Menu -------------------------------------------------------------------------------------------

function closeMenu() {
  $('menu').classList.add('hidden');
  $('menu-btn').ariaExpanded = 'false';
}
$('menu-btn').onclick = () => {
  const open = $('menu').classList.toggle('hidden') === false;
  $('menu-btn').ariaExpanded = String(open);
  refresh();
};
$('book-btn').onclick = showBook;
$('m-book').onclick = showBook;
$('m-levels').onclick = showLevels;
$('m-sound').onclick = () => {
  sfx.on = !sfx.on;
  try {
    localStorage.setItem(SOUND_KEY, sfx.on ? '1' : '0');
  } catch {
    // ignore
  }
  refresh();
};
$('m-music').onclick = () => {
  sfx.unlock();
  sfx.setMusic(!sfx.music);
  try {
    localStorage.setItem(MUSIC_KEY, sfx.music ? '1' : '0');
  } catch {
    // ignore
  }
  refresh();
};
$('m-fullscreen').onclick = () => void toggleFullscreen();
$('m-install').onclick = () => void install();
$('m-reset').onclick = () => {
  if (!confirm(t.resetConfirm)) return;
  progress = emptyProgress();
  save();
  closeMenu();
  startLevel(LEVELS[0].id);
};
onPwaChange(() => playing && refresh());
try {
  sfx.on = localStorage.getItem(SOUND_KEY) !== '0';
  sfx.setMusic(localStorage.getItem(MUSIC_KEY) !== '0');
} catch {
  // ignore
}

// --- Input ------------------------------------------------------------------------------------------

const canvas = world.renderer.domElement;
let down: { x: number; y: number; at: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, at: performance.now() };
  closeMenu();
});
canvas.addEventListener('pointerup', (e) => {
  // A tap, not a drag that turns the island.
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10 && performance.now() - down.at < 600) onTap(e.clientX, e.clientY);
  down = null;
});
$('run-btn').onclick = () => void runBuild();
$('clear-btn').onclick = () => {
  if (busy) return;
  startLevel(level.id);
};
$('remove-btn').onclick = removeSelected;
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeMenu();
    closeSheet();
    selected = null;
    holding = null;
    if (playing) refresh();
  }
});

// --- Start ------------------------------------------------------------------------------------------

$('play').onclick = () => {
  sfx.unlock();
  sfx.play('tap');
  playing = true;
  world.controls.autoRotate = false;
  $('title').classList.add('hidden');
  for (const id of ['hud', 'dock']) $(id).classList.remove('hidden');
  startLevel(nextLevel(progress));
};

startLevel(level.id);
requestAnimationFrame(() => requestAnimationFrame(() => $('splash').classList.add('done')));

registerSW({
  immediate: true,
  onOfflineReady() {
    showToast(t.offlineReady);
  },
  onNeedRefresh() {
    showToast(t.updateAvailable, t.updateNow, () => location.reload());
  },
});

function showToast(text: string, action?: string, fn?: () => void) {
  const el = $('toast');
  el.replaceChildren(text);
  if (action && fn) {
    const b = document.createElement('button');
    b.className = 'primary';
    b.style.marginInlineStart = '10px';
    b.textContent = action;
    b.onclick = fn;
    el.appendChild(b);
  }
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 6000);
}

if (import.meta.env.DEV) {
  (window as unknown as { __game: unknown }).__game = {
    world,
    get state() {
      return { level: level.id, build, selected, holding, busy, progress };
    },
    start: (id: string) => {
      if (!playing) $('play').click();
      startLevel(id);
    },
    place: (pad: string, kind: Kind) => placeOn(pad, kind),
    connect: (from: string, to: string) => {
      build = { ...build, edges: toggleEdge(build.edges, from, to) };
      refresh();
    },
    run: () => void runBuild(),
    /** Screen point of a piece or pad, for real taps. */
    screenOf: (id: string) => world.toScreen(board.topOf(id).setY(board.topOf(id).y - 0.6)),
    solve: () => {
      build = { placed: { ...level.solution.placed }, edges: [...level.solution.edges] };
      refresh();
    },
  };
}

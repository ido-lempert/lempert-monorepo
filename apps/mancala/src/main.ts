import './style.css';
import { Sound } from './audio/sound';
import type { Difficulty } from './game/ai';
import { applyMove, createGame, type GameState, legalMoves, type Player, pitsOf, STORE } from './game/kalah';
import { applyDocument, getLang, type Lang, LANGUAGES, onLangChange, setLang, type StringKey, t } from './i18n';
import { type PageId, PAGES } from './i18n/pages';
import { OnlineClient, savedToken } from './net/online';
import type { ServerMsg } from './net/protocol';
import { canFullscreen, canInstall, install, isFullscreen, isOnline, onPwaChange, toggleFullscreen } from './pwa';
import { Board3D, PLAYER_COLORS } from './render/board3d';
import { confetti } from './render/confetti';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

type Mode = 'ai' | 'pvp' | 'online';

interface Settings {
  mode: Mode;
  difficulty: Difficulty;
  names: [string, string];
}

/** Present while playing (or setting up) a game against a friend on another device. */
interface Online {
  client: OnlineClient;
  room: string | null;
  me: Player;
  names: [string, string];
  peerConnected: boolean;
}

const SETTINGS_KEY = 'mancala.settings';

function loadSettings(): Settings {
  const defaults: Settings = { mode: 'ai', difficulty: 'medium', names: ['', ''] };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}

let settings = loadSettings();
let online: Online | null = null;
let state: GameState = createGame();
let busy = false;
let game = 0;
let toastTimer = 0;
/** Online moves arrive from the server and are animated one after another. */
let moveQueue: Promise<void> = Promise.resolve();
/** True while the computer or remote friend is to move; used to chime when it's our turn again. */
let waitingOnOther = false;
/** Which join screen is showing, so it can be re-rendered on language change. */
let joinView: { kind: 'invited' | 'full' | 'gone' | 'offline'; host: string } | null = null;

const board = new Board3D($('#stage'), (pit) => onPitClicked(pit));
const sound = new Sound();
board.onLift = () => sound.lift();
board.onStoneLanded = (container, element) => sound.drop(element, container === STORE[0] || container === STORE[1]);

const worker = new Worker(new URL('./game/ai.worker.ts', import.meta.url), { type: 'module' });
function computerMove(s: GameState): Promise<number> {
  return new Promise((resolve) => {
    worker.onmessage = (e: MessageEvent<number>) => resolve(e.data);
    worker.postMessage({ state: s, difficulty: settings.difficulty });
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const show = (sel: string, visible: boolean) => $(sel).classList.toggle('hidden', !visible);

function isComputer(p: Player): boolean {
  return !online && settings.mode === 'ai' && p === 1;
}

/** Whether a person on this device may pick a pit for `p` right now. */
function isLocalTurn(p: Player): boolean {
  return online ? p === online.me : !isComputer(p);
}

/** The player whose side of the table this device looks from. */
function viewer(): Player {
  return online?.me ?? 0;
}

function playerName(p: Player): string {
  if (online) return online.names[p] || t('playerN', { n: p + 1 });
  if (isComputer(p)) return t('computer', { level: t(settings.difficulty) });
  return settings.names[p].trim() || t('playerN', { n: p + 1 });
}

function toast(text: string, color: string) {
  const el = $('#toast');
  el.textContent = text;
  el.style.color = color;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 1100);
}

/** Reads a message to screen-reader users. */
function announce(text: string) {
  const live = $('#live');
  live.textContent = '';
  requestAnimationFrame(() => (live.textContent = text));
}

let bannerKey: { key: StringKey; name?: string } | null = null;
function banner(msg: { key: StringKey; name?: string } | null) {
  bannerKey = msg;
  $('#banner').textContent = msg ? t(msg.key, { name: msg.name ?? '' }) : '';
  show('#banner', !!msg);
}

function updateHud() {
  const me = viewer();
  document.querySelectorAll<HTMLElement>('.player').forEach((el) => {
    const p = Number(el.dataset.player) as Player;
    // Each name sits on the same side of the screen as that player's store: the viewer's on the left.
    el.style.order = p === me ? '0' : '2';
    const name = el.querySelector('.name')!;
    name.textContent = playerName(p);
    if (online?.me === p) name.insertAdjacentHTML('beforeend', ` <span class="you">${t('me')}</span>`);
    el.querySelector('.score')!.textContent = String(state.board[STORE[p]]);
    el.classList.toggle('active', !state.over && state.current === p);
  });
  let turn = '';
  if (!state.over) {
    if (isComputer(state.current)) turn = t('computerThinking');
    else if (online) turn = state.current === online.me ? t('yourTurn') : t('waitingFor', { name: playerName(state.current) });
    else turn = t('turnOf', { name: playerName(state.current) });
  }
  $('#turn').textContent = turn;
  show('#restart', !online);
  renderPitKeys();
}

/** Keyboard / screen-reader buttons for the current local player's pits, in sowing order. */
function renderPitKeys() {
  const box = $('#pit-keys');
  const p = state.current;
  const enabled = !busy && !state.over && isLocalTurn(p) && $('#setup').classList.contains('hidden');
  const legal = new Set(legalMoves(state));
  box.replaceChildren(
    ...pitsOf(p).map((pit, i) => {
      const b = document.createElement('button');
      b.textContent = String(i + 1);
      b.style.borderColor = PLAYER_COLORS[p];
      b.setAttribute('aria-label', t('pitButton', { n: i + 1, count: state.board[pit] }));
      b.disabled = !enabled || !legal.has(pit);
      b.addEventListener('click', () => onPitClicked(pit));
      b.addEventListener('focus', () => board.setHover(pit));
      b.addEventListener('blur', () => board.setHover(null));
      return b;
    }),
  );
}

function localWinner(): Player | null {
  // Against a remote friend or the computer there is a "you"; on a shared device any winner is a local human.
  if (state.winner === 'draw' || state.winner === null) return null;
  if (online) return state.winner === online.me ? state.winner : null;
  if (settings.mode === 'ai') return state.winner === 0 ? 0 : null;
  return state.winner;
}

function renderGameOver() {
  const [a, b] = [state.board[STORE[0]], state.board[STORE[1]]];
  const result = $('#result');
  if (state.winner === 'draw') {
    result.textContent = t('draw');
    result.style.color = '';
  } else {
    const w = state.winner as Player;
    if (online && w === online.me) result.textContent = t('youWon');
    else if (isComputer(w)) result.textContent = t('computerWon');
    else result.textContent = t('wins', { name: playerName(w) });
    result.style.color = PLAYER_COLORS[w];
  }
  // Viewer's score first, matching the HUD order.
  $('#final').textContent = viewer() === 0 ? `${a} : ${b}` : `${b} : ${a}`;
}

function showGameOver() {
  renderGameOver();
  const winner = localWinner();
  if (winner !== null) {
    sound.win();
    confetti();
  } else if (state.winner === 'draw') sound.win();
  else sound.lose();
  announce(`${$('#result').textContent} ${$('#final').textContent}`);
  show('#again', !online);
  show('#rematch', !!online);
  $('#rematch').removeAttribute('disabled');
  $('#rematch').textContent = t('rematch');
  show('#rematch-note', false);
  show('#gameover', true);
  $<HTMLButtonElement>(online ? '#rematch' : '#again').focus();
}

/** Animates a move, updates state and HUD. Used by every mode. */
async function animateMove(pit: number): Promise<boolean> {
  busy = true;
  board.setActive(null);
  renderPitKeys();
  const result = applyMove(state, pit);
  const mover = state.current;
  const current = game;
  announce(t('announceMove', { name: playerName(mover), count: state.board[pit] }));
  await board.playMove(pit, result, mover);
  if (current !== game) return false;
  state = result.state;
  busy = false;
  updateHud();
  const score = t('announceScore', { a: state.board[STORE[viewer()]], b: state.board[STORE[viewer() === 0 ? 1 : 0]] });
  if (result.capture) {
    toast(t('capture', { n: result.capture.count }), PLAYER_COLORS[mover]);
    sound.capture(mover);
    announce(`${t('capture', { n: result.capture.count })} ${score}`);
  } else if (result.extraTurn) {
    toast(t('extraTurn'), PLAYER_COLORS[mover]);
    sound.extraTurn();
    announce(`${t('extraTurn')} ${score}`);
  } else announce(score);
  return true;
}

function onPitClicked(pit: number) {
  if (busy || !isLocalTurn(state.current) || !legalMoves(state).includes(pit)) return;
  if (online) {
    // The server is the referee: send the move and animate it when it comes back.
    board.setActive(null);
    online.client.send({ t: 'move', pit });
    return;
  }
  void animateMove(pit).then((done) => {
    if (done) void nextTurn();
  });
}

async function nextTurn() {
  if (state.over) {
    showGameOver();
    return;
  }
  if (isLocalTurn(state.current)) {
    if (waitingOnOther) sound.yourTurn();
    waitingOnOther = false;
    board.setActive(state.current, legalMoves(state));
    renderPitKeys();
    return;
  }
  waitingOnOther = true;
  board.setActive(null);
  if (!isComputer(state.current)) return; // online: wait for the opponent's move
  const current = game;
  // A short pause so the computer's move reads as a separate turn.
  const [pit] = await Promise.all([computerMove(state), wait(700)]);
  if (current === game && (await animateMove(pit))) void nextTurn();
}

function startGame(initial: GameState) {
  game++;
  waitingOnOther = false;
  moveQueue = Promise.resolve();
  state = initial;
  busy = false;
  board.setBoard(state.board);
  for (const id of ['#gameover', '#setup', '#invite', '#join']) show(id, false);
  updateHud();
  void nextTurn();
}

function newLocalGame() {
  board.setViewer(0);
  startGame(createGame());
}

// Number keys 1–6 play the current local player's pits in sowing order.
document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.key === 'Escape') {
    closePanels();
    if (!$('#page').classList.contains('hidden')) closePage();
    return;
  }
  const n = Number(e.key);
  if (n >= 1 && n <= 6 && isLocalTurn(state.current)) onPitClicked(pitsOf(state.current)[n - 1]);
});

// --- Online play ----------------------------------------------------------

function roomUrl(room: string): string {
  const url = new URL(location.href);
  url.search = `?room=${room}`;
  url.hash = '';
  return url.toString();
}

function goOnline(): Online {
  leaveOnline();
  online = {
    client: new OnlineClient(onServerMessage, onConnection),
    room: null,
    me: 0,
    names: ['', ''],
    peerConnected: true,
  };
  updateHud();
  return online;
}

function leaveOnline() {
  online?.client.close();
  online = null;
  banner(null);
  if (location.search) history.replaceState(null, '', location.pathname + location.hash);
}

function onConnection(connected: boolean) {
  if (!online) return;
  if (!connected) banner({ key: 'serverLost' });
  else if (online.peerConnected) banner(null);
}

function opponentName(): string {
  return playerName(online?.me === 0 ? 1 : 0);
}

function onServerMessage(msg: ServerMsg) {
  const o = online;
  if (!o) return;
  switch (msg.t) {
    case 'created':
      o.room = msg.room;
      history.replaceState(null, '', roomUrl(msg.room));
      openInvite(msg.room);
      break;
    case 'room':
      showJoin(msg.open ? 'invited' : 'full', msg.hostName);
      break;
    case 'sync':
      o.room = msg.room;
      o.me = msg.you;
      o.names = [msg.names[0], msg.names[1] ?? ''];
      history.replaceState(null, '', roomUrl(msg.room));
      board.setViewer(msg.you);
      if (!msg.state) {
        // Host reloaded before anyone joined: keep inviting.
        openInvite(msg.room);
        break;
      }
      startGame(msg.state);
      if (msg.reason === 'start') toast(t('joined', { name: opponentName() }), PLAYER_COLORS[msg.you]);
      break;
    case 'moved': {
      const current = game;
      moveQueue = moveQueue.then(async () => {
        if (current !== game) return;
        if (!(await animateMove(msg.pit))) return;
        // Trust the server if we ever drift from it.
        if (JSON.stringify(state) !== JSON.stringify(msg.state)) {
          state = msg.state;
          board.setBoard(state.board);
          updateHud();
        }
        await nextTurn();
      });
      break;
    }
    case 'peer':
      o.peerConnected = msg.connected;
      banner(msg.connected ? null : { key: 'peerLeft', name: opponentName() });
      break;
    case 'rematch-requested':
      $('#rematch-note').textContent = t('rematchRequested', { name: playerName(msg.by) });
      show('#rematch-note', true);
      announce($('#rematch-note').textContent!);
      break;
    case 'error':
      if (msg.code === 'not-found') showJoin('gone');
      else if (msg.code === 'full') showJoin('full');
      else if (msg.code === 'bad-move') void nextTurn();
      break;
  }
}

function openInvite(room: string) {
  $<HTMLInputElement>('#invite-link').value = roomUrl(room);
  const local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
  show('#invite-warn', local);
  show('#share-native', 'share' in navigator);
  for (const id of ['#setup', '#gameover', '#join']) show(id, false);
  show('#invite', true);
  ($('#share-native').classList.contains('hidden') ? $('#share-whatsapp') : $('#share-native')).focus();
}

function inviteText(): string {
  return t('inviteText', { name: settings.names[0] || t('aFriend') });
}

async function copyLink(url: string, button: HTMLElement) {
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    $<HTMLInputElement>('#invite-link').select();
    document.execCommand('copy');
  }
  button.textContent = t('copied');
  button.classList.add('done');
  setTimeout(() => {
    button.textContent = t('copy');
    button.classList.remove('done');
  }, 1800);
}

function showJoin(kind: 'invited' | 'full' | 'gone' | 'offline', host = '') {
  joinView = { kind, host };
  renderJoin();
  $<HTMLInputElement>('#join-name').value = settings.names[0];
  for (const id of ['#setup', '#gameover', '#invite']) show(id, false);
  show('#join', true);
  if (kind === 'invited') $('#join-name').focus();
}

function renderJoin() {
  if (!joinView) return;
  const { kind, host } = joinView;
  const keys: Record<typeof kind, StringKey> = {
    invited: 'joinInvited',
    full: 'joinFull',
    gone: 'joinGone',
    offline: 'joinOffline',
  };
  $('#join-lead').textContent = t(keys[kind], { host: host || t('aFriend') });
  show('#join-name-field', kind === 'invited');
  show('#join-submit', kind === 'invited');
}

// --- Setup screen ---------------------------------------------------------

function renderSetup() {
  const offline = !isOnline();
  // Offline: online play is hidden, and a saved "online" choice falls back to playing the computer.
  const mode: Mode = offline && settings.mode === 'online' ? 'ai' : settings.mode;
  show('#mode-online', !offline);
  show('#offline-note', offline);
  document.querySelectorAll<HTMLElement>('.segmented').forEach((group) => {
    const value = group.dataset.name === 'mode' ? mode : settings.difficulty;
    group.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      const selected = b.dataset.value === value;
      b.classList.toggle('selected', selected);
      b.setAttribute('aria-pressed', String(selected));
    });
  });
  show('#difficulty-field', mode === 'ai');
  show('#name1-field', mode === 'pvp');
  $('#name0-label').textContent = t(mode === 'online' ? 'yourNameFire' : 'player1Label');
  $('#start').textContent = t(mode === 'online' ? 'createInvite' : 'startGame');
  $<HTMLInputElement>('#name0').placeholder = mode === 'online' ? t('yourName') : t('playerN', { n: 1 });
  $<HTMLInputElement>('#name1').placeholder = t('playerN', { n: 2 });
  $<HTMLInputElement>('#join-name').placeholder = t('yourName');
}

function openSetup() {
  game++; // cancel any running animation / computer turn
  busy = false;
  joinView = null;
  leaveOnline();
  board.setActive(null);
  $<HTMLInputElement>('#name0').value = settings.names[0];
  $<HTMLInputElement>('#name1').value = settings.names[1];
  renderSetup();
  for (const id of ['#gameover', '#invite', '#join']) show(id, false);
  show('#setup', true);
  updateHud();
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

document.querySelectorAll<HTMLElement>('.segmented').forEach((group) => {
  group.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest('button');
    if (!button) return;
    const key = group.dataset.name as 'mode' | 'difficulty';
    settings = { ...settings, [key]: button.dataset.value };
    renderSetup();
  });
});

$('#setup-form').addEventListener('submit', (e) => {
  e.preventDefault();
  settings.names = [$<HTMLInputElement>('#name0').value.trim(), $<HTMLInputElement>('#name1').value.trim()];
  if (!isOnline() && settings.mode === 'online') settings.mode = 'ai';
  saveSettings();
  if (settings.mode === 'online') {
    goOnline().client.send({ t: 'create', name: settings.names[0] });
    return;
  }
  newLocalGame();
});

$('#join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $<HTMLInputElement>('#join-name').value.trim();
  settings.names = [name, settings.names[1]];
  saveSettings();
  if (online?.room) online.client.send({ t: 'join', room: online.room, name });
});

$('#share-native').addEventListener('click', () => {
  navigator.share?.({ title: t('appName'), text: inviteText(), url: $<HTMLInputElement>('#invite-link').value }).catch(() => {});
});
$('#share-whatsapp').addEventListener('click', () => {
  const text = `${inviteText()}\n${$<HTMLInputElement>('#invite-link').value}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
});
$('#share-email').addEventListener('click', () => {
  const body = `${inviteText()}\n\n${$<HTMLInputElement>('#invite-link').value}`;
  location.href = `mailto:?subject=${encodeURIComponent(t('emailSubject'))}&body=${encodeURIComponent(body)}`;
});
$('#share-copy').addEventListener('click', (e) =>
  copyLink($<HTMLInputElement>('#invite-link').value, e.currentTarget as HTMLElement),
);
$('#invite-link').addEventListener('focus', (e) => (e.target as HTMLInputElement).select());
$('#invite-cancel').addEventListener('click', openSetup);
$('#join-leave').addEventListener('click', openSetup);

$('#restart').addEventListener('click', newLocalGame);
$('#again').addEventListener('click', newLocalGame);
$('#rematch').addEventListener('click', () => {
  online?.client.send({ t: 'rematch' });
  $('#rematch').setAttribute('disabled', '');
  $('#rematch').textContent = t('waitingFor', { name: opponentName() });
});
$('#to-settings').addEventListener('click', openSetup);

// --- HUD panels: sound and menu -------------------------------------------

function closePanels() {
  show('#sound-panel', false);
  show('#menu', false);
  $('#sound').setAttribute('aria-expanded', 'false');
  $('#menu-btn').setAttribute('aria-expanded', 'false');
}

function togglePanel(panel: string, button: string) {
  const open = $(panel).classList.contains('hidden');
  closePanels();
  show(panel, open);
  $(button).setAttribute('aria-expanded', String(open));
  if (open) $(panel).querySelector<HTMLElement>('button:not(.hidden), input, select')?.focus();
}

$('#sound').addEventListener('click', (e) => {
  e.stopPropagation();
  togglePanel('#sound-panel', '#sound');
});
$('#menu-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  togglePanel('#menu', '#menu-btn');
});
for (const panel of ['#sound-panel', '#menu']) $(panel).addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('click', closePanels);

function renderSound() {
  $<HTMLInputElement>('#toggle-music').checked = sound.prefs.music;
  $<HTMLInputElement>('#toggle-sfx').checked = sound.prefs.sfx;
  const silent = !sound.prefs.music && !sound.prefs.sfx;
  $('#sound').textContent = silent ? '🔇' : '🔊';
  $('#sound').classList.toggle('muted', silent);
}
$('#toggle-music').addEventListener('change', (e) => {
  sound.setMusic((e.target as HTMLInputElement).checked);
  renderSound();
});
$('#toggle-sfx').addEventListener('change', (e) => {
  sound.setSfx((e.target as HTMLInputElement).checked);
  renderSound();
});

$('#m-settings').addEventListener('click', () => {
  closePanels();
  openSetup();
});
$('#m-camera').addEventListener('click', () => {
  closePanels();
  board.resetCamera();
});
$('#m-fullscreen').addEventListener('click', () => {
  closePanels();
  void toggleFullscreen();
});
$('#m-install').addEventListener('click', () => {
  closePanels();
  void install();
});

function renderPwa() {
  show('#m-fullscreen', canFullscreen());
  $('#m-fullscreen-label').textContent = t(isFullscreen() ? 'exitFullscreen' : 'fullscreen');
  show('#m-install', canInstall());
  // Going offline mid-setup hides online play; coming back restores it.
  if (!$('#setup').classList.contains('hidden')) renderSetup();
  if (joinView && !isOnline()) showJoin('offline');
}
onPwaChange(renderPwa);

// --- Language -------------------------------------------------------------

function renderLangSelects() {
  document.querySelectorAll<HTMLSelectElement>('.lang-select').forEach((sel) => {
    if (!sel.options.length) {
      for (const l of LANGUAGES) sel.add(new Option(l.name, l.code));
      sel.addEventListener('change', () => setLang(sel.value as Lang));
    }
    sel.value = getLang();
  });
}

function renderAll() {
  applyDocument();
  renderLangSelects();
  renderSetup();
  renderJoin();
  renderSound();
  renderPwa();
  updateHud();
  if (!$('#gameover').classList.contains('hidden')) renderGameOver();
  if (bannerKey) banner(bannerKey);
  const page = currentPage();
  if (page) renderPage(page);
}
onLangChange(renderAll);

// --- Pages: how to play, terms, accessibility ------------------------------

const PAGE_IDS: PageId[] = ['rules', 'terms', 'accessibility'];
let pageReturnFocus: HTMLElement | null = null;

function currentPage(): PageId | null {
  const id = location.hash.slice(1) as PageId;
  return PAGE_IDS.includes(id) ? id : null;
}

function renderPage(id: PageId) {
  $('#page-title').textContent = t(id);
  $('#page-body').innerHTML = PAGES[getLang()][id];
}

function openPage(id: PageId) {
  pageReturnFocus = document.activeElement as HTMLElement | null;
  renderPage(id);
  show('#page', true);
  $('#page-close').focus();
}

function closePage() {
  show('#page', false);
  if (currentPage()) history.replaceState(null, '', location.pathname + location.search);
  pageReturnFocus?.focus();
}

document.querySelectorAll<HTMLElement>('[data-page]').forEach((el) =>
  el.addEventListener('click', () => {
    closePanels();
    const id = el.dataset.page as PageId;
    history.replaceState(null, '', `${location.pathname}${location.search}#${id}`);
    openPage(id);
  }),
);
$('#page-close').addEventListener('click', closePage);
$('#page').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closePage();
});
window.addEventListener('hashchange', () => {
  const page = currentPage();
  if (page) openPage(page);
  else show('#page', false);
});

// The orbit hint fades after the first interaction with the board, or after a while.
const hideHint = () => $('#hint').classList.add('gone');
$('#stage').addEventListener('pointerdown', hideHint, { once: true });
setTimeout(hideHint, 12000);

// --- Start ------------------------------------------------------------------

board.setBoard(state.board);
renderAll();

// Opened from an invite link (or reloaded mid-game): join or resume that room.
const invitedRoom = new URLSearchParams(location.search).get('room');
if (invitedRoom && !isOnline()) {
  show('#setup', false);
  showJoin('offline');
} else if (invitedRoom) {
  const o = goOnline();
  o.room = invitedRoom;
  history.replaceState(null, '', roomUrl(invitedRoom) + location.hash);
  const token = savedToken(invitedRoom);
  if (token) o.client.resume(invitedRoom, token);
  else o.client.send({ t: 'peek', room: invitedRoom });
} else {
  openSetup();
}
const initialPage = currentPage();
if (initialPage) openPage(initialPage);

// Reveal the app once the first frames of the board have rendered, then fade the splash out.
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    document.body.classList.add('ready');
    $('#splash').classList.add('done');
    setTimeout(() => $('#splash').remove(), 600);
  }),
);

if (import.meta.env.DEV) {
  // Hook for automated playtests: lets a script find pits on screen and read the game state.
  Object.assign(window, {
    __mancala: { pitScreen: (i: number) => board.screenPosition(i), state: () => state, busy: () => busy, sound },
  });
}

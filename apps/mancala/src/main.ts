import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { Sound } from './audio/sound';
import type { CardPlay, Difficulty } from './game/ai';
import type { AiRequest } from './game/ai.worker';
import {
  applyMove,
  blockTargets,
  type Card,
  type CardResult,
  createGame,
  type GameState,
  isBlocked,
  legalMoves,
  type Player,
  pitsOf,
  STORE,
  useCard,
} from './game/kalah';
import { applyDocument, getLang, type Lang, LANGUAGES, onLangChange, setLang, type StringKey, t } from './i18n';
import { type PageId, PAGES } from './i18n/pages';
import { OnlineClient, savedToken } from './net/online';
import type { ServerMsg } from './net/protocol';
import { apply as applyDisplay, isLight, onDisplayChange, reducedMotion, setReducedMotion, setTheme, type ThemePref, themePref } from './prefs';
import { canFullscreen, canInstall, install, isFullscreen, isOnline, onPwaChange, toggleFullscreen } from './pwa';
import { Board3D, PLAYER_COLORS } from './render/board3d';
import { confetti } from './render/confetti';
import { flushQueuedWins, renderFame, reportComputerWin } from './ui/fame';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

type Mode = 'ai' | 'pvp' | 'online';
type Variant = 'classic' | 'magic';

interface Settings {
  mode: Mode;
  difficulty: Difficulty;
  variant: Variant;
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
const MAGIC_OFFERED_KEY = 'mancala.magicOffered';
const CARD_ICON: Record<Card, string> = { block: '🔒', mirror: '🪞' };

function loadSettings(): Settings {
  const defaults: Settings = { mode: 'ai', difficulty: 'medium', variant: 'classic', names: ['', ''] };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}

applyDisplay();
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
let joinView: { kind: 'invited' | 'full' | 'gone' | 'offline'; host: string; magic: boolean } | null = null;
/** Choosing which opponent pit a Block card should lock. */
let targeting = false;

const board = new Board3D($('#stage'), (pit) => onPitClicked(pit));
const sound = new Sound();
board.onLift = () => sound.lift();
board.onStoneLanded = (container, element) => sound.drop(element, container === STORE[0] || container === STORE[1]);

const worker = new Worker(new URL('./game/ai.worker.ts', import.meta.url), { type: 'module' });
function askComputer<T>(kind: AiRequest['kind'], s: GameState): Promise<T> {
  return new Promise((resolve) => {
    worker.onmessage = (e: MessageEvent<T>) => resolve(e.data);
    worker.postMessage({ kind, state: s, difficulty: settings.difficulty } satisfies AiRequest);
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function show(sel: string, visible: boolean) {
  $(sel).classList.toggle('hidden', !visible);
  if ($(sel).classList.contains('overlay')) syncInert();
}

/** While a dialog is open, everything behind it is inert, so focus and screen readers stay inside it. */
function syncInert() {
  const open = [...document.querySelectorAll<HTMLElement>('.overlay:not(.hidden)')];
  const top = open.at(-1) ?? null;
  for (const el of document.querySelectorAll<HTMLElement>('body > *:not(script):not(#splash)')) {
    el.inert = top !== null && el !== top && !['toast', 'live', 'update'].includes(el.id);
  }
}

const other = (p: Player): Player => (p === 0 ? 1 : 0);

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

const cardName = (card: Card) => t(`card_${card}` as StringKey);
/** Card name without its emoji, for places that already show the card's icon. */
const cardTitle = (card: Card) => cardName(card).replace(/\s*\p{Extended_Pictographic}\uFE0F?/gu, '').trim();
const cardText = (card: Card) => t(`cardText_${card}` as StringKey);

function toast(text: string, color: string) {
  const el = $('#toast');
  el.textContent = text;
  el.style.color = color;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 1400);
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
  show('#m-new', !online);
  renderPitKeys();
  renderCard();
}

/** Keyboard / screen-reader buttons: the local player's pits in sowing order, or Block targets while targeting. */
function renderPitKeys() {
  const box = $('#pit-keys');
  const p = state.current;
  const enabled = !busy && !state.over && isLocalTurn(p) && $('#setup').classList.contains('hidden');
  const pits = targeting ? pitsOf(other(p)) : pitsOf(p);
  const allowed = new Set(targeting ? blockTargets(state) : legalMoves(state));
  box.replaceChildren(
    ...pits.map((pit, i) => {
      const b = document.createElement('button');
      b.textContent = String(i + 1);
      b.style.borderColor = PLAYER_COLORS[p];
      const params = { n: i + 1, count: state.board[pit] };
      b.setAttribute('aria-label', t(isBlocked(state, pit) ? 'pitBlocked' : 'pitButton', params));
      b.disabled = !enabled || !allowed.has(pit);
      b.addEventListener('click', () => onPitClicked(pit));
      b.addEventListener('focus', () => board.setHover(pit));
      b.addEventListener('blur', () => board.setHover(null));
      return b;
    }),
  );
}

// --- Magic cards ------------------------------------------------------------

/** Whose card this device shows: yours against the computer or online; whoever's turn it is on a shared device. */
function cardHolder(): Player {
  if (online) return online.me;
  return settings.mode === 'ai' ? 0 : state.current;
}

function renderCard() {
  const holder = cardHolder();
  const card = state.magic?.cards[holder] ?? null;
  const visible = !!card && !state.over && $('#setup').classList.contains('hidden');
  show('#card', visible);
  const opp = other(holder);
  const oppCard = settings.mode !== 'pvp' || online ? state.magic?.cards[opp] : null;
  $('#opp-card').textContent = oppCard ? t('opponentHasCard', { name: playerName(opp) }) : '';
  show('#opp-card', !!oppCard && !state.over && $('#setup').classList.contains('hidden'));
  // Keep the board clear of the card (on narrow screens it spans the bottom).
  requestAnimationFrame(() => board.setBottomInset(visible ? $('#card').offsetHeight + 16 : 0));
  if (!card) return;

  $('#card').style.setProperty('--card-color', PLAYER_COLORS[holder]);
  $('#card-heading').textContent = settings.mode === 'pvp' && !online ? t('cardOf', { name: playerName(holder) }) : t('yourCard');
  $('#card-icon').textContent = CARD_ICON[card];
  $('#card-title').textContent = cardTitle(card);
  $('#card-text').textContent = cardText(card);
  const canPlay =
    !busy && state.current === holder && isLocalTurn(holder) && (card === 'mirror' || blockTargets(state).length > 0);
  const button = $<HTMLButtonElement>('#card-use');
  button.textContent = targeting ? t('cancelCard') : t('useCard');
  button.disabled = !canPlay && !targeting;
  $('#card-hint').textContent = targeting ? t('chooseBlockTarget') : canPlay ? '' : t('cardWait');
}

function startTargeting() {
  targeting = true;
  board.setActive(state.current, blockTargets(state));
  renderPitKeys();
  renderCard();
  announce(t('chooseBlockTarget'));
  $<HTMLButtonElement>('#pit-keys button:not([disabled])')?.focus();
}

function stopTargeting() {
  if (!targeting) return;
  targeting = false;
  board.setActive(state.current, isLocalTurn(state.current) ? legalMoves(state) : []);
  renderPitKeys();
  renderCard();
}

$('#card-use').addEventListener('click', () => {
  const card = state.magic?.cards[state.current];
  if (targeting) return stopTargeting();
  if (!card) return;
  if (card === 'block') startTargeting();
  else playCard('mirror', null);
});

function playCard(card: Card, target: number | null) {
  targeting = false;
  if (online) {
    board.setActive(null);
    online.client.send({ t: 'card', card, target });
    return;
  }
  const current = game;
  void animateCard(useCard(state, card, target)).then((done) => {
    if (done && current === game) void nextTurn();
  });
}

/** Shows a card being played, then adopts the resulting state. */
async function animateCard(result: CardResult): Promise<boolean> {
  busy = true;
  board.setActive(null);
  renderPitKeys();
  const current = game;
  const message = t('cardPlayed', { name: playerName(result.by), card: cardName(result.card) });
  toast(message, PLAYER_COLORS[result.by]);
  announce(`${message} ${cardText(result.card)}`);
  sound.magic();
  if (result.card === 'mirror') await board.playMirror();
  else {
    board.setBlocked(result.state.magic?.blocked ?? []);
    await wait(reducedMotion() ? 150 : 700);
  }
  if (current !== game) return false;
  if (result.sweeps.length) await board.playSweeps(result.sweeps);
  if (current !== game) return false;
  state = result.state;
  busy = false;
  updateHud();
  return true;
}

function showMagicIntro() {
  if (!state.magic) return;
  const holders: Player[] = settings.mode === 'pvp' && !online ? [0, 1] : [cardHolder()];
  $('#magic-intro-cards').replaceChildren(
    ...holders.map((p) => {
      const card = state.magic!.cards[p]!;
      const item = document.createElement('div');
      item.className = 'intro-card';
      item.style.setProperty('--card-color', PLAYER_COLORS[p]);
      const owner = document.createElement('p');
      owner.className = 'card-owner';
      owner.textContent = holders.length > 1 ? t('cardOf', { name: playerName(p) }) : t('yourCard');
      const title = document.createElement('h2');
      title.textContent = cardName(card);
      const text = document.createElement('p');
      text.textContent = cardText(card);
      item.append(owner, title, text);
      return item;
    }),
  );
  show('#magic-intro', true);
  $('#magic-intro-ok').focus();
}
$('#magic-intro-ok').addEventListener('click', () => {
  show('#magic-intro', false);
  $<HTMLButtonElement>('#card-use').focus();
});

// --- Turn flow --------------------------------------------------------------

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
    result.style.color = `var(--p${w + 1}-text)`;
  }
  // Viewer's score first, matching the HUD order.
  $('#final').textContent = viewer() === 0 ? `${a} : ${b}` : `${b} : ${a}`;
}

function showGameOver() {
  renderGameOver();
  const winner = localWinner();
  if (winner !== null) {
    sound.win();
    if (!reducedMotion()) confetti();
  } else if (state.winner === 'draw') sound.win();
  else sound.lose();
  announce(`${$('#result').textContent} ${$('#final').textContent}`);
  show('#again', !online);
  show('#rematch', !!online);
  $('#rematch').removeAttribute('disabled');
  $('#rematch').textContent = t('rematch');
  show('#rematch-note', false);
  recordFame(winner);
  // After the first finished game, invite players to try Magic mode next time.
  const offer = settings.variant === 'classic' && !localStorage.getItem(MAGIC_OFFERED_KEY);
  if (offer) localStorage.setItem(MAGIC_OFFERED_KEY, '1');
  show('#magic-offer', offer);
  show('#gameover', true);
  $<HTMLButtonElement>(offer ? '#magic-yes' : online ? '#rematch' : '#again').focus();
}

function recordFame(winner: Player | null) {
  const note = (key: StringKey | null) => {
    $('#fame-note').textContent = key ? t(key) : '';
    show('#fame-note', !!key);
  };
  note(null);
  if (winner === null) return;
  if (online) {
    // The server records online wins itself.
    if (online.names[winner].trim()) note('fameAdded');
  } else if (settings.mode === 'ai') {
    const name = settings.names[0].trim();
    if (!name) return note('fameNeedsName');
    void reportComputerWin(name, settings.difficulty).then((ok) => ok && note('fameAdded'));
  }
}

$('#magic-yes').addEventListener('click', () => {
  settings.variant = 'magic';
  saveSettings();
  show('#magic-offer', false);
  announce(t('magicOfferDone'));
  toast(t('magicOfferDone'), '#ffffff');
  $<HTMLButtonElement>(online ? '#rematch' : '#again').focus();
});
$('#magic-no').addEventListener('click', () => {
  show('#magic-offer', false);
  $<HTMLButtonElement>(online ? '#rematch' : '#again').focus();
});

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
  board.setBlocked(state.magic?.blocked ?? []);
  busy = false;
  updateHud();
  const score = t('announceScore', { a: state.board[STORE[viewer()]], b: state.board[STORE[other(viewer())]] });
  const events: string[] = [];
  if (result.unblocked !== null) events.push(t('blockBroken'));
  if (result.capture) {
    events.push(t('capture', { n: result.capture.count }));
    sound.capture(mover);
  } else if (result.extraTurn) {
    events.push(t('extraTurn'));
    sound.extraTurn();
  }
  if (result.passed !== null) events.push(t('turnPassed', { name: playerName(result.passed) }));
  if (events.length) toast(events.join(' '), PLAYER_COLORS[mover]);
  announce([...events, score].join(' '));
  return true;
}

function onPitClicked(pit: number) {
  if (busy || !isLocalTurn(state.current)) return;
  if (targeting) {
    if (blockTargets(state).includes(pit)) playCard('block', pit);
    return;
  }
  if (!legalMoves(state).includes(pit)) return;
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
    updateHud();
    return;
  }
  waitingOnOther = true;
  board.setActive(null);
  updateHud();
  if (!isComputer(state.current)) return; // online: wait for the opponent's move
  const current = game;
  // The computer may play its magic card first.
  if (state.magic?.cards[state.current]) {
    const [play] = await Promise.all([askComputer<CardPlay | null>('card', state), wait(500)]);
    if (current !== game) return;
    if (play && !(await animateCard(useCard(state, play.card, play.target)))) return;
    if (state.over) return void nextTurn();
  }
  // A short pause so the computer's move reads as a separate turn.
  const [pit] = await Promise.all([askComputer<number>('move', state), wait(700)]);
  if (current === game && (await animateMove(pit))) void nextTurn();
}

function startGame(initial: GameState, intro = true) {
  game++;
  waitingOnOther = false;
  targeting = false;
  moveQueue = Promise.resolve();
  state = initial;
  busy = false;
  board.setBoard(state.board);
  board.setBlocked(state.magic?.blocked ?? []);
  for (const id of ['#gameover', '#setup', '#invite', '#join']) show(id, false);
  updateHud();
  if (intro) showMagicIntro();
  void nextTurn();
}

function newLocalGame() {
  board.setViewer(0);
  startGame(createGame(4, 0, settings.variant === 'magic'));
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closePanels();
    if (targeting) stopTargeting();
    for (const id of ['#page', '#magic-intro']) if (!$(id).classList.contains('hidden')) id === '#page' ? closePage() : show(id, false);
    return;
  }
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (document.querySelector('.overlay:not(.hidden)')) return;
  // Camera: arrows rotate, +/- zoom, 0 resets.
  const camera: Record<string, () => void> = {
    ArrowLeft: () => board.orbit(-0.15, 0),
    ArrowRight: () => board.orbit(0.15, 0),
    ArrowUp: () => board.orbit(0, -0.1),
    ArrowDown: () => board.orbit(0, 0.1),
    '+': () => board.zoom(0.9),
    '=': () => board.zoom(0.9),
    '-': () => board.zoom(1.1),
    '0': () => board.resetCamera(),
  };
  if (camera[e.key]) {
    e.preventDefault();
    camera[e.key]();
    return;
  }
  // Number keys 1–6 play the current local player's pits in sowing order (or pick a Block target).
  const n = Number(e.key);
  if (n >= 1 && n <= 6 && isLocalTurn(state.current)) onPitClicked((targeting ? pitsOf(other(state.current)) : pitsOf(state.current))[n - 1]);
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
  return playerName(other(online?.me ?? 0));
}

/** Runs server events one after another, after any animation already playing. */
function enqueue(step: () => Promise<void>) {
  const current = game;
  moveQueue = moveQueue.then(async () => {
    if (current === game) await step();
  });
}

/** Trust the server if we ever drift from it. */
function reconcile(server: GameState) {
  if (JSON.stringify(state) === JSON.stringify(server)) return;
  state = server;
  board.setBoard(state.board);
  board.setBlocked(state.magic?.blocked ?? []);
  updateHud();
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
      showJoin(msg.open ? 'invited' : 'full', msg.hostName, msg.magic);
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
      startGame(msg.state, msg.reason !== 'resume');
      if (msg.reason === 'start') toast(t('joined', { name: opponentName() }), PLAYER_COLORS[msg.you]);
      break;
    case 'moved':
      enqueue(async () => {
        if (!(await animateMove(msg.pit))) return;
        reconcile(msg.state);
        await nextTurn();
      });
      break;
    case 'card-used':
      enqueue(async () => {
        if (!(await animateCard(useCard(state, msg.card, msg.target)))) return;
        reconcile(msg.state);
        await nextTurn();
      });
      break;
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
  announce(t('copied'));
  setTimeout(() => {
    button.textContent = t('copy');
    button.classList.remove('done');
  }, 1800);
}

function showJoin(kind: 'invited' | 'full' | 'gone' | 'offline', host = '', magic = false) {
  joinView = { kind, host, magic };
  renderJoin();
  $<HTMLInputElement>('#join-name').value = settings.names[0];
  for (const id of ['#setup', '#gameover', '#invite']) show(id, false);
  show('#join', true);
  if (kind === 'invited') $('#join-name').focus();
}

function renderJoin() {
  if (!joinView) return;
  const { kind, host, magic } = joinView;
  const keys: Record<typeof kind, StringKey> = {
    invited: 'joinInvited',
    full: 'joinFull',
    gone: 'joinGone',
    offline: 'joinOffline',
  };
  $('#join-lead').textContent = t(keys[kind], { host: host || t('aFriend') });
  show('#join-magic', kind === 'invited' && magic);
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
    const name = group.dataset.name as 'mode' | 'difficulty' | 'variant';
    const value = name === 'mode' ? mode : settings[name];
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
  targeting = false;
  joinView = null;
  leaveOnline();
  board.setActive(null);
  $<HTMLInputElement>('#name0').value = settings.names[0];
  $<HTMLInputElement>('#name1').value = settings.names[1];
  renderSetup();
  for (const id of ['#gameover', '#invite', '#join', '#magic-intro']) show(id, false);
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
    const key = group.dataset.name as 'mode' | 'difficulty' | 'variant';
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
    goOnline().client.send({ t: 'create', name: settings.names[0], magic: settings.variant === 'magic' });
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

const menuAction = (id: string, fn: () => void) =>
  $(id).addEventListener('click', () => {
    closePanels();
    fn();
  });
menuAction('#m-new', newLocalGame);
menuAction('#m-settings', openSetup);
menuAction('#m-camera', () => board.resetCamera());
menuAction('#m-fullscreen', () => void toggleFullscreen());
menuAction('#m-install', () => void install());

function renderPwa() {
  show('#m-fullscreen', canFullscreen());
  $('#m-fullscreen-label').textContent = t(isFullscreen() ? 'exitFullscreen' : 'fullscreen');
  show('#m-install', canInstall());
  // Going offline mid-setup hides online play; coming back restores it.
  if (!$('#setup').classList.contains('hidden')) renderSetup();
  if (joinView && !isOnline()) showJoin('offline');
  if (currentPage() === 'fame') void renderFame($('#page-body'));
}
onPwaChange(renderPwa);

// --- Display: theme and motion --------------------------------------------

function renderDisplay() {
  board.setTheme(isLight());
  board.setReducedMotion(reducedMotion());
  $<HTMLSelectElement>('#m-theme').value = themePref();
  $<HTMLInputElement>('#toggle-motion').checked = reducedMotion();
}
onDisplayChange(renderDisplay);
$('#m-theme').addEventListener('change', (e) => setTheme((e.target as HTMLSelectElement).value as ThemePref));
$('#toggle-motion').addEventListener('change', (e) => setReducedMotion((e.target as HTMLInputElement).checked));

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
  renderDisplay();
  updateHud();
  if (!$('#gameover').classList.contains('hidden')) renderGameOver();
  if (!$('#magic-intro').classList.contains('hidden')) showMagicIntro();
  if (bannerKey) banner(bannerKey);
  const page = currentPage();
  if (page) renderPage(page);
}
onLangChange(renderAll);

// --- Pages: wall of fame, how to play, terms, accessibility ------------------

type Page = PageId | 'fame';
const PAGE_IDS: Page[] = ['fame', 'rules', 'terms', 'accessibility'];
let pageReturnFocus: HTMLElement | null = null;

function currentPage(): Page | null {
  const id = location.hash.slice(1) as Page;
  return PAGE_IDS.includes(id) ? id : null;
}

function renderPage(id: Page) {
  $('#page-title').textContent = t(id);
  if (id === 'fame') void renderFame($('#page-body'));
  else $('#page-body').innerHTML = PAGES[getLang()][id];
}

function openPage(id: Page) {
  if ($('#page').classList.contains('hidden')) pageReturnFocus = document.activeElement as HTMLElement | null;
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
    const id = el.dataset.page as Page;
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

// New versions wait for the player's go-ahead instead of reloading mid-game.
const updateSW = registerSW({
  onNeedRefresh: () => show('#update', true),
});
$('#update-now').addEventListener('click', () => void updateSW(true));

// --- Start ------------------------------------------------------------------

board.setBoard(state.board);
renderAll();
void flushQueuedWins();

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
    __mancala: {
      pitScreen: (i: number) => board.screenPosition(i),
      state: () => state,
      setState: (s: GameState) => startGame(s, false),
      busy: () => busy,
      sound,
    },
  });
}

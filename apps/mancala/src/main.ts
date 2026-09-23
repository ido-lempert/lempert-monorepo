import './style.css';
import type { Difficulty } from './game/ai';
import { applyMove, createGame, type GameState, legalMoves, type Player, STORE } from './game/kalah';
import { Sound } from './audio/sound';
import { OnlineClient, savedToken } from './net/online';
import type { ServerMsg } from './net/protocol';
import { Board3D, PLAYER_COLORS } from './render/board3d';

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

const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'קל', medium: 'בינוני', hard: 'קשה' };
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

function playerName(p: Player): string {
  if (online) return online.names[p] || `שחקן ${p + 1}`;
  if (isComputer(p)) return `מחשב · ${DIFFICULTY_LABEL[settings.difficulty]}`;
  return settings.names[p].trim() || `שחקן ${p + 1}`;
}

function toast(text: string, color: string) {
  const el = $('#toast');
  el.textContent = text;
  el.style.color = color;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 1100);
}

function banner(text: string | null) {
  $('#banner').textContent = text ?? '';
  show('#banner', !!text);
}

function updateHud() {
  document.querySelectorAll<HTMLElement>('.player').forEach((el) => {
    const p = Number(el.dataset.player) as Player;
    const name = el.querySelector('.name')!;
    name.textContent = playerName(p);
    if (online?.me === p) name.insertAdjacentHTML('beforeend', ' <span class="you">(אני)</span>');
    el.querySelector('.score')!.textContent = String(state.board[STORE[p]]);
    el.classList.toggle('active', !state.over && state.current === p);
  });
  let turn = '';
  if (!state.over) {
    if (isComputer(state.current)) turn = 'המחשב חושב…';
    else if (online) turn = state.current === online.me ? 'התור שלך' : `ממתינים ל${playerName(state.current)}…`;
    else turn = `התור של ${playerName(state.current)}`;
  }
  $('#turn').textContent = turn;
  show('#restart', !online);
}

function showGameOver() {
  const [a, b] = [state.board[STORE[0]], state.board[STORE[1]]];
  const result = $('#result');
  if (state.winner === 'draw') {
    result.textContent = 'תיקו!';
    result.style.color = '';
  } else {
    const w = state.winner as Player;
    if (online) result.textContent = w === online.me ? 'ניצחת! 🎉' : `${playerName(w)} ניצח/ה!`;
    else result.textContent = isComputer(w) ? 'המחשב ניצח!' : `${playerName(w)} ניצח/ה!`;
    result.style.color = PLAYER_COLORS[w];
  }
  $('#final').textContent = `${a} : ${b}`;
  // Against a remote friend or the computer there is a "you"; on a shared device every result is someone's win.
  const me: Player | null = online ? online.me : settings.mode === 'ai' ? 0 : null;
  if (state.winner !== 'draw' && me !== null && state.winner !== me) sound.lose();
  else sound.win();
  show('#again', !online);
  show('#rematch', !!online);
  $('#rematch').removeAttribute('disabled');
  $('#rematch').textContent = 'משחק חוזר';
  show('#rematch-note', false);
  show('#gameover', true);
}

/** Animates a move, updates state and HUD. Used by every mode. */
async function animateMove(pit: number): Promise<boolean> {
  busy = true;
  board.setActive(null);
  const result = applyMove(state, pit);
  const mover = state.current;
  const current = game;
  await board.playMove(pit, result, mover);
  if (current !== game) return false;
  state = result.state;
  updateHud();
  if (result.capture) {
    toast(`לכידה! +${result.capture.count}`, PLAYER_COLORS[mover]);
    sound.capture(mover);
  } else if (result.extraTurn) {
    toast('תור נוסף!', PLAYER_COLORS[mover]);
    sound.extraTurn();
  }
  busy = false;
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
  updateHud();
  for (const id of ['#gameover', '#setup', '#invite', '#join']) show(id, false);
  void nextTurn();
}

function newLocalGame() {
  board.setViewer(0);
  startGame(createGame());
}

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
  if (location.search) history.replaceState(null, '', location.pathname);
}

function onConnection(connected: boolean) {
  if (!online) return;
  if (!connected) banner('החיבור לשרת נותק, מתחברים מחדש…');
  else if (online.peerConnected) banner(null);
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
      if (msg.reason === 'start') toast(`${playerName(msg.you === 0 ? 1 : 0)} הצטרף/ה!`, PLAYER_COLORS[msg.you]);
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
      banner(msg.connected ? null : `${playerName(o.me === 0 ? 1 : 0)} התנתק/ה – ממתינים שיחזור…`);
      break;
    case 'rematch-requested':
      $('#rematch-note').textContent = `${playerName(msg.by)} רוצה משחק חוזר!`;
      show('#rematch-note', true);
      break;
    case 'error':
      if (msg.code === 'not-found') showJoin('gone');
      else if (msg.code === 'full') showJoin('full');
      else if (msg.code === 'bad-move') nextTurn();
      break;
  }
}

function openInvite(room: string) {
  const url = roomUrl(room);
  $<HTMLInputElement>('#invite-link').value = url;
  const local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
  show('#invite-warn', local);
  show('#share-native', 'share' in navigator);
  for (const id of ['#setup', '#gameover', '#join']) show(id, false);
  show('#invite', true);
}

function inviteText(): string {
  const name = settings.names[0] || 'חבר';
  return `${name} מזמין/ה אותך למשחק מנקלה 🔥❄️`;
}

async function copyLink(url: string, button: HTMLElement) {
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const input = $<HTMLInputElement>('#invite-link');
    input.select();
    document.execCommand('copy');
  }
  button.textContent = 'הועתק ✓';
  button.classList.add('done');
  setTimeout(() => {
    button.textContent = 'העתקה';
    button.classList.remove('done');
  }, 1800);
}

function showJoin(kind: 'invited' | 'full' | 'gone', hostName = '') {
  const lead = $('#join-lead');
  if (kind === 'invited') lead.textContent = `${hostName || 'חבר'} מזמין/ה אותך לשחק מנקלה! איך קוראים לך?`;
  else if (kind === 'full') lead.textContent = 'המשחק הזה כבר התחיל עם שני שחקנים.';
  else lead.textContent = 'הקישור כבר לא בתוקף – אולי המשחק הסתיים.';
  show('#join-name-field', kind === 'invited');
  show('#join-submit', kind === 'invited');
  $<HTMLInputElement>('#join-name').value = settings.names[0];
  for (const id of ['#setup', '#gameover', '#invite']) show(id, false);
  show('#join', true);
  if (kind === 'invited') $('#join-name').focus();
}

// --- Setup screen ---------------------------------------------------------

function renderSetup() {
  document.querySelectorAll<HTMLElement>('.segmented').forEach((group) => {
    const value = settings[group.dataset.name as 'mode' | 'difficulty'];
    group.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.classList.toggle('selected', b.dataset.value === value);
    });
  });
  show('#difficulty-field', settings.mode === 'ai');
  show('#name1-field', settings.mode === 'pvp');
  $('#name0-label').lastChild!.textContent = settings.mode === 'online' ? ' השם שלך · אש 🔥' : ' שחקן 1 · אש 🔥';
  $('#start').textContent = settings.mode === 'online' ? 'יצירת משחק והזמנת חבר' : 'התחל משחק';
}

function openSetup() {
  game++; // cancel any running animation / computer turn
  busy = false;
  leaveOnline();
  board.setActive(null);
  $<HTMLInputElement>('#name0').value = settings.names[0];
  $<HTMLInputElement>('#name1').value = settings.names[1];
  renderSetup();
  for (const id of ['#gameover', '#invite', '#join']) show(id, false);
  show('#setup', true);
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
  navigator.share?.({ title: 'מנקלה', text: inviteText(), url: $<HTMLInputElement>('#invite-link').value }).catch(() => {});
});
$('#share-whatsapp').addEventListener('click', () => {
  const text = `${inviteText()}\n${$<HTMLInputElement>('#invite-link').value}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
});
$('#share-email').addEventListener('click', () => {
  const body = `${inviteText()}\n\n${$<HTMLInputElement>('#invite-link').value}`;
  location.href = `mailto:?subject=${encodeURIComponent('בוא/י לשחק מנקלה')}&body=${encodeURIComponent(body)}`;
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
  $('#rematch').textContent = `ממתינים ל${playerName(online?.me === 0 ? 1 : 0)}…`;
});
$('#settings').addEventListener('click', openSetup);
$('#to-settings').addEventListener('click', openSetup);
$('#camera').addEventListener('click', () => board.resetCamera());

function renderSound() {
  $<HTMLInputElement>('#toggle-music').checked = sound.prefs.music;
  $<HTMLInputElement>('#toggle-sfx').checked = sound.prefs.sfx;
  const silent = !sound.prefs.music && !sound.prefs.sfx;
  $('#sound').textContent = silent ? '🔇' : '🔊';
  $('#sound').classList.toggle('muted', silent);
}
$('#sound').addEventListener('click', (e) => {
  e.stopPropagation();
  const open = $('#sound-panel').classList.contains('hidden');
  show('#sound-panel', open);
  $('#sound').setAttribute('aria-expanded', String(open));
});
$('#sound-panel').addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('click', () => show('#sound-panel', false));
$('#toggle-music').addEventListener('change', (e) => {
  sound.setMusic((e.target as HTMLInputElement).checked);
  renderSound();
});
$('#toggle-sfx').addEventListener('change', (e) => {
  sound.setSfx((e.target as HTMLInputElement).checked);
  renderSound();
});
renderSound();

// The orbit hint fades after the first interaction with the board, or after a while.
const hideHint = () => $('#hint').classList.add('gone');
$('#stage').addEventListener('pointerdown', hideHint, { once: true });
setTimeout(hideHint, 12000);

board.setBoard(state.board);
updateHud();

// Opened from an invite link (or reloaded mid-game): join or resume that room.
const invitedRoom = new URLSearchParams(location.search).get('room');
if (invitedRoom) {
  const o = goOnline();
  o.room = invitedRoom;
  history.replaceState(null, '', roomUrl(invitedRoom));
  const token = savedToken(invitedRoom);
  if (token) o.client.resume(invitedRoom, token);
  else o.client.send({ t: 'peek', room: invitedRoom });
} else {
  openSetup();
}

if (import.meta.env.DEV) {
  // Hook for automated playtests: lets a script find pits on screen and read the game state.
  Object.assign(window, {
    __mancala: { pitScreen: (i: number) => board.screenPosition(i), state: () => state, busy: () => busy, sound },
  });
}

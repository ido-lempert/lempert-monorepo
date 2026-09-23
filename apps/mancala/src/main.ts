import './style.css';
import type { Difficulty } from './game/ai';
import { applyMove, createGame, type GameState, legalMoves, type Player, STORE } from './game/kalah';
import { Board3D, PLAYER_COLORS } from './render/board3d';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

interface Settings {
  mode: 'ai' | 'pvp';
  difficulty: Difficulty;
  names: [string, string];
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
let state: GameState = createGame();
let busy = false;
let game = 0;
let toastTimer = 0;

const board = new Board3D($('#stage'), (pit) => {
  if (!isComputer(state.current)) void play(pit);
});

const worker = new Worker(new URL('./game/ai.worker.ts', import.meta.url), { type: 'module' });
function computerMove(s: GameState): Promise<number> {
  return new Promise((resolve) => {
    worker.onmessage = (e: MessageEvent<number>) => resolve(e.data);
    worker.postMessage({ state: s, difficulty: settings.difficulty });
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isComputer(p: Player): boolean {
  return settings.mode === 'ai' && p === 1;
}

function playerName(p: Player): string {
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

function updateHud() {
  document.querySelectorAll<HTMLElement>('.player').forEach((el) => {
    const p = Number(el.dataset.player) as Player;
    el.querySelector('.name')!.textContent = playerName(p);
    el.querySelector('.score')!.textContent = String(state.board[STORE[p]]);
    el.classList.toggle('active', !state.over && state.current === p);
  });
  $('#turn').textContent = state.over
    ? ''
    : isComputer(state.current)
      ? 'המחשב חושב…'
      : `התור של ${playerName(state.current)}`;
}

function showGameOver() {
  const [a, b] = [state.board[STORE[0]], state.board[STORE[1]]];
  const result = $('#result');
  if (state.winner === 'draw') {
    result.textContent = 'תיקו!';
    result.style.color = '';
  } else {
    const w = state.winner as Player;
    result.textContent = isComputer(w) ? 'המחשב ניצח!' : `${playerName(w)} ניצח/ה!`;
    result.style.color = PLAYER_COLORS[w];
  }
  $('#final').textContent = `${a} : ${b}`;
  $('#gameover').classList.remove('hidden');
}

async function play(pit: number) {
  if (busy || !legalMoves(state).includes(pit)) return;
  busy = true;
  board.setActive(null);
  const result = applyMove(state, pit);
  const mover = state.current;
  const current = game;
  await board.playMove(pit, result, mover);
  if (current !== game) return;
  state = result.state;
  updateHud();
  if (result.capture) toast(`לכידה! +${result.capture.count}`, PLAYER_COLORS[mover]);
  else if (result.extraTurn) toast('תור נוסף!', PLAYER_COLORS[mover]);
  busy = false;
  void nextTurn();
}

async function nextTurn() {
  if (state.over) {
    showGameOver();
    return;
  }
  if (!isComputer(state.current)) {
    board.setActive(state.current, legalMoves(state));
    return;
  }
  board.setActive(null);
  const current = game;
  // A short pause so the computer's move reads as a separate turn.
  const [pit] = await Promise.all([computerMove(state), wait(700)]);
  if (current === game) await play(pit);
}

function newGame() {
  game++;
  state = createGame();
  busy = false;
  board.setBoard(state.board);
  updateHud();
  $('#gameover').classList.add('hidden');
  void nextTurn();
}

// --- Setup screen ---------------------------------------------------------

function renderSetup() {
  document.querySelectorAll<HTMLElement>('.segmented').forEach((group) => {
    const value = settings[group.dataset.name as 'mode' | 'difficulty'];
    group.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.classList.toggle('selected', b.dataset.value === value);
    });
  });
  $('#difficulty-field').classList.toggle('hidden', settings.mode !== 'ai');
  $('#name1-field').classList.toggle('hidden', settings.mode === 'ai');
}

function openSetup() {
  game++; // cancel any running animation / computer turn
  busy = false;
  board.setActive(null);
  $<HTMLInputElement>('#name0').value = settings.names[0];
  $<HTMLInputElement>('#name1').value = settings.names[1];
  renderSetup();
  $('#gameover').classList.add('hidden');
  $('#setup').classList.remove('hidden');
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
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  $('#setup').classList.add('hidden');
  newGame();
});

$('#restart').addEventListener('click', newGame);
$('#again').addEventListener('click', newGame);
$('#settings').addEventListener('click', openSetup);
$('#to-settings').addEventListener('click', openSetup);
$('#camera').addEventListener('click', () => board.resetCamera());

// The orbit hint fades after the first interaction with the board, or after a while.
const hideHint = () => $('#hint').classList.add('gone');
$('#stage').addEventListener('pointerdown', hideHint, { once: true });
setTimeout(hideHint, 12000);

board.setBoard(state.board);
updateHud();
openSetup();

if (import.meta.env.DEV) {
  // Hook for automated playtests: lets a script find pits on screen and read the game state.
  Object.assign(window, {
    __mancala: { pitScreen: (i: number) => board.screenPosition(i), state: () => state, busy: () => busy },
  });
}

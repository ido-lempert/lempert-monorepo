/**
 * Kalah rules (the most common Mancala variant): 6 pits per side, 4 stones per pit.
 *
 * Board indices, counter-clockwise:
 *   0..5   player 0 pits   6  player 0 store
 *   7..12  player 1 pits   13 player 1 store
 */
export type Player = 0 | 1;

export const PITS_PER_SIDE = 6;
export const BOARD_SIZE = 14;
export const STORE: Record<Player, number> = { 0: 6, 1: 13 };

export interface GameState {
  board: number[];
  current: Player;
  over: boolean;
  winner: Player | 'draw' | null;
}

export interface Capture {
  pit: number;
  opposite: number;
  store: number;
  count: number;
}

export interface Sweep {
  from: number;
  store: number;
  count: number;
}

export interface MoveResult {
  state: GameState;
  /** Container index each sown stone landed in, in order. */
  sown: number[];
  capture: Capture | null;
  extraTurn: boolean;
  /** End-of-game sweeps of remaining stones into their owner's store. */
  sweeps: Sweep[];
}

export function createGame(stonesPerPit = 4): GameState {
  const board = Array.from({ length: BOARD_SIZE }, (_, i) => (isStore(i) ? 0 : stonesPerPit));
  return { board, current: 0, over: false, winner: null };
}

export function isStore(i: number): boolean {
  return i === STORE[0] || i === STORE[1];
}

export function pitsOf(player: Player): number[] {
  const start = player === 0 ? 0 : 7;
  return Array.from({ length: PITS_PER_SIDE }, (_, i) => start + i);
}

export function ownerOf(i: number): Player {
  return i <= 6 ? 0 : 1;
}

export function oppositePit(i: number): number {
  return 12 - i;
}

export function legalMoves(state: GameState): number[] {
  if (state.over) return [];
  return pitsOf(state.current).filter((i) => state.board[i] > 0);
}

export function applyMove(state: GameState, pit: number): MoveResult {
  if (!legalMoves(state).includes(pit)) {
    throw new Error(`Illegal move ${pit} for player ${state.current}`);
  }
  const board = [...state.board];
  const player = state.current;
  const opponentStore = STORE[player === 0 ? 1 : 0];

  let hand = board[pit];
  board[pit] = 0;
  const sown: number[] = [];
  let i = pit;
  while (hand > 0) {
    i = (i + 1) % BOARD_SIZE;
    if (i === opponentStore) continue;
    board[i]++;
    hand--;
    sown.push(i);
  }

  const last = i;
  const extraTurn = last === STORE[player];

  let capture: Capture | null = null;
  if (!extraTurn && ownerOf(last) === player && board[last] === 1) {
    const opp = oppositePit(last);
    if (board[opp] > 0) {
      const count = board[opp] + 1;
      capture = { pit: last, opposite: opp, store: STORE[player], count };
      board[STORE[player]] += count;
      board[last] = 0;
      board[opp] = 0;
    }
  }

  const sweeps: Sweep[] = [];
  const sideEmpty = (p: Player) => pitsOf(p).every((j) => board[j] === 0);
  const over = sideEmpty(0) || sideEmpty(1);
  if (over) {
    for (const p of [0, 1] as Player[]) {
      for (const j of pitsOf(p)) {
        if (board[j] > 0) {
          sweeps.push({ from: j, store: STORE[p], count: board[j] });
          board[STORE[p]] += board[j];
          board[j] = 0;
        }
      }
    }
  }

  let winner: GameState['winner'] = null;
  if (over) {
    const a = board[STORE[0]];
    const b = board[STORE[1]];
    winner = a === b ? 'draw' : a > b ? 0 : 1;
  }

  const next: Player = over || extraTurn ? player : player === 0 ? 1 : 0;
  return {
    state: { board, current: next, over, winner },
    sown,
    capture,
    extraTurn: extraTurn && !over,
    sweeps,
  };
}

/**
 * Kalah rules (the most common Mancala variant): 6 pits per side, 4 stones per pit,
 * plus an optional "magic" mode where each player holds one card to play once per game.
 *
 * Board indices in sowing order (the 3D board lays them out clockwise, each store on its owner's left):
 *   0..5   player 0 pits   6  player 0 store
 *   7..12  player 1 pits   13 player 1 store
 */
export type Player = 0 | 1;

export const PITS_PER_SIDE = 6;
export const BOARD_SIZE = 14;
export const STORE: Record<Player, number> = { 0: 6, 1: 13 };

/**
 * Magic cards, each playable once per game on your turn before you move:
 *   block  – lock one of the opponent's pits so they cannot play it. Stones are still sown into it;
 *            the lock breaks when the last stone of any move lands in it.
 *   mirror – swap the stones of every pit with the pit facing it.
 */
export type Card = 'block' | 'mirror';
export const CARDS: Card[] = ['block', 'mirror'];

export interface Magic {
  /** Each player's card, or null once it has been played. */
  cards: [Card | null, Card | null];
  /** Pits locked by a Block card, and who locked them. */
  blocked: { pit: number; by: Player }[];
}

export interface GameState {
  board: number[];
  current: Player;
  over: boolean;
  winner: Player | 'draw' | null;
  /** Present only in magic mode. */
  magic?: Magic;
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
  /** A blocked pit that this move's last stone freed. */
  unblocked: number | null;
  /** A player who had stones only in blocked pits, so their turn was skipped. */
  passed: Player | null;
}

export interface CardResult {
  state: GameState;
  by: Player;
  card: Card;
  /** The pit locked by a Block card. */
  target: number | null;
  sweeps: Sweep[];
}

export function createGame(stonesPerPit = 4, first: Player = 0, magic = false, rng: () => number = Math.random): GameState {
  const board = Array.from({ length: BOARD_SIZE }, (_, i) => (isStore(i) ? 0 : stonesPerPit));
  const state: GameState = { board, current: first, over: false, winner: null };
  if (magic) {
    const deal = () => CARDS[Math.floor(rng() * CARDS.length)];
    state.magic = { cards: [deal(), deal()], blocked: [] };
  }
  return state;
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

const other = (p: Player): Player => (p === 0 ? 1 : 0);

export function isBlocked(state: GameState, pit: number): boolean {
  return !!state.magic?.blocked.some((b) => b.pit === pit);
}

function movesFor(state: GameState, player: Player): number[] {
  return pitsOf(player).filter((i) => state.board[i] > 0 && !isBlocked(state, i));
}

export function legalMoves(state: GameState): number[] {
  if (state.over) return [];
  return movesFor(state, state.current);
}

function cloneMagic(m: Magic | undefined): Magic | undefined {
  return m && { cards: [...m.cards], blocked: m.blocked.map((b) => ({ ...b })) };
}

/**
 * Ends the game if a side is empty – or if nobody can move because every remaining stone is locked –
 * sweeping what is left into each owner's store.
 */
function settle(state: GameState): Sweep[] {
  const { board } = state;
  const sideEmpty = (p: Player) => pitsOf(p).every((j) => board[j] === 0);
  // Only locked pits can leave both players without a move while stones remain.
  const stuck = !!state.magic?.blocked.length && movesFor(state, 0).length === 0 && movesFor(state, 1).length === 0;
  if (!sideEmpty(0) && !sideEmpty(1) && !stuck) return [];

  const sweeps: Sweep[] = [];
  for (const p of [0, 1] as Player[]) {
    for (const j of pitsOf(p)) {
      if (board[j] > 0) {
        sweeps.push({ from: j, store: STORE[p], count: board[j] });
        board[STORE[p]] += board[j];
        board[j] = 0;
      }
    }
  }
  const a = board[STORE[0]];
  const b = board[STORE[1]];
  state.over = true;
  state.winner = a === b ? 'draw' : a > b ? 0 : 1;
  if (state.magic) state.magic.blocked = [];
  return sweeps;
}

export function applyMove(state: GameState, pit: number): MoveResult {
  if (!legalMoves(state).includes(pit)) {
    throw new Error(`Illegal move ${pit} for player ${state.current}`);
  }
  const board = [...state.board];
  const player = state.current;
  const opponentStore = STORE[other(player)];
  const next: GameState = { board, current: player, over: false, winner: null, magic: cloneMagic(state.magic) };

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

  let unblocked: number | null = null;
  if (next.magic && isBlocked(next, last)) {
    next.magic.blocked = next.magic.blocked.filter((b) => b.pit !== last);
    unblocked = last;
  }

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

  const sweeps = settle(next);
  let passed: Player | null = null;
  if (!next.over) {
    next.current = extraTurn ? player : other(player);
    // Someone whose only stones are in locked pits sits this turn out.
    if (next.magic?.blocked.length && movesFor(next, next.current).length === 0) {
      passed = next.current;
      next.current = other(next.current);
    }
  }

  return { state: next, sown, capture, extraTurn: extraTurn && !next.over && passed === null, sweeps, unblocked, passed };
}

/** Whether `player` may play `card` now: it is theirs, unplayed, and it is their turn. */
export function canUseCard(state: GameState, card: Card): boolean {
  return !state.over && state.magic?.cards[state.current] === card;
}

/** Pits a Block card may target: the opponent's pits that hold stones and aren't already locked. */
export function blockTargets(state: GameState): number[] {
  return pitsOf(other(state.current)).filter((p) => state.board[p] > 0 && !isBlocked(state, p));
}

export function useCard(state: GameState, card: Card, target: number | null = null): CardResult {
  if (!canUseCard(state, card)) throw new Error(`Player ${state.current} cannot play ${card}`);
  if (card === 'block' && (target === null || !blockTargets(state).includes(target))) {
    throw new Error(`Cannot block pit ${target}`);
  }
  const by = state.current;
  const next: GameState = { ...state, board: [...state.board], magic: cloneMagic(state.magic)! };
  next.magic!.cards[by] = null;
  if (card === 'block') next.magic!.blocked.push({ pit: target!, by });
  else {
    for (const i of pitsOf(0)) {
      const j = oppositePit(i);
      [next.board[i], next.board[j]] = [next.board[j], next.board[i]];
    }
  }
  const sweeps = settle(next);
  return { state: next, by, card, target: card === 'block' ? target : null, sweeps };
}

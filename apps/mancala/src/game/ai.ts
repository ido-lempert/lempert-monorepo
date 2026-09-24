import { applyMove, blockTargets, type Card, type GameState, legalMoves, type Player, STORE, useCard } from './kalah';

export type Difficulty = 'easy' | 'medium' | 'hard';

/** Search depth (in moves, extra turns included) and how often the AI just plays randomly. */
const LEVELS: Record<Difficulty, { depth: number; randomness: number }> = {
  easy: { depth: 1, randomness: 0.5 },
  medium: { depth: 4, randomness: 0.1 },
  hard: { depth: 9, randomness: 0 },
};

function evaluate(s: GameState, me: Player): number {
  const diff = s.board[STORE[me]] - s.board[STORE[me === 0 ? 1 : 0]];
  if (s.over) return diff > 0 ? 1000 + diff : diff < 0 ? -1000 + diff : 0;
  return diff;
}

function search(s: GameState, depth: number, alpha: number, beta: number, me: Player): number {
  if (depth === 0 || s.over) return evaluate(s, me);
  const maximizing = s.current === me;
  let best = maximizing ? -Infinity : Infinity;
  for (const m of orderedMoves(s)) {
    const v = search(applyMove(s, m).state, depth - 1, alpha, beta, me);
    if (maximizing) {
      best = Math.max(best, v);
      alpha = Math.max(alpha, v);
    } else {
      best = Math.min(best, v);
      beta = Math.min(beta, v);
    }
    if (beta <= alpha) break;
  }
  return best;
}

/** Moves that end in the mover's own store (extra turn) first: they tend to be best, which speeds up pruning. */
function orderedMoves(s: GameState): number[] {
  const store = STORE[s.current];
  const moves = legalMoves(s);
  return moves.sort((a, b) => Number(b + s.board[b] === store) - Number(a + s.board[a] === store));
}

export function chooseMove(state: GameState, difficulty: Difficulty, rng: () => number = Math.random): number {
  const moves = legalMoves(state);
  const { depth, randomness } = LEVELS[difficulty];
  if (moves.length === 1 || rng() < randomness) return moves[Math.floor(rng() * moves.length)];

  const me = state.current;
  let bestValue = -Infinity;
  let best: number[] = [];
  for (const m of moves) {
    const v = search(applyMove(state, m).state, depth - 1, -Infinity, Infinity, me);
    if (v > bestValue) {
      bestValue = v;
      best = [m];
    } else if (v === bestValue) best.push(m);
  }
  return best[Math.floor(rng() * best.length)];
}

export interface CardPlay {
  card: Card;
  target: number | null;
}

/** Value of the position for `me` assuming the player to move plays their best move. */
function positionValue(s: GameState, depth: number, me: Player): number {
  if (s.over) return evaluate(s, me);
  return search(s, depth, -Infinity, Infinity, me);
}

/**
 * Decides whether to play the computer's magic card before moving this turn.
 * Easy plays it at a random moment; medium and hard play it only when a search shows a clear gain.
 */
export function chooseCardPlay(state: GameState, difficulty: Difficulty, rng: () => number = Math.random): CardPlay | null {
  const card = state.magic?.cards[state.current];
  if (!card || state.over) return null;
  const options: CardPlay[] =
    card === 'mirror' ? [{ card, target: null }] : blockTargets(state).map((target) => ({ card, target }));
  if (!options.length) return null;

  if (difficulty === 'easy') return rng() < 0.2 ? options[Math.floor(rng() * options.length)] : null;

  const depth = difficulty === 'hard' ? 6 : 3;
  const me = state.current;
  const without = positionValue(state, depth, me);
  let best: CardPlay | null = null;
  let bestValue = without + 2; // only worth it for a clear gain
  for (const option of options) {
    const v = positionValue(useCard(state, option.card, option.target).state, depth, me);
    if (v > bestValue) {
      bestValue = v;
      best = option;
    }
  }
  return best;
}

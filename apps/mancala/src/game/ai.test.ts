import { describe, expect, it } from 'vitest';
import { chooseCardPlay, chooseMove, type Difficulty } from './ai';
import { applyMove, createGame, type GameState, legalMoves, type Player, useCard } from './kalah';

type Agent = (s: GameState) => number;
const random: Agent = (s) => {
  const m = legalMoves(s);
  return m[Math.floor(Math.random() * m.length)];
};
const ai =
  (d: Difficulty): Agent =>
  (s) =>
    chooseMove(s, d);

function playGame(agents: Record<Player, Agent>): GameState['winner'] {
  let s = createGame();
  while (!s.over) s = applyMove(s, agents[s.current](s)).state;
  return s.winner;
}

function winRate(a: Agent, b: Agent, games: number): number {
  let wins = 0;
  for (let g = 0; g < games; g++) {
    // Alternate who starts so first-move advantage evens out.
    const aIs: Player = g % 2 === 0 ? 0 : 1;
    const winner = playGame(aIs === 0 ? { 0: a, 1: b } : { 0: b, 1: a });
    if (winner === aIs) wins++;
  }
  return wins / games;
}

describe('ai', () => {
  it('always returns a legal move', () => {
    let s = createGame();
    for (const d of ['easy', 'medium', 'hard'] as Difficulty[]) {
      expect(legalMoves(s)).toContain(chooseMove(s, d));
    }
    s = { board: [0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0], current: 0, over: false, winner: null };
    expect(chooseMove(s, 'hard')).toBe(5);
  });

  // Plays 30 full games, several with a deep search.
  it('gets stronger with difficulty', { timeout: 30_000 }, () => {
    expect(winRate(ai('medium'), random, 20)).toBeGreaterThanOrEqual(0.8);
    expect(winRate(ai('hard'), ai('easy'), 10)).toBeGreaterThanOrEqual(0.8);
  });

  it('thinks fast enough on hard', () => {
    const t = performance.now();
    chooseMove(createGame(), 'hard');
    expect(performance.now() - t).toBeLessThan(1500);
  });

  it('plays a mirror card when it clearly wins stones, and holds it otherwise', () => {
    const base = { current: 0 as const, over: false, winner: null };
    // Opponent's side is loaded and ours is nearly empty: mirroring is a big gain.
    const good: GameState = { ...base, board: [1, 0, 0, 0, 0, 0, 10, 9, 9, 9, 9, 9, 9, 10], magic: { cards: ['mirror', null], blocked: [] } };
    expect(chooseCardPlay(good, 'hard')).toEqual({ card: 'mirror', target: null });
    // Symmetric board: mirroring changes nothing, so keep the card.
    const even: GameState = { ...createGame(4, 0), magic: { cards: ['mirror', null], blocked: [] } };
    expect(chooseCardPlay(even, 'hard')).toBeNull();
  });

  it('only suggests legal card plays', () => {
    for (let g = 0; g < 20; g++) {
      let s = createGame(4, 0, true);
      while (!s.over) {
        const play = chooseCardPlay(s, g % 2 ? 'medium' : 'easy');
        if (play) s = useCard(s, play.card, play.target).state;
        if (s.over) break;
        s = applyMove(s, chooseMove(s, 'easy')).state;
      }
    }
  });
});

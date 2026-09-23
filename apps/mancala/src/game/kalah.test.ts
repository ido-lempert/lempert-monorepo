import { describe, expect, it } from 'vitest';
import { applyMove, createGame, type GameState, legalMoves } from './kalah';

const total = (s: GameState) => s.board.reduce((a, b) => a + b, 0);

describe('kalah', () => {
  it('starts with 4 stones in each pit and empty stores', () => {
    const s = createGame();
    expect(s.board).toEqual([4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0]);
    expect(legalMoves(s)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('sows counter-clockwise and grants an extra turn when landing in own store', () => {
    const r = applyMove(createGame(), 2);
    expect(r.sown).toEqual([3, 4, 5, 6]);
    expect(r.extraTurn).toBe(true);
    expect(r.state.current).toBe(0);
  });

  it('passes the turn otherwise', () => {
    const r = applyMove(createGame(), 0);
    expect(r.state.current).toBe(1);
    expect(r.extraTurn).toBe(false);
  });

  it("skips the opponent's store", () => {
    const s: GameState = {
      board: [0, 0, 0, 0, 0, 10, 0, 1, 1, 1, 1, 1, 1, 0],
      current: 0,
      over: false,
      winner: null,
    };
    const r = applyMove(s, 5);
    expect(r.sown).not.toContain(13);
    expect(r.sown).toEqual([6, 7, 8, 9, 10, 11, 12, 0, 1, 2]);
  });

  it('captures when the last stone lands in an own empty pit opposite a non-empty pit', () => {
    const s: GameState = {
      board: [1, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 5, 1, 0],
      current: 0,
      over: false,
      winner: null,
    };
    const r = applyMove(s, 0);
    expect(r.capture).toEqual({ pit: 1, opposite: 11, store: 6, count: 6 });
    expect(r.state.board[6]).toBe(6);
    expect(r.state.board[1]).toBe(0);
    expect(r.state.board[11]).toBe(0);
    expect(total(r.state)).toBe(total(s));
  });

  it('ends the game and sweeps remaining stones when a side is empty', () => {
    const s: GameState = {
      board: [0, 0, 0, 0, 0, 1, 20, 1, 2, 0, 0, 0, 0, 10],
      current: 0,
      over: false,
      winner: null,
    };
    const r = applyMove(s, 5);
    expect(r.state.over).toBe(true);
    expect(r.sweeps).toEqual([
      { from: 7, store: 13, count: 1 },
      { from: 8, store: 13, count: 2 },
    ]);
    expect(r.state.board[6]).toBe(21);
    expect(r.state.board[13]).toBe(13);
    expect(r.state.winner).toBe(0);
  });

  it('does not capture when the opposite pit is empty', () => {
    const s: GameState = {
      board: [1, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0],
      current: 0,
      over: false,
      winner: null,
    };
    const r = applyMove(s, 0);
    expect(r.capture).toBeNull();
    expect(r.state.board[1]).toBe(1);
    expect(r.state.current).toBe(1);
  });

  it("does not capture when the last stone lands in an empty pit on the opponent's side", () => {
    const s: GameState = {
      board: [1, 0, 0, 0, 0, 3, 0, 1, 0, 1, 1, 1, 1, 0],
      current: 0,
      over: false,
      winner: null,
    };
    const r = applyMove(s, 5); // 6, 7, 8 → last in player 1's empty pit 8
    expect(r.sown).toEqual([6, 7, 8]);
    expect(r.capture).toBeNull();
    expect(r.state.board[8]).toBe(1);
  });

  it('lets player 2 capture and use their own store', () => {
    const s: GameState = {
      board: [1, 1, 5, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0],
      current: 1,
      over: false,
      winner: null,
    };
    const r = applyMove(s, 10); // lands in 11, empty, opposite is pit 1
    expect(r.capture).toEqual({ pit: 11, opposite: 1, store: 13, count: 2 });
    const r2 = applyMove({ ...s, board: [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 0] }, 12);
    expect(r2.sown).toEqual([13]);
    expect(r2.extraTurn).toBe(false); // player 2's side is now empty: game over
    expect(r2.state.over).toBe(true);
  });

  it('captures in the starting pit after a full lap of 13 stones', () => {
    const s: GameState = {
      board: [13, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0],
      current: 0,
      over: false,
      winner: null,
    };
    const r = applyMove(s, 0);
    expect(r.sown).toHaveLength(13);
    expect(r.sown.at(-1)).toBe(0);
    // Pit 0 was emptied and receives the 13th stone; opposite pit 12 has 1 + 1 sown.
    expect(r.capture).toEqual({ pit: 0, opposite: 12, store: 6, count: 3 });
  });

  it('conserves stones across a full random game', () => {
    let s = createGame();
    for (let n = 0; n < 500 && !s.over; n++) {
      const moves = legalMoves(s);
      s = applyMove(s, moves[Math.floor(Math.random() * moves.length)]).state;
      expect(total(s)).toBe(48);
    }
    expect(s.over).toBe(true);
  });
});

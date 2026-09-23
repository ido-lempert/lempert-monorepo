import type { GameState, Player } from '../game/kalah.ts';

/** Messages from a browser to the game server. */
export type ClientMsg =
  | { t: 'create'; name: string }
  /** Ask who is hosting a room before joining it (to greet the invited player). */
  | { t: 'peek'; room: string }
  | { t: 'join'; room: string; name: string }
  /** Reconnect to a seat after a reload or a dropped connection. */
  | { t: 'resume'; room: string; token: string }
  | { t: 'move'; pit: number }
  | { t: 'rematch' };

export type ErrorCode = 'not-found' | 'full' | 'bad-move' | 'not-in-room' | 'bad-request';

/** Messages from the game server to a browser. */
export type ServerMsg =
  | { t: 'created'; room: string; token: string }
  | { t: 'room'; room: string; hostName: string; open: boolean }
  /** Full game snapshot: sent when a game starts, on rematch, and on resume. */
  | {
      t: 'sync';
      room: string;
      token: string;
      you: Player;
      names: [string, string | null];
      state: GameState | null;
      reason: 'start' | 'rematch' | 'resume';
    }
  | { t: 'moved'; pit: number; by: Player; state: GameState }
  | { t: 'peer'; connected: boolean }
  | { t: 'rematch-requested'; by: Player }
  | { t: 'error'; code: ErrorCode };

export const WS_PATH = '/ws';

import { chooseCardPlay, chooseMove, type Difficulty } from './ai';
import type { GameState } from './kalah';

export type AiRequest = { kind: 'move' | 'card'; state: GameState; difficulty: Difficulty };

// Runs the search off the main thread so animations stay smooth while the computer thinks.
self.onmessage = (e: MessageEvent<AiRequest>) => {
  const { kind, state, difficulty } = e.data;
  self.postMessage(kind === 'card' ? chooseCardPlay(state, difficulty) : chooseMove(state, difficulty));
};

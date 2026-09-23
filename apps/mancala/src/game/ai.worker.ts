import { chooseMove, type Difficulty } from './ai';
import type { GameState } from './kalah';

// Runs the search off the main thread so animations stay smooth while the computer thinks.
self.onmessage = (e: MessageEvent<{ state: GameState; difficulty: Difficulty }>) => {
  self.postMessage(chooseMove(e.data.state, e.data.difficulty));
};

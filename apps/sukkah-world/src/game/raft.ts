/**
 * Moses' raft ride: the current carries the raft down the river while the player steers left and right to
 * pick up floating water jugs and dodge rocks. Positions along the river are (s, offset): s is metres
 * downstream, offset is metres from the middle of the river. Pure simulation; the world draws it.
 */

export interface RiverThing {
  s: number;
  offset: number;
}

export interface Raft {
  s: number;
  offset: number;
  speed: number;
  /** Seconds left of the slow-down after hitting a rock. */
  bump: number;
  /** Jugs picked up and rocks hit during this ride (by index). */
  jugs: number[];
  rocks: number[];
  over: boolean;
}

export interface RaftEvent {
  type: 'jug' | 'rock';
  index: number;
}

export const RIVER_LENGTH = 62;
export const RIVER_HALF_WIDTH = 2.4;
export const RAFT_HALF_WIDTH = 0.7;
export const CURRENT = 3.3;
export const STEER_SPEED = 2.8;
export const BUMP_SECONDS = 0.8;
export const TOUCH = 1;

export const JUG_SPOTS: RiverThing[] = [
  { s: 10, offset: 1.1 },
  { s: 20, offset: -1.2 },
  { s: 31, offset: 0.3 },
  { s: 42, offset: 1.4 },
  { s: 53, offset: -0.9 },
];

export const ROCKS: RiverThing[] = [
  { s: 15, offset: -0.2 },
  { s: 25, offset: 0.9 },
  { s: 36, offset: -1 },
  { s: 47, offset: 0.2 },
];

export function startRaft(): Raft {
  return { s: 0, offset: 0, speed: CURRENT, bump: 0, jugs: [], rocks: [], over: false };
}

/**
 * Advances the ride by `dt` seconds (mutates `raft`). `steer` is −1..1 (towards negative / positive
 * offset); `skip` lists jugs already collected on earlier rides, which are not in the river any more.
 */
export function stepRaft(raft: Raft, dt: number, steer: number, skip: number[] = []): RaftEvent[] {
  if (raft.over) return [];
  const events: RaftEvent[] = [];
  raft.bump = Math.max(0, raft.bump - dt);
  // Hitting a rock slows the raft for a moment, then the current picks it up again.
  raft.speed = raft.bump > 0 ? CURRENT * 0.35 : Math.min(CURRENT, raft.speed + dt * 2);
  raft.s = Math.min(RIVER_LENGTH, raft.s + raft.speed * dt);
  const limit = RIVER_HALF_WIDTH - RAFT_HALF_WIDTH;
  raft.offset = Math.max(-limit, Math.min(limit, raft.offset + Math.max(-1, Math.min(1, steer)) * STEER_SPEED * dt));

  const near = (t: RiverThing) => Math.hypot(t.s - raft.s, t.offset - raft.offset) <= TOUCH;
  JUG_SPOTS.forEach((j, i) => {
    if (!skip.includes(i) && !raft.jugs.includes(i) && near(j)) {
      raft.jugs.push(i);
      events.push({ type: 'jug', index: i });
    }
  });
  ROCKS.forEach((r, i) => {
    if (!raft.rocks.includes(i) && near(r)) {
      raft.rocks.push(i);
      raft.bump = BUMP_SECONDS;
      // The rock nudges the raft aside.
      raft.offset += raft.offset >= r.offset ? 0.6 : -0.6;
      raft.offset = Math.max(-limit, Math.min(limit, raft.offset));
      events.push({ type: 'rock', index: i });
    }
  });
  if (raft.s >= RIVER_LENGTH) raft.over = true;
  return events;
}

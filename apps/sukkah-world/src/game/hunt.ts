/**
 * Etrog Hunt: etrogim are scattered around the village and the player races a computer rival to collect
 * them before time runs out. Pure simulation: the world renders it and feeds in the player's position.
 */

export interface Vec {
  x: number;
  z: number;
}

export type Collector = 'me' | 'rival';

export interface Etrog extends Vec {
  takenBy: Collector | null;
}

export interface Rival extends Vec {
  /** Index of the etrog the rival is heading for, or -1. */
  target: number;
  /** Seconds left of the little pause after each catch – keeps the computer beatable. */
  rest: number;
  heading: number;
  /** Seconds spent blocked by a wall; the rival gives up on that etrog after a moment. */
  stuck: number;
  /** An etrog the rival couldn't reach, skipped for its next pick. */
  skip: number;
}

export interface Hunt {
  etrogs: Etrog[];
  rival: Rival;
  timeLeft: number;
  mine: number;
  rivals: number;
  over: boolean;
}

export interface HuntEvent {
  type: 'collect';
  by: Collector;
  index: number;
}

export const HUNT_SECONDS = 60;
export const HUNT_ETROGS = 12;
export const PICK_RADIUS = 1.3;
export const RIVAL_SPEED = 3.4;
export const RIVAL_REST = 1.2;

/** Picks `count` spots at least `minGap` apart from the candidates, using the given random source. */
export function pickSpots(candidates: Vec[], count: number, random: () => number, minGap = 4): Vec[] {
  const pool = [...candidates];
  const chosen: Vec[] = [];
  while (chosen.length < count && pool.length) {
    const [spot] = pool.splice(Math.floor(random() * pool.length), 1);
    if (chosen.every((c) => Math.hypot(c.x - spot.x, c.z - spot.z) >= minGap)) chosen.push(spot);
  }
  return chosen;
}

export function createHunt(spots: Vec[], rivalStart: Vec): Hunt {
  return {
    etrogs: spots.map((s) => ({ x: s.x, z: s.z, takenBy: null })),
    rival: { ...rivalStart, target: -1, rest: 0, heading: 0, stuck: 0, skip: -1 },
    timeLeft: HUNT_SECONDS,
    mine: 0,
    rivals: 0,
    over: false,
  };
}

function nearestFree(h: Hunt, from: Vec, skip = -1): number {
  let best = -1;
  let bestD = Infinity;
  h.etrogs.forEach((e, i) => {
    if (e.takenBy || i === skip) return;
    const d = Math.hypot(e.x - from.x, e.z - from.z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/**
 * Advances the hunt by `dt` seconds (mutates `h`). `resolve` lets the world push the rival out of
 * buildings; it gets the desired position and returns the allowed one.
 */
export function stepHunt(h: Hunt, dt: number, player: Vec, resolve: (p: Vec) => Vec = (p) => p): HuntEvent[] {
  if (h.over) return [];
  const events: HuntEvent[] = [];
  const collect = (i: number, by: Collector) => {
    h.etrogs[i].takenBy = by;
    if (by === 'me') h.mine++;
    else h.rivals++;
    events.push({ type: 'collect', by, index: i });
  };

  // The player gets first pick when both arrive in the same frame.
  h.etrogs.forEach((e, i) => {
    if (!e.takenBy && Math.hypot(e.x - player.x, e.z - player.z) <= PICK_RADIUS) collect(i, 'me');
  });

  const r = h.rival;
  if (r.rest > 0) r.rest = Math.max(0, r.rest - dt);
  else {
    if (r.target < 0 || h.etrogs[r.target].takenBy) {
      r.target = nearestFree(h, r, r.skip);
      if (r.target < 0) r.target = nearestFree(h, r);
    }
    if (r.target >= 0) {
      const t = h.etrogs[r.target];
      const dx = t.x - r.x;
      const dz = t.z - r.z;
      const d = Math.hypot(dx, dz);
      const step = Math.min(d, RIVAL_SPEED * dt);
      if (d > 0) {
        r.heading = Math.atan2(dx, dz);
        const next = resolve({ x: r.x + (dx / d) * step, z: r.z + (dz / d) * step });
        const moved = Math.hypot(next.x - r.x, next.z - r.z);
        r.x = next.x;
        r.z = next.z;
        r.stuck = moved < step * 0.3 ? r.stuck + dt : 0;
        if (r.stuck > 0.6) {
          r.skip = r.target;
          r.target = -1;
          r.stuck = 0;
        }
      }
      if (r.target >= 0 && Math.hypot(t.x - r.x, t.z - r.z) <= PICK_RADIUS) {
        collect(r.target, 'rival');
        r.target = -1;
        r.skip = -1;
        r.rest = RIVAL_REST;
      }
    }
  }

  h.timeLeft = Math.max(0, h.timeLeft - dt);
  if (h.timeLeft === 0 || h.etrogs.every((e) => e.takenBy)) h.over = true;
  return events;
}

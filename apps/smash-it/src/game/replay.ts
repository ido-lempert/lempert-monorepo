/**
 * The end-of-chapter slow-motion replay. Instead of recording every frame, each great shot is staged
 * again: the same food is thrown with the same velocity (flights are deterministic), and every bug it hit
 * walks in a straight line so it reaches the spot where it was hit at the moment it was hit.
 */
import { Arena, type ShotRecord } from './arena';
import { FOODS } from './foods';
import type { Level } from './levels';

/** The best shots of a play, best first (only shots that hit something). */
export function bestShots(arena: Arena, count = 3): ShotRecord[] {
  return [...arena.records.values()]
    .filter((r) => r.hits.length > 0)
    .sort((a, b) => arena.session.pointsOf(b.shotId) - arena.session.pointsOf(a.shotId) || b.hits.length - a.hits.length)
    .slice(0, count);
}

/** A scripted arena that plays one recorded shot again. */
export function stage(level: Level, rec: ShotRecord): Arena {
  const arena = new Arena({ ...level, obstacles: level.obstacles }, { scripted: true, seed: rec.shotId });
  for (const h of rec.hits) {
    const b = arena.addBug(h.kind, h.x - h.vx * h.after, h.z - h.vz * h.after, Math.atan2(h.vx, h.vz), h.boss);
    if (h.hp) b.hp = h.hp;
    b.state = 'walk';
    b.y = h.y;
    b.age = h.age - h.after;
    b.script = { vx: h.vx, vz: h.vz };
  }
  arena.launch(FOODS[rec.food], { ...rec.origin }, { ...rec.velocity }, rec.shotId);
  return arena;
}

/** How long to show a staged shot: the flight, the last hit and a moment to watch the bugs land. */
export function stageLength(rec: ShotRecord): number {
  const last = Math.max(0, ...rec.hits.map((h) => h.after));
  return last + 1.4;
}

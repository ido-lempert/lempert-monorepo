/**
 * The bugs: what each kind is like (size, speed, value, how it moves) and how one moves around the disc.
 * Small means hard to hit, fast means hard to follow, and the harder a bug is the more points it is worth.
 */
import { COUNTER_Y, field, groundAt } from './physics';
import type { Rng } from './rng';

export type BugKind = 'snail' | 'ladybug' | 'ant' | 'beetle' | 'butterfly' | 'fly' | 'golden' | 'king';

/**
 * - wander: drifts about, turning smoothly
 * - zigzag: changes direction sharply and often
 * - dart: stops, then dashes
 * - hide: wanders, and keeps ducking under mushrooms where food can't reach it
 * - march: walks in a line around a ring (ant trains)
 */
export type Move = 'wander' | 'zigzag' | 'dart' | 'hide' | 'march';

export interface BugDef {
  kind: BugKind;
  emoji: string;
  /** Hit radius. */
  radius: number;
  /** Walking speed (units per second). */
  speed: number;
  value: number;
  move: Move;
  /** Flying bugs hover at this height. */
  hover?: number;
  /** Shows up now and then, extends the combo and runs away if not hit in time. */
  rare?: boolean;
}

export const BUGS: Record<BugKind, BugDef> = {
  snail: { kind: 'snail', emoji: '🐌', radius: 0.75, speed: 0.45, value: 30, move: 'wander' },
  ladybug: { kind: 'ladybug', emoji: '🐞', radius: 0.6, speed: 1, value: 50, move: 'wander' },
  ant: { kind: 'ant', emoji: '🐜', radius: 0.38, speed: 2.1, value: 100, move: 'wander' },
  beetle: { kind: 'beetle', emoji: '🪲', radius: 0.55, speed: 1.4, value: 120, move: 'hide' },
  butterfly: { kind: 'butterfly', emoji: '🦋', radius: 0.55, speed: 2.3, value: 150, move: 'zigzag', hover: 1.3 },
  fly: { kind: 'fly', emoji: '🪰', radius: 0.32, speed: 3.6, value: 300, move: 'dart', hover: 0.9 },
  golden: { kind: 'golden', emoji: '✨', radius: 0.42, speed: 2.8, value: 500, move: 'zigzag', rare: true },
  /** A boss: big, takes several hits (value is per hit); its size, speed and tricks come from the level. */
  king: { kind: 'king', emoji: '👑', radius: 1.1, speed: 0.7, value: 150, move: 'wander' },
};

/**
 * A king: a big crowned bug that takes `hp` hits. Some call in helpers, some pull into their shell now and
 * then (no damage meanwhile), and some only feel heavy food (`armor`: the least `knock` that hurts).
 */
export interface BossDef {
  /** Which bug it is a king of (its look and voice). */
  look: Exclude<BugKind, 'king' | 'golden'>;
  hp: number;
  radius: number;
  speed: number;
  summon?: { kind: BugKind; every: number; count: number };
  shell?: { every: number; time: number };
  armor?: number;
}

/** Small bugs, for goals like "hit 3 small bugs". */
export const isSmall = (k: BugKind) => BUGS[k].radius < 0.4;

/**
 * - enter: just arrived over the edge
 * - walk: moving about (also flying, for flyers)
 * - hidden: under a mushroom, can't be hit
 * - knocked: thrown through the air by a hit
 * - dazed: landed on its back, dizzy (stays until the mop comes)
 * - leaving: running off the edge (a rare bug that wasn't caught)
 * - gone: removed
 */
export type BugState = 'enter' | 'walk' | 'hidden' | 'knocked' | 'dazed' | 'leaving' | 'gone';

/**
 * Things on the world that food can't go through: mushrooms (bugs hide under the cap), cups, sugar cubes,
 * and fences (a straight wall `length` long, turned by `angle`; `radius` is half its thickness).
 */
export interface Obstacle {
  kind: 'mushroom' | 'cup' | 'cube' | 'fence';
  x: number;
  z: number;
  radius: number;
  height: number;
  length?: number;
  angle?: number;
}

/**
 * How far a point is outside an obstacle's footprint (negative inside), and which way is out. `stem`: for
 * mushrooms, only the stem counts (bugs walk under the cap).
 */
export function footprint(o: Obstacle, x: number, z: number, stem = false): { d: number; nx: number; nz: number } {
  let cx = o.x;
  let cz = o.z;
  if (o.kind === 'fence') {
    const ux = Math.cos(o.angle ?? 0);
    const uz = Math.sin(o.angle ?? 0);
    const half = (o.length ?? 2) / 2;
    const along = Math.max(-half, Math.min(half, (x - o.x) * ux + (z - o.z) * uz));
    cx = o.x + ux * along;
    cz = o.z + uz * along;
  }
  const dx = x - cx;
  const dz = z - cz;
  const d = Math.hypot(dx, dz) || 0.0001;
  const r = o.kind === 'mushroom' && stem ? o.radius * 0.45 : o.radius;
  return { d: d - r, nx: dx / d, nz: dz / d };
}

export interface Bug {
  id: number;
  kind: BugKind;
  def: BugDef;
  x: number;
  y: number;
  z: number;
  /** Facing: (sin h, cos h) on x/z. */
  heading: number;
  /** Current speed. */
  speed: number;
  state: BugState;
  /** Seconds in the current state. */
  t: number;
  /** Seconds since it appeared (animation phase too). */
  age: number;
  // Movement
  turn: number;
  nextTurn: number;
  dashing: boolean;
  hideTarget: number;
  nextHide: number;
  march?: { radius: number; angle: number; dir: 1 | -1 };
  /** Replay: walks in a straight line at this velocity. */
  script?: { vx: number; vz: number };
  /** Stays near this spot (bugs guarding a place behind a fence). */
  home?: { x: number; z: number; r: number };
  /** Kings only. */
  boss?: BossDef;
  hp: number;
  /** Seconds left of being pushed back by a hit (kings stagger instead of flying). */
  hurt: number;
  /** Seconds until the next helper / shell. */
  summonIn: number;
  shellIn: number;
  /** Seconds left inside the shell (no damage). */
  shelled: number;
  // Being thrown
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  tumble: number;
}

export function makeBug(id: number, kind: BugKind, x: number, z: number, heading: number, rng: Rng, boss?: BossDef): Bug {
  const def = boss ? { ...BUGS.king, radius: boss.radius, speed: boss.speed, hover: BUGS[boss.look].hover ? 1.8 : undefined } : BUGS[kind];
  return {
    boss, hp: boss?.hp ?? 1, hurt: 0,
    summonIn: boss?.summon?.every ?? Infinity,
    shellIn: boss?.shell?.every ?? Infinity,
    shelled: 0,
    id, kind, def, x, z, heading,
    y: def.hover ? def.hover + 2 : groundAt(x, z),
    speed: def.speed, state: 'enter', t: 0, age: rng() * 10,
    turn: 0, nextTurn: 0.5 + rng(), dashing: false, hideTarget: -1, nextHide: 2 + rng() * 3,
    vx: 0, vy: 0, vz: 0, spin: 0, tumble: 0,
  };
}

/** Can food hit it right now? */
export function hittable(b: Bug): boolean {
  // A king that was just hit can't be hit again for a moment (one throw, one heart).
  if (b.boss && b.hurt > 0.3) return false;
  return b.state === 'enter' || b.state === 'walk' || b.state === 'leaving';
}

/** Still running about (counts towards how many bugs are on the disc). */
export function active(b: Bug): boolean {
  return b.state === 'enter' || b.state === 'walk' || b.state === 'hidden' || b.state === 'leaving';
}

const GRAVITY = 20;
const TAU = Math.PI * 2;

function setState(b: Bug, s: BugState) {
  b.state = s;
  b.t = 0;
}

/** Turns the heading towards an angle, at most `rate` radians. */
function steer(b: Bug, target: number, rate: number) {
  let d = (target - b.heading) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  b.heading += Math.max(-rate, Math.min(rate, d));
}

export interface MoveContext {
  obstacles: readonly Obstacle[];
  /** Level-wide speed multiplier. */
  pace: number;
}

export function moveBug(b: Bug, dt: number, rng: Rng, ctx: MoveContext) {
  b.t += dt;
  b.age += dt;
  switch (b.state) {
    case 'knocked':
      return fly(b, dt);
    case 'dazed':
    case 'gone':
      return;
    case 'hidden':
      if (b.t > 2.2 + (b.id % 3) * 0.5) {
        setState(b, 'walk');
        b.heading += Math.PI;
        b.nextHide = 4 + rng() * 3;
      }
      return;
  }

  const def = b.def;
  const base = def.speed * ctx.pace;
  if (b.boss) {
    // Kings: pushed back after a hit, and now and then hide in their shell.
    b.shellIn -= dt;
    if (b.shelled > 0) b.shelled = Math.max(0, b.shelled - dt);
    else if (b.shellIn <= 0 && b.boss.shell) {
      b.shelled = b.boss.shell.time;
      b.shellIn = b.boss.shell.every;
    }
    if (b.hurt > 0) {
      b.hurt = Math.max(0, b.hurt - dt);
      b.x += b.vx * dt * (b.hurt / 0.6);
      b.z += b.vz * dt * (b.hurt / 0.6);
      keepOnDisc(b, dt);
      return;
    }
    if (b.shelled > 0) {
      b.speed = 0;
      return;
    }
  }
  if (b.script) {
    b.x += b.script.vx * dt;
    b.z += b.script.vz * dt;
    b.speed = Math.hypot(b.script.vx, b.script.vz);
    if (b.speed > 0.01) b.heading = Math.atan2(b.script.vx, b.script.vz);
    hover(b);
    return;
  }

  if (b.state === 'enter' && b.t > 0.8) setState(b, 'walk');
  if (b.state === 'leaving') {
    // Head straight out over the edge, then vanish.
    steer(b, Math.atan2(b.x, b.z), 4 * dt);
    b.speed = base * 1.4;
  } else if (b.march) {
    const m = b.march;
    m.angle += (m.dir * base * dt) / m.radius;
    const nx = Math.cos(m.angle) * m.radius;
    const nz = Math.sin(m.angle) * m.radius;
    if (b.state === 'enter') {
      // Walk from the edge onto the ring first.
      b.x += (nx - b.x) * Math.min(1, dt * 3);
      b.z += (nz - b.z) * Math.min(1, dt * 3);
    } else {
      b.x = nx;
      b.z = nz;
    }
    b.heading = Math.atan2(-Math.sin(m.angle) * m.dir, Math.cos(m.angle) * m.dir);
    b.speed = base;
    hover(b);
    return;
  } else {
    wander(b, dt, rng, base, ctx);
    if ((b.state as BugState) === 'hidden') return;
  }

  b.x += Math.sin(b.heading) * b.speed * dt;
  b.z += Math.cos(b.heading) * b.speed * dt;

  if (b.state === 'leaving') {
    if (Math.hypot(b.x, b.z) > field.radius + 0.8) setState(b, 'gone');
  } else {
    keepOnDisc(b, dt);
    if (!def.hover) avoid(b, ctx.obstacles);
  }
  hover(b);
}

function wander(b: Bug, dt: number, rng: Rng, base: number, ctx: MoveContext) {
  b.nextTurn -= dt;
  switch (b.def.move) {
    case 'zigzag':
      b.speed = base;
      if (b.nextTurn <= 0) {
        b.heading += (rng() < 0.5 ? -1 : 1) * (1 + rng() * 1.3);
        b.nextTurn = 0.5 + rng() * 0.7;
      }
      break;
    case 'dart':
      if (b.nextTurn <= 0) {
        b.dashing = !b.dashing;
        b.nextTurn = b.dashing ? 0.35 + rng() * 0.35 : 0.4 + rng() * 0.6;
        if (b.dashing) b.heading += (rng() - 0.5) * 3;
      }
      b.speed = b.dashing ? base * 1.7 : base * 0.08;
      break;
    case 'hide': {
      b.speed = base;
      b.nextHide -= dt;
      const covers = ctx.obstacles.filter((o) => o.kind === 'mushroom');
      if (b.hideTarget < 0 && b.nextHide <= 0 && covers.length && b.state === 'walk') {
        // The nearest mushroom.
        let best = -1;
        let bestD = Infinity;
        ctx.obstacles.forEach((o, i) => {
          if (o.kind !== 'mushroom') return;
          const d = Math.hypot(o.x - b.x, o.z - b.z);
          if (d < bestD) [best, bestD] = [i, d];
        });
        b.hideTarget = best;
      }
      if (b.hideTarget >= 0) {
        const o = ctx.obstacles[b.hideTarget];
        steer(b, Math.atan2(o.x - b.x, o.z - b.z), 5 * dt);
        if (Math.hypot(o.x - b.x, o.z - b.z) < o.radius * 0.6) {
          b.hideTarget = -1;
          setState(b, 'hidden');
        }
        return;
      }
      smoothTurn(b, dt, rng);
      break;
    }
    default:
      b.speed = base;
      smoothTurn(b, dt, rng);
  }
  // Guards stay near their spot.
  const h = b.home;
  if (h && Math.hypot(b.x - h.x, b.z - h.z) > h.r) steer(b, Math.atan2(h.x - b.x, h.z - b.z), 4 * dt);
}

function smoothTurn(b: Bug, dt: number, rng: Rng) {
  if (b.nextTurn <= 0) {
    b.turn = (rng() - 0.5) * 3;
    b.nextTurn = 0.6 + rng() * 1.4;
  }
  b.heading += b.turn * dt;
}

/** Turns back towards the middle near the edge. */
function keepOnDisc(b: Bug, dt: number) {
  const r = Math.hypot(b.x, b.z);
  const limit = field.radius - 0.4 - b.def.radius;
  if (r > limit - 0.6 && b.state !== 'enter') steer(b, Math.atan2(-b.x, -b.z), 5 * dt);
  if (r > limit && b.state !== 'enter') {
    b.x *= limit / r;
    b.z *= limit / r;
  }
}

/** Walks around obstacles instead of through them (hiders may go under mushrooms). */
function avoid(b: Bug, obstacles: readonly Obstacle[]) {
  obstacles.forEach((o, i) => {
    if (b.def.move === 'hide' && o.kind === 'mushroom' && b.hideTarget === i) return;
    const f = footprint(o, b.x, b.z, true);
    const gap = f.d - b.def.radius;
    if (gap < 0) {
      b.x -= f.nx * gap;
      b.z -= f.nz * gap;
      b.heading = Math.atan2(f.nx, f.nz) + 0.6;
    }
  });
}

function hover(b: Bug) {
  if (b.def.hover) {
    const target = b.def.hover + Math.sin(b.age * 3.1) * 0.22;
    b.y += (target - b.y) * (b.state === 'enter' ? 0.08 : 0.3);
  } else b.y = groundAt(b.x, b.z);
}

function fly(b: Bug, dt: number) {
  b.vy -= GRAVITY * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  b.tumble += b.spin * dt;
  const ground = groundAt(b.x, b.z);
  if (b.y <= ground && b.vy < 0) {
    b.y = ground;
    if (b.vy < -4) {
      // One comic bounce.
      b.vy *= -0.35;
      b.vx *= 0.5;
      b.vz *= 0.5;
      b.spin *= 0.5;
    } else {
      setState(b, 'dazed');
      b.vx = b.vy = b.vz = 0;
    }
  }
  if (b.y < COUNTER_Y - 2) setState(b, 'gone');
}

/** Throws a bug away from an impact: up in the air, spinning, and away from where the food landed. */
export function knock(b: Bug, from: { x: number; z: number }, dir: { x: number; z: number }, strength: number, rng: Rng) {
  let dx = b.x - from.x;
  let dz = b.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.15) [dx, dz] = [dir.x, dir.z];
  const n = Math.hypot(dx, dz) || 1;
  const push = (2.2 + rng() * 1.6) * strength;
  b.vx = (dx / n) * push + dir.x * 1.2;
  b.vz = (dz / n) * push + dir.z * 1.2;
  b.vy = (6.5 + rng() * 2.5) * Math.min(1.6, strength);
  b.spin = (rng() < 0.5 ? -1 : 1) * (8 + rng() * 6);
  b.script = undefined;
  b.march = undefined;
  setState(b, 'knocked');
}

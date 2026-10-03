/**
 * Ballistics on the little round world. Pure maths with plain vectors, so it is shared by the game,
 * the aiming guide and the replay, and can be tested without a renderer.
 *
 * World axes: the slingshot starts at +z looking towards -z, x is to the right, y is up. The round world
 * ("the disc") is centred on the origin with its grass at y = 0, and stands on a kitchen counter.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const SURFACE_Y = 0;
export const COUNTER_Y = -0.8;
/** How far the slingshot stands from the edge of the world. */
const SLING_GAP = 3.5;
const SLING_HEIGHT = 1.3;

/**
 * The current play field: each world has its own size, and from a certain chapter the slingshot can walk
 * around the world (`angle`, radians; 0 = at +z, looking towards -z). Set by `Arena` for its level, so the
 * game, the guide and the replay all agree.
 */
export const field: { radius: number; angle: number; shape: WorldShape } = { radius: 7.5, angle: 0, shape: 'circle' };

/**
 * The world isn't always round: its edge is `radius × edgeFactor(angle)`, a curve that never goes past
 * `radius` (circle, a six-petal flower, a hexagon, a rounded square, an oval, a soft blob).
 */
export type WorldShape = 'circle' | 'flower' | 'hex' | 'square' | 'oval' | 'blob';

function rawEdge(shape: WorldShape, a: number): number {
  switch (shape) {
    case 'circle':
      return 1;
    case 'flower':
      return 1 + 0.1 * Math.cos(6 * a);
    case 'hex': {
      const s = Math.PI / 3;
      return Math.cos(Math.PI / 6) / Math.cos((((a % s) + s) % s) - Math.PI / 6);
    }
    case 'square': {
      const n = 5;
      return 1 / (Math.abs(Math.cos(a)) ** n + Math.abs(Math.sin(a)) ** n) ** (1 / n);
    }
    case 'oval':
      return 1 / Math.sqrt(Math.cos(a) ** 2 + (Math.sin(a) / 0.8) ** 2);
    case 'blob':
      return 1 + 0.08 * Math.sin(3 * a + 1) + 0.05 * Math.sin(5 * a);
  }
}

const ranges = new Map<WorldShape, { max: number; min: number }>();
function range(shape: WorldShape) {
  let r = ranges.get(shape);
  if (!r) {
    let max = 0;
    let min = Infinity;
    for (let i = 0; i < 720; i++) {
      const e = rawEdge(shape, (i / 720) * Math.PI * 2);
      max = Math.max(max, e);
      min = Math.min(min, e);
    }
    ranges.set(shape, (r = { max, min: min / max }));
  }
  return r;
}

/** 0..1: how far the edge is in direction `a` (atan2(z, x)), as a share of the radius. */
export function edgeFactor(a: number, shape = field.shape): number {
  return rawEdge(shape, a) / range(shape).max;
}

/** The distance from the middle to the edge, in the direction of a point. */
export function edgeAt(x: number, z: number): number {
  return field.radius * edgeFactor(Math.atan2(z, x));
}

/** The closest the edge comes to the middle (things placed inside this always fit). */
export function innerRadius(shape = field.shape, radius = field.radius): number {
  return radius * range(shape).min;
}

export function setField(radius: number, angle = 0, shape: WorldShape = 'circle') {
  field.radius = radius;
  field.angle = angle;
  field.shape = shape;
}

/** Where the pouch of the slingshot rests, for a place around the world (just outside its edge). */
export function slingAt(angle = field.angle): Vec3 {
  const d = edgeAt(Math.sin(angle), Math.cos(angle)) + SLING_GAP;
  return { x: Math.sin(angle) * d, y: SLING_HEIGHT, z: Math.cos(angle) * d };
}

/** The shortest and longest shot, measured along the ground from the slingshot. */
export const MIN_RANGE = 3;
export function maxRange(): number {
  return field.radius * 2 + SLING_GAP + 1;
}
/** How far the aim can turn to either side (radians). */
export const MAX_YAW = (40 * Math.PI) / 180;

export const vec = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export function onDisc(x: number, z: number, margin = 0): boolean {
  return Math.hypot(x, z) <= edgeAt(x, z) - margin;
}

/** The height of whatever is underneath a point: the grass on the disc, otherwise the counter. */
export function groundAt(x: number, z: number): number {
  return onDisc(x, z) ? SURFACE_Y : COUNTER_Y;
}

export interface Aim {
  /** Positive turns the shot to the right. */
  yaw: number;
  /** 0..1, how far the band is pulled; decides how far the food flies. */
  power: number;
}

/**
 * Turns a pull on the screen into an aim. `dx`/`dy` are how far the finger moved from where it pressed,
 * in pixels (y grows downwards). Pulling down and back shoots forwards; pulling left aims right, like a
 * real slingshot. Returns null while the pull is too short to be a shot.
 */
export function aimFromPull(dx: number, dy: number, maxPull: number): Aim | null {
  const len = Math.hypot(dx, dy);
  if (len < maxPull * 0.08 || dy < -maxPull * 0.05) return null;
  const yaw = Math.max(-MAX_YAW, Math.min(MAX_YAW, Math.atan2(-dx, Math.max(dy, maxPull * 0.15))));
  return { yaw, power: Math.min(1, len / maxPull) };
}

export function rangeFor(power: number): number {
  return MIN_RANGE + Math.max(0, Math.min(1, power)) * (maxRange() - MIN_RANGE);
}

/** The pull that throws `distance` far (the inverse of `rangeFor`). */
export function powerFor(distance: number): number {
  return (distance - MIN_RANGE) / (maxRange() - MIN_RANGE);
}

/** The aim (yaw and power) that lands on a spot, from the slingshot at `angle`. */
export function aimAt(x: number, z: number, angle = field.angle): Aim {
  const s = slingAt(angle);
  const heading = Math.atan2(x - s.x, -(z - s.z));
  let yaw = heading + angle;
  yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  return { yaw, power: powerFor(Math.hypot(x - s.x, z - s.z)) };
}

/** Horizontal direction of an aim from the slingshot at `angle` (yaw 0 points at the middle). */
export function aimDir(yaw: number, angle = field.angle): { x: number; z: number } {
  return { x: Math.sin(yaw - angle), z: -Math.cos(yaw - angle) };
}

/**
 * The launch velocity that lands on the grass `distance` away along `yaw`, at a fixed launch angle (the
 * food's character: low and fast, or a slow high lob) under the food's gravity.
 */
export function launchVelocity(yaw: number, distance: number, angleDeg: number, gravity: number, from: Vec3 = slingAt(), slingAngle = field.angle): Vec3 {
  const th = (angleDeg * Math.PI) / 180;
  const drop = from.y - SURFACE_Y;
  const cos = Math.cos(th);
  const v = Math.sqrt((gravity * distance * distance) / (2 * cos * cos * (drop + distance * Math.tan(th))));
  const d = aimDir(yaw, slingAngle);
  return { x: d.x * v * cos, y: v * Math.sin(th), z: d.z * v * cos };
}

/** The launch velocity from anywhere that lands on the grass at `to`, at a fixed launch angle (a friend's throw). */
export function launchToward(from: Vec3, to: { x: number; z: number }, angleDeg: number, gravity: number): Vec3 {
  const th = (angleDeg * Math.PI) / 180;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.max(0.5, Math.hypot(dx, dz));
  const cos = Math.cos(th);
  const v = Math.sqrt((gravity * d * d) / (2 * cos * cos * (from.y - SURFACE_Y + d * Math.tan(th))));
  return { x: (dx / d) * v * cos, y: v * Math.sin(th), z: (dz / d) * v * cos };
}

/** Seconds until a body launched with `vy` from height `y0` comes down to `ground`. */
export function flightTime(y0: number, vy: number, gravity: number, ground = SURFACE_Y): number {
  return (vy + Math.sqrt(vy * vy + 2 * gravity * (y0 - ground))) / gravity;
}

/** Points along the flight, for the aiming guide (stops where the food would land). */
export function predictPath(from: Vec3, v: Vec3, gravity: number, step = 0.04, max = 120): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i < max; i++) {
    const t = i * step;
    const p = { x: from.x + v.x * t, y: from.y + v.y * t - 0.5 * gravity * t * t, z: from.z + v.z * t };
    if (p.y < groundAt(p.x, p.z)) break;
    pts.push(p);
  }
  return pts;
}

export function dist2D(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function dist3D(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

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
export const field = { radius: 7.5, angle: 0 };

export function setField(radius: number, angle = 0) {
  field.radius = radius;
  field.angle = angle;
}

/** Where the pouch of the slingshot rests, for a place around the world. */
export function slingAt(angle = field.angle): Vec3 {
  const d = field.radius + SLING_GAP;
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
  return x * x + z * z <= (field.radius - margin) ** 2;
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

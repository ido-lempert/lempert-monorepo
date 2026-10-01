/**
 * Ballistics on the little round world. Pure maths with plain vectors, so it is shared by the game,
 * the aiming guide and the replay, and can be tested without a renderer.
 *
 * World axes: the slingshot stands at +z looking towards -z, x is to the right, y is up. The round world
 * ("the disc") is centred on the origin with its grass at y = 0, and stands on a kitchen counter.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const DISC_RADIUS = 7.5;
export const SURFACE_Y = 0;
export const COUNTER_Y = -0.8;
/** Where the pouch of the slingshot rests. */
export const SLING: Readonly<Vec3> = { x: 0, y: 1.3, z: 11 };

/** The shortest and longest shot, measured along the ground from the slingshot. */
export const MIN_RANGE = 3;
export const MAX_RANGE = 19.5;
/** How far the aim can turn to either side (radians). */
export const MAX_YAW = (40 * Math.PI) / 180;

export const vec = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export function onDisc(x: number, z: number, margin = 0): boolean {
  return x * x + z * z <= (DISC_RADIUS - margin) ** 2;
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
  return MIN_RANGE + Math.max(0, Math.min(1, power)) * (MAX_RANGE - MIN_RANGE);
}

/** Horizontal direction of an aim. */
export function aimDir(yaw: number): { x: number; z: number } {
  return { x: Math.sin(yaw), z: -Math.cos(yaw) };
}

/**
 * The launch velocity that lands on the grass `distance` away along `yaw`, at a fixed launch angle (the
 * food's character: low and fast, or a slow high lob) under the food's gravity.
 */
export function launchVelocity(yaw: number, distance: number, angleDeg: number, gravity: number, from: Vec3 = SLING): Vec3 {
  const th = (angleDeg * Math.PI) / 180;
  const drop = from.y - SURFACE_Y;
  const cos = Math.cos(th);
  const v = Math.sqrt((gravity * distance * distance) / (2 * cos * cos * (drop + distance * Math.tan(th))));
  const d = aimDir(yaw);
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

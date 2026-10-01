/**
 * The play field's logic: bugs coming and going, food in flight, impacts and what they hit. Pure (no
 * rendering): `update` advances it and returns what happened, and the world draws the current state and
 * plays effects for the events. The replay builds a second, scripted Arena from recorded shots.
 */
import { active, type BossDef, type Bug, BUGS, type BugKind, footprint, hittable, knock, makeBug, moveBug, type Obstacle } from './bugs';
import { type Food, FOODS, type FoodId, withTier } from './foods';
import type { Level } from './levels';
import { COUNTER_Y, edgeAt, field, groundAt, innerRadius, launchVelocity, onDisc, rangeFor, setField, slingAt, SURFACE_Y, type Vec3 } from './physics';
import { makeRng, type Rng, weighted } from './rng';
import { type HitResult, Session } from './session';

export interface Body {
  id: number;
  shotId: number;
  food: Food;
  /** A split slice or a donut ring rather than the whole food. */
  piece: 'whole' | 'slice' | 'ring';
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  radius: number;
  area: number;
  mode: 'fly' | 'roll' | 'done';
  bounces: number;
  split: boolean;
  rollLeft: number;
  rollTime: number;
  rollSpeed: number;
  /** Bugs a rolling body already hit (each once). */
  rolledOver: Set<number>;
  /** Seconds since it was thrown. */
  age: number;
}

export interface Shot {
  id: number;
  food: Food;
  origin: Vec3;
  velocity: Vec3;
  /** Session clock at launch. */
  at: number;
  bodies: Body[];
}

/** What a replay needs to stage a shot again. */
export interface ShotRecord {
  shotId: number;
  food: FoodId;
  tier: number;
  origin: Vec3;
  velocity: Vec3;
  hits: { bugId: number; kind: BugKind; after: number; age: number; x: number; y: number; z: number; vx: number; vz: number; boss?: BossDef; hp?: number }[];
}

export interface BugHit {
  bug: Bug;
  result: HitResult;
  /** A king that took no damage (in its shell, or the food was too light). */
  blocked?: boolean;
  /** A king that went down. */
  down?: boolean;
}

export type GameEvent =
  | { type: 'spawn'; bug: Bug }
  | { type: 'launch'; shot: Shot; body: Body }
  /** Food came down (or hit a bug or a mushroom). `last`: the body is finished. */
  | { type: 'impact'; shot: Shot; body: Body; point: Vec3; hits: BugHit[]; last: boolean; onBug: boolean }
  /** A rolling body ran into bugs. */
  | { type: 'roll-hit'; shot: Shot; body: Body; point: Vec3; hits: BugHit[] }
  | { type: 'pieces'; shot: Shot; from: Body; pieces: Body[] }
  /** A rolling body stopped. */
  | { type: 'stop'; shot: Shot; body: Body }
  | { type: 'combo'; chain: number; mega: boolean }
  /** A rare bug ran away. */
  | { type: 'escape'; bug: Bug }
  | { type: 'hide'; bug: Bug }
  /** A thrown bug came down, dizzy. */
  | { type: 'land'; bug: Bug };

export interface ArenaOptions {
  seed?: number;
  comboWindow?: number;
  /** Scripted (replay): no spawning, no clock. */
  scripted?: boolean;
  /** Upgrade tier of each food. */
  tiers?: Partial<Record<FoodId, number>>;
}

const STEP = 1 / 120;
/** Dizzy bugs kept on the disc for the mop; beyond this the oldest ones pop away. */
const MAX_DAZED = 40;

export class Arena {
  readonly bugs: Bug[] = [];
  readonly shots: Shot[] = [];
  readonly session: Session;
  readonly records = new Map<number, ShotRecord>();
  readonly obstacles: readonly Obstacle[];
  readonly rng: Rng;
  private readonly tiers: Partial<Record<FoodId, number>>;
  private nextId = 1;
  private spawnIn = 0.3;
  private groupIn: number[];
  private rareIn: number;
  private carry = 0;
  private readonly scripted: boolean;

  constructor(
    readonly level: Level,
    o: ArenaOptions = {},
  ) {
    this.rng = makeRng(o.seed ?? (Math.random() * 2 ** 32) >>> 0);
    this.session = new Session(level, o.comboWindow);
    this.obstacles = level.obstacles;
    this.scripted = !!o.scripted;
    this.tiers = o.tiers ?? {};
    this.groupIn = (level.groups ?? []).map((g) => Math.min(6, g.every * 0.4));
    this.rareIn = level.rareEvery ?? Infinity;
    setField(level.radius, 0, level.shape);
    if (level.boss && !this.scripted) this.addBug('king', 0, -level.radius * 0.3, 0, level.boss).state = 'walk';
  }

  /** The king, while there is one standing. */
  get king(): Bug | undefined {
    return this.bugs.find((b) => b.boss && b.state !== 'gone');
  }

  /** Bugs still running about (not hit). */
  get activeBugs(): number {
    return this.bugs.filter(active).length;
  }

  /** Advances by `dt` seconds of game time (already slowed down by slow motion). */
  update(dt: number): GameEvent[] {
    const events: GameEvent[] = [];
    this.carry += Math.min(dt, 0.1);
    while (this.carry >= STEP) {
      this.carry -= STEP;
      this.step(STEP, events);
    }
    return events;
  }

  private step(dt: number, events: GameEvent[]) {
    if (!this.scripted) {
      this.session.tick(dt);
      this.spawning(dt, events);
    }
    for (const b of this.bugs) {
      const was = b.state;
      moveBug(b, dt, this.rng, { obstacles: this.obstacles, pace: this.level.pace });
      if (b.state === 'hidden' && was !== 'hidden') events.push({ type: 'hide', bug: b });
      if (b.state === 'gone' && was === 'leaving') events.push({ type: 'escape', bug: b });
      if (b.state === 'dazed' && was === 'knocked') events.push({ type: 'land', bug: b });
      // A rare bug only stays for a while.
      if (b.def.rare && b.state === 'walk' && b.age > 9 && !b.script) {
        b.state = 'leaving';
        b.t = 0;
      }
    }
    for (const shot of this.shots) for (const body of [...shot.bodies]) this.moveBody(shot, body, dt, events);
    // Forget what's finished.
    for (let i = this.shots.length - 1; i >= 0; i--) if (this.shots[i].bodies.every((b) => b.mode === 'done')) this.shots.splice(i, 1);
    for (let i = this.bugs.length - 1; i >= 0; i--) if (this.bugs[i].state === 'gone') this.bugs.splice(i, 1);
  }

  // --- Bugs -----------------------------------------------------------------------------------------

  private spawning(dt: number, events: GameEvent[]) {
    const lv = this.level;
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawnIn = 0.7 + this.rng() * 0.8;
      if (this.activeBugs < lv.max) events.push({ type: 'spawn', bug: this.spawnAtEdge(weighted(this.rng, lv.mix)) });
    }
    (lv.groups ?? []).forEach((g, i) => {
      this.groupIn[i] -= dt;
      if (this.groupIn[i] > 0) return;
      this.groupIn[i] = g.every;
      for (const bug of this.spawnGroup(g.kind, g.count, g.formation, g.at)) events.push({ type: 'spawn', bug });
    });
    this.rareIn -= dt;
    if (this.rareIn <= 0) {
      this.rareIn = lv.rareEvery ?? Infinity;
      events.push({ type: 'spawn', bug: this.spawnAtEdge('golden') });
    }
    // Kings call in helpers.
    for (const k of this.bugs) {
      const s = k.boss?.summon;
      if (!s || !hittable(k)) continue;
      k.summonIn -= dt;
      if (k.summonIn > 0) continue;
      k.summonIn = s.every;
      for (let i = 0; i < s.count && this.activeBugs < lv.max + 5; i++) {
        const a = (i / s.count) * Math.PI * 2 + this.rng();
        const b = this.addBug(s.kind, k.x + Math.sin(a) * (k.def.radius + 0.8), k.z + Math.cos(a) * (k.def.radius + 0.8), a);
        events.push({ type: 'spawn', bug: b });
      }
    }
    // Keep the disc from filling up with dizzy bugs.
    const dazed = this.bugs.filter((b) => b.state === 'dazed');
    for (let i = 0; i < dazed.length - MAX_DAZED; i++) dazed[i].state = 'gone';
  }

  /** Spawns a bug over the edge, facing roughly into the middle. Avoids the edge nearest the slingshot. */
  spawnAtEdge(kind: BugKind, angle?: number): Bug {
    // Angles measured from the side opposite the slingshot: ±150° keeps clear of the near edge.
    const a = (angle ?? (this.rng() - 0.5) * ((300 * Math.PI) / 180)) - field.angle;
    const r = edgeAt(Math.sin(a), -Math.cos(a)) - 0.5;
    const x = Math.sin(a) * r;
    const z = -Math.cos(a) * r;
    return this.addBug(kind, x, z, Math.atan2(-x, -z) + (this.rng() - 0.5) * 1.2);
  }

  addBug(kind: BugKind, x: number, z: number, heading: number, boss?: BossDef): Bug {
    const b = makeBug(this.nextId++, kind, x, z, heading, this.rng, boss);
    this.bugs.push(b);
    return b;
  }

  spawnGroup(kind: BugKind, count: number, formation: 'line' | 'cluster' | 'guard', at?: { x: number; z: number }): Bug[] {
    const out: Bug[] = [];
    if (formation === 'guard' && at) {
      // A crowd that stays in its spot behind a fence.
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2;
        const b = this.addBug(kind, at.x + Math.cos(ang) * 0.9, at.z + Math.sin(ang) * 0.9, ang);
        b.state = 'walk';
        b.home = { x: at.x, z: at.z, r: 1.3 };
        out.push(b);
      }
    } else if (formation === 'line') {
      const radius = Math.min(3.4 + this.rng() * 2, innerRadius() - 1.3);
      const dir = this.rng() < 0.5 ? 1 : -1;
      const start = this.rng() * Math.PI * 2;
      for (let i = 0; i < count; i++) {
        const angle = start - dir * i * (0.95 / radius);
        const e = edgeAt(Math.cos(angle), Math.sin(angle)) * 0.95;
        const b = this.addBug(kind, Math.cos(angle) * e, Math.sin(angle) * e, 0);
        b.march = { radius, angle, dir };
        out.push(b);
      }
    } else {
      const a = (this.rng() - 0.5) * 2.4;
      const cx = Math.sin(a) * 3.8;
      const cz = -Math.cos(a) * 3.8;
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2;
        const rr = i === 0 ? 0 : 0.95;
        const b = this.addBug(kind, cx + Math.cos(ang) * rr, cz + Math.sin(ang) * rr, this.rng() * 6.28);
        b.state = 'walk';
        b.speed = 0;
        out.push(b);
      }
    }
    return out;
  }

  // --- Shots ----------------------------------------------------------------------------------------

  /** Throws `food` with a slingshot aim (yaw and pull power). */
  fire(foodId: FoodId, yaw: number, power: number): Shot {
    const food = withTier(FOODS[foodId], this.tiers[foodId] ?? 0);
    return this.launch(food, slingAt(), launchVelocity(yaw, rangeFor(power), food.angle, food.gravity));
  }

  launch(food: Food, origin: Vec3, velocity: Vec3, shotId?: number): Shot {
    const shot: Shot = { id: shotId ?? this.nextId++, food, origin, velocity, at: this.session.clock, bodies: [] };
    shot.bodies.push(this.body(shot, 'whole', origin, velocity, food.radius, food.area));
    this.shots.push(shot);
    this.session.shot();
    this.records.set(shot.id, { shotId: shot.id, food: food.id, tier: this.tiers[food.id] ?? 0, origin: { ...origin }, velocity: { ...velocity }, hits: [] });
    return shot;
  }

  private body(shot: Shot, piece: Body['piece'], p: Vec3, v: Vec3, radius: number, area: number): Body {
    return {
      id: this.nextId++, shotId: shot.id, food: shot.food, piece,
      x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, radius, area,
      mode: 'fly', bounces: 0, split: false, rollLeft: 0, rollTime: 0, rollSpeed: 0, rolledOver: new Set(), age: 0,
    };
  }

  private moveBody(shot: Shot, b: Body, dt: number, events: GameEvent[]) {
    if (b.mode === 'done') return;
    b.age += dt;
    const food = b.food;
    if (b.mode === 'roll') return this.roll(shot, b, dt, events);

    b.vy -= food.gravity * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;

    // Pizza splits into slices at the top of its flight.
    if (food.after.kind === 'split' && b.piece === 'whole' && !b.split && b.vy <= 0) {
      b.split = true;
      b.mode = 'done';
      const n = food.after.count;
      const pieces: Body[] = [];
      for (let i = 0; i < n; i++) {
        const spread = (i / (n - 1) - 0.5) * 0.55;
        const c = Math.cos(spread);
        const s = Math.sin(spread);
        const k = 0.92 + (i % 2) * 0.12;
        const v = { x: (b.vx * c - b.vz * s) * k, y: b.vy + 1.2, z: (b.vx * s + b.vz * c) * k };
        pieces.push(this.body(shot, 'slice', b, v, 0.32, food.area));
      }
      shot.bodies.push(...pieces);
      events.push({ type: 'pieces', shot, from: b, pieces });
      return;
    }

    // Straight into a bug?
    const target = this.bugs.find(
      (bug) => hittable(bug) && Math.hypot(bug.x - b.x, bug.y + bug.def.radius * 0.6 - b.y, bug.z - b.z) < b.radius + bug.def.radius * 1.1,
    );
    if (target) return this.impact(shot, b, { x: b.x, y: b.y, z: b.z }, events, true);

    // Into a mushroom, a cup, a sugar cube or a fence?
    for (const o of this.obstacles) {
      const top = groundAt(o.x, o.z) + o.height;
      if (footprint(o, b.x, b.z).d < b.radius * 0.5 && b.y < top && b.y > groundAt(o.x, o.z)) {
        return this.impact(shot, b, { x: b.x, y: Math.min(b.y, top), z: b.z }, events, false);
      }
    }

    const ground = groundAt(b.x, b.z);
    if (b.y - b.radius * 0.5 <= ground && b.vy < 0) return this.impact(shot, b, { x: b.x, y: ground, z: b.z }, events, false);
    if (b.y < COUNTER_Y - 3) b.mode = 'done';
  }

  /** Food lands: everything near it is hit, then the food does its own thing (bounce, roll, rings). */
  private impact(shot: Shot, b: Body, point: Vec3, events: GameEvent[], onBug: boolean) {
    const hits = this.hitAround(shot, b, point, b.area);
    const after = b.piece === 'whole' ? b.food.after : { kind: 'none' as const };
    let last = true;
    if (after.kind === 'bounce' && b.bounces < after.times) {
      b.bounces++;
      b.y = point.y + b.radius;
      b.vy = Math.max(Math.abs(b.vy) * 0.45, 5.5);
      b.vx *= 0.7;
      b.vz *= 0.7;
      last = false;
    } else if (after.kind === 'roll' && point.y === SURFACE_Y) {
      const sp = Math.max(4, Math.hypot(b.vx, b.vz) * 0.55);
      const n = Math.hypot(b.vx, b.vz) || 1;
      b.mode = 'roll';
      b.y = SURFACE_Y + b.radius;
      b.vx = (b.vx / n) * sp;
      b.vz = (b.vz / n) * sp;
      b.vy = 0;
      b.rollSpeed = sp;
      b.rollLeft = b.rollTime = after.seconds;
      for (const h of hits) b.rolledOver.add(h.bug.id);
      last = false;
    } else b.mode = 'done';
    events.push({ type: 'impact', shot, body: b, point, hits, last, onBug });

    if (after.kind === 'rings' && point.y === SURFACE_Y) {
      const n = Math.hypot(b.vx, b.vz) || 1;
      const pieces: Body[] = [];
      for (let i = 0; i < after.count; i++) {
        const a = (i / (after.count - 1) - 0.5) * 1.6;
        const dx = b.vx / n;
        const dz = b.vz / n;
        const v = { x: (dx * Math.cos(a) - dz * Math.sin(a)) * 5, y: 0, z: (dx * Math.sin(a) + dz * Math.cos(a)) * 5 };
        const ring = this.body(shot, 'ring', { x: point.x, y: SURFACE_Y + 0.25, z: point.z }, v, 0.25, 0.55);
        ring.mode = 'roll';
        ring.rollSpeed = 5;
        ring.rollLeft = ring.rollTime = 1.4;
        for (const h of hits) ring.rolledOver.add(h.bug.id);
        pieces.push(ring);
      }
      shot.bodies.push(...pieces);
      events.push({ type: 'pieces', shot, from: b, pieces });
    }
    this.comboEvent(hits, events);
  }

  private roll(shot: Shot, b: Body, dt: number, events: GameEvent[]) {
    b.rollLeft -= dt;
    const k = Math.max(0, b.rollLeft / b.rollTime);
    const n = Math.hypot(b.vx, b.vz) || 1;
    b.vx = (b.vx / n) * b.rollSpeed * (0.25 + 0.75 * k);
    b.vz = (b.vz / n) * b.rollSpeed * (0.25 + 0.75 * k);
    b.x += b.vx * dt;
    b.z += b.vz * dt;
    // Bump off obstacles.
    for (const o of this.obstacles) {
      const f = footprint(o, b.x, b.z, true);
      const gap = f.d - b.radius;
      if (gap < 0) {
        const dot = b.vx * f.nx + b.vz * f.nz;
        if (dot < 0) {
          b.vx -= 2 * dot * f.nx;
          b.vz -= 2 * dot * f.nz;
        }
        b.x -= f.nx * gap;
        b.z -= f.nz * gap;
      }
    }
    if (!onDisc(b.x, b.z)) {
      // Rolled off the edge.
      b.mode = 'fly';
      b.vy = 0;
      return;
    }
    const over = this.bugs.filter(
      (bug) => hittable(bug) && !bug.def.hover && !b.rolledOver.has(bug.id) && Math.hypot(bug.x - b.x, bug.z - b.z) < b.radius + bug.def.radius + 0.15,
    );
    if (over.length) {
      const hits: BugHit[] = [];
      for (const bug of over) {
        b.rolledOver.add(bug.id);
        hits.push(this.hitBug(shot, b, bug, { x: b.x, z: b.z }));
      }
      events.push({ type: 'roll-hit', shot, body: b, point: { x: b.x, y: b.y, z: b.z }, hits });
      this.comboEvent(hits, events);
    }
    if (b.rollLeft <= 0) {
      b.mode = 'done';
      events.push({ type: 'stop', shot, body: b });
    }
  }

  private hitAround(shot: Shot, b: Body, point: Vec3, area: number): BugHit[] {
    const out: BugHit[] = [];
    for (const bug of this.bugs) {
      if (!hittable(bug)) continue;
      const flat = Math.hypot(bug.x - point.x, bug.z - point.z);
      const high = Math.abs(bug.y - point.y);
      if (flat < area + bug.def.radius && high < area + 0.8) out.push(this.hitBug(shot, b, bug, point));
    }
    return out;
  }

  private hitBug(shot: Shot, b: Body, bug: Bug, from: { x: number; z: number }): BugHit {
    const rec = this.records.get(shot.id);
    if (rec) {
      const vx = Math.sin(bug.heading) * bug.speed;
      const vz = Math.cos(bug.heading) * bug.speed;
      rec.hits.push({ bugId: bug.id, kind: bug.kind, after: this.session.clock - shot.at, age: bug.age, x: bug.x, y: bug.y, z: bug.z, vx, vz, boss: bug.boss, hp: bug.hp });
    }
    const n = Math.hypot(b.vx, b.vz) || 1;
    const dir = { x: b.vx / n, z: b.vz / n };
    if (bug.boss) return this.hitKing(shot, b, bug, from, dir);
    knock(bug, from, dir, b.food.knock, this.rng);
    const result = this.scripted
      ? { points: bug.def.value, multiplier: 1, chain: 1, mega: false }
      : this.session.hit(bug.kind, shot.id);
    return { bug, result };
  }

  /** Kings stagger back and lose a heart, unless they're in their shell or the food is too light. */
  private hitKing(shot: Shot, b: Body, bug: Bug, from: { x: number; z: number }, dir: { x: number; z: number }): BugHit {
    const boss = bug.boss!;
    const none = { points: 0, multiplier: 1, chain: this.session.chain, mega: false };
    if (bug.shelled > 0 || (boss.armor && b.food.knock < boss.armor)) return { bug, result: none, blocked: true };
    bug.hp--;
    const down = bug.hp <= 0;
    if (down) knock(bug, from, dir, 2, this.rng);
    else {
      let dx = bug.x - from.x;
      let dz = bug.z - from.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.1) [dx, dz] = [dir.x, dir.z];
      const k = 3.5 / (Math.hypot(dx, dz) || 1);
      bug.vx = dx * k;
      bug.vz = dz * k;
      bug.hurt = 0.6;
    }
    const result = this.scripted ? { ...none, points: BUGS.king.value } : this.session.hitBoss(shot.id, down);
    return { bug, result, down };
  }

  private comboEvent(hits: BugHit[], events: GameEvent[]) {
    if (!hits.length || this.scripted) return;
    const last = hits[hits.length - 1].result;
    if (last.chain >= 2) events.push({ type: 'combo', chain: last.chain, mega: hits.some((h) => h.result.mega) });
  }

  // --- Looking ahead ----------------------------------------------------------------------------------

  /**
   * Whether a flying food is about to hit a bug within `seconds` (assuming the bug keeps walking
   * straight). The impact camera uses it to cut to a close-up just before the hit.
   */
  predictHit(seconds: number): { body: Body; bug: Bug; in: number } | null {
    const dt = 1 / 60;
    for (const shot of this.shots)
      for (const b of shot.bodies) {
        if (b.mode !== 'fly') continue;
        let { x, y, z, vy } = b;
        for (let t = dt; t <= seconds; t += dt) {
          vy -= b.food.gravity * dt;
          x += b.vx * dt;
          y += vy * dt;
          z += b.vz * dt;
          const ground = groundAt(x, z);
          for (const bug of this.bugs) {
            if (!hittable(bug)) continue;
            const bx = bug.x + Math.sin(bug.heading) * bug.speed * t;
            const bz = bug.z + Math.cos(bug.heading) * bug.speed * t;
            const near = Math.hypot(bx - x, bug.y - y, bz - z) < b.radius + bug.def.radius * 1.1;
            const landed = y - b.radius * 0.5 <= ground && Math.hypot(bx - x, bz - z) < b.area + bug.def.radius;
            if (near || landed) return { body: b, bug, in: t };
          }
          if (y - b.radius * 0.5 <= ground) break;
        }
      }
    return null;
  }
}

/** The bug kinds of a level (for the intro card and the replay). */
export function levelBugs(level: Level): BugKind[] {
  const kinds = new Set<BugKind>(Object.keys(level.mix) as BugKind[]);
  for (const g of level.groups ?? []) kinds.add(g.kind);
  if (level.rareEvery) kinds.add('golden');
  return [...kinds].sort((a, b) => BUGS[a].value - BUGS[b].value);
}

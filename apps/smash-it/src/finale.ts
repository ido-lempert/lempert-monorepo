/**
 * After the clock: the slow-motion replay of the best shots, and the mop that sweeps the whole mess
 * into the sink before the next chapter.
 */
import type { Sound } from './audio';
import type { Arena, ShotRecord } from './game/arena';
import type { Level } from './game/levels';
import { field, type Vec3 } from './game/physics';
import { stage, stageLength } from './game/replay';
import { Effects } from './world/effects';
import type { World } from './world/world';

/** Plays each recorded shot again in slow motion, from a different angle each time. */
export class Replay {
  private index = -1;
  private arena: Arena | null = null;
  private effects: Effects | null = null;
  private time = 0;
  private length = 0;
  private hitAt: Vec3 | null = null;

  constructor(
    private readonly world: World,
    private readonly sound: Sound,
    private readonly level: Level,
    private readonly shots: ShotRecord[],
  ) {
    this.next();
  }

  private get rec(): ShotRecord {
    return this.shots[this.index];
  }

  private next(): boolean {
    this.index++;
    if (this.index >= this.shots.length) return false;
    this.arena = stage(this.level, this.rec);
    this.effects = new Effects();
    this.world.bind(this.arena, this.effects);
    this.time = 0;
    this.length = stageLength(this.rec);
    this.hitAt = null;
    // Start beside the slingshot.
    const first = this.rec.hits[0];
    this.world.orbitCamera(first, this.angle, 9, 4, 50);
    this.world.cam.jump();
    return true;
  }

  private get angle(): number {
    return 2.4 + this.index * 2.1;
  }

  /** Returns true when the whole replay is over. */
  update(dt: number): boolean {
    if (!this.arena) return true;
    // Slow, and slower still around each hit.
    const near = this.rec.hits.some((h) => Math.abs(h.after - this.time) < 0.25);
    const slow = near ? 0.16 : 0.45;
    const gameDt = dt * slow;
    this.time += gameDt;
    const events = this.arena.update(gameDt);
    this.world.show(events);
    for (const e of events)
      if ((e.type === 'impact' || e.type === 'roll-hit') && e.hits.length) {
        this.hitAt ??= e.point;
        this.sound.play('squeak', e.hits.length);
        if (e.type === 'impact') this.sound.play('crunch');
      }
    const body = this.arena.shots[0]?.bodies.find((b) => b.mode !== 'done');
    // Kings are big: step back for them.
    const k = this.rec.hits.some((h) => h.boss) ? 1.8 : 1;
    if (this.hitAt) this.world.orbitCamera(this.hitAt, this.angle + this.time * 0.8, 5.5 * k, 2.2 * k, 3);
    else if (body) this.world.orbitCamera(body, this.angle, 6 * k, 2.5 * k, 4);
    this.world.frame(dt, gameDt);
    if (this.time > this.length) {
      this.effects?.clear();
      if (!this.next()) {
        this.arena = null;
        return true;
      }
    }
    return false;
  }

  /** Ends early (and tidies up). */
  stop() {
    this.effects?.clear();
    this.arena = null;
  }
}

/** The mop: dragged (or carried on its own) across the world, pushing everything off the screen. */
export class MopScene {
  x = -field.radius - 4;
  private idle = 0;
  private swish = 0;
  private popped = 0;
  private done = 0;

  constructor(
    private readonly world: World,
    private readonly sound: Sound,
  ) {
    world.overviewCamera(2.5);
  }

  /** The finger moved the mop by `px` screen pixels. */
  drag(px: number) {
    if (px <= 0) return;
    this.x += (px / innerWidth) * 26 * (field.radius / 7.5);
    this.idle = 0;
    if (this.swish <= 0) {
      this.sound.play('swish');
      this.swish = 0.3;
    }
  }

  /** Returns true when the world is clean and the mop has gone. */
  update(dt: number): boolean {
    this.idle += dt;
    this.swish -= dt;
    this.popped -= dt;
    // Carry on by itself if nobody drags it.
    if (this.idle > 1.5) this.x += dt * 9;
    const end = this.world.mopEnd;
    const swept = this.world.mopTo(Math.min(this.x, end), dt);
    if (swept && this.popped <= 0) {
      this.sound.play('pop');
      this.popped = 0.25;
    }
    this.world.overviewCamera(2.5);
    this.world.frame(dt, dt);
    if (this.x >= end) this.done += dt;
    if (this.done > 1.6) {
      this.world.mopTo(null, dt);
      return true;
    }
    return false;
  }
}

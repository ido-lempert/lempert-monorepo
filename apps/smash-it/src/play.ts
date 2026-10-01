/**
 * Playing a chapter: the slingshot (drag, keyboard), the food tray's choice, reloading, and the director
 * that turns good hits into moments – the Impact Cam cuts to a close-up just before the hit, freezes for
 * a few frames on impact, plays it in slow motion and swoops back.
 */
import { Arena, type GameEvent } from './game/arena';
import type { Sound, Sfx } from './audio';
import { type Effect, FOODS, type FoodId } from './game/foods';
import type { Level } from './game/levels';
import { type Aim, aimFromPull, MAX_YAW, type Vec3 } from './game/physics';
import { comboWindow, guideLength, type Progress, reloadTime } from './game/progress';
import { t } from './i18n';
import type { World } from './world/world';

export interface PlayUi {
  /** Floating text over a spot in the world. */
  popup(text: string, at: Vec3, cls?: string): void;
  /** Big text in the middle of the screen. */
  banner(text: string, cls?: string, ms?: number): void;
  toast(text: string): void;
  /** Hides the "pull back" hint after the first shot. */
  shot(): void;
}

const EFFECT_SOUND: Record<Effect, Sfx> = {
  crumble: 'crunch',
  scatter: 'pop',
  smash: 'smash',
  wobble: 'boing',
  cheese: 'crunch',
  rings: 'boing',
  splash: 'splat',
  slices: 'splat',
};

interface ImpactCam {
  phase: 'approach' | 'freeze' | 'slow' | 'out';
  t: number;
  at: Vec3;
  dir: { x: number; z: number };
  /** A rare or small bug: a longer, more dramatic moment. */
  big: boolean;
}

export class Play {
  readonly arena: Arena;
  food: FoodId;
  /** 0..1 of the reload left. */
  reloadLeft = 0;
  private reloadFor = 1;
  private aim: Aim | null = null;
  private drag: { id: number; x: number; y: number } | null = null;
  private kb = { yaw: 0, power: 0.5, on: false };
  private lastYaw = 0;
  private stretchStep = 0;
  timeScale = 1;
  private impact: ImpactCam | null = null;
  private cooldown = 2;
  /** Seconds since the chapter ended (null while playing). */
  private ending: number | null = null;
  private goalsMet: boolean[];
  paused = false;

  constructor(
    private readonly world: World,
    private readonly sound: Sound,
    private readonly progress: Progress,
    readonly level: Level,
    private readonly ui: PlayUi,
    private readonly calm: () => boolean,
  ) {
    this.arena = new Arena(level, { comboWindow: comboWindow(progress) });
    this.food = progress.owned.includes(progress.food) ? progress.food : 'cookie';
    this.goalsMet = level.goals.map(() => false);
    world.setLevel(level);
    world.bind(this.arena);
    world.mess.clear();
    world.loadPouch(this.food);
  }

  get guide(): number {
    return guideLength(this.progress, this.level.guide);
  }

  get over(): boolean {
    return this.ending !== null;
  }

  selectFood(id: FoodId) {
    if (!this.progress.owned.includes(id) || id === this.food) return;
    this.food = id;
    this.progress.food = id;
    this.sound.play('click');
    if (this.reloadLeft <= 0) this.world.loadPouch(id);
  }

  // --- Input --------------------------------------------------------------------------------------

  private get maxPull(): number {
    return Math.min(innerHeight * 0.3, 240);
  }

  private canAim(): boolean {
    return !this.paused && this.ending === null;
  }

  pointerDown(e: PointerEvent) {
    if (!this.canAim() || this.drag) return;
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    this.kb.on = false;
    this.stretchStep = 0;
  }

  pointerMove(e: PointerEvent) {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    this.setAim(aimFromPull(e.clientX - this.drag.x, e.clientY - this.drag.y, this.maxPull));
  }

  pointerUp(e: PointerEvent) {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    this.drag = null;
    if (e.type === 'pointerup' && this.aim) this.fire(this.aim);
    this.setAim(null);
  }

  /** Arrows aim, space or Enter throws, 1–8 picks a food. */
  key(e: KeyboardEvent): boolean {
    if (!this.canAim()) return false;
    const k = this.kb;
    const step = e.shiftKey ? 0.02 : 0.06;
    switch (e.key) {
      case 'ArrowLeft':
        k.yaw = Math.max(-MAX_YAW, k.yaw - step);
        break;
      case 'ArrowRight':
        k.yaw = Math.min(MAX_YAW, k.yaw + step);
        break;
      case 'ArrowUp':
        k.power = Math.min(1, k.power + step * 0.6);
        break;
      case 'ArrowDown':
        k.power = Math.max(0.05, k.power - step * 0.6);
        break;
      case ' ':
      case 'Enter':
        if (k.on) this.fire({ yaw: k.yaw, power: k.power });
        k.on = true;
        this.setAim({ yaw: k.yaw, power: k.power });
        return true;
      default: {
        const n = Number(e.key);
        if (n >= 1 && n <= this.progress.owned.length) {
          this.selectFood(this.progress.owned[n - 1]);
          return true;
        }
        return false;
      }
    }
    k.on = true;
    this.setAim({ yaw: k.yaw, power: k.power });
    return true;
  }

  private setAim(aim: Aim | null) {
    this.aim = aim;
    if (aim) {
      this.lastYaw = aim.yaw;
      const s = Math.floor(aim.power * 5);
      if (s !== this.stretchStep) {
        this.stretchStep = s;
        this.sound.play('stretch', aim.power);
      }
    }
  }

  private fire(aim: Aim) {
    if (this.reloadLeft > 0 || this.ending !== null) return;
    this.arena.fire(this.food, aim.yaw, aim.power);
    this.world.fired();
    this.sound.play('launch');
    this.reloadFor = reloadTime(this.progress, FOODS[this.food].reload);
    this.reloadLeft = 1;
    this.ui.shot();
  }

  // --- Frame --------------------------------------------------------------------------------------

  /** Advances by `dt` real seconds. Returns true once the chapter has ended and settled. */
  update(dt: number): boolean {
    if (this.paused) {
      this.world.frame(dt, 0);
      return false;
    }
    this.direct(dt);
    const gameDt = dt * this.timeScale;
    const events = this.arena.update(gameDt);
    this.world.show(events);
    this.react(events);

    if (this.reloadLeft > 0) {
      this.reloadLeft = Math.max(0, this.reloadLeft - dt / this.reloadFor);
      if (this.reloadLeft === 0) this.world.loadPouch(this.food);
    }

    const live = this.kb.on && !this.drag ? { yaw: this.kb.yaw, power: this.kb.power } : this.aim;
    this.world.setAim(this.ending === null && this.reloadLeft === 0 ? live : null, this.food, this.guide);
    this.world.frame(dt, gameDt);

    if (this.ending === null && this.arena.session.over) this.end();
    if (this.ending !== null) this.ending += dt;
    return this.ending !== null && this.ending > 2.2 && !this.impact;
  }

  private end() {
    this.ending = 0;
    this.drag = null;
    this.aim = null;
    this.kb.on = false;
    const s = this.arena.session;
    if (s.success) {
      this.ui.banner(t('allDone'), 'mint', 2000);
      this.sound.play('win');
    } else {
      this.ui.banner(t('timeUp'), 'pink', 2000);
      this.sound.play('buzzer');
    }
  }

  /** The camera and the speed of time. */
  private direct(dt: number) {
    const w = this.world;
    this.cooldown -= dt;
    const ic = this.impact;
    if (ic) {
      ic.t += dt;
      switch (ic.phase) {
        case 'approach':
          this.timeScale += (0.3 - this.timeScale) * Math.min(1, dt * 10);
          w.impactCamera(ic.at, ic.dir, 9, ic.big ? 4 : 5);
          if (ic.t > 1.2) this.leaveImpact();
          break;
        case 'freeze':
          this.timeScale = 0;
          if (ic.t > (ic.big ? 0.16 : 0.09)) [ic.phase, ic.t] = ['slow', 0];
          break;
        case 'slow':
          this.timeScale = ic.big ? 0.15 : 0.22;
          if (ic.t > (ic.big ? 1.5 : 1)) this.leaveImpact();
          break;
        case 'out':
          this.timeScale = Math.min(1, this.timeScale + dt * 2.5);
          w.homeCamera(this.lastYaw, undefined, 3.5);
          if (ic.t > 0.4) {
            this.impact = null;
            this.timeScale = 1;
          }
          break;
      }
      return;
    }
    const target = this.ending === null ? 1 : 0.6;
    this.timeScale += (target - this.timeScale) * Math.min(1, dt * 6);
    // Follow the newest food a little.
    const shot = this.arena.shots.at(-1);
    const body = shot?.bodies.find((b) => b.mode !== 'done');
    w.homeCamera(this.lastYaw, body);
    if (this.calm() || this.cooldown > 0) return;
    const pred = this.arena.predictHit(0.3);
    if (!pred) return;
    const bug = pred.bug;
    const s = this.arena.session;
    // Not every hit: worthy bugs, combos, crowds, or now and then.
    const worth = bug.def.value >= 150 || bug.def.rare || s.chain >= 2 || pred.body.food.area >= 1.8 || Math.random() < 0.3;
    if (!worth) {
      this.cooldown = 0.6;
      return;
    }
    const n = Math.hypot(pred.body.vx, pred.body.vz) || 1;
    this.impact = {
      phase: 'approach',
      t: 0,
      at: { x: bug.x, y: bug.y, z: bug.z },
      dir: { x: pred.body.vx / n, z: pred.body.vz / n },
      big: !!bug.def.rare || bug.def.radius < 0.4,
    };
  }

  private leaveImpact() {
    if (!this.impact) return;
    this.impact.phase = 'out';
    this.impact.t = 0;
    this.cooldown = 3.5;
  }

  /** Sounds, popups and banners for what happened. */
  private react(events: GameEvent[]) {
    const s = this.arena.session;
    for (const e of events) {
      switch (e.type) {
        case 'impact':
        case 'roll-hit': {
          if (e.type === 'impact') this.sound.play(EFFECT_SOUND[e.body.piece === 'slice' ? 'slices' : e.body.food.effect]);
          if (e.hits.length && this.impact?.phase === 'approach') [this.impact.phase, this.impact.t] = ['freeze', 0];
          e.hits.forEach((h, i) => {
            this.sound.play('squeak', s.hits + i);
            const r = h.result;
            const text = r.multiplier > 1 ? `+${r.points} <small>×${r.multiplier}</small>` : `+${r.points}`;
            this.ui.popup(text, { x: h.bug.x, y: h.bug.y + 1, z: h.bug.z }, h.bug.def.rare ? 'gold' : '');
            if (h.bug.def.rare) this.ui.banner(t('cheerRare'), '', 1200);
          });
          if (e.hits.length >= 2) {
            this.ui.popup(t('multi', { n: e.hits.length }), { x: e.point.x, y: e.point.y + 2.2, z: e.point.z }, 'cheer');
          } else if (e.hits.length === 1 && e.hits[0].bug.def.radius < 0.4) {
            this.ui.popup(t('cheerWow'), { x: e.point.x, y: e.point.y + 2.2, z: e.point.z }, 'cheer');
          }
          break;
        }
        case 'combo':
          if (e.mega) {
            this.ui.banner(t('mega'), 'pink', 1600);
            this.sound.play('mega');
            this.world.cam.shake(0.4);
          } else this.sound.play('combo', e.chain);
          break;
        case 'spawn':
          if (e.bug.def.rare) {
            this.ui.toast(t('goldenHere'));
            this.sound.play('coin');
          }
          break;
        case 'escape':
          this.ui.toast(t('goldenEscaped'));
          break;
      }
    }
    // A goal just completed (but not the last one: the ending has its own banner).
    this.level.goals.forEach((g, i) => {
      if (this.goalsMet[i] || !s.goalMet(g)) return;
      this.goalsMet[i] = true;
      if (!s.success) {
        this.ui.toast(t('goalDone'));
        this.sound.play('coin');
      }
    });
  }
}

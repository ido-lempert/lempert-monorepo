/**
 * Playing a chapter: the slingshot (drag, keyboard), the food tray's choice, reloading, and the director
 * that turns good hits into moments – the Impact Cam cuts to a close-up just before the hit, freezes for
 * a few frames on impact, plays it in slow motion and swoops back.
 */
import { Arena, type GameEvent } from './game/arena';
import type { Sound, Sfx } from './audio';
import { type Effect, FOODS, type FoodId, withTier } from './game/foods';
import type { Level } from './game/levels';
import { type Aim, aimFromPull, dist2D, field, MAX_YAW, slingAt, type Vec3 } from './game/physics';
import { type Bug, BUGS, hittable } from './game/bugs';
import type { Voice } from './audio';
import { ammoFor, comboWindow, friendFor, guideLength, type Progress, umbrellaFor } from './game/progress';
import { type StringKey, t } from './i18n';
import type { World } from './world/world';

export interface PlayUi {
  /** Floating text over a spot in the world. */
  popup(text: string, at: Vec3, cls?: string): void;
  /** Big text in the middle of the screen. */
  banner(text: string, cls?: string, ms?: number): void;
  toast(text: string): void;
  /** Hides the "pull back" hint after the first shot. */
  shot(): void;
  /** A tip shown only the first time (`id`); returns whether it was shown. */
  tip(id: string, icon: string, text: string): boolean;
  /** A short vibration (phones that support it). */
  buzz(ms: number): void;
  /** Goo on the screen for this many seconds (0 clears it). */
  goo(seconds: number): void;
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
  /** The bug about to be hit: the camera follows it as it flies off. */
  bug: Bug;
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
  /** Hits per shot still in the air, and where it last came down (to tell a miss). */
  private readonly shotHits = new Map<number, number>();
  private readonly landed = new Map<number, Vec3>();
  private misses = 0;
  /** Walking the slingshot around the world: -1, 0 or 1. */
  spin = 0;

  constructor(
    private readonly world: World,
    private readonly sound: Sound,
    private readonly progress: Progress,
    readonly level: Level,
    private readonly ui: PlayUi,
    private readonly calm: () => boolean,
    /** A longer aiming guide, offered after failing a chapter twice. */
    private readonly assist = false,
  ) {
    this.arena = new Arena(level, { comboWindow: comboWindow(progress), tiers: progress.tiers, ammo: ammoFor(progress, level.ammo), umbrella: umbrellaFor(progress), ally: friendFor(progress) });
    this.food = progress.owned.includes(progress.food) ? progress.food : 'cookie';
    this.arena.session.minCost = Math.min(...progress.owned.map((f) => this.costOf(f)));
    this.goalsMet = level.goals.map(() => false);
    world.setLevel(level);
    world.bind(this.arena);
    world.mess.clear();
    world.loadPouch(this.food);
  }

  get guide(): number {
    return Math.max(this.assist ? 0.85 : 0, guideLength(this.progress, this.level.guide));
  }

  get over(): boolean {
    return this.ending !== null;
  }

  /** Ammo units one throw of `id` uses, with its upgrades. */
  costOf(id: FoodId): number {
    return withTier(FOODS[id], this.progress.tiers[id] ?? 0).cost;
  }

  /** How many throws of `id` are left. */
  shotsOf(id: FoodId): number {
    return this.arena.session.shotsWith(this.costOf(id));
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

  /** Moves the slingshot around the world (chapters where that's allowed). */
  turn(by: number) {
    if (!this.level.rotate || this.ending !== null) return;
    field.angle += by;
    this.world.setSlingAngle(field.angle);
  }

  /** The friend button was pressed: the next tap on the grass places it (pressed again: changes its mind). */
  friendArmed = false;

  armFriend(): boolean {
    if (!this.level.ally || this.paused || this.ending !== null || !this.arena.allyReady) return false;
    this.friendArmed = !this.friendArmed;
    return this.friendArmed;
  }

  /** Places the friend at a spot on the grass; false when that is not possible. */
  placeFriend(at: Vec3 | null): boolean {
    if (!at || !this.arena.placeAlly(at.x, at.z, this.food)) return false;
    this.friendArmed = false;
    return true;
  }

  /** The keyboard has no pointer, so the friend goes to a spot between the middle and the slingshot. */
  private placeFriendDefault(): boolean {
    if (!this.arena.allyReady) return false;
    const s = slingAt();
    const k = 0.5;
    return this.placeFriend({ x: s.x * k, y: 0, z: s.z * k });
  }

  /** Opens the umbrella against acid. */
  openUmbrella(): boolean {
    if (!this.level.spit || this.paused || this.ending !== null) return false;
    return this.arena.openUmbrella();
  }

  /** Arrows aim, Q and E walk around the world, space or Enter throws, 1–8 picks a food. */
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
      case 'q':
      case 'Q':
      case 'e':
      case 'E':
        if (!this.level.rotate) return false;
        this.turn(e.key.toLowerCase() === 'q' ? -0.12 : 0.12);
        return true;
      case 'f':
      case 'F':
        return this.level.ally ? this.placeFriendDefault() : false;
      case 'u':
      case 'U':
        return this.openUmbrella();
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
    if (this.reloadLeft > 0 || this.ending !== null || this.arena.player.stun > 0) return;
    if (this.shotsOf(this.food) <= 0) {
      // Not enough ammo left for this food: switch to the biggest one that still fits.
      const fits = this.progress.owned.filter((f) => this.shotsOf(f) > 0).sort((a, b) => this.costOf(b) - this.costOf(a))[0];
      if (!fits) return;
      this.ui.toast(t('switchedFood', { food: t(`food_${fits}` as StringKey) }));
      this.selectFood(fits);
      return;
    }
    this.arena.fire(this.food, aim.yaw, aim.power);
    this.world.fired();
    this.sound.play('launch');
    this.reloadFor = FOODS[this.food].reload;
    this.reloadLeft = 1;
    this.ui.shot();
    const left = this.shotsOf(this.food);
    if (left <= 5 && left > 0) this.ui.tip('ammoLow', '🧺', t('coachAmmoLow'));
    const f = FOODS[this.food];
    if (f.id !== 'cookie') this.ui.tip(`food:${f.id}`, f.emoji, t(`foodInfo_${f.id}` as StringKey));
  }

  // --- Frame --------------------------------------------------------------------------------------

  /** Advances by `dt` real seconds. Returns true once the chapter has ended and settled. */
  update(dt: number): boolean {
    if (this.paused) {
      this.world.frame(dt, 0);
      return false;
    }
    if (this.spin) this.turn(this.spin * 1.3 * dt);
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
      this.ui.banner(t(s.outOfAmmo && s.timeLeft > 0 ? 'noAmmo' : 'timeUp'), 'pink', 2000);
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
        case 'slow': {
          this.timeScale = ic.big ? 0.15 : 0.22;
          // Follow the bug up into the air, stepping back to keep all of it in view.
          const b = ic.bug;
          const mid = { x: (ic.at.x + b.x) / 2, y: (ic.at.y + b.y) / 2 + 0.3, z: (ic.at.z + b.z) / 2 };
          w.impactCamera(mid, ic.dir, 3.5, (ic.big ? 4 : 5) * 1.5 + Math.hypot(b.x - ic.at.x, b.y - ic.at.y, b.z - ic.at.z) * 0.6);
          if (ic.t > (ic.big ? 1.5 : 1)) this.leaveImpact();
          break;
        }
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
      bug,
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
          if (!e.shot.byAlly) {
            this.shotHits.set(e.shot.id, (this.shotHits.get(e.shot.id) ?? 0) + e.hits.length);
            this.landed.set(e.shot.id, e.point);
          }
          for (const h of e.hits) {
            if (h.bug.boss) continue;
            const d = BUGS[h.bug.kind];
            this.ui.tip(`bug:${d.kind}`, d.emoji, t('coachBug', { name: t(`bug_${d.kind}` as StringKey), n: d.value, about: t(`bugAbout_${d.kind}` as StringKey) }));
          }
          if (e.type === 'impact') this.sound.play(EFFECT_SOUND[e.body.piece === 'slice' ? 'slices' : e.body.food.effect]);
          if (e.hits.length && this.impact?.phase === 'approach') [this.impact.phase, this.impact.t] = ['freeze', 0];
          e.hits.forEach((h, i) => {
            const at = { x: h.bug.x, y: h.bug.y + 1 + (h.bug.boss ? 1 : 0), z: h.bug.z };
            if (h.blocked) {
              // A king in its bubble, or too heavy for this food.
              this.sound.play('tink');
              this.sound.voice(voiceOf(h.bug), 'hmph');
              this.ui.popup('🛡️', at, 'cheer');
              if (h.bug.shelled > 0) this.ui.tip('kingShell', '🫧', t('coachKingShell'));
              else this.ui.tip('kingArmor', '🍉', t('coachKingArmor'));
              return;
            }
            this.ui.buzz(h.bug.boss ? 30 : 12);
            if (h.down) {
              this.ui.buzz(60);
              this.sound.voice(voiceOf(h.bug), 'ohno');
              this.sound.play('fanfare');
              this.ui.banner(t('kingDown'), 'mint', 1800);
              this.world.cam.shake(0.5);
            } else {
              this.sound.voice(voiceOf(h.bug), i % 3 === 2 ? 'whee' : 'ouch', s.hits + i);
              if (h.bug.boss?.summonOnHit) this.ui.tip('kingSplit', '🐜', t('coachKingSplit'));
            }
            const r = h.result;
            const text = r.multiplier > 1 ? `+${r.points} <small>×${r.multiplier}</small>` : `+${r.points}`;
            this.ui.popup(text, at, h.bug.def.rare || h.bug.boss ? 'gold' : '');
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
          if (e.chain === 2) this.ui.tip('combo', '🔥', t('coachCombo'));
          if (e.mega) {
            this.ui.buzz(40);
            this.ui.banner(t('mega'), 'pink', 1600);
            this.sound.play('mega');
            this.world.cam.shake(0.4);
          } else this.sound.play('combo', e.chain);
          break;
        case 'spawn':
          if (e.bug.def.rare) {
            if (!this.ui.tip('golden', '✨', `${t('goldenHere')} ${t('bugAbout_golden')}`)) this.ui.toast(t('goldenHere'));
            this.sound.play('coin');
          }
          break;
        case 'hide':
          this.ui.tip('hide', '🍄', t('coachHide'));
          break;
        case 'escape':
          this.ui.toast(t('goldenEscaped'));
          this.sound.voice('golden', 'giggle');
          break;
        case 'land':
          this.sound.voice(voiceOf(e.bug), 'dizzy');
          break;
        case 'wind':
          this.ui.tip('wind', '🌂', t('coachSpit'));
          this.sound.play('wind');
          break;
        case 'spit':
          this.sound.play('spit');
          break;
        case 'splat':
          this.ui.goo(this.arena.player.goo);
          this.ui.buzz(80);
          this.world.cam.shake(0.35);
          this.sound.play('splat');
          this.ui.tip('goo', '🟢', t('coachGoo'));
          break;
        case 'blocked':
          this.sound.play('boing');
          this.world.cam.shake(0.1);
          this.ui.popup(t('blocked'), { x: e.acid.to.x, y: e.acid.y + 1, z: e.acid.to.z }, 'cheer');
          break;
        case 'dodged':
          this.sound.play('splat');
          break;
        case 'umbrella':
          if (e.open) this.sound.play('umbrella');
          break;
        case 'ally-in':
          this.sound.play('friend');
          break;
        case 'ally-throw':
          this.sound.play('swish');
          break;
        case 'ally-out':
          this.sound.play('whoosh');
          break;
        case 'firefly':
          this.sound.play('firefly');
          this.ui.popup(t('lightOn'), { x: e.firefly.x, y: e.firefly.y + 0.5, z: e.firefly.z }, 'cheer');
          break;
        case 'rear':
          this.sound.play('rumble');
          this.sound.voice(voiceOf(e.bug), 'hmph');
          this.ui.tip('kingCharge', '🐎', t('coachKingCharge'));
          break;
        case 'heal':
          this.sound.play('heal');
          this.ui.tip('kingHeal', '💚', t('coachKingHeal'));
          break;
      }
    }
    // Shots that are over: a miss gets a hint (early on), a hit resets the count.
    for (const [id, hits] of this.shotHits) {
      if (this.arena.shots.some((s) => s.id === id)) continue;
      const at = this.landed.get(id);
      this.shotHits.delete(id);
      this.landed.delete(id);
      if (hits > 0) this.misses = 0;
      else if (at) this.missed(at);
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

  /** A shot hit nothing: early on, say whether it was too short or too long; after a few, point at the guide. */
  private missed(at: Vec3) {
    this.misses++;
    if (this.misses >= 3 && this.guide > 0 && this.ui.tip('guide', '⚪', t('coachGuide'))) return;
    if (this.level.id > 2) return;
    let nearest: { x: number; z: number } | null = null;
    let best = Infinity;
    for (const b of this.arena.bugs) {
      if (!hittable(b)) continue;
      const d = dist2D(b, at);
      if (d < best) [nearest, best] = [b, d];
    }
    if (!nearest) return;
    const sling = slingAt();
    const short = dist2D(at, sling) < dist2D(nearest, sling) - 1;
    const long = dist2D(at, sling) > dist2D(nearest, sling) + 1;
    if (!short && !long) return;
    const key = short ? 'short' : 'long';
    const text = t(short ? 'coachShort' : 'coachLong');
    if (!this.ui.tip(`${key}1`, '💪', text)) this.ui.tip(`${key}2`, '💪', text);
  }
}

/** Whose voice a bug has (kings speak like their kind, only deeper). */
export function voiceOf(b: Bug): Voice {
  return b.boss ? 'king' : (b.kind as Voice);
}

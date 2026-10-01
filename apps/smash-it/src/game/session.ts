/**
 * One play of a chapter: the clock, score, combo and goals, and the numbers for the result screen.
 *
 * Combo: every hit within the combo window of the previous one adds to the chain, and the chain is the
 * multiplier (×1, ×2, ×3 …, capped at ×5 = MEGA COMBO). A rare bug keeps the chain alive for longer.
 */
import { type BugKind, BUGS, isSmall } from './bugs';
import type { Goal, Level } from './levels';

export const MEGA = 5;
export const BASE_COMBO_WINDOW = 3;
/** Extra combo time from hitting a rare bug. */
export const RARE_COMBO_BONUS = 3;

export interface HitResult {
  points: number;
  multiplier: number;
  chain: number;
  /** The chain just reached MEGA. */
  mega: boolean;
}

export class Session {
  timeLeft: number;
  /** Seconds since the start. */
  clock = 0;
  score = 0;
  hits = 0;
  chain = 0;
  maxChain = 0;
  comboUntil = -1;
  /** Points of the best single shot. */
  bestShot = 0;
  /** Most bugs hit with one shot. */
  maxMulti = 0;
  shots = 0;
  readonly byKind: Partial<Record<BugKind, number>> = {};
  small = 0;
  /** The king's hits taken and whether it is down. */
  bossHits = 0;
  bossDown = false;
  private readonly shotPoints = new Map<number, { points: number; bugs: number }>();

  constructor(
    readonly level: Level,
    readonly comboWindow = BASE_COMBO_WINDOW,
  ) {
    this.timeLeft = level.time;
  }

  tick(dt: number) {
    this.clock += dt;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.chain > 0 && this.clock > this.comboUntil) this.chain = 0;
  }

  /** Seconds left in the current combo (0 when there is none). */
  get comboLeft(): number {
    return this.chain > 0 ? Math.max(0, this.comboUntil - this.clock) : 0;
  }

  get multiplier(): number {
    return Math.max(1, Math.min(MEGA, this.chain));
  }

  shot() {
    this.shots++;
  }

  hit(kind: BugKind, shotId: number): HitResult {
    const def = BUGS[kind];
    this.chain = this.clock <= this.comboUntil ? this.chain + 1 : 1;
    this.maxChain = Math.max(this.maxChain, this.chain);
    this.comboUntil = Math.max(this.comboUntil, this.clock + this.comboWindow + (def.rare ? RARE_COMBO_BONUS : 0));
    const multiplier = this.multiplier;
    const points = def.value * multiplier;
    this.score += points;
    this.hits++;
    this.byKind[kind] = (this.byKind[kind] ?? 0) + 1;
    if (isSmall(kind)) this.small++;
    const s = this.shotPoints.get(shotId) ?? { points: 0, bugs: 0 };
    s.points += points;
    s.bugs++;
    this.shotPoints.set(shotId, s);
    this.bestShot = Math.max(this.bestShot, s.points);
    this.maxMulti = Math.max(this.maxMulti, s.bugs);
    return { points, multiplier, chain: this.chain, mega: this.chain === MEGA };
  }

  /** A hit on a king: points (with the combo), but it only counts as a bug once it's down. */
  hitBoss(shotId: number, down: boolean): HitResult {
    this.chain = this.clock <= this.comboUntil ? this.chain + 1 : 1;
    this.maxChain = Math.max(this.maxChain, this.chain);
    this.comboUntil = Math.max(this.comboUntil, this.clock + this.comboWindow);
    const multiplier = this.multiplier;
    const points = (down ? 1000 : BUGS.king.value) * multiplier;
    this.score += points;
    this.bossHits++;
    if (down) {
      this.bossDown = true;
      this.hits++;
    }
    const s = this.shotPoints.get(shotId) ?? { points: 0, bugs: 0 };
    s.points += points;
    s.bugs++;
    this.shotPoints.set(shotId, s);
    this.bestShot = Math.max(this.bestShot, s.points);
    return { points, multiplier, chain: this.chain, mega: this.chain === MEGA };
  }

  pointsOf(shotId: number): number {
    return this.shotPoints.get(shotId)?.points ?? 0;
  }

  /** How far along a goal is: [done so far, needed]. */
  progress(g: Goal): [number, number] {
    switch (g.kind) {
      case 'hits':
        return [this.hits, g.n];
      case 'score':
        return [this.score, g.n];
      case 'bug':
        return [g.bug === 'small' ? this.small : (this.byKind[g.bug] ?? 0), g.n];
      case 'combo':
        return [this.maxChain, g.n];
      case 'multi':
        return [this.maxMulti, g.n];
      case 'boss':
        return [this.bossDown ? 1 : 0, 1];
    }
  }

  goalMet(g: Goal): boolean {
    const [have, need] = this.progress(g);
    return have >= need;
  }

  get success(): boolean {
    return this.level.goals.every((g) => this.goalMet(g));
  }

  /** The chapter ends when every goal is met (no waiting around) or the clock runs out. */
  get over(): boolean {
    return this.success || this.timeLeft <= 0;
  }

  stars(): number {
    if (!this.success) return 0;
    const [two, three] = this.level.stars;
    return this.score >= three ? 3 : this.score >= two ? 2 : 1;
  }

  /** Coins for the chapter. Trying always earns something; winning, and winning fast, earns more. */
  coins(): number {
    const base = Math.floor(this.score / 10);
    if (!this.success) return Math.floor(base / 2);
    return base + 60 + Math.floor(this.timeLeft) + this.stars() * 20;
  }
}

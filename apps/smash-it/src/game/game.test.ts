import { describe, expect, it } from 'vitest';
import { Arena, levelBugs } from './arena';
import { BUGS, type BugKind, isSmall, makeBug, moveBug } from './bugs';
import { FOOD_ORDER, FOODS } from './foods';
import { LEVELS, type Level, ROTATE_FROM } from './levels';
import { aimAt, aimFromPull, field, flightTime, launchVelocity, MAX_YAW, maxRange, MIN_RANGE, predictPath, setField, slingAt, SURFACE_Y } from './physics';
import { bestShots, stage, stageLength } from './replay';
import { makeRng } from './rng';
import { MEGA, Session } from './session';

const quiet: Level = {
  id: 99, world: 1, index: 1, radius: 7.5, rotate: false, time: 60, goals: [{ kind: 'hits', n: 3 }], mix: { ladybug: 1 }, max: 0,
  guide: 1, pace: 1, obstacles: [], tip: 'cookie', stars: [100, 200],
};

/** The pull that throws `d` far. */
const powerFor = (d: number) => (d - MIN_RANGE) / (maxRange() - MIN_RANGE);

/** Lands a shot where the food would come down, by flying it in the arena. */
function landing(foodId: keyof typeof FOODS, yaw: number, distance: number) {
  setField(7.5);
  const food = FOODS[foodId];
  const s = slingAt();
  const v = launchVelocity(yaw, distance, food.angle, food.gravity);
  const t = flightTime(s.y, v.y, food.gravity);
  return { x: s.x + v.x * t, z: s.z + v.z * t, t };
}

describe('physics', () => {
  it('lands every food at the distance aimed for', () => {
    for (const id of FOOD_ORDER)
      for (const d of [5, 12, 20]) {
        const p = landing(id, 0.3, d);
        expect(Math.hypot(p.x - slingAt().x, p.z - slingAt().z)).toBeCloseTo(d, 3);
      }
  });

  it('flies fast foods faster than slow ones', () => {
    const t = (id: keyof typeof FOODS) => landing(id, 0, 12).t;
    expect(t('popcorn')).toBeLessThan(t('cookie'));
    expect(t('cookie')).toBeLessThan(t('watermelon'));
    expect(t('watermelon')).toBeLessThan(t('pie'));
  });

  it('pulling down shoots forwards, and pulling left aims right', () => {
    expect(aimFromPull(0, 100, 200)).toEqual({ yaw: -0, power: 0.5 });
    expect(aimFromPull(-50, 100, 200)!.yaw).toBeGreaterThan(0);
    expect(aimFromPull(-500, 10, 200)!.yaw).toBeCloseTo(MAX_YAW);
    expect(aimFromPull(0, 400, 200)!.power).toBe(1);
  });

  it('ignores tiny pulls and pushing forwards', () => {
    expect(aimFromPull(3, 3, 200)).toBeNull();
    expect(aimFromPull(0, -80, 200)).toBeNull();
  });

  it('predicts a path that ends at the grass', () => {
    const v = launchVelocity(0, 12, 32, 18);
    const path = predictPath(slingAt(), v, 18);
    expect(path.length).toBeGreaterThan(10);
    expect(path.at(-1)!.y).toBeGreaterThanOrEqual(SURFACE_Y);
  });
});

describe('bugs', () => {
  it('stay on the disc while they wander', () => {
    const rng = makeRng(3);
    for (const kind of Object.keys(BUGS) as BugKind[]) {
      const b = makeBug(1, kind, 0, 0, 0, rng);
      for (let i = 0; i < 3000; i++) {
        moveBug(b, 1 / 60, rng, { obstacles: [], pace: 1.2 });
        if (b.state === 'leaving' || b.state === 'gone') break;
        expect(Math.hypot(b.x, b.z)).toBeLessThan(field.radius);
      }
    }
  });

  it('hiders duck under mushrooms', () => {
    const rng = makeRng(5);
    const b = makeBug(1, 'beetle', 3, 0, 0, rng);
    const obstacles = [{ kind: 'mushroom' as const, x: 0, z: 0, radius: 1.3, height: 1.7 }];
    let hid = false;
    for (let i = 0; i < 1200 && !hid; i++) {
      moveBug(b, 1 / 60, rng, { obstacles, pace: 1 });
      hid = b.state === 'hidden';
    }
    expect(hid).toBe(true);
  });
});

describe('session', () => {
  it('builds a combo for quick hits and drops it after the window', () => {
    const s = new Session(quiet, 3);
    expect(s.hit('ladybug', 1).multiplier).toBe(1);
    s.tick(1);
    expect(s.hit('ladybug', 2).multiplier).toBe(2);
    s.tick(1);
    expect(s.hit('ant', 3)).toMatchObject({ multiplier: 3, points: 300 });
    s.tick(3.5);
    expect(s.chain).toBe(0);
    expect(s.hit('ladybug', 4).multiplier).toBe(1);
  });

  it('caps the multiplier at MEGA and reports reaching it once', () => {
    const s = new Session(quiet, 3);
    const megas = Array.from({ length: 7 }, (_, i) => s.hit('ladybug', i).mega);
    expect(megas.filter(Boolean)).toHaveLength(1);
    expect(s.multiplier).toBe(MEGA);
  });

  it('a rare bug keeps the combo going longer', () => {
    const s = new Session(quiet, 3);
    s.hit('golden', 1);
    s.tick(5);
    expect(s.hit('ladybug', 2).multiplier).toBe(2);
  });

  it('tracks goals, best shot and multi-hits', () => {
    const level: Level = { ...quiet, goals: [{ kind: 'multi', n: 2 }, { kind: 'bug', bug: 'small', n: 1 }] };
    const s = new Session(level, 3);
    s.hit('ladybug', 1);
    expect(s.success).toBe(false);
    s.hit('ant', 1);
    expect(s.maxMulti).toBe(2);
    expect(s.bestShot).toBe(50 + 200);
    expect(s.success).toBe(true);
    expect(s.over).toBe(true);
  });

  it('pays more coins for winning than for trying', () => {
    const win = new Session(quiet, 3);
    const lose = new Session({ ...quiet, goals: [{ kind: 'hits', n: 99 }] }, 3);
    for (const s of [win, lose]) for (let i = 0; i < 3; i++) s.hit('ladybug', i);
    expect(win.coins()).toBeGreaterThan(lose.coins());
    expect(lose.coins()).toBeGreaterThan(0);
  });
});

describe('arena', () => {
  /** An arena with one bug standing still where a cookie aimed straight ahead lands. */
  function sitter(kind: BugKind = 'ladybug', food: keyof typeof FOODS = 'cookie') {
    const arena = new Arena(quiet, { seed: 1 });
    const p = landing(food, 0, 12);
    const bug = arena.addBug(kind, p.x, p.z, 0);
    bug.state = 'walk';
    bug.script = { vx: 0, vz: 0 };
    return { arena, bug };
  }

  function run(arena: Arena, seconds: number) {
    const events = [];
    for (let t = 0; t < seconds; t += 1 / 60) events.push(...arena.update(1 / 60));
    return events;
  }

  it('hits a bug in the way and throws it into the air', () => {
    const { arena, bug } = sitter();
    arena.fire('cookie', 0, powerFor(12));
    const events = run(arena, 3);
    expect(events.some((e) => e.type === 'impact' && e.hits.length === 1)).toBe(true);
    expect(arena.session.hits).toBe(1);
    expect(bug.state).toBe('dazed');
  });

  it('predicts the hit before it happens', () => {
    const { arena } = sitter();
    arena.fire('cookie', 0, powerFor(12));
    let predicted = false;
    for (let i = 0; i < 120 && arena.session.hits === 0; i++) {
      predicted ||= !!arena.predictHit(0.3);
      arena.update(1 / 60);
    }
    expect(predicted).toBe(true);
  });

  it('a wide food hits a whole crowd with one shot', () => {
    const arena = new Arena(quiet, { seed: 2 });
    const p = landing('watermelon', 0, 12);
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0.5]]) {
      const b = arena.addBug('ladybug', p.x + dx, p.z + dz, 0);
      b.state = 'walk';
      b.script = { vx: 0, vz: 0 };
    }
    arena.fire('watermelon', 0, powerFor(12));
    run(arena, 3);
    expect(arena.session.maxMulti).toBe(3);
  });

  it('jelly bounces on and pizza splits into slices', () => {
    const arena = new Arena(quiet, { seed: 4 });
    arena.fire('jelly', 0, 0.3);
    const jelly = run(arena, 4).filter((e) => e.type === 'impact');
    expect(jelly).toHaveLength(3);
    arena.fire('pizza', 0, 0.5);
    const pizza = run(arena, 4);
    expect(pizza.find((e) => e.type === 'pieces')).toMatchObject({ pieces: { length: 4 } });
    expect(pizza.filter((e) => e.type === 'impact')).toHaveLength(4);
  });

  it('a rolling cheese ball runs over bugs after landing', () => {
    const arena = new Arena(quiet, { seed: 6 });
    const p = landing('cheese', 0, 8);
    const b = arena.addBug('ant', p.x, p.z - 3, 0);
    b.state = 'walk';
    b.script = { vx: 0, vz: 0 };
    arena.fire('cheese', 0, powerFor(8));
    const events = run(arena, 4);
    expect(events.some((e) => e.type === 'roll-hit')).toBe(true);
    expect(arena.session.hits).toBe(1);
  });

  it('spawns bugs up to the level limit, never on the near edge', () => {
    const arena = new Arena({ ...quiet, max: 6, mix: { ant: 1, butterfly: 1 } }, { seed: 7 });
    const spawns = run(arena, 20).filter((e) => e.type === 'spawn');
    expect(spawns.length).toBeGreaterThanOrEqual(6);
    expect(arena.activeBugs).toBeLessThanOrEqual(6);
    for (const e of spawns) if (e.type === 'spawn') expect(e.bug.z).toBeLessThan(field.radius * 0.9);
  });

  it('ends when the clock runs out', () => {
    const arena = new Arena({ ...quiet, time: 2 }, { seed: 8 });
    run(arena, 2.1);
    expect(arena.session.over).toBe(true);
    expect(arena.session.success).toBe(false);
  });
});

describe('replay', () => {
  it('stages the best shot again with the same hits', () => {
    const arena = new Arena({ ...quiet, max: 0 }, { seed: 9 });
    const p = landing('cookie', 0.2, 14);
    const b = arena.addBug('ant', p.x - 0.6, p.z, Math.PI / 2);
    b.state = 'walk';
    b.script = { vx: 0.4, vz: 0 };
    arena.fire('cookie', 0.2, powerFor(14));
    for (let i = 0; i < 180; i++) arena.update(1 / 60);
    expect(arena.session.hits).toBe(1);

    const [best] = bestShots(arena);
    expect(best.hits).toHaveLength(1);
    const again = stage(quiet, best);
    const n = Math.ceil(stageLength(best) * 60);
    let hits = 0;
    for (let i = 0; i < n; i++) for (const e of again.update(1 / 60)) if (e.type === 'impact') hits += e.hits.length;
    expect(hits).toBe(1);
  });
});

describe('levels', () => {
  it('are 100, numbered in order, and each one is winnable on paper', () => {
    expect(LEVELS).toHaveLength(100);
    LEVELS.forEach((l, i) => {
      expect(l.id).toBe(i + 1);
      expect(l.world).toBe(Math.floor(i / 10) + 1);
      expect(l.goals.length).toBeGreaterThan(0);
      const bugs = levelBugs(l);
      for (const g of l.goals) {
        if (g.kind === 'bug' && g.bug !== 'small') expect(bugs).toContain(g.bug);
        if (g.kind === 'bug' && g.bug === 'small') expect(bugs.some(isSmall)).toBe(true);
        if (g.kind === 'multi') expect(l.groups?.some((gr) => gr.formation === 'cluster')).toBe(true);
      }
      expect(l.stars[0]).toBeLessThan(l.stars[1]);
      // Everything stays on the world.
      for (const o of l.obstacles) expect(Math.hypot(o.x, o.z) + o.radius).toBeLessThan(l.radius);
      for (const g of l.groups ?? []) if (g.at) expect(Math.hypot(g.at.x, g.at.z)).toBeLessThan(l.radius - 1.5);
    });
  });

  it('have a king every 5 chapters, and rotation and fences from world 3', () => {
    for (const l of LEVELS) {
      expect(!!l.boss).toBe(l.id % 5 === 0);
      expect(l.rotate).toBe(l.id >= ROTATE_FROM);
      if (l.obstacles.some((o) => o.kind === 'fence')) expect(l.rotate).toBe(true);
    }
    expect(LEVELS.some((l) => l.obstacles.some((o) => o.kind === 'fence'))).toBe(true);
  });

  it('get harder: bigger worlds, less guide and quicker bugs later on', () => {
    expect(LEVELS[0].guide).toBeGreaterThan(LEVELS.at(-1)!.guide);
    expect(LEVELS[0].pace).toBeLessThan(LEVELS.at(-1)!.pace);
    expect(LEVELS[0].radius).toBeLessThan(LEVELS.at(-1)!.radius);
    expect(LEVELS[9].boss!.hp).toBeLessThan(LEVELS[99].boss!.hp);
  });
});

describe('rotation', () => {
  it('aims at the same spot from anywhere around the world', () => {
    setField(9);
    for (const angle of [0, 1, 2.5, -2]) {
      const aim = aimAt(2, -3, angle);
      const food = FOODS.cookie;
      const s = slingAt(angle);
      const v = launchVelocity(aim.yaw, MIN_RANGE + aim.power * (maxRange() - MIN_RANGE), food.angle, food.gravity, s, angle);
      const t = flightTime(s.y, v.y, food.gravity);
      expect(s.x + v.x * t).toBeCloseTo(2, 3);
      expect(s.z + v.z * t).toBeCloseTo(-3, 3);
    }
  });
});

describe('kings and fences', () => {
  const kingLevel: Level = {
    ...quiet, max: 0, radius: 9,
    goals: [{ kind: 'boss' }],
    boss: { look: 'ladybug', hp: 3, radius: 1.2, speed: 0 },
  };

  function throwAt(arena: Arena, food: keyof typeof FOODS, x: number, z: number) {
    const aim = aimAt(x, z);
    arena.fire(food, aim.yaw, aim.power);
    for (let i = 0; i < 200; i++) arena.update(1 / 60);
  }

  it('a king takes one heart per throw and goes down at the last', () => {
    const arena = new Arena(kingLevel, { seed: 3 });
    const king = arena.king!;
    expect(king.hp).toBe(3);
    for (let i = 0; i < 3; i++) throwAt(arena, 'cookie', king.x, king.z);
    expect(king.hp).toBe(0);
    expect(arena.session.bossDown).toBe(true);
    expect(arena.session.success).toBe(true);
  });

  it('a king in its shell, or one with armour, shrugs off light food', () => {
    const arena = new Arena({ ...kingLevel, boss: { ...kingLevel.boss!, armor: 1.3 } }, { seed: 4 });
    const king = arena.king!;
    throwAt(arena, 'cookie', king.x, king.z);
    expect(king.hp).toBe(3);
    throwAt(arena, 'watermelon', king.x, king.z);
    expect(king.hp).toBe(2);
    king.shelled = 5;
    throwAt(arena, 'watermelon', king.x, king.z);
    expect(king.hp).toBe(2);
  });

  it('a fence stops low food, but a high lob goes over it', () => {
    const fence = { kind: 'fence' as const, x: 0, z: 2, radius: 0.18, height: 1.4, length: 5, angle: 0 };
    const level = { ...quiet, max: 0, obstacles: [fence] };
    for (const [food, through] of [['popcorn', false], ['pie', true]] as const) {
      const arena = new Arena(level, { seed: 5 });
      const b = arena.addBug('ladybug', 0, -1, 0);
      b.state = 'walk';
      b.script = { vx: 0, vz: 0 };
      throwAt(arena, food, 0, -1);
      expect(arena.session.hits > 0).toBe(through);
    }
  });

  it('guards stay near their spot', () => {
    const arena = new Arena({ ...quiet, max: 0 }, { seed: 6 });
    const guards = arena.spawnGroup('ant', 4, 'guard', { x: 2, z: -2 });
    for (let i = 0; i < 1200; i++) arena.update(1 / 60);
    for (const g of guards) expect(Math.hypot(g.x - 2, g.z + 2)).toBeLessThan(2.6);
  });
});

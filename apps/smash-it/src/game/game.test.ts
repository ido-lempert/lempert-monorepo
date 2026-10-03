import { describe, expect, it } from 'vitest';
import { Arena, type GameEvent, LIGHT_TIME, levelBugs } from './arena';
import { BUGS, type BugKind, isSmall, makeBug, moveBug } from './bugs';
import { FOOD_ORDER, FOODS } from './foods';
import { effectsFor, LEVELS, type Level, ROTATE_FROM } from './levels';
import { aimAt, aimFromPull, edgeAt, field, onDisc, type WorldShape, flightTime, launchVelocity, MAX_YAW, maxRange, MIN_RANGE, predictPath, setField, slingAt, SURFACE_Y } from './physics';
import { bestShots, stage, stageLength } from './replay';
import { makeRng } from './rng';
import { MEGA, Session } from './session';

const quiet: Level = {
  id: 99, world: 1, index: 1, radius: 7.5, theme: 'garden', shape: 'circle', rotate: false, time: 60, ammo: 20, goals: [{ kind: 'hits', n: 3 }], mix: { ladybug: 1 }, max: 0,
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

  it('ends when the shots run out and the last one has landed; a rare bug gives shots back', () => {
    const s = new Session({ ...quiet, goals: [{ kind: 'hits', n: 99 }] }, 3, 2);
    expect(s.shotsLeft).toBe(2);
    s.shot();
    s.inFlight = 1;
    s.shot();
    s.inFlight = 2;
    expect(s.shotsLeft).toBe(0);
    expect(s.over).toBe(false);
    s.hit('golden', 1);
    expect(s.shotsLeft).toBe(3);
    s.inFlight = 0;
    s.shot();
    s.shot();
    s.shot();
    s.inFlight = 1;
    expect(s.shotsLeft).toBe(0);
    expect(s.over).toBe(false);
    s.inFlight = 0;
    expect(s.over).toBe(true);
    expect(s.outOfAmmo).toBe(true);
    // No limit unless a chapter asks for one.
    const free = new Session(quiet, 3);
    for (let i = 0; i < 99; i++) free.shot();
    expect(free.over).toBe(false);
  });

  it('counts ammo in units: light foods give more throws, heavy ones fewer, and it ends when not even the cheapest fits', () => {
    const s = new Session({ ...quiet, goals: [{ kind: 'hits', n: 99 }] }, 3, 10);
    expect(s.shotsWith(FOODS.cookie.cost)).toBe(10);
    expect(s.shotsWith(FOODS.popcorn.cost)).toBe(20);
    expect(s.shotsWith(FOODS.pie.cost)).toBe(4);
    s.shot(FOODS.pie.cost);
    s.shot(FOODS.pie.cost);
    expect(s.unitsLeft).toBe(10);
    expect(s.shotsWith(FOODS.pie.cost)).toBe(2);
    expect(s.shotsWith(FOODS.popcorn.cost)).toBe(10);
    // Holding only cookies and pies, the last 1 unit is useless; holding popcorn it is one more throw.
    s.shot(FOODS.pie.cost);
    s.shot(FOODS.pie.cost);
    s.shot(FOODS.pie.cost);
    expect(s.unitsLeft).toBe(0);
    const t = new Session({ ...quiet, goals: [{ kind: 'hits', n: 99 }] }, 3, 1);
    t.shot(FOODS.cookie.cost - 1);
    t.minCost = FOODS.popcorn.cost;
    expect(t.over).toBe(false);
    t.minCost = FOODS.cookie.cost;
    expect(t.over).toBe(true);
  });

  it('the arena spends the cost of the food that was thrown', () => {
    const arena = new Arena({ ...quiet, ammo: 10 }, { seed: 3, ammo: 10 });
    arena.fire('popcorn', 0, 0.5);
    expect(arena.session.spent).toBe(FOODS.popcorn.cost);
    arena.fire('pie', 0, 0.5);
    expect(arena.session.spent).toBe(FOODS.popcorn.cost + FOODS.pie.cost);
    const upgraded = new Arena({ ...quiet, ammo: 10 }, { seed: 3, ammo: 10, tiers: { pie: 5 } });
    upgraded.fire('pie', 0, 0.5);
    expect(upgraded.session.spent).toBe(FOODS.pie.cost - 2);
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
      // Everything stays on the world, whatever its shape.
      setField(l.radius, 0, l.shape);
      for (const o of l.obstacles) expect(onDisc(o.x, o.z, o.radius + (o.length ?? 0) / 2)).toBe(true);
      for (const g of l.groups ?? []) if (g.at) expect(onDisc(g.at.x, g.at.z, 1.5)).toBe(true);
    });
  });

  it('give enough shots to win with a few misses, and more later on', () => {
    for (const l of LEVELS) {
      const hits = l.goals.reduce((m, g) => Math.max(m, g.kind === 'hits' ? g.n : 0), 0);
      expect(l.ammo).toBeGreaterThanOrEqual(Math.ceil((l.boss ? l.boss.hp : hits) * 1.5));
    }
    expect(LEVELS.at(-2)!.ammo).toBeGreaterThan(LEVELS[0].ammo);
  });

  it('give time that follows the work: more for more hits or hearts, less per hit in later worlds, and never less than a spawn takes', () => {
    const work = (l: Level) => (l.boss ? l.boss.hp : Math.max(...l.goals.map((g) => (g.kind === 'hits' ? g.n : 0))));
    for (const l of LEVELS) {
      expect(l.time).toBeGreaterThanOrEqual(60);
      expect(l.time % 5).toBe(0);
      // Not a king: seconds per needed hit fall with the world, but there is always time to aim.
      if (!l.boss && work(l) > 0) {
        expect(l.time / work(l)).toBeGreaterThan(4.5);
        for (const g of l.goals) if (g.kind === 'bug' && g.bug === 'golden') expect(l.time).toBeGreaterThanOrEqual((l.rareEvery ?? 0) * (g.n + 1));
        for (const g of l.groups ?? []) if (g.formation !== 'guard') expect(l.time).toBeGreaterThanOrEqual(g.every * 4);
      }
      if (l.boss) expect(l.time / l.boss.hp).toBeGreaterThan(8);
    }
    const perHit = (w: number) => {
      const ls = LEVELS.filter((l) => l.world === w && !l.boss && l.goals.some((g) => g.kind === 'hits'));
      return ls.reduce((s, l) => s + l.time / work(l), 0) / ls.length;
    };
    expect(perHit(1)).toBeGreaterThan(perHit(5));
    expect(perHit(5)).toBeGreaterThan(perHit(10));
    // More hearts, more time (compare kings within a world: the small one and the big one).
    for (let w = 0; w < 10; w++) {
      const [a, b] = [LEVELS[w * 10 + 4], LEVELS[w * 10 + 9]];
      expect(b.time).toBeGreaterThanOrEqual(a.time);
    }
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

describe('world shapes', () => {
  it('never reach past the radius, and bugs stay inside them', () => {
    for (const shape of ['circle', 'flower', 'hex', 'square', 'oval', 'blob'] as WorldShape[]) {
      setField(9, 0, shape);
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        const e = edgeAt(Math.cos(a), Math.sin(a));
        expect(e).toBeLessThanOrEqual(9.0001);
        expect(e).toBeGreaterThan(6.5);
      }
      const rng = makeRng(2);
      const b = makeBug(1, 'ant', 0, 0, 0, rng);
      for (let i = 0; i < 2000; i++) {
        moveBug(b, 1 / 60, rng, { obstacles: [], pace: 1.2 });
        expect(onDisc(b.x, b.z)).toBe(true);
      }
    }
    setField(7.5);
  });

  it('change every two chapters', () => {
    const looks = new Set(LEVELS.slice(0, 10).map((l) => `${l.theme}/${l.shape}`));
    expect(looks.size).toBe(5);
    expect(LEVELS[0].theme).toBe(LEVELS[1].theme);
    expect(`${LEVELS[1].theme}/${LEVELS[1].shape}`).not.toBe(`${LEVELS[2].theme}/${LEVELS[2].shape}`);
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

describe('acid', () => {
  const spitty: Level = { ...quiet, rotate: true, spit: { every: 9 }, max: 0 };

  /** Runs until `type` shows up (or 40 seconds pass). */
  function until(arena: Arena, type: GameEvent['type'], then?: (e: GameEvent) => void) {
    const seen: GameEvent[] = [];
    for (let i = 0; i < 40 * 60 && !seen.some((e) => e.type === type); i++) {
      const events = arena.update(1 / 60);
      for (const e of events) if (e.type === type) then?.(e);
      seen.push(...events);
    }
    return seen;
  }

  function setup(seed = 3) {
    setField(7.5);
    field.angle = 0;
    const arena = new Arena(spitty, { seed, umbrella: { open: 3, cooldown: 7 } });
    const b = arena.addBug('ant', 0, -12, 0);
    b.state = 'walk';
    return arena;
  }

  it('starts in the chapters where the slingshot can walk around, and never before', () => {
    for (const l of LEVELS) expect(!!l.spit).toBe(l.id >= ROTATE_FROM);
  });

  it('winds up first, then splats the player if they stand still, stunning them and covering the view', () => {
    const arena = setup();
    const seen = until(arena, 'splat');
    const order = seen.map((e) => e.type).filter((t) => ['wind', 'spit', 'splat'].includes(t));
    expect(order).toEqual(['wind', 'spit', 'splat']);
    expect(arena.player.stun).toBeGreaterThan(0.9);
    expect(arena.player.goo).toBeGreaterThan(3);
    for (let i = 0; i < 5 * 60; i++) arena.update(1 / 60);
    expect(arena.player.stun).toBe(0);
    expect(arena.player.goo).toBe(0);
  });

  it('is dodged by walking the slingshot away', () => {
    const arena = setup();
    until(arena, 'spit');
    field.angle = 1.5;
    const seen = until(arena, 'dodged');
    expect(seen.some((e) => e.type === 'splat')).toBe(false);
    expect(arena.player.stun).toBe(0);
    field.angle = 0;
  });

  it('is blocked by the umbrella, which then needs a rest before it opens again', () => {
    const arena = setup();
    until(arena, 'spit');
    expect(arena.openUmbrella()).toBe(true);
    expect(arena.openUmbrella()).toBe(false);
    const seen = until(arena, 'blocked');
    expect(seen.some((e) => e.type === 'splat')).toBe(false);
    expect(arena.player.stun).toBe(0);
    for (let i = 0; i < 11 * 60; i++) arena.update(1 / 60);
    expect(arena.player.umbrella).toBe(0);
    expect(arena.openUmbrella()).toBe(true);
  });

  it('does not spit again while the player is still covered in goo', () => {
    const arena = setup();
    until(arena, 'splat');
    let winds = 0;
    for (let i = 0; i < Math.floor(arena.player.goo * 60); i++) for (const e of arena.update(1 / 60)) if (e.type === 'wind') winds++;
    expect(winds).toBe(0);
  });
});

describe('friend', () => {
  const helpful: Level = { ...quiet, ally: true, max: 0, ammo: 3, goals: [{ kind: 'hits', n: 99 }] };

  function setup(opts = {}) {
    setField(7.5);
    field.angle = 0;
    const arena = new Arena(helpful, { seed: 4, ammo: 3, ally: { life: 8, every: 1.2, rest: 20 }, ...opts });
    for (let i = 0; i < 8; i++) {
      const b = arena.addBug('snail', -4 + i, -3 - (i % 3), 0);
      b.state = 'walk';
      b.script = { vx: 0, vz: 0 };
    }
    return arena;
  }

  it('can only be placed on the grass, one at a time, and only in chapters that allow it', () => {
    const arena = setup();
    expect(arena.placeAlly(50, 50)).toBe(false);
    expect(arena.placeAlly(2, 4)).toBe(true);
    expect(arena.placeAlly(-2, 4)).toBe(false);
    const plain = new Arena({ ...quiet, max: 0 });
    expect(plain.placeAlly(2, 4)).toBe(false);
  });

  it('throws at the nearest bug without using any of the player shots', () => {
    const arena = setup();
    arena.placeAlly(3, 5);
    const left = arena.session.shotsLeft;
    let throws = 0;
    for (let i = 0; i < 6 * 60; i++) for (const e of arena.update(1 / 60)) if (e.type === 'ally-throw') throws++;
    expect(throws).toBeGreaterThanOrEqual(4);
    expect(arena.session.shotsLeft).toBe(left);
    expect(arena.session.hits).toBeGreaterThan(0);
  });

  it('leaves after its time, rests, and can then be called again', () => {
    const arena = setup();
    arena.placeAlly(3, 5);
    let out = 0;
    for (let i = 0; i < 9 * 60; i++) for (const e of arena.update(1 / 60)) if (e.type === 'ally-out') out++;
    expect(out).toBe(1);
    expect(arena.ally).toBeNull();
    expect(arena.placeAlly(3, 5)).toBe(false);
    for (let i = 0; i < 20 * 60; i++) arena.update(1 / 60);
    expect(arena.placeAlly(3, 5)).toBe(true);
  });

  it('does not end the chapter while its throws are still in the air', () => {
    const arena = setup();
    arena.placeAlly(3, 5);
    arena.fire('cookie', 0, 0.2);
    arena.fire('cookie', 0, 0.2);
    arena.fire('cookie', 0, 0.2);
    expect(arena.session.shotsLeft).toBe(0);
    for (let i = 0; i < 3 * 60; i++) arena.update(1 / 60);
    expect(arena.session.over).toBe(arena.shots.length === 0);
  });
});

describe('kings with tricks', () => {
  const kingLevel: Level = { ...quiet, max: 0, radius: 9, goals: [{ kind: 'boss' }], boss: { look: 'ladybug', hp: 3, radius: 1.2, speed: 0.6 } };
  const run = (arena: Arena, seconds: number, each?: (e: GameEvent) => void) => {
    for (let i = 0; i < seconds * 60; i++) for (const e of arena.update(1 / 60)) each?.(e);
  };

  it('every king is different, and the two kings of a world do not look alike', () => {
    const kings = LEVELS.filter((l) => l.boss).map((l) => l.boss!);
    expect(kings).toHaveLength(20);
    const traits = (b: (typeof kings)[number]) => JSON.stringify([b.look, !!b.charge, !!b.summon, !!b.shell, !!b.armor, !!b.regen, !!b.summonOnHit]);
    expect(new Set(kings.map(traits)).size).toBe(20);
    for (let w = 0; w < 10; w++) expect(kings[w * 2].look).not.toBe(kings[w * 2 + 1].look);
  });

  it('a charging king rears up, then runs much faster than it walks', () => {
    const arena = new Arena({ ...kingLevel, boss: { ...kingLevel.boss!, charge: { every: 1, time: 1 } } }, { seed: 3 });
    let rears = 0;
    let top = 0;
    run(arena, 5, (e) => e.type === 'rear' && rears++);
    arena.update(0);
    const king = arena.king!;
    for (let i = 0; i < 5 * 60; i++) {
      arena.update(1 / 60);
      top = Math.max(top, king.speed);
    }
    expect(rears).toBeGreaterThanOrEqual(1);
    expect(top).toBeGreaterThan(1.5);
  });

  it('a king wins a heart back when left alone, but not past its full hearts', () => {
    const arena = new Arena({ ...kingLevel, boss: { ...kingLevel.boss!, regen: { every: 2 } } }, { seed: 3 });
    const king = arena.king!;
    king.hp = 1;
    let heals = 0;
    run(arena, 7, (e) => e.type === 'heal' && heals++);
    expect(king.hp).toBe(3);
    expect(heals).toBe(2);
  });

  it('hitting a king shakes helpers loose', () => {
    const arena = new Arena({ ...kingLevel, boss: { ...kingLevel.boss!, summonOnHit: { kind: 'ant', count: 2 } } }, { seed: 3 });
    const king = arena.king!;
    const aim = aimAt(king.x, king.z);
    arena.fire('cookie', aim.yaw, aim.power);
    run(arena, 3);
    expect(king.hp).toBe(2);
    expect(arena.bugs.filter((b) => b.kind === 'ant')).toHaveLength(2);
  });
});

describe('weather', () => {
  const weather = (effects: Level['effects']): Level => ({ ...quiet, max: 0, effects });
  const run = (arena: Arena, seconds: number, each?: (e: GameEvent) => void) => {
    for (let i = 0; i < seconds * 60; i++) for (const e of arena.update(1 / 60)) each?.(e);
  };

  it('is planned: every third ordinary chapter from 12, kings from 25, never in the first chapters', () => {
    for (let n = 1; n < 12; n++) expect(effectsFor(n, n % 5 === 0)).toBeUndefined();
    expect(effectsFor(12, false)).toEqual(['fire']);
    expect(effectsFor(18, false)).toEqual(['dark']);
    expect(effectsFor(24, false)).toEqual(['smoke']);
    expect(effectsFor(20, true)).toBeUndefined();
    expect(effectsFor(25, true)).toEqual(['fire']);
    expect(effectsFor(50, true)).toEqual(['dark']);
    const kinds = new Set(LEVELS.flatMap((l) => l.effects ?? []));
    expect([...kinds].sort()).toEqual(['dark', 'fire', 'smoke']);
  });

  it('fire starts patches that burn out, and bugs running through one panic', () => {
    const arena = new Arena(weather(['fire']), { seed: 8 });
    let started = 0;
    run(arena, 6, (e) => e.type === 'flame' && started++);
    expect(started).toBeGreaterThanOrEqual(1);
    const flame = arena.flames[0];
    const bug = arena.addBug('snail', flame.x, flame.z, 0);
    bug.state = 'walk';
    run(arena, 3);
    // It may have run out of the flame by now, but it was scared.
    expect(bug.panic > 0 || Math.hypot(bug.x - flame.x, bug.z - flame.z) > 0.5).toBe(true);
    run(arena, 30);
    expect(arena.flames.length).toBeLessThanOrEqual(3);
  });

  it('the dark has fireflies, and food that touches one lights the world for a while', () => {
    const arena = new Arena(weather(['dark']), { seed: 8 });
    expect(arena.fireflies).toHaveLength(5);
    expect(arena.light).toBe(0);
    const f = arena.fireflies[0];
    let caught = 0;
    arena.launch(FOODS.cookie, { x: f.x, y: f.y, z: f.z }, { x: 0, y: 0, z: 0 });
    run(arena, 0.2, (e) => e.type === 'firefly' && caught++);
    expect(caught).toBe(1);
    expect(arena.light).toBeGreaterThan(LIGHT_TIME - 1);
    expect(arena.fireflies).toHaveLength(4);
    run(arena, 4);
    expect(arena.fireflies).toHaveLength(5);
    run(arena, LIGHT_TIME);
    expect(arena.light).toBe(0);
  });

  it('a chapter without weather has none of it', () => {
    const arena = new Arena(weather(undefined), { seed: 8 });
    run(arena, 12);
    expect(arena.flames).toHaveLength(0);
    expect(arena.fireflies).toHaveLength(0);
  });
});

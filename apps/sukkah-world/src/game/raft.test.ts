import { describe, expect, it } from 'vitest';
import { jumpRaft, CURRENT, JUG_SPOTS, RAFT_HALF_WIDTH, RIVER_HALF_WIDTH, RIVER_LENGTH, ROCKS, startRaft, stepRaft } from './raft';

/** Steers straight at the next jug that is still ahead. */
function autopilot(skip: number[] = []) {
  const raft = startRaft();
  const events = [];
  while (!raft.over) {
    const target = JUG_SPOTS.find((j, i) => j.s > raft.s - 0.5 && !skip.includes(i) && !raft.jugs.includes(i));
    const steer = target ? Math.sign(target.offset - raft.offset) * Math.min(1, Math.abs(target.offset - raft.offset) * 3) : 0;
    events.push(...stepRaft(raft, 1 / 60, steer, skip));
  }
  return { raft, events };
}

describe('raft ride', () => {
  it('floats down the whole river in about twenty seconds', () => {
    const raft = startRaft();
    let t = 0;
    while (!raft.over && t < 60) {
      stepRaft(raft, 0.1, 0);
      t += 0.1;
    }
    expect(raft.s).toBe(RIVER_LENGTH);
    expect(t).toBeGreaterThan(RIVER_LENGTH / CURRENT - 1);
    expect(t).toBeLessThan(RIVER_LENGTH / CURRENT + 4);
  });

  it('can collect every jug with good steering', () => {
    const { raft } = autopilot();
    expect(raft.jugs.sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('keeps the raft inside the river', () => {
    const raft = startRaft();
    for (let i = 0; i < 100; i++) stepRaft(raft, 0.05, 1);
    expect(raft.offset).toBeCloseTo(RIVER_HALF_WIDTH - RAFT_HALF_WIDTH);
  });

  it('slows down on a rock, once per rock', () => {
    const raft = startRaft();
    raft.s = ROCKS[0].s - 0.5;
    raft.offset = ROCKS[0].offset;
    const events = stepRaft(raft, 0.05, 0);
    expect(events).toContainEqual({ type: 'rock', index: 0 });
    expect(raft.bump).toBeGreaterThan(0);
    stepRaft(raft, 0.05, 0);
    expect(raft.speed).toBeLessThan(CURRENT);
    expect(stepRaft(raft, 0.05, 0).filter((e) => e.type === 'rock')).toEqual([]);
  });

  it('leaves out jugs collected on earlier rides', () => {
    const { raft } = autopilot([0, 2]);
    expect(raft.jugs.sort()).toEqual([1, 3, 4]);
  });

  it('jumps clean over a rock', () => {
    const raft = startRaft();
    raft.s = ROCKS[0].s - 1.5;
    raft.offset = ROCKS[0].offset;
    expect(jumpRaft(raft)).toBe(true);
    expect(jumpRaft(raft)).toBe(false);
    const events = [];
    for (let i = 0; i < 12; i++) events.push(...stepRaft(raft, 0.05, 0));
    expect(events.filter((e) => e.type === 'rock')).toEqual([]);
    expect(raft.s).toBeGreaterThan(ROCKS[0].s);
  });

  it('floats more slowly in the calm pace', () => {
    const fast = startRaft();
    const calm = startRaft();
    for (let i = 0; i < 20; i++) {
      stepRaft(fast, 0.1, 0);
      stepRaft(calm, 0.1, 0, [], 0.6);
    }
    expect(calm.s).toBeLessThan(fast.s * 0.7);
  });
});

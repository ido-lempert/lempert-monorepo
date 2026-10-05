import { describe, expect, it } from 'vitest';
import { emptyProgress, firstTime, parseProgress } from './progress';

describe('progress', () => {
  it('starts empty and survives bad saves', () => {
    expect(parseProgress(null)).toEqual(emptyProgress());
    expect(parseProgress('not json')).toEqual(emptyProgress());
    expect(parseProgress('{"seen":[1,"a"],"verdicts":"x"}')).toEqual({ v: 1, seen: ['a'], verdicts: [] });
  });

  it('shows a tip once', () => {
    const p = emptyProgress();
    expect(firstTime(p, 'bus')).toBe(true);
    expect(firstTime(p, 'bus')).toBe(false);
  });
});

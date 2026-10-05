/** What the player has seen and earned, saved in the browser. Migrations live in parseProgress. */
export interface Progress {
  v: 1;
  /** One-time tips already shown. */
  seen: string[];
  /** Verdict cards earned. */
  verdicts: string[];
}

export const emptyProgress = (): Progress => ({ v: 1, seen: [], verdicts: [] });

export function parseProgress(raw: string | null): Progress {
  if (!raw) return emptyProgress();
  try {
    const p = JSON.parse(raw) as Partial<Progress>;
    return { v: 1, seen: Array.isArray(p.seen) ? p.seen.filter((x) => typeof x === 'string') : [], verdicts: Array.isArray(p.verdicts) ? p.verdicts.filter((x) => typeof x === 'string') : [] };
  } catch {
    return emptyProgress();
  }
}

/** True the first time a tip is asked for, and marks it seen. */
export function firstTime(p: Progress, tip: string): boolean {
  if (p.seen.includes(tip)) return false;
  p.seen.push(tip);
  return true;
}

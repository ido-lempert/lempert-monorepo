/** Seeded random numbers (mulberry32): the same seed always gives the same night, so a night can be replayed exactly. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A whole number from min to max (both included). */
export const between = (next: () => number, min: number, max: number) => min + Math.floor(next() * (max - min + 1));

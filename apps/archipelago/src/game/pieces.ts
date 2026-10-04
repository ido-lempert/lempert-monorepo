import type { Kind, Shape } from './types';

/** Clients (and publishers) only start messages; they never pass one on. */
export const CLIENTS: readonly Kind[] = ['phone', 'laptop', 'crowd', 'shop'];

/** Kinds a request can travel through on its way to somewhere else. */
export const FORWARDS: readonly Kind[] = ['server', 'adapter', 'facade', 'cache', 'lb', 'broker', 'queue', 'guard', 'lock', 'zip'];

/** Wrappers (decorators): a request that passes through one comes out wearing a layer of it. */
export const WRAPPERS: readonly Kind[] = ['lock', 'zip'];

/** Kinds that do the work and so get tired: their load counts against a level's capacity. */
export const WORKERS: readonly Kind[] = ['server', 'stock'];

/** Time units for a visit to the (slow) database, and for an answer straight from a cache. */
export const DB_TIME = 4;
export const HIT_TIME = 1;

export const isClient = (k: Kind) => CLIENTS.includes(k);

/** The plug of a kind, or null for one that fits everything (the adapter). */
export function shapeOf(kind: Kind): Shape | null {
  if (kind === 'adapter') return null;
  return kind === 'bank' ? 'square' : 'round';
}

export function fits(from: Kind, to: Kind): boolean {
  const a = shapeOf(from);
  const b = shapeOf(to);
  return a === null || b === null || a === b;
}

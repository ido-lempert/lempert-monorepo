import type { Kind, Shape } from './types';

/** Clients only start requests; they never pass one on. */
export const CLIENTS: readonly Kind[] = ['phone', 'laptop'];

/** Kinds a request can travel through on its way to somewhere else. */
export const FORWARDS: readonly Kind[] = ['server', 'adapter'];

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

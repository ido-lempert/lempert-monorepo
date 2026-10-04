/**
 * The vocabulary of a level: pieces (components with a face), pads to put new pieces on, and edges
 * between pieces. An edge A→B means "A calls B", so its arrow is also the direction of the dependency.
 */

export type Kind = 'phone' | 'laptop' | 'server' | 'db' | 'adapter' | 'bank';

/** The plug on a piece. An edge only works when the caller's plug fits the callee's socket. */
export type Shape = 'round' | 'square';

export type Vec2 = [number, number];

export interface PieceDef {
  id: string;
  kind: Kind;
  at: Vec2;
}

export interface Pad {
  id: string;
  at: Vec2;
}

export interface Edge {
  from: string;
  to: string;
}

/** A request that must travel from a client to a target and come back with an answer. */
export interface Flow {
  from: string;
  to: string;
}

export type Rule = 'noDirectDb';

export type ConceptId = 'threeTier' | 'noShortcuts' | 'adapter';

export interface LevelDef {
  id: string;
  island: number;
  /** Pieces that are already on the island and can't be moved. */
  pieces: PieceDef[];
  pads: Pad[];
  /** Pieces the player gets to place. */
  tray: Kind[];
  /** Edges that are there at the start (the player may remove them). */
  edges: Edge[];
  flows: Flow[];
  rules: Rule[];
  concept: ConceptId;
  /** A known solution, checked by the tests. */
  solution: Build;
}

/** What the player has built: which kind stands on which pad, and the edges. */
export interface Build {
  placed: Record<string, Kind>;
  edges: Edge[];
}

export type FailReason = 'noPath' | 'reversed' | 'shape' | 'exposedDb';

export interface Trip {
  flow: Flow;
  /** Node ids from the client to wherever the request got. */
  path: string[];
  ok: boolean;
  fail?: FailReason;
  /** For 'shape': the edge whose plug doesn't fit. */
  edge?: Edge;
}

export interface Problem {
  reason: FailReason;
  edge: Edge;
}

export interface RunResult {
  ok: boolean;
  trips: Trip[];
  /** Rule breaks that don't depend on a single request (an exposed database). */
  problems: Problem[];
}

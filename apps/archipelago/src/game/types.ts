/**
 * The vocabulary of a level: pieces (components with a face), pads to put new pieces on, and edges
 * between pieces. An edge A→B means "A calls B", so its arrow is also the direction of the dependency.
 */

export type Kind = 'phone' | 'laptop' | 'crowd' | 'server' | 'db' | 'adapter' | 'bank' | 'facade' | 'pay' | 'stock' | 'ship' | 'cache' | 'lb' | 'shop' | 'broker' | 'queue' | 'email' | 'analytics' | 'guard' | 'lock' | 'zip' | 'logbook';

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
  /** The target piece; ignored (set it to '') when `toKind` is given, and filled in with the piece reached. */
  to: string;
  /** Any piece of this kind will do as the target (the player decides where it stands). */
  toKind?: Kind;
  /** Kinds the request must pass through on its way (wrappers that each add something to it). */
  via?: Kind[];
  /** How many requests of this kind are sent (default 1). */
  count?: number;
}

/** An event: sent once by a publisher, it must reach every subscriber and gets no answer. */
export interface EventFlow {
  from: string;
  to: string[];
  count?: number;
}

/** noDirectDb: clients never touch the database. singleAddress: a client knows one address only. */
export type Rule = 'noDirectDb' | 'singleAddress';

export type ConceptId =
  | 'threeTier'
  | 'noShortcuts'
  | 'adapter'
  | 'facade'
  | 'cache'
  | 'loadBalancer'
  | 'pubSub'
  | 'queue'
  | 'eventDriven'
  | 'proxy'
  | 'decorator'
  | 'singleton'
  | 'middleware';

/** Every edge into a piece of kind `target` must come from a piece of kind `via` (a guard at the door). */
export interface Gate {
  target: Kind;
  via: Kind;
}

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
  /** Events (the events island); a level has flows, events or both. */
  events?: EventFlow[];
  rules: Rule[];
  gates?: Gate[];
  /** Kinds of which only one piece may stand on the island. */
  single?: Kind[];
  concept: ConceptId;
  /** Requests one server can handle in a run (unlimited when missing). */
  capacity?: number;
  /** Time units every request together may take (unlimited when missing); see DB_TIME and HIT_TIME. */
  timeLimit?: number;
  /** A known solution, checked by the tests. */
  solution: Build;
}

/** What the player has built: which kind stands on which pad, and the edges. */
export interface Build {
  placed: Record<string, Kind>;
  edges: Edge[];
}

export type FailReason = 'noPath' | 'reversed' | 'shape' | 'exposedDb' | 'twoAddresses' | 'overload' | 'tooSlow' | 'unguarded' | 'duplicate' | 'unwrapped';

export interface Trip {
  flow: Flow;
  /** Node ids from the client to wherever the request got. */
  path: string[];
  ok: boolean;
  fail?: FailReason;
  /** For 'shape': the edge whose plug doesn't fit. */
  edge?: Edge;
  /** Answered by a cache on the way, without going all the way. */
  hit?: boolean;
  /** Time units this request took, and the clock when it was answered (levels with a time limit). */
  cost?: number;
  doneAt?: number;
  /** One copy of an event (no answer comes back); `group` is which event it is a copy of. */
  event?: boolean;
  group?: number;
  /** Place in line at a queue on the way (0 = first). */
  queued?: number;
}

export interface Problem {
  reason: FailReason;
  /** The edge that breaks a rule, or the extra piece (`piece`) of a kind that may stand only once. */
  edge?: Edge;
  piece?: string;
}

export interface RunResult {
  ok: boolean;
  trips: Trip[];
  /** Rule breaks that don't depend on a single request (an exposed database). */
  problems: Problem[];
}

/**
 * The levels. The island has three terraces from front to back (presentation, logic, data), so the
 * three tiers are also three steps you can see.
 */
import type { LevelDef } from './types';

export const LEVELS: LevelDef[] = [
  {
    // Three tiers: the phone asks the server, the server asks the database.
    id: 'l1',
    island: 1,
    pieces: [
      { id: 'phone', kind: 'phone', at: [0, 3.3] },
      { id: 'db', kind: 'db', at: [0, -3.3] },
    ],
    pads: [{ id: 'p1', at: [0, 0] }],
    tray: ['server'],
    edges: [],
    flows: [{ from: 'phone', to: 'db' }],
    rules: ['noDirectDb'],
    concept: 'threeTier',
    solution: {
      placed: { p1: 'server' },
      edges: [
        { from: 'phone', to: 'p1' },
        { from: 'p1', to: 'db' },
      ],
    },
  },
  {
    // Two clients share one server; someone has already wired the laptop straight to the database.
    id: 'l2',
    island: 1,
    pieces: [
      { id: 'phone', kind: 'phone', at: [-2.4, 3.3] },
      { id: 'laptop', kind: 'laptop', at: [2.4, 3.3] },
      { id: 'db', kind: 'db', at: [0, -3.3] },
    ],
    pads: [{ id: 'p1', at: [0, 0] }],
    tray: ['server'],
    edges: [{ from: 'laptop', to: 'db' }],
    flows: [
      { from: 'phone', to: 'db' },
      { from: 'laptop', to: 'db' },
    ],
    rules: ['noDirectDb'],
    concept: 'noShortcuts',
    solution: {
      placed: { p1: 'server' },
      edges: [
        { from: 'phone', to: 'p1' },
        { from: 'laptop', to: 'p1' },
        { from: 'p1', to: 'db' },
      ],
    },
  },
  {
    // The old bank has a square socket; the adapter lets the round-plugged server talk to it.
    id: 'l3',
    island: 1,
    pieces: [
      { id: 'phone', kind: 'phone', at: [0, 3.3] },
      { id: 'db', kind: 'db', at: [-2.6, -3.3] },
      { id: 'bank', kind: 'bank', at: [2.6, -3.3] },
    ],
    pads: [
      { id: 'p1', at: [-1.3, 0] },
      { id: 'p2', at: [2.3, 0] },
    ],
    tray: ['server', 'adapter'],
    edges: [],
    flows: [
      { from: 'phone', to: 'db' },
      { from: 'phone', to: 'bank' },
    ],
    rules: ['noDirectDb'],
    concept: 'adapter',
    solution: {
      placed: { p1: 'server', p2: 'adapter' },
      edges: [
        { from: 'phone', to: 'p1' },
        { from: 'p1', to: 'db' },
        { from: 'p1', to: 'p2' },
        { from: 'p2', to: 'bank' },
      ],
    },
  },
];

export const levelById = (id: string) => LEVELS.find((l) => l.id === id);

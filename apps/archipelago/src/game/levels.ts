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
  {
    // The app is wired to three systems by itself; a facade (an order desk) gives it one door.
    id: 'l4',
    island: 1,
    pieces: [
      { id: 'phone', kind: 'phone', at: [0, 3.3] },
      { id: 'pay', kind: 'pay', at: [-3.2, -3.3] },
      { id: 'stock', kind: 'stock', at: [0, -3.4] },
      { id: 'ship', kind: 'ship', at: [3.2, -3.3] },
    ],
    pads: [{ id: 'p1', at: [0, 0] }],
    tray: ['facade'],
    edges: [
      { from: 'phone', to: 'pay' },
      { from: 'phone', to: 'stock' },
      { from: 'phone', to: 'ship' },
    ],
    flows: [
      { from: 'phone', to: 'stock' },
      { from: 'phone', to: 'pay' },
      { from: 'phone', to: 'ship' },
    ],
    rules: ['singleAddress'],
    concept: 'facade',
    solution: {
      placed: { p1: 'facade' },
      edges: [
        { from: 'phone', to: 'p1' },
        { from: 'p1', to: 'pay' },
        { from: 'p1', to: 'stock' },
        { from: 'p1', to: 'ship' },
      ],
    },
  },
  {
    // The database is slow and everyone asks the same thing: a cache answers all but the first.
    id: 'l5',
    island: 1,
    pieces: [
      { id: 'phone', kind: 'phone', at: [0, 3.3] },
      { id: 's', kind: 'server', at: [-1.8, 0] },
      { id: 'db', kind: 'db', at: [0, -3.3] },
    ],
    pads: [{ id: 'p1', at: [2, 0] }],
    tray: ['cache'],
    edges: [
      { from: 'phone', to: 's' },
      { from: 's', to: 'db' },
    ],
    flows: [{ from: 'phone', to: 'db', count: 4 }],
    rules: ['noDirectDb'],
    timeLimit: 8,
    concept: 'cache',
    solution: {
      placed: { p1: 'cache' },
      edges: [
        { from: 'phone', to: 's' },
        { from: 's', to: 'p1' },
        { from: 'p1', to: 'db' },
      ],
    },
  },
  {
    // Six requests at once and a server that holds three: a load balancer shares them between two.
    id: 'l6',
    island: 1,
    pieces: [
      { id: 'crowd', kind: 'crowd', at: [0, 4.1] },
      { id: 's0', kind: 'server', at: [-2.3, 0] },
      { id: 'db', kind: 'db', at: [0, -3.3] },
    ],
    pads: [
      { id: 'p1', at: [0, 2.2] },
      { id: 'p2', at: [2.3, 0] },
    ],
    tray: ['lb', 'server'],
    edges: [
      { from: 'crowd', to: 's0' },
      { from: 's0', to: 'db' },
    ],
    flows: [{ from: 'crowd', to: 'db', count: 6 }],
    rules: ['singleAddress', 'noDirectDb'],
    capacity: 3,
    concept: 'loadBalancer',
    solution: {
      placed: { p1: 'lb', p2: 'server' },
      edges: [
        { from: 'crowd', to: 'p1' },
        { from: 'p1', to: 's0' },
        { from: 'p1', to: 'p2' },
        { from: 's0', to: 'db' },
        { from: 'p2', to: 'db' },
      ],
    },
  },
];

export const levelById = (id: string) => LEVELS.find((l) => l.id === id);

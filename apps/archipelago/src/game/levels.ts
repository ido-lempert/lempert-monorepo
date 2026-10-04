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
  // --- The events island: one-way messages (paper planes), brokers and queues. -------------------------
  {
    // The shop has a single way out, and three services need to hear about every order.
    id: 'e1',
    island: 2,
    pieces: [
      { id: 'shop', kind: 'shop', at: [0, 3.4] },
      { id: 'email', kind: 'email', at: [-3.2, -3.2] },
      { id: 'stock', kind: 'stock', at: [0, -3.5] },
      { id: 'stats', kind: 'analytics', at: [3.2, -3.2] },
    ],
    pads: [{ id: 'p1', at: [0, 0] }],
    tray: ['broker'],
    edges: [],
    flows: [],
    events: [{ from: 'shop', to: ['email', 'stock', 'stats'] }],
    rules: ['singleAddress'],
    concept: 'pubSub',
    solution: {
      placed: { p1: 'broker' },
      edges: [
        { from: 'shop', to: 'p1' },
        { from: 'p1', to: 'email' },
        { from: 'p1', to: 'stock' },
        { from: 'p1', to: 'stats' },
      ],
    },
  },
  {
    // A burst of six orders and a warehouse that handles two at a time: a queue lets it catch up.
    id: 'e2',
    island: 2,
    pieces: [
      { id: 'shop', kind: 'shop', at: [0, 3.4] },
      { id: 'stock', kind: 'stock', at: [0, -3.4] },
    ],
    pads: [{ id: 'p1', at: [0, 0] }],
    tray: ['queue'],
    edges: [{ from: 'shop', to: 'stock' }],
    flows: [],
    events: [{ from: 'shop', to: ['stock'], count: 6 }],
    rules: ['singleAddress'],
    capacity: 2,
    concept: 'queue',
    solution: {
      placed: { p1: 'queue' },
      edges: [
        { from: 'shop', to: 'p1' },
        { from: 'p1', to: 'stock' },
      ],
    },
  },
  {
    // Both together: e-mails go out at once, the slow warehouse gets its own queue.
    id: 'e3',
    island: 2,
    pieces: [
      { id: 'shop', kind: 'shop', at: [0, 3.6] },
      { id: 'email', kind: 'email', at: [-2.8, -3.3] },
      { id: 'stock', kind: 'stock', at: [2.8, -3.3] },
    ],
    pads: [
      { id: 'p1', at: [0, 1.0] },
      { id: 'p2', at: [2.6, -0.9] },
    ],
    tray: ['broker', 'queue'],
    edges: [],
    flows: [],
    events: [{ from: 'shop', to: ['email', 'stock'], count: 6 }],
    rules: ['singleAddress'],
    capacity: 2,
    concept: 'eventDriven',
    solution: {
      placed: { p1: 'broker', p2: 'queue' },
      edges: [
        { from: 'shop', to: 'p1' },
        { from: 'p1', to: 'email' },
        { from: 'p1', to: 'p2' },
        { from: 'p2', to: 'stock' },
      ],
    },
  },
];

export const levelById = (id: string) => LEVELS.find((l) => l.id === id);

export const ISLANDS = [1, 2] as const;

export const levelsOf = (island: number) => LEVELS.filter((l) => l.island === island);

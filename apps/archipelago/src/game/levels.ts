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
  {
    // Proxy: payments may only be reached through a guard that checks who is asking.
    id: 'w1',
    island: 3,
    pieces: [
      { id: 'phone', kind: 'phone', at: [-2.4, 3.4] },
      { id: 'laptop', kind: 'laptop', at: [2.4, 3.4] },
      { id: 'pay', kind: 'pay', at: [0, -3.4] },
    ],
    pads: [{ id: 'p1', at: [0, 0] }],
    tray: ['guard'],
    edges: [
      { from: 'phone', to: 'pay' },
      { from: 'laptop', to: 'pay' },
    ],
    flows: [
      { from: 'phone', to: 'pay' },
      { from: 'laptop', to: 'pay' },
    ],
    rules: [],
    gates: [{ target: 'pay', via: 'guard' }],
    concept: 'proxy',
    solution: {
      placed: { p1: 'guard' },
      edges: [
        { from: 'phone', to: 'p1' },
        { from: 'laptop', to: 'p1' },
        { from: 'p1', to: 'pay' },
      ],
    },
  },
  {
    // Decorator: the payment has to be locked and squeezed on its way; wrappers share a plug, the old bank still needs an adapter.
    id: 'w2',
    island: 3,
    pieces: [
      { id: 'phone', kind: 'phone', at: [0, 3.8] },
      { id: 'bank', kind: 'bank', at: [0, -3.9] },
    ],
    pads: [
      { id: 'p1', at: [-2.3, 1.9] },
      { id: 'p2', at: [2.3, 0.3] },
      { id: 'p3', at: [-2.3, -1.4] },
    ],
    tray: ['lock', 'zip', 'adapter'],
    edges: [],
    flows: [{ from: 'phone', to: 'bank', via: ['lock', 'zip'] }],
    rules: [],
    concept: 'decorator',
    solution: {
      placed: { p1: 'lock', p2: 'zip', p3: 'adapter' },
      edges: [
        { from: 'phone', to: 'p1' },
        { from: 'p1', to: 'p2' },
        { from: 'p2', to: 'p3' },
        { from: 'p3', to: 'bank' },
      ],
    },
  },
  {
    // Singleton: everyone writes to the same logbook; three logbooks would scatter the story.
    id: 'w3',
    island: 3,
    pieces: [
      { id: 'stock', kind: 'stock', at: [-3.7, -3.2] },
      { id: 'pay', kind: 'pay', at: [0, -3.6] },
      { id: 'ship', kind: 'ship', at: [3.7, -3.2] },
    ],
    pads: [
      { id: 'p1', at: [-3.7, 0.9] },
      { id: 'p2', at: [0, 0.9] },
      { id: 'p3', at: [3.7, 0.9] },
    ],
    tray: ['logbook', 'logbook', 'logbook'],
    edges: [],
    flows: [
      { from: 'stock', to: '', toKind: 'logbook' },
      { from: 'pay', to: '', toKind: 'logbook' },
      { from: 'ship', to: '', toKind: 'logbook' },
    ],
    rules: [],
    single: ['logbook'],
    concept: 'singleton',
    solution: {
      placed: { p2: 'logbook' },
      edges: [
        { from: 'stock', to: 'p2' },
        { from: 'pay', to: 'p2' },
        { from: 'ship', to: 'p2' },
      ],
    },
  },
  {
    // Middleware: a chain of wrappers, with the guard standing right at the door of payments.
    id: 'w4',
    island: 3,
    pieces: [
      { id: 'phone', kind: 'phone', at: [-2.7, 3.7] },
      { id: 'laptop', kind: 'laptop', at: [2.7, 3.7] },
      { id: 'pay', kind: 'pay', at: [0, -4.0] },
    ],
    pads: [
      { id: 'p1', at: [-0.2, -1.6] },
      { id: 'p2', at: [-2.0, 1.6] },
      { id: 'p3', at: [2.0, 0.1] },
    ],
    tray: ['guard', 'lock', 'zip'],
    edges: [{ from: 'laptop', to: 'pay' }],
    flows: [
      { from: 'phone', to: 'pay', via: ['lock', 'zip'] },
      { from: 'laptop', to: 'pay', via: ['lock', 'zip'] },
    ],
    rules: [],
    gates: [{ target: 'pay', via: 'guard' }],
    concept: 'middleware',
    solution: {
      placed: { p1: 'guard', p2: 'lock', p3: 'zip' },
      edges: [
        { from: 'phone', to: 'p2' },
        { from: 'laptop', to: 'p2' },
        { from: 'p2', to: 'p3' },
        { from: 'p3', to: 'p1' },
        { from: 'p1', to: 'pay' },
      ],
    },
  },
];

export const levelById = (id: string) => LEVELS.find((l) => l.id === id);

export const ISLANDS = [1, 2, 3] as const;

export const levelsOf = (island: number) => LEVELS.filter((l) => l.island === island);

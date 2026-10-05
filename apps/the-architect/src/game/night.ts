/**
 * One restaurant night, minute by minute. Pure and deterministic: the same definition, seed and card plays
 * always give the same night, so a night can be replayed and tested.
 *
 * The restaurant is the system: groups of guests are clients, the host seats them (load balancer), waiters
 * take orders, serve and bring the bill (API instances), tickets wait on the rail for the cooks (a queue in
 * front of workers).
 */
import { between, rng } from './rng';

export type CardId = 'extraWaiter';

export interface CardDef {
  /** What the card costs for the night, in shekels. */
  money: number;
}

export const CARDS: Record<CardId, CardDef> = {
  extraWaiter: { money: 300 },
};

export interface NightDef {
  seed: number;
  tables: number;
  waiters: number;
  cooks: number;
  /** Minutes after opening when the doors close to new guests. */
  lastArrival: number;
  /** Regular guests: a group arrives every `every` minutes on average. */
  every: number;
  /** The announced rush (the tour bus): `groups` groups arriving from minute `at` over `over` minutes. */
  peak: { at: number; groups: number; over: number };
  /** Price per guest, and the night's fixed wages for the base staff. */
  price: number;
  wages: number;
  /** Minutes a waiter spends on each job, and a cook on each dish. */
  takeOrder: number;
  serve: number;
  bill: number;
  cook: number;
  /** Minutes a group eats (inclusive range). */
  eat: [number, number];
  /** Minutes a group waits at the door, or seated for its order to be taken, before walking out. */
  doorPatience: number;
  patience: number;
}

/** The first night: a calm evening, then a tour bus at 20:00. */
export const FIRST_NIGHT: NightDef = {
  seed: 20260,
  tables: 8,
  waiters: 1,
  cooks: 2,
  lastArrival: 195,
  every: 11,
  peak: { at: 120, groups: 8, over: 15 },
  price: 85,
  wages: 900,
  takeOrder: 4,
  serve: 3,
  bill: 3,
  cook: 9,
  eat: [18, 26],
  doorPatience: 32,
  patience: 15,
};

export const OPENS_AT = 18 * 60;

export type GroupState = 'door' | 'seated' | 'ordered' | 'eating' | 'bill' | 'gone';
export type Mood = 'happy' | 'ok' | 'unhappy' | 'angry';

export interface Group {
  id: number;
  size: number;
  arrives: number;
  eats: number;
  state: GroupState;
  table: number | null;
  /** When the group started waiting for whatever it waits for now. */
  since: number;
  /** Minutes spent waiting for staff so far. */
  waited: number;
  mood: Mood | null;
}

export type JobKind = 'takeOrder' | 'serve' | 'bill';

export interface Job {
  kind: JobKind;
  group: number;
  /** When the group started waiting for this job. */
  since: number;
  from: number;
  until: number;
}

export interface Waiter {
  id: number;
  /** The minute this waiter started work (later for a waiter called in mid-night). */
  joined: number;
  job: Job | null;
}

export interface Ticket {
  group: number;
  /** Minute it reached the rail, started cooking (or null) and was ready at the pass (or null). */
  placed: number;
  cooking: number | null;
  ready: number | null;
  cook: number | null;
}

export type EventKind = 'arrive' | 'seat' | 'order' | 'cooked' | 'served' | 'paid' | 'leftDoor' | 'leftTable' | 'card';

export interface NightEvent {
  t: number;
  kind: EventKind;
  group?: number;
  table?: number;
  waiter?: number;
  card?: CardId;
}

export interface Summary {
  revenue: number;
  wages: number;
  cards: number;
  profit: number;
  served: number;
  happy: number;
  unhappy: number;
  leftAngry: number;
  /** Change in reputation stars over the night. */
  reputation: number;
  /** Average minutes a served group waited for staff. */
  avgWait: number;
}

export interface CardPlay {
  card: CardId;
  at: number;
}

const REP_PER_POINT = 0.05;

export class Night {
  t = 0;
  readonly groups: Group[] = [];
  readonly waiters: Waiter[] = [];
  readonly tickets: Ticket[] = [];
  readonly tables: (number | null)[];
  readonly log: NightEvent[] = [];
  readonly plays: CardPlay[] = [];
  revenue = 0;
  repPoints = 0;
  done = false;
  private readonly cooksBusy: (number | null)[];

  constructor(readonly def: NightDef) {
    this.tables = Array.from({ length: def.tables }, () => null);
    this.cooksBusy = Array.from({ length: def.cooks }, () => null);
    for (let i = 0; i < def.waiters; i++) this.waiters.push({ id: i, joined: 0, job: null });
    const next = rng(def.seed);
    const arrivals: number[] = [];
    for (let t = between(next, 2, 6); t <= def.lastArrival; t += between(next, Math.ceil(def.every / 2), Math.floor(def.every * 1.5))) arrivals.push(t);
    for (let i = 0; i < def.peak.groups; i++) arrivals.push(def.peak.at + Math.floor((i * def.peak.over) / def.peak.groups));
    arrivals.sort((a, b) => a - b);
    arrivals.forEach((at, id) => {
      this.groups.push({ id, size: between(next, 1, 2), arrives: at, eats: between(next, def.eat[0], def.eat[1]), state: 'gone', table: null, since: at, waited: 0, mood: null });
    });
    // Nobody is in yet: groups become real when they arrive.
    for (const g of this.groups) g.state = 'gone';
  }

  /** Plays a card from this minute on. Each card once per night. */
  play(card: CardId): boolean {
    if (this.done || this.plays.some((p) => p.card === card)) return false;
    this.plays.push({ card, at: this.t });
    this.log.push({ t: this.t, kind: 'card', card });
    if (card === 'extraWaiter') this.waiters.push({ id: this.waiters.length, joined: this.t, job: null });
    return true;
  }

  /** Groups that have come in and not left. */
  present(): Group[] {
    return this.groups.filter((g) => g.state !== 'gone' && g.arrives <= this.t);
  }

  /** Advances one minute. */
  step() {
    if (this.done) return;
    const t = ++this.t;
    const d = this.def;

    for (const g of this.groups) if (g.arrives === t) {
      g.state = 'door';
      g.since = t;
      this.log.push({ t, kind: 'arrive', group: g.id });
    }

    // Finished jobs.
    for (const w of this.waiters) {
      const job = w.job;
      if (!job || job.until > t) continue;
      w.job = null;
      const g = this.groups[job.group];
      if (job.kind === 'takeOrder') {
        g.state = 'ordered';
        this.tickets.push({ group: g.id, placed: t, cooking: null, ready: null, cook: null });
        this.log.push({ t, kind: 'order', group: g.id, waiter: w.id });
      } else if (job.kind === 'serve') {
        g.state = 'eating';
        g.since = t;
        this.tickets.splice(this.tickets.findIndex((k) => k.group === g.id), 1);
        this.log.push({ t, kind: 'served', group: g.id, waiter: w.id });
      } else {
        this.revenue += g.size * d.price;
        g.mood = g.waited <= 12 ? 'happy' : g.waited <= 28 ? 'ok' : 'unhappy';
        this.repPoints += g.mood === 'happy' ? 1 : g.mood === 'unhappy' ? -1 : 0;
        this.leave(g, 'paid', w.id);
      }
    }

    for (const g of this.groups) if (g.state === 'eating' && t - g.since >= g.eats) {
      g.state = 'bill';
      g.since = t;
    }

    // Cooks finish dishes and start the next ticket on the rail.
    this.cooksBusy.forEach((ticket, c) => {
      if (ticket === null) return;
      const k = this.tickets.find((x) => x.group === ticket)!;
      if (t - k.cooking! >= d.cook) {
        k.ready = t;
        this.cooksBusy[c] = null;
        this.log.push({ t, kind: 'cooked', group: k.group });
      }
    });
    this.cooksBusy.forEach((ticket, c) => {
      if (ticket !== null) return;
      const k = this.tickets.find((x) => x.cooking === null);
      if (!k) return;
      k.cooking = t;
      k.cook = c;
      this.cooksBusy[c] = k.group;
    });

    // The host seats waiting groups at free tables, first come first served.
    for (const g of this.groups) {
      if (g.state !== 'door') continue;
      const table = this.tables.indexOf(null);
      if (table < 0) break;
      this.tables[table] = g.id;
      g.table = table;
      g.state = 'seated';
      g.since = t;
      this.log.push({ t, kind: 'seat', group: g.id, table });
    }

    // Patience runs out at the door, or seated with nobody coming to take the order.
    for (const g of this.groups) {
      if (g.state === 'door' && t - g.since > d.doorPatience) this.walkOut(g, 'leftDoor');
      else if (g.state === 'seated' && t - g.since > d.patience && !this.busyWith(g.id)) this.walkOut(g, 'leftTable');
    }

    // Free waiters take the oldest job that nobody is doing.
    for (const w of this.waiters) {
      if (w.job || w.joined > t) continue;
      const job = this.nextJob();
      if (!job) break;
      const g = this.groups[job.group];
      g.waited += t - job.since;
      const length = job.kind === 'takeOrder' ? d.takeOrder : job.kind === 'serve' ? d.serve : d.bill;
      w.job = { ...job, from: t, until: t + length };
    }

    this.done = t > d.lastArrival && this.groups.every((g) => g.state === 'gone');
  }

  /** Runs to the end of the night. */
  finish(): this {
    while (!this.done) {
      for (const p of this.pending) if (p.at === this.t) this.play(p.card);
      this.step();
    }
    return this;
  }

  /** Card plays to make when `finish` reaches their minute (for replays and tests). */
  pending: CardPlay[] = [];

  summary(): Summary {
    const served = this.groups.filter((g) => g.mood !== null && g.mood !== 'angry');
    const cards = this.plays.reduce((sum, p) => sum + CARDS[p.card].money, 0);
    const wages = this.def.wages;
    return {
      revenue: this.revenue,
      wages,
      cards,
      profit: this.revenue - wages - cards,
      served: served.length,
      happy: served.filter((g) => g.mood === 'happy').length,
      unhappy: served.filter((g) => g.mood === 'unhappy').length,
      leftAngry: this.groups.filter((g) => g.mood === 'angry').length,
      reputation: Math.round(this.repPoints * REP_PER_POINT * 100) / 100,
      avgWait: served.length ? Math.round(served.reduce((s, g) => s + g.waited, 0) / served.length) : 0,
    };
  }

  /** The waiter (if any) working for a group right now. */
  busyWith(group: number): Waiter | undefined {
    return this.waiters.find((w) => w.job?.group === group);
  }

  private nextJob(): Omit<Job, 'from' | 'until'> | null {
    const taken = new Set(this.waiters.filter((w) => w.job).map((w) => `${w.job!.kind}:${w.job!.group}`));
    const open: { kind: JobKind; group: number; since: number }[] = [];
    for (const g of this.groups) {
      if (g.state === 'seated') open.push({ kind: 'takeOrder', group: g.id, since: g.since });
      if (g.state === 'bill') open.push({ kind: 'bill', group: g.id, since: g.since });
    }
    for (const k of this.tickets) if (k.ready !== null) open.push({ kind: 'serve', group: k.group, since: k.ready });
    const free = open.filter((j) => !taken.has(`${j.kind}:${j.group}`)).sort((a, b) => a.since - b.since || a.group - b.group);
    return free[0] ?? null;
  }

  private walkOut(g: Group, kind: 'leftDoor' | 'leftTable') {
    g.mood = 'angry';
    this.repPoints -= 3;
    this.leave(g, kind);
  }

  private leave(g: Group, kind: EventKind, waiter?: number) {
    if (g.table !== null) this.tables[g.table] = null;
    this.log.push({ t: this.t, kind, group: g.id, table: g.table ?? undefined, waiter });
    g.state = 'gone';
  }
}

/** Plays a whole night with the given card plays. */
export function playNight(def: NightDef, plays: CardPlay[] = []): Night {
  const n = new Night(def);
  n.pending = plays;
  return n.finish();
}

/** "20:05" for a minute of the night. */
export function clock(t: number): string {
  const m = OPENS_AT + t;
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

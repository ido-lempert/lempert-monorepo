/**
 * One restaurant night, minute by minute. Pure and deterministic: the same definition, seed and card plays
 * always give the same night, so a night can be replayed and tested.
 *
 * The restaurant is the system: groups of guests are clients, the host seats them (load balancer), waiters
 * take orders, serve and bring the bill (API instances), tickets wait on the rail for the cooks (a queue in
 * front of workers), and the salmon count on the stock board is a database row the waiters read and write.
 *
 * The race: a waiter reads the board when a guest asks for salmon, promises it if the board says there is
 * some, and writes the new count only when the order is done (read-modify-write with a gap). One waiter works
 * one order at a time, so the board is always right; two waiters can both read "1" in the gap.
 */
import { between, rng } from './rng';

export type CardId = 'extraWaiter' | 'checkFirst' | 'lock';

export interface CardDef {
  /** What the card costs for the night, in shekels. */
  money: number;
}

export const CARDS: Record<CardId, CardDef> = {
  extraWaiter: { money: 300 },
  checkFirst: { money: 0 },
  lock: { money: 50 },
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
  /** Salmon portions in the fridge (and on the board) at opening, and the share of groups that ask for it. */
  salmon: number;
  salmonShare: number;
  /** What a table that was promised a dish the kitchen doesn't have costs in vouchers. */
  compensation: number;
  /** Extra minutes per salmon order when waiters check the fridge first. */
  checkTime: number;
}

/** The first night: a calm evening, then a tour bus at 20:00. Salmon is the house dish and runs out. */
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
  salmon: 8,
  salmonShare: 0.25,
  compensation: 120,
  checkTime: 1,
};

export const OPENS_AT = 18 * 60;

export type GroupState = 'door' | 'seated' | 'ordered' | 'eating' | 'bill' | 'gone';
export type Mood = 'happy' | 'ok' | 'unhappy' | 'angry';
export type Dish = 'salmon' | 'other';

export interface Group {
  id: number;
  size: number;
  arrives: number;
  eats: number;
  /** What the group asks for first; it takes the other dish when the board says salmon is gone. */
  wantsSalmon: boolean;
  dish: Dish | null;
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
  /** For a salmon order: the count this waiter read on the board (null while waiting for the marker). */
  read?: number | null;
}

export interface Waiter {
  id: number;
  /** The minute this waiter started work (later for a waiter called in mid-night). */
  joined: number;
  job: Job | null;
}

export interface Ticket {
  group: number;
  dish: Dish;
  /** Minute it reached the rail, started cooking (or null) and was ready at the pass (or null). */
  placed: number;
  cooking: number | null;
  ready: number | null;
  cook: number | null;
}

export type EventKind =
  | 'arrive'
  | 'seat'
  | 'order'
  | 'read'
  | 'write'
  | 'lockWait'
  | 'cooking'
  | 'cooked'
  | 'noStock'
  | 'served'
  | 'paid'
  | 'leftDoor'
  | 'leftTable'
  | 'card';

export interface NightEvent {
  t: number;
  kind: EventKind;
  group?: number;
  table?: number;
  waiter?: number;
  cook?: number;
  card?: CardId;
  /** The salmon count read or written on the board. */
  value?: number;
  dish?: Dish;
}

export interface Summary {
  revenue: number;
  wages: number;
  cards: number;
  compensation: number;
  profit: number;
  served: number;
  happy: number;
  unhappy: number;
  /** Groups that walked out, for any reason. */
  leftAngry: number;
  /** Of those, walked out because nobody came (at the door or at the table). */
  walkedOut: number;
  /** Kitchen alerts: a dish was promised that the kitchen didn't have. */
  alerts: number;
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
  compensation = 0;
  /** The salmon count written on the board, and the portions really in the fridge. */
  board: number;
  fridge: number;
  /** Who holds the board's marker (with the Lock card). */
  marker: number | null = null;
  done = false;
  /** Card plays to make when `finish` reaches their minute (for replays and tests). */
  pending: CardPlay[] = [];
  private readonly cooksBusy: (number | null)[];

  constructor(readonly def: NightDef) {
    this.tables = Array.from({ length: def.tables }, () => null);
    this.cooksBusy = Array.from({ length: def.cooks }, () => null);
    this.board = this.fridge = def.salmon;
    for (let i = 0; i < def.waiters; i++) this.waiters.push({ id: i, joined: 0, job: null });
    const next = rng(def.seed);
    // Wishes have their own stream, so tuning the menu never moves the arrivals.
    const wish = rng(def.seed + 1);
    const arrivals: { at: number; bus: boolean }[] = [];
    for (let t = between(next, 2, 6); t <= def.lastArrival; t += between(next, Math.ceil(def.every / 2), Math.floor(def.every * 1.5))) arrivals.push({ at: t, bus: false });
    for (let i = 0; i < def.peak.groups; i++) arrivals.push({ at: def.peak.at + Math.floor((i * def.peak.over) / def.peak.groups), bus: true });
    arrivals.sort((a, b) => a.at - b.at || Number(a.bus) - Number(b.bus));
    arrivals.forEach(({ at, bus }, id) => {
      this.groups.push({
        id,
        size: between(next, 1, 2),
        arrives: at,
        eats: between(next, def.eat[0], def.eat[1]),
        // The tour bus came for the house salmon.
        wantsSalmon: wish() < def.salmonShare || bus,
        dish: null,
        state: 'gone',
        table: null,
        since: at,
        waited: 0,
        mood: null,
      });
    });
  }

  has(card: CardId): boolean {
    return this.plays.some((p) => p.card === card);
  }

  /** Plays a card from this minute on. Each card once per night. */
  play(card: CardId): boolean {
    if (this.done || this.has(card)) return false;
    this.plays.push({ card, at: this.t });
    this.log.push({ t: this.t, kind: 'card', card });
    if (card === 'extraWaiter') this.waiters.push({ id: this.waiters.length, joined: this.t, job: null });
    return true;
  }

  /** Advances one minute. */
  step() {
    if (this.done) return;
    const t = ++this.t;
    const d = this.def;

    for (const g of this.groups)
      if (g.arrives === t) {
        g.state = 'door';
        g.since = t;
        this.log.push({ t, kind: 'arrive', group: g.id });
      }

    // A waiter waiting for the marker takes it as soon as it is free, then reads the board.
    for (const w of this.waiters) {
      const job = w.job;
      if (job?.read !== null || job.kind !== 'takeOrder') continue;
      if (this.marker !== null) continue;
      this.marker = w.id;
      this.readBoard(w, job, t);
      job.until = t + this.orderTime(this.groups[job.group]);
    }

    // Finished jobs.
    for (const w of this.waiters) {
      const job = w.job;
      if (!job || job.until > t) continue;
      w.job = null;
      const g = this.groups[job.group];
      if (job.kind === 'takeOrder') {
        if (g.dish === 'salmon') {
          // The count written back is the one read, minus one: another waiter's write in between is lost.
          this.board = Math.max(0, job.read! - 1);
          this.log.push({ t, kind: 'write', group: g.id, waiter: w.id, value: this.board });
        }
        if (this.marker === w.id) this.marker = null;
        g.state = 'ordered';
        this.tickets.push({ group: g.id, dish: g.dish ?? 'other', placed: t, cooking: null, ready: null, cook: null });
        this.log.push({ t, kind: 'order', group: g.id, waiter: w.id, dish: g.dish ?? 'other' });
      } else if (job.kind === 'serve') {
        g.state = 'eating';
        g.since = t;
        this.tickets.splice(
          this.tickets.findIndex((k) => k.group === g.id),
          1,
        );
        this.log.push({ t, kind: 'served', group: g.id, waiter: w.id });
      } else {
        this.revenue += g.size * d.price;
        g.mood = g.waited <= 12 ? 'happy' : g.waited <= 28 ? 'ok' : 'unhappy';
        this.repPoints += g.mood === 'happy' ? 1 : g.mood === 'unhappy' ? -1 : 0;
        this.leave(g, 'paid', w.id);
      }
    }

    for (const g of this.groups)
      if (g.state === 'eating' && t - g.since >= g.eats) {
        g.state = 'bill';
        g.since = t;
      }

    // Cooks finish dishes and start the next ticket on the rail; salmon comes out of the fridge then.
    this.cooksBusy.forEach((ticket, c) => {
      if (ticket === null) return;
      const k = this.tickets.find((x) => x.group === ticket)!;
      if (t - k.cooking! >= d.cook) {
        k.ready = t;
        this.cooksBusy[c] = null;
        this.log.push({ t, kind: 'cooked', group: k.group, cook: c });
      }
    });
    this.cooksBusy.forEach((ticket, c) => {
      if (ticket !== null) return;
      for (;;) {
        const k = this.tickets.find((x) => x.cooking === null);
        if (!k) return;
        if (k.dish === 'salmon') {
          if (this.fridge === 0) {
            // Promised, but there is none: the kitchen raises the alarm and the table is let down.
            this.tickets.splice(this.tickets.indexOf(k), 1);
            const g = this.groups[k.group];
            this.log.push({ t, kind: 'noStock', group: g.id, cook: c, table: g.table ?? undefined });
            this.compensation += d.compensation;
            this.walkOut(g, 'noStock');
            continue;
          }
          this.fridge--;
        }
        k.cooking = t;
        k.cook = c;
        this.cooksBusy[c] = k.group;
        this.log.push({ t, kind: 'cooking', group: k.group, cook: c, dish: k.dish });
        return;
      }
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
      const length = job.kind === 'takeOrder' ? this.orderTime(g) : job.kind === 'serve' ? d.serve : d.bill;
      const started: Job = { ...job, from: t, until: t + length };
      w.job = started;
      if (job.kind === 'takeOrder' && g.wantsSalmon) {
        if (this.has('lock') && this.marker !== null && this.marker !== w.id) {
          // Someone else holds the marker: wait at the board until it is handed back.
          started.read = null;
          started.until = Infinity;
          this.log.push({ t, kind: 'lockWait', group: g.id, waiter: w.id });
        } else {
          if (this.has('lock')) this.marker = w.id;
          this.readBoard(w, started, t);
        }
      } else if (job.kind === 'takeOrder') g.dish = 'other';
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

  summary(): Summary {
    const served = this.groups.filter((g) => g.mood !== null && g.mood !== 'angry');
    const cards = this.plays.reduce((sum, p) => sum + CARDS[p.card].money, 0);
    const wages = this.def.wages;
    const alerts = this.log.filter((e) => e.kind === 'noStock').length;
    const walkedOut = this.log.filter((e) => e.kind === 'leftDoor' || e.kind === 'leftTable').length;
    return {
      revenue: this.revenue,
      wages,
      cards,
      compensation: this.compensation,
      profit: this.revenue - wages - cards - this.compensation,
      served: served.length,
      happy: served.filter((g) => g.mood === 'happy').length,
      unhappy: served.filter((g) => g.mood === 'unhappy').length,
      leftAngry: this.groups.filter((g) => g.mood === 'angry').length,
      walkedOut,
      alerts,
      reputation: Math.round(this.repPoints * REP_PER_POINT * 100) / 100,
      avgWait: served.length ? Math.round(served.reduce((s, g) => s + g.waited, 0) / served.length) : 0,
    };
  }

  /** The waiter (if any) working for a group right now. */
  busyWith(group: number): Waiter | undefined {
    return this.waiters.find((w) => w.job?.group === group);
  }

  /** Everything that happened to one order, in time order: its trace. */
  trace(group: number): NightEvent[] {
    return this.log.filter((e) => e.group === group);
  }

  private orderTime(g: Group): number {
    return this.def.takeOrder + (g.wantsSalmon && this.has('checkFirst') ? this.def.checkTime : 0);
  }

  private readBoard(w: Waiter, job: Job, t: number) {
    const g = this.groups[job.group];
    job.read = this.board;
    g.dish = this.board > 0 ? 'salmon' : 'other';
    this.log.push({ t, kind: 'read', group: g.id, waiter: w.id, value: this.board, dish: g.dish });
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

  private walkOut(g: Group, kind: 'leftDoor' | 'leftTable' | 'noStock') {
    g.mood = 'angry';
    this.repPoints -= 3;
    if (kind === 'noStock') {
      if (g.table !== null) this.tables[g.table] = null;
      g.state = 'gone';
      return;
    }
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

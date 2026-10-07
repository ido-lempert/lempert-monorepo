/**
 * The people of the restaurant, driven by the night's state: guests queue outside, walk to their table, sit,
 * and leave; waiters run to tables and to the pass; cooks work while a dish is cooking; ready dishes wait on
 * the pass and plates appear on tables while guests eat. Moves are smoothed between the night's minutes.
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Group, Night } from '../game/night';
import { glyph, type Glyph } from '../glyphs';
import { person, prop, type Move, type Person, type Who } from './assets';
import { SPOTS } from './restaurant';

const WALK = 4.2;
const RUN = 8.5;
/** Seated guests sit a little above the floor so they land on the chair. */
const SIT_Y = 0.1;
/** The suit's sitting clip puts his body about half a metre behind his origin, so he is placed nearer the table. */
const SIT_BACK: Partial<Record<Who, number>> = { suit: 0.55 };

class Actor {
  path: THREE.Vector3[] = [];
  /** Where this actor was last sent, so the same order isn't given every minute. */
  plan = '';
  rest: Move = 'idle';
  face: number | null = null;
  onArrive: (() => void) | null = null;
  readonly badge: CSS2DObject;
  private readonly badgeEl: HTMLDivElement;

  constructor(readonly p: Person) {
    this.badgeEl = document.createElement('div');
    this.badgeEl.className = 'badge';
    this.badge = new CSS2DObject(this.badgeEl);
    this.badge.position.y = 3.1;
    p.root.add(this.badge);
  }

  get pos() {
    return this.p.root.position;
  }

  /** An industry symbol worn on the chest, so the role reads as its architecture part. */
  wear(kind: Glyph) {
    const el = document.createElement('div');
    el.className = 'tag';
    el.innerHTML = glyph(kind, 20);
    const tag = new CSS2DObject(el);
    tag.position.y = 1.7;
    this.p.root.add(tag);
  }

  /** Walks through `points`, then plays `rest` facing `face`. */
  send(plan: string, points: THREE.Vector3[], rest: Move, face: number | null, onArrive: (() => void) | null = null) {
    if (plan === this.plan) return;
    this.plan = plan;
    this.path = points.map((v) => v.clone());
    this.rest = rest;
    this.face = face;
    this.onArrive = onArrive;
    this.pos.y = 0;
  }

  put(at: THREE.Vector3, rot = 0) {
    this.pos.copy(at);
    this.p.root.rotation.y = rot;
    this.path = [];
  }

  say(text: string) {
    this.badgeEl.textContent = text;
    this.badgeEl.classList.toggle('on', text !== '');
  }

  update(dt: number, pace: number) {
    this.p.mixer.update(dt * Math.min(pace, 2));
    const target = this.path[0];
    if (target) {
      const to = target.clone().sub(this.pos);
      to.y = 0;
      const d = to.length();
      const run = d > 3 || pace > 1;
      const step = (run ? RUN : WALK) * pace * dt;
      if (d <= step) {
        this.pos.set(target.x, 0, target.z);
        this.path.shift();
      } else {
        this.pos.addScaledVector(to.normalize(), step);
        turn(this.p.root, Math.atan2(to.x, to.z), dt * 12);
      }
      this.p.play(run ? 'run' : 'walk');
      if (!this.path.length) {
        const done = this.onArrive;
        this.onArrive = null;
        done?.();
      }
      return;
    }
    this.p.play(this.rest);
    this.pos.y = this.rest === 'sit' ? SIT_Y : 0;
    if (this.face !== null) turn(this.p.root, this.face, dt * 10);
  }
}

function turn(o: THREE.Object3D, to: number, k: number) {
  let d = to - o.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  o.rotation.y += d * Math.min(1, k);
}

/** The stock board on its stand at the end of the pass: a chalkboard with the salmon count. */
class StockBoard {
  readonly group = new THREE.Group();
  private readonly canvas = document.createElement('canvas');
  private readonly texture: THREE.CanvasTexture;
  private shown = -1;

  constructor(private readonly label: string) {
    this.canvas.width = 256;
    this.canvas.height = 160;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.3, 0.12), new THREE.MeshStandardMaterial({ color: '#8a5a36', roughness: 0.7 }));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.1), new THREE.MeshStandardMaterial({ map: this.texture, roughness: 0.9 }));
    face.position.z = 0.065;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), new THREE.MeshStandardMaterial({ color: '#6b4428' }));
    leg.position.y = -1.2;
    const board = new THREE.Group();
    board.add(frame, face, leg);
    board.position.y = 1.85;
    board.traverse((o) => (o.castShadow = true));
    this.group.add(board);
  }

  show(n: number) {
    if (n === this.shown) return;
    this.shown = n;
    const g = this.canvas.getContext('2d')!;
    g.fillStyle = '#1f3b2d';
    g.fillRect(0, 0, 256, 160);
    g.fillStyle = '#f4f1e8';
    g.textAlign = 'center';
    g.direction = 'rtl';
    g.font = '700 40px Rubik Variable, system-ui, sans-serif';
    g.fillText(`🐟 ${this.label}`, 128, 58);
    g.font = '900 72px Rubik Variable, system-ui, sans-serif';
    g.fillStyle = n <= 1 ? '#ffb4a2' : '#f4f1e8';
    g.fillText(String(n), 128, 136);
    this.texture.needsUpdate = true;
  }
}

const GUESTS: Who[] = ['woman', 'suit'];
const WAITERS: Who[] = ['woman2', 'business'];

export class Floor {
  /** Game speed (x1, x2, x4), so people keep up with the clock. */
  pace = 1;
  private readonly free: Actor[] = [];
  private readonly guests = new Map<number, Actor[]>();
  private readonly waiters: Actor[] = [];
  private readonly cooks: Actor[] = [];
  private host!: Actor;
  private readonly passDishes: THREE.Object3D[] = [];
  private readonly tablePlates: THREE.Object3D[] = [];
  private readonly board: StockBoard;

  private constructor(
    private readonly stage: THREE.Object3D,
    boardLabel: string,
  ) {
    this.board = new StockBoard(boardLabel);
    this.board.group.position.copy(SPOTS.board);
    this.board.group.rotation.y = 0.5;
    stage.add(this.board.group);
  }

  static async create(stage: THREE.Object3D, boardLabel: string): Promise<Floor> {
    const f = new Floor(stage, boardLabel);
    const add = async (who: Who) => {
      const a = new Actor(await person(who, 2.6));
      stage.add(a.p.root);
      return a;
    };
    const guests = await Promise.all(Array.from({ length: 22 }, (_, i) => add(GUESTS[i % 2])));
    for (const a of guests) {
      a.p.root.visible = false;
      f.free.push(a);
    }
    for (const [i, at] of SPOTS.cooks.entries()) {
      const c = await add('worker');
      c.put(at, Math.PI);
      c.wear('worker');
      f.cooks[i] = c;
    }
    f.host = await add('farmer');
    f.host.put(SPOTS.host, 0);
    f.host.wear('lb');
    for (let i = 0; i < 6; i++) f.passDishes.push(await f.dish(SPOTS.dish(i), i % 2 ? 'food_stew' : 'food_dinner'));
    for (let i = 0; i < 8; i++) {
      const t = SPOTS.table(i);
      f.tablePlates.push(await f.dish(new THREE.Vector3(t.x, 1, t.z), i % 2 ? 'food_dinner' : 'food_stew'));
    }
    return f;
  }

  private async dish(at: THREE.Vector3, name: string) {
    const d = await prop(name);
    d.scale.setScalar(0.6);
    d.position.copy(at);
    d.visible = false;
    this.stage.add(d);
    return d;
  }

  /** Back to an empty restaurant, for a new night. */
  async reset() {
    for (const [id] of this.guests) this.release(id);
    for (const w of this.waiters) {
      this.stage.remove(w.p.root);
    }
    this.waiters.length = 0;
    for (const d of [...this.passDishes, ...this.tablePlates]) d.visible = false;
  }

  /** Brings the people in line with the night's state; call after every minute. */
  async sync(n: Night) {
    const doorLine = n.groups.filter((g) => g.state === 'door').sort((a, b) => a.arrives - b.arrives);
    for (const g of n.groups) {
      if (g.arrives > n.t) continue;
      let actors = this.guests.get(g.id);
      if (!actors) {
        if (g.state === 'gone') continue;
        const taken = this.take(g);
        if (!taken) continue;
        actors = taken;
      }
      this.guide(g, actors, doorLine.indexOf(g), n.t);
    }

    for (const w of n.waiters) {
      if (w.joined > n.t) continue;
      let a = this.waiters[w.id];
      if (!a) {
        a = new Actor(await person(WAITERS[w.id % WAITERS.length], 2.6));
        this.stage.add(a.p.root);
        a.put(w.id === 0 ? SPOTS.waiterIdle(0) : SPOTS.staffDoor, Math.PI);
        a.wear('server');
        this.waiters[w.id] = a;
      }
      const job = w.job;
      if (!job) a.send('idle', [SPOTS.waiterIdle(w.id)], 'idle', Math.PI);
      else if (job.kind === 'takeOrder' && job.read === null) a.send(`wait:${job.group}`, [SPOTS.boardQueue(w.id)], 'idle', 0.5 + Math.PI);
      else {
        const table = n.groups[job.group].table!;
        const plan = `${job.kind}:${job.group}:${job.from}`;
        if (job.kind === 'serve') a.send(plan, [SPOTS.pass(w.id), SPOTS.service(table)], 'work', 0);
        else a.send(plan, [SPOTS.service(table)], 'work', 0);
      }
      a.say(n.marker === w.id ? '🖊️' : job?.read === null ? '⏳' : '');
    }
    this.board.show(n.board);
    SPOTS.cooks.forEach((_, c) => this.cooks[c].say(n.log.some((e) => e.kind === 'noStock' && e.cook === c && n.t - e.t < 8) ? '🚨' : ''));

    SPOTS.cooks.forEach((_, c) => {
      const busy = n.tickets.some((k) => k.cook === c && k.cooking !== null && k.ready === null);
      this.cooks[c].rest = busy ? 'work' : 'idle';
    });
    const welcoming = n.log.some((e) => e.kind === 'seat' && n.t - e.t < 3);
    this.host.rest = welcoming ? 'wave' : 'idle';

    const ready = n.tickets.filter((k) => k.ready !== null).length;
    this.passDishes.forEach((d, i) => (d.visible = i < ready));
    this.tablePlates.forEach((d, i) => (d.visible = n.groups.some((g) => g.table === i && g.state === 'eating')));
  }

  update(dt: number) {
    for (const a of [...this.waiters, ...this.cooks, this.host]) a?.update(dt, this.pace);
    for (const actors of this.guests.values()) for (const a of actors) a.update(dt, this.pace);
  }

  private take(g: Group): Actor[] | null {
    if (this.free.length < g.size) return null;
    const actors = this.free.splice(0, g.size);
    actors.forEach((a, i) => {
      a.put(SPOTS.street.clone().add(new THREE.Vector3(i * 0.8, 0, 0)), -Math.PI / 2);
      a.plan = '';
      a.say('');
      a.p.root.visible = true;
    });
    this.guests.set(g.id, actors);
    return actors;
  }

  private release(id: number) {
    for (const a of this.guests.get(id) ?? []) {
      a.p.root.visible = false;
      a.say('');
      a.path = [];
      a.plan = '';
      this.free.push(a);
    }
    this.guests.delete(id);
  }

  private guide(g: Group, actors: Actor[], line: number, t: number) {
    const lead = actors[0];
    if (g.state === 'door') {
      actors.forEach((a, i) => a.send(`door:${line}`, [SPOTS.queue(line * 2 + i)], 'idle', Math.PI));
      lead.say(t - g.since > 14 ? '😤' : '');
      return;
    }
    if (g.state === 'gone') {
      const angry = g.mood === 'angry';
      lead.say(angry ? '😠' : g.mood === 'happy' ? '😊' : g.mood === 'unhappy' ? '😒' : '');
      actors.forEach((a, i) =>
        a.send('leave', [SPOTS.door, SPOTS.street.clone().add(new THREE.Vector3(i, 0, 0))], 'idle', null, i === 0 ? () => this.release(g.id) : null),
      );
      return;
    }
    actors.forEach((a, i) => {
      const seat = SPOTS.seat(g.table!, i);
      const back = SIT_BACK[a.p.who] ?? 0;
      const pos = seat.pos.clone().add(new THREE.Vector3(Math.sin(seat.rot), 0, Math.cos(seat.rot)).multiplyScalar(back));
      a.send(`seat:${g.table}`, [SPOTS.door, pos], 'sit', seat.rot);
    });
    const waiting = g.state === 'seated' || g.state === 'bill' ? t - g.since : 0;
    lead.say(waiting > 11 ? '😤' : waiting > 6 ? '⏳' : '');
  }
}

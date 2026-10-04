/**
 * A level on the island: its pieces, pads and pipes, kept in step with the player's build, and the run
 * animation where critters carry requests along the pipes.
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { sfx } from '../audio';
import { WRAPPERS, fits, shapeOf } from '../game/pieces';
import { kindsOf, sameEdge } from '../game/sim';
import type { Build, Edge, Kind, LevelDef, RunResult, Trip } from '../game/types';
import { mat, sparkleTexture } from './look';
import { CRITTER_COLORS, PORT_HEIGHT, butterfly, critter, groundAt, island, pad, piece, plane, pointer, socket } from './models';
import type { World } from './world';

/** Height of the name tag above each kind's base. */
const TAG_HEIGHT: Record<Kind, number> = {
  phone: 1.95,
  laptop: 1.35,
  crowd: 1.35,
  server: 2.15,
  db: 1.75,
  adapter: 1.25,
  bank: 1.75,
  facade: 1.7,
  pay: 1.45,
  stock: 1.6,
  ship: 1.3,
  cache: 1.2,
  lb: 1.15,
  shop: 1.6,
  broker: 1.75,
  queue: 1.2,
  email: 1.55,
  analytics: 1.6,
  guard: 1.5,
  lock: 1.2,
  zip: 1.15,
  logbook: 1.65,
};

export interface Names {
  name(kind: Kind): string;
  term(kind: Kind): string;
}

interface PieceView {
  kind: Kind;
  obj: THREE.Group;
  pos: THREE.Vector3;
  born: number;
}

interface Pipe {
  edge: Edge;
  curve: THREE.QuadraticBezierCurve3;
  group: THREE.Group;
  arrows: THREE.Mesh[];
  bad: boolean;
}

interface Particle {
  obj: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  max: number;
  spin?: number;
}

const arrowGeo = new THREE.ConeGeometry(0.15, 0.34, 14);
const UP = new THREE.Vector3(0, 1, 0);
const CRITTER_SIZE = 1.5;

export class Board {
  readonly root = new THREE.Group();
  private readonly views = new Map<string, PieceView>();
  private readonly padViews = new Map<string, THREE.Group>();
  private pipes: Pipe[] = [];
  private readonly showShapes: boolean;
  private placing = false;
  private selected: string | null = null;
  private readonly arrow = pointer();
  private arrowTarget: string | null = null;
  private particles: Particle[] = [];
  private readonly offFrame: () => void;
  private time = 0;
  private build: Build = { placed: {}, edges: [] };
  private running = false;
  private disposed = false;
  private readonly butterflies: THREE.Group[] = [];

  constructor(
    private readonly world: World,
    private readonly level: LevelDef,
    private readonly names: Names,
  ) {
    this.showShapes = level.pieces.some((p) => p.kind === 'bank');
    this.root.add(island(level.island));
    for (const p of level.pads) {
      const g = pad();
      g.position.copy(this.ground(p.at));
      g.userData.pick = { type: 'pad', id: p.id };
      this.root.add(g);
      this.padViews.set(p.id, g);
    }
    for (const p of level.pieces) this.addPiece(p.id, p.kind, false);
    if (level.island === 2)
      for (let i = 0; i < 6; i++) {
        const b = butterfly(['#ff7aa8', '#ffd24a', '#b18cff', '#7ec8ff'][i % 4]);
        b.userData.seed = i;
        this.butterflies.push(b);
        this.root.add(b);
      }
    this.arrow.visible = false;
    this.root.add(this.arrow);
    world.stage.add(this.root);
    this.offFrame = world.onFrame((dt, t) => this.tick(dt, t));
  }

  private ground([x, z]: [number, number]) {
    return new THREE.Vector3(x, groundAt(z, this.level.island), z);
  }

  private posOf(id: string): THREE.Vector3 {
    const fixed = this.level.pieces.find((p) => p.id === id);
    const at = fixed?.at ?? this.level.pads.find((p) => p.id === id)!.at;
    return this.ground(at);
  }

  private addPiece(id: string, kind: Kind, pop: boolean) {
    const obj = piece(kind);
    const pos = this.posOf(id);
    if (this.level.pads.some((p) => p.id === id)) pos.y += 0.08;
    obj.position.copy(pos);
    obj.userData.pick = { type: 'piece', id };
    // A bigger invisible box, so a piece is easy to tap with a finger.
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1.5, TAG_HEIGHT[kind], 1.5), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = TAG_HEIGHT[kind] / 2;
    obj.add(hit);

    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.innerHTML = `<b></b><small dir="ltr"></small>`;
    tag.querySelector('b')!.textContent = this.names.name(kind);
    tag.querySelector('small')!.textContent = this.names.term(kind);
    const label = new CSS2DObject(tag);
    label.position.y = TAG_HEIGHT[kind];
    obj.add(label);

    const shape = shapeOf(kind);
    if (this.showShapes && shape) {
      const s = socket(shape);
      s.position.set(0.75, 0, 0.45);
      obj.add(s);
    }
    this.root.add(obj);
    this.views.set(id, { kind, obj, pos, born: pop ? this.time : -10 });
  }

  private removePiece(id: string) {
    const v = this.views.get(id);
    if (!v) return;
    v.obj.traverse((o) => o instanceof CSS2DObject && o.element.remove());
    this.root.remove(v.obj);
    this.views.delete(id);
  }

  /** Where a request leaves or enters a piece. */
  private port(id: string): THREE.Vector3 {
    const v = this.views.get(id)!;
    return v.pos.clone().setY(v.pos.y + PORT_HEIGHT[v.kind]);
  }

  /** Brings the island in line with the build and the selection. */
  sync(build: Build, selected: string | null) {
    this.build = build;
    for (const [pad, kind] of Object.entries(build.placed)) {
      const v = this.views.get(pad);
      if (v && v.kind === kind) continue;
      if (v) this.removePiece(pad);
      this.addPiece(pad, kind, true);
    }
    for (const id of [...this.views.keys()]) if (this.level.pads.some((p) => p.id === id) && !build.placed[id]) this.removePiece(id);
    for (const [id, g] of this.padViews) g.visible = !build.placed[id];

    const kinds = kindsOf(this.level, build);
    const keep: Pipe[] = [];
    for (const p of this.pipes) {
      if (build.edges.some((e) => sameEdge(e, p.edge)) && kinds.has(p.edge.from) && kinds.has(p.edge.to)) keep.push(p);
      else this.root.remove(p.group);
    }
    this.pipes = keep;
    for (const e of build.edges) {
      if (this.pipes.some((p) => sameEdge(p.edge, e)) || !kinds.has(e.from) || !kinds.has(e.to)) continue;
      this.pipes.push(this.makePipe(e, !fits(kinds.get(e.from)!, kinds.get(e.to)!)));
    }
    this.selected = selected;
  }

  private makePipe(edge: Edge, bad: boolean): Pipe {
    const a = this.port(edge.from);
    const b = this.port(edge.to);
    const flat = b.clone().sub(a).setY(0).normalize();
    a.addScaledVector(flat, 0.4);
    b.addScaledVector(flat, -0.5);
    const mid = a.clone().lerp(b, 0.5);
    mid.y += 0.7 + a.distanceTo(b) * 0.12;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const group = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.1, 12), mat(bad ? '#ff8a8a' : '#9feaff', { transparent: 0.6, clearcoat: 1, rough: 0.1 }));
    tube.castShadow = true;
    const hit = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.34, 6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.pick = { type: 'edge', id: `${edge.from}>${edge.to}` };
    group.add(tube, hit);
    const plug = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), mat(bad ? '#ff5a6e' : '#5ff0ff', { emissive: 0.8 }));
    plug.position.copy(b);
    group.add(plug);
    const n = Math.max(2, Math.round(curve.getLength() / 1.1));
    const arrows: THREE.Mesh[] = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(arrowGeo, mat(bad ? '#ff3b4e' : '#1aa3ff', { emissive: 0.6, clearcoat: 1 }));
      m.userData.t0 = i / n;
      arrows.push(m);
      group.add(m);
    }
    this.root.add(group);
    return { edge, curve, group, arrows, bad };
  }

  setPlacing(on: boolean) {
    this.placing = on;
  }

  /** Points the bouncing arrow at a piece or pad (or hides it). */
  pointAt(id: string | null) {
    this.arrowTarget = id;
    this.arrow.visible = id !== null;
  }

  private tick(dt: number, t: number) {
    this.time = t;
    for (const [id, v] of this.views) {
      const age = t - v.born;
      // Pop in with a little overshoot, then breathe.
      const pop = age < 0.5 ? 1 + Math.sin(age * Math.PI * 2) * (0.5 - age) * 0.6 : 1;
      const s = Math.min(1, age * 4) * pop;
      const sel = id === this.selected;
      const breathe = 1 + Math.sin(t * 2 + v.pos.x) * 0.015;
      v.obj.scale.set(s, s * breathe * (sel ? 1.08 : 1), s);
      v.obj.position.y = v.pos.y + (sel ? 0.25 + Math.sin(t * 6) * 0.05 : 0);
      const face = v.obj.userData.face as THREE.Object3D | undefined;
      const eyes = face?.userData.eyes as THREE.Object3D | undefined;
      if (eyes) eyes.scale.y = (t + v.pos.x * 1.7) % 4 < 0.12 ? 0.1 : 1;
      const leds = v.obj.userData.leds as THREE.Mesh[] | undefined;
      leds?.forEach((l, i) => (l.visible = Math.sin(t * (3 + i) + i) > -0.6));
      const spinner = v.obj.userData.spinner as THREE.Object3D | undefined;
      if (spinner) spinner.rotation.y += dt * (this.running ? 6 : 0.8);
    }
    for (const b of this.butterflies) {
      const i = b.userData.seed as number;
      const a = t * (0.3 + i * 0.05) + i * 1.7;
      const x = Math.cos(a) * (4.5 + (i % 3)) * 1.1;
      const z = Math.sin(a * 1.3) * (3.5 + (i % 2));
      b.position.set(x, 1.6 + Math.sin(t * 2 + i) * 0.4, z);
      b.rotation.y = -a;
      const flap = Math.sin(t * 18 + i) * 0.9;
      const [l, r] = b.userData.wings as THREE.Mesh[];
      l.rotation.z = flap;
      r.rotation.z = -flap;
    }
    for (const g of this.padViews.values()) {
      const ring = g.userData.ring as THREE.Mesh;
      const k = this.placing ? 1 + Math.sin(t * 6) * 0.12 : 1;
      ring.scale.setScalar(k);
    }
    for (const p of this.pipes)
      for (const a of p.arrows) {
        const u = (a.userData.t0 + t * 0.3) % 1;
        a.position.copy(p.curve.getPointAt(u));
        a.quaternion.setFromUnitVectors(UP, p.curve.getTangentAt(u));
      }
    if (this.arrowTarget) {
      const v = this.views.get(this.arrowTarget);
      const base = v ? v.pos.clone().setY(v.pos.y + TAG_HEIGHT[v.kind] + 0.9) : this.posOf(this.arrowTarget).setY(this.posOf(this.arrowTarget).y + 1.1);
      this.arrow.position.copy(base).setY(base.y + Math.abs(Math.sin(t * 4)) * 0.35);
      this.arrow.rotation.y = t * 2;
    }
    this.particles = this.particles.filter((p) => {
      p.life += dt;
      p.vel.y -= 4 * dt;
      p.obj.position.addScaledVector(p.vel, dt);
      p.obj.material.opacity = 1 - p.life / p.max;
      if (p.spin) p.obj.material.rotation += p.spin * dt;
      if (p.life < p.max) return true;
      this.root.remove(p.obj);
      p.obj.material.dispose();
      return false;
    });
  }

  // --- Effects ------------------------------------------------------------------------------------

  private burst(at: THREE.Vector3, color: string, n = 14, speed = 2.5) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkleTexture, color, transparent: true, depthWrite: false }));
      s.position.copy(at);
      s.scale.setScalar(0.35 + Math.random() * 0.25);
      const a = (i / n) * Math.PI * 2;
      this.particles.push({ obj: s, vel: new THREE.Vector3(Math.cos(a) * speed, 1.5 + Math.random() * 2, Math.sin(a) * speed), life: 0, max: 0.9, spin: 3 });
      this.root.add(s);
    }
  }

  confetti() {
    const colors = ['#ff7aa8', '#ffd24a', '#5ff0ff', '#7ee08a', '#b18cff'];
    for (let i = 0; i < 70; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkleTexture, color: colors[i % colors.length], transparent: true, depthWrite: false }));
      s.position.set((Math.random() - 0.5) * 9, 4 + Math.random() * 3, (Math.random() - 0.5) * 7);
      s.scale.setScalar(0.4 + Math.random() * 0.3);
      this.particles.push({ obj: s, vel: new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 3, (Math.random() - 0.5) * 2), life: 0, max: 2.2, spin: 4 });
      this.root.add(s);
    }
  }

  private bubble(parent: THREE.Object3D, text: string, y: number): CSS2DObject {
    const el = document.createElement('div');
    el.className = 'bubble';
    el.textContent = text;
    const o = new CSS2DObject(el);
    o.position.y = y;
    parent.add(o);
    return o;
  }

  private dropBubble(o: CSS2DObject) {
    o.element.remove();
    o.parent?.remove(o);
  }

  private tween(sec: number, fn: (k: number) => void): Promise<void> {
    return new Promise((done) => {
      let t = 0;
      const off = this.world.onFrame((dt) => {
        // A level that was left mid-run finishes its animations at once.
        if (this.disposed) {
          off();
          done();
          return;
        }
        t += dt;
        const k = Math.min(1, t / sec);
        fn(k);
        if (k >= 1) {
          off();
          done();
        }
      });
    });
  }

  private wait = (sec: number) => this.tween(sec, () => {});

  /** Pulses a piece (a happy jump or a red shake). */
  private react(id: string, happy: boolean) {
    const v = this.views.get(id);
    if (!v) return;
    const screen = v.obj.userData.screen as THREE.Mesh | undefined;
    void this.tween(0.6, (k) => {
      const s = Math.sin(k * Math.PI);
      if (happy) v.obj.position.y = v.pos.y + s * 0.35;
      else v.obj.position.x = v.pos.x + Math.sin(k * 40) * 0.08 * (1 - k);
      if (screen) (screen.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.35 + s * 1.2;
    });
  }

  // --- Running ------------------------------------------------------------------------------------

  /** The curve a critter follows from a to b (along the pipe, or straight when there is none). */
  private leg(a: string, b: string): { curve: THREE.Curve<THREE.Vector3>; reverse: boolean } {
    const p = this.pipes.find((x) => sameEdge(x.edge, { from: a, to: b }));
    if (p) return { curve: p.curve, reverse: false };
    const q = this.pipes.find((x) => sameEdge(x.edge, { from: b, to: a }));
    if (q) return { curve: q.curve, reverse: true };
    return { curve: new THREE.LineCurve3(this.port(a), this.port(b)), reverse: false };
  }

  private async walk(c: THREE.Group, a: string, b: string, upTo = 1) {
    const { curve, reverse } = this.leg(a, b);
    const len = curve.getLength() * upTo;
    const flying = c.userData.plane === true;
    sfx.play(flying ? 'whoosh' : 'hop');
    await this.tween(Math.max(0.45, len / (flying ? 4 : 3.2)), (k) => {
      const u = k * upTo;
      const p = curve.getPointAt(reverse ? 1 - u : u);
      const ahead = curve.getPointAt(Math.min(1, Math.max(0, reverse ? 1 - u - 0.02 : u + 0.02)));
      if (flying) {
        // Glide just above the pipe, nose first.
        c.position.copy(p).setY(p.y + 0.25 + Math.sin(k * Math.PI * 2) * 0.05);
        c.lookAt(ahead.x, ahead.y + 0.25, ahead.z);
      } else {
        c.position.copy(p).setY(p.y - 0.2 + Math.abs(Math.sin(k * Math.PI * 4)) * 0.12);
        c.rotation.y = Math.atan2(ahead.x - p.x, ahead.z - p.z);
      }
    });
  }

  /** One copy of an event: a paper plane that flies to its subscriber, waits in line at a queue, and gets no answer. */
  private async flight(trip: Trip, kinds: Map<string, Kind>, onDone?: (t: Trip) => void): Promise<void> {
    await this.wait((trip.group ?? 0) * 0.55);
    const c = plane(CRITTER_COLORS[(trip.group ?? 0) % CRITTER_COLORS.length]);
    c.userData.plane = true;
    const start = this.port(trip.flow.from);
    c.position.copy(start).setY(start.y + 0.25);
    this.root.add(c);
    const size = c.scale.x;
    await this.tween(0.25, (k) => c.scale.setScalar(k * size));
    const path = trip.path;
    const last = path[path.length - 1];
    if (path.length === 1) {
      sfx.play('fail');
      const b = this.bubble(c, trip.fail === 'reversed' ? '🔄' : '❓', 0.6);
      await this.wait(1.2);
      this.dropBubble(b);
    } else {
      for (let i = 1; i < path.length; i++) {
        await this.walk(c, path[i - 1], path[i]);
        // In line at the queue: each one waits for the ones before it.
        if (kinds.get(path[i]) === 'queue' && trip.queued) {
          const b = this.bubble(c, `${trip.queued + 1}`, 0.6);
          b.element.classList.add('ticket');
          await this.wait(trip.queued * 0.5);
          this.dropBubble(b);
        }
      }
      if (trip.fail === 'overload') {
        sfx.play('fail');
        this.react(last, false);
        this.burst(this.topOf(last), '#8a93a8', 10, 1.2);
        const b = this.bubble(c, '😵', 0.6);
        await this.wait(1);
        this.dropBubble(b);
      } else if (trip.fail === 'shape' && trip.edge) {
        await this.walk(c, trip.edge.from, trip.edge.to, 0.85);
        sfx.play('zap');
        this.burst(c.position.clone(), '#ffd24a', 14, 2);
        await this.wait(1);
      } else if (trip.ok) {
        sfx.play('deliver');
        this.react(last, true);
        this.burst(this.port(last).setY(this.port(last).y + 0.5), '#ffd24a', 10, 1.6);
        this.dropBubble(this.bubble(c, '💌', 0.6));
        await this.wait(0.2);
      }
    }
    onDone?.(trip);
    await this.tween(0.2, (k) => c.scale.setScalar((1 - k) * size));
    c.traverse((o) => o instanceof CSS2DObject && o.element.remove());
    this.root.remove(c);
  }

  private async trip(trip: Trip, index: number, kinds: Map<string, Kind>, delay: number, onDone?: (t: Trip) => void): Promise<void> {
    if (trip.event) return this.flight(trip, kinds, onDone);
    await this.wait(delay);
    const target = kinds.get(trip.flow.to);
    const c = critter(CRITTER_COLORS[index % CRITTER_COLORS.length], target === 'bank' || target === 'pay' ? 'coin' : 'data');
    c.position.copy(this.port(trip.flow.from)).setY(this.port(trip.flow.from).y - 0.2);
    this.root.add(c);
    await this.tween(0.3, (k) => c.scale.setScalar(k * CRITTER_SIZE));

    const path = trip.path;
    const last = path[path.length - 1];
    const late = trip.fail === 'tooSlow' && this.level.timeLimit !== undefined && (trip.doneAt ?? 0) - (trip.cost ?? 0) >= this.level.timeLimit;
    if (path.length === 1 || late) {
      // Nowhere to go (a confused little hop), or out of time before it even left (asleep).
      sfx.play('fail');
      const b = this.bubble(c, late ? '😴' : trip.fail === 'reversed' ? '🔄' : '❓', 0.9);
      const y = c.position.y;
      await this.tween(1.4, (k) => (c.position.y = y + Math.abs(Math.sin(k * Math.PI * 4)) * 0.3));
      this.dropBubble(b);
    } else {
      for (let i = 1; i < path.length; i++) {
        await this.walk(c, path[i - 1], path[i]);
        if (WRAPPERS.includes(kinds.get(path[i])!)) await this.wrap(c, kinds.get(path[i])!);
      }
      if (trip.fail === 'shape' && trip.edge) {
        await this.walk(c, trip.edge.from, trip.edge.to, 0.85);
        sfx.play('zap');
        this.burst(c.position.clone().setY(c.position.y + 0.3), '#ffd24a', 18, 2);
        const b = this.bubble(c, '⚡', 0.9);
        const x = c.position.x;
        await this.tween(1.2, (k) => (c.position.x = x + Math.sin(k * 50) * 0.06));
        this.dropBubble(b);
      } else if (trip.fail === 'exposedDb' || trip.fail === 'unguarded' || trip.fail === 'twoAddresses') {
        sfx.play('alarm');
        this.alarm(trip.flow.to);
        const b = this.bubble(c, '🚨', 0.9);
        await this.wait(1.4);
        this.dropBubble(b);
      } else if (trip.fail === 'unwrapped') {
        // It arrives without every layer it should wear: the door stays shut.
        sfx.play('fail');
        this.react(last, false);
        const b = this.bubble(c, '🔓', 0.9);
        await this.wait(1.3);
        this.dropBubble(b);
      } else if (trip.fail === 'overload') {
        // The worker is full: it puffs smoke and the request gives up.
        sfx.play('fail');
        this.react(last, false);
        this.burst(this.topOf(last), '#8a93a8', 12, 1.2);
        const b = this.bubble(c, '😵', 0.9);
        await this.wait(1.2);
        this.dropBubble(b);
      } else {
        if (this.level.timeLimit !== undefined && !trip.hit) {
          // The slow database thinks for a while.
          const b = this.bubble(c, '⏳', 0.9);
          await this.wait(1.1);
          this.dropBubble(b);
        }
        if (trip.fail === 'tooSlow') {
          sfx.play('fail');
          const b = this.bubble(c, '😴', 0.9);
          await this.wait(1);
          this.dropBubble(b);
        } else {
          sfx.play('deliver');
          this.react(last, true);
          this.burst(this.port(last).setY(this.port(last).y + 0.6), trip.hit ? '#ffd24a' : '#7fd8ff', 12, 2);
          if (trip.hit) this.dropBubble(this.bubble(c, '⚡', 0.9));
          (c.userData.letter as THREE.Object3D).visible = false;
          (c.userData.prize as THREE.Object3D).visible = true;
          await this.wait(trip.hit ? 0.35 : 0.25);
          for (let i = path.length - 1; i > 0; i--) await this.walk(c, path[i], path[i - 1]);
          sfx.play('return');
          this.react(trip.flow.from, true);
          this.burst(c.position.clone().setY(c.position.y + 0.5), '#ff8fb1', 10, 1.6);
          this.bubble(c, '💖', 0.9);
          await this.wait(0.6);
        }
      }
    }
    onDone?.(trip);
    await this.tween(0.25, (k) => c.scale.setScalar((1 - k) * CRITTER_SIZE));
    c.traverse((o) => o instanceof CSS2DObject && o.element.remove());
    this.root.remove(c);
  }

  /** A request passing through a decorator comes out wearing a layer of it: a gold belt or a purple shell. */
  private async wrap(c: THREE.Group, kind: Kind) {
    const n = (c.userData.layers as number | undefined) ?? 0;
    c.userData.layers = n + 1;
    sfx.play('tap');
    const lock = kind === 'lock';
    const layer = lock
      ? new THREE.Mesh(new THREE.TorusGeometry(0.26 + n * 0.04, 0.05, 8, 24), mat('#ffcf3a', { emissive: 0.5, clearcoat: 1 }))
      : new THREE.Mesh(new THREE.SphereGeometry(0.31 + n * 0.04, 18, 12), mat('#b18cff', { transparent: 0.45, sheen: 0.5 }));
    if (lock) layer.rotation.x = Math.PI / 2;
    layer.position.y = 0.22;
    c.add(layer);
    this.burst(c.position.clone().setY(c.position.y + 0.4), lock ? '#ffcf3a' : '#b18cff', 8, 1.4);
    const b = this.bubble(c, lock ? '🔒' : '📦', 0.9);
    await this.wait(0.45);
    this.dropBubble(b);
  }

  /** A spinning red light and a shake on a piece that someone reached the wrong way. */
  private alarm(id: string) {
    const v = this.views.get(id);
    if (!v) return;
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#ff3b4e', { emissive: 3 }));
    light.position.y = TAG_HEIGHT[v.kind] - 0.25;
    v.obj.add(light);
    this.react(id, false);
    void this.tween(1.6, (k) => {
      light.visible = Math.sin(k * 40) > 0;
      if (k >= 1) v.obj.remove(light);
    });
  }

  /** Plays a run; resolves when every critter is done. */
  async play(result: RunResult, onTrip?: (t: Trip) => void): Promise<void> {
    this.pointAt(null);
    sfx.play('run');
    // Glow the edges that break a rule, before anyone walks.
    for (const p of result.problems) {
      const pipe = p.edge && this.pipes.find((x) => sameEdge(x.edge, p.edge!));
      if (pipe) this.burst(pipe.curve.getPointAt(0.5), '#ff5a6e', 10, 1.5);
      if (p.piece) {
        // A second copy of something that may only exist once.
        sfx.play('alarm');
        this.alarm(p.piece);
      }
    }
    const kinds = kindsOf(this.level, this.build);
    this.running = true;
    if (this.level.timeLimit !== undefined) {
      // On the clock, requests go one after another, so the time adds up where you can see it.
      for (const [i, t] of result.trips.entries()) await this.trip(t, i, kinds, 0, onTrip);
    } else {
      const crowd = result.trips.length > 3;
      await Promise.all(result.trips.map((t, i) => this.trip(t, i, kinds, i * (crowd ? 0.45 : 0.7), onTrip)));
    }
    this.running = false;
    if (result.ok) {
      sfx.play('win');
      this.confetti();
      for (const id of this.views.keys()) this.react(id, true);
      await this.wait(0.8);
    }
  }

  /** A point above a piece, for HTML hints. */
  topOf(id: string): THREE.Vector3 {
    const v = this.views.get(id);
    return v ? v.pos.clone().setY(v.pos.y + TAG_HEIGHT[v.kind]) : this.posOf(id);
  }

  dispose() {
    this.disposed = true;
    this.offFrame();
    this.world.labels.domElement.replaceChildren();
    this.root.traverse((o) => o instanceof CSS2DObject && o.element.remove());
    this.world.stage.remove(this.root);
  }
}

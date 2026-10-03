/** A chapter's weather: patches of fire, drifting smoke, fireflies in the dark, and a charging king's dust. */
import * as THREE from 'three';
import type { Arena, Firefly, Flame, GameEvent } from '../game/arena';
import { groundAt } from '../game/physics';
import type { Effects } from './effects';
import { canvasTexture, mat } from './look';
import { share } from './optimize';

const softTexture = canvasTexture(64, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, s, s);
});

const flameTexture = canvasTexture(128, (g, s) => {
  // A teardrop: yellow-white heart, orange body, red edge, fading to nothing.
  const tear = (k: number, color: string) => {
    g.beginPath();
    g.moveTo(s / 2, s * 0.02 + (1 - k) * s * 0.3);
    g.bezierCurveTo(s * (0.5 + 0.55 * k), s * 0.5, s * (0.5 + 0.42 * k), s * 0.98, s / 2, s * 0.98);
    g.bezierCurveTo(s * (0.5 - 0.42 * k), s * 0.98, s * (0.5 - 0.55 * k), s * 0.5, s / 2, s * 0.02 + (1 - k) * s * 0.3);
    g.fillStyle = color;
    g.fill();
  };
  g.filter = 'blur(2px)';
  tear(1, '#e8301a');
  tear(0.78, '#ff8a1c');
  tear(0.5, '#ffd84a');
  tear(0.26, '#fff6c8');
});
const scorchTexture = canvasTexture(64, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, 'rgba(30,18,12,0.85)');
  r.addColorStop(0.6, 'rgba(30,18,12,0.5)');
  r.addColorStop(1, 'rgba(30,18,12,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, s, s);
});
const flameMat = new THREE.SpriteMaterial({ map: flameTexture, transparent: true, depthWrite: false });
const scorchMat = new THREE.MeshBasicMaterial({ map: scorchTexture, transparent: true, depthWrite: false });
const dotGeo = share(new THREE.SphereGeometry(0.1, 10, 8));
const poolGeo = share(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));

const additive = (color: string, opacity: number) =>
  new THREE.MeshBasicMaterial({ map: softTexture, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
const firePool = additive('#ff7a1a', 0.7);
const flyPool = additive('#d8ff6a', 0.45);
const flyGlow = new THREE.SpriteMaterial({ map: softTexture, color: '#d8ff6a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const smokeMat = new THREE.SpriteMaterial({ map: softTexture, color: '#454857', transparent: true, opacity: 0.42, depthWrite: false });

/** Each tongue of flame: sideways offset, width, height and flicker speed (per flame these are scaled by its size). */
const TONGUES: [number, number, number, number][] = [
  [0, 1.1, 2.1, 11],
  [-0.4, 0.8, 1.5, 14],
  [0.42, 0.85, 1.6, 12],
  [0.05, 0.6, 1.1, 17],
];

interface FlameView {
  group: THREE.Group;
  tongues: THREE.Sprite[];
  pool: THREE.Mesh;
  scorch: THREE.Mesh;
  puffIn: number;
}

interface FlyView {
  dot: THREE.Mesh;
  glow: THREE.Sprite;
  pool: THREE.Mesh;
}

interface Puff {
  sprite: THREE.Sprite;
  x: number;
  z: number;
  speed: number;
  size: number;
}

export class WeatherView {
  readonly group = new THREE.Group();
  private readonly flames = new Map<number, FlameView>();
  private readonly flies = new Map<number, FlyView>();
  private readonly puffs: Puff[] = [];
  private dustIn = 0;

  clear() {
    for (const v of this.flames.values()) this.group.remove(v.group);
    for (const v of this.flies.values()) this.group.remove(v.dot, v.glow, v.pool);
    for (const p of this.puffs) this.group.remove(p.sprite);
    this.flames.clear();
    this.flies.clear();
    this.puffs.length = 0;
  }

  show(events: GameEvent[], effects: Effects) {
    for (const e of events) {
      switch (e.type) {
        case 'firefly':
          effects.sparkle(e.firefly, 14, '#d8ff6a', 0.8);
          effects.dust(e.firefly, '#f4ffb0', 0.5, 8);
          break;
        case 'heal':
          effects.sparkle({ x: e.bug.x, y: e.bug.y + e.bug.def.radius * 1.4, z: e.bug.z }, 10, '#7dff8a', 0.7);
          break;
        case 'rear':
          effects.dust({ x: e.bug.x, y: e.bug.y, z: e.bug.z }, '#ffb35c', 1.2, 10);
          break;
      }
    }
  }

  update(arena: Arena | null, dt: number, time: number, full: boolean, effects: Effects) {
    this.flameViews(arena?.flames ?? [], dt, time, effects);
    this.flyViews(arena?.fireflies ?? [], time, arena);
    this.smoke(arena, dt, time, full);
    // Dust under a king that is rearing up to charge, and a trail while it runs.
    this.dustIn -= dt;
    if (arena && this.dustIn <= 0) {
      this.dustIn = 0.08;
      for (const b of arena.bugs) {
        if (b.rearT > 0) effects.dust({ x: b.x, y: b.y, z: b.z }, '#ffb35c', 0.7, 2);
        else if (b.chargeT > 0) effects.dust({ x: b.x, y: b.y, z: b.z }, '#e6d7b8', 0.9, 2);
      }
    }
  }

  private flameViews(flames: readonly Flame[], dt: number, time: number, effects: Effects) {
    const seen = new Set<number>();
    for (const f of flames) {
      seen.add(f.id);
      let v = this.flames.get(f.id);
      if (!v) {
        const group = new THREE.Group();
        const tongues = TONGUES.map(() => {
          const t = new THREE.Sprite(flameMat);
          t.center.set(0.5, 0.04);
          t.renderOrder = 4;
          return t;
        });
        const pool = new THREE.Mesh(poolGeo, firePool);
        pool.renderOrder = 2;
        const scorch = new THREE.Mesh(poolGeo, scorchMat);
        scorch.renderOrder = 1;
        group.add(scorch, pool, ...tongues);
        group.position.set(f.x, groundAt(f.x, f.z), f.z);
        this.group.add(group);
        v = { group, tongues, pool, scorch, puffIn: 0 };
        this.flames.set(f.id, v);
      }
      // Grows for a second, burns, then shrinks away.
      const k = Math.min(1, f.t) * Math.min(1, (f.life - f.t) / 1.2);
      v.tongues.forEach((t, i) => {
        const [dx, w, h, sp] = TONGUES[i];
        const flick = 1 + Math.sin(time * sp + f.id * 2 + i * 1.7) * 0.18;
        const sway = Math.sin(time * 3 + i + f.id) * 0.12;
        t.position.set((dx + sway) * f.r, 0.06, (i % 2 ? 0.15 : -0.1) * f.r);
        t.scale.set(w * f.r * 0.8 * k * (2 - flick), h * f.r * 0.8 * k * flick, 1);
      });
      v.scorch.position.y = 0.04;
      v.scorch.scale.setScalar(f.r * 3.2 * (0.4 + 0.6 * Math.min(1, f.t / 2)));
      v.pool.position.y = 0.06;
      v.pool.scale.setScalar(f.r * 3.6 * (0.5 + 0.5 * k) * (1 + Math.sin(time * 8 + f.id) * 0.05));
      // Wisps of smoke and a spark now and then.
      v.puffIn -= dt;
      if (v.puffIn <= 0 && k > 0.4) {
        v.puffIn = 0.25;
        const top = { x: f.x + (Math.random() - 0.5) * f.r, y: groundAt(f.x, f.z) + 1.4, z: f.z + (Math.random() - 0.5) * f.r };
        effects.dust(top, '#59606e', 0.6, 1);
        if (Math.random() < 0.5) effects.sparkle(top, 1, '#ffb347', 0.3);
      }
    }
    for (const [id, v] of this.flames)
      if (!seen.has(id)) {
        this.group.remove(v.group);
        this.flames.delete(id);
      }
  }

  private flyViews(flies: readonly Firefly[], time: number, arena: Arena | null) {
    const seen = new Set<number>();
    for (const f of flies) {
      seen.add(f.id);
      let v = this.flies.get(f.id);
      if (!v) {
        v = {
          dot: new THREE.Mesh(dotGeo, mat('#e8ff7a', { emissive: 6, rough: 1 })),
          glow: new THREE.Sprite(flyGlow),
          pool: new THREE.Mesh(poolGeo, flyPool),
        };
        v.pool.renderOrder = 2;
        this.group.add(v.dot, v.glow, v.pool);
        this.flies.set(f.id, v);
      }
      const pulse = 0.75 + Math.sin(time * 5 + f.ph) * 0.25;
      v.dot.position.set(f.x, f.y, f.z);
      v.dot.scale.setScalar(0.8 + pulse * 0.4);
      v.glow.position.set(f.x, f.y, f.z);
      v.glow.scale.setScalar(1.1 + pulse * 0.9);
      v.pool.position.set(f.x, groundAt(f.x, f.z) + 0.06, f.z);
      v.pool.scale.setScalar(3.4 + pulse);
      v.pool.visible = !arena || arena.light <= 0;
    }
    for (const [id, v] of this.flies)
      if (!seen.has(id)) {
        this.group.remove(v.dot, v.glow, v.pool);
        this.flies.delete(id);
      }
  }

  private smoke(arena: Arena | null, dt: number, time: number, full: boolean) {
    const want = arena?.level.effects?.includes('smoke') ? (full ? 6 : 4) : 0;
    while (this.puffs.length < want) {
      const i = this.puffs.length;
      const sprite = new THREE.Sprite(smokeMat);
      sprite.renderOrder = 3;
      this.group.add(sprite);
      const size = 3.8 + (i % 3) * 1.3;
      this.puffs.push({ sprite, x: -12 + i * 4.5, z: -3 + (i % 3) * 3.5, speed: 0.35 + (i % 4) * 0.12, size });
    }
    while (this.puffs.length > want) this.group.remove(this.puffs.pop()!.sprite);
    const span = (arena?.level.radius ?? 8) * 2 + 8;
    for (const [i, p] of this.puffs.entries()) {
      p.x += p.speed * dt;
      if (p.x > span / 2) p.x -= span;
      p.sprite.position.set(p.x, 1.1 + (i % 3) * 0.7 + Math.sin(time * 0.5 + i) * 0.2, p.z);
      p.sprite.scale.setScalar(p.size * (1 + Math.sin(time * 0.7 + i * 2) * 0.06));
    }
  }
}

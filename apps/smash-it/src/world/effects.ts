/**
 * Food landing: it smears into glossy squashed piles and splats stretched along the throw (jelly bounces
 * and wobbles apart), a few bits fly with simple physics and stay as leftovers until the mop comes, and
 * soft dust clouds and smoke trails puff up. Also sparkles.
 * The replay uses its own Effects, so its mess doesn't mix with the chapter's.
 */
import * as THREE from 'three';
import type { Effect } from '../game/foods';
import { COUNTER_Y, groundAt, type Vec3 } from '../game/physics';
import { mat, sparkleTexture, splatTexture } from './look';
import { share } from './optimize';

interface Piece {
  mesh: THREE.Mesh;
  v: THREE.Vector3;
  spin: THREE.Vector3;
  size: number;
  /** Seconds left; Infinity for leftovers that stay. */
  life: number;
  settled: boolean;
}

interface Spark {
  sprite: THREE.Sprite;
  v: THREE.Vector3;
  life: number;
  max: number;
  size: number;
}

interface Puff {
  sprite: THREE.Sprite;
  v: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  spin: number;
}

/** Leftover food piles that squash flat when they land. */
interface Mound {
  mesh: THREE.Mesh;
  t: number;
  scale: THREE.Vector3;
}

const GRAVITY = 18;
/** Leftovers kept on the disc; beyond this the oldest ones fade away. */
const MAX_PIECES = 260;

const G = {
  crumb: share(new THREE.IcosahedronGeometry(1, 1)),
  blob: share(new THREE.SphereGeometry(1, 14, 10)),
  sprinkle: share(new THREE.CapsuleGeometry(0.35, 0.7, 3, 6)),
  tin: share(new THREE.CylinderGeometry(1, 0.85, 0.3, 24, 1, true)),
  splat: share(new THREE.PlaneGeometry(1, 1)),
  mound: share(new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2)),
};

/** The colour each food smears in (on the ground, and on the bugs it hits). */
export const SMEAR: Record<Effect, string> = {
  crumble: '#d9a35c',
  scatter: '#fff1c4',
  smash: '#ff4d6d',
  wobble: '#ff3b6b',
  cheese: '#ff9a1f',
  rings: '#ff7eb6',
  splash: '#fffaf2',
  slices: '#ffcf4d',
};

/** Dust and smoke: what each food puffs up when it lands. */
const DUST: Record<Effect, string> = {
  crumble: '#f0d2a6',
  scatter: '#fffaf0',
  smash: '#ffc2cc',
  wobble: '#ffc2d2',
  cheese: '#ffd59a',
  rings: '#ffd6ea',
  splash: '#ffffff',
  slices: '#fff0c4',
};

/** A soft, cloudy puff (several overlapping soft circles), for dust and smoke. */
const puffTexture = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 14; i++) {
    const x = 64 + (rnd() - 0.5) * 50;
    const y = 64 + (rnd() - 0.5) * 50;
    const r = 18 + rnd() * 26;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.25)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  // Fade the square's corners out completely.
  g.globalCompositeOperation = 'destination-in';
  const mask = g.createRadialGradient(64, 64, 30, 64, 64, 64);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = mask;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
})();

export class Effects {
  readonly group = new THREE.Group();
  private pieces: Piece[] = [];
  private sparks: Spark[] = [];
  private puffs: Puff[] = [];
  private mounds: Mound[] = [];
  private splats: THREE.Mesh[] = [];
  private trailIn = 0;

  constructor(private readonly rand: () => number = Math.random) {}

  /** Number of leftovers lying about (for tests and the mop). */
  get mess(): number {
    return this.pieces.length + this.splats.length + this.mounds.length;
  }

  /**
   * Food lands. Soft food smears: it squashes into a glossy pile and a splat stretched along the throw,
   * with only a few bits flying; elastic jelly bounces and wobbles apart. Every landing puffs up dust.
   */
  burst(effect: Effect, p: Vec3, dir: { x: number; z: number }, strength: number, last: boolean) {
    const r = this.rand;
    const up = (lo: number, hi: number) => lo + r() * (hi - lo);
    const spray = (n: number, geo: THREE.BufferGeometry, colors: string[], size: [number, number], speed: [number, number], lift: [number, number], keep = true) => {
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        const s = up(...speed) * strength;
        const v = new THREE.Vector3(Math.cos(a) * s + dir.x * s * 0.5, up(...lift), Math.sin(a) * s + dir.z * s * 0.5);
        this.piece(geo, colors[i % colors.length], p, v, up(...size), keep ? Infinity : up(0.6, 1.1));
      }
    };
    const big = effect === 'splash' || effect === 'smash';
    this.dust(p, DUST[effect], big ? 1.6 : 1, big ? 14 : 9);
    const smear = SMEAR[effect];
    switch (effect) {
      case 'crumble':
        this.mound(p, smear, 0.75, dir, ['#5a2d14']);
        this.splat(p, 1.3, '#c98a3e', dir, 0.6);
        spray(5, G.crumb, ['#d99a4e', '#5a2d14'], [0.07, 0.12], [1.5, 3.5], [2, 4]);
        break;
      case 'scatter':
        spray(12, G.crumb, ['#fff6d8', '#fff6d8', '#ffd36b'], [0.12, 0.18], [1.5, 4], [2, 5]);
        this.splat(p, 1.1, '#ffd36b', dir, 0.45);
        break;
      case 'smash':
        this.mound(p, '#ff5a74', 1.3, dir, ['#2a1a1a', '#2a1a1a', '#3b9b3f']);
        this.splat(p, 2.8, '#ff4d6d', dir, 0.85);
        spray(4, G.blob, ['#3b9b3f', '#ff6b81'], [0.18, 0.3], [2, 4], [3, 6]);
        break;
      case 'wobble':
        // Elastic: it bounces, and only comes apart at the very end.
        if (last) {
          spray(7, G.blob, ['#ff3b6b', '#ff5b85'], [0.15, 0.28], [2, 5], [4, 7]);
          this.mound(p, '#ff3b6b', 0.6, dir, []);
        }
        this.splat(p, 0.9, '#ff3b6b', dir, 0.5);
        break;
      case 'cheese':
        this.splat(p, last ? 1.1 : 0.7, '#ff9a1f', dir, 0.55);
        if (last) this.mound(p, smear, 0.45, dir, ['#ffcf5c']);
        break;
      case 'rings':
        this.mound(p, smear, 0.8, dir, ['#ffffff', '#4dd0ff', '#ffe14d', '#7dff8a']);
        this.splat(p, 1.5, '#ff7eb6', dir, 0.75);
        spray(8, G.sprinkle, ['#ffffff', '#4dd0ff', '#ffe14d', '#7dff8a'], [0.05, 0.07], [1.5, 4], [2, 5]);
        break;
      case 'splash':
        this.mound(p, smear, 1.5, dir, ['#e0002a']);
        this.splat(p, 3.4, '#fffaf2', dir, 0.95);
        spray(6, G.blob, ['#fffaf2'], [0.12, 0.22], [2, 5], [3, 7]);
        spray(1, G.tin, ['#c9cfd8'], [0.6, 0.6], [1, 2], [7, 9]);
        break;
      case 'slices':
        this.mound(p, smear, 0.55, dir, ['#d63a2f', '#d63a2f']);
        this.splat(p, 1.2, '#ffcf4d', dir, 0.6);
        break;
    }
    this.sparkle(p, big ? 8 : 4, '#ffffff', 0.45);
  }

  /** A cloud of dust rolling out over the ground, and a puff rising in the middle. */
  dust(p: Vec3, color: string, size = 1, n = 10) {
    const ground = Math.max(p.y, groundAt(p.x, p.z));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rand() * 0.4;
      const sp = (2.2 + this.rand() * 1.8) * size;
      this.puff({ x: p.x, y: ground + 0.25, z: p.z }, color, (0.9 + this.rand() * 0.6) * size, new THREE.Vector3(Math.cos(a) * sp, 0.3 + this.rand() * 0.5, Math.sin(a) * sp), 0.7 + this.rand() * 0.4);
    }
    for (let i = 0; i < 3; i++) this.puff({ x: p.x, y: ground + 0.4, z: p.z }, color, (1.4 + this.rand()) * size, new THREE.Vector3((this.rand() - 0.5) * 0.8, 1.2 + this.rand(), (this.rand() - 0.5) * 0.8), 0.9 + this.rand() * 0.4);
  }

  /** A little smoke trail behind flying food. */
  trail(p: Vec3, effect: Effect, dt: number) {
    this.trailIn -= dt;
    if (this.trailIn > 0) return;
    this.trailIn = 0.035;
    this.puff(p, DUST[effect], 0.35 + this.rand() * 0.15, new THREE.Vector3(0, 0.3, 0), 0.45);
  }

  private puff(p: Vec3, color: string, size: number, v: THREE.Vector3, life: number) {
    const m = new THREE.SpriteMaterial({ map: puffTexture, color, transparent: true, depthWrite: false, opacity: 0.9 });
    m.rotation = this.rand() * 6;
    const s = new THREE.Sprite(m);
    s.position.set(p.x, p.y, p.z);
    s.scale.setScalar(size * 0.3);
    this.group.add(s);
    this.puffs.push({ sprite: s, v, life, max: life, size, spin: (this.rand() - 0.5) * 2 });
  }

  /** A glossy pile of squashed food that flattens with a wobble, with bits (seeds, sprinkles, chips) on top. */
  private mound(p: Vec3, color: string, size: number, dir: { x: number; z: number }, bits: string[]) {
    const ground = groundAt(p.x, p.z);
    const base = new THREE.Vector3(p.x + dir.x * size * 0.3, ground, p.z + dir.z * size * 0.3);
    const parts = 3;
    for (let i = 0; i < parts; i++) {
      const m = new THREE.Mesh(G.mound, mat(color, { rough: 0.3, clearcoat: 1, rim: 0.2 }));
      const off = i === 0 ? 0 : size * 0.45;
      const a = this.rand() * Math.PI * 2;
      m.position.set(base.x + Math.cos(a) * off, ground + 0.01, base.z + Math.sin(a) * off);
      const s = size * (i === 0 ? 1 : 0.55 + this.rand() * 0.2);
      // Stretched a little along the throw.
      const scale = new THREE.Vector3(s * 1.15, s * 0.32, s * 0.9);
      m.rotation.y = Math.atan2(dir.x, dir.z);
      m.scale.set(0.01, 0.01, 0.01);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
      this.mounds.push({ mesh: m, t: 0, scale });
    }
    bits.forEach((c, i) => {
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Mesh(G.blob, mat(c, { rough: 0.2, clearcoat: 1 }));
        const a = this.rand() * Math.PI * 2;
        const d = this.rand() * size * 0.6;
        b.position.set(base.x + Math.cos(a) * d, ground + size * 0.25, base.z + Math.sin(a) * d);
        b.scale.set(0.06 + (i % 2) * 0.02, 0.04, 0.09);
        b.rotation.y = a;
        this.group.add(b);
        this.mounds.push({ mesh: b, t: 0, scale: b.scale.clone() });
      }
    });
  }

  /** A puff of sparkles (also used when a bug gets hit). */
  sparkle(p: Vec3, n: number, color: string, size = 0.5) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.SpriteMaterial({ map: sparkleTexture, color, transparent: true, depthWrite: false });
      const s = new THREE.Sprite(m);
      s.position.set(p.x, p.y + 0.3, p.z);
      const a = this.rand() * Math.PI * 2;
      const sp = 2 + this.rand() * 4;
      this.group.add(s);
      const life = 0.4 + this.rand() * 0.4;
      this.sparks.push({ sprite: s, v: new THREE.Vector3(Math.cos(a) * sp, 2 + this.rand() * 4, Math.sin(a) * sp), life, max: life, size: size * (0.6 + this.rand() * 0.8) });
    }
  }

  private piece(geo: THREE.BufferGeometry, color: string, p: Vec3, v: THREE.Vector3, size: number, life: number) {
    const m = new THREE.Mesh(geo, mat(color, { rough: 0.4, rim: 0.2, clearcoat: 0.7 }));
    m.position.set(p.x, Math.max(p.y, groundAt(p.x, p.z)) + 0.2, p.z);
    m.scale.setScalar(size);
    m.rotation.set(this.rand() * 6, this.rand() * 6, this.rand() * 6);
    m.castShadow = size > 0.2;
    this.group.add(m);
    this.pieces.push({ mesh: m, v, spin: new THREE.Vector3(this.rand() * 10 - 5, this.rand() * 10 - 5, this.rand() * 10 - 5), size, life, settled: false });
    if (this.pieces.length > MAX_PIECES) {
      const old = this.pieces.find((q) => q.life === Infinity && q.settled);
      if (old) old.life = 0.5;
    }
  }

  splat(p: Vec3, size: number, color: string, dir: { x: number; z: number } = { x: 0, z: 1 }, stretch = 0) {
    const ground = groundAt(p.x, p.z);
    const m = new THREE.Mesh(
      G.splat,
      new THREE.MeshPhysicalMaterial({ map: splatTexture, color, transparent: true, opacity: 0.94, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    m.rotation.x = -Math.PI / 2;
    // Smeared along the throw.
    m.rotation.z = Math.atan2(dir.x, -dir.z) + (this.rand() - 0.5) * 0.3;
    m.position.set(p.x + dir.x * size * stretch * 0.4, ground + 0.02 + this.splats.length * 0.0005, p.z + dir.z * size * stretch * 0.4);
    m.scale.setScalar(0.1);
    m.userData.size = size * 2;
    m.userData.stretch = 1 + stretch;
    m.receiveShadow = true;
    this.group.add(m);
    this.splats.push(m);
  }

  update(dt: number) {
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const q = this.pieces[i];
      const m = q.mesh;
      q.life -= dt;
      if (q.life <= 0) {
        m.scale.multiplyScalar(0.85);
        if (m.scale.x < q.size * 0.1 || q.life < -0.6) {
          this.group.remove(m);
          this.pieces.splice(i, 1);
        }
        continue;
      }
      if (q.settled) continue;
      q.v.y -= GRAVITY * dt;
      m.position.addScaledVector(q.v, dt);
      m.rotation.x += q.spin.x * dt;
      m.rotation.y += q.spin.y * dt;
      m.rotation.z += q.spin.z * dt;
      const ground = groundAt(m.position.x, m.position.z) + q.size * 0.5;
      if (m.position.y < ground) {
        // Only land on top; something falling past the side of the disc keeps falling.
        if (ground - m.position.y > 0.6) continue;
        m.position.y = ground;
        q.v.y *= -0.3;
        q.v.x *= 0.55;
        q.v.z *= 0.55;
        q.spin.multiplyScalar(0.5);
        if (Math.abs(q.v.y) < 1) {
          q.settled = true;
          m.rotation.x = Math.round(m.rotation.x / Math.PI) * Math.PI;
          m.rotation.z = Math.round(m.rotation.z / Math.PI) * Math.PI;
        }
      }
      if (m.position.y < COUNTER_Y - 4) q.life = 0;
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.group.remove(s.sprite);
        s.sprite.material.dispose();
        this.sparks.splice(i, 1);
        continue;
      }
      s.v.y -= 6 * dt;
      s.sprite.position.addScaledVector(s.v, dt);
      const k = s.life / s.max;
      s.sprite.scale.setScalar(s.size * (0.4 + k));
      s.sprite.material.opacity = k;
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const q = this.puffs[i];
      q.life -= dt;
      if (q.life <= 0) {
        this.group.remove(q.sprite);
        q.sprite.material.dispose();
        this.puffs.splice(i, 1);
        continue;
      }
      // Billowing out and slowing down.
      q.sprite.position.addScaledVector(q.v, dt);
      q.v.multiplyScalar(1 - Math.min(1, dt * 3));
      const k = 1 - q.life / q.max;
      q.sprite.scale.setScalar(q.size * (0.35 + 0.9 * Math.sqrt(k)));
      q.sprite.material.opacity = 0.85 * (1 - k) ** 1.5;
      q.sprite.material.rotation += q.spin * dt;
    }
    for (const m of this.mounds) {
      if (m.t >= 1) continue;
      // Splat down: tall, then flat with a wobble.
      m.t = Math.min(1, m.t + dt * 4);
      const k = m.t;
      const wob = Math.sin(k * Math.PI * 3) * (1 - k) * 0.35;
      m.mesh.scale.set(m.scale.x * (k + wob), m.scale.y * (1 + (1 - k) * 1.8 - wob), m.scale.z * (k + wob));
    }
    for (const s of this.splats) {
      const target = s.userData.size as number;
      if (s.scale.x < target && !s.userData.wiped) {
        const k = Math.min(target, s.scale.x + dt * target * 9);
        s.scale.set(k, k * (s.userData.stretch as number), 1);
      }
    }
  }

  /**
   * The mop's edge is at `x`: leftovers it reaches are pushed along in front of it and vanish past `gone`
   * (off the screen); splats it passes are wiped off. Returns how many things went.
   */
  sweep(x: number, dt: number, gone: number): number {
    let swept = 0;
    for (const q of this.pieces) {
      if (q.life <= 0) continue;
      const m = q.mesh;
      if (m.position.x > x) continue;
      m.position.x = x + 0.1 + q.size * 0.5;
      m.position.y = Math.max(m.position.y, groundAt(m.position.x, m.position.z) + q.size * 0.5);
      q.settled = false;
      q.v.set(0.5, 0, 0);
      m.rotation.z -= dt * 6;
      if (m.position.x > gone) {
        q.life = 0.3;
        swept++;
      }
    }
    for (let i = this.mounds.length - 1; i >= 0; i--) {
      const m = this.mounds[i].mesh;
      if (m.position.x > x) continue;
      m.position.x = x + 0.2;
      if (m.position.x > gone) {
        this.group.remove(m);
        this.mounds.splice(i, 1);
        swept++;
      }
    }
    for (let i = this.splats.length - 1; i >= 0; i--) {
      const s = this.splats[i];
      if (s.position.x < x) {
        s.userData.wiped = true;
        s.scale.multiplyScalar(1 - Math.min(0.5, dt * 6));
        (s.material as THREE.MeshPhysicalMaterial).opacity *= 1 - Math.min(0.5, dt * 5);
        if (s.scale.x < 0.1) {
          this.group.remove(s);
          (s.material as THREE.Material).dispose();
          this.splats.splice(i, 1);
        }
      }
    }
    return swept;
  }

  /** Throws everything away at once. */
  clear() {
    for (const s of this.splats) (s.material as THREE.Material).dispose();
    for (const s of this.sparks) s.sprite.material.dispose();
    for (const p of this.puffs) p.sprite.material.dispose();
    this.group.clear();
    this.pieces = [];
    this.sparks = [];
    this.puffs = [];
    this.mounds = [];
    this.splats = [];
  }
}

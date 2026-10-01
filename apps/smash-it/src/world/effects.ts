/**
 * Food coming apart: crumbs, shards, popcorn, cream and juice fly about with simple physics, settle on
 * the grass and stay there as leftovers (until the mop comes). Also splats, sparkles and shock rings.
 * The replay uses its own Effects, so its mess doesn't mix with the chapter's.
 */
import * as THREE from 'three';
import type { Effect } from '../game/foods';
import { COUNTER_Y, groundAt, type Vec3 } from '../game/physics';
import { dotTexture, mat, sparkleTexture, splatTexture } from './look';
import { SINK } from './models';

interface Piece {
  mesh: THREE.Mesh;
  v: THREE.Vector3;
  spin: THREE.Vector3;
  size: number;
  /** Seconds left; Infinity for leftovers that stay. */
  life: number;
  settled: boolean;
  /** Being washed down the sink. */
  sinking: number;
}

interface Spark {
  sprite: THREE.Sprite;
  v: THREE.Vector3;
  life: number;
  max: number;
  size: number;
}

interface Ring {
  mesh: THREE.Mesh;
  t: number;
  size: number;
}

const GRAVITY = 18;
/** Leftovers kept on the disc; beyond this the oldest ones fade away. */
const MAX_PIECES = 260;

const G = {
  crumb: new THREE.IcosahedronGeometry(1, 0),
  shard: new THREE.CylinderGeometry(1, 1, 0.38, 5, 1, false, 0, 1.1),
  chunk: new THREE.DodecahedronGeometry(1, 0),
  blob: new THREE.SphereGeometry(1, 10, 8),
  rind: new THREE.BoxGeometry(1, 0.35, 0.5),
  sprinkle: new THREE.BoxGeometry(0.35, 0.35, 1),
  tin: new THREE.CylinderGeometry(1, 0.85, 0.3, 18, 1, true),
  splat: new THREE.PlaneGeometry(1, 1),
  ring: new THREE.RingGeometry(0.8, 1, 40),
};

export class Effects {
  readonly group = new THREE.Group();
  private pieces: Piece[] = [];
  private sparks: Spark[] = [];
  private rings: Ring[] = [];
  private splats: THREE.Mesh[] = [];

  constructor(private readonly rand: () => number = Math.random) {}

  /** Number of leftovers lying about (for tests and the mop). */
  get mess(): number {
    return this.pieces.length + this.splats.length;
  }

  burst(effect: Effect, p: Vec3, dir: { x: number; z: number }, strength: number, last: boolean) {
    const r = this.rand;
    const up = (lo: number, hi: number) => lo + r() * (hi - lo);
    const spray = (n: number, geo: THREE.BufferGeometry, colors: string[], size: [number, number], speed: [number, number], lift: [number, number], keep = true) => {
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        const s = up(...speed) * strength;
        const v = new THREE.Vector3(Math.cos(a) * s + dir.x * s * 0.4, up(...lift), Math.sin(a) * s + dir.z * s * 0.4);
        this.piece(geo, colors[i % colors.length], p, v, up(...size), keep ? Infinity : up(0.6, 1.1));
      }
    };
    this.shockRing(p, effect === 'splash' || effect === 'smash' ? 3 : 1.6);
    switch (effect) {
      case 'crumble':
        spray(6, G.shard, ['#d99a4e', '#c98a3e'], [0.35, 0.5], [2.5, 5], [4, 8]);
        spray(10, G.crumb, ['#d99a4e', '#5a2d14'], [0.08, 0.14], [2, 6], [3, 7]);
        this.sparkle(p, 6, '#ffe2a8');
        break;
      case 'scatter':
        spray(28, G.crumb, ['#fff6d8', '#fff6d8', '#ffd36b'], [0.12, 0.2], [3, 8], [4, 10]);
        this.sparkle(p, 8, '#fff3c4');
        break;
      case 'smash':
        spray(9, G.chunk, ['#ff4d6d', '#ff6b81'], [0.25, 0.4], [3, 7], [5, 10]);
        spray(7, G.rind, ['#3b9b3f', '#58b94a'], [0.4, 0.6], [3, 6], [5, 9]);
        spray(14, G.blob, ['#2a1a1a'], [0.05, 0.07], [3, 8], [4, 9]);
        this.splat(p, 2.4, '#ff4d6d');
        this.sparkle(p, 14, '#ff8fa3');
        break;
      case 'wobble':
        if (last) {
          spray(7, G.blob, ['#ff3b6b', '#ff5b85'], [0.15, 0.28], [2, 5], [4, 7]);
          this.splat(p, 1.2, '#ff3b6b');
        }
        this.sparkle(p, 8, '#ff7ea0');
        break;
      case 'cheese':
        spray(last ? 10 : 4, G.crumb, ['#ff9a1f', '#ffcf5c'], [0.08, 0.15], [1.5, 4], [2, 5]);
        this.sparkle(p, 6, '#ffcf5c');
        break;
      case 'rings':
        spray(8, G.blob, ['#ff7eb6'], [0.1, 0.2], [2, 5], [4, 7]);
        spray(14, G.sprinkle, ['#ffffff', '#4dd0ff', '#ffe14d', '#7dff8a'], [0.05, 0.08], [2, 6], [4, 8]);
        this.sparkle(p, 8, '#ffb3d6');
        break;
      case 'splash':
        spray(22, G.blob, ['#fffaf2', '#fff1dc'], [0.15, 0.32], [3, 8], [5, 11]);
        spray(1, G.tin, ['#c9cfd8'], [0.6, 0.6], [1, 2], [7, 9]);
        this.splat(p, 3, '#fffaf2');
        this.sparkle(p, 16, '#ffffff');
        break;
      case 'slices':
        spray(6, G.crumb, ['#ffd84d', '#d63a2f', '#f2c26b'], [0.1, 0.18], [2, 5], [3, 7]);
        this.splat(p, 0.9, '#ffd84d');
        this.sparkle(p, 6, '#ffe58a');
        break;
    }
  }

  /** A puff of sparkles (also used when a bug gets hit). */
  sparkle(p: Vec3, n: number, color: string, size = 0.5) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.SpriteMaterial({ map: sparkleTexture, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
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
    const m = new THREE.Mesh(geo, mat(color, { rough: 0.7, rim: 0.3 }));
    m.position.set(p.x, Math.max(p.y, groundAt(p.x, p.z)) + 0.2, p.z);
    m.scale.setScalar(size);
    m.rotation.set(this.rand() * 6, this.rand() * 6, this.rand() * 6);
    m.castShadow = size > 0.2;
    this.group.add(m);
    this.pieces.push({ mesh: m, v, spin: new THREE.Vector3(this.rand() * 10 - 5, this.rand() * 10 - 5, this.rand() * 10 - 5), size, life, settled: false, sinking: 0 });
    if (this.pieces.length > MAX_PIECES) {
      const old = this.pieces.find((q) => q.life === Infinity && q.settled);
      if (old) old.life = 0.5;
    }
  }

  splat(p: Vec3, size: number, color: string) {
    const ground = groundAt(p.x, p.z);
    const m = new THREE.Mesh(
      G.splat,
      new THREE.MeshStandardMaterial({ map: splatTexture, color, transparent: true, roughness: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = this.rand() * 6;
    m.position.set(p.x, ground + 0.02 + this.splats.length * 0.0005, p.z);
    m.scale.setScalar(0.1);
    m.userData.size = size * 2;
    m.receiveShadow = true;
    this.group.add(m);
    this.splats.push(m);
  }

  private shockRing(p: Vec3, size: number) {
    const m = new THREE.Mesh(G.ring, new THREE.MeshBasicMaterial({ map: dotTexture, color: '#ffffff', transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, Math.max(p.y, groundAt(p.x, p.z)) + 0.05, p.z);
    this.group.add(m);
    this.rings.push({ mesh: m, t: 0, size });
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
      if (q.sinking > 0) {
        // Swirl down the drain.
        q.sinking += dt;
        const a = q.sinking * 6;
        const r = Math.max(0, 1.6 - q.sinking * 1.4);
        m.position.set(SINK.x + Math.cos(a) * r, COUNTER_Y - q.sinking * 1.5, SINK.z + Math.sin(a) * r);
        m.rotation.y += dt * 8;
        if (q.sinking > 1.3) {
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
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = r.t / 0.45;
      r.mesh.scale.setScalar(0.3 + k * r.size);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k) * 0.9;
      if (k >= 1) {
        this.group.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
      }
    }
    for (const s of this.splats) {
      const target = s.userData.size as number;
      if (s.scale.x < target && !s.userData.wiped) s.scale.setScalar(Math.min(target, s.scale.x + dt * target * 9));
    }
  }

  /**
   * The mop's edge is at `x`: leftovers it reaches are pushed along in front of it, fall off the disc and
   * slide into the sink; splats it passes are wiped off. Returns how many things went down the drain.
   */
  sweep(x: number, dt: number): number {
    let drained = 0;
    for (const q of this.pieces) {
      if (q.sinking > 0 || q.life <= 0) continue;
      const m = q.mesh;
      if (m.position.x > x) continue;
      m.position.x = x + 0.1 + q.size * 0.5;
      q.settled = false;
      q.v.set(0.5, 0, (SINK.z - m.position.z) * 0.6);
      m.rotation.z -= dt * 6;
      if (m.position.x > SINK.x - SINK.radius * 0.7 && Math.abs(m.position.z - SINK.z) < SINK.radius * 1.8) {
        q.sinking = 0.001;
        drained++;
      }
    }
    for (let i = this.splats.length - 1; i >= 0; i--) {
      const s = this.splats[i];
      if (s.position.x < x) {
        s.userData.wiped = true;
        s.scale.multiplyScalar(1 - Math.min(0.5, dt * 6));
        (s.material as THREE.MeshStandardMaterial).opacity *= 1 - Math.min(0.5, dt * 5);
        if (s.scale.x < 0.1) {
          this.group.remove(s);
          (s.material as THREE.Material).dispose();
          this.splats.splice(i, 1);
        }
      }
    }
    return drained;
  }

  /** Throws everything away at once. */
  clear() {
    for (const s of this.splats) (s.material as THREE.Material).dispose();
    for (const s of this.sparks) s.sprite.material.dispose();
    for (const r of this.rings) (r.mesh.material as THREE.Material).dispose();
    this.group.clear();
    this.pieces = [];
    this.sparks = [];
    this.rings = [];
    this.splats = [];
  }
}

/** Acid in the air, the green ring that shows where it will land, the wind-up glow and the umbrella. */
import * as THREE from 'three';
import type { Arena } from '../game/arena';
import { groundAt, slingAt } from '../game/physics';
import type { Effects } from './effects';
import { mat } from './look';
import { share } from './optimize';

const blobGeo = share(new THREE.SphereGeometry(0.42, 14, 10));
const ringGeo = share(new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2));
const domeGeo = share(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2));

interface View {
  blob: THREE.Mesh;
  ring: THREE.Mesh;
}

export class AcidView {
  readonly group = new THREE.Group();
  private readonly views = new Map<number, View>();
  private readonly umbrella = new THREE.Group();
  private open = 0;
  private sparkleIn = 0;

  constructor() {
    const cloth = new THREE.Mesh(domeGeo, mat('#ff4d6d', { rough: 0.5, double: true, transparent: 0.85 }));
    cloth.scale.set(2.1, 1.1, 2.1);
    const pole = new THREE.Mesh(share(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8)), mat('#7a4b1f', { rough: 0.5 }));
    pole.position.y = -0.7;
    const tip = new THREE.Mesh(share(new THREE.SphereGeometry(0.1, 8, 6)), mat('#ffd23f', { rough: 0.3 }));
    tip.position.y = 1.15;
    this.umbrella.add(cloth, pole, tip);
    this.umbrella.visible = false;
    this.group.add(this.umbrella);
  }

  clear() {
    for (const v of this.views.values()) this.drop(v);
    this.views.clear();
    this.umbrella.visible = false;
    this.open = 0;
  }

  private drop(v: View) {
    this.group.remove(v.blob, v.ring);
  }

  update(arena: Arena | null, dt: number, time: number, effects: Effects) {
    const seen = new Set<number>();
    for (const a of arena?.acids ?? []) {
      seen.add(a.id);
      let v = this.views.get(a.id);
      if (!v) {
        v = {
          blob: new THREE.Mesh(blobGeo, mat('#8bd62a', { rough: 0.15, clearcoat: 1, emissive: 0.6 })),
          ring: new THREE.Mesh(ringGeo, mat('#b6ff4a', { transparent: 0.75, emissive: 1.5, double: true })),
        };
        v.ring.renderOrder = 2;
        this.group.add(v.blob, v.ring);
        this.views.set(a.id, v);
      }
      const k = Math.min(1, a.t / a.dur);
      // The blob stretches along its fall and wobbles on the way up.
      v.blob.position.set(a.x, a.y, a.z);
      const s = 1 + Math.sin(time * 18) * 0.08;
      v.blob.scale.set(s, 1.15 - Math.sin(time * 18) * 0.08, s);
      // The ring tightens onto the spot as the blob comes down.
      v.ring.position.set(a.to.x, groundAt(a.to.x, a.to.z) + 0.07, a.to.z);
      v.ring.scale.setScalar(1.8 * (1.15 - k * 0.15) + Math.sin(time * 14) * 0.08);
      if (k > 0.55 && Math.random() < dt * 20) effects.dust(a, '#9be83a', 0.35, 1);
    }
    for (const [id, v] of this.views)
      if (!seen.has(id)) {
        this.drop(v);
        this.views.delete(id);
      }

    // Wind-up: the spitter fizzes green.
    this.sparkleIn -= dt;
    if (this.sparkleIn <= 0) {
      this.sparkleIn = 0.12;
      for (const b of arena?.bugs ?? []) if (b.spitT > 0) effects.sparkle({ x: b.x, y: b.y + b.def.radius * 1.2, z: b.z }, 1, '#9be83a', 0.5);
    }

    // The umbrella grows open over the slingshot and folds away.
    const want = arena && arena.player.umbrella > 0 ? 1 : 0;
    this.open += (want - this.open) * Math.min(1, dt * 12);
    const closing = want === 0 && this.open < 0.02;
    this.umbrella.visible = !closing && this.open > 0.02;
    if (this.umbrella.visible) {
      const sl = slingAt();
      this.umbrella.position.set(sl.x, sl.y + 1.9, sl.z);
      this.umbrella.scale.setScalar(this.open);
      // Tilts a little when the acid pings off it.
      this.umbrella.rotation.z = Math.sin(time * 9) * 0.03 * this.open;
    }
  }
}

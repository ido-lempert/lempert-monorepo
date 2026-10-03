/** The friend that helps for a few seconds: a little bunny that pops in, faces its target, throws and waves goodbye. */
import * as THREE from 'three';
import type { Arena, GameEvent } from '../game/arena';
import { groundAt } from '../game/physics';
import type { Effects } from './effects';
import { mat, outline } from './look';
import { share } from './optimize';

const ball = share(new THREE.SphereGeometry(1, 18, 14));
const ringGeo = share(new THREE.RingGeometry(0.84, 1, 40).rotateX(-Math.PI / 2));

function bunny() {
  const root = new THREE.Group();
  const fur = mat('#fff4f8', { rough: 0.7, sheen: 1 });
  const pink = mat('#ff9ec4', { rough: 0.6 });
  const dark = mat('#2a1a3a', { rough: 0.3 });
  const part = (m: THREE.Material, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) => {
    const o = new THREE.Mesh(ball, m);
    o.position.set(x, y, z);
    o.scale.set(sx, sy, sz);
    o.castShadow = false;
    return o;
  };
  const body = new THREE.Group();
  body.add(part(fur, 0, 0.62, 0, 0.55, 0.62, 0.5), part(fur, 0, 0.5, -0.45, 0.2), part(pink, 0, 0.5, 0.36, 0.3, 0.34, 0.2));
  const head = new THREE.Group();
  head.position.y = 1.4;
  head.add(
    part(fur, 0, 0, 0, 0.46, 0.4, 0.42),
    part(fur, -0.2, 0.62, 0, 0.12, 0.42, 0.1),
    part(fur, 0.2, 0.62, 0, 0.12, 0.42, 0.1),
    part(pink, -0.2, 0.62, 0.05, 0.06, 0.3, 0.04),
    part(pink, 0.2, 0.62, 0.05, 0.06, 0.3, 0.04),
    part(dark, -0.16, 0.06, 0.38, 0.07, 0.09, 0.04),
    part(dark, 0.16, 0.06, 0.38, 0.07, 0.09, 0.04),
    part(pink, 0, -0.04, 0.42, 0.06, 0.04, 0.04),
    part(pink, -0.3, -0.08, 0.34, 0.08, 0.05, 0.03),
    part(pink, 0.3, -0.08, 0.34, 0.08, 0.05, 0.03),
  );
  // The throwing arm, with a cookie in its paw.
  const arm = new THREE.Group();
  arm.position.set(0.5, 0.9, 0.05);
  arm.add(part(fur, 0.12, 0, 0, 0.16, 0.34, 0.16), part(mat('#d9953d', { rough: 0.6 }), 0.14, 0.4, 0.05, 0.17, 0.17, 0.05));
  root.add(body, head, arm);
  outline(root, 0.02);
  return { root, body, head, arm };
}

interface View {
  model: ReturnType<typeof bunny>;
  ring: THREE.Mesh;
  /** 0..1 pop-in, and the throw swing counting down. */
  grow: number;
  swing: number;
  yaw: number;
  want: number;
  leaving: number;
}

export class FriendView {
  readonly group = new THREE.Group();
  private readonly views = new Map<number, View>();

  clear() {
    for (const v of this.views.values()) this.group.remove(v.model.root, v.ring);
    this.views.clear();
  }

  /** Events that change how it looks: a poof when it comes and goes, a swing when it throws. */
  show(events: GameEvent[], effects: Effects) {
    for (const e of events) {
      if (e.type === 'ally-in') {
        const at = { x: e.ally.x, y: groundAt(e.ally.x, e.ally.z) + 0.8, z: e.ally.z };
        effects.sparkle(at, 10, '#ffd23f', 0.7);
        effects.dust(at, '#ffffff', 1, 10);
      } else if (e.type === 'ally-throw') {
        const v = this.views.get(e.ally.id);
        if (v) {
          v.swing = 1;
          v.want = Math.atan2(e.at.x - e.ally.x, e.at.z - e.ally.z);
        }
      } else if (e.type === 'ally-out') {
        const v = this.views.get(e.ally.id);
        if (v) v.leaving = 0.001;
        effects.sparkle({ x: e.ally.x, y: groundAt(e.ally.x, e.ally.z) + 1, z: e.ally.z }, 8, '#ffffff', 0.6);
      }
    }
  }

  update(arena: Arena | null, dt: number, time: number) {
    const a = arena?.ally ?? null;
    if (a && !this.views.has(a.id)) {
      const model = bunny();
      const ring = new THREE.Mesh(ringGeo, mat('#ffd23f', { transparent: 0.7, emissive: 1.5, double: true }));
      ring.renderOrder = 2;
      model.root.scale.setScalar(0.01);
      this.group.add(model.root, ring);
      this.views.set(a.id, { model, ring, grow: 0, swing: 0, yaw: 0, want: 0, leaving: 0 });
    }
    for (const [id, v] of this.views) {
      const live = a && a.id === id && v.leaving === 0;
      const root = v.model.root;
      if (live && a) {
        v.grow = Math.min(1, v.grow + dt * 4);
        const ground = groundAt(a.x, a.z);
        root.position.set(a.x, ground, a.z);
        // Pops in with a little overshoot, and blinks in the last two seconds.
        const pop = v.grow < 1 ? 1 + Math.sin(v.grow * Math.PI) * 0.3 : 1;
        const blink = a.life < 2 && Math.sin(time * 18) > 0.4 ? 0.55 : 1;
        root.scale.setScalar(Math.max(0.01, v.grow) * pop * blink);
        v.ring.visible = true;
        v.ring.position.set(a.x, ground + 0.06, a.z);
        v.ring.scale.setScalar(1.7 * (0.35 + 0.65 * (a.life / a.max)));
      } else {
        // Waving goodbye: shrinks away.
        v.leaving += dt;
        root.scale.setScalar(Math.max(0.01, root.scale.x * (1 - Math.min(0.5, dt * 8))));
        v.ring.visible = false;
        if (v.leaving > 0.5) {
          this.group.remove(root, v.ring);
          this.views.delete(id);
          continue;
        }
      }
      // Faces its target, bobs, and swings the arm up and over when it throws.
      let d = v.want - v.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      v.yaw += d * Math.min(1, dt * 14);
      root.rotation.y = v.yaw;
      v.swing = Math.max(0, v.swing - dt * 3.2);
      v.model.arm.rotation.x = -Math.sin((1 - v.swing) * Math.PI) * (v.swing > 0 ? 2.4 : 0);
      v.model.body.scale.y = 1 + Math.sin(time * 6) * 0.025;
      v.model.head.position.y = 1.4 + Math.sin(time * 6 + 1) * 0.03 + (v.swing > 0.6 ? 0.06 : 0);
    }
  }
}

/**
 * The restaurant seen from above like a board game: a dining room in front, the kitchen at the back behind
 * the pass, a stock board on the kitchen wall. Procedural, like every model here.
 */
import * as THREE from 'three';
import { mat } from './look';

function box(w: number, h: number, d: number, color: string, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, { rough: 0.6 }));
  m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

function table(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 28), mat('#f6efe4', { rough: 0.35, clearcoat: 0.4 }));
  top.position.y = 0.72;
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.7, 12), mat('#5b4334'));
  leg.position.y = 0.35;
  g.add(top, leg);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.42, 16), mat('#d9643a', { rough: 0.45 }));
    seat.position.set(Math.cos(a) * 0.95, 0.21, Math.sin(a) * 0.95);
    g.add(seat);
  }
  g.traverse((o) => (o.castShadow = o.receiveShadow = true));
  g.position.set(x, 0, z);
  return g;
}

export function restaurant(): THREE.Group {
  const g = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(13, 0.3, 10), mat('#c99a6b', { rough: 0.7 }));
  floor.position.y = -0.15;
  floor.receiveShadow = true;
  const kitchenFloor = new THREE.Mesh(new THREE.BoxGeometry(13, 0.02, 3.2), mat('#e8e4dc', { rough: 0.5 }));
  kitchenFloor.position.set(0, 0.01, -3.4);
  kitchenFloor.receiveShadow = true;
  g.add(floor, kitchenFloor);

  // Low walls, so the room reads from above.
  g.add(box(13, 0.9, 0.25, '#f3e2c7', 0, 0, -5), box(0.25, 0.9, 10, '#f3e2c7', -6.5, 0, 0), box(0.25, 0.9, 10, '#f3e2c7', 6.5, 0, 0));
  g.add(box(4.5, 0.9, 0.25, '#f3e2c7', -4.25, 0, 5), box(4.5, 0.9, 0.25, '#f3e2c7', 4.25, 0, 5));

  // The pass between the kitchen and the dining room, the stoves, and the stock board on the back wall.
  g.add(box(9, 1, 0.6, '#9aa3ab', -1, 0, -1.6));
  g.add(box(2.2, 0.95, 1, '#545b63', -4, 0, -4.2), box(2.2, 0.95, 1, '#545b63', -1.4, 0, -4.2));
  g.add(box(1.8, 1.2, 0.12, '#1f3b2d', 3.6, 0.6, -4.8));

  for (const [x, z] of [[-4, 1], [-1.3, 1], [1.4, 1], [4.1, 1], [-2.7, 3.4], [2.7, 3.4]] as const) g.add(table(x, z));
  return g;
}

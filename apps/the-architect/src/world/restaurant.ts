/**
 * The restaurant on its lot, seen from above at an angle like a life-sim: back and left walls stand, the
 * front and right walls are cut down so the room is open to the camera. Kitchen at the back behind the pass,
 * dining room in front, the entrance on the front wall. Units are metres (a KayKit tile is 2 m).
 * Only scenery lives here; people are placed by `Floor` from the night's state, at the spots in `SPOTS`.
 */
import * as THREE from 'three';
import { mat } from './look';
import { prop, type Prop } from './assets';
import * as K from './kitchen/items';
import { bake } from './kitchen/bake';

const ROOM = { x0: -8, x1: 8, z0: -8, z1: 10 };
const V = (x: number, z: number) => new THREE.Vector3(x, 0, z);

const TABLES: [number, number][] = [
  [-5.7, 1.6], [-1.9, 1.6], [1.9, 1.6], [5.7, 1.6],
  [-5.7, 6.4], [-1.9, 6.4], [1.9, 6.4], [5.7, 6.4],
];

export interface Seat {
  pos: THREE.Vector3;
  /** Facing the table. */
  rot: number;
}

/** Where people stand, sit and walk. Table i of the night is TABLES[i]. */
export const SPOTS = {
  table: (i: number) => V(TABLES[i][0], TABLES[i][1]),
  seat(i: number, n: number): Seat {
    const [x, z] = TABLES[i];
    const a = n === 0 ? -Math.PI / 2 : Math.PI / 2;
    return { pos: V(x + Math.sin(a) * 1.25, z), rot: a + Math.PI };
  },
  /** Where a waiter stands to serve table i. */
  service: (i: number) => V(TABLES[i][0], TABLES[i][1] - 1.35),
  door: V(6, 8.8),
  street: V(16, 12.6),
  queue: (i: number) => V(4.6 - i * 1.1, 12.2 + (i % 2) * 0.5),
  pass: (i: number) => V(-1.5 + i * 1.6, -1.55),
  waiterIdle: (i: number) => V(4.2 + i * 1.3, -1.1),
  staffDoor: V(6.5, -4.5),
  cooks: [V(-3, -5.4), V(3, -5.5)],
  host: V(6.6, 8.3),
  dish: (i: number) => new THREE.Vector3(-6.2 + i * 1.5, 1, -3),
  /** The stock board stands at the end of the pass; waiters waiting for the marker queue beside it. */
  board: V(3.9, -2.4),
  boardQueue: (i: number) => V(4.6 + i * 0.9, -1.4),
};

async function place(parent: THREE.Object3D, name: Prop, x: number, z: number, rotY = 0, y = 0, height = 1) {
  const o = await prop(name);
  o.position.set(x, y, z);
  o.rotation.y = rotY;
  o.scale.y = height;
  parent.add(o);
  return o;
}

/** Warm wooden planks for the dining floor, drawn on a canvas so the game needs no extra texture files. */
function planks(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    let x = -((r * 97) % 200);
    while (x < 512) {
      const w = 160 + ((x * 31 + r * 17) % 120);
      const shade = 150 + ((x + r * 53) % 30);
      g.fillStyle = `rgb(${shade + 50}, ${shade - 5}, ${shade - 60})`;
      g.fillRect(x, r * 64, w, 64);
      g.fillStyle = 'rgba(70, 40, 20, 0.35)';
      g.fillRect(x, r * 64, 3, 64);
      g.fillRect(x, r * 64, w, 2);
      x += w;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 3);
  t.anisotropy = 4;
  return t;
}

function lot(): THREE.Group {
  const g = new THREE.Group();
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), mat('#7fae5a', { rough: 0.95, rim: 0 }));
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.02;
  grass.receiveShadow = true;
  const walk = new THREE.Mesh(new THREE.PlaneGeometry(40, 4), mat('#d8d2c4', { rough: 0.9, rim: 0 }));
  walk.rotation.x = -Math.PI / 2;
  walk.position.set(0, -0.01, ROOM.z1 + 2.6);
  walk.receiveShadow = true;
  const dining = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), new THREE.MeshStandardMaterial({ map: planks(), roughness: 0.55 }));
  dining.rotation.x = -Math.PI / 2;
  dining.position.set(0, 0.005, 4);
  dining.receiveShadow = true;
  g.add(grass, walk, dining);
  return g;
}

export async function restaurant(): Promise<THREE.Group> {
  const g = new THREE.Group();
  g.add(lot());
  const jobs: Promise<unknown>[] = [];
  const at = (name: Prop, x: number, z: number, rotY = 0, y = 0, height = 1) => jobs.push(place(g, name, x, z, rotY, y, height));

  // Kitchen floor tiles (z -8 to -2), sunk so their top is the floor.
  for (let x = ROOM.x0 + 1; x < ROOM.x1; x += 2) for (const z of [-7, -5, -3]) at('floor_kitchen_small', x, z, 0, -0.5);

  // Back wall and left wall stand at full height.
  for (const [x, name] of [[-6, 'wall'], [-2, 'wall_window_open'], [2, 'wall'], [6, 'wall_window_open']] as const) at(name, x, ROOM.z0);
  for (const [z, name] of [[-6, 'wall'], [-2, 'wall'], [2, 'wall_window_open'], [6, 'wall_window_open']] as const) at(name, ROOM.x0, z, Math.PI / 2);
  at('wall_half', ROOM.x0, ROOM.z1, Math.PI / 2);
  // Front and right walls are cut down (like a life-sim's walls-down view), with the entrance on the front.
  for (const x of [-6, -2, 2]) at('wall', x, ROOM.z1, 0, 0, 0.22);
  for (const z of [-6, -2, 2, 6]) at('wall', ROOM.x1, z, Math.PI / 2, 0, 0.22);
  at('wall_half', ROOM.x1, ROOM.z1, Math.PI / 2, 0, 0.22);
  at('pillar_A', ROOM.x1, ROOM.z1, 0, 0, 0.22);

  // Kitchen line along the back wall: stainless props built in code (kitchen/items.ts), at 1.16x real
  // size so a counter top is 1 m, KayKit's counter height (dishes on the pass sit at y = 1).
  const kitchen = new THREE.Group();
  const S = 1.16, BACK = ROOM.z0 + 0.1;
  const put = (make: () => THREE.Group, x: number, z: number, rotY = 0, y = 0) => {
    const o = make();
    o.scale.setScalar(S);
    o.position.set(x, y, z);
    o.rotation.y = rotY;
    kitchen.add(o);
    return o;
  };
  const back = (make: () => THREE.Group, x: number, depth: number, y = 0) => put(make, x, BACK + (depth * S) / 2, 0, y);
  back(K.tallFridge, -7.38, 0.72);
  back(K.tallGlassFridge, -6.1, 0.8);
  back(K.jarShelf, -4.98, 0.32);
  back(K.baseCabinet2Drawer, -4.08, 0.7);
  back(K.gasRange, -3, 0.8);
  back(K.extractorHood, -3, 1.0, 2.35);
  back(K.tripleSink, -1.33, 0.68);
  back(K.prepCabinet, 0.22, 0.7);
  back(K.combiOven, 1.25, 0.8);
  back(K.doubleOven, 2.55, 0.8);
  back(K.baseCabinet2Door, 3.68, 0.7);
  back(K.conveyorToaster, 3.68, 0.55, 1.0);
  back(K.wineCooler, 4.6, 0.6);
  back(K.binDrawerCabinet, 5.55, 0.7);
  back(K.espressoStation, 6.6, 0.6);
  // Left wall: the cleaning cupboard faces into the kitchen.
  put(K.cleaningCabinet, ROOM.x0 + 0.1 + 0.3 * S, -4.8, Math.PI / 2);

  // The pass between kitchen and dining room (x -7 to 3): one counter, doors toward the cooks.
  put(() => K.passCounter(10 / S), -2, -3, Math.PI);
  g.add(bake(kitchen, 'Kitchen'));

  // Dining room: small round tables for two.
  for (let i = 0; i < TABLES.length; i++) {
    const [x, z] = TABLES[i];
    at('table_round_A_small', x, z);
    for (const n of [0, 1]) {
      const a = n === 0 ? -Math.PI / 2 : Math.PI / 2;
      // The chair's front faces the table (its backrest is on its +z side).
      at('chair_A', x + Math.sin(a) * 1.25, z, a + Math.PI);
    }
  }
  at('crate_tomatoes', 6.6, -5.2, 0.3);
  at('shelf_papertowel_decorated', -7.3, -1, Math.PI / 2);

  await Promise.all(jobs);
  return g;
}

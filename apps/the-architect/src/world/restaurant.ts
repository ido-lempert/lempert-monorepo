/**
 * The restaurant on its lot, seen from above at an angle like a life-sim: back and left walls stand, the
 * front and right walls are cut down so the room is open to the camera. Kitchen at the back behind the pass,
 * dining room in front, the entrance on the front wall. Units are metres (a KayKit tile is 2 m).
 */
import * as THREE from 'three';
import { mat } from './look';
import { person, prop, type Person, type Prop, type Who } from './assets';

const ROOM = { x0: -8, x1: 8, z0: -8, z1: 10 };
/** KayKit furniture is chunky, so people are drawn tall enough to match it. */
const PERSON = 2.6;

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
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), mat('#7fae5a', { rough: 0.95, rim: 0 }));
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.02;
  grass.receiveShadow = true;
  const walk = new THREE.Mesh(new THREE.PlaneGeometry(26, 4), mat('#d8d2c4', { rough: 0.9, rim: 0 }));
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

export interface Restaurant {
  group: THREE.Group;
  update(dt: number): void;
}

export async function restaurant(): Promise<Restaurant> {
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

  // Kitchen line along the back wall.
  at('fridge_A_decorated', -6.4, -6.9);
  at('stove_multi_decorated', -3, -7);
  at('kitchencounter_sink_backsplash', -1, -7);
  at('kitchencounter_straight_A_decorated', 1, -7);
  at('stove_single', 3, -7);
  at('kitchencounter_straight_B_backsplash', 5, -7);
  at('oven', 7, -6.9);
  at('extractorhood', -3, ROOM.z0 + 0.25);

  // The pass: a counter between kitchen and dining room, with dishes waiting on it.
  for (const x of [-6, -4, -2, 0, 2]) at('kitchencounter_straight_B', x, -3, Math.PI);
  at('food_dinner', -3.6, -3, 0, 1);
  at('food_stew', -0.4, -3, 0, 1);
  at('menu', 1.8, -3, Math.PI, 1);

  // Dining room: round tables with four chairs each.
  const tables: [number, number][] = [[-4.4, 2.6], [2.2, 2.6], [-4.4, 7.3], [2.2, 7.3]];
  const seats: { x: number; z: number; rot: number; tx: number; tz: number }[] = [];
  for (const [x, z] of tables) {
    at('table_round_A', x, z);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const cx = x + Math.sin(a) * 2.05;
      const cz = z + Math.cos(a) * 2.05;
      at('chair_A', cx, cz, a);
      seats.push({ x: cx, z: cz, rot: a + Math.PI, tx: x, tz: z });
    }
  }
  at('crate_tomatoes', 6.6, -5.2, 0.3);
  at('shelf_papertowel_decorated', -7.3, -1, Math.PI / 2);

  await Promise.all(jobs);

  // People: guests at some of the seats, a waiter walking the floor, a cook at the stove, a host at the door.
  const people: Person[] = [];
  const add = async (who: Who, clip: string, x: number, z: number, rotY: number, y = 0) => {
    const p = await person(who, PERSON);
    p.root.position.set(x, y, z);
    p.root.rotation.y = rotY;
    p.play(clip);
    p.mixer.update(Math.random() * 2);
    g.add(p.root);
    people.push(p);
    return p;
  };
  const guests: [Who, number][] = [['woman', 0], ['suit', 1], ['suit', 2], ['woman', 5], ['woman', 8], ['suit', 10], ['woman', 13], ['suit', 15]];
  for (const [who, i] of guests) {
    const s = seats[i];
    // The suit's sitting clip leans back from its origin, so he is moved in towards the table.
    const inward = who === 'suit' ? 0.6 : 0;
    await add(who, 'Sitting', s.x + (s.tx - s.x) * (inward / 2.05), s.z + (s.tz - s.z) * (inward / 2.05), s.rot, 0.1);
    // A plate on the table in front of each guest.
    const px = s.tx + (s.x - s.tx) * 0.45;
    const pz = s.tz + (s.z - s.tz) * 0.45;
    const plate = await place(g, i % 2 ? 'food_dinner' : 'food_stew', px, pz, s.rot, 1);
    plate.scale.setScalar(0.6);
  }
  await add('worker', 'Interact', -3, -5.4, Math.PI);
  await add('worker', 'Interact', 3, -5.5, Math.PI);
  await add('business', 'Wave', 6.4, ROOM.z1 - 1.4, -2.4);

  const waiter = await add('woman2', 'Walk', 5.6, -0.6, 0);
  const route = [new THREE.Vector3(5.6, 0, -0.6), new THREE.Vector3(-1.1, 0, -0.6), new THREE.Vector3(-1.1, 0, 5), new THREE.Vector3(5.6, 0, 5)];
  let leg = 0;
  const speed = 1.4;

  return {
    group: g,
    update(dt) {
      for (const p of people) p.mixer.update(dt);
      const target = route[(leg + 1) % route.length];
      const pos = waiter.root.position;
      const to = target.clone().sub(pos);
      const d = to.length();
      if (d < 0.05) leg = (leg + 1) % route.length;
      else {
        pos.addScaledVector(to.normalize(), Math.min(d, speed * dt));
        waiter.root.rotation.y = Math.atan2(to.x, to.z);
      }
    },
  };
}

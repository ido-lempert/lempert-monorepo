/**
 * Procedural low-poly models. Everything is built from primitives, so there are no assets to download
 * and the whole world works offline. Every model faces +z (towards the camera) by default.
 */
import * as THREE from 'three';
import type { Avatar, DecorationId, HatId, SpeciesId } from '../game/progress';
import type { Side, SukkahSpot } from './layout';

const mats = new Map<string, THREE.MeshStandardMaterial>();

/** Shared flat-shaded material per colour (and glow). */
export function mat(color: string, emissive = 0): THREE.MeshStandardMaterial {
  const key = `${color}|${emissive}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: 0.85,
      emissive: emissive ? new THREE.Color(color) : new THREE.Color(0),
      emissiveIntensity: emissive,
    });
    mats.set(key, m);
  }
  return m;
}

function mesh(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const box = (w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0) =>
  mesh(new THREE.BoxGeometry(w, h, d), mat(color), x, y, z);

function stripes(colors: string[], vertical = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const n = colors.length * 2;
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[i % colors.length];
    if (vertical) g.fillRect((i * 64) / n, 0, 64 / n + 1, 64);
    else g.fillRect(0, (i * 64) / n, 64, 64 / n + 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// --- Sukkah ---------------------------------------------------------------------------------------

export const SUKKAH_HEIGHT = 2.6;

export interface SukkahModel {
  group: THREE.Group;
  /** The schach, hidden while decorating so the inside is visible from above. */
  roof: THREE.Group;
  /** Invisible plane over the floor, for tapping when placing decorations. */
  floor: THREE.Mesh;
}

/** A sukkah in local coordinates (centre at 0,0), with fabric walls and schach made of branches. */
export function sukkah(s: SukkahSpot, fabric: string[]): SukkahModel {
  const group = new THREE.Group();
  const hw = s.w / 2;
  const hd = s.d / 2;
  const h = SUKKAH_HEIGHT;

  // Wooden floor.
  group.add(box(s.w, 0.08, s.d, '#c9a36b', 0, 0.04, 0));

  for (const [x, z] of [
    [-hw, -hd],
    [hw, -hd],
    [-hw, hd],
    [hw, hd],
  ])
    group.add(box(0.22, h, 0.22, '#8d6e4a', x, h / 2, z));

  const wallTex = stripes(fabric);
  const walls: Record<Side, [number, number, number, number]> = {
    north: [0, -hd, s.w, 0],
    south: [0, hd, s.w, 0],
    west: [-hw, 0, s.d, Math.PI / 2],
    east: [hw, 0, s.d, Math.PI / 2],
  };
  for (const side of Object.keys(walls) as Side[]) {
    const [x, z, len, rot] = walls[side];
    if (side === s.open) {
      // A beam over the entrance.
      const beam = box(len, 0.16, 0.16, '#8d6e4a', x, h - 0.08, z);
      beam.rotation.y = rot;
      group.add(beam);
      continue;
    }
    const tex = wallTex.clone();
    tex.repeat.set(len / 1.2, 1);
    const wall = mesh(new THREE.BoxGeometry(len, h - 0.3, 0.06), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), x, (h - 0.3) / 2 + 0.1, z);
    wall.rotation.y = rot;
    group.add(wall);
  }

  // Schach: bamboo poles across, with palm branches on top.
  const roof = new THREE.Group();
  for (let x = -hw; x <= hw + 0.01; x += 0.5) roof.add(box(0.08, 0.08, s.d + 0.4, '#b08d57', x, h + 0.04, 0));
  const leaf = mat('#5a8f3a');
  const leafDark = mat('#3f7030');
  for (let i = 0; i < Math.round(s.w * s.d * 0.6); i++) {
    const frond = mesh(new THREE.ConeGeometry(0.28, 1.6, 4), i % 2 ? leaf : leafDark);
    frond.scale.set(1, 1, 0.25);
    // Deterministic scatter so both sukkot look the same on every visit.
    const a = Math.sin(i * 12.9898) * 43758.5453;
    const b = Math.sin(i * 78.233) * 12345.678;
    frond.position.set((a - Math.floor(a) - 0.5) * s.w, h + 0.14, (b - Math.floor(b) - 0.5) * s.d);
    frond.rotation.set(Math.PI / 2, 0, i * 1.7);
    frond.castShadow = true;
    roof.add(frond);
  }
  group.add(roof);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(s.w - 0.3, s.d - 0.3), new THREE.MeshBasicMaterial({ visible: false }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.09;
  group.add(floor);

  return { group, roof, floor };
}

// --- Nature ---------------------------------------------------------------------------------------

export function palm(seed = 0): THREE.Group {
  const g = new THREE.Group();
  const trunk = mat('#9c7a4f');
  let y = 0;
  for (let i = 0; i < 6; i++) {
    const seg = mesh(new THREE.CylinderGeometry(0.2 - i * 0.015, 0.24 - i * 0.015, 0.7, 6), trunk, Math.sin(seed + i * 0.4) * 0.08 * i, y + 0.35, 0);
    g.add(seg);
    y += 0.68;
  }
  const top = new THREE.Vector3(Math.sin(seed + 2) * 0.4, y, 0);
  for (let i = 0; i < 7; i++) {
    const frond = mesh(new THREE.ConeGeometry(0.35, 2.4, 4), mat(i % 2 ? '#4f9a3c' : '#3d7f30'));
    frond.scale.set(1, 1, 0.2);
    frond.position.copy(top);
    frond.rotation.set(0, (i / 7) * Math.PI * 2 + seed, 1.1);
    frond.translateY(1.1);
    g.add(frond);
  }
  return g;
}

export function tree(seed = 0): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.6, 6), mat('#7a5634'), 0, 0.8, 0));
  const greens = ['#4c9a4a', '#5aac4f', '#3f8a44'];
  for (let i = 0; i < 3; i++) {
    const blob = mesh(new THREE.IcosahedronGeometry(1.2 - i * 0.2, 0), mat(greens[(i + seed) % 3]), Math.sin(seed + i) * 0.4, 2.1 + i * 0.7, Math.cos(seed + i) * 0.3);
    g.add(blob);
  }
  return g;
}

export function bush(color = '#3f7a3a', scale = 1): THREE.Mesh {
  const m = mesh(new THREE.IcosahedronGeometry(0.6 * scale, 0), mat(color), 0, 0.45 * scale, 0);
  m.scale.y = 0.75;
  return m;
}

export function house(color: string): THREE.Group {
  const g = new THREE.Group();
  g.add(box(4, 2.6, 3.5, color, 0, 1.3, 0));
  const roof = mesh(new THREE.ConeGeometry(3.2, 1.6, 4), mat('#c0583c'), 0, 3.4, 0);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 0.85);
  g.add(roof);
  g.add(box(0.8, 1.4, 0.06, '#7a5634', 0, 0.7, 1.76));
  g.add(box(0.7, 0.6, 0.06, '#bfe3ff', -1.2, 1.5, 1.76));
  g.add(box(0.7, 0.6, 0.06, '#bfe3ff', 1.2, 1.5, 1.76));
  // Every house in the village has its own little sukkah roof over the porch.
  g.add(box(1.8, 0.06, 1, '#b08d57', 0, 2.1, 2.2));
  g.add(box(1.8, 0.1, 1, '#4f9a3c', 0, 2.18, 2.2));
  return g;
}

// --- Four species ---------------------------------------------------------------------------------

export function species(id: SpeciesId): THREE.Group {
  const g = new THREE.Group();
  switch (id) {
    case 'etrog': {
      const fruit = mesh(new THREE.SphereGeometry(0.22, 10, 8), mat('#f2d43d'));
      fruit.scale.set(1, 1.35, 1);
      g.add(fruit);
      g.add(mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.08, 5), mat('#6b7b2a'), 0, 0.32, 0));
      break;
    }
    case 'lulav': {
      g.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.4, 5), mat('#7fa845'), 0, 0, 0));
      const tip = mesh(new THREE.ConeGeometry(0.1, 0.9, 4), mat('#8bb54f'), 0, 0.9, 0);
      tip.scale.z = 0.4;
      g.add(tip);
      g.position.y = 0.2;
      break;
    }
    case 'hadas':
    case 'arava': {
      const hadas = id === 'hadas';
      g.add(mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.1, 5), mat(hadas ? '#6b4f2a' : '#a0463a'), 0, 0, 0));
      const leaf = mat(hadas ? '#2f6b2f' : '#8fc46a');
      for (let i = 0; i < (hadas ? 12 : 8); i++) {
        const l = mesh(hadas ? new THREE.SphereGeometry(0.07, 5, 4) : new THREE.SphereGeometry(0.05, 5, 4), leaf);
        l.scale.set(1, hadas ? 1.6 : 4, 0.6);
        const a = i * 2.1;
        l.position.set(Math.cos(a) * 0.08, -0.4 + i * (hadas ? 0.075 : 0.11), Math.sin(a) * 0.08);
        l.rotation.z = Math.cos(a) * 0.5;
        g.add(l);
      }
      g.position.y = 0.1;
      break;
    }
  }
  return g;
}

/** A glowing ring on the ground marking something to pick up or step into. */
export function marker(color: string, radius = 0.8): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.75, radius, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  return ring;
}

// --- Characters -----------------------------------------------------------------------------------

export interface Character {
  group: THREE.Group;
  /** Limbs swing while walking. */
  limbs: { armL: THREE.Object3D; armR: THREE.Object3D; legL: THREE.Object3D; legR: THREE.Object3D };
  hat: THREE.Group;
}

function limb(color: string, len: number, radius: number, x: number, y: number): THREE.Group {
  // Pivot at the shoulder/hip so rotation.x swings it.
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  pivot.add(mesh(new THREE.CapsuleGeometry(radius, len, 3, 6), mat(color), 0, -len / 2, 0));
  return pivot;
}

function face(g: THREE.Group, y: number, r: number) {
  const eye = mat('#1b1e2b');
  g.add(mesh(new THREE.SphereGeometry(r * 0.13, 6, 5), eye, -r * 0.35, y + r * 0.1, r * 0.88));
  g.add(mesh(new THREE.SphereGeometry(r * 0.13, 6, 5), eye, r * 0.35, y + r * 0.1, r * 0.88));
  const smile = mesh(new THREE.TorusGeometry(r * 0.28, r * 0.05, 4, 10, Math.PI), mat('#8a3b2e'), 0, y - r * 0.2, r * 0.9);
  smile.rotation.z = Math.PI;
  g.add(smile);
}

export function character(a: Pick<Avatar, 'shirt' | 'skin' | 'hat'>, pants = '#35507a'): Character {
  const group = new THREE.Group();
  const legL = limb(pants, 0.45, 0.11, -0.14, 0.62);
  const legR = limb(pants, 0.45, 0.11, 0.14, 0.62);
  group.add(legL, legR);
  group.add(mesh(new THREE.CapsuleGeometry(0.3, 0.45, 4, 8), mat(a.shirt), 0, 0.95, 0));
  const armL = limb(a.shirt, 0.4, 0.09, -0.4, 1.2);
  const armR = limb(a.shirt, 0.4, 0.09, 0.4, 1.2);
  group.add(armL, armR);
  group.add(mesh(new THREE.SphereGeometry(0.32, 12, 10), mat(a.skin), 0, 1.62, 0));
  face(group, 1.62, 0.32);
  const hat = new THREE.Group();
  group.add(hat);
  setHat(hat, a.hat);
  return { group, limbs: { armL, armR, legL, legR }, hat };
}

export function setHat(hat: THREE.Group, id: HatId) {
  hat.clear();
  if (id === 'kippah') {
    const k = mesh(new THREE.SphereGeometry(0.2, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat('#2b4c9b'), 0, 1.86, -0.05);
    k.scale.y = 0.45;
    hat.add(k);
  } else if (id === 'cap') {
    hat.add(mesh(new THREE.SphereGeometry(0.34, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#d94f4f'), 0, 1.72, 0));
    hat.add(box(0.36, 0.04, 0.3, '#d94f4f', 0, 1.74, 0.36));
  } else if (id === 'crown') {
    hat.add(mesh(new THREE.CylinderGeometry(0.26, 0.24, 0.14, 10, 1, true), mat('#f2c230', 0.15), 0, 1.93, 0));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      hat.add(mesh(new THREE.ConeGeometry(0.06, 0.16, 4), mat('#f2c230', 0.15), Math.sin(a) * 0.24, 2.07, Math.cos(a) * 0.24));
    }
  }
}

/** Abraham: white robe, a long beard, a striped head cloth and a shepherd's staff. */
export function abraham(): Character {
  const group = new THREE.Group();
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  const robe = mesh(new THREE.CylinderGeometry(0.3, 0.5, 1.3, 8), mat('#f3efe4'), 0, 0.65, 0);
  group.add(robe);
  group.add(box(0.62, 0.1, 0.62, '#b5773b', 0, 0.95, 0));
  const armL = limb('#f3efe4', 0.45, 0.1, -0.38, 1.25);
  const armR = limb('#f3efe4', 0.45, 0.1, 0.38, 1.25);
  armR.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.9, 5), mat('#7a5634'), 0.05, -0.3, 0.12));
  group.add(armL, armR);
  group.add(mesh(new THREE.SphereGeometry(0.32, 12, 10), mat('#e0ac7e'), 0, 1.62, 0));
  face(group, 1.66, 0.32);
  const beard = mesh(new THREE.ConeGeometry(0.24, 0.55, 8), mat('#f5f5f5'), 0, 1.33, 0.2);
  beard.rotation.x = Math.PI + 0.25;
  group.add(beard);
  const cloth = new THREE.MeshStandardMaterial({ map: stripes(['#ffffff', '#ffffff', '#2d5aa0'], false), roughness: 0.9 });
  const hood = mesh(new THREE.SphereGeometry(0.37, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), cloth, 0, 1.64, -0.04);
  group.add(hood);
  return { group, limbs: { armL, armR, legL, legR }, hat: new THREE.Group() };
}

/** Shoshi the sheep, the computer rival in the etrog hunt. */
export function sheep(): Character {
  const group = new THREE.Group();
  const wool = mat('#fbf8f0');
  const dark = mat('#3b3036');
  for (const [x, y, z, r] of [
    [0, 0.75, 0, 0.45],
    [0, 0.8, -0.35, 0.4],
    [0.25, 0.85, -0.1, 0.33],
    [-0.25, 0.85, -0.1, 0.33],
    [0, 1.05, -0.1, 0.35],
  ])
    group.add(mesh(new THREE.IcosahedronGeometry(r, 1), wool, x, y, z));
  const legs = [-0.2, 0.2].flatMap((x) =>
    [0.2, -0.4].map((z) => {
      const l = new THREE.Group();
      l.position.set(x, 0.5, z);
      l.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 5), dark, 0, -0.25, 0));
      group.add(l);
      return l;
    }),
  );
  const head = new THREE.Group();
  head.position.set(0, 1.05, 0.45);
  head.add(mesh(new THREE.SphereGeometry(0.24, 10, 8), dark));
  head.add(mesh(new THREE.IcosahedronGeometry(0.17, 1), wool, 0, 0.2, -0.04));
  for (const x of [-0.24, 0.24]) {
    const ear = mesh(new THREE.SphereGeometry(0.1, 6, 4), dark, x, 0.05, -0.05);
    ear.scale.set(1.6, 0.6, 0.8);
    head.add(ear);
  }
  head.add(mesh(new THREE.SphereGeometry(0.045, 6, 5), mat('#ffffff'), -0.1, 0.05, 0.21));
  head.add(mesh(new THREE.SphereGeometry(0.045, 6, 5), mat('#ffffff'), 0.1, 0.05, 0.21));
  group.add(head);
  return { group, limbs: { armL: legs[0], armR: legs[1], legL: legs[2], legR: legs[3] }, hat: new THREE.Group() };
}

/** Swings the limbs; `phase` advances with distance walked, `amount` is 0 when standing. */
export function animateWalk(c: Character, phase: number, amount: number) {
  const s = Math.sin(phase) * 0.7 * amount;
  c.limbs.armL.rotation.x = s;
  c.limbs.armR.rotation.x = -s;
  c.limbs.legL.rotation.x = -s;
  c.limbs.legR.rotation.x = s;
}

// --- Decorations ----------------------------------------------------------------------------------

function hanging(item: THREE.Object3D, drop: number): THREE.Group {
  // Hanging items are built with y=0 at the schach and hang downwards.
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, drop, 3), mat('#6b5a45'), 0, -drop / 2, 0));
  item.position.y = -drop;
  g.add(item);
  return g;
}

function starShape(outer: number, inner: number): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i < 12; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i / 12) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return shape;
}

export function decorationModel(id: DecorationId): THREE.Group {
  switch (id) {
    case 'chain': {
      const g = new THREE.Group();
      const colors = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#f2c230'];
      for (let i = 0; i < 9; i++) {
        const ring = mesh(new THREE.TorusGeometry(0.1, 0.025, 4, 10), mat(colors[i % colors.length]));
        const x = -0.8 + i * 0.2;
        ring.position.set(x, -0.15 - 0.25 * (1 - (x / 0.8) ** 2), 0);
        ring.rotation.y = i % 2 ? Math.PI / 2 : 0;
        g.add(ring);
      }
      return g;
    }
    case 'star': {
      const geo = new THREE.ExtrudeGeometry(starShape(0.28, 0.16), { depth: 0.05, bevelEnabled: false });
      geo.center();
      return hanging(mesh(geo, mat('#f2c230', 0.35)), 0.45);
    }
    case 'pomegranates': {
      const g = new THREE.Group();
      for (const [x, drop] of [
        [-0.18, 0.4],
        [0, 0.6],
        [0.18, 0.35],
      ]) {
        const fruit = new THREE.Group();
        fruit.add(mesh(new THREE.SphereGeometry(0.12, 10, 8), mat('#b3202e')));
        fruit.add(mesh(new THREE.ConeGeometry(0.05, 0.08, 5), mat('#7d1620'), 0, 0.13, 0));
        const h = hanging(fruit, drop);
        h.position.x = x;
        g.add(h);
      }
      return g;
    }
    case 'lantern': {
      const l = new THREE.Group();
      l.add(box(0.26, 0.04, 0.26, '#6b4a2a', 0, 0.18, 0));
      l.add(box(0.26, 0.04, 0.26, '#6b4a2a', 0, -0.18, 0));
      l.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.32, 8), mat('#ffb347', 0.9)));
      l.add(mesh(new THREE.ConeGeometry(0.18, 0.12, 4), mat('#6b4a2a'), 0, 0.26, 0));
      return hanging(l, 0.6);
    }
    case 'chair': {
      const g = new THREE.Group();
      g.add(box(0.5, 0.06, 0.5, '#a0662f', 0, 0.45, 0));
      g.add(box(0.5, 0.55, 0.06, '#a0662f', 0, 0.75, -0.22));
      for (const [x, z] of [
        [-0.2, -0.2],
        [0.2, -0.2],
        [-0.2, 0.2],
        [0.2, 0.2],
      ])
        g.add(box(0.05, 0.45, 0.05, '#7a4a20', x, 0.22, z));
      return g;
    }
    case 'rug': {
      const tex = stripes(['#b5363b', '#f2c230', '#2a6f97']);
      tex.repeat.set(3, 1);
      const g = new THREE.Group();
      g.add(mesh(new THREE.BoxGeometry(1.6, 0.02, 1.1), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }), 0, 0.01, 0));
      return g;
    }
    case 'table': {
      const g = new THREE.Group();
      g.add(box(1.3, 0.06, 0.8, '#ffffff', 0, 0.72, 0));
      g.add(box(1.34, 0.18, 0.84, '#ffffff', 0, 0.64, 0));
      for (const [x, z] of [
        [-0.55, -0.32],
        [0.55, -0.32],
        [-0.55, 0.32],
        [0.55, 0.32],
      ])
        g.add(box(0.06, 0.6, 0.06, '#7a4a20', x, 0.3, z));
      g.add(mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.1, 8), mat('#d9a441'), 0.3, 0.8, 0));
      g.add(mesh(new THREE.SphereGeometry(0.08, 8, 6), mat('#f2d43d'), -0.25, 0.83, 0.1));
      return g;
    }
  }
}

// --- Game Hub arch --------------------------------------------------------------------------------

export function portal(): { group: THREE.Group; ring: THREE.Mesh } {
  const group = new THREE.Group();
  for (const x of [-1.8, 1.8]) group.add(mesh(new THREE.CylinderGeometry(0.3, 0.35, 3.2, 8), mat('#7b5ea7'), x, 1.6, 0));
  const arch = mesh(new THREE.TorusGeometry(1.8, 0.28, 6, 16, Math.PI), mat('#9b7fd0'), 0, 3.2, 0);
  group.add(arch);
  const ring = new THREE.Mesh(
    new THREE.CircleGeometry(1.45, 32),
    new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
  );
  ring.position.y = 2.2;
  group.add(ring);
  group.add(species('etrog').translateY(4.7).rotateZ(0.2));
  return { group, ring };
}

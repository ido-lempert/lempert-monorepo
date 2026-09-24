/**
 * Procedural models in a soft, rounded "toy" style. Everything is built from primitives, so there are no
 * assets to download and the whole world works offline. Every model faces +z (towards the camera).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { type AccessoryId, type Avatar, type DecorationId, type EyeStyle, fullAvatar, type HairStyle, type HatId, type MouthStyle, type Pattern, type SpeciesId } from '../game/progress';
import type { Side, SukkahSpot } from './layout';
import { beamTexture, fabricTexture, mat, type MatOptions, outline } from './look';

export { mat };

function mesh(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const rbox = (w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0, radius = 0.06, o: MatOptions = {}) =>
  mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 2, h / 2, d / 2)), mat(color, o), x, y, z);

const ball = (r: number, color: string, x = 0, y = 0, z = 0, o: MatOptions = {}) =>
  mesh(new THREE.SphereGeometry(r, 20, 14), mat(color, o), x, y, z);

/** A pointed leaf in the XY plane, pointing up +y. */
function leafGeometry(len: number, width: number): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(width, len * 0.35, 0, len);
  s.quadraticCurveTo(-width, len * 0.35, 0, 0);
  return new THREE.ShapeGeometry(s, 8);
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

/** Colourful party lights hanging in a gentle curve from a to b. */
export function stringLights(a: THREE.Vector3, b: THREE.Vector3, count: number, sag = 0.35): THREE.Group {
  const g = new THREE.Group();
  const colors = ['#ff5d73', '#ffd23f', '#4dd4ff', '#7cf07c', '#c77dff'];
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    points.push(p);
    if (i > 0 && i < count) {
      const bulb = mesh(new THREE.SphereGeometry(0.065, 10, 8), mat(colors[i % colors.length], { emissive: 6, rim: 0 }), p.x, p.y - 0.06, p.z);
      bulb.castShadow = false;
      g.add(bulb);
    }
  }
  const wire = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), count * 2, 0.012, 4), mat('#3b3b3b', { rim: 0 }));
  g.add(wire);
  return g;
}

/** A sukkah in local coordinates (centre at 0,0), with fabric walls and schach made of branches. */
export function sukkah(s: SukkahSpot, fabric: string[]): SukkahModel {
  const group = new THREE.Group();
  const hw = s.w / 2;
  const hd = s.d / 2;
  const h = SUKKAH_HEIGHT;

  group.add(rbox(s.w + 0.3, 0.1, s.d + 0.3, '#d9b27a', 0, 0.035, 0, 0.04));
  // Floor planks.
  for (let x = -hw + 0.25; x < hw; x += 0.5) {
    const plank = rbox(0.46, 0.02, s.d, Math.round(x * 2) % 2 ? '#e2bf88' : '#d6b07a', x, 0.08, 0, 0.008);
    plank.castShadow = false;
    group.add(plank);
  }

  for (const [x, z] of [
    [-hw, -hd],
    [hw, -hd],
    [-hw, hd],
    [hw, hd],
  ])
    group.add(rbox(0.24, h, 0.24, '#a07448', x, h / 2, z, 0.06));

  const tex = fabricTexture(fabric);
  const walls: Record<Side, [number, number, number, number]> = {
    north: [0, -hd, s.w, 0],
    south: [0, hd, s.w, 0],
    west: [-hw, 0, s.d, Math.PI / 2],
    east: [hw, 0, s.d, Math.PI / 2],
  };
  for (const side of Object.keys(walls) as Side[]) {
    const [x, z, len, rot] = walls[side];
    const beam = rbox(len + 0.1, 0.16, 0.16, '#a07448', x, h - 0.08, z, 0.05);
    beam.rotation.y = rot;
    group.add(beam);
    if (side === s.open) continue;
    const t = tex.clone();
    t.repeat.set(len / 1.4, 1);
    t.needsUpdate = true;
    const wall = mesh(new THREE.BoxGeometry(len - 0.2, h - 0.45, 0.07), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }), x, (h - 0.45) / 2 + 0.2, z);
    wall.rotation.y = rot;
    group.add(wall);
  }

  // Schach: bamboo poles across, with a thick layer of palm leaves on top.
  const roof = new THREE.Group();
  const bamboo = mat('#c9a15c');
  for (let x = -hw; x <= hw + 0.01; x += 0.45) {
    const pole = mesh(new THREE.CylinderGeometry(0.045, 0.045, s.d + 0.5, 8), bamboo, x, h + 0.05, 0);
    pole.rotation.x = Math.PI / 2;
    roof.add(pole);
  }
  const leaf = leafGeometry(0.95, 0.2);
  leaf.rotateX(-Math.PI / 2);
  const greens = ['#5cae3f', '#4a9a34', '#6cc24a', '#3f8a2e'].map((c) => mat(c, { double: true, rim: 0.2 }));
  const n = Math.round(s.w * s.d * 2.2);
  for (let i = 0; i < n; i++) {
    // Deterministic scatter so both sukkot look the same on every visit.
    const a = Math.sin(i * 12.9898) * 43758.5453;
    const b = Math.sin(i * 78.233) * 12345.678;
    const l = mesh(leaf, greens[i % greens.length], (a - Math.floor(a) - 0.5) * s.w, h + 0.1 + (i % 3) * 0.03, (b - Math.floor(b) - 0.5) * s.d);
    l.rotation.y = i * 2.39;
    l.rotation.z = Math.sin(i) * 0.15;
    l.receiveShadow = false;
    roof.add(l);
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
  const trunk = mat('#b0875a');
  const ring = mat('#94704a');
  const lean = Math.sin(seed * 1.7) * 0.07;
  let x = 0;
  let y = 0;
  for (let i = 0; i < 8; i++) {
    const r = 0.24 - i * 0.012;
    g.add(mesh(new THREE.CylinderGeometry(r * 0.9, r, 0.55, 10), i % 2 ? ring : trunk, x, y + 0.275, 0));
    x += lean * i * 0.4;
    y += 0.53;
  }
  const top = new THREE.Vector3(x, y, 0);
  const frond = leafGeometry(2.4, 0.42);
  frond.rotateX(Math.PI / 2);
  const greens = [mat('#4caf3a', { double: true }), mat('#3d9530', { double: true })];
  for (let i = 0; i < 9; i++) {
    const pivot = new THREE.Group();
    pivot.position.copy(top);
    pivot.rotation.y = (i / 9) * Math.PI * 2 + seed;
    const f = mesh(frond, greens[i % 2]);
    f.rotation.x = 0.35 + (i % 3) * 0.15;
    pivot.add(f);
    g.add(pivot);
  }
  // A cluster of dates under the leaves.
  for (let i = 0; i < 6; i++) g.add(ball(0.09, '#e0862b', top.x + Math.cos(i) * 0.2, top.y - 0.25 - (i % 2) * 0.1, Math.sin(i) * 0.2));
  return g;
}

export function tree(seed = 0): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.8, 10), mat('#8a5a36'), 0, 0.9, 0));
  const greens = ['#58b848', '#6cc956', '#4aa63f'];
  const blobs: [number, number, number, number][] = [
    [0, 2.5, 0, 1.25],
    [0.7, 2.2, 0.2, 0.85],
    [-0.65, 2.3, -0.1, 0.9],
    [0.1, 3.2, -0.1, 0.8],
  ];
  blobs.forEach(([x, y, z, r], i) => g.add(mesh(new THREE.IcosahedronGeometry(r, 3), mat(greens[(i + seed) % 3], { rim: 0.45 }), x, y, z)));
  // Every third tree carries oranges.
  if (seed % 3 === 0)
    for (let i = 0; i < 6; i++) g.add(ball(0.11, '#ff9f1c', Math.cos(i * 1.9) * 1.05, 2.1 + (i % 3) * 0.45, Math.sin(i * 1.9) * 1.05 + 0.2));
  return g;
}

export function bush(color = '#4f9a3f', scale = 1): THREE.Group {
  const g = new THREE.Group();
  const m = mat(color, { rim: 0.45 });
  for (const [x, y, z, r] of [
    [0, 0.42, 0, 0.55],
    [0.38, 0.32, 0.1, 0.4],
    [-0.36, 0.34, -0.05, 0.42],
  ])
    g.add(mesh(new THREE.IcosahedronGeometry(r * scale, 2), m, x * scale, y * scale, z * scale));
  return g;
}

export function flowerPot(color: string): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.3, 12), mat('#c8643b'), 0, 0.15, 0));
  g.add(mesh(new THREE.IcosahedronGeometry(0.22, 2), mat('#4f9a3f'), 0, 0.38, 0));
  for (let i = 0; i < 4; i++) g.add(ball(0.07, color, Math.cos(i * 1.6) * 0.15, 0.45, Math.sin(i * 1.6) * 0.15, { emissive: 0.1 }));
  return g;
}

export function house(color: string): THREE.Group {
  const g = new THREE.Group();
  g.add(rbox(4, 2.7, 3.5, color, 0, 1.35, 0, 0.18));
  // A triangular prism along x with its ridge on top.
  const roofGeo = new THREE.CylinderGeometry(1.5, 1.5, 4.5, 3);
  roofGeo.rotateZ(Math.PI / 2);
  roofGeo.rotateX(-Math.PI / 2);
  const roof = mesh(roofGeo, mat('#e0674a'), 0, 3.38, 0);
  roof.scale.set(1, 0.9, 1.4);
  g.add(roof);
  g.add(rbox(0.5, 1, 0.5, '#c9573f', 1.1, 3.9, -0.4, 0.08));
  // Door with a rounded top.
  g.add(rbox(0.9, 1.3, 0.1, '#7a4a2a', 0, 0.75, 1.76, 0.05));
  // Half a disc standing upright, round side up.
  const archGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.1, 16, 1, false, 0, Math.PI);
  archGeo.rotateX(Math.PI / 2);
  archGeo.rotateZ(Math.PI / 2);
  g.add(mesh(archGeo, mat('#7a4a2a'), 0, 1.4, 1.76));
  g.add(ball(0.05, '#ffd23f', 0.28, 0.8, 1.83, { metal: 0.6, rough: 0.3 }));
  for (const x of [-1.25, 1.25]) {
    g.add(rbox(0.85, 0.75, 0.08, '#ffffff', x, 1.65, 1.76, 0.04));
    g.add(rbox(0.7, 0.6, 0.1, '#9ad7ff', x, 1.65, 1.78, 0.03, { emissive: 0.15 }));
    g.add(rbox(0.95, 0.18, 0.28, '#8a5a36', x, 1.2, 1.86, 0.04));
    for (let i = 0; i < 3; i++) g.add(ball(0.09, ['#ff5d73', '#ffd23f', '#c77dff'][i], x - 0.28 + i * 0.28, 1.34, 1.88));
  }
  return g;
}

/** A soft, rounded hill for the edge of the village. */
export function hill(color: string, r: number, h: number): THREE.Mesh {
  const m = mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(color, { rim: 0.25 }));
  m.scale.y = h / r;
  m.castShadow = false;
  return m;
}

// --- Four species ---------------------------------------------------------------------------------

export function species(id: SpeciesId): THREE.Group {
  const g = new THREE.Group();
  switch (id) {
    case 'etrog': {
      const fruit = mesh(new THREE.SphereGeometry(0.22, 24, 18), mat('#ffd400', { rough: 0.35, rim: 0.5 }));
      fruit.scale.set(1, 1.3, 1);
      g.add(fruit);
      g.add(mesh(new THREE.CylinderGeometry(0.015, 0.03, 0.09, 6), mat('#7b8a2a'), 0, 0.31, 0));
      g.add(ball(0.03, '#8a6a3a', 0, -0.29, 0));
      const leaf = mesh(leafGeometry(0.22, 0.07), mat('#3f9a3a', { double: true }), 0.02, 0.26, 0);
      leaf.rotation.z = -0.9;
      g.add(leaf);
      break;
    }
    case 'lulav': {
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.045, 1.5, 8), mat('#8cbf4a'), 0, 0.1, 0));
      const blade = leafGeometry(0.9, 0.06);
      const m = mat('#9fd35c', { double: true });
      for (let i = 0; i < 8; i++) {
        const l = mesh(blade, m, 0, 0.1 + i * 0.07, 0);
        l.rotation.y = i * 0.8;
        l.rotation.z = (i % 2 ? 1 : -1) * 0.12;
        g.add(l);
      }
      break;
    }
    case 'hadas':
    case 'arava': {
      const hadas = id === 'hadas';
      g.add(mesh(new THREE.CylinderGeometry(0.02, 0.028, 1.2, 6), mat(hadas ? '#6b4f2a' : '#b5473a'), 0, 0, 0));
      const leaf = hadas ? leafGeometry(0.16, 0.07) : leafGeometry(0.36, 0.06);
      const m = mat(hadas ? '#2f7d32' : '#9ad16a', { double: true, rim: 0.4 });
      for (let i = 0; i < (hadas ? 18 : 10); i++) {
        const l = mesh(leaf, m, 0, -0.45 + i * (hadas ? 0.05 : 0.1), 0);
        // Hadas leaves grow in threes around the stem; arava leaves alternate.
        l.rotation.y = hadas ? (i % 3) * 2.09 + Math.floor(i / 3) * 0.5 : i * Math.PI;
        l.rotation.x = -0.6;
        g.add(l);
      }
      g.position.y = 0.1;
      break;
    }
  }
  return g;
}

/** A glowing ring with a soft beam of light, marking something to pick up or step into. */
export function marker(color: string, radius = 0.8, beam = false): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.72, radius, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  g.add(ring);
  if (beam) {
    const b = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.55, radius * 0.75, 3.2, 24, 1, true),
      new THREE.MeshBasicMaterial({
        color,
        map: beamTexture,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    b.position.y = 1.6;
    g.add(b);
  }
  return g;
}

// --- Characters -----------------------------------------------------------------------------------

export interface Character {
  group: THREE.Group;
  /** Everything above the ground; it bounces while walking and breathes while standing. */
  rig: THREE.Group;
  /** Limbs swing while walking. */
  limbs: { armL: THREE.Object3D; armR: THREE.Object3D; legL: THREE.Object3D; legR: THREE.Object3D };
  hat: THREE.Group;
}

function limb(color: string, len: number, radius: number, x: number, y: number, end?: THREE.Object3D): THREE.Group {
  // Pivot at the shoulder/hip so rotation.x swings it.
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  pivot.add(mesh(new THREE.CapsuleGeometry(radius, len, 6, 12), mat(color), 0, -len / 2, 0));
  if (end) {
    end.position.y -= len + radius * 0.6;
    pivot.add(end);
  }
  return pivot;
}

/** Cartoon eyes, rosy cheeks and a mouth on a head of radius r centred at y. */
function face(g: THREE.Group, y: number, r: number, cheeks = true, eyes: EyeStyle = 'round', mouth: MouthStyle = 'smile') {
  const ink = mat('#1d2340', { rough: 0.2, rim: 0 });
  const white = mat('#ffffff', { emissive: 1, rim: 0 });
  const shine = (x: number, yy: number, size: number) => {
    const m = mesh(new THREE.SphereGeometry(r * size, 8, 6), white, x, yy, r * 0.98);
    m.userData.noOutline = true;
    m.castShadow = false;
    g.add(m);
  };
  for (const s of [-1, 1]) {
    const ex = s * r * 0.36;
    if (eyes === 'happy') {
      // Closed, smiling eyes: ^ ^
      const arc = mesh(new THREE.TorusGeometry(r * 0.12, r * 0.035, 6, 14, Math.PI), ink, ex, y + r * 0.04, r * 0.92);
      arc.userData.noOutline = true;
      g.add(arc);
    } else {
      const big = eyes === 'sparkle';
      const eye = mesh(new THREE.SphereGeometry(r * (big ? 0.2 : 0.17), 16, 12), big ? mat('#2b3a8f', { rough: 0.15, rim: 0 }) : ink, ex, y + r * 0.08, r * 0.9);
      eye.scale.set(0.85, 1.2, 0.5);
      g.add(eye);
      shine(ex + r * 0.05, y + r * 0.17, big ? 0.07 : 0.055);
      if (big) shine(ex - r * 0.05, y - r * 0.02, 0.035);
    }
    if (cheeks) {
      const cheek = mesh(new THREE.SphereGeometry(r * 0.13, 12, 8), mat('#ff8fa3', { transparent: 0.55, rim: 0 }), s * r * 0.6, y - r * 0.2, r * 0.76);
      cheek.scale.z = 0.3;
      cheek.castShadow = false;
      g.add(cheek);
    }
  }
  const lips = mat('#8a2f3a', { rim: 0 });
  if (mouth === 'grin') {
    const open = mesh(new THREE.CircleGeometry(r * 0.17, 16, Math.PI, Math.PI), lips, 0, y - r * 0.15, r * 0.95);
    open.userData.noOutline = true;
    g.add(open);
    const tongue = mesh(new THREE.CircleGeometry(r * 0.08, 12, Math.PI, Math.PI), mat('#ff7b93', { rim: 0 }), 0, y - r * 0.24, r * 0.96);
    tongue.userData.noOutline = true;
    g.add(tongue);
  } else {
    const smile = mesh(new THREE.TorusGeometry(r * 0.16, r * 0.035, 6, 16, Math.PI), lips, 0, y - r * 0.2, r * 0.93);
    smile.rotation.z = Math.PI;
    smile.userData.noOutline = true;
    g.add(smile);
    if (mouth === 'tongue') {
      const tongue = mesh(new THREE.SphereGeometry(r * 0.08, 12, 8), mat('#ff7b93', { rim: 0 }), r * 0.05, y - r * 0.37, r * 0.86);
      tongue.scale.set(1, 0.8, 0.5);
      g.add(tongue);
    }
  }
}

const HEAD_Y = 1.5;
const HEAD_R = 0.44;

const patternCache = new Map<string, THREE.Material>();

/** Shirt fabric: plain colour, or with stripes or little stars printed on it. */
function shirtMaterial(color: string, pattern: Pattern): THREE.Material {
  if (pattern === 'plain') return mat(color);
  const key = `${color}|${pattern}`;
  let m = patternCache.get(key);
  if (!m) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = color;
    g.fillRect(0, 0, 128, 128);
    if (pattern === 'stripes') {
      g.fillStyle = 'rgba(255,255,255,0.85)';
      for (let y = 8; y < 128; y += 32) g.fillRect(0, y, 128, 12);
    } else {
      g.fillStyle = '#ffe066';
      g.font = 'bold 30px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (let i = 0; i < 6; i++) g.fillText('★', 22 + (i % 3) * 42, 32 + Math.floor(i / 3) * 64 + (i % 2) * 10);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 1);
    m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62 });
    patternCache.set(key, m);
  }
  return m;
}

/** Hair on a head centred at HEAD_Y; returns how much higher a hat should sit. */
function hairModel(g: THREE.Group, style: HairStyle, color: string): number {
  const m = mat(color, { rough: 0.5 });
  const cap = (scale: number, theta: number) => {
    const c = mesh(new THREE.SphereGeometry(HEAD_R * scale, 32, 16, 0, Math.PI * 2, 0, Math.PI * theta), m, 0, HEAD_Y + 0.02, -0.04);
    c.rotation.x = -0.35;
    g.add(c);
  };
  switch (style) {
    case 'buzz':
      cap(1.025, 0.4);
      return 0;
    case 'short':
      cap(1.06, 0.42);
      return 0;
    case 'long': {
      cap(1.06, 0.45);
      const back = mesh(new THREE.CapsuleGeometry(0.34, 0.3, 6, 16), m, 0, HEAD_Y - 0.22, -0.2);
      back.scale.z = 0.7;
      g.add(back);
      for (const s of [-1, 1]) g.add(mesh(new THREE.CapsuleGeometry(0.09, 0.32, 4, 8), m, s * 0.4, HEAD_Y - 0.18, 0.08));
      return 0;
    }
    case 'ponytail': {
      cap(1.06, 0.44);
      g.add(ball(0.07, '#ff4d5e', 0, HEAD_Y + 0.12, -0.46));
      const tail = mesh(new THREE.CapsuleGeometry(0.11, 0.3, 4, 10), m, 0, HEAD_Y - 0.08, -0.58);
      tail.rotation.x = 0.5;
      g.add(tail);
      return 0;
    }
    case 'curly': {
      for (let i = 0; i < 22; i++) {
        // Curls spread over the top and back of the head, leaving the face free.
        const a = i * 2.4;
        const up = 0.15 + (i % 5) * 0.2;
        const dir = new THREE.Vector3(Math.cos(a) * Math.cos(up), Math.sin(up), Math.sin(a) * Math.cos(up));
        if (dir.z > 0.45 && dir.y < 0.75) dir.z = -dir.z * 0.5;
        const p = dir.normalize().multiplyScalar(HEAD_R * 0.98);
        g.add(mesh(new THREE.IcosahedronGeometry(0.13, 1), m, p.x, HEAD_Y + p.y + 0.02, p.z - 0.02));
      }
      return 0.07;
    }
    case 'spiky': {
      cap(1.06, 0.42);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const spike = mesh(new THREE.ConeGeometry(0.1, 0.26, 8), m, Math.sin(a) * 0.2, HEAD_Y + 0.4, Math.cos(a) * 0.2 - 0.05);
        spike.rotation.set(Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.6);
        g.add(spike);
      }
      g.add(mesh(new THREE.ConeGeometry(0.11, 0.3, 8), m, 0, HEAD_Y + 0.5, -0.03));
      return 0.1;
    }
  }
}

function accessoryModel(id: AccessoryId, head: THREE.Group, rig: THREE.Group, handL: THREE.Object3D) {
  switch (id) {
    case 'none':
      return;
    case 'glasses': {
      const frame = mat('#1d2340', { rim: 0 });
      for (const s of [-1, 1]) {
        head.add(mesh(new THREE.TorusGeometry(0.12, 0.022, 8, 20), frame, s * HEAD_R * 0.36, HEAD_Y + 0.04, HEAD_R * 0.97));
        const lens = mesh(new THREE.CircleGeometry(0.11, 20), mat('#bfe6ff', { transparent: 0.35, rim: 0 }), s * HEAD_R * 0.36, HEAD_Y + 0.04, HEAD_R * 0.975);
        lens.castShadow = false;
        head.add(lens);
      }
      head.add(rbox(0.1, 0.03, 0.03, '#1d2340', 0, HEAD_Y + 0.06, HEAD_R * 0.97, 0.01));
      return;
    }
    case 'etrogBag': {
      const strap = mesh(new THREE.TorusGeometry(0.33, 0.028, 6, 24), mat('#8a5a36'), 0, 0.84, 0);
      strap.rotation.set(0, Math.PI / 2, 0.75);
      strap.scale.set(1, 1, 0.9);
      rig.add(strap);
      const bag = mesh(new THREE.SphereGeometry(0.17, 20, 14), mat('#ffd400', { rough: 0.35 }), 0.3, 0.6, 0.12);
      bag.scale.set(0.9, 1.15, 0.7);
      rig.add(bag);
      rig.add(mesh(leafGeometry(0.14, 0.05), mat('#3f9a3a', { double: true }), 0.32, 0.77, 0.12));
      return;
    }
    case 'lantern': {
      const l = new THREE.Group();
      const frame = mat('#7a4a2a', { metal: 0.3 });
      l.add(mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12), frame, 0, 0.02, 0));
      l.add(mesh(new THREE.ConeGeometry(0.1, 0.08, 10), frame, 0, -0.06, 0));
      const glow = mesh(new THREE.SphereGeometry(0.08, 14, 10), mat('#ffb347', { emissive: 6, rim: 0 }), 0, -0.17, 0);
      glow.scale.y = 1.3;
      glow.userData.noOutline = true;
      l.add(glow);
      l.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 10), frame, 0, -0.28, 0));
      l.position.set(0, -0.06, 0.02);
      handL.add(l);
      return;
    }
    case 'sukkahBackpack': {
      const pack = new THREE.Group();
      const tex = fabricTexture(['#fffaf0', '#ff9f1c']);
      tex.repeat.set(1.2, 1);
      pack.add(mesh(new RoundedBoxGeometry(0.46, 0.42, 0.26, 2, 0.05), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), 0, 0, 0));
      pack.add(rbox(0.54, 0.05, 0.34, '#c9a15c', 0, 0.23, 0, 0.02));
      const greens = [mat('#5cae3f', { double: true }), mat('#3f8a2e', { double: true })];
      const leaf = leafGeometry(0.34, 0.07);
      leaf.rotateX(-Math.PI / 2);
      for (let i = 0; i < 6; i++) {
        const l = mesh(leaf, greens[i % 2], -0.2 + i * 0.08, 0.27, -0.12);
        l.rotation.y = 0.3 - (i % 3) * 0.3;
        pack.add(l);
      }
      pack.position.set(0, 0.92, -0.36);
      rig.add(pack);
      for (const s of [-1, 1]) {
        const strap = rbox(0.06, 0.4, 0.05, '#c9a15c', s * 0.17, 0.95, 0.27, 0.02);
        strap.rotation.x = 0.15;
        rig.add(strap);
      }
      return;
    }
  }
}

export function character(input: Avatar): Character {
  const a = fullAvatar(input);
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const shoe = () => rbox(0.2, 0.13, 0.28, a.shoes, 0, 0, 0.04, 0.06);
  const legL = limb(a.pants, 0.22, 0.11, -0.13, 0.52, shoe());
  const legR = limb(a.pants, 0.22, 0.11, 0.13, 0.52, shoe());
  rig.add(legL, legR);
  const shirt = shirtMaterial(a.shirt, a.pattern);
  rig.add(mesh(new THREE.CapsuleGeometry(0.3, 0.26, 8, 16), shirt, 0, 0.84, 0));
  const handL = ball(0.1, a.skin);
  const armL = limb(a.shirt, 0.24, 0.085, -0.37, 1.04, handL);
  const armR = limb(a.shirt, 0.24, 0.085, 0.37, 1.04, ball(0.1, a.skin));
  armL.rotation.z = -0.15;
  armR.rotation.z = 0.15;
  rig.add(armL, armR);
  const head = new THREE.Group();
  head.add(mesh(new THREE.SphereGeometry(HEAD_R, 32, 24), mat(a.skin, { rim: 0.25 }), 0, HEAD_Y, 0));
  face(head, HEAD_Y, HEAD_R, true, a.eyes, a.mouth);
  const lift = hairModel(head, a.hairStyle, a.hair);
  rig.add(head);
  accessoryModel(a.accessory, head, rig, handL);
  const hat = new THREE.Group();
  hat.position.y = lift;
  head.add(hat);
  setHat(hat, a.hat);
  outline(rig);
  return { group, rig, limbs: { armL, armR, legL, legR }, hat };
}

export function setHat(hat: THREE.Group, id: HatId) {
  hat.clear();
  const top = HEAD_Y + HEAD_R;
  if (id === 'kippah') {
    // Sits on top of the hair, tipped slightly back.
    const k = mesh(new THREE.SphereGeometry(0.24, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#2b59c3'), 0, top + 0.01, -0.1);
    k.scale.y = 0.4;
    k.rotation.x = -0.35;
    hat.add(k);
    hat.add(mesh(new THREE.TorusGeometry(0.19, 0.02, 6, 20), mat('#ffd23f'), 0, top + 0.03, -0.1).rotateX(Math.PI / 2 - 0.35));
  } else if (id === 'cap') {
    hat.add(mesh(new THREE.SphereGeometry(HEAD_R * 1.08, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat('#ff4d5e'), 0, HEAD_Y + 0.08, 0));
    const brim = rbox(0.5, 0.05, 0.36, '#ff4d5e', 0, HEAD_Y + 0.1, 0.46, 0.02);
    brim.rotation.x = -0.1;
    hat.add(brim);
    hat.add(ball(0.05, '#ffffff', 0, HEAD_Y + 0.56, 0));
  } else if (id === 'crown') {
    const gold = mat('#ffc933', { metal: 0.5, rough: 0.3, emissive: 0.15 });
    hat.add(mesh(new THREE.CylinderGeometry(0.3, 0.28, 0.16, 20, 1, true), gold, 0, top + 0.06, 0));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      hat.add(mesh(new THREE.ConeGeometry(0.07, 0.2, 8), gold, Math.sin(a) * 0.28, top + 0.23, Math.cos(a) * 0.28));
      hat.add(ball(0.035, ['#ff4d5e', '#4dd4ff', '#7cf07c'][i % 3], Math.sin(a) * 0.3, top + 0.06, Math.cos(a) * 0.3, { emissive: 0.6 }));
    }
  } else if (id === 'sukkahHat') {
    // A tiny sukkah: striped walls with a roof of palm leaves.
    const tex = fabricTexture(['#fffaf0', '#3a86ff']);
    tex.repeat.set(2, 1);
    hat.add(mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.2, 4, 1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), 0, top + 0.08, 0).rotateY(Math.PI / 4));
    hat.add(rbox(0.62, 0.04, 0.62, '#c9a15c', 0, top + 0.2, 0, 0.015));
    const leaf = leafGeometry(0.5, 0.1);
    leaf.rotateX(-Math.PI / 2);
    const greens = [mat('#5cae3f', { double: true }), mat('#3f8a2e', { double: true })];
    for (let i = 0; i < 7; i++) {
      const l = mesh(leaf, greens[i % 2], Math.sin(i * 2.2) * 0.12, top + 0.23 + (i % 2) * 0.01, Math.cos(i * 2.2) * 0.12 - 0.15);
      l.rotation.y = i * 0.9;
      hat.add(l);
    }
  } else if (id === 'hadasWreath') {
    const leaf = leafGeometry(0.16, 0.06);
    const green = mat('#2f7d32', { double: true, rim: 0.4 });
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const l = mesh(leaf, green, Math.sin(a) * 0.36, top - 0.06, Math.cos(a) * 0.36 - 0.04);
      l.rotation.set(-0.9, a, 0);
      hat.add(l);
    }
    for (const [x, z] of [
      [-0.2, 0.28],
      [0.22, 0.26],
      [0, 0.34],
    ])
      hat.add(ball(0.04, '#3b3f8f', x, top - 0.04, z));
  }
  outline(hat);
}

/** Abraham: a flowing robe, a big white beard, a striped head cloth and a shepherd's staff. */
export function abraham(): Character {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const robeShape = [
    [0.52, 0],
    [0.48, 0.3],
    [0.38, 0.8],
    [0.3, 1.1],
    [0.18, 1.2],
    [0, 1.22],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  rig.add(mesh(new THREE.LatheGeometry(robeShape, 24), mat('#f6f1e4')));
  rig.add(mesh(new THREE.TorusGeometry(0.44, 0.04, 8, 24), mat('#3a6bd1'), 0, 0.5, 0).rotateX(Math.PI / 2));
  rig.add(mesh(new THREE.TorusGeometry(0.34, 0.05, 8, 24), mat('#c8843f'), 0, 0.85, 0).rotateX(Math.PI / 2));
  const skin = '#eab58a';
  const armL = limb('#f6f1e4', 0.28, 0.1, -0.36, 1.05, ball(0.1, skin));
  const armR = limb('#f6f1e4', 0.28, 0.1, 0.36, 1.05, ball(0.1, skin));
  const staff = new THREE.Group();
  staff.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 2, 8), mat('#8a5a36'), 0, -0.2, 0.08));
  const crook = mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 16, Math.PI), mat('#8a5a36'), 0.12, 0.8, 0.08);
  staff.add(crook);
  staff.position.y = -0.4;
  armR.add(staff);
  armR.rotation.x = -0.3;
  rig.add(armL, armR);
  const head = new THREE.Group();
  head.add(mesh(new THREE.SphereGeometry(HEAD_R, 32, 24), mat(skin, { rim: 0.25 }), 0, HEAD_Y, 0));
  face(head, HEAD_Y + 0.04, HEAD_R, false);
  // Fluffy beard and eyebrows.
  const white = mat('#ffffff', { rough: 0.9, rim: 0.3 });
  for (const [x, y, z, r] of [
    [0, 1.2, 0.3, 0.22],
    [-0.18, 1.28, 0.3, 0.17],
    [0.18, 1.28, 0.3, 0.17],
    [0, 1.06, 0.25, 0.16],
    [-0.28, 1.4, 0.24, 0.12],
    [0.28, 1.4, 0.24, 0.12],
  ])
    head.add(mesh(new THREE.IcosahedronGeometry(r, 2), white, x, y, z));
  for (const s of [-1, 1]) head.add(rbox(0.14, 0.04, 0.05, '#ffffff', s * 0.16, HEAD_Y + 0.19, 0.41, 0.02));
  const clothTex = fabricTexture(['#ffffff', '#ffffff', '#3a6bd1']);
  clothTex.rotation = Math.PI / 2;
  const cloth = mesh(
    new THREE.SphereGeometry(HEAD_R * 1.1, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({ map: clothTex, roughness: 0.9 }),
    0,
    HEAD_Y + 0.02,
    -0.06,
  );
  cloth.rotation.x = -0.3;
  head.add(cloth);
  head.add(rbox(0.8, 0.7, 0.1, '#f6f1e4', 0, HEAD_Y - 0.35, -0.38, 0.05));
  head.add(rbox(0.9, 0.06, 0.06, '#3a6bd1', 0, HEAD_Y + 0.18, 0.08, 0.02).rotateX(-0.3));
  rig.add(head);
  outline(rig);
  return { group, rig, limbs: { armL, armR, legL: new THREE.Group(), legR: new THREE.Group() }, hat: new THREE.Group() };
}

/** Shoshi the sheep, the computer rival in the etrog hunt. */
export function sheep(): Character {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);
  const wool = mat('#fffdf6', { rough: 1, rim: 0.4 });
  const dark = mat('#4a3b45');
  for (const [x, y, z, r] of [
    [0, 0.72, -0.05, 0.46],
    [0, 0.78, -0.4, 0.38],
    [0.28, 0.8, -0.15, 0.32],
    [-0.28, 0.8, -0.15, 0.32],
    [0, 1.02, -0.15, 0.34],
    [0, 0.8, 0.22, 0.34],
  ])
    rig.add(mesh(new THREE.IcosahedronGeometry(r, 2), wool, x, y, z));
  const legs = [-0.2, 0.2].flatMap((x) =>
    [0.15, -0.4].map((z) => {
      const l = new THREE.Group();
      l.position.set(x, 0.48, z);
      l.add(mesh(new THREE.CapsuleGeometry(0.07, 0.3, 4, 8), dark, 0, -0.26, 0));
      rig.add(l);
      return l;
    }),
  );
  const head = new THREE.Group();
  head.position.set(0, 1.05, 0.5);
  const face3 = mesh(new THREE.SphereGeometry(0.26, 24, 18), dark);
  face3.scale.set(0.9, 1, 0.95);
  head.add(face3);
  head.add(mesh(new THREE.IcosahedronGeometry(0.2, 2), wool, 0, 0.2, -0.05));
  for (const s of [-1, 1]) {
    const ear = mesh(new THREE.SphereGeometry(0.1, 12, 8), dark, s * 0.27, 0.06, -0.04);
    ear.scale.set(1.7, 0.55, 0.8);
    ear.rotation.z = s * -0.4;
    head.add(ear);
    head.add(ball(0.075, '#ffffff', s * 0.1, 0.05, 0.19, { rim: 0 }));
    head.add(ball(0.045, '#1d2340', s * 0.1, 0.05, 0.25, { rim: 0 }));
    const shine = ball(0.015, '#ffffff', s * 0.1 + 0.015, 0.07, 0.29, { emissive: 1, rim: 0 });
    shine.userData.noOutline = true;
    head.add(shine);
  }
  head.add(ball(0.05, '#ff8fa3', 0, -0.1, 0.23, { rim: 0 }));
  rig.add(head);
  outline(rig);
  return { group, rig, limbs: { armL: legs[0], armR: legs[1], legL: legs[2], legR: legs[3] }, hat: new THREE.Group() };
}

/** Swings the limbs and bounces the body; `phase` advances with distance walked, `amount` is 0 when standing. */
export function animateWalk(c: Character, phase: number, amount: number, time: number) {
  const s = Math.sin(phase) * 0.8 * amount;
  c.limbs.armL.rotation.x = s;
  c.limbs.armR.rotation.x = -s;
  c.limbs.legL.rotation.x = -s;
  c.limbs.legR.rotation.x = s;
  const bounce = Math.abs(Math.sin(phase)) * 0.09 * amount;
  const breathe = (1 - amount) * Math.sin(time * 2.4) * 0.018;
  c.rig.position.y = bounce;
  c.rig.scale.set(1 - breathe * 0.5, 1 + breathe, 1 - breathe * 0.5);
  c.rig.rotation.z = Math.sin(phase) * 0.05 * amount;
}

// --- Decorations ----------------------------------------------------------------------------------

function hanging(item: THREE.Object3D, drop: number): THREE.Group {
  // Hanging items are built with y=0 at the schach and hang downwards.
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, drop, 4), mat('#6b5a45', { rim: 0 }), 0, -drop / 2, 0));
  item.position.y = -drop;
  g.add(item);
  return g;
}

function starShape(outer: number, inner: number): THREE.Shape {
  // A Star of David outline would need two shapes; a soft six-pointed star reads well at this size.
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
      const colors = ['#ff4d5e', '#ffb627', '#2ec4b6', '#3a86ff', '#ffd23f', '#c77dff'];
      for (let i = 0; i < 11; i++) {
        const x = -0.9 + i * 0.18;
        const ring = mesh(new THREE.TorusGeometry(0.09, 0.022, 8, 16), mat(colors[i % colors.length], { rough: 0.5 }), x, -0.15 - 0.28 * (1 - (x / 0.9) ** 2), 0);
        ring.rotation.y = i % 2 ? Math.PI / 2 : 0;
        g.add(ring);
      }
      return g;
    }
    case 'star': {
      const geo = new THREE.ExtrudeGeometry(starShape(0.3, 0.17), { depth: 0.06, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
      geo.center();
      return hanging(mesh(geo, mat('#ffd23f', { emissive: 1.2, metal: 0.3, rough: 0.3 })), 0.45);
    }
    case 'pomegranates': {
      const g = new THREE.Group();
      for (const [x, drop] of [
        [-0.18, 0.4],
        [0, 0.6],
        [0.18, 0.35],
      ]) {
        const fruit = new THREE.Group();
        fruit.add(ball(0.13, '#d62839', 0, 0, 0, { rough: 0.3, rim: 0.5 }));
        for (let i = 0; i < 5; i++) fruit.add(mesh(new THREE.ConeGeometry(0.025, 0.07, 4), mat('#9e1b2c'), Math.cos(i * 1.26) * 0.035, 0.14, Math.sin(i * 1.26) * 0.035));
        const h = hanging(fruit, drop);
        h.position.x = x;
        g.add(h);
      }
      return g;
    }
    case 'lantern': {
      const l = new THREE.Group();
      const frame = mat('#7a4a2a', { metal: 0.3 });
      l.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 12), frame, 0, 0.19, 0));
      l.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 12), frame, 0, -0.19, 0));
      const glow = mesh(new THREE.SphereGeometry(0.14, 16, 12), mat('#ffb347', { emissive: 6, rim: 0 }));
      glow.scale.set(1, 1.25, 1);
      l.add(glow);
      l.add(mesh(new THREE.ConeGeometry(0.2, 0.14, 12), frame, 0, 0.28, 0));
      l.add(mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12), frame, 0, 0.37, 0));
      return hanging(l, 0.55);
    }
    case 'chair': {
      const g = new THREE.Group();
      const wood = '#c47a3a';
      g.add(rbox(0.5, 0.08, 0.5, wood, 0, 0.45, 0, 0.03));
      g.add(rbox(0.5, 0.5, 0.07, wood, 0, 0.75, -0.22, 0.03));
      g.add(rbox(0.44, 0.06, 0.44, '#ff4d5e', 0, 0.51, 0.02, 0.03));
      for (const [x, z] of [
        [-0.2, -0.2],
        [0.2, -0.2],
        [-0.2, 0.2],
        [0.2, 0.2],
      ])
        g.add(rbox(0.06, 0.45, 0.06, '#9a5a28', x, 0.22, z, 0.02));
      return g;
    }
    case 'rug': {
      const tex = fabricTexture(['#d62839', '#ffd23f', '#3a86ff', '#ffffff']);
      tex.repeat.set(2, 1);
      const g = new THREE.Group();
      const rug = mesh(new RoundedBoxGeometry(1.7, 0.03, 1.15, 2, 0.012), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }), 0, 0.02, 0);
      rug.castShadow = false;
      g.add(rug);
      return g;
    }
    case 'table': {
      const g = new THREE.Group();
      g.add(rbox(1.35, 0.06, 0.85, '#ffffff', 0, 0.74, 0, 0.03));
      g.add(rbox(1.39, 0.2, 0.89, '#f4f9ff', 0, 0.66, 0, 0.03));
      g.add(rbox(1.4, 0.04, 0.9, '#3a86ff', 0, 0.56, 0, 0.015));
      for (const [x, z] of [
        [-0.56, -0.33],
        [0.56, -0.33],
        [-0.56, 0.33],
        [0.56, 0.33],
      ])
        g.add(rbox(0.07, 0.56, 0.07, '#9a5a28', x, 0.28, z, 0.02));
      g.add(mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.08, 16), mat('#e8b04a', { metal: 0.4, rough: 0.35 }), 0.3, 0.81, 0));
      g.add(ball(0.07, '#ffd400', 0.26, 0.88, 0.03));
      g.add(ball(0.06, '#d62839', 0.34, 0.87, -0.03));
      g.add(mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.2, 12), mat('#9ad7ff', { transparent: 0.7 }), -0.3, 0.87, 0.05));
      return g;
    }
  }
}

// --- Game Hub arch --------------------------------------------------------------------------------

export function portal(): { group: THREE.Group; disc: THREE.Mesh } {
  const group = new THREE.Group();
  for (const x of [-1.8, 1.8]) {
    group.add(mesh(new THREE.CylinderGeometry(0.32, 0.38, 3.2, 16), mat('#8f6cf0'), x, 1.6, 0));
    group.add(ball(0.4, '#ffd23f', x, 3.3, 0, { metal: 0.3, rough: 0.35, emissive: 0.2 }));
  }
  group.add(mesh(new THREE.TorusGeometry(1.8, 0.3, 12, 32, Math.PI), mat('#a98bff'), 0, 3.2, 0));
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.5, 48),
    new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      uniforms: { time: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float time; varying vec2 vUv;
        void main() {
          vec2 p = vUv - 0.5;
          float r = length(p) * 2.0;
          float a = atan(p.y, p.x);
          float swirl = sin(a * 3.0 + r * 8.0 - time * 3.0) * 0.5 + 0.5;
          vec3 c = mix(vec3(1.0, 0.82, 0.25), vec3(0.66, 0.45, 1.0), swirl);
          gl_FragColor = vec4(c * 2.2, (1.0 - smoothstep(0.8, 1.0, r)) * 0.8);
        }`,
    }),
  );
  disc.position.y = 2.1;
  group.add(disc);
  const etrog = species('etrog');
  etrog.scale.setScalar(1.6);
  etrog.position.y = 4.1;
  group.add(etrog);
  return { group, disc };
}

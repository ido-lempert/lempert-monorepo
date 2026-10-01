/**
 * Every model is built from code (no asset files, so the game works offline): cute bugs with big eyes,
 * the foods, the slingshot, the little round world and the kitchen around it, and the giant mop.
 * Bugs and foods face +z and are built about one unit across; the world scales them.
 */
import * as THREE from 'three';
import type { BugKind, Obstacle } from '../game/bugs';
import type { FoodId } from '../game/foods';
import { DISC_RADIUS, COUNTER_Y } from '../game/physics';
import { canvasTexture, grassTexture, mat, melonTexture, outline, spotsTexture, tileTexture, windowTexture, wingTexture, woodTexture } from './look';

// --- Helpers ----------------------------------------------------------------------------------------

const geo = {
  sphere: new THREE.SphereGeometry(1, 32, 24),
  lowSphere: new THREE.SphereGeometry(1, 10, 8),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 24),
  box: new THREE.BoxGeometry(1, 1, 1),
};

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.scale.set(sx, sy, sz);
  o.castShadow = true;
  return o;
}

const ball = (m: THREE.Material, r: number, x = 0, y = 0, z = 0) => mesh(geo.sphere, m, x, y, z, r);

/** A thin rod from a to b. */
function rod(m: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.Mesh {
  const o = mesh(geo.cyl, m);
  const d = b.clone().sub(a);
  o.scale.set(r, d.length(), r);
  o.position.copy(a).addScaledVector(d, 0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return o;
}

// --- Bugs -------------------------------------------------------------------------------------------

export interface BugModel {
  root: THREE.Group;
  /** Tilts and tumbles (the root only moves and turns). */
  body: THREE.Group;
  legs: THREE.Object3D[];
  wings: THREE.Object3D[];
  pupils: THREE.Mesh[];
  /** Dizzy stars, shown when dazed. */
  stars: THREE.Group;
}

const white = () => mat('#ffffff', { rough: 0.2, rim: 0.15, clearcoat: 1 });
const black = () => mat('#1d1430', { rough: 0.3, rim: 0.3, clearcoat: 0.6 });

/** Two big googly eyes on a head, looking forwards. */
function eyes(head: THREE.Object3D, spread: number, size: number, y: number, z: number, white2 = white()): THREE.Mesh[] {
  const pupils: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const eye = ball(white2, size, s * spread, y, z);
    eye.scale.set(size, size * 1.15, size * 0.8);
    head.add(eye);
    const pupil = ball(black(), 0.5);
    pupil.position.set(-s * 0.08, 0.05, 0.62);
    pupil.scale.set(0.5, 0.58, 0.45);
    pupil.userData.noOutline = true;
    eye.add(pupil);
    const shine = ball(white(), 0.17, -s * 0.15 + 0.12, 0.25, 0.85);
    shine.userData.noOutline = true;
    eye.add(shine);
    pupils.push(pupil);
  }
  return pupils;
}

function smile(head: THREE.Object3D, y: number, z: number, w: number, color = '#5a1d2a') {
  const m = new THREE.Mesh(new THREE.TorusGeometry(w, w * 0.22, 6, 14, Math.PI), mat(color, { rim: 0 }));
  m.position.set(0, y, z);
  m.rotation.z = Math.PI;
  m.userData.noOutline = true;
  head.add(m);
  // Rosy cheeks.
  for (const s of [-1, 1]) {
    const c = ball(mat('#ff8fb1', { rim: 0, rough: 0.8 }), w * 0.45, s * w * 1.9, y + w * 0.4, z - 0.04);
    c.scale.z = w * 0.15;
    c.userData.noOutline = true;
    head.add(c);
  }
}

function antennae(head: THREE.Object3D, m: THREE.Material, y: number, z: number, len: number, spread = 0.18) {
  for (const s of [-1, 1]) {
    const a = new THREE.Vector3(s * spread, y, z);
    const b = new THREE.Vector3(s * (spread + len * 0.45), y + len, z + len * 0.35);
    head.add(rod(m, a, b, 0.035));
    head.add(ball(m, 0.08, b.x, b.y, b.z));
  }
}

function legs(body: THREE.Object3D, m: THREE.Material, y: number, zs: number[], span: number, len = 0.45): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  zs.forEach((z, i) => {
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * span, y, z);
      pivot.add(rod(m, new THREE.Vector3(0, 0, 0), new THREE.Vector3(s * len * 0.7, -len * 0.8, 0), 0.05));
      pivot.userData.phase = i * 2.1 + (s > 0 ? Math.PI : 0);
      body.add(pivot);
      out.push(pivot);
    }
  });
  return out;
}

function starShape(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.45 : 1;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false });
  g.center();
  return g;
}
const starGeo = starShape();

function dizzyStars(y: number): THREE.Group {
  const g = new THREE.Group();
  g.position.y = y;
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(starGeo, mat('#ffd23f', { emissive: 1.4, rim: 0.3 }));
    const a = (i / 3) * Math.PI * 2;
    s.position.set(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6);
    s.scale.setScalar(0.18);
    g.add(s);
  }
  g.visible = false;
  return g;
}

function ladybugLike(back: THREE.Texture | string, headColor: string, metal = 0, emissive = 0): BugModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const shell = typeof back === 'string' ? mat(back, { metal, rough: 0.25, emissive, clearcoat: 1 }) : mat('#ffffff', { map: back, rough: 0.25, clearcoat: 1 });
  const dome = ball(shell, 1, 0, 0.5, -0.1);
  dome.scale.set(0.85, 0.62, 0.95);
  body.add(dome);
  const seam = mesh(geo.box, black(), 0, 0.85, -0.15, 0.04, 0.5, 1.5);
  seam.rotation.x = 0.1;
  seam.userData.noOutline = true;
  body.add(seam);
  const head = new THREE.Group();
  head.position.set(0, 0.5, 0.75);
  body.add(head);
  head.add(ball(mat(headColor, { metal, rough: 0.3, emissive, clearcoat: 0.8 }), 0.42));
  const pupils = eyes(head, 0.2, 0.2, 0.12, 0.3);
  smile(head, -0.12, 0.38, 0.09);
  antennae(head, black(), 0.3, 0.1, 0.4);
  const ls = legs(body, black(), 0.3, [0.35, 0, -0.35], 0.6);
  outline(root);
  return { root, body, legs: ls, wings: [], pupils, stars: dizzyStars(1.4) };
}

const ladybugBack = spotsTexture('#ff3b3b', '#2a1530');

function ant(): BugModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = mat('#e0582f', { rough: 0.35, clearcoat: 0.7 });
  body.add(ball(skin, 0.45, 0, 0.55, -0.6));
  body.add(ball(skin, 0.24, 0, 0.5, 0.0));
  const head = new THREE.Group();
  head.position.set(0, 0.72, 0.5);
  body.add(head);
  head.add(ball(skin, 0.46));
  const pupils = eyes(head, 0.2, 0.2, 0.08, 0.33);
  smile(head, -0.16, 0.42, 0.08);
  antennae(head, mat('#5a2a1a'), 0.32, 0.05, 0.5, 0.14);
  const ls = legs(body, mat('#5a2a1a'), 0.42, [0.2, 0, -0.2], 0.2, 0.6);
  outline(root);
  return { root, body, legs: ls, wings: [], pupils, stars: dizzyStars(1.5) };
}

const shellTexture = canvasTexture(128, (g, s) => {
  g.fillStyle = '#ffb347';
  g.fillRect(0, 0, s, s);
  g.strokeStyle = '#c0632a';
  g.lineWidth = 7;
  g.beginPath();
  for (let a = 0; a < Math.PI * 6; a += 0.1) {
    const r = 4 + a * 3.2;
    const x = s / 2 + Math.cos(a) * r;
    const y = s / 2 + Math.sin(a) * r;
    if (a === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
});

function snail(): BugModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = mat('#b8e86b', { rough: 0.2, clearcoat: 1 });
  const foot = ball(skin, 1, 0, 0.22, 0.1);
  foot.scale.set(0.42, 0.25, 1.05);
  body.add(foot);
  const shell = ball(mat('#ffffff', { map: shellTexture, rough: 0.25, clearcoat: 1 }), 0.62, 0, 0.78, -0.25);
  shell.scale.set(0.5, 0.62, 0.62);
  shell.rotation.y = Math.PI / 2;
  body.add(shell);
  const head = new THREE.Group();
  head.position.set(0, 0.45, 0.85);
  body.add(head);
  head.add(ball(skin, 0.3));
  // Eyes on stalks.
  const pupils: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    head.add(rod(skin, new THREE.Vector3(s * 0.1, 0.1, 0), new THREE.Vector3(s * 0.22, 0.6, 0.08), 0.05));
    const holder = new THREE.Group();
    holder.position.set(s * 0.22, 0.66, 0.1);
    head.add(holder);
    pupils.push(...eyes(holder, 0, 0.17, 0, 0));
  }
  smile(head, -0.05, 0.27, 0.08);
  outline(root);
  return { root, body, legs: [], wings: [], pupils, stars: dizzyStars(1.6) };
}

function winged(kind: 'butterfly' | 'fly'): BugModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const isFly = kind === 'fly';
  const skin = mat(isFly ? '#4a4f6a' : '#5b3a8c', { rough: 0.5, sheen: 1 });
  const torso = ball(skin, 1, 0, 0, -0.2);
  torso.scale.set(isFly ? 0.42 : 0.18, isFly ? 0.4 : 0.18, isFly ? 0.55 : 0.6);
  body.add(torso);
  const head = new THREE.Group();
  head.position.set(0, 0.08, isFly ? 0.4 : 0.42);
  body.add(head);
  head.add(ball(skin, isFly ? 0.3 : 0.26));
  const pupils = eyes(head, isFly ? 0.22 : 0.15, isFly ? 0.24 : 0.15, 0.08, 0.2, isFly ? mat('#ff6f6f', { rough: 0.2, clearcoat: 1 }) : white());
  smile(head, -0.1, isFly ? 0.28 : 0.25, 0.07);
  antennae(head, black(), 0.2, 0.05, 0.4, 0.1);
  const wings: THREE.Object3D[] = [];
  const wm = isFly
    ? mat('#e8f6ff', { transparent: 0.45, double: true, rough: 0.1, iridescence: 1, rim: 0 })
    : mat('#ffffff', { map: wingTexture('#ff9f1c', '#ffe066'), double: true, rim: 0.2, sheen: 0.6 });
  if (!isFly) (wm as THREE.MeshStandardMaterial).alphaTest = 0.5;
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.12, 0.1, -0.1);
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wm);
    w.rotation.x = -Math.PI / 2;
    w.position.set(s * 0.55, 0, isFly ? -0.2 : 0);
    w.scale.set(isFly ? 0.7 : 1.15, isFly ? 0.45 : 1.25, 1);
    if (!isFly) w.scale.x *= s;
    w.userData.noOutline = true;
    pivot.add(w);
    pivot.userData.side = s;
    body.add(pivot);
    wings.push(pivot);
  }
  const ls = isFly ? legs(body, black(), -0.25, [0.1, -0.15], 0.2, 0.35) : [];
  outline(root);
  return { root, body, legs: ls, wings, pupils, stars: dizzyStars(1) };
}

function beetle(): BugModel {
  const m = ladybugLike('#2fbf71', '#1f6f4a', 0.4);
  // A friendly little horn.
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 10), mat('#1f6f4a', { metal: 0.4, clearcoat: 1 }));
  horn.position.set(0, 0.85, 0.9);
  horn.rotation.x = 0.5;
  m.body.add(horn);
  return m;
}

export function bugModel(kind: BugKind): BugModel {
  let m: BugModel;
  switch (kind) {
    case 'ladybug':
      m = ladybugLike(ladybugBack, '#2a1530');
      break;
    case 'golden':
      m = ladybugLike('#ffc93c', '#e09a00', 0.85, 0.35);
      break;
    case 'beetle':
      m = beetle();
      break;
    case 'ant':
      m = ant();
      break;
    case 'snail':
      m = snail();
      break;
    default:
      m = winged(kind);
  }
  m.root.add(m.stars);
  m.root.traverse((o) => (o.castShadow = true));
  return m;
}

// --- Foods ------------------------------------------------------------------------------------------

export function foodModel(id: FoodId, piece: 'whole' | 'slice' | 'ring' = 'whole'): THREE.Group {
  const g = new THREE.Group();
  if (piece === 'slice') {
    g.add(pizzaSlice());
  } else if (piece === 'ring') {
    g.add(donut(0.9));
  } else
    switch (id) {
      case 'cookie': {
        const c = mesh(geo.cyl, mat('#d99a4e', { rough: 0.85, sheen: 0.6 }), 0, 0, 0, 1, 0.38, 1);
        g.add(c);
        for (let i = 0; i < 9; i++) {
          const a = i * 2.4;
          const r = 0.25 + (i % 3) * 0.22;
          g.add(ball(mat('#5a2d14', { rough: 0.6 }), 0.13, Math.cos(a) * r, i % 2 ? 0.18 : -0.18, Math.sin(a) * r));
        }
        break;
      }
      case 'popcorn': {
        const m = mat('#fff6d8', { rough: 0.85, flat: true });
        const butter = mat('#ffd36b', { rough: 0.7, flat: true });
        const p = [[0, 0, 0, 0.6], [0.45, 0.2, 0.1, 0.45], [-0.4, 0.25, -0.1, 0.48], [0.1, 0.5, 0.2, 0.42], [0, -0.3, 0.35, 0.4], [-0.2, -0.2, -0.4, 0.38]];
        p.forEach(([x, y, z, r], i) => g.add(mesh(new THREE.IcosahedronGeometry(1, 0), i % 3 ? m : butter, x, y, z, r)));
        break;
      }
      case 'cheese': {
        g.add(mesh(new THREE.IcosahedronGeometry(1, 1), mat('#ff9a1f', { rough: 0.8, flat: true })));
        for (let i = 0; i < 7; i++) {
          const v = new THREE.Vector3(Math.sin(i * 2.1), Math.cos(i * 1.3), Math.sin(i * 0.7 + 1)).normalize().multiplyScalar(0.92);
          g.add(ball(mat('#ffcf5c', { rough: 0.9 }), 0.16, v.x, v.y, v.z));
        }
        break;
      }
      case 'jelly': {
        const body = mesh(new THREE.CylinderGeometry(0.7, 0.95, 1.1, 32), mat('#ff5a7e', { rough: 0.08, transmission: 0.85, thickness: 1.4, tint: '#ff1f4f', clearcoat: 1 }));
        g.add(body);
        g.add(ball(mat('#ff6b8f', { rough: 0.08, transmission: 0.85, thickness: 1, tint: '#ff1f4f', clearcoat: 1 }), 0.7, 0, 0.55, 0)).children.at(-1)!.scale.set(0.7, 0.3, 0.7);
        g.add(ball(mat('#fffaf0', { rough: 0.7, sheen: 1 }), 0.32, 0, 0.75, 0));
        g.add(ball(mat('#d6002a', { rough: 0.15, clearcoat: 1 }), 0.18, 0, 1.08, 0));
        g.children.forEach((c) => (c.position.y -= 0.3));
        break;
      }
      case 'watermelon': {
        const w = ball(mat('#ffffff', { map: melonTexture, rough: 0.35, clearcoat: 0.8 }), 1);
        w.scale.set(1, 0.85, 1.15);
        g.add(w);
        break;
      }
      case 'donut':
        g.add(donut(1));
        break;
      case 'pie': {
        g.add(mesh(new THREE.CylinderGeometry(1, 0.85, 0.45, 24), mat('#c9cfd8', { metal: 0.85, rough: 0.25 }), 0, -0.1, 0));
        g.add(mesh(geo.cyl, mat('#e9b36a', { rough: 0.8 }), 0, 0.1, 0, 0.95, 0.15, 0.95));
        const cream = mat('#fffaf2', { rough: 0.7, sheen: 1 });
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          g.add(ball(cream, 0.3, Math.cos(a) * 0.6, 0.28, Math.sin(a) * 0.6));
        }
        g.add(ball(cream, 0.45, 0, 0.35, 0));
        g.add(ball(mat('#e0002a', { rough: 0.15, clearcoat: 1 }), 0.15, 0, 0.75, 0));
        break;
      }
      case 'pizza': {
        for (let i = 0; i < 4; i++) {
          const s = pizzaSlice();
          s.rotation.y = (i * Math.PI) / 2;
          g.add(s);
        }
        break;
      }
    }
  outline(g, 0.03);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

function donut(scale: number): THREE.Group {
  const g = new THREE.Group();
  const dough = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.34, 12, 24), mat('#e3a35c', { rough: 0.75, sheen: 0.6 }));
  dough.rotation.x = Math.PI / 2;
  g.add(dough);
  const icing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.3, 10, 24), mat('#ff7eb6', { rough: 0.25, rim: 0.3, clearcoat: 1 }));
  icing.rotation.x = Math.PI / 2;
  icing.position.y = 0.1;
  icing.scale.z = 0.8;
  g.add(icing);
  const colors = ['#ffffff', '#4dd0ff', '#ffe14d', '#7dff8a'];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = 0.62 + ((i % 3) - 1) * 0.16;
    const sp = mesh(geo.box, mat(colors[i % 4], { rim: 0 }), Math.cos(a) * r, 0.36, Math.sin(a) * r, 0.05, 0.05, 0.16);
    sp.rotation.y = i;
    sp.userData.noOutline = true;
    g.add(sp);
  }
  g.scale.setScalar(scale);
  return g;
}

function pizzaSlice(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(1, 1, 0.16, 12, 1, false, 0, Math.PI / 2), mat('#f2c26b', { rough: 0.8 })));
  g.add(mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.18, 12, 1, false, 0.04, Math.PI / 2 - 0.08), mat('#ffd84d', { rough: 0.4, clearcoat: 0.5 }), 0, 0.03, 0));
  for (const [a, r] of [[0.4, 0.5], [1.1, 0.6], [0.8, 0.28]]) {
    const p = mesh(geo.cyl, mat('#d63a2f', { rough: 0.3, clearcoat: 0.8 }), Math.sin(a) * r, 0.12, Math.cos(a) * r, 0.13, 0.04, 0.13);
    p.userData.noOutline = true;
    g.add(p);
  }
  return g;
}

// --- Slingshot --------------------------------------------------------------------------------------

export interface SlingshotModel {
  root: THREE.Group;
  /** Tops of the two prongs, in the slingshot's space. */
  prongs: THREE.Vector3[];
  pouch: THREE.Mesh;
  bands: THREE.Mesh[];
}

export function slingshot(): SlingshotModel {
  const root = new THREE.Group();
  const wood = mat('#b5652b', { rough: 0.45, clearcoat: 0.5 });
  const tape = mat('#ff5b5b', { rough: 0.6, sheen: 1 });
  root.add(rod(wood, new THREE.Vector3(0, -2.4, 0), new THREE.Vector3(0, -0.5, 0), 0.2));
  root.add(mesh(geo.cyl, tape, 0, -1.3, 0, 0.23, 0.5, 0.23));
  const prongs: THREE.Vector3[] = [];
  for (const s of [-1, 1]) {
    const top = new THREE.Vector3(s * 0.8, 0.35, 0);
    root.add(rod(wood, new THREE.Vector3(0, -0.6, 0), top, 0.16));
    root.add(ball(wood, 0.17, top.x, top.y, top.z));
    prongs.push(top);
  }
  root.add(ball(wood, 0.22, 0, -0.55, 0));
  const pouch = ball(mat('#6b3b22', { rough: 0.7, sheen: 0.8 }), 0.3);
  pouch.scale.set(0.42, 0.22, 0.32);
  root.add(pouch);
  const bandMat = mat('#ff9a3c', { rough: 0.5, rim: 0.2 });
  const bands = [0, 1].map(() => {
    const b = mesh(geo.cyl, bandMat);
    root.add(b);
    return b;
  });
  root.traverse((c) => (c.castShadow = true));
  return { root, prongs, pouch, bands };
}

/** Stretches a band between two points (in the slingshot's space). */
export function stretchBand(band: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, thick: number) {
  const d = b.clone().sub(a);
  const len = Math.max(0.001, d.length());
  band.position.copy(a).addScaledVector(d, 0.5);
  band.scale.set(thick, len, thick);
  band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
}

// --- The little world and the kitchen ---------------------------------------------------------------

export function disc(): THREE.Group {
  const g = new THREE.Group();
  const depth = -COUNTER_Y;
  const grass = mat('#ffffff', { map: grassTexture, rough: 0.95, rim: 0 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(DISC_RADIUS, DISC_RADIUS, 0.3, 96), [mat('#4fa83a', { rough: 0.9, rim: 0 }), grass, grass]);
  top.position.y = -0.15;
  top.receiveShadow = true;
  g.add(top);
  // A soft rounded lip of turf around the edge, like a cake.
  const lip = new THREE.Mesh(new THREE.TorusGeometry(DISC_RADIUS - 0.05, 0.13, 12, 128), mat('#2f6f26', { rough: 0.95, rim: 0 }));
  lip.rotation.x = Math.PI / 2;
  lip.position.y = -0.06;
  lip.receiveShadow = true;
  g.add(lip);
  // Layers of soil, like a slice of the ground.
  const layers = [
    { h: 0.3, c: '#8a5530', r: 0 },
    { h: 0.12, c: '#6e4024', r: 0.08 },
    { h: depth - 0.72, c: '#9c6a42', r: 0.12 },
  ];
  let y = -0.3;
  for (const l of layers) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(DISC_RADIUS - 0.02 - l.r, DISC_RADIUS - 0.04 - l.r - l.h * 0.15, l.h, 96), mat(l.c, { rough: 0.95, rim: 0.1 }));
    m.position.y = y - l.h / 2;
    m.receiveShadow = true;
    g.add(m);
    y -= l.h;
  }
  // Pebbles poking out of the soil.
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + (i % 3) * 0.05;
    const p = ball(mat(i % 2 ? '#d8cfc2' : '#b9ada0', { rough: 0.8, clearcoat: 0.3 }), 0.1 + (i % 3) * 0.04, Math.cos(a) * (DISC_RADIUS - 0.08), -0.45 - (i % 4) * 0.08, Math.sin(a) * (DISC_RADIUS - 0.08));
    p.scale.y *= 0.7;
    g.add(p);
  }
  // Flowers, clover and little stones around the rim.
  const petals = ['#ff6fa8', '#ffd23f', '#ffffff', '#b98cff', '#ff9a3c'];
  const petalGeo = new THREE.SphereGeometry(1, 12, 8);
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + (i % 3) * 0.04;
    const r = DISC_RADIUS - 0.45 - (i % 2) * 0.25;
    const f = new THREE.Group();
    f.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    if (i % 4 === 0) {
      const p = ball(mat('#d3cbc0', { rough: 0.7, clearcoat: 0.3 }), 0.2, 0, 0.04, 0);
      p.scale.y = 0.09;
      f.add(p);
    } else {
      const h = 0.35 + (i % 3) * 0.12;
      f.add(rod(mat('#3f9a3a', { rough: 0.6 }), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.03, h, 0), 0.025));
      const pm = mat(petals[i % petals.length], { rough: 0.5, sheen: 0.8 });
      for (let k = 0; k < 5; k++) {
        const pa = (k / 5) * Math.PI * 2;
        const pt = new THREE.Mesh(petalGeo, pm);
        pt.position.set(0.03 + Math.cos(pa) * 0.09, h, Math.sin(pa) * 0.09);
        pt.scale.set(0.08, 0.03, 0.06);
        pt.rotation.y = -pa;
        f.add(pt);
      }
      f.add(ball(mat('#ffb000', { rough: 0.4, clearcoat: 0.5 }), 0.05, 0.03, h + 0.02, 0));
      f.rotation.y = i;
    }
    g.add(f);
  }
  g.traverse((c) => {
    if (c instanceof THREE.Mesh && c !== top) c.castShadow = true;
  });
  return g;
}

export function obstacleModel(o: Obstacle): THREE.Group {
  const g = new THREE.Group();
  g.position.set(o.x, 0, o.z);
  if (o.kind === 'mushroom') {
    g.add(mesh(new THREE.CylinderGeometry(o.radius * 0.28, o.radius * 0.36, o.height, 14), mat('#fff3df', { rough: 0.7 }), 0, o.height / 2, 0));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(o.radius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat('#ff4f5e', { rough: 0.3, clearcoat: 0.8 }));
    cap.position.y = o.height * 0.82;
    cap.scale.y = 0.65;
    cap.castShadow = true;
    g.add(cap);
    for (let i = 0; i < 6; i++) {
      const a = i * 1.1;
      const dot = ball(mat('#ffffff', { rough: 0.6 }), 0.17, Math.cos(a) * o.radius * 0.6, cap.position.y + o.radius * 0.45, Math.sin(a) * o.radius * 0.6);
      dot.scale.y = 0.08;
      dot.userData.noOutline = true;
      g.add(dot);
    }
    const under = new THREE.Mesh(new THREE.CircleGeometry(o.radius * 0.98, 24), mat('#ffd9c2', { rim: 0, double: true }));
    under.rotation.x = Math.PI / 2;
    under.position.y = cap.position.y + 0.01;
    g.add(under);
  } else {
    const cupM = mat('#4fb7ff', { rough: 0.15, clearcoat: 1 });
    g.add(mesh(new THREE.CylinderGeometry(o.radius, o.radius * 0.85, o.height, 24, 1, true), cupM, 0, o.height / 2, 0));
    const inside = new THREE.Mesh(new THREE.CircleGeometry(o.radius * 0.95, 24), mat('#7a3f1d', { rim: 0 }));
    inside.rotation.x = -Math.PI / 2;
    inside.position.y = o.height * 0.82;
    g.add(inside);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(o.radius, 0.07, 8, 32), mat('#ffffff'));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = o.height;
    g.add(rim);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.12, 8, 16, Math.PI * 1.2), cupM);
    handle.position.set(o.radius + 0.1, o.height * 0.55, 0);
    handle.rotation.z = -Math.PI * 0.6;
    g.add(handle);
    // A white heart on the side.
    const heart = ball(mat('#ffffff', { rim: 0 }), 0.3, 0, o.height * 0.55, o.radius * 0.95);
    heart.scale.z = 0.05;
    heart.userData.noOutline = true;
    g.add(heart);
  }
  g.traverse((c) => (c.castShadow = true));
  return g;
}

/** Where the sink is (the mop pushes everything into it). */
export const SINK = { x: 14.5, z: 1, radius: 3 };

export function kitchen(): THREE.Group {
  const g = new THREE.Group();
  // A varnished wooden counter that catches a little of the light.
  const counter = new THREE.Mesh(new THREE.PlaneGeometry(90, 70), mat('#ffffff', { map: woodTexture, rough: 0.45, rim: 0, clearcoat: 0.4 }));
  counter.rotation.x = -Math.PI / 2;
  counter.position.set(0, COUNTER_Y, -5);
  counter.receiveShadow = true;
  g.add(counter);
  const wallTex = tileTexture.clone();
  wallTex.needsUpdate = true;
  wallTex.repeat.set(18, 6);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(90, 18), mat('#ffffff', { map: wallTex, rough: 0.25, rim: 0, clearcoat: 0.6 }));
  wall.position.set(0, COUNTER_Y + 9, -26);
  g.add(wall);
  // A sunny window in the wall (it glows a little).
  const win = new THREE.Group();
  win.position.set(-2, COUNTER_Y + 10.5, -25.9);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), new THREE.MeshBasicMaterial({ map: windowTexture, toneMapped: false, color: new THREE.Color(1.25, 1.25, 1.25) }));
  win.add(glass);
  const frame = mat('#ffffff', { rough: 0.3, clearcoat: 0.8 });
  for (const [x, y, w, h] of [[0, 4.1, 14.8, 0.6], [0, -4.1, 15.6, 0.7], [-7.2, 0, 0.6, 8.6], [7.2, 0, 0.6, 8.6], [0, 0, 0.35, 8], [0, 0, 14, 0.35]]) {
    win.add(mesh(geo.box, frame, x, y, 0.2, w, h, 0.4));
  }
  g.add(win);

  // The sink: a steel rim, a deep basin, water and a tap.
  const steel = mat('#d5dde8', { metal: 0.95, rough: 0.18 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(SINK.radius, 0.3, 12, 48), steel);
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(1, 1.3, 1);
  rim.position.set(SINK.x, COUNTER_Y + 0.05, SINK.z);
  g.add(rim);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(SINK.radius, 40, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat('#8994a3', { metal: 0.9, rough: 0.25, double: true }));
  bowl.scale.set(1, 0.45, 1.3);
  bowl.position.set(SINK.x, COUNTER_Y, SINK.z);
  g.add(bowl);
  const water = new THREE.Mesh(new THREE.CircleGeometry(SINK.radius * 0.85, 40), mat('#7fd3ff', { transparent: 0.75, rough: 0.05, clearcoat: 1, rim: 0 }));
  water.rotation.x = -Math.PI / 2;
  water.scale.set(1, 1.3, 1);
  water.position.set(SINK.x, COUNTER_Y - 0.5, SINK.z);
  water.name = 'sinkWater';
  g.add(water);
  const tap = new THREE.Group();
  tap.position.set(SINK.x + 1, COUNTER_Y, SINK.z - SINK.radius * 1.3 - 0.6);
  tap.add(rod(steel, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 3, 0), 0.25));
  tap.add(rod(steel, new THREE.Vector3(0, 3, 0), new THREE.Vector3(0, 3.4, 1.6), 0.2));
  tap.add(ball(steel, 0.32, 0, 3, 0));
  g.add(tap);

  // Giant kitchen things in the back, so the bugs feel tiny: a glass jar of sweets, a teapot, a fruit bowl.
  const jar = new THREE.Group();
  jar.position.set(-13, COUNTER_Y, -16);
  const candy = ['#ff5b85', '#ffd23f', '#4dd0ff', '#7ed957', '#b98cff', '#ff9a3c'];
  for (let i = 0; i < 26; i++) {
    const a = i * 2.4;
    const r = (i % 3) * 0.8;
    jar.add(ball(mat(candy[i % candy.length], { rough: 0.2, clearcoat: 1 }), 0.75, Math.cos(a) * r, 0.8 + Math.floor(i / 5) * 1.05, Math.sin(a) * r));
  }
  jar.add(mesh(new THREE.CylinderGeometry(3, 3, 8, 40, 1, true), mat('#eaf8ff', { rough: 0.05, transmission: 1, thickness: 0.3, rim: 0, double: true }), 0, 4, 0));
  jar.add(mesh(geo.cyl, mat('#ff6f6f', { rough: 0.3, clearcoat: 1 }), 0, 8.4, 0, 3.2, 0.9, 3.2));
  g.add(jar);
  const teapot = new THREE.Group();
  teapot.position.set(12, COUNTER_Y, -19);
  teapot.scale.setScalar(0.65);
  const ceramic = mat('#ffd166', { rough: 0.15, clearcoat: 1 });
  const pot = ball(ceramic, 4, 0, 3.4, 0);
  pot.scale.y = 3.4;
  teapot.add(pot);
  teapot.add(ball(mat('#ff8fab', { rough: 0.15, clearcoat: 1 }), 1, 0, 7, 0));
  teapot.add(rod(ceramic, new THREE.Vector3(3, 3, 0), new THREE.Vector3(6, 6, 0), 0.6));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.45, 12, 24), ceramic);
  handle.position.set(-4, 3.8, 0);
  teapot.add(handle);
  g.add(teapot);
  const fruitBowl = new THREE.Group();
  fruitBowl.position.set(1, COUNTER_Y, -19);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(4.5, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat('#9b7bff', { double: true, rough: 0.15, clearcoat: 1 }));
  dish.position.y = 3;
  fruitBowl.add(dish);
  const fruit = ['#ff4d4d', '#ffcf3f', '#7ed957', '#ff9a3c', '#ff4d4d'];
  fruit.forEach((c, i) => fruitBowl.add(ball(mat(c, { rough: 0.3, clearcoat: 0.8 }), 1.5, (i - 2) * 1.6, 3.4 + (i % 2) * 1.2, (i % 3) - 1)));
  g.add(fruitBowl);
  for (const o of [jar, teapot, fruitBowl]) o.traverse((c) => (c.castShadow = true));
  return g;
}

// --- The mop ----------------------------------------------------------------------------------------

/** A giant kitchen mop, its head as wide as the whole world. Sweeps towards +x. */
export function mop(): THREE.Group {
  const g = new THREE.Group();
  const head = new THREE.Group();
  g.add(head);
  const width = DISC_RADIUS * 2 + 3;
  head.add(mesh(geo.box, mat('#3f7bff', { rough: 0.3, clearcoat: 1 }), 0, 1.6, 0, 1.2, 0.9, width));
  head.add(mesh(geo.box, mat('#ffd23f', { rough: 0.3, clearcoat: 1 }), 0, 2.15, 0, 1.25, 0.25, width + 0.1));
  const strands = [mat('#e8f4ff', { rough: 0.9, sheen: 1 }), mat('#bfe0ff', { rough: 0.9, sheen: 1 })];
  for (let i = 0; i < 36; i++) {
    const z = -width / 2 + (i + 0.5) * (width / 36);
    const s = mesh(geo.sphere, strands[i % 2], (i % 2) * 0.25 - 0.1, 0.65, z, 0.42, 0.95, 0.38);
    head.add(s);
  }
  const stick = rod(mat('#c98a4b', { rough: 0.4, clearcoat: 0.6 }), new THREE.Vector3(0, 2.2, 0), new THREE.Vector3(-7, 16, 4), 0.32);
  g.add(stick);
  g.add(ball(mat('#ff5b5b'), 0.5, -7, 16, 4));
  g.traverse((c) => (c.castShadow = true));
  return g;
}

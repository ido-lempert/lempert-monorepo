/**
 * Every model is built from code (no asset files, so the game works offline): the foods (with cute faces
 * and two levels of detail), the slingshot, the little round world in each theme, obstacles, the kitchen
 * around it, and the giant mop. The bugs live in bugs3d.ts. Foods are about one unit across.
 */
import * as THREE from 'three';
import type { Obstacle } from '../game/bugs';
import type { FoodId } from '../game/foods';
import { COUNTER_Y, edgeFactor, type WorldShape } from '../game/physics';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Theme } from '../game/levels';
import type { SkinId } from '../game/progress';
import { asset, type AssetId } from './assets';
import { groundTexture, THEMES, type ThemeLook } from './themes';
import { mergeStatic } from './optimize';
import { mat, melonTexture, outline, tileTexture, windowTexture, woodTexture } from './look';

// --- Helpers ----------------------------------------------------------------------------------------

const geo = {
  sphere: new THREE.SphereGeometry(1, 20, 14),
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

// --- Foods ------------------------------------------------------------------------------------------

type Detail = 'high' | 'low';
const seg = (d: Detail, hi: number, lo: number) => (d === 'high' ? hi : lo);

/** Pushes vertices in and out a little, for organic shapes (cookie edges, popcorn, cheese puffs). */
function lumpy(g: THREE.BufferGeometry, amount: number, seed = 1): THREE.BufferGeometry {
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 7.1 + seed) * Math.sin(v.y * 6.3 + seed * 2) * Math.sin(v.z * 5.7 + seed * 3);
    v.multiplyScalar(1 + n * amount);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** A tiny happy face on a food: shiny eyes, rosy cheeks, a smile. Faces +z at `z`. */
function foodFace(g: THREE.Object3D, d: Detail, z: number, size = 1, y = 0) {
  const sp = new THREE.SphereGeometry(1, seg(d, 20, 8), seg(d, 14, 6));
  const eye = mat('#2b1840', { rough: 0.1, clearcoat: 1, rim: 0 });
  const shine = mat('#ffffff', { emissive: 1.5, rim: 0 });
  const face = new THREE.Group();
  face.position.set(0, y, z);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(sp, eye);
    e.position.set(s * 0.22 * size, 0.06 * size, 0);
    e.scale.set(0.09 * size, 0.12 * size, 0.05 * size);
    face.add(e);
    if (d === 'high') {
      const h = new THREE.Mesh(sp, shine);
      h.position.set(s * 0.22 * size - 0.03 * size, 0.1 * size, 0.04 * size);
      h.scale.setScalar(0.03 * size);
      face.add(h);
    }
    const c = new THREE.Mesh(sp, mat('#ff8fb3', { transparent: 0.7, rim: 0 }));
    c.position.set(s * 0.36 * size, -0.07 * size, -0.01);
    c.scale.set(0.08 * size, 0.045 * size, 0.02 * size);
    face.add(c);
  }
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.07 * size, 0.018 * size, 6, seg(d, 12, 6), Math.PI), mat('#4a1f3a', { rim: 0 }));
  m.rotation.z = Math.PI;
  m.position.y = -0.08 * size;
  face.add(m);
  face.traverse((o) => (o.userData.noOutline = true));
  g.add(face);
}

function foodDetail(id: FoodId, piece: 'whole' | 'slice' | 'ring', d: Detail): THREE.Group {
  const g = new THREE.Group();
  const sphere = new THREE.SphereGeometry(1, seg(d, 40, 14), seg(d, 28, 10));
  const ball2 = (m: THREE.Material, r: number, x = 0, y = 0, z = 0) => mesh(sphere, m, x, y, z, r);
  if (piece === 'slice') {
    g.add(pizzaSlice(d));
    return g;
  }
  if (piece === 'ring') {
    g.add(donut(0.9, d));
    return g;
  }
  switch (id) {
    case 'cookie': {
      const body = new THREE.CylinderGeometry(1, 1, 0.38, seg(d, 48, 16), seg(d, 3, 1));
      g.add(mesh(d === 'high' ? lumpy(body, 0.05, 3) : body, mat('#dfa257', { rough: 0.85, sheen: 0.7 })));
      const chip = mat('#5a2d14', { rough: 0.35, clearcoat: 0.6 });
      for (let i = 0; i < (d === 'high' ? 14 : 7); i++) {
        const a = i * 2.4;
        const r = 0.2 + (i % 4) * 0.2;
        const c = ball2(chip, 0.12 + (i % 3) * 0.02, Math.cos(a) * r, i % 2 ? 0.17 : -0.17, Math.sin(a) * r);
        c.scale.y *= 0.7;
        g.add(c);
      }
      foodFace(g, d, 0.0, 1.4, 0.2);
      g.children.at(-1)!.rotation.x = -Math.PI / 2;
      g.children.at(-1)!.position.set(0, 0.2, 0.05);
      break;
    }
    case 'popcorn': {
      const kernel = new THREE.IcosahedronGeometry(1, seg(d, 3, 1));
      const m = mat('#fff7dc', { rough: 0.8, sheen: 0.6 });
      const butter = mat('#ffd36b', { rough: 0.5, clearcoat: 0.6 });
      const p = [[0, 0, 0, 0.62], [0.45, 0.2, 0.1, 0.45], [-0.4, 0.25, -0.1, 0.48], [0.1, 0.5, 0.2, 0.42], [0, -0.3, 0.35, 0.4], [-0.2, -0.2, -0.4, 0.38]];
      p.forEach(([x, y, z, r], i) => g.add(mesh(lumpy(kernel.clone(), 0.22, i + 1), i % 3 ? m : butter, x, y, z, r)));
      foodFace(g, d, 0.6, 1);
      break;
    }
    case 'cheese': {
      g.add(mesh(lumpy(new THREE.IcosahedronGeometry(1, seg(d, 4, 2)), 0.12, 5), mat('#ff9a1f', { rough: 0.85, sheen: 0.8 })));
      if (d === 'high')
        for (let i = 0; i < 14; i++) {
          const v = new THREE.Vector3(Math.sin(i * 2.1), Math.cos(i * 1.3), Math.sin(i * 0.7 + 1)).normalize().multiplyScalar(0.95);
          g.add(ball2(mat('#ffcf5c', { rough: 0.9 }), 0.09, v.x, v.y, v.z));
        }
      foodFace(g, d, 0.97, 1);
      break;
    }
    case 'jelly': {
      const jelly = mat('#ff5a7e', { rough: 0.06, transparent: 0.75, clearcoat: 1 });
      const body = new THREE.LatheGeometry(
        [new THREE.Vector2(0, -0.55), new THREE.Vector2(0.95, -0.55), new THREE.Vector2(0.98, -0.45), new THREE.Vector2(0.85, 0.1), new THREE.Vector2(0.9, 0.25), new THREE.Vector2(0.72, 0.5), new THREE.Vector2(0.4, 0.62), new THREE.Vector2(0, 0.64)],
        seg(d, 40, 14),
      );
      g.add(mesh(body, jelly, 0, -0.1, 0));
      g.add(ball2(mat('#fffaf0', { rough: 0.7, sheen: 1 }), 0.32, 0, 0.62, 0));
      g.add(ball2(mat('#d6002a', { rough: 0.1, clearcoat: 1 }), 0.18, 0, 0.98, 0));
      if (d === 'high') g.add(rod(mat('#3f9a3a'), new THREE.Vector3(0, 1.1, 0), new THREE.Vector3(0.12, 1.35, 0), 0.03));
      foodFace(g, d, 0.9, 1.2, -0.1);
      break;
    }
    case 'watermelon': {
      const w = ball2(mat('#ffffff', { map: melonTexture, rough: 0.3, clearcoat: 0.9 }), 1);
      w.scale.set(1, 0.88, 1.12);
      g.add(w);
      if (d === 'high') g.add(rod(mat('#7a5a2a'), new THREE.Vector3(0, 0.85, 0), new THREE.Vector3(0.05, 1.05, 0.05), 0.05));
      foodFace(g, d, 1.0, 1.4);
      break;
    }
    case 'donut':
      g.add(donut(1, d));
      foodFace(g, d, 0, 1.2, 0.42);
      g.children.at(-1)!.rotation.x = -Math.PI / 2;
      g.children.at(-1)!.position.set(0, 0.42, 0.62);
      break;
    case 'pie': {
      g.add(mesh(new THREE.CylinderGeometry(1, 0.85, 0.45, seg(d, 40, 16)), mat('#c9cfd8', { metal: 0.85, rough: 0.25 }), 0, -0.1, 0));
      const crust = new THREE.TorusGeometry(0.92, 0.12, seg(d, 10, 5), seg(d, 40, 16));
      const c = mesh(d === 'high' ? lumpy(crust, 0.08, 2) : crust, mat('#e9b36a', { rough: 0.8, sheen: 0.5 }), 0, 0.12, 0);
      c.rotation.x = Math.PI / 2;
      g.add(c);
      const cream = mat('#fffaf2', { rough: 0.6, sheen: 1 });
      const swirl = d === 'high' ? 12 : 6;
      for (let i = 0; i < swirl; i++) {
        const a = (i / swirl) * Math.PI * 2;
        const dollop = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.35, seg(d, 16, 8)), cream);
        dollop.position.set(Math.cos(a) * 0.62, 0.32, Math.sin(a) * 0.62);
        g.add(dollop);
      }
      g.add(ball2(cream, 0.5, 0, 0.3, 0)).children.at(-1)!.scale.set(0.5, 0.35, 0.5);
      g.add(ball2(mat('#e0002a', { rough: 0.1, clearcoat: 1 }), 0.15, 0, 0.62, 0));
      foodFace(g, d, 0.86, 1.1, -0.1);
      break;
    }
    case 'pizza':
      for (let i = 0; i < 4; i++) {
        const sl = pizzaSlice(d);
        sl.rotation.y = (i * Math.PI) / 2;
        g.add(sl);
      }
      break;
  }
  return g;
}

/** A food with two levels of detail: rich for close-ups, light in the normal view. */
/** Kenney's food models (CC0) for each food, where there is one. */
const KENNEY_FOOD: Partial<Record<FoodId, AssetId>> = {
  cookie: 'cookie-chocolate',
  cheese: 'cheese',
  jelly: 'pudding',
  pie: 'pie',
  pizza: 'pizza',
};

export function foodModel(id: FoodId, piece: 'whole' | 'slice' | 'ring' = 'whole'): THREE.Group {
  const g = new THREE.Group();
  // A ready-made model when there is a good one and it's loaded. The round foods (watermelon, donut,
  // popcorn) and the pizza slices stay procedural: their low-poly versions look faceted.
  const ready = piece === 'whole' ? KENNEY_FOOD[id] : undefined;
  const model = ready ? asset(ready, 1.05) : null;
  if (model) {
    g.add(model);
    return g;
  }
  const lod = new THREE.LOD();
  const high = foodDetail(id, piece, 'high');
  outline(high, 0.03);
  lod.addLevel(high, 0);
  lod.addLevel(foodDetail(id, piece, 'low'), 7);
  g.add(lod);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.noOutline) o.castShadow = true;
  });
  return g;
}

function donut(scale: number, d: Detail): THREE.Group {
  const g = new THREE.Group();
  const dough = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.34, seg(d, 20, 10), seg(d, 48, 20)), mat('#e3a35c', { rough: 0.75, sheen: 0.6 }));
  dough.rotation.x = Math.PI / 2;
  g.add(dough);
  const icingGeo = new THREE.TorusGeometry(0.62, 0.31, seg(d, 16, 8), seg(d, 48, 20));
  const icing = new THREE.Mesh(d === 'high' ? lumpy(icingGeo, 0.06, 4) : icingGeo, mat('#ff7eb6', { rough: 0.2, rim: 0.3, clearcoat: 1 }));
  icing.rotation.x = Math.PI / 2;
  icing.position.y = 0.1;
  icing.scale.z = 0.8;
  g.add(icing);
  const colors = ['#ffffff', '#4dd0ff', '#ffe14d', '#7dff8a', '#b98cff'];
  const n = d === 'high' ? 28 : 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (i % 3) * 0.1;
    const r = 0.62 + ((i % 3) - 1) * 0.16;
    const sp = mesh(geo.box, mat(colors[i % colors.length], { rim: 0, clearcoat: 0.6 }), Math.cos(a) * r, 0.36, Math.sin(a) * r, 0.05, 0.05, 0.16);
    sp.rotation.y = i;
    sp.userData.noOutline = true;
    g.add(sp);
  }
  g.scale.setScalar(scale);
  return g;
}

function pizzaSlice(d: Detail): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(1, 1, 0.16, seg(d, 16, 8), 1, false, 0, Math.PI / 2), mat('#f2c26b', { rough: 0.8, sheen: 0.4 })));
  const crust = new THREE.Mesh(new THREE.TorusGeometry(0.97, 0.09, seg(d, 8, 4), seg(d, 16, 6), Math.PI / 2), mat('#e3a35c', { rough: 0.8 }));
  crust.rotation.x = Math.PI / 2;
  crust.rotation.z = -Math.PI / 2;
  g.add(crust);
  g.add(mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.18, seg(d, 16, 8), 1, false, 0.04, Math.PI / 2 - 0.08), mat('#ffd84d', { rough: 0.35, clearcoat: 0.6 }), 0, 0.03, 0));
  for (const [a, r] of [[0.4, 0.5], [1.1, 0.6], [0.8, 0.28]]) {
    const p = mesh(geo.cyl, mat('#d63a2f', { rough: 0.3, clearcoat: 0.8 }), Math.sin(a) * r, 0.12, Math.cos(a) * r, 0.13, 0.04, 0.13);
    p.userData.noOutline = true;
    g.add(p);
  }
  if (d === 'high')
    for (const [a, r] of [[0.2, 0.75], [1.3, 0.4]]) {
      const leaf = mesh(geo.sphere, mat('#3f9a3a', { rough: 0.4 }), Math.sin(a) * r, 0.13, Math.cos(a) * r, 0.08, 0.02, 0.05);
      leaf.userData.noOutline = true;
      g.add(leaf);
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

/** Slingshot colours (frame, grip tape, band), unlocked with stars. */
export const SKIN_COLORS: Record<SkinId, { frame: string; tape: string; band: string; metal?: number }> = {
  classic: { frame: '#b5652b', tape: '#ff5b5b', band: '#ff9a3c' },
  mint: { frame: '#5fd3a8', tape: '#ffffff', band: '#2f9d77' },
  candy: { frame: '#ff8fc8', tape: '#ffffff', band: '#ff4d8d' },
  sunny: { frame: '#ffd23f', tape: '#ff9a1f', band: '#ff5b5b' },
  ocean: { frame: '#4dabff', tape: '#ffffff', band: '#2f6fe0' },
  rainbow: { frame: '#b98cff', tape: '#ffe14d', band: '#4dd0ff' },
  galaxy: { frame: '#3a2f7a', tape: '#ffd23f', band: '#b98cff', metal: 0.6 },
};

export function slingshot(skin: SkinId = 'classic'): SlingshotModel {
  const c = SKIN_COLORS[skin];
  const root = new THREE.Group();
  const wood = mat(c.frame, { rough: 0.35, clearcoat: 0.7, metal: c.metal });
  const tape = mat(c.tape, { rough: 0.6, sheen: 1 });
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
  const bandMat = mat(c.band, { rough: 0.5, rim: 0.2 });
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

/** The world's outline (x, z points), `inset` in from its edge. */
function outlinePoints(radius: number, shape: WorldShape, inset = 0, n = 160): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = radius * edgeFactor(a, shape) - inset;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  return pts;
}

/** A slab with the world's outline, from `top` down by `depth`; its top face uses `capMat`, the side `sideMat`. */
function slab(radius: number, shape: WorldShape, inset: number, top: number, depth: number, capMat: THREE.Material, sideMat: THREE.Material, bevel = 0): THREE.Mesh {
  // Shape coordinates are (x, -z) so that after turning it flat the outline lands on (x, z).
  const sh = new THREE.Shape(outlinePoints(radius, shape, inset).map((p) => new THREE.Vector2(p.x, -p.y)));
  const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 4 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, top - depth, 0);
  const m = new THREE.Mesh(geo, [capMat, sideMat]);
  m.receiveShadow = true;
  return m;
}

/** The world for a chapter: its ground (lawn, sand, a picnic cloth, icing…), a rounded rim, layers underneath, and what grows around the edge. */
export function disc(theme: Theme, radius: number, shape: WorldShape): THREE.Group {
  const look = THEMES[theme];
  const g = new THREE.Group();
  const depth = -COUNTER_Y;
  const groundTex = groundTexture(theme).clone();
  groundTex.needsUpdate = true;
  // Extruded caps are mapped in world units.
  groundTex.repeat.set(1 / 5, 1 / 5);
  const ground = mat('#ffffff', { map: groundTex, rough: look.gloss ? 0.35 : theme === 'snow' ? 0.5 : 0.95, rim: 0, clearcoat: look.gloss ? 0.8 : undefined, sheen: theme === 'snow' || theme === 'picnic' ? 0.7 : undefined });
  const [s1, s2, s3] = look.soil;
  g.add(slab(radius, shape, 0, 0, 0.3, ground, mat(look.lip, { rough: 0.85, rim: 0 })));
  // A soft rounded rim along the edge.
  const rimPts = outlinePoints(radius, shape, 0.05, 200).map((p) => new THREE.Vector3(p.x, -0.06, p.y));
  const lip = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 220, 0.13, 8, true), mat(look.lip, { rough: look.gloss ? 0.3 : 0.9, rim: 0, clearcoat: look.gloss ? 0.8 : undefined }));
  lip.receiveShadow = true;
  g.add(lip);
  // Layers underneath, like a slice of the ground (or of a cake).
  let y = -0.3;
  for (const l of [{ h: 0.3, c: s1, r: 0.02 }, { h: 0.12, c: s2, r: 0.08 }, { h: depth - 0.72, c: s3, r: 0.12 }]) {
    const m = mat(l.c, { rough: 0.9, rim: 0.1, sheen: theme === 'cake' ? 0.6 : undefined });
    g.add(slab(radius, shape, l.r, y, l.h, m, m));
    y -= l.h;
  }
  g.traverse((c) => {
    if (c instanceof THREE.Mesh) c.castShadow = true;
  });
  // What grows around the edge never moves: weld it into a few meshes (it only casts shadows on high quality).
  const rim = new THREE.Group();
  const outline = outlinePoints(radius, shape, 0, Math.round(radius * 5.5));
  const sp = new THREE.SphereGeometry(1, 10, 7);
  outline.forEach((p, i) => {
    const r = Math.hypot(p.x, p.y);
    const k = (r - 0.45 - (i % 2) * 0.25) / r;
    const item = rimDecor(look, i, sp);
    item.position.set(p.x * k, 0, p.y * k);
    item.rotation.y = i * 1.7;
    rim.add(item);
  });
  mergeStatic(rim, { cast: true, receive: false });
  rim.traverse((c) => (c.userData.rimShadow = true));
  g.add(rim);
  return g;
}

/** One little thing around the rim: a flower, a shell, a leaf, a sweet, a pine cone, a cactus, a snowball… */
function rimDecor(look: ThemeLook, i: number, sp: THREE.SphereGeometry): THREE.Group {
  const f = new THREE.Group();
  const c = look.colors[i % look.colors.length];
  const at = (m: THREE.Material, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) => {
    const o = new THREE.Mesh(sp, m);
    o.position.set(x, y, z);
    o.scale.set(sx, sy, sz);
    f.add(o);
    return o;
  };
  if (i % 4 === 0 && look.decor !== 'glow') {
    at(mat('#d3cbc0', { rough: 0.7, clearcoat: 0.3 }), 0, 0.04, 0, 0.2, 0.08, 0.2);
    return f;
  }
  switch (look.decor) {
    case 'flowers': {
      const h = 0.35 + (i % 3) * 0.12;
      f.add(rod(mat('#3f9a3a', { rough: 0.6 }), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.03, h, 0), 0.025));
      const pm = mat(c, { rough: 0.5, sheen: 0.8 });
      for (let k = 0; k < 5; k++) {
        const pa = (k / 5) * Math.PI * 2;
        const pt = at(pm, 0.03 + Math.cos(pa) * 0.09, h, Math.sin(pa) * 0.09, 0.08, 0.03, 0.06);
        pt.rotation.y = -pa;
      }
      at(mat('#ffb000', { rough: 0.4, clearcoat: 0.5 }), 0.03, h + 0.02, 0, 0.05);
      break;
    }
    case 'shells': {
      const sh = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 12), mat(c, { rough: 0.3, clearcoat: 1 }));
      sh.rotation.z = Math.PI / 2;
      sh.position.y = 0.1;
      f.add(sh);
      if (i % 3 === 1) at(mat('#ffffff', { rough: 0.1, clearcoat: 1 }), 0.25, 0.06, 0.1, 0.07);
      break;
    }
    case 'leaves': {
      const leaf = at(mat(c, { rough: 0.6, double: true }), 0, 0.03, 0, 0.28, 0.02, 0.16);
      leaf.rotation.y = i;
      at(mat(look.colors[(i + 1) % look.colors.length], { rough: 0.6 }), 0.12, 0.05, 0.1, 0.18, 0.02, 0.1);
      break;
    }
    case 'candy': {
      const sweet = asset(i % 2 ? 'lollypop' : 'cupcake', i % 2 ? 0.55 : 0.32, 'height');
      if (sweet) {
        f.add(sweet);
        break;
      }
      if (i % 2) {
        f.add(rod(mat('#ffffff', { rough: 0.3 }), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.45, 0), 0.025));
        const lolly = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 24), mat(c, { rough: 0.1, clearcoat: 1 }));
        lolly.rotation.x = Math.PI / 2;
        lolly.position.y = 0.55;
        f.add(lolly);
      } else at(mat(c, { rough: 0.15, clearcoat: 1 }), 0, 0.1, 0, 0.14, 0.12, 0.14);
      break;
    }
    case 'pinecones': {
      for (let k = 0; k < 4; k++) at(mat('#8a5530', { rough: 0.7 }), 0, 0.08 + k * 0.08, 0, 0.13 - k * 0.025, 0.06, 0.13 - k * 0.025);
      if (i % 3 === 1) {
        const tree = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 10), mat('#2f7a3a', { rough: 0.7 }));
        tree.position.set(0.3, 0.3, 0);
        f.add(tree);
      }
      break;
    }
    case 'cactus': {
      const green = mat('#4fae4a', { rough: 0.5, clearcoat: 0.3 });
      f.add(rod(green, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.45, 0), 0.08));
      if (i % 2) f.add(rod(green, new THREE.Vector3(0, 0.22, 0), new THREE.Vector3(0.14, 0.34, 0), 0.05));
      at(mat('#ff6fa8', { rough: 0.5 }), 0, 0.52, 0, 0.06);
      break;
    }
    case 'snow': {
      const white = mat('#ffffff', { rough: 0.6, sheen: 0.6 });
      at(white, 0, 0.1, 0, 0.13);
      if (i % 3 === 1) {
        at(white, 0, 0.3, 0, 0.09);
        at(mat('#ff8a3c', { rough: 0.5 }), 0, 0.3, 0.09, 0.02, 0.02, 0.06);
      }
      break;
    }
    case 'glow': {
      // Glowing mushrooms and fireflies.
      f.add(rod(mat('#e8e0ff', { rough: 0.6 }), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.18, 0), 0.04));
      at(mat(c, { emissive: 2.2, rim: 0 }), 0, 0.2, 0, 0.12, 0.07, 0.12);
      if (i % 2) at(mat('#fff3a0', { emissive: 4, rim: 0 }), 0.1, 0.6 + (i % 3) * 0.2, 0.05, 0.035);
      break;
    }
    case 'cherries': {
      const fruit = asset(i % 2 ? 'cherries' : 'strawberry', 0.32, 'height');
      if (fruit) {
        f.add(fruit);
        break;
      }
      const red = mat(c, { rough: 0.1, clearcoat: 1 });
      at(red, 0, 0.14, 0, 0.14);
      if (i % 2) at(mat('#ffffff', { rough: 0.7, sheen: 1 }), 0.25, 0.08, 0.05, 0.13, 0.1, 0.13);
      f.add(rod(mat('#3f7a2a'), new THREE.Vector3(0, 0.26, 0), new THREE.Vector3(0.08, 0.45, 0), 0.015));
      break;
    }
    case 'veggies': {
      const veg = asset((['tomato', 'carrot', 'radish'] as const)[i % 3], 0.3, 'width');
      if (veg) {
        f.add(veg);
        break;
      }
      if (i % 3 === 0) at(mat('#ff4d4d', { rough: 0.15, clearcoat: 1 }), 0, 0.13, 0, 0.14, 0.12, 0.14);
      else if (i % 3 === 1) {
        const slice = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 20), mat('#b8e88a', { rough: 0.4, clearcoat: 0.6 }));
        slice.position.y = 0.03;
        f.add(slice);
      } else {
        const leaf = at(mat('#3f9a3a', { rough: 0.5, double: true }), 0, 0.03, 0, 0.18, 0.02, 0.08);
        leaf.rotation.y = i;
      }
      break;
    }
    case 'reeds': {
      const green = mat('#4f8a3a', { rough: 0.6 });
      for (let k = 0; k < 3; k++) f.add(rod(green, new THREE.Vector3(k * 0.06, 0, 0), new THREE.Vector3(k * 0.1 - 0.05, 0.5 + k * 0.12, 0.02), 0.015));
      if (i % 3 === 1) {
        // A little water lily.
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          const pt = at(mat(c, { rough: 0.4, sheen: 0.8 }), 0.25 + Math.cos(a) * 0.08, 0.06, Math.sin(a) * 0.08, 0.07, 0.03, 0.04);
          pt.rotation.y = -a;
        }
        at(mat('#ffd23f', { emissive: 0.3 }), 0.25, 0.08, 0, 0.04);
      }
      break;
    }
    case 'crumbs': {
      if (i % 2) {
        // A tiny sandwich triangle.
        const bread = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 3), mat('#f3d39a', { rough: 0.8 }));
        bread.position.y = 0.05;
        f.add(bread);
        const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.03, 3), mat(c, { rough: 0.5 }));
        fill.position.y = 0.11;
        f.add(fill);
      } else at(mat('#e8b46e', { rough: 0.9 }), 0, 0.04, 0, 0.06);
      break;
    }
    case 'stones': {
      const stone = mat('#9a90a8', { rough: 0.8 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), stone);
      b.position.y = 0.15;
      f.add(b);
      if (i % 3 === 1) {
        f.add(rod(mat('#7a5a3a'), new THREE.Vector3(0, 0.3, 0), new THREE.Vector3(0, 0.85, 0), 0.02));
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.15), mat(c, { double: true, rim: 0 }));
        flag.position.set(0.13, 0.78, 0);
        f.add(flag);
      }
      break;
    }
  }
  return f;
}

export function obstacleModel(o: Obstacle): THREE.Group {
  const g = new THREE.Group();
  g.position.set(o.x, 0, o.z);
  if (o.kind === 'mushroom') {
    g.add(mesh(new THREE.CylinderGeometry(o.radius * 0.28, o.radius * 0.36, o.height, 24), mat('#fff3df', { rough: 0.6, sheen: 0.6 }), 0, o.height / 2, 0));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(o.radius, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), mat('#ff4f5e', { rough: 0.25, clearcoat: 1 }));
    cap.position.y = o.height * 0.82;
    cap.scale.y = 0.65;
    g.add(cap);
    for (let i = 0; i < 7; i++) {
      const a = i * 1.1;
      const dot = ball(mat('#ffffff', { rough: 0.5 }), 0.17, Math.cos(a) * o.radius * 0.6, cap.position.y + o.radius * 0.45, Math.sin(a) * o.radius * 0.6);
      dot.scale.y = 0.08;
      g.add(dot);
    }
    const under = new THREE.Mesh(new THREE.CircleGeometry(o.radius * 0.98, 32), mat('#ffd9c2', { rim: 0, double: true }));
    under.rotation.x = Math.PI / 2;
    under.position.y = cap.position.y + 0.01;
    g.add(under);
  } else if (o.kind === 'cup') {
    const cupM = mat('#4fb7ff', { rough: 0.12, clearcoat: 1 });
    const r = o.radius;
    const h = o.height;
    // Thick walls and a solid base.
    g.add(lathe([[0, 0], [r * 0.85, 0], [r * 0.88, 0.08], [r, h], [r - 0.13, h], [r * 0.85 - 0.12, 0.4], [0, 0.4]], cupM));
    const inside = new THREE.Mesh(new THREE.CircleGeometry(o.radius * 0.95, 32), mat('#7a3f1d', { rim: 0, clearcoat: 1, rough: 0.05 }));
    inside.rotation.x = -Math.PI / 2;
    inside.position.y = o.height * 0.82;
    g.add(inside);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(o.radius, 0.07, 10, 48), mat('#ffffff', { clearcoat: 1, rough: 0.1 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = o.height;
    g.add(rim);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.12, 10, 20, Math.PI * 1.2), cupM);
    handle.position.set(o.radius + 0.1, o.height * 0.55, 0);
    handle.rotation.z = -Math.PI * 0.6;
    g.add(handle);
    const heart = ball(mat('#ffffff', { rim: 0 }), 0.3, 0, o.height * 0.55, o.radius * 0.95);
    heart.scale.z = 0.05;
    g.add(heart);
  } else if (o.kind === 'cube') {
    // A sugar cube, rounded and sparkly.
    const cube = new THREE.Mesh(new RoundedBoxGeometry(o.radius * 1.5, o.height, o.radius * 1.5, 4, 0.12), mat('#fffdf8', { rough: 0.55, sheen: 1, clearcoat: 0.4 }));
    cube.position.y = o.height / 2;
    cube.rotation.y = o.x * 3;
    g.add(cube);
  } else {
    // A little picket fence.
    const wood = mat('#f6e3c3', { rough: 0.55, clearcoat: 0.4 });
    const len = o.length ?? 3;
    const fence = new THREE.Group();
    fence.rotation.y = -(o.angle ?? 0);
    const posts = Math.max(3, Math.round(len / 0.42));
    for (let i = 0; i < posts; i++) {
      const x = -len / 2 + (i + 0.5) * (len / posts);
      const pk = new THREE.Mesh(new RoundedBoxGeometry(0.28, o.height, 0.12, 2, 0.04), wood);
      pk.position.set(x, o.height / 2, 0);
      fence.add(pk);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.22, 4), wood);
      tip.position.set(x, o.height + 0.1, 0);
      tip.rotation.y = Math.PI / 4;
      fence.add(tip);
    }
    for (const h of [0.3, 0.85]) {
      const rail = new THREE.Mesh(new RoundedBoxGeometry(len, 0.12, 0.08, 2, 0.03), mat('#e8c99a', { rough: 0.6 }));
      rail.position.set(0, h * o.height, -0.08);
      fence.add(rail);
    }
    g.add(fence);
  }
  g.traverse((c) => (c.castShadow = true));
  return g;
}

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

  // A giant glass jar of sweets in the back (the other kitchen things come from `kitchenProps`).
  const jar = new THREE.Group();
  jar.position.set(-13, COUNTER_Y, -16);
  const candy = ['#ff5b85', '#ffd23f', '#4dd0ff', '#7ed957', '#b98cff', '#ff9a3c'];
  for (let i = 0; i < 26; i++) {
    const a = i * 2.4;
    const r = (i % 3) * 0.8;
    jar.add(ball(mat(candy[i % candy.length], { rough: 0.2, clearcoat: 1 }), 0.75, Math.cos(a) * r, 1.75 + Math.floor(i / 5) * 1.05, Math.sin(a) * r));
  }
  // Glass with a thick base, so it reads as a solid jar.
  jar.add(lathe([[0, 0], [2.8, 0], [3, 0.25], [3, 8], [2.82, 8], [2.82, 1.1], [2.6, 0.95], [0, 0.95]], mat('#eaf8ff', { rough: 0.05, transparent: 0.3, rim: 0 })));
  jar.add(mesh(geo.cyl, mat('#ff6f6f', { rough: 0.3, clearcoat: 1 }), 0, 8.4, 0, 3.2, 0.9, 3.2));
  g.add(jar);
  // Far from the play field: nothing here needs to cast a shadow, and it never moves.
  mergeStatic(g, { cast: false });
  return g;
}

/**
 * Giant kitchen things around the world, so the bugs feel tiny: a fruit bowl, mugs, a plate, a bread
 * loaf, bottles and shakers (Kenney's Food Kit). Empty until the models have loaded.
 */
export function kitchenProps(): THREE.Group {
  const g = new THREE.Group();
  const put = (id: AssetId, size: number, fit: 'height' | 'width', x: number, z: number, turn = 0) => {
    const o = asset(id, size, fit);
    if (!o) return null;
    o.position.set(x, COUNTER_Y, z);
    o.rotation.y = turn;
    g.add(o);
    return o;
  };
  const bowl = put('bowl', 11, 'width', 2, -20);
  if (bowl) {
    // Fruit heaped in the bowl.
    const fruits: [AssetId, number, number, number, number][] = [
      ['apple', -2.4, 2.4, -0.6, 3.2], ['orange', 0.2, 2.6, 0.4, 3.2], ['pear', 2.6, 2.3, -0.2, 3.8],
      ['banana', 0, 4.2, -1.2, 6], ['lemon', -1, 4, 1.2, 2.6], ['apple', 1.6, 4.3, 1.4, 3],
    ];
    for (const [id, x, y, z, size] of fruits) {
      const f = asset(id, size, 'width');
      if (!f) continue;
      f.position.set(2 + x, COUNTER_Y + y, -20 + z);
      f.rotation.y = x * 2;
      g.add(f);
    }
  }
  put('mug', 6.5, 'height', 14, -16, -0.6);
  put('cup-tea', 4.5, 'height', -21, -12, 0.8);
  put('plate', 11, 'width', 21, -4, 0);
  put('cake-birthday', 4, 'height', 21, -4, 0.3)?.position.setY(COUNTER_Y + 0.5);
  put('loaf-round', 6, 'width', -22, 2, 0.4);
  put('bottle-ketchup', 9, 'height', -18, -21, 0.3);
  put('shaker-salt', 4, 'height', 18, -22, 0);
  put('shaker-pepper', 4, 'height', 21, -20, 0);
  put('pepper-mill', 7, 'height', 25, -14, 0);
  put('knife-block', 8, 'height', -27, -16, 0.5);
  put('honey', 5, 'height', 26, 6, -0.4);
  put('pumpkin', 6, 'width', -26, 10, 0.7);
  mergeStatic(g, { cast: false });
  return g;
}

/** A turned shape (a jar, a bowl, a cup) from (radius, height) points, outside going up then inside coming down. */
function lathe(pts: [number, number][], m: THREE.Material): THREE.Mesh {
  const o = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 48), m);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

// --- The mop ----------------------------------------------------------------------------------------

/** A giant kitchen mop, its head as wide as the whole world. Sweeps towards +x. */
export function mop(radius: number): THREE.Group {
  const g = new THREE.Group();
  const head = new THREE.Group();
  g.add(head);
  const width = radius * 2 + 3;
  head.add(mesh(geo.box, mat('#3f7bff', { rough: 0.3, clearcoat: 1 }), 0, 1.6, 0, 1.2, 0.9, width));
  head.add(mesh(geo.box, mat('#ffd23f', { rough: 0.3, clearcoat: 1 }), 0, 2.15, 0, 1.25, 0.25, width + 0.1));
  const strands = [mat('#e8f4ff', { rough: 0.9, sheen: 1 }), mat('#bfe0ff', { rough: 0.9, sheen: 1 })];
  for (let i = 0; i < 36; i++) {
    const z = -width / 2 + (i + 0.5) * (width / 36);
    const s = mesh(geo.sphere, strands[i % 2], (i % 2) * 0.25 - 0.1, 0.65, z, 0.42, 0.95, 0.38);
    head.add(s);
  }
  // A very long handle reaching up towards the camera and out of the picture, so its end is never seen.
  const stick = rod(mat('#c98a4b', { rough: 0.4, clearcoat: 0.6 }), new THREE.Vector3(0, 2.2, 0), new THREE.Vector3(-0.25, 0.75, 0.62).multiplyScalar(90).add(new THREE.Vector3(0, 2.2, 0)), 0.32);
  g.add(stick);
  g.traverse((c) => (c.castShadow = true));
  return g;
}

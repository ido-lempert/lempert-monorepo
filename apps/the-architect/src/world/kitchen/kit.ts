import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Shared kit for the kitchen props: polished stainless materials, bevelled boxes (the bevel is what
// catches the studio highlights on flat steel), bars between two points, doors and drawers that the
// viewer's Open button can move. Units are metres, origin at the floor centre, +Z is the front.

const phys = (o: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial(o);
export const M = {
  steel: phys({ color: 0xced0d3, metalness: 1, roughness: 0.17, envMapIntensity: 1.35 }),
  steelDark: phys({ color: 0xa9adb1, metalness: 1, roughness: 0.24, envMapIntensity: 1.1 }),
  chrome: phys({ color: 0xe2e4e6, metalness: 1, roughness: 0.08, envMapIntensity: 1.5 }),
  glass: phys({ color: 0xdce6ea, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false }),
  smoked: phys({ color: 0x20262b, metalness: 0, roughness: 0.06, transparent: true, opacity: 0.82, clearcoat: 1 }),
  black: phys({ color: 0x2b2d30, metalness: 0.3, roughness: 0.4 }),
  screen: phys({ color: 0x1b2a3a, roughness: 0.2, emissive: 0x2a6fb0, emissiveIntensity: 0.6 }),
  red: phys({ color: 0xc8322c, roughness: 0.4 }),
  white: phys({ color: 0xf0f0ee, roughness: 0.5 }),
  wood: phys({ color: 0xb98a55, roughness: 0.6 }),
  woodDark: phys({ color: 0x8a5a32, roughness: 0.6 }),
  green: phys({ color: 0x3aa845, roughness: 0.45, clearcoat: 0.3, side: THREE.DoubleSide }),
  blue: phys({ color: 0x2f55b5, roughness: 0.45, clearcoat: 0.3, side: THREE.DoubleSide }),
  yellow: phys({ color: 0xe2b23a, roughness: 0.8 }),
  cloth: phys({ color: 0x9a9ea3, roughness: 0.9, sheen: 0.5 }),
  grain: phys({ color: 0xa8742f, roughness: 0.9 }),
  bean: phys({ color: 0x4a2c18, roughness: 0.7 }),
  bottle: phys({ color: 0x1f3a26, metalness: 0, roughness: 0.1, clearcoat: 1 }),
};
type V3 = [number, number, number];

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = make()));
  return g;
}
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Box of size s centred at p; bevel radius r (0 = sharp). */
export function box(parent: THREE.Object3D, name: string, mat: THREE.Material, s: V3, p: V3, r = 0.006): THREE.Mesh {
  const rr = Math.min(r, s[0] / 2.01, s[1] / 2.01, s[2] / 2.01);
  const g = cached(`b${s.map(r3)}${r3(rr)}`, () => (rr > 0.0005 ? new RoundedBoxGeometry(s[0], s[1], s[2], 1, rr) : new THREE.BoxGeometry(...s)));
  const m = new THREE.Mesh(g, mat);
  m.name = name;
  m.position.set(...p);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Cylinder (bar, leg, pipe, knob) from a to b with radius r; rTop for a cone. */
export function bar(parent: THREE.Object3D, name: string, mat: THREE.Material, a: V3, b: V3, r: number, seg = 12, rTop = r): THREE.Mesh {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = cached(`c${r3(r)},${r3(rTop)},${r3(len)},${seg}`, () => new THREE.CylinderGeometry(rTop, r, len, seg));
  const m = new THREE.Mesh(g, mat);
  m.name = name;
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.sub(va).normalize());
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function group(parent: THREE.Object3D, name: string, p: V3 = [0, 0, 0]): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(...p);
  parent.add(g);
  return g;
}

/** A door group whose origin is the hinge line. side -1 = hinge on west edge, +1 = east edge, 0 = bottom (drops down). */
export function hinged(parent: THREE.Object3D, name: string, hinge: V3, side: -1 | 0 | 1): THREE.Group {
  const g = group(parent, name, hinge);
  g.userData.actionProfile = {
    animationRole: 'hinge-swing',
    pivot: { localPosition: [0, 0, 0], axis: side === 0 ? [1, 0, 0] : [0, 1, 0] },
    constraints: [side === 1 ? { minDeg: 0, maxDeg: 100 } : { minDeg: -100, maxDeg: 0 }],
  };
  return g;
}
export function drawer(parent: THREE.Object3D, name: string, p: V3): THREE.Group {
  const g = group(parent, name, p);
  g.userData.actionProfile = { animationRole: 'drawer-slide' };
  return g;
}

/** Raised frame of four strips on a slab: reads as an inset panel. Centred at (x, y), front face at z. */
export function frame(parent: THREE.Object3D, name: string, mat: THREE.Material, w: number, h: number, x: number, y: number, z: number, bw = 0.035, t = 0.008) {
  box(parent, `${name} top`, mat, [w, bw, t], [x, y + h / 2 - bw / 2, z + t / 2], 0);
  box(parent, `${name} bottom`, mat, [w, bw, t], [x, y - h / 2 + bw / 2, z + t / 2], 0);
  box(parent, `${name} west`, mat, [bw, h - 2 * bw, t], [x - w / 2 + bw / 2, y, z + t / 2], 0);
  box(parent, `${name} east`, mat, [bw, h - 2 * bw, t], [x + w / 2 - bw / 2, y, z + t / 2], 0);
}

/** Bar handle with two stand-offs, vertical or horizontal, centred at p (p.z = door face). */
export function handle(parent: THREE.Object3D, name: string, p: V3, len: number, vertical: boolean, r = 0.009, off = 0.035) {
  const [x, y, z] = p;
  const d: V3 = vertical ? [0, len / 2, 0] : [len / 2, 0, 0];
  bar(parent, name, M.chrome, [x - d[0], y - d[1], z + off], [x + d[0], y + d[1], z + off], r, 10);
  for (const s of [-0.42, 0.42]) {
    const q: V3 = [x + d[0] * 2 * s, y + d[1] * 2 * s, z];
    bar(parent, `${name} stand-off`, M.chrome, q, [q[0], q[1], z + off], r * 0.8, 8);
  }
}

/** Under-counter carcass: worktop, body, recessed kick plinth. Returns the front face z. */
export function carcass(root: THREE.Object3D, w: number, h: number, d: number, plinth = 0.09, top = 0.035): number {
  box(root, 'Worktop', M.steel, [w + 0.02, top, d + 0.02], [0, h - top / 2, 0], 0.008);
  box(root, 'Body', M.steel, [w, h - top - plinth, d], [0, plinth + (h - top - plinth) / 2, 0], 0.004);
  box(root, 'Kick plinth', M.steelDark, [w - 0.04, plinth, d - 0.08], [0, plinth / 2, -0.03], 0);
  return d / 2;
}

/** Door slab with inset-panel frame and a bar handle; group origin is the hinge. */
export function panelDoor(parent: THREE.Object3D, name: string, w: number, h: number, hinge: V3, side: -1 | 1, handleLen = 0.14) {
  const g = hinged(parent, name, hinge, side);
  const cx = -side * w / 2;
  box(g, `${name} slab`, M.steel, [w - 0.004, h, 0.02], [cx, 0, 0.01], 0.004);
  frame(g, `${name} frame`, M.steel, w - 0.004, h, cx, 0, 0.02);
  handle(g, `${name} handle`, [-side * (w - 0.06), 0.12 * h / 0.7, 0.028], handleLen, true);
  return g;
}

/** Drawer: front with inset frame and horizontal handle, plus the box behind it. */
export function panelDrawer(parent: THREE.Object3D, name: string, w: number, h: number, y: number, z: number, depth: number) {
  const g = drawer(parent, name, [0, y, z]);
  box(g, `${name} front`, M.steel, [w, h, 0.02], [0, 0, 0.01], 0.004);
  frame(g, `${name} frame`, M.steel, w, h, 0, 0, 0.02);
  handle(g, `${name} handle`, [0, h * 0.18, 0.028], Math.min(0.22, w * 0.35), false);
  const bw = w - 0.06, bh = h - 0.06;
  box(g, `${name} floor`, M.steelDark, [bw, 0.01, depth], [0, -bh / 2, -depth / 2], 0);
  for (const s of [-1, 1]) box(g, `${name} side`, M.steelDark, [0.01, bh, depth], [(s * bw) / 2, 0, -depth / 2], 0);
  box(g, `${name} back`, M.steelDark, [bw, bh, 0.01], [0, 0, -depth], 0);
  return g;
}

export function legs(root: THREE.Object3D, w: number, d: number, h: number, inset = 0.05, r = 0.02) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (w / 2 - inset), z = sz * (d / 2 - inset);
    bar(root, 'Leg', M.chrome, [x, 0.012, z], [x, h, z], r, 10);
    bar(root, 'Foot', M.steelDark, [x, 0, z], [x, 0.012, z], r * 1.3, 10);
  }
}

/** Faceted geometry (flat normals) for pyramids / chamfers built from low-segment cylinders. */
export function flat(g: THREE.BufferGeometry) {
  const n = g.toNonIndexed();
  n.computeVertexNormals();
  return n;
}

export function mesh(parent: THREE.Object3D, name: string, g: THREE.BufferGeometry, mat: THREE.Material, p: V3 = [0, 0, 0]) {
  const m = new THREE.Mesh(g, mat);
  m.name = name;
  m.position.set(...p);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Many copies of one small part (jars, bottles, wires) in one draw call. */
export function many(parent: THREE.Object3D, name: string, g: THREE.BufferGeometry, mat: THREE.Material, at: V3[], rot?: THREE.Euler) {
  const im = new THREE.InstancedMesh(g, mat, at.length);
  im.name = name;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(rot ?? new THREE.Euler()), one = new THREE.Vector3(1, 1, 1);
  at.forEach((p, i) => im.setMatrixAt(i, m4.compose(new THREE.Vector3(...p), q, one)));
  im.castShadow = im.receiveShadow = true;
  parent.add(im);
  return im;
}

export function root(name: string) {
  const g = new THREE.Group();
  g.name = name;
  return g;
}

/**
 * Polished steel only reads as shiny when it reflects contrast: a dark-to-light dome and a few bright
 * softboxes. The game's own environment is an even room, so the kitchen materials get this map of their
 * own (a material's `envMap` wins over `scene.environment`); the rest of the scene is untouched.
 */
export function useSteelReflections(renderer: THREE.WebGLRenderer) {
  const env = new THREE.Scene();
  const dome = new THREE.SphereGeometry(20, 32, 16);
  const pos = dome.attributes.position, cols: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / 20;
    const c = t > 0.2 ? 0.22 + 0.3 * t : t > -0.08 ? 0.06 : 0.32 + 0.1 * t;
    cols.push(c, c, c * 1.02);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  env.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const soft = (w: number, h: number, x: number, y: number, z: number, k: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  soft(8, 3, 0, 14, 4, 4);
  soft(3, 10, -14, 4, 8, 3);
  soft(3, 10, 14, 3, -6, 3);
  soft(12, 2, 0, 2, -16, 2);
  soft(4, 4, 9, 6, 15, 1.1); // dim: the game camera always looks from the front, so front faces reflect this one
  const pmrem = new THREE.PMREMGenerator(renderer);
  const map = pmrem.fromScene(env, 0.015).texture;
  pmrem.dispose();
  for (const m of Object.values(M)) {
    m.envMap = map;
    m.needsUpdate = true;
  }
}

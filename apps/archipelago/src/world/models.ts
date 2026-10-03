/**
 * Every model is built here from primitives (no assets, so the game works offline): the island with its
 * three terraces, the pieces with faces, pads, critters and decorations.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Kind, Shape } from '../game/types';
import { canvasTexture, grassTexture, mat } from './look';

const shadows = <T extends THREE.Object3D>(o: T, cast = true): T => {
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      c.castShadow = cast;
      c.receiveShadow = true;
    }
  });
  return o;
};

const box = (w: number, h: number, d: number, r = 0.08) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2));

// --- Terrain ----------------------------------------------------------------------------------------

/** The three terraces: front (presentation), middle (logic) and back (data). */
export const TERRACES = [
  { z0: 1.7, z1: 5.4, y: 0 },
  { z0: -1.7, z1: 1.7, y: 0.45 },
  { z0: -5.4, z1: -1.7, y: 0.9 },
];

export function groundAt(z: number): number {
  return (TERRACES.find((t) => z >= t.z0 && z <= t.z1) ?? TERRACES[0]).y;
}

function signTexture(title: string, sub: string): THREE.CanvasTexture {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#fff6e0';
    g.beginPath();
    g.roundRect(8, 60, s - 16, s - 120, 26);
    g.fill();
    g.fillStyle = '#4a3420';
    g.textAlign = 'center';
    g.font = '900 54px "Rubik Variable", system-ui, sans-serif';
    g.fillText(title, s / 2, 128);
    g.font = '700 34px "Rubik Variable", system-ui, sans-serif';
    g.fillStyle = '#8a6a48';
    g.fillText(sub, s / 2, 172);
  });
}

/** A little wooden sign that names a terrace. */
function sign(title: string, sub: string): THREE.Group {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.8, 8), mat('#a5774b', { rough: 0.8 }));
  post.position.y = 0.4;
  const board = new THREE.Mesh(box(1.3, 0.75, 0.08, 0.04), mat('#c99a63', { rough: 0.7 }));
  board.position.y = 0.95;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.22, 1.22), new THREE.MeshBasicMaterial({ map: signTexture(title, sub), transparent: true }));
  face.position.set(0, 0.95, 0.045);
  g.add(post, board, face);
  return shadows(g);
}

function tree(seed: number): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.7, 8), mat('#9a6b43', { rough: 0.8 }));
  trunk.position.y = 0.35;
  g.add(trunk);
  const colors = ['#5cc463', '#4fb35d', '#73d36b'];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.42 - i * 0.08, 18, 14), mat(colors[(seed + i) % 3], { sheen: 0.6, rough: 0.7 }));
    s.position.set(Math.sin(seed + i * 2) * 0.12, 0.85 + i * 0.32, Math.cos(seed + i) * 0.1);
    g.add(s);
  }
  g.scale.setScalar(0.9 + (seed % 3) * 0.15);
  return shadows(g);
}

function bush(seed: number): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.22 + (i % 2) * 0.06, 14, 10), mat(i % 2 ? '#6fcf5e' : '#58bb57', { sheen: 0.6, rough: 0.7 }));
    s.position.set((i - 1) * 0.25, 0.16, Math.sin(seed + i) * 0.08);
    g.add(s);
  }
  if (seed % 2) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat(seed % 4 === 1 ? '#ff7aa8' : '#ffd24a', { emissive: 0.2 }));
    f.position.set(0.1, 0.36, 0.12);
    g.add(f);
  }
  return shadows(g);
}

/** The island: sand, grass, the three terraces, signs and plants, and the sea around it. */
export function island(signs: boolean): THREE.Group {
  const g = new THREE.Group();
  const grass = mat('#ffffff', { map: grassTexture, rough: 0.85, rim: 0.12 });
  const sand = new THREE.Mesh(box(14.2, 1.2, 12.2, 0.6), mat('#f1d49a', { rough: 0.9 }));
  sand.position.y = -0.75;
  const base = new THREE.Mesh(box(13, 0.6, 11, 0.3), grass);
  base.position.y = -0.3;
  g.add(sand, base);
  for (const t of TERRACES.slice(1)) {
    const step = new THREE.Mesh(box(12, t.y + 0.3, t.z1 - t.z0, 0.18), grass);
    step.position.set(0, (t.y + 0.3) / 2 - 0.3, (t.z0 + t.z1) / 2);
    g.add(step);
  }
  // A strip of soil on each step's face, so the terraces read as steps.
  for (const t of TERRACES.slice(1)) {
    const lip = new THREE.Mesh(box(12.02, 0.16, 0.12, 0.05), mat('#c9a06a', { rough: 0.9 }));
    lip.position.set(0, t.y - 0.1, t.z1 + 0.01);
    g.add(lip);
  }
  if (signs) {
    const names = [
      ['תצוגה', 'Presentation'],
      ['לוגיקה', 'Logic'],
      ['נתונים', 'Data'],
    ];
    TERRACES.forEach((t, i) => {
      const s = sign(names[i][0], names[i][1]);
      s.position.set(-5.4, t.y, (t.z0 + t.z1) / 2 + 0.4);
      s.rotation.y = 0.35;
      g.add(s);
    });
  }
  const spots: [number, number, 'tree' | 'bush'][] = [
    [5.6, 4.4, 'tree'],
    [-5.7, 4.6, 'bush'],
    [5.5, 0.6, 'bush'],
    [5.4, -2.6, 'tree'],
    [-5.3, -4.6, 'tree'],
    [4.6, -4.8, 'bush'],
    [-1.2, -4.9, 'bush'],
    [1.3, 4.9, 'bush'],
  ];
  spots.forEach(([x, z, kind], i) => {
    const m = kind === 'tree' ? tree(i) : bush(i);
    m.position.set(x, groundAt(z), z);
    g.add(m);
  });
  shadows(g, false);
  return g;
}

export function sea(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(80, 48), mat('#4cc3e8', { rough: 0.25, metal: 0.05, rim: 0 }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = -0.95;
  m.receiveShadow = true;
  return m;
}

// --- Faces ------------------------------------------------------------------------------------------

/** Two big glossy eyes and a smile. The eyes group is kept in userData.eyes, for blinking. */
function face(size = 1): THREE.Group {
  const g = new THREE.Group();
  const eyes = new THREE.Group();
  const white = mat('#ffffff', { clearcoat: 1, rough: 0.2, rim: 0 });
  const dark = mat('#26203b', { clearcoat: 1, rough: 0.15, rim: 0 });
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.11 * size, 16, 12), white);
    e.scale.z = 0.5;
    e.position.x = side * 0.15 * size;
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.065 * size, 14, 10), dark);
    p.position.set(0, -0.01 * size, 0.045 * size);
    p.scale.z = 0.5;
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.022 * size, 8, 6), mat('#ffffff', { emissive: 1, rim: 0 }));
    shine.position.set(0.025 * size, 0.025 * size, 0.08 * size);
    e.add(p, shine);
    eyes.add(e);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.06 * size, 0.014 * size, 6, 16, Math.PI), dark);
  smile.rotation.z = Math.PI;
  smile.position.y = -0.12 * size;
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.045 * size, 12), mat('#ff8fb1', { transparent: 0.6, rim: 0 }));
    cheek.position.set(side * 0.24 * size, -0.09 * size, 0);
    g.add(cheek);
  }
  g.add(eyes, smile);
  g.userData.eyes = eyes;
  g.userData.smile = smile;
  return g;
}

// --- Sockets ----------------------------------------------------------------------------------------

/** A badge that shows a piece's plug shape: a ring or a square frame. */
export function socket(shape: Shape): THREE.Group {
  const g = new THREE.Group();
  const m = mat(shape === 'round' ? '#2fd4b0' : '#ff9a3c', { clearcoat: 0.8, emissive: 0.15 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), mat('#d9dde8'));
  post.position.y = 0.2;
  g.add(post);
  if (shape === 'round') {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.05, 10, 24), m);
    r.position.y = 0.5;
    g.add(r);
  } else {
    for (let i = 0; i < 4; i++) {
      const bar = new THREE.Mesh(box(0.3, 0.09, 0.09, 0.03), m);
      const a = (i * Math.PI) / 2;
      bar.position.set(Math.cos(a) * 0.12, 0.5 + Math.sin(a) * 0.12, 0);
      bar.rotation.z = a + Math.PI / 2;
      g.add(bar);
    }
  }
  return shadows(g);
}

// --- Pieces -----------------------------------------------------------------------------------------

function phone(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(box(0.85, 1.4, 0.2, 0.12), mat('#ff7aa8', { clearcoat: 1, rough: 0.35 }));
  body.position.y = 0.95;
  body.rotation.x = -0.12;
  const screen = new THREE.Mesh(box(0.7, 1.15, 0.04, 0.06), mat('#bff3ff', { emissive: 0.35, rough: 0.2, clearcoat: 1 }));
  screen.position.set(0, 0, 0.1);
  body.add(screen);
  const f = face(1.15);
  f.position.set(0, 0.12, 0.14);
  body.add(f);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.18, 24), mat('#ffd0e0', { clearcoat: 0.6 }));
  stand.position.y = 0.09;
  g.add(stand, body);
  g.userData.face = f;
  g.userData.screen = screen;
  return g;
}

function laptop(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(box(1.3, 0.12, 0.9, 0.05), mat('#9ad0ff', { clearcoat: 1, rough: 0.35 }));
  base.position.y = 0.06;
  const keys = new THREE.Mesh(box(1.1, 0.03, 0.5, 0.02), mat('#6aa8e8'));
  keys.position.set(0, 0.13, 0.05);
  const lid = new THREE.Group();
  lid.position.set(0, 0.12, -0.42);
  lid.rotation.x = -0.25;
  const shell = new THREE.Mesh(box(1.3, 0.9, 0.08, 0.05), mat('#9ad0ff', { clearcoat: 1, rough: 0.35 }));
  shell.position.y = 0.45;
  const screen = new THREE.Mesh(box(1.12, 0.74, 0.03, 0.03), mat('#e9fbff', { emissive: 0.35, clearcoat: 1, rough: 0.2 }));
  screen.position.set(0, 0.46, 0.045);
  const f = face(1.05);
  f.position.set(0, 0.5, 0.07);
  lid.add(shell, screen, f);
  g.add(base, keys, lid);
  g.userData.face = f;
  g.userData.screen = screen;
  return g;
}

function server(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(box(1.0, 1.55, 0.9, 0.14), mat('#8b6cff', { clearcoat: 1, rough: 0.35 }));
  body.position.y = 0.78;
  g.add(body);
  const f = face(1.2);
  f.position.set(0, 1.18, 0.46);
  g.add(f);
  const leds: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const slot = new THREE.Mesh(box(0.72, 0.14, 0.04, 0.03), mat('#5a43c9'));
    slot.position.set(0, 0.32 + i * 0.22, 0.46);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mat(['#5cff9d', '#ffd24a', '#5cff9d'][i], { emissive: 2.2, rim: 0 }));
    led.position.set(0.26, 0.32 + i * 0.22, 0.49);
    leds.push(led);
    g.add(slot, led);
  }
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), mat('#d9dde8'));
  antenna.position.set(0.3, 1.7, 0);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mat('#ffd24a', { emissive: 1.5 }));
  tip.position.set(0.3, 1.86, 0);
  g.add(antenna, tip);
  g.userData.face = f;
  g.userData.leds = leds;
  return g;
}

function db(): THREE.Group {
  const g = new THREE.Group();
  const colors = ['#3f7bff', '#5b8cff', '#7aa5ff'];
  for (let i = 0; i < 3; i++) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.42, 32), mat(colors[i], { clearcoat: 1, rough: 0.3 }));
    disc.position.y = 0.23 + i * 0.46;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 8, 40), mat('#ffffff', { clearcoat: 1 }));
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.45 + i * 0.46;
    g.add(disc, band);
  }
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.62, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#9cbcff', { clearcoat: 1, rough: 0.3 }));
  top.scale.y = 0.28;
  top.position.y = 1.36;
  g.add(top);
  const f = face(1.25);
  f.position.set(0, 0.72, 0.6);
  g.add(f);
  g.userData.face = f;
  return g;
}

function adapter(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(box(1.1, 0.8, 0.75, 0.22), mat('#ffb547', { clearcoat: 1, rough: 0.35 }));
  body.position.y = 0.5;
  g.add(body);
  // A round socket on one side and a square plug on the other.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.06, 10, 24), mat('#2fd4b0', { clearcoat: 0.8, emissive: 0.15 }));
  ring.rotation.y = Math.PI / 2;
  ring.position.set(-0.6, 0.5, 0);
  const square = new THREE.Mesh(box(0.12, 0.3, 0.3, 0.04), mat('#ff9a3c', { clearcoat: 0.8, emissive: 0.15 }));
  square.position.set(0.62, 0.5, 0);
  for (const side of [-1, 1]) {
    const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), mat('#e6e9f2', { metal: 0.6, rough: 0.3 }));
    prong.rotation.z = Math.PI / 2;
    prong.position.set(0.75, 0.5 + side * 0.08, 0);
    g.add(prong);
  }
  const f = face(1.05);
  f.position.set(0, 0.56, 0.39);
  g.add(ring, square, f);
  g.userData.face = f;
  return g;
}

function bank(): THREE.Group {
  const g = new THREE.Group();
  const stone = mat('#efe2c4', { rough: 0.6 });
  const base = new THREE.Mesh(box(1.7, 0.2, 1.1, 0.05), stone);
  base.position.y = 0.1;
  const body = new THREE.Mesh(box(1.4, 0.9, 0.8, 0.05), mat('#e3d1aa', { rough: 0.6 }));
  body.position.set(0, 0.65, -0.1);
  g.add(base, body);
  for (let i = 0; i < 4; i++) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.95, 12), stone);
    col.position.set(-0.6 + i * 0.4, 0.67, 0.38);
    g.add(col);
  }
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1.0, 0.5, 3, 1), mat('#d4a64a', { clearcoat: 0.8, metal: 0.3, rough: 0.35 }));
  roof.rotation.set(Math.PI / 2, 0, 0);
  roof.scale.set(1, 0.75, 0.45);
  roof.rotation.z = Math.PI;
  roof.position.set(0, 1.35, 0);
  const lintel = new THREE.Mesh(box(1.7, 0.16, 1.1, 0.04), stone);
  lintel.position.y = 1.2;
  g.add(lintel, roof);
  const f = face(1.15);
  f.position.set(0, 0.85, 0.31);
  // An old-timer's moustache.
  const stache = new THREE.Group();
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), mat('#6b4a2e'));
    m.scale.set(1.5, 0.6, 0.6);
    m.position.set(side * 0.1, -0.09, 0.03);
    m.rotation.z = side * 0.3;
    stache.add(m);
  }
  f.add(stache);
  (f.userData.smile as THREE.Object3D).visible = false;
  g.add(f);
  g.userData.face = f;
  return g;
}

const BUILDERS: Record<Kind, () => THREE.Group> = { phone, laptop, server, db, adapter, bank };

/** Where requests leave and arrive on each kind, above its base. */
export const PORT_HEIGHT: Record<Kind, number> = { phone: 1.0, laptop: 0.7, server: 1.0, db: 0.9, adapter: 0.6, bank: 0.9 };

export function piece(kind: Kind): THREE.Group {
  const g = BUILDERS[kind]();
  return shadows(g);
}

// --- Pads, critters ---------------------------------------------------------------------------------

/** A glowing ring on the ground where a piece can stand. */
export function pad(): THREE.Group {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.08, 40), mat('#ffffff', { transparent: 0.55, rough: 0.3 }));
  disc.position.y = 0.04;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.05, 8, 48), mat('#5ff0ff', { emissive: 1.2 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.09;
  g.add(disc, ring);
  g.userData.ring = ring;
  disc.receiveShadow = true;
  return g;
}

export const CRITTER_COLORS = ['#ffd24a', '#ff8fb1', '#7ee08a', '#b18cff'];

/** A round little request with eyes, carrying a letter. userData: letter, prize, eyes. */
export function critter(color: string, prize: 'data' | 'coin'): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 16), mat(color, { sheen: 0.8, clearcoat: 0.6, rough: 0.5 }));
  body.position.y = 0.22;
  body.scale.y = 0.92;
  g.add(body);
  const f = face(0.62);
  f.position.set(0, 0.26, 0.19);
  g.add(f);
  for (const side of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mat('#ff9a3c', { clearcoat: 0.6 }));
    foot.scale.set(1, 0.6, 1.4);
    foot.position.set(side * 0.1, 0.03, 0.05);
    g.add(foot);
  }
  const letter = new THREE.Mesh(box(0.3, 0.2, 0.04, 0.02), mat('#ffffff', { clearcoat: 0.5 }));
  letter.position.set(0, 0.5, 0);
  const seal = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), mat('#ff5a6e', { emissive: 0.2 }));
  seal.position.z = 0.025;
  letter.add(seal);
  const prizeMesh =
    prize === 'data'
      ? new THREE.Mesh(new THREE.OctahedronGeometry(0.15), mat('#5b8cff', { emissive: 0.6, clearcoat: 1, rough: 0.15 }))
      : new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 20), mat('#ffcf3a', { metal: 0.7, rough: 0.25, emissive: 0.3 }));
  if (prize === 'coin') prizeMesh.rotation.x = Math.PI / 2;
  prizeMesh.position.y = 0.55;
  prizeMesh.visible = false;
  g.add(letter, prizeMesh);
  g.userData = { letter, prize: prizeMesh, face: f, body };
  return shadows(g);
}

/** A bouncing arrow that points at what to tap next. */
export function pointer(): THREE.Group {
  const g = new THREE.Group();
  const m = mat('#ffef5a', { emissive: 0.7, clearcoat: 1 });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 20), m);
  cone.rotation.x = Math.PI;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.35, 12), m);
  stem.position.y = 0.35;
  g.add(cone, stem);
  return g;
}

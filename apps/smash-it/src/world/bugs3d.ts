/**
 * The bugs, kawaii style: round chibi bodies, heads as big as the body, huge sparkly anime eyes that blink,
 * rosy cheeks and tiny mouths. Every bug is a level-of-detail model: a detailed one for close-ups (the
 * Impact Cam, the replay) and a light one for the normal view, swapped by distance.
 * Bugs face +z and are about one unit across; the world scales them.
 */
import * as THREE from 'three';
import type { BossDef, BugKind } from '../game/bugs';
import { canvasTexture, mat, outline } from './look';

export interface BugParts {
  body: THREE.Group;
  legs: THREE.Object3D[];
  wings: THREE.Object3D[];
  /** Each eye (scaled flat to blink). */
  eyes: THREE.Object3D[];
  /** Swirly eyes, shown when dizzy. */
  dizzy: THREE.Object3D[];
  smile: THREE.Object3D;
  /** An "O" mouth for when it gets hit. */
  oh: THREE.Object3D;
}

export interface BugModel {
  root: THREE.Group;
  /** One set of parts per detail level (all animated the same way). */
  parts: BugParts[];
  /** Dizzy stars, shown when dazed. */
  stars: THREE.Group;
  /** A king's soap-bubble shield (shown while it can't be hurt). */
  bubble?: THREE.Mesh;
}

type Detail = 'high' | 'low';

/** Distance at which the light model takes over. */
const LOD_DISTANCE = 9;

const spheres = {
  high: new THREE.SphereGeometry(1, 40, 28),
  low: new THREE.SphereGeometry(1, 14, 10),
};
const capsule = new THREE.CapsuleGeometry(0.5, 1, 6, 12);

function ball(detail: Detail, m: THREE.Material, r: number, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1): THREE.Mesh {
  const o = new THREE.Mesh(spheres[detail], m);
  o.position.set(x, y, z);
  o.scale.set(r * sx, r * sy, r * sz);
  o.castShadow = true;
  return o;
}

function rod(m: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.Mesh {
  const o = new THREE.Mesh(capsule, m);
  const d = b.clone().sub(a);
  o.scale.set(r * 2, d.length(), r * 2);
  o.position.copy(a).addScaledVector(d, 0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  o.castShadow = true;
  return o;
}

const spiralTexture = canvasTexture(64, (g, s) => {
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#2a1a3a';
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.beginPath();
  for (let a = 0; a < Math.PI * 5; a += 0.15) {
    const r = 2 + a * 1.75;
    const x = s / 2 + Math.cos(a) * r;
    const y = s / 2 + Math.sin(a) * r;
    if (a === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
});
const spiralMat = new THREE.MeshBasicMaterial({ map: spiralTexture, transparent: true, alphaTest: 0.3 });

/** Big anime eyes with two sparkles, a cat mouth, rosy cheeks. `head` faces +z; `r` is the head radius. */
function face(parts: BugParts, head: THREE.Object3D, detail: Detail, r: number, opts: { spread?: number; eye?: number; iris?: string; y?: number } = {}) {
  const spread = (opts.spread ?? 0.42) * r;
  const er = (opts.eye ?? 0.3) * r;
  const y = (opts.y ?? 0.08) * r;
  const white = mat('#ffffff', { rough: 0.15, clearcoat: 1, rim: 0.1 });
  const iris = mat(opts.iris ?? '#2b1840', { rough: 0.1, clearcoat: 1, rim: 0 });
  const shine = mat('#ffffff', { emissive: 1.6, rim: 0 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Group();
    // Sit the eye on the curve of the head.
    const z = Math.sqrt(Math.max(0, r * r - spread * spread - y * y)) * 0.93;
    eye.position.set(s * spread, y, z);
    eye.lookAt(eye.position.clone().multiplyScalar(2));
    eye.add(ball(detail, white, er, 0, 0, 0, 0.92, 1.1, 0.45));
    eye.add(ball(detail, iris, er * 0.78, s * -0.04 * er, -0.06 * er, er * 0.18, 0.92, 1.08, 0.4));
    if (detail === 'high') {
      // A ring of colour in the iris, and two sparkles.
      eye.add(ball(detail, mat('#7b5cff', { rough: 0.1, clearcoat: 1, rim: 0 }), er * 0.42, s * -0.04 * er, -0.32 * er, er * 0.27, 0.9, 0.6, 0.2));
      eye.add(ball(detail, shine, er * 0.26, -0.28 * er, 0.32 * er, er * 0.42));
      eye.add(ball(detail, shine, er * 0.12, 0.26 * er, -0.3 * er, er * 0.42));
    } else eye.add(ball(detail, shine, er * 0.24, -0.28 * er, 0.3 * er, er * 0.4));
    eye.traverse((o) => (o.userData.noOutline = true));
    head.add(eye);
    parts.eyes.push(eye);
    const sw = new THREE.Mesh(new THREE.CircleGeometry(er * 0.95, detail === 'high' ? 24 : 10), spiralMat);
    sw.position.copy(eye.position).multiplyScalar(1.04);
    sw.lookAt(sw.position.clone().multiplyScalar(2));
    sw.visible = false;
    sw.userData.noOutline = true;
    head.add(sw);
    parts.dizzy.push(sw);
    // Cheeks.
    const cheek = ball(detail, mat('#ff8fb3', { transparent: 0.75, rim: 0, rough: 0.6 }), er * 0.55, s * (spread + er * 0.5), y - er * 1.15, z * 0.93, 1, 0.55, 0.25);
    cheek.lookAt(cheek.position.clone().multiplyScalar(2));
    cheek.userData.noOutline = true;
    cheek.castShadow = false;
    head.add(cheek);
  }
  // A little "w" mouth.
  const mouthY = y - er * 1.35;
  const mz = Math.sqrt(Math.max(0, r * r - mouthY * mouthY)) * 0.99;
  const smile = new THREE.Group();
  smile.position.set(0, mouthY, mz);
  const lip = mat('#4a1f3a', { rim: 0 });
  for (const s of [-1, 1]) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(er * 0.22, er * 0.06, 6, detail === 'high' ? 16 : 8, Math.PI), lip);
    arc.rotation.z = Math.PI;
    arc.position.x = s * er * 0.22;
    smile.add(arc);
  }
  smile.traverse((o) => (o.userData.noOutline = true));
  head.add(smile);
  parts.smile = smile;
  const oh = new THREE.Group();
  oh.position.copy(smile.position);
  oh.add(ball(detail, mat('#4a1f3a', { rim: 0 }), er * 0.32, 0, 0, 0, 0.8, 1, 0.3));
  if (detail === 'high') oh.add(ball(detail, mat('#ff6f91', { rim: 0 }), er * 0.2, 0, -er * 0.12, er * 0.06, 1, 0.6, 0.3));
  oh.visible = false;
  oh.traverse((o) => (o.userData.noOutline = true));
  head.add(oh);
  parts.oh = oh;
}

function antennae(head: THREE.Object3D, detail: Detail, m: THREE.Material, tip: THREE.Material, r: number, len = 0.7, heart = false) {
  for (const s of [-1, 1]) {
    const a = new THREE.Vector3(s * r * 0.3, r * 0.82, r * 0.1);
    const mid = new THREE.Vector3(s * r * 0.48, r * (0.82 + len * 0.6), r * 0.05);
    const b = new THREE.Vector3(s * r * 0.75, r * (0.82 + len), r * 0.25);
    head.add(rod(m, a, mid, 0.035 * r));
    head.add(rod(m, mid, b, 0.035 * r));
    if (heart && detail === 'high') {
      for (const k of [-1, 1]) head.add(ball(detail, tip, r * 0.1, b.x + k * r * 0.06, b.y + r * 0.03, b.z));
      const point = new THREE.Mesh(new THREE.ConeGeometry(r * 0.13, r * 0.16, 12), tip);
      point.position.set(b.x, b.y - r * 0.08, b.z);
      point.rotation.z = Math.PI;
      head.add(point);
    } else head.add(ball(detail, tip, r * 0.13, b.x, b.y, b.z));
  }
}

/** Six stubby legs with round feet. */
function legs(parts: BugParts, body: THREE.Object3D, detail: Detail, m: THREE.Material, y: number, zs: number[], span: number, len: number) {
  zs.forEach((z, i) => {
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * span, y, z);
      const foot = new THREE.Vector3(s * len * 0.55, -len * 0.85, 0);
      pivot.add(rod(m, new THREE.Vector3(0, 0, 0), foot, 0.075));
      pivot.add(ball(detail, m, 0.1, foot.x, foot.y, foot.z + 0.03, 1.1, 0.8, 1.3));
      pivot.userData.phase = i * 2.1 + (s > 0 ? Math.PI : 0);
      body.add(pivot);
      parts.legs.push(pivot);
    }
  });
}

function newParts(): BugParts {
  const g = new THREE.Group();
  return { body: g, legs: [], wings: [], eyes: [], dizzy: [], smile: g, oh: g };
}

// --- Bug kinds ----------------------------------------------------------------------------------------

const heartSpots = (base: string, spot: string) =>
  canvasTexture(256, (g, s) => {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    g.fillStyle = spot;
    const heart = (x: number, y: number, r: number) => {
      g.beginPath();
      g.moveTo(x, y + r * 0.9);
      g.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.3, x, y - r * 0.45);
      g.bezierCurveTo(x + r * 0.7, y - r * 1.3, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
      g.fill();
    };
    for (const [x, y, r] of [[0.22, 0.32, 0.07], [0.72, 0.28, 0.06], [0.45, 0.58, 0.08], [0.15, 0.72, 0.06], [0.82, 0.66, 0.07], [0.55, 0.88, 0.05]]) heart(x * s, y * s, r * s);
  });
const ladyTex = heartSpots('#ff5d73', '#3b1d3f');
const beetleTex = heartSpots('#5fe0a8', '#2e9d77');
const goldTex = heartSpots('#ffd34d', '#ffb000');

const swirl = (a: string, b: string) =>
  canvasTexture(256, (g, s) => {
    g.fillStyle = a;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = b;
    g.lineWidth = 16;
    g.lineCap = 'round';
    g.beginPath();
    for (let t = 0; t < Math.PI * 6; t += 0.08) {
      const r = 6 + t * 6.5;
      const x = s / 2 + Math.cos(t) * r;
      const y = s / 2 + Math.sin(t) * r;
      if (t === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  });
const shellTex = swirl('#ffb6d9', '#c86fd8');

const wingTex = canvasTexture(128, (g, s) => {
  const grad = g.createRadialGradient(s * 0.3, s * 0.5, 4, s * 0.5, s * 0.5, s * 0.55);
  grad.addColorStop(0, '#fff3a8');
  grad.addColorStop(0.5, '#ffb3e6');
  grad.addColorStop(1, '#a98bff');
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(s * 0.52, s * 0.36, s * 0.46, s * 0.33, 0, 0, Math.PI * 2);
  g.ellipse(s * 0.44, s * 0.76, s * 0.3, s * 0.22, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (const [x, y, r] of [[0.62, 0.3, 0.09], [0.38, 0.42, 0.05], [0.47, 0.78, 0.06]]) {
    g.beginPath();
    g.arc(x * s, y * s, r * s, 0, Math.PI * 2);
    g.fill();
  }
});

/** A round dome bug (ladybug, beetle, the golden one). */
function domeBug(parts: BugParts, d: Detail, shell: THREE.Material, headColor: string, iris?: string) {
  const body = parts.body;
  const dome = ball(d, shell, 0.62, 0, 0.5, -0.32, 1, 0.82, 1.08);
  body.add(dome);
  if (d === 'high') {
    // The line between the wing cases.
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.018, 6, 48, Math.PI), mat('#2b1840', { rim: 0 }));
    seam.rotation.set(0, Math.PI / 2, 0);
    seam.position.set(0, 0.5, -0.32);
    seam.scale.set(1.08, 0.82, 1);
    seam.userData.noOutline = true;
    body.add(seam);
    body.add(ball(d, mat('#ffffff', { rim: 0, rough: 0.6 }), 0.42, 0, 0.18, -0.25, 1, 0.3, 1.1));
  }
  const head = new THREE.Group();
  head.position.set(0, 0.62, 0.42);
  body.add(head);
  head.add(ball(d, mat(headColor, { rough: 0.3, clearcoat: 0.8 }), 0.52));
  face(parts, head, d, 0.52, { iris });
  antennae(head, d, mat('#2b1840', { rough: 0.4 }), mat('#ff8fb3', { clearcoat: 1, rough: 0.2 }), 0.52, 0.5, true);
  legs(parts, body, d, mat('#2b1840', { rough: 0.4 }), 0.26, [0.05, -0.3, -0.62], 0.45, 0.3);
}

function ant(parts: BugParts, d: Detail) {
  const body = parts.body;
  const skin = mat('#ff9466', { rough: 0.3, clearcoat: 0.8 });
  body.add(ball(d, skin, 0.42, 0, 0.5, -0.62, 1, 0.92, 1.1));
  body.add(ball(d, skin, 0.24, 0, 0.48, -0.12));
  const head = new THREE.Group();
  head.position.set(0, 0.72, 0.38);
  body.add(head);
  head.add(ball(d, skin, 0.55));
  face(parts, head, d, 0.55);
  antennae(head, d, mat('#8a3a2a', { rough: 0.4 }), mat('#ffd166', { clearcoat: 1 }), 0.55, 0.65);
  legs(parts, body, d, mat('#8a3a2a', { rough: 0.4 }), 0.42, [0.05, -0.15, -0.35], 0.2, 0.55);
}

function snail(parts: BugParts, d: Detail) {
  const body = parts.body;
  const skin = mat('#b8f0a6', { rough: 0.15, clearcoat: 1 });
  body.add(ball(d, skin, 1, 0, 0.2, 0.05, 0.42, 0.22, 1.02));
  const shell = ball(d, mat('#ffffff', { map: shellTex, rough: 0.2, clearcoat: 1 }), 0.62, 0, 0.72, -0.3, 0.55, 0.95, 0.95);
  shell.rotation.y = Math.PI / 2;
  body.add(shell);
  const head = new THREE.Group();
  head.position.set(0, 0.52, 0.72);
  body.add(head);
  head.add(ball(d, skin, 0.45));
  face(parts, head, d, 0.45, { eye: 0.33 });
  antennae(head, d, skin, mat('#ff8fb3', { clearcoat: 1 }), 0.45, 0.75);
}

function winged(parts: BugParts, d: Detail, kind: 'butterfly' | 'fly') {
  const body = parts.body;
  const fly = kind === 'fly';
  const skin = mat(fly ? '#8fa4d8' : '#b49cff', { rough: 0.55, sheen: 1 });
  body.add(ball(d, skin, fly ? 0.45 : 0.24, 0, 0, -0.32, 1, 0.95, fly ? 1 : 1.9));
  if (fly && d === 'high') {
    // A fluffy collar.
    body.add(ball(d, mat('#ffffff', { sheen: 1, rough: 0.9 }), 0.3, 0, 0.05, 0.02, 1.3, 0.6, 0.8));
  }
  const head = new THREE.Group();
  head.position.set(0, 0.12, 0.3);
  body.add(head);
  head.add(ball(d, skin, 0.46));
  face(parts, head, d, 0.46, { eye: fly ? 0.38 : 0.31, iris: fly ? '#5a1838' : undefined });
  antennae(head, d, mat('#4a3a6a'), mat('#ffd166', { clearcoat: 1 }), 0.46, fly ? 0.4 : 0.7, !fly);
  const wm = fly
    ? mat('#e8f6ff', { transparent: 0.45, double: true, rough: 0.1, iridescence: 1, rim: 0 })
    : mat('#ffffff', { map: wingTex, double: true, rim: 0.2, sheen: 0.6 });
  if (!fly) wm.alphaTest = 0.5;
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.12, 0.22, -0.3);
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wm);
    w.rotation.x = -Math.PI / 2;
    w.position.set(s * 0.6, 0, fly ? -0.15 : 0);
    w.scale.set((fly ? 0.75 : 1.25) * (fly ? 1 : s), fly ? 0.5 : 1.35, 1);
    w.userData.noOutline = true;
    pivot.add(w);
    pivot.userData.side = s;
    body.add(pivot);
    parts.wings.push(pivot);
  }
  if (fly) legs(parts, body, d, mat('#4a3a6a'), -0.28, [0, -0.3], 0.22, 0.3);
}

/** A crown with gems and a little red cape, for kings. */
function regalia(body: THREE.Group, d: Detail, headY: number, headZ: number, headR: number) {
  const gold = mat('#ffd34d', { metal: 0.8, rough: 0.2, clearcoat: 1 });
  const crown = new THREE.Group();
  crown.position.set(0, headY + headR * 0.72, headZ - 0.08);
  crown.rotation.x = -0.2;
  crown.add(new THREE.Mesh(new THREE.CylinderGeometry(headR * 0.62, headR * 0.58, headR * 0.36, d === 'high' ? 32 : 12, 1, false), gold));
  const gems = ['#ff4d8d', '#4dd0ff', '#7dff8a'];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(headR * 0.13, headR * 0.32, 8), gold);
    spike.position.set(Math.sin(a) * headR * 0.55, headR * 0.28, Math.cos(a) * headR * 0.55);
    crown.add(spike);
    crown.add(ball(d, gold, headR * 0.07, spike.position.x, spike.position.y + headR * 0.17, spike.position.z));
    if (d === 'high') crown.add(ball(d, mat(gems[i % 3], { clearcoat: 1, rough: 0.05, emissive: 0.3 }), headR * 0.07, Math.sin(a) * headR * 0.6, 0, Math.cos(a) * headR * 0.6));
  }
  crown.traverse((o) => (o.castShadow = true));
  body.add(crown);
  const cape = new THREE.Mesh(
    new THREE.SphereGeometry(0.75, d === 'high' ? 24 : 10, 12, Math.PI * 0.6, Math.PI * 0.8, 0.35, 1.5),
    mat('#d6284f', { double: true, sheen: 1, rough: 0.7 }),
  );
  cape.position.set(0, 0.55, -0.35);
  cape.castShadow = true;
  body.add(cape);
  if (d === 'high') {
    const fur = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.08, 10, 24), mat('#ffffff', { sheen: 1, rough: 0.9 }));
    fur.rotation.x = Math.PI / 2;
    fur.position.set(0, 0.85, -0.1);
    body.add(fur);
  }
}

function build(kind: BugKind, d: Detail, boss?: BossDef): BugParts {
  const parts = newParts();
  const look = boss?.look ?? kind;
  switch (look) {
    case 'ladybug':
      domeBug(parts, d, mat('#ffffff', { map: ladyTex, rough: 0.15, clearcoat: 1 }), '#ffd9c7');
      break;
    case 'beetle':
      domeBug(parts, d, mat('#ffffff', { map: beetleTex, rough: 0.15, clearcoat: 1, metal: 0.2 }), '#d8ffe9');
      break;
    case 'golden':
      domeBug(parts, d, mat('#ffffff', { map: goldTex, rough: 0.12, clearcoat: 1, metal: 0.6, emissive: 0.2 }), '#fff1c2', '#5a3200');
      break;
    case 'ant':
      ant(parts, d);
      break;
    case 'snail':
      snail(parts, d);
      break;
    default:
      winged(parts, d, look as 'butterfly' | 'fly');
  }
  if (boss) regalia(parts.body, d, 0.7, 0.4, 0.55);
  if (kind === 'golden' && !boss) {
    // A tiny tiara: the golden one is royalty too.
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 5), mat('#fff3a8', { emissive: 1.2, rim: 0 }));
    t.position.set(0, 1.25, 0.4);
    parts.body.add(t);
  }
  return parts;
}

function dizzyStars(y: number): THREE.Group {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.45 : 1;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 });
  geo.center();
  const g = new THREE.Group();
  g.position.y = y;
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(geo, mat('#ffd23f', { emissive: 1.4, clearcoat: 1 }));
    const a = (i / 3) * Math.PI * 2;
    m.position.set(Math.cos(a) * 0.65, 0, Math.sin(a) * 0.65);
    m.scale.setScalar(0.17);
    g.add(m);
  }
  g.visible = false;
  return g;
}

export function bugModel(kind: BugKind, boss?: BossDef): BugModel {
  const root = new THREE.Group();
  const lod = new THREE.LOD();
  root.add(lod);
  const parts: BugParts[] = [];
  for (const d of ['high', 'low'] as Detail[]) {
    const p = build(kind, d, boss);
    const holder = new THREE.Group();
    holder.add(p.body);
    if (d === 'high') outline(holder, 0.02);
    // Bigger bugs (kings) keep their detail from further away.
    lod.addLevel(holder, d === 'high' ? 0 : LOD_DISTANCE * (boss ? 1.6 : 1));
    parts.push(p);
  }
  const stars = dizzyStars(boss ? 1.9 : 1.5);
  root.add(stars);
  let bubble: THREE.Mesh | undefined;
  if (boss) {
    bubble = new THREE.Mesh(spheres.high, mat('#bfe9ff', { transparent: 0.28, iridescence: 1, rough: 0.05, rim: 0, double: true }));
    bubble.scale.setScalar(1.25);
    bubble.position.y = 0.6;
    bubble.visible = false;
    root.add(bubble);
  }
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.noOutline) o.castShadow = true;
  });
  return { root, parts, stars, bubble };
}

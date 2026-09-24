/**
 * Sukkah Village in 3D: builds the scene from the layout, moves the player, follows them with the camera
 * and shows whatever the game state asks for (quest items, hunt etrogim, decorations). Game rules live in
 * src/game; main.ts connects the two.
 */
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { Hunt, Vec } from '../game/hunt';
import { type StringKey, t } from '../i18n';
import { type Avatar, decoration, type Placed, SPECIES, type SpeciesId } from '../game/progress';
import {
  ABRAHAM,
  GARDEN,
  GRAND_SUKKAH,
  HOUSES,
  HUB,
  MY_SUKKAH,
  PALMS,
  PLAZA,
  resolve,
  RIVAL_HOME,
  SPAWN,
  SPECIES_SPOTS,
  TREES,
  WELL,
  WORLD_RADIUS,
} from './layout';
import {
  abraham,
  animateWalk,
  bush,
  type Character,
  character,
  decorationModel,
  house,
  marker,
  mat,
  palm,
  portal,

  sheep,
  species,
  sukkah,
  SUKKAH_HEIGHT,
  type SukkahModel,
  tree,
} from './models';

export type CameraMode = 'walk' | 'creator' | 'build';

export const WALK_SPEED = 5.2;
const SKY = '#a9dcf7';

interface Walker {
  char: Character;
  pos: Vec;
  heading: number;
  phase: number;
  speed: number;
}

interface Burst {
  points: THREE.Points;
  velocities: Float32Array;
  age: number;
}

export type SukkahPick = { kind: 'floor'; x: number; z: number } | { kind: 'item'; index: number };

export class World {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  private renderer: THREE.WebGLRenderer;
  private labels = new CSS2DRenderer();
  private sun = new THREE.DirectionalLight('#fff4de', 2.2);
  private clock = new THREE.Clock();
  private raycaster = new THREE.Raycaster();

  readonly player: Walker;
  private rival: Walker;
  private abraham: Character;
  private abrahamTag: HTMLDivElement;
  private speciesItems = new Map<SpeciesId, THREE.Group>();
  private mySukkah: SukkahModel;
  private decorations = new THREE.Group();
  private selection = marker('#ffd166', 0.6);
  private huntEtrogs: THREE.Group[] = [];
  private huntGroup = new THREE.Group();
  private hubRing: THREE.Mesh;
  private bursts: Burst[] = [];

  mode: CameraMode = 'walk';
  private camTarget = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    host.append(this.renderer.domElement);
    this.labels.domElement.className = 'labels';
    host.append(this.labels.domElement);

    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 40, 85);
    this.scene.add(new THREE.HemisphereLight('#dff3ff', '#6a8f4e', 1.4));
    this.sun.position.set(-12, 22, 10);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -22;
    sc.right = sc.top = 22;
    sc.near = 1;
    sc.far = 70;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target);

    this.buildGround();
    this.buildVillage();
    this.mySukkah = this.buildMySukkah();
    this.buildGarden();
    const hub = portal();
    hub.group.position.set(HUB.x, 0, HUB.z);
    this.hubRing = hub.ring;
    this.scene.add(hub.group);
    this.label('etrogHunt', HUB.x, 5.6, HUB.z, 'zone');

    this.abraham = abraham();
    this.abraham.group.position.set(ABRAHAM.x, 0, ABRAHAM.z);
    this.abraham.group.rotation.y = -0.6;
    this.scene.add(this.abraham.group);
    this.abrahamTag = this.label('abraham', 0, 2.5, 0, 'npc', this.abraham.group);

    this.player = this.walker(character({ shirt: '#2a9d8f', skin: '#f1c7a0', hat: 'kippah' }), SPAWN, WALK_SPEED);
    this.player.heading = Math.PI;
    this.rival = this.walker(sheep(), RIVAL_HOME, 0);
    this.label('rival', 0, 1.8, 0, 'npc', this.rival.char.group);

    this.selection.visible = false;
    this.mySukkah.group.add(this.decorations, this.selection);
    this.scene.add(this.huntGroup);

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.snapCamera();
  }

  // --- Scene building ---------------------------------------------------------------------------

  /** Zone and character names floating above the scene. */
  private label(key: StringKey, x: number, y: number, z: number, kind: 'zone' | 'npc', parent: THREE.Object3D = this.scene): HTMLDivElement {
    const el = document.createElement('div');
    el.className = `label ${kind}`;
    el.textContent = t(key);
    const obj = new CSS2DObject(el);
    obj.position.set(x, y, z);
    parent.add(obj);
    return el;
  }

  private walker(char: Character, at: Vec, speed: number): Walker {
    char.group.position.set(at.x, 0, at.z);
    this.scene.add(char.group);
    return { char, pos: { ...at }, heading: 0, phase: 0, speed };
  }

  private buildGround() {
    const grass = new THREE.Mesh(new THREE.CircleGeometry(90, 48), mat('#8cc56a'));
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    this.scene.add(grass);

    const flat = (geo: THREE.BufferGeometry, color: string, x: number, z: number, y = 0.01, rot = 0) => {
      const m = new THREE.Mesh(geo, mat(color));
      m.rotation.set(-Math.PI / 2, 0, rot);
      m.position.set(x, y, z);
      m.receiveShadow = true;
      this.scene.add(m);
      return m;
    };
    flat(new THREE.CircleGeometry(PLAZA.r, 40), '#e6d3a8', PLAZA.x, PLAZA.z, 0.02);
    flat(new THREE.RingGeometry(PLAZA.r - 0.4, PLAZA.r, 40), '#c9ae78', PLAZA.x, PLAZA.z, 0.025);
    const path = '#e0cc9c';
    flat(new THREE.PlaneGeometry(3, 12), path, 0, -9);
    flat(new THREE.PlaneGeometry(3, 14), path, 0, 12);
    flat(new THREE.PlaneGeometry(9, 3), path, -10, 1);
    flat(new THREE.PlaneGeometry(10, 3), path, 10.5, 1);
    // The edge of the village: a ring of low hills.
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const r = WORLD_RADIUS + 5 + (i % 3) * 3;
      const hill = new THREE.Mesh(new THREE.ConeGeometry(6 + (i % 4) * 2, 5 + (i % 5) * 2, 7), mat(i % 2 ? '#79b25a' : '#6aa04f'));
      hill.position.set(Math.cos(a) * r, 1.5, Math.sin(a) * r);
      this.scene.add(hill);
    }
    // The well in the middle of the plaza.
    const well = new THREE.Group();
    well.add(new THREE.Mesh(new THREE.CylinderGeometry(WELL.r, WELL.r + 0.1, 0.7, 14), mat('#b9a07a')));
    well.children[0].position.y = 0.35;
    const water = new THREE.Mesh(new THREE.CircleGeometry(WELL.r - 0.15, 14), mat('#4aa3df', 0.2));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.66;
    well.add(water);
    well.position.set(WELL.x, 0, WELL.z);
    well.traverse((o) => (o.castShadow = o.receiveShadow = true));
    this.scene.add(well);
    this.label('plaza', 0, 2.2, 0, 'zone');
  }

  private buildVillage() {
    PALMS.forEach((p, i) => {
      const m = palm(i);
      m.position.set(p.x, 0, p.z);
      this.scene.add(m);
    });
    TREES.forEach((p, i) => {
      const m = tree(i);
      m.position.set(p.x, 0, p.z);
      this.scene.add(m);
    });
    for (const h of HOUSES) {
      const m = house(h.color);
      m.position.set(h.x, 0, h.z);
      // Houses face the plaza.
      m.rotation.y = Math.atan2(-h.x, -h.z) + h.rot * 0.2;
      this.scene.add(m);
    }

    const grand = sukkah(GRAND_SUKKAH, ['#fdf6e3', '#fdf6e3', '#3a7bd5']);
    grand.group.position.set(GRAND_SUKKAH.x, 0, GRAND_SUKKAH.z);
    // The guests' table: seven chairs, one for each of the Ushpizin.
    const table = decorationModel('table');
    table.scale.set(5.5, 1, 1.4);
    table.position.set(0, 0, -1);
    grand.group.add(table);
    for (let i = 0; i < 7; i++) {
      const chair = decorationModel('chair');
      const x = -3 + i;
      chair.position.set(x, 0, i % 2 ? -0.1 : -1.9);
      chair.rotation.y = i % 2 ? Math.PI : 0;
      grand.group.add(chair);
    }
    for (let i = 0; i < 4; i++) {
      const chain = decorationModel('chain');
      chain.position.set(-4.5 + i * 3, SUKKAH_HEIGHT, -2.5 + (i % 2) * 2);
      grand.group.add(chain);
      const lantern = decorationModel('lantern');
      lantern.position.set(-4.5 + i * 3, SUKKAH_HEIGHT, 1.8);
      grand.group.add(lantern);
    }
    this.scene.add(grand.group);
    this.label('grandSukkah', GRAND_SUKKAH.x, SUKKAH_HEIGHT + 1.4, GRAND_SUKKAH.z, 'zone');
  }

  private buildMySukkah(): SukkahModel {
    const s = sukkah(MY_SUKKAH, ['#fffaf0', '#f4a261']);
    s.group.position.set(MY_SUKKAH.x, 0, MY_SUKKAH.z);
    this.scene.add(s.group);
    this.label('mySukkah', MY_SUKKAH.x, SUKKAH_HEIGHT + 1.3, MY_SUKKAH.z, 'zone');
    return s;
  }

  private buildGarden() {
    const hw = GARDEN.w / 2;
    const hd = GARDEN.d / 2;
    const soil = new THREE.Mesh(new THREE.PlaneGeometry(GARDEN.w - 1, GARDEN.d - 1), mat('#9b7653'));
    soil.rotation.x = -Math.PI / 2;
    soil.position.set(GARDEN.x, 0.015, GARDEN.z);
    soil.receiveShadow = true;
    this.scene.add(soil);
    // A low hedge all around, with an opening towards the plaza.
    for (let t = -hw; t <= hw; t += 1.2) {
      for (const [x, z] of [
        [GARDEN.x + t, GARDEN.z - hd],
        [GARDEN.x + t, GARDEN.z + hd],
        [GARDEN.x - hw, GARDEN.z + t],
        [GARDEN.x + hw, GARDEN.z + t],
      ]) {
        if (x === GARDEN.x + hw && Math.abs(z - GARDEN.z) < 2) continue;
        const b = bush('#4f8f3f', 0.7);
        b.position.x = x;
        b.position.z = z;
        this.scene.add(b);
      }
    }
    // Plants that hint at each species.
    const plant = (x: number, z: number, color: string, scale: number) => {
      const b = bush(color, scale);
      b.position.x = x;
      b.position.z = z;
      this.scene.add(b);
    };
    plant(-23, -4.5, '#3f8a44', 1.6);
    plant(-23, 6.2, '#2f6b2f', 1.1);
    plant(-13.2, 6.5, '#8fc46a', 1.1);
    const lulavPalm = palm(3);
    lulavPalm.scale.setScalar(0.6);
    lulavPalm.position.set(-13, 0, -4.8);
    this.scene.add(lulavPalm);
    this.label('garden', GARDEN.x, 3.2, GARDEN.z - hd + 0.5, 'zone');

    for (const id of SPECIES) {
      const item = new THREE.Group();
      const model = species(id);
      model.scale.setScalar(1.4);
      model.position.y = 1.1;
      item.add(model, marker('#ffd166', 0.7));
      item.position.set(SPECIES_SPOTS[id].x, 0, SPECIES_SPOTS[id].z);
      item.visible = false;
      this.scene.add(item);
      this.speciesItems.set(id, item);
    }
  }

  // --- State from the game ----------------------------------------------------------------------

  setAvatar(a: Avatar) {
    const next = character(a);
    const { group } = this.player.char;
    next.group.position.copy(group.position);
    next.group.rotation.copy(group.rotation);
    this.scene.remove(group);
    this.scene.add(next.group);
    this.player.char = next;
  }

  /** Shows the species still to be collected while the quest is on. */
  setSpecies(active: boolean, found: SpeciesId[]) {
    for (const [id, item] of this.speciesItems) item.visible = active && !found.includes(id);
  }

  /** The marker above Abraham: '!' when he has something to say, '' otherwise. */
  setAbrahamMark(mark: '' | '!' | '?') {
    this.abrahamTag.dataset.mark = mark;
  }

  setDecorations(placed: Placed[], selected = -1) {
    this.decorations.clear();
    placed.forEach((p, i) => {
      const m = decorationModel(p.id);
      m.position.set(p.x, decoration(p.id).mount === 'ceiling' ? SUKKAH_HEIGHT : 0.08, p.z);
      m.rotation.y = p.rot;
      m.userData.index = i;
      m.traverse((o) => (o.userData.index = i));
      this.decorations.add(m);
    });
    const sel = placed[selected];
    this.selection.visible = !!sel;
    if (sel) this.selection.position.set(sel.x, 0.1, sel.z);
  }

  setMode(mode: CameraMode) {
    this.mode = mode;
    this.mySukkah.roof.visible = mode !== 'build';
    this.labels.domElement.classList.toggle('hidden', mode === 'creator');
    // While decorating the camera looks down into the sukkah; the player would only be in the way.
    this.player.char.group.visible = mode !== 'build';
  }

  // --- Etrog hunt -------------------------------------------------------------------------------

  startHunt(h: Hunt) {
    this.endHunt();
    this.huntEtrogs = h.etrogs.map((e) => {
      const g = new THREE.Group();
      const model = species('etrog');
      model.scale.setScalar(1.8);
      model.position.y = 0.9;
      g.add(model, marker('#ffe066', 0.6));
      g.position.set(e.x, 0, e.z);
      this.huntGroup.add(g);
      return g;
    });
    this.rival.pos = { x: h.rival.x, z: h.rival.z };
  }

  syncHunt(h: Hunt) {
    h.etrogs.forEach((e, i) => (this.huntEtrogs[i].visible = !e.takenBy));
    const moved = Math.hypot(h.rival.x - this.rival.pos.x, h.rival.z - this.rival.pos.z);
    this.rival.pos = { x: h.rival.x, z: h.rival.z };
    this.rival.heading = h.rival.heading;
    this.rival.phase += moved * 3;
    animateWalk(this.rival.char, this.rival.phase, moved > 0 ? 1 : 0);
  }

  endHunt() {
    this.huntGroup.clear();
    this.huntEtrogs = [];
  }

  rivalPosition(): Vec {
    return { ...this.rival.pos };
  }

  // --- Frame update -----------------------------------------------------------------------------

  /** Moves the player by an input vector (x right, y away from the camera). Returns the distance walked. */
  walk(dt: number, input: [number, number]): number {
    const p = this.player;
    const [ix, iy] = input;
    const amount = Math.hypot(ix, iy);
    if (amount < 0.05) {
      animateWalk(p.char, p.phase, 0);
      return 0;
    }
    const want = resolve({ x: p.pos.x + ix * p.speed * dt, z: p.pos.z - iy * p.speed * dt });
    const moved = Math.hypot(want.x - p.pos.x, want.z - p.pos.z);
    p.pos = want;
    p.heading = Math.atan2(ix, -iy);
    p.phase += moved * 2.4;
    animateWalk(p.char, p.phase, Math.min(1, amount * 1.3));
    return moved;
  }

  /** Puts the player somewhere (and turns them to face `heading`). */
  teleport(at: Vec, heading = Math.PI) {
    this.player.pos = { ...at };
    this.player.heading = heading;
    this.snapCamera();
  }

  /** Advances animations and draws one frame. Returns the seconds since the last frame. */
  frame(): number {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    const still = this.reducedMotion.matches;

    for (const w of [this.player, this.rival]) {
      const g = w.char.group;
      g.position.set(w.pos.x, 0, w.pos.z);
      g.rotation.y = turnTowards(g.rotation.y, w.heading, dt * 12);
    }

    // Abraham turns to whoever comes near.
    const d = Math.hypot(this.player.pos.x - ABRAHAM.x, this.player.pos.z - ABRAHAM.z);
    const face = d < 6 ? Math.atan2(this.player.pos.x - ABRAHAM.x, this.player.pos.z - ABRAHAM.z) : -0.6;
    this.abraham.group.rotation.y = turnTowards(this.abraham.group.rotation.y, face, dt * 4);
    if (!still) this.abraham.limbs.armL.rotation.z = Math.sin(t * 1.5) * 0.08;

    if (!still) {
      for (const item of this.speciesItems.values()) {
        item.children[0].rotation.y = t * 1.5;
        item.children[0].position.y = 1.1 + Math.sin(t * 2.5) * 0.12;
      }
      this.huntEtrogs.forEach((g, i) => {
        g.children[0].rotation.y = t * 2 + i;
        g.children[0].position.y = 0.9 + Math.sin(t * 3 + i) * 0.1;
      });
      (this.hubRing.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(t * 2) * 0.12;
    }

    if (!this.huntEtrogs.length) this.idleRival(t, dt);
    this.updateBursts(dt);
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
    return dt;
  }

  /** Between hunts, Shoshi the sheep grazes around the Game Hub. */
  private idleRival(t: number, dt: number) {
    const r = this.rival;
    const target = { x: RIVAL_HOME.x + Math.sin(t * 0.25) * 2.5, z: RIVAL_HOME.z + Math.cos(t * 0.18) * 1.5 };
    const dx = target.x - r.pos.x;
    const dz = target.z - r.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.3) {
      const step = Math.min(dist, 1.4 * dt);
      r.pos = resolve({ x: r.pos.x + (dx / dist) * step, z: r.pos.z + (dz / dist) * step });
      r.heading = Math.atan2(dx, dz);
      r.phase += step * 3;
    }
    animateWalk(r.char, r.phase, dist > 0.3 ? 1 : 0);
  }

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 60 : 48;
    this.camera.updateProjectionMatrix();
  }

  private cameraGoal(): { pos: THREE.Vector3; look: THREE.Vector3 } {
    const portrait = this.camera.aspect < 1;
    const p = this.player.pos;
    if (this.mode === 'creator') {
      const h = this.player.heading;
      const dist = portrait ? 6 : 4;
      return {
        pos: new THREE.Vector3(p.x + Math.sin(h) * dist, portrait ? 1.3 : 1.5, p.z + Math.cos(h) * dist),
        // On a phone the creator panel covers the bottom half, so aim below the feet to lift the character up.
        look: new THREE.Vector3(p.x, portrait ? -1.2 : 1, p.z),
      };
    }
    if (this.mode === 'build') {
      const s = MY_SUKKAH;
      return {
        pos: new THREE.Vector3(s.x, portrait ? 13 : 9, s.z + (portrait ? 3.5 : 4.5)),
        look: new THREE.Vector3(s.x, 0, s.z + (portrait ? 1 : 0.3)),
      };
    }
    const back = portrait ? 12 : 10.5;
    const up = portrait ? 12 : 8.5;
    return { pos: new THREE.Vector3(p.x, up, p.z + back), look: new THREE.Vector3(p.x, 1, p.z - 1.5) };
  }

  private updateCamera(dt: number) {
    const goal = this.cameraGoal();
    const k = 1 - Math.exp(-dt * 6);
    this.camPos.lerp(goal.pos, k);
    this.camTarget.lerp(goal.look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
    // The sun's shadow box follows the player so shadows stay sharp everywhere in the village.
    this.sun.position.set(this.camTarget.x - 12, 22, this.camTarget.z + 10);
    this.sun.target.position.copy(this.camTarget);
  }

  snapCamera() {
    const goal = this.cameraGoal();
    this.camPos.copy(goal.pos);
    this.camTarget.copy(goal.look);
  }

  // --- Picking ----------------------------------------------------------------------------------

  /** What's under a tap inside my sukkah: a placed decoration, or a spot on the floor (local metres). */
  pickInSukkah(clientX: number, clientY: number): SukkahPick | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hitItem = this.raycaster.intersectObjects(this.decorations.children, true)[0];
    if (hitItem) return { kind: 'item', index: hitItem.object.userData.index as number };
    const hitFloor = this.raycaster.intersectObject(this.mySukkah.floor)[0];
    if (!hitFloor) return null;
    const local = this.mySukkah.group.worldToLocal(hitFloor.point.clone());
    return { kind: 'floor', x: round(local.x), z: round(local.z) };
  }

  // --- Effects ----------------------------------------------------------------------------------

  /** A small burst of coloured sparkles, e.g. when something is collected. */
  sparkle(at: Vec, color = '#ffd166', height = 1) {
    if (this.reducedMotion.matches) return;
    const n = 36;
    const positions = new Float32Array(n * 3);
    const velocities = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      positions.set([at.x, height, at.z], i * 3);
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 2.5;
      velocities.set([Math.cos(a) * s, 2 + Math.random() * 3, Math.sin(a) * s], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.22, transparent: true }));
    this.scene.add(points);
    this.bursts.push({ points, velocities, age: 0 });
  }

  private updateBursts(dt: number) {
    this.bursts = this.bursts.filter((b) => {
      b.age += dt;
      const pos = b.points.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        b.velocities[i * 3 + 1] -= 9 * dt;
        pos.setXYZ(i, pos.getX(i) + b.velocities[i * 3] * dt, pos.getY(i) + b.velocities[i * 3 + 1] * dt, pos.getZ(i) + b.velocities[i * 3 + 2] * dt);
      }
      pos.needsUpdate = true;
      (b.points.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - b.age / 1.2);
      if (b.age < 1.2) return true;
      this.scene.remove(b.points);
      b.points.geometry.dispose();
      (b.points.material as THREE.Material).dispose();
      return false;
    });
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }
}

const round = (v: number) => Math.round(v * 4) / 4;

/** Rotates angle `from` towards `to` along the shorter way, by at most `rate` (0..1 of the gap). */
function turnTowards(from: number, to: number, rate: number): number {
  let diff = to - from;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return from + diff * Math.min(1, rate);
}

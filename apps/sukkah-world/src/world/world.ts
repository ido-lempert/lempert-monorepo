/**
 * Sukkah Village in 3D: builds the scene from the layout, moves the player, follows them with the camera
 * and shows whatever the game state asks for (quest items, hunt etrogim, decorations). Game rules live in
 * src/game; main.ts connects the two.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Hunt, Vec } from '../game/hunt';
import { type Avatar, decoration, type Placed, SPECIES, type SpeciesId } from '../game/progress';
import { type StringKey, t } from '../i18n';
import {
  ABRAHAM,
  GARDEN,
  GRAND_SUKKAH,
  HOUSES,
  HUB,
  inside,
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
import { cloud, HORIZON, initialQuality, mat, type Quality, setWindTime, skyDome, sparkleTexture, swayMat, tileTexture, wingTexture } from './look';
import {
  abraham,
  animateWalk,
  bush,
  type Character,
  character,
  decorationModel,
  flowerPot,
  hill,
  house,
  marker,
  palm,
  portal,
  sheep,
  species,
  stringLights,
  sukkah,
  SUKKAH_HEIGHT,
  type SukkahModel,
  tree,
} from './models';

export type CameraMode = 'walk' | 'creator' | 'build';

export const WALK_SPEED = 5.2;
/** Height of a sukkah's floor; characters step up onto it. */
const FLOOR_Y = 0.09;

interface Walker {
  char: Character;
  pos: Vec;
  heading: number;
  phase: number;
  speed: number;
  /** 0..1 how much it is walking this frame (for the animation). */
  moving: number;
}

interface Burst {
  points: THREE.Points;
  velocities: Float32Array;
  age: number;
}

interface Butterfly {
  group: THREE.Group;
  wings: [THREE.Mesh, THREE.Mesh];
  home: Vec;
  seed: number;
}

export type SukkahPick = { kind: 'floor'; x: number; z: number } | { kind: 'item'; index: number };

/** Deterministic random numbers, so the grass looks the same on every visit. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class World {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private labels = new CSS2DRenderer();
  private sun = new THREE.DirectionalLight('#fff1d6', 2);
  private timer = new THREE.Timer();
  private raycaster = new THREE.Raycaster();
  quality: Quality = initialQuality();
  private slowFrames = 0;

  readonly player: Walker;
  private rival: Walker;
  private abraham: Character;
  private abrahamTag: HTMLDivElement;
  private speciesItems = new Map<SpeciesId, THREE.Group>();
  private mySukkah: SukkahModel;
  private decorations = new THREE.Group();
  private selection = marker('#ffd23f', 0.6);
  private huntEtrogs: THREE.Group[] = [];
  private huntGroup = new THREE.Group();
  private hubDisc: THREE.Mesh;
  private clouds: THREE.Group[] = [];
  private butterflies: Butterfly[] = [];
  private water!: THREE.Mesh;
  private bursts: Burst[] = [];
  private hop = 0;
  /** Big things (houses, trees, palms) that turn see-through when they hide the player. */
  private occluders: THREE.Object3D[] = [];
  private faded = new Set<THREE.Object3D>();

  mode: CameraMode = 'walk';
  private creatorAngle = 0;
  private camTarget = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Neutral keeps the bright toy colours saturated (ACES washes them out).
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    host.append(this.renderer.domElement);
    this.labels.domElement.className = 'labels';
    host.append(this.labels.domElement);

    // Post-processing: multisampled render → bloom → tone mapping. The bloom threshold sits above anything
    // sunlit, so only real light sources (bulbs, lanterns, sparkles; emissive ≥ ~5) glow.
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.5, 2.6);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    this.scene.background = new THREE.Color(HORIZON);
    this.scene.fog = new THREE.Fog(HORIZON, 45, 120);
    this.scene.add(skyDome());
    this.scene.add(new THREE.HemisphereLight('#e4f4ff', '#7fb55a', 1));
    this.sun.position.set(-12, 22, 10);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -22;
    sc.right = sc.top = 22;
    sc.near = 1;
    sc.far = 70;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 4;
    this.scene.add(this.sun, this.sun.target);

    this.buildGround();
    this.buildNature();
    this.buildVillage();
    this.mySukkah = this.buildMySukkah();
    this.buildGarden();
    const hub = portal();
    hub.group.position.set(HUB.x, 0, HUB.z);
    this.hubDisc = hub.disc;
    this.scene.add(hub.group);
    this.label('etrogHunt', HUB.x, 5.3, HUB.z, 'zone');

    this.abraham = abraham();
    this.abraham.group.position.set(ABRAHAM.x, 0, ABRAHAM.z);
    this.abraham.group.rotation.y = -0.6;
    this.scene.add(this.abraham.group);
    this.abrahamTag = this.label('abraham', 0, 2.35, 0, 'npc', this.abraham.group);

    this.player = this.walker(character({ name: '', shirt: '#2a9d8f', skin: '#f1c7a0', hat: 'kippah' }), SPAWN, WALK_SPEED);
    this.player.heading = Math.PI;
    this.rival = this.walker(sheep(), RIVAL_HOME, 0);
    this.label('rival', 0, 1.75, 0, 'npc', this.rival.char.group);

    this.selection.visible = false;
    this.mySukkah.group.add(this.decorations, this.selection);
    this.scene.add(this.huntGroup);

    this.applyQuality();
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
    return { char, pos: { ...at }, heading: 0, phase: 0, speed, moving: 0 };
  }

  private add<T extends THREE.Object3D>(o: T, x: number, z: number, y = 0): T {
    o.position.set(x, y, z);
    this.scene.add(o);
    return o;
  }

  private buildGround() {
    // Grass with gentle patches of lighter and darker green.
    const geo = new THREE.PlaneGeometry(240, 240, 120, 120);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const light = new THREE.Color('#9fd66e');
    const dark = new THREE.Color('#6fb44f');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const n = Math.sin(x * 0.18) * Math.cos(z * 0.21) * 0.5 + Math.sin(x * 0.05 + z * 0.07) * 0.5;
      c.copy(dark).lerp(light, n * 0.5 + 0.5);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const grass = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    grass.receiveShadow = true;
    this.scene.add(grass);

    const flat = (g: THREE.BufferGeometry, material: THREE.Material, x: number, z: number, y: number) => {
      const m = new THREE.Mesh(g, material);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y, z);
      m.receiveShadow = true;
      this.scene.add(m);
      return m;
    };
    const tiles = tileTexture();
    tiles.repeat.set(4, 4);
    flat(new THREE.CircleGeometry(PLAZA.r, 64), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.85 }), PLAZA.x, PLAZA.z, 0.02);
    flat(new THREE.RingGeometry(PLAZA.r - 0.1, PLAZA.r + 0.35, 64), mat('#d4b27a'), PLAZA.x, PLAZA.z, 0.025);
    const path = mat('#ecd9ae', { rim: 0 });
    const pathEdge = mat('#d7bd88', { rim: 0 });
    const strip = (w: number, d: number, x: number, z: number) => {
      flat(new THREE.PlaneGeometry(w + 0.4, d + 0.4), pathEdge, x, z, 0.012);
      flat(new THREE.PlaneGeometry(w, d), path, x, z, 0.015);
    };
    strip(3, 12, 0, -9);
    strip(3, 12.5, 0, 12.5);
    strip(9, 3, -10.5, 1);
    strip(9, 3, 10.5, 1);

    // The fountain in the middle of the plaza.
    const basin = new THREE.LatheGeometry(
      [
        [0, 0],
        [WELL.r + 0.1, 0],
        [WELL.r + 0.15, 0.45],
        [WELL.r - 0.05, 0.55],
        [WELL.r - 0.2, 0.3],
        [0, 0.3],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      40,
    );
    const stone = mat('#e9dcc4');
    const fountain = new THREE.Group();
    fountain.add(new THREE.Mesh(basin, stone));
    this.water = new THREE.Mesh(new THREE.CircleGeometry(WELL.r - 0.15, 40), mat('#3fb6ff', { rough: 0.1, emissive: 0.35, rim: 0 }).clone());
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = 0.45;
    fountain.add(this.water);
    fountain.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.2, 16), stone).translateY(0.9));
    fountain.add(new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), stone).translateY(1.55));
    fountain.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), mat('#7fd6ff', { emissive: 0.8, rough: 0.1, rim: 0 })).translateY(1.62));
    fountain.traverse((o) => (o.castShadow = o.receiveShadow = true));
    this.add(fountain, WELL.x, WELL.z);
    this.label('plaza', 0, 2.5, 0, 'zone');
    for (const [x, z, color] of [
      [4.6, -4.2, '#ff5d73'],
      [-4.6, -4.2, '#ffd23f'],
      [-4.6, 4.8, '#c77dff'],
    ] as const)
      this.add(flowerPot(color), x, z);
  }

  /** Grass tufts and flowers that sway in the wind, a ring of hills, clouds and butterflies. */
  private buildNature() {
    const random = rng(7);
    const open = (x: number, z: number) => {
      if (Math.hypot(x, z) > WORLD_RADIUS + 3) return false;
      if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + 0.8) return false;
      if (Math.abs(x) < 2.2 && z > -16 && z < 19) return false;
      if (Math.abs(z - 1) < 2.2 && Math.abs(x) > 5 && Math.abs(x) < 15.5) return false;
      if (Math.abs(x - GARDEN.x) < GARDEN.w / 2 + 0.6 && Math.abs(z - GARDEN.z) < GARDEN.d / 2 + 0.6) return false;
      if (inside({ x, z }, GRAND_SUKKAH, 0.6) || inside({ x, z }, MY_SUKKAH, 0.6)) return false;
      if (HOUSES.some((h) => Math.hypot(x - h.x, z - h.z) < 3)) return false;
      return Math.hypot(x - HUB.x, z - HUB.z) > 3;
    };
    const spots = (count: number) => {
      const out: THREE.Matrix4[] = [];
      while (out.length < count) {
        const x = (random() - 0.5) * 2 * (WORLD_RADIUS + 3);
        const z = (random() - 0.5) * 2 * (WORLD_RADIUS + 3);
        if (!open(x, z)) continue;
        const s = 0.7 + random() * 0.6;
        out.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, random() * 6.28, 0)), new THREE.Vector3(s, s, s)));
      }
      return out;
    };

    const blades = [0, 1, 2].map((i) => {
      const b = new THREE.ConeGeometry(0.045, 0.36, 3);
      b.translate(0, 0.18, 0);
      b.rotateZ((i - 1) * 0.35);
      b.rotateY(i * 2.1);
      return b;
    });
    const tuft = mergeGeometries(blades)!;
    const grassMatrices = spots(this.quality === 'high' ? 1600 : 700);
    const grass = new THREE.InstancedMesh(tuft, swayMat(null, 0.3), grassMatrices.length);
    const greens = ['#6fbf4a', '#7fcf55', '#5eab40'].map((c) => new THREE.Color(c));
    grassMatrices.forEach((m, i) => {
      grass.setMatrixAt(i, m);
      grass.setColorAt(i, greens[i % 3]);
    });
    grass.receiveShadow = true;
    this.scene.add(grass);

    const flowerMatrices = spots(260);
    const stem = new THREE.CylinderGeometry(0.015, 0.02, 0.32, 4);
    stem.translate(0, 0.16, 0);
    const petals = new THREE.SphereGeometry(0.075, 10, 8);
    petals.scale(1, 0.6, 1);
    petals.translate(0, 0.34, 0);
    const stems = new THREE.InstancedMesh(stem, swayMat('#4f9a3f', 0.3), flowerMatrices.length);
    const heads = new THREE.InstancedMesh(petals, swayMat(null, 0.3), flowerMatrices.length);
    const flowerColors = ['#ff5d73', '#ffd23f', '#ffffff', '#c77dff', '#ff9f1c'].map((c) => new THREE.Color(c));
    flowerMatrices.forEach((m, i) => {
      stems.setMatrixAt(i, m);
      heads.setMatrixAt(i, m);
      heads.setColorAt(i, flowerColors[i % flowerColors.length]);
    });
    this.scene.add(stems, heads);

    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const r = WORLD_RADIUS + 9 + (i % 3) * 4;
      const h = hill(i % 2 ? '#86c95f' : '#76b852', 8 + (i % 4) * 2, 4 + (i % 5) * 1.5);
      this.add(h, Math.cos(a) * r, Math.sin(a) * r);
      if (i % 2 === 0) this.add(tree(i), Math.cos(a + 0.12) * (r - 5), Math.sin(a + 0.12) * (r - 5));
    }

    for (let i = 0; i < 9; i++) {
      const c = cloud(i);
      const a = (i / 9) * Math.PI * 2;
      c.position.set(Math.cos(a) * (45 + (i % 3) * 12), 26 + (i % 4) * 3, Math.sin(a) * (45 + (i % 3) * 12) - 20);
      c.scale.setScalar(1.4 + (i % 3) * 0.4);
      this.clouds.push(c);
      this.scene.add(c);
    }

    const wingColors = ['#ff9f1c', '#c77dff', '#4dd4ff', '#ff5d73', '#ffd23f'];
    const homes: Vec[] = [
      { x: -8, z: 6 },
      { x: 8, z: -6 },
      { x: -18, z: 8 },
      { x: 12, z: 10 },
      { x: -6, z: -12 },
    ];
    homes.forEach((home, i) => {
      const group = new THREE.Group();
      const tex = wingTexture(wingColors[i]);
      const wingMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
      const wing = () => {
        const g = new THREE.PlaneGeometry(0.34, 0.34);
        g.translate(0.17, 0, 0);
        g.rotateX(-Math.PI / 2);
        return new THREE.Mesh(g, wingMat);
      };
      const l = wing();
      const r = wing();
      r.scale.x = -1;
      group.add(l, r, new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.18, 4, 6), mat('#3b2f3f')).rotateX(Math.PI / 2));
      this.scene.add(group);
      this.butterflies.push({ group, wings: [l, r], home, seed: i * 1.7 });
    });
  }

  private buildVillage() {
    PALMS.forEach((p, i) => this.occluders.push(this.add(palm(i), p.x, p.z)));
    TREES.forEach((p, i) => this.occluders.push(this.add(tree(i), p.x, p.z)));
    for (const h of HOUSES) {
      const m = this.add(house(h.color), h.x, h.z);
      this.occluders.push(m);
      // Houses face the plaza.
      m.rotation.y = Math.atan2(-h.x, -h.z) + h.rot * 0.2;
    }

    const grand = sukkah(GRAND_SUKKAH, ['#fffaf0', '#fffaf0', '#3a86ff']);
    grand.group.position.set(GRAND_SUKKAH.x, 0, GRAND_SUKKAH.z);
    // The guests' table: seven chairs, one for each of the Ushpizin.
    const table = decorationModel('table');
    table.scale.set(5.5, 1, 1.4);
    table.position.set(0, FLOOR_Y, -1);
    grand.group.add(table);
    for (let i = 0; i < 7; i++) {
      const chair = decorationModel('chair');
      chair.position.set(-3 + i, FLOOR_Y, i % 2 ? -0.1 : -1.9);
      chair.rotation.y = i % 2 ? Math.PI : 0;
      grand.group.add(chair);
    }
    const hw = GRAND_SUKKAH.w / 2;
    const hd = GRAND_SUKKAH.d / 2;
    const top = SUKKAH_HEIGHT - 0.1;
    grand.group.add(stringLights(new THREE.Vector3(-hw, top, hd), new THREE.Vector3(hw, top, hd), 22, 0.4));
    grand.group.add(stringLights(new THREE.Vector3(-hw, top, -hd), new THREE.Vector3(hw, top, hd), 26, 0.5));
    grand.group.add(stringLights(new THREE.Vector3(hw, top, -hd), new THREE.Vector3(-hw, top, hd), 26, 0.5));
    for (let i = 0; i < 4; i++) {
      const chain = decorationModel('chain');
      chain.position.set(-4.5 + i * 3, SUKKAH_HEIGHT, -2.8);
      grand.group.add(chain);
      const lantern = decorationModel('lantern');
      lantern.position.set(-4.5 + i * 3, SUKKAH_HEIGHT, 1.8);
      grand.group.add(lantern);
    }
    this.scene.add(grand.group);
    this.label('grandSukkah', GRAND_SUKKAH.x, SUKKAH_HEIGHT + 1.3, GRAND_SUKKAH.z, 'zone');
  }

  private buildMySukkah(): SukkahModel {
    const s = sukkah(MY_SUKKAH, ['#fffaf0', '#ff9f1c']);
    s.group.position.set(MY_SUKKAH.x, 0, MY_SUKKAH.z);
    this.scene.add(s.group);
    const hw = MY_SUKKAH.w / 2;
    const hd = MY_SUKKAH.d / 2;
    s.roof.add(stringLights(new THREE.Vector3(-hw, SUKKAH_HEIGHT - 0.1, -hd), new THREE.Vector3(-hw, SUKKAH_HEIGHT - 0.1, hd), 12, 0.3));
    this.label('mySukkah', MY_SUKKAH.x, SUKKAH_HEIGHT + 1.2, MY_SUKKAH.z, 'zone');
    return s;
  }

  private buildGarden() {
    const hw = GARDEN.w / 2;
    const hd = GARDEN.d / 2;
    const soil = new THREE.Mesh(new THREE.PlaneGeometry(GARDEN.w - 0.8, GARDEN.d - 0.8), mat('#a67b52', { rim: 0 }));
    soil.rotation.x = -Math.PI / 2;
    soil.position.set(GARDEN.x, 0.02, GARDEN.z);
    soil.receiveShadow = true;
    this.scene.add(soil);
    // Soft sprout rows in the soil.
    for (let r = 0; r < 5; r++)
      for (let i = 0; i < 9; i++) {
        const b = bush(r % 2 ? '#7fcf55' : '#6cbf48', 0.28);
        this.add(b, GARDEN.x - hw + 1.3 + i * 1.18, GARDEN.z - hd + 1.6 + r * 2.2 + (i % 2) * 0.3);
      }
    // A round hedge all around, with an opening towards the plaza.
    for (let tt = -hw; tt <= hw; tt += 1.1) {
      for (const [x, z] of [
        [GARDEN.x + tt, GARDEN.z - hd],
        [GARDEN.x + tt, GARDEN.z + hd],
        [GARDEN.x - hw, GARDEN.z + tt],
        [GARDEN.x + hw, GARDEN.z + tt],
      ]) {
        if (x === GARDEN.x + hw && Math.abs(z - GARDEN.z) < 2) continue;
        this.add(bush('#4f9a3f', 0.75), x, z);
      }
    }
    const etrogTree = tree(1);
    etrogTree.scale.setScalar(0.8);
    for (let i = 0; i < 7; i++) etrogTree.add(species('etrog').translateX(Math.cos(i * 1.4) * 1).translateY(1.9 + (i % 3) * 0.4).translateZ(Math.sin(i * 1.4) * 1 + 0.3));
    this.add(etrogTree, -23, -4.8);
    this.add(bush('#2f7d32', 1.2), -23, 6.3);
    this.add(bush('#9ad16a', 1), -13.2, 6.6);
    const lulavPalm = palm(3);
    lulavPalm.scale.setScalar(0.6);
    this.add(lulavPalm, -13, -4.8);
    this.label('garden', GARDEN.x, 2.6, GARDEN.z - hd + 0.5, 'zone');

    for (const id of SPECIES) {
      const item = new THREE.Group();
      const model = species(id);
      model.scale.setScalar(1.5);
      model.position.y = 1.1;
      item.add(model, marker('#ffd23f', 0.7, true));
      item.position.set(SPECIES_SPOTS[id].x, 0, SPECIES_SPOTS[id].z);
      item.visible = false;
      this.scene.add(item);
      this.speciesItems.set(id, item);
    }
  }

  // --- Quality ----------------------------------------------------------------------------------

  private applyQuality() {
    const high = this.quality === 'high';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, high ? 2 : 1.25));
    this.sun.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.bloom.enabled = high;
    this.resize();
  }

  /** Drops to low quality when the device can't keep up (sustained slow frames). */
  private watchSpeed(raw: number) {
    if (this.quality === 'low' || this.timer.getElapsed() < 4) return;
    this.slowFrames = raw > 1 / 36 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 2);
    if (this.slowFrames > 90) {
      this.quality = 'low';
      this.applyQuality();
    }
  }

  // --- State from the game ----------------------------------------------------------------------

  setAvatar(a: Avatar) {
    const next = character(a);
    const { group } = this.player.char;
    next.group.position.copy(group.position);
    next.group.rotation.copy(group.rotation);
    next.group.visible = group.visible;
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
      m.position.set(p.x, decoration(p.id).mount === 'ceiling' ? SUKKAH_HEIGHT : FLOOR_Y, p.z);
      m.rotation.y = p.rot;
      m.traverse((o) => (o.userData.index = i));
      this.decorations.add(m);
    });
    const sel = placed[selected];
    this.selection.visible = !!sel;
    if (sel) this.selection.position.set(sel.x, FLOOR_Y + 0.02, sel.z);
  }

  setMode(mode: CameraMode) {
    // The creator camera stays put in front of the character, so dragging turns the character, not the view.
    if (mode === 'creator' && this.mode !== 'creator') this.creatorAngle = this.player.heading;
    this.mode = mode;
    this.mySukkah.roof.visible = mode !== 'build';
    this.labels.domElement.classList.toggle('hidden', mode === 'creator');
    // While decorating the camera looks down into the sukkah; the player would only be in the way.
    this.player.char.group.visible = mode !== 'build';
  }

  /** Turns the character around in the creator (drag on the scene). */
  spin(radians: number) {
    this.player.heading += radians;
  }

  /** A happy little jump, e.g. when picking something up. */
  celebrate() {
    this.hop = 1;
  }

  // --- Etrog hunt -------------------------------------------------------------------------------

  startHunt(h: Hunt) {
    this.endHunt();
    this.huntEtrogs = h.etrogs.map((e) => {
      const g = new THREE.Group();
      const model = species('etrog');
      model.scale.setScalar(2);
      model.position.y = 0.95;
      g.add(model, marker('#ffd23f', 0.6, true));
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
    this.rival.phase += moved * 3.5;
    this.rival.moving = moved > 0 ? 1 : 0;
  }

  endHunt() {
    this.huntGroup.clear();
    this.huntEtrogs = [];
  }

  // --- Frame update -----------------------------------------------------------------------------

  /** Moves the player by an input vector (x right, y away from the camera). Returns the distance walked. */
  walk(dt: number, input: [number, number]): number {
    const p = this.player;
    const [ix, iy] = input;
    const amount = Math.hypot(ix, iy);
    if (amount < 0.05) {
      p.moving = 0;
      return 0;
    }
    const want = resolve({ x: p.pos.x + ix * p.speed * dt, z: p.pos.z - iy * p.speed * dt });
    const moved = Math.hypot(want.x - p.pos.x, want.z - p.pos.z);
    p.pos = want;
    p.heading = Math.atan2(ix, -iy);
    p.phase += moved * 2.6;
    p.moving = Math.min(1, amount * 1.3);
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
    this.timer.update();
    const raw = this.timer.getDelta();
    const dt = Math.min(raw, 0.05);
    const time = this.timer.getElapsed();
    const still = this.reducedMotion.matches;
    this.watchSpeed(raw);

    this.hop = Math.max(0, this.hop - dt * 2.5);
    for (const w of [this.player, this.rival]) {
      const g = w.char.group;
      const onFloor = inside(w.pos, MY_SUKKAH, -0.1) || inside(w.pos, GRAND_SUKKAH, -0.1);
      const hop = w === this.player ? Math.sin(this.hop * Math.PI) * 0.6 : 0;
      g.position.set(w.pos.x, (onFloor ? FLOOR_Y : 0) + hop, w.pos.z);
      g.rotation.y = turnTowards(g.rotation.y, w.heading, dt * 12);
      animateWalk(w.char, w.phase, w.moving, still ? 0 : time);
    }

    // Abraham turns to whoever comes near, and waves.
    const d = Math.hypot(this.player.pos.x - ABRAHAM.x, this.player.pos.z - ABRAHAM.z);
    const face = d < 6 ? Math.atan2(this.player.pos.x - ABRAHAM.x, this.player.pos.z - ABRAHAM.z) : -0.6;
    this.abraham.group.rotation.y = turnTowards(this.abraham.group.rotation.y, face, dt * 4);
    animateWalk(this.abraham, 0, 0, still ? 0 : time);
    this.abraham.limbs.armL.rotation.z = d < 6 && !still ? -2.3 + Math.sin(time * 8) * 0.35 : -0.15;

    if (!still) {
      setWindTime(time);
      for (const item of this.speciesItems.values()) {
        item.children[0].rotation.y = time * 1.5;
        item.children[0].position.y = 1.1 + Math.sin(time * 2.5) * 0.15;
      }
      this.huntEtrogs.forEach((g, i) => {
        g.children[0].rotation.y = time * 2 + i;
        g.children[0].position.y = 0.95 + Math.sin(time * 3 + i) * 0.12;
      });
      (this.hubDisc.material as THREE.ShaderMaterial).uniforms.time.value = time;
      for (const [i, c] of this.clouds.entries()) {
        c.position.x += dt * (0.4 + (i % 3) * 0.2);
        if (c.position.x > 90) c.position.x = -90;
      }
      for (const b of this.butterflies) {
        const s = time * 0.5 + b.seed;
        b.group.position.set(b.home.x + Math.sin(s) * 3, 1.2 + Math.sin(s * 3.1) * 0.4, b.home.z + Math.sin(s * 1.7) * 2.5);
        b.group.rotation.y = Math.atan2(Math.cos(s) * 3, Math.cos(s * 1.7) * 4.25) - Math.PI / 2;
        const flap = Math.sin(time * 18 + b.seed) * 0.9;
        b.wings[0].rotation.z = flap;
        b.wings[1].rotation.z = -flap;
      }
      (this.water.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3 + Math.sin(time * 2) * 0.08;
    }

    if (!this.huntEtrogs.length) this.idleRival(time, dt);
    this.updateBursts(dt);
    this.updateCamera(dt);
    this.fadeOccluders();
    if (this.bloom.enabled) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
    return dt;
  }

  /** Between hunts, Shoshi the sheep grazes around the Game Hub. */
  private idleRival(time: number, dt: number) {
    const r = this.rival;
    const target = { x: RIVAL_HOME.x + Math.sin(time * 0.25) * 2.5, z: RIVAL_HOME.z + Math.cos(time * 0.18) * 1.5 };
    const dx = target.x - r.pos.x;
    const dz = target.z - r.pos.z;
    const dist = Math.hypot(dx, dz);
    r.moving = 0;
    if (dist > 0.3) {
      const step = Math.min(dist, 1.4 * dt);
      r.pos = resolve({ x: r.pos.x + (dx / dist) * step, z: r.pos.z + (dz / dist) * step });
      r.heading = Math.atan2(dx, dz);
      r.phase += step * 3.5;
      r.moving = 0.7;
    }
  }

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    // Bloom is soft anyway, so a lower resolution saves a lot on phones.
    this.bloom.resolution.set(w / 2, h / 2);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 62 : 50;
    this.camera.updateProjectionMatrix();
  }

  private cameraGoal(): { pos: THREE.Vector3; look: THREE.Vector3 } {
    const portrait = this.camera.aspect < 1;
    const p = this.player.pos;
    if (this.mode === 'creator') {
      const h = this.creatorAngle;
      const dist = portrait ? 6.6 : 4.8;
      return {
        pos: new THREE.Vector3(p.x + Math.sin(h) * dist, portrait ? 1.5 : 1.6, p.z + Math.cos(h) * dist),
        // On a phone the creator panel covers the bottom half, so aim below the feet to lift the character up.
        look: new THREE.Vector3(p.x, portrait ? -1 : 1.15, p.z),
      };
    }
    if (this.mode === 'build') {
      const s = MY_SUKKAH;
      return {
        pos: new THREE.Vector3(s.x, portrait ? 13 : 9, s.z + (portrait ? 3.5 : 4.5)),
        look: new THREE.Vector3(s.x, 0, s.z + (portrait ? 1 : 0.3)),
      };
    }
    const back = portrait ? 11 : 9.5;
    const up = portrait ? 10 : 7.2;
    return { pos: new THREE.Vector3(p.x, up, p.z + back), look: new THREE.Vector3(p.x, 1.2, p.z - 2) };
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

  /** Makes whatever stands between the camera and the player see-through, so kids never lose sight of themselves. */
  private fadeOccluders() {
    const head = new THREE.Vector3(this.player.pos.x, 1.2, this.player.pos.z);
    const dir = head.clone().sub(this.camera.position);
    const dist = dir.length();
    this.raycaster.set(this.camera.position, dir.normalize());
    this.raycaster.far = dist - 0.6;
    const hiding = new Set<THREE.Object3D>();
    if (this.mode === 'walk')
      for (const hit of this.raycaster.intersectObjects(this.occluders, true)) {
        let o: THREE.Object3D | null = hit.object;
        while (o && !this.occluders.includes(o)) o = o.parent;
        if (o) hiding.add(o);
      }
    this.raycaster.far = Infinity;
    // Also anything tall standing right in front of the camera, which would fill the foreground.
    if (this.mode === 'walk')
      for (const o of this.occluders)
        if (o.position.z > this.player.pos.z + 2 && Math.abs(o.position.x - this.player.pos.x) < 7) hiding.add(o);
    for (const o of hiding) if (!this.faded.has(o)) setFaded(o, true);
    for (const o of this.faded) if (!hiding.has(o)) setFaded(o, false);
    this.faded = hiding;
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

  /** A burst of glowing sparkles, e.g. when something is collected. */
  sparkle(at: Vec, color = '#ffd23f', height = 1) {
    if (this.reducedMotion.matches) return;
    const n = 40;
    const positions = new Float32Array(n * 3);
    const velocities = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      positions.set([at.x, height, at.z], i * 3);
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 2.5;
      velocities.set([Math.cos(a) * s, 2.5 + Math.random() * 3.5, Math.sin(a) * s], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: new THREE.Color(color).multiplyScalar(6),
        map: sparkleTexture,
        size: 0.45,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
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

const fadedMats = new Map<THREE.Material, THREE.Material>();

function setFaded(root: THREE.Object3D, faded: boolean) {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    if (faded) {
      o.userData.solid = o.material;
      let m = fadedMats.get(o.material);
      if (!m) {
        const clone = o.material.clone();
        clone.transparent = true;
        clone.opacity = 0.25;
        clone.depthWrite = false;
        fadedMats.set(o.material, clone);
        m = clone;
      }
      o.material = m;
    } else if (o.userData.solid) {
      o.material = o.userData.solid;
      delete o.userData.solid;
    }
  });
}

/** Rotates angle `from` towards `to` along the shorter way, by at most `rate` (0..1 of the gap). */
function turnTowards(from: number, to: number, rate: number): number {
  let diff = to - from;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return from + diff * Math.min(1, rate);
}

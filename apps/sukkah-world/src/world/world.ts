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
import { JUG_SPOTS, type Raft, raftHeight, RIVER_LENGTH, ROCKS } from '../game/raft';
import { type Avatar, decoration, type GuestId, type PetId, type Placed, SPECIES, type SpeciesId } from '../game/progress';
import { type StringKey, t } from '../i18n';
import {
  AARON,
  ABRAHAM,
  DAVID,
  GUEST_SEATS,
  HELP_ITEMS,
  type HelpItem,
  JOSEPH,
  MARKET,
  SHEAF_SPOTS,
  VILLAGERS,
  FOREST_TREES,
  ISAAC,
  JACOB,
  LAMB_SPOTS,
  LANTERNS,
  MAZE,
  MAZE_LAYOUT,
  MOSES,
  RIVER,
  RIVER_TO,
  riverPoint,
  PEN,
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
  aaron,
  abraham,
  david,
  dove,
  helpItem,
  joseph,
  marketStall,
  sheaf,
  villager,
  hedge,
  isaac,
  jacob,
  LANTERN_LIT,
  LANTERN_UNLIT,
  lanternPost,
  mushroom,
  dock,
  moses,
  raft as raftModel,
  reeds,
  rock,
  waterJug,
  pen,
  animateWalk,
  bush,
  type Character,
  character,
  decorationModel,
  flowerPot,
  guideArrow,
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

export type CameraMode = 'walk' | 'creator' | 'build' | 'raft';

export const WALK_SPEED = 5.2;
/** Running is this much faster than walking. */
const RUN_FACTOR = 1.7;
const JUMP_SPEED = 6.5;
const GRAVITY = 20;
const ZOOM_MIN = 0.45;
const ZOOM_MAX = 1.5;
/** Camera height factor: low and cinematic up to high and overhead. */
const TILT_MIN = 0.35;
const TILT_MAX = 1.8;
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

export type LambState = 'lost' | 'following' | 'home';

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
  private guests = new Map<GuestId, { char: Character; tag: HTMLDivElement; home: Vec; rest: number; seat?: (typeof GUEST_SEATS)[number] }>();
  private villagers: { char: Character; tag: HTMLDivElement; home: Vec; happy: boolean }[] = [];
  private helpItems = new Map<HelpItem, THREE.Group>();
  private carried: THREE.Group | null = null;
  private sheaves: THREE.Group[] = [];
  private sheafState = { active: false, found: [] as string[] };
  private dove: { group: THREE.Group; wings: [THREE.Object3D, THREE.Object3D] } | null = null;
  private fireworksUntil = 0;
  private nextFirework = 0;
  private lanterns: THREE.Mesh[] = [];
  /** Jacob's lambs: lost in the maze, following the player, or safe in the pen. */
  private lambs: Walker[] = [];
  lambStates: LambState[] = ['lost', 'lost', 'lost'];
  private pet: Walker | null = null;
  private river: THREE.ShaderMaterial | null = null;
  private raftObj!: THREE.Group;
  private jugs: THREE.Group[] = [];
  private riding: Raft | null = null;
  /** The player's recent path, for followers to walk along. */
  private trail: Vec[] = [];
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
  /** The player's jump: height above the ground and vertical speed. */
  private airY = 0;
  private airV = 0;
  /** Big things (houses, trees, palms) that turn see-through when they hide the player. */
  private occluders: THREE.Object3D[] = [];
  private grandRoof: THREE.Object3D | null = null;
  private faded = new Set<THREE.Object3D>();

  mode: CameraMode = 'walk';
  /** Camera angle around the player (0 = looking north) and distance factor, with the goals they ease to. */
  private yaw = 0;
  private yawGoal = 0;
  private zoom = 1;
  private zoomGoal = 1;
  private tilt = 1;
  private tiltGoal = 1;
  private creatorAngle = 0;
  private camTarget = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  /** The player's own "less motion" choice; null follows the device setting. */
  private motionChoice: boolean | null = null;
  private get reducedMotion() {
    return { matches: this.motionChoice ?? this.motionQuery.matches };
  }
  /** Floating arrow over the player's head, pointing to where the quest continues. */
  private guide = guideArrow();
  private guideTarget: Vec | null = null;

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

    this.addGuest('abraham', abraham(), ABRAHAM, -0.6);
    this.addGuest('isaac', isaac(), ISAAC, 1.2);
    this.addGuest('jacob', jacob(), JACOB, -1.3);
    this.addGuest('moses', moses(), MOSES, Math.PI);
    this.addGuest('aaron', aaron(), AARON, 0.6);
    this.addGuest('joseph', joseph(), JOSEPH, 0.5);
    this.addGuest('david', david(), DAVID, -0.5);
    this.buildHelpers();
    this.buildForest();
    this.buildMaze();
    this.buildRiver();

    this.player = this.walker(character({ name: '', shirt: '#2a9d8f', skin: '#f1c7a0', hat: 'kippah' }), SPAWN, WALK_SPEED);
    this.player.heading = Math.PI;
    this.rival = this.walker(sheep(), RIVAL_HOME, 0);
    this.label('rival', 0, 1.75, 0, 'npc', this.rival.char.group);

    this.selection.visible = false;
    this.mySukkah.group.add(this.decorations, this.selection);
    this.scene.add(this.huntGroup);
    this.scene.add(this.guide);

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
      if (x > MAZE.x - 0.8 && x < MAZE.x + MAZE.cells * MAZE.cell + 0.8 && z > MAZE.z - 0.8 && z < MAZE.z + MAZE.cells * MAZE.cell + 0.8) return false;
      if (Math.hypot(x - PEN.x, z - PEN.z) < PEN.r + 0.5) return false;
      let angle = Math.atan2(z, x);
      if (angle < 0) angle += Math.PI * 2;
      if (angle > RIVER.from - 0.03 && angle < RIVER_TO + 0.03 && Math.abs(Math.hypot(x, z) - RIVER.r) < RIVER.halfWidth + 1) return false;
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
    const grassMatrices = spots(this.quality === 'high' ? 2600 : 1100);
    const grass = new THREE.InstancedMesh(tuft, swayMat(null, 0.3), grassMatrices.length);
    const greens = ['#6fbf4a', '#7fcf55', '#5eab40'].map((c) => new THREE.Color(c));
    grassMatrices.forEach((m, i) => {
      grass.setMatrixAt(i, m);
      grass.setColorAt(i, greens[i % 3]);
    });
    grass.receiveShadow = true;
    this.scene.add(grass);

    const flowerMatrices = spots(420);
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
    // The schach fades when the player is inside, so the table and the guests stay in view.
    this.occluders.push(grand.roof);
    this.grandRoof = grand.roof;
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

  private addGuest(id: GuestId, char: Character, home: Vec, rest: number) {
    char.group.position.set(home.x, 0, home.z);
    char.group.rotation.y = rest;
    this.scene.add(char.group);
    const tag = this.label(id, 0, 2.35, 0, 'npc', char.group);
    this.guests.set(id, { char, tag, home, rest });
  }

  /** The Forest of the Ushpizin: tall trees, mushrooms and Isaac's lantern trail. */
  private buildForest() {
    FOREST_TREES.forEach((p, i) => {
      const t = this.add(tree(i + 2), p.x, p.z);
      t.scale.setScalar(0.95 + (i % 4) * 0.1);
      t.rotation.y = i;
      this.occluders.push(t);
      if (i % 3 === 0) this.add(mushroom(i), p.x + 0.9, p.z + 0.6);
    });
    for (const l of LANTERNS) {
      const post = lanternPost();
      this.add(post.group, l.x, l.z);
      this.lanterns.push(post.glow);
    }
    this.label('forest', ISAAC.x - 5, 4.2, ISAAC.z - 2, 'zone');
  }

  /** Jacob's hedge maze, with the pen for the lambs next to the entrance. */
  private buildMaze() {
    for (const w of MAZE_LAYOUT.walls) {
      const h = hedge(w.maxX - w.minX, w.maxZ - w.minZ);
      this.add(h, (w.minX + w.maxX) / 2, (w.minZ + w.maxZ) / 2);
      this.occluders.push(h);
    }
    this.add(pen(PEN.r), PEN.x, PEN.z).rotation.y = Math.PI / 2 - 0.4;
    this.label('maze', MAZE.x + MAZE.cells * MAZE.cell * 0.5, 3.2, MAZE.z - 0.5, 'zone');
    for (let i = 0; i < LAMB_SPOTS.length; i++) {
      const lamb = sheep();
      lamb.group.scale.setScalar(0.55);
      this.lambs.push(this.walker(lamb, LAMB_SPOTS[i], 0));
    }
  }

  /**
   * Following lambs trot after the player in a little line. They walk along the player's own recent path
   * ("breadcrumbs"), which is always walkable, so they never get stuck on hedge corners in the maze.
   */
  private updateLambs(dt: number, time: number) {
    let last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last.x - this.player.pos.x, last.z - this.player.pos.z) > 0.2) {
      this.trail.push({ ...this.player.pos });
      if (this.trail.length > 300) this.trail.shift();
      last = this.trail[this.trail.length - 1];
    }
    const goTo = (w: Walker, target: Vec, speed: number) => {
      const dx = target.x - w.pos.x;
      const dz = target.z - w.pos.z;
      const d = Math.hypot(dx, dz);
      w.moving = 0;
      if (d < 0.05) return;
      // Far behind (e.g. after travelling through the menu): catch up at once.
      if (d > 6) {
        w.pos = { ...target };
        return;
      }
      const step = Math.min(d, speed * dt);
      w.pos = { x: w.pos.x + (dx / d) * step, z: w.pos.z + (dz / d) * step };
      w.phase += step * 4;
      w.heading = Math.atan2(dx, dz);
      w.moving = 1;
    };
    // Each follower stays about 1.1 m behind the one in front, measured along the path.
    const behind = (k: number) => {
      const want = 1.1 * (k + 1);
      let walked = Math.hypot(this.player.pos.x - last.x, this.player.pos.z - last.z);
      for (let i = this.trail.length - 1; i > 0; i--) {
        const a = this.trail[i];
        const b = this.trail[i - 1];
        const seg = Math.hypot(a.x - b.x, a.z - b.z);
        if (walked + seg >= want) {
          const t = (want - walked) / seg;
          return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
        }
        walked += seg;
      }
      return this.trail[0];
    };
    let k = 0;
    this.lambs.forEach((lamb, i) => {
      const st = this.lambStates[i];
      if (st === 'following') goTo(lamb, behind(k++), WALK_SPEED * 1.15);
      else if (st === 'home') {
        const spot = { x: PEN.x + Math.cos(time * 0.3 + i * 2.1) * 0.8, z: PEN.z + Math.sin(time * 0.3 + i * 2.1) * 0.8 };
        goTo(lamb, spot, 0.8);
        lamb.moving *= 0.5;
      } else lamb.moving = 0;
    });
    if (this.pet && !this.riding) goTo(this.pet, behind(k), WALK_SPEED * 1.15);
  }

  /** Moses' river: flowing water between sandy banks, reeds, rocks, floating jugs and a raft at the jetty. */
  private buildRiver() {
    const flat = (inner: number, outer: number, material: THREE.Material, y: number) => {
      const g = new THREE.RingGeometry(inner, outer, 96, 1, -RIVER_TO, RIVER_TO - RIVER.from);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, material);
      m.position.y = y;
      m.receiveShadow = true;
      this.scene.add(m);
    };
    const hw = RIVER.halfWidth;
    flat(RIVER.r - hw - 0.9, RIVER.r + hw + 0.9, mat('#e8d3a0', { rim: 0 }), 0.012);
    this.river = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { time: { value: 0 }, radius: { value: RIVER.r }, halfWidth: { value: hw } },
      vertexShader: 'varying vec3 vPos; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vPos = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float time; uniform float radius; uniform float halfWidth; varying vec3 vPos;
        void main() {
          float r = length(vPos.xz);
          float across = (r - radius) / halfWidth;
          float along = atan(vPos.z, vPos.x) * radius;
          vec3 deep = vec3(0.13, 0.52, 0.9);
          vec3 shallow = vec3(0.45, 0.82, 1.0);
          vec3 c = mix(deep, shallow, smoothstep(0.4, 1.0, abs(across)));
          float wave = sin(along * 1.3 - time * 4.0 + sin(across * 4.0 + time) * 1.5);
          float wave2 = sin(along * 0.7 - time * 2.6 + across * 6.0);
          c += vec3(1.0) * smoothstep(0.82, 1.0, wave * wave2) * 0.55;
          c += vec3(1.0) * smoothstep(0.85, 1.0, abs(across)) * 0.35;
          gl_FragColor = vec4(c, 0.93);
          #include <colorspace_fragment>
        }`,
    });
    flat(RIVER.r - hw, RIVER.r + hw, this.river, 0.05);

    for (let s = 1; s < RIVER_LENGTH; s += 3.2)
      for (const side of [-1, 1]) {
        if ((Math.round(s) + side) % 3 === 0) continue;
        const p = riverPoint(s + side * 0.8, side * (hw + 0.5));
        this.add(reeds(Math.round(s * 7 + side)), p.x, p.z);
      }
    for (const r of ROCKS) {
      const p = riverPoint(r.s, r.offset);
      this.add(rock(0.55), p.x, p.z, 0.1);
    }
    this.jugs = JUG_SPOTS.map((j) => {
      const g = new THREE.Group();
      const jug = waterJug();
      g.add(jug, marker('#7fd6ff', 0.55, true));
      const p = riverPoint(j.s, j.offset);
      this.add(g, p.x, p.z, 0.05);
      g.visible = false;
      return g;
    });

    const jetty = dock(2.2);
    this.add(jetty, MOSES.x, MOSES.z - 1.2);
    this.raftObj = raftModel();
    this.docked();
    this.scene.add(this.raftObj);
    this.label('river', 0, 2.5, -RIVER.r + 0.5, 'zone');
  }

  /** Puts the raft back at the jetty, ready for the next ride. */
  private docked() {
    const p = { x: MOSES.x + 1.6, z: MOSES.z - 2.9 };
    this.raftObj.position.set(p.x, 0.05, p.z);
    this.raftObj.rotation.y = Math.PI / 2;
  }

  /** Shows the jugs still floating in the river. */
  setJugs(visible: boolean[]) {
    this.jugs.forEach((j, i) => (j.visible = visible[i]));
  }

  startRide(raft: Raft) {
    this.riding = raft;
    this.setMode('raft');
    this.syncRide(raft);
    this.snapCamera();
  }

  /** Moves the raft (with the player and their pet on it) to where the ride says. */
  syncRide(raft: Raft) {
    this.riding = raft;
    const p = riverPoint(raft.s, raft.offset);
    // Facing downstream: the tangent of the arc at this angle.
    const heading = Math.atan2(-Math.sin(p.angle), Math.cos(p.angle));
    const bob = Math.sin(this.timer.getElapsed() * 3) * 0.04;
    this.raftObj.position.set(p.x, 0.05 + bob + raftHeight(raft), p.z);
    this.raftObj.rotation.set(Math.sin(this.timer.getElapsed() * 2.2) * 0.04 + (raft.bump > 0 ? Math.sin(raft.bump * 30) * 0.12 : 0), heading, 0);
    this.player.pos = { x: p.x, z: p.z };
    this.player.heading = heading;
    this.player.moving = 0;
    if (this.pet) {
      const back = riverPoint(raft.s - 0.6, raft.offset + 0.3);
      this.pet.pos = { x: back.x, z: back.z };
      this.pet.heading = heading;
    }
  }

  endRide() {
    this.riding = null;
    this.docked();
    this.trail = [];
    this.setMode('walk');
  }

  /** Aaron's villagers and market, Joseph's hidden sheaves. */
  private buildHelpers() {
    const stall = this.add(marketStall(), MARKET.x, MARKET.z);
    stall.rotation.y = Math.atan2(-MARKET.x, -MARKET.z);
    this.label('market', MARKET.x, 2.9, MARKET.z, 'zone');
    VILLAGERS.forEach((v, i) => {
      const char = villager(i);
      char.group.scale.setScalar(0.85);
      char.group.position.set(v.x, 0, v.z);
      this.scene.add(char.group);
      const tag = this.label('villager', 0, 2.3, 0, 'npc', char.group);
      tag.classList.add('need');
      char.group.visible = false;
      this.villagers.push({ char, tag, home: v, happy: false });
    });
    for (const id of Object.keys(HELP_ITEMS) as HelpItem[]) {
      const g = new THREE.Group();
      const model = helpItem(id);
      model.position.y = 0.9;
      g.add(model, marker('#ff8fc7', 0.6, true));
      this.add(g, HELP_ITEMS[id].x, HELP_ITEMS[id].z);
      g.visible = false;
      this.helpItems.set(id, g);
    }
    this.sheaves = SHEAF_SPOTS.map((p) => {
      const g = new THREE.Group();
      g.add(sheaf(), marker('#ffd23f', 0.6, true));
      this.add(g, p.x, p.z);
      g.visible = false;
      return g;
    });
  }

  /** Villagers appear with Aaron; `needs` is the emoji bubble shown above those still waiting. */
  setVillagers(visible: boolean, happy: boolean[], needs: string[]) {
    this.villagers.forEach((v, i) => {
      v.char.group.visible = visible;
      v.happy = happy[i];
      v.tag.textContent = happy[i] ? '💛' : needs[i];
    });
  }

  setHelpItems(visible: Partial<Record<HelpItem, boolean>>) {
    for (const [id, g] of this.helpItems) g.visible = !!visible[id];
  }

  /** What the player is carrying for Aaron, floating above their head. */
  setCarrying(item: HelpItem | null) {
    if (this.carried) this.scene.remove(this.carried);
    this.carried = item ? helpItem(item) : null;
    if (this.carried) this.scene.add(this.carried);
  }

  /** Joseph's sheaves only show themselves when the player is close. */
  setSheaves(active: boolean, found: string[]) {
    this.sheafState = { active, found };
  }

  /** Seats the Ushpizin around the Grand Sukkah table (true) or sends them back to their places. */
  seatGuests(seated: boolean) {
    [...this.guests.values()].forEach((g, i) => {
      g.seat = seated ? GUEST_SEATS[i] : undefined;
      const at = g.seat ?? g.home;
      g.char.group.position.set(at.x, seated ? FLOOR_Y : 0, at.z);
    });
  }

  /** Where a guest can be talked to right now. */
  guestSpot(id: GuestId): Vec {
    const g = this.guests.get(id)!;
    return g.seat ?? g.home;
  }

  /** Fireworks over a spot for a few seconds. */
  fireworks(at: Vec, seconds: number) {
    this.fireworksAt = at;
    this.fireworksUntil = this.timer.getElapsed() + seconds;
  }
  private fireworksAt: Vec = { x: 0, z: 0 };

  private updateHelpers(dt: number, time: number, still: boolean) {
    for (const v of this.villagers) {
      if (!v.char.group.visible) continue;
      const d = Math.hypot(this.player.pos.x - v.home.x, this.player.pos.z - v.home.z);
      const face = Math.atan2(this.player.pos.x - v.home.x, this.player.pos.z - v.home.z);
      if (d < 7) v.char.group.rotation.y = turnTowards(v.char.group.rotation.y, face, dt * 4);
      animateWalk(v.char, 0, 0, still ? 0 : time);
      // Happy villagers bounce.
      if (v.happy && !still) v.char.rig.position.y = Math.abs(Math.sin(time * 5)) * 0.15;
    }
    for (const g of this.helpItems.values()) if (!still) g.children[0].rotation.y = time * 1.5;
    if (this.carried) {
      this.carried.position.set(this.player.pos.x, 2.35 + Math.sin(time * 4) * 0.05, this.player.pos.z);
      this.carried.rotation.y = time;
    }
    this.sheaves.forEach((g, i) => {
      const p = SHEAF_SPOTS[i];
      const near = Math.hypot(this.player.pos.x - p.x, this.player.pos.z - p.z) < 7;
      g.visible = this.sheafState.active && !this.sheafState.found.includes(String(i)) && near;
      if (g.visible && !still) g.children[0].rotation.y = time * 2;
    });
    if (this.dove) {
      const d = this.dove;
      // Flutters at the player's right shoulder, a little behind.
      const h = this.player.heading;
      const target = new THREE.Vector3(
        this.player.pos.x + Math.cos(h) * -0.9 - Math.sin(h) * 0.5,
        2.1 + Math.sin(time * 3) * 0.15,
        this.player.pos.z - Math.sin(h) * -0.9 - Math.cos(h) * 0.5,
      );
      if (d.group.position.distanceTo(target) > 8) d.group.position.copy(target);
      d.group.position.lerp(target, 1 - Math.exp(-dt * 4));
      d.group.rotation.y = turnTowards(d.group.rotation.y, h, dt * 5);
      const flap = still ? 0.3 : Math.sin(time * 16) * 0.7;
      d.wings[0].rotation.z = flap;
      d.wings[1].rotation.z = -flap;
    }
    const now = this.timer.getElapsed();
    if (now < this.fireworksUntil && now > this.nextFirework) {
      this.nextFirework = now + 0.35;
      const colors = ['#ff5d73', '#ffd23f', '#4dd4ff', '#7cf07c', '#c77dff', '#ff9f1c'];
      const a = Math.random() * Math.PI * 2;
      this.sparkle(
        { x: this.fireworksAt.x + Math.cos(a) * 4, z: this.fireworksAt.z + Math.sin(a) * 3 },
        colors[Math.floor(Math.random() * colors.length)],
        6 + Math.random() * 3,
      );
      this.onFirework?.();
    }
  }
  /** Called for every firework burst (for the bang sound). */
  onFirework: (() => void) | null = null;

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

  /** Shows a guest once they have arrived, with '!' (new quest) or '?' (come back) above them. */
  setGuest(id: GuestId, visible: boolean, mark: '' | '!' | '?') {
    const g = this.guests.get(id)!;
    g.char.group.visible = visible;
    g.tag.dataset.mark = mark;
  }

  setLanterns(lit: boolean[]) {
    this.lanterns.forEach((glow, i) => (glow.material = lit[i] ? LANTERN_LIT : LANTERN_UNLIT));
  }

  /** Places the lambs: lost ones at their hiding spots, rescued ones in the pen; following ones stay where they are. */
  setLambs(states: LambState[]) {
    states.forEach((st, i) => {
      const lamb = this.lambs[i];
      if (st === 'lost') lamb.pos = { ...LAMB_SPOTS[i] };
      if (st === 'home' && this.lambStates[i] !== 'home') lamb.pos = { x: PEN.x + Math.cos(i * 2.1) * 0.8, z: PEN.z + Math.sin(i * 2.1) * 0.8 };
    });
    this.lambStates = [...states];
  }

  lambPosition(i: number): Vec {
    return { ...this.lambs[i].pos };
  }

  /** The player's own pet lamb, trotting after them. */
  /** Shows the player's pets: the lamb trots behind, the dove flutters at their shoulder. */
  setPets(pets: PetId[]) {
    this.setLamb(pets.includes('lamb'));
    if (pets.includes('dove') && !this.dove) {
      this.dove = dove();
      this.dove.group.position.set(this.player.pos.x, 2, this.player.pos.z);
      this.scene.add(this.dove.group);
    }
  }

  private setLamb(has: boolean) {
    if (has && !this.pet) {
      const lamb = sheep();
      lamb.group.scale.setScalar(0.55);
      this.pet = this.walker(lamb, { x: this.player.pos.x + 1, z: this.player.pos.z + 1 }, 0);
    }
    if (!has && this.pet) {
      this.scene.remove(this.pet.char.group);
      this.pet = null;
    }
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

  /** Jumps, if the player is on the ground. Returns whether a jump started. */
  jump(): boolean {
    if (this.airY > 0 || this.mode !== 'walk') return false;
    this.airV = JUMP_SPEED;
    this.airY = 0.001;
    return true;
  }

  setReducedMotion(on: boolean | null) {
    this.motionChoice = on;
  }

  /** Points the guide arrow at a spot, or hides it (null). */
  setGuide(target: Vec | null) {
    this.guideTarget = target;
  }

  private updateGuide(time: number) {
    const t = this.guideTarget;
    const p = this.player.pos;
    const far = !!t && Math.hypot(t.x - p.x, t.z - p.z) > 4;
    this.guide.visible = far && this.mode === 'walk';
    if (!this.guide.visible || !t) return;
    const bob = this.reducedMotion.matches ? 0 : Math.sin(time * 4) * 0.12;
    this.guide.position.set(p.x, 2.75 + this.airY + bob, p.z);
    this.guide.rotation.y = Math.atan2(t.x - p.x, t.z - p.z);
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
  walk(dt: number, input: [number, number], running = false): number {
    const p = this.player;
    const [ix, iy] = input;
    const amount = Math.hypot(ix, iy);
    if (amount < 0.05) {
      p.moving = 0;
      return 0;
    }
    // Screen directions follow the camera: "up" is always away from it, whichever way it faces.
    const yaw = this.yaw;
    const dx = ix * Math.cos(yaw) - iy * Math.sin(yaw);
    const dz = -ix * Math.sin(yaw) - iy * Math.cos(yaw);
    const speed = p.speed * (running ? RUN_FACTOR : 1);
    const want = resolve({ x: p.pos.x + dx * speed * dt, z: p.pos.z + dz * speed * dt });
    const moved = Math.hypot(want.x - p.pos.x, want.z - p.pos.z);
    p.pos = want;
    p.heading = Math.atan2(dx, dz);
    p.phase += moved * (running ? 2.2 : 2.6);
    p.moving = Math.min(1, amount * 1.3) * (this.airY > 0 ? 0.3 : 1);
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
    if (this.airY > 0) {
      this.airV -= GRAVITY * dt;
      this.airY = Math.max(0, this.airY + this.airV * dt);
    }
    for (const w of [this.player, this.rival, ...this.lambs, ...(this.pet ? [this.pet] : [])]) {
      const g = w.char.group;
      const onFloor = inside(w.pos, MY_SUKKAH, -0.1) || inside(w.pos, GRAND_SUKKAH, -0.1);
      const hop = w === this.player ? Math.sin(this.hop * Math.PI) * 0.6 + this.airY : 0;
      const onRaft = this.riding && (w === this.player || w === this.pet) ? this.raftObj.position.y + 0.22 : 0;
      g.position.set(w.pos.x, (onFloor ? FLOOR_Y : 0) + hop + onRaft, w.pos.z);
      g.rotation.y = turnTowards(g.rotation.y, w.heading, dt * 12);
      animateWalk(w.char, w.phase, w.moving, still ? 0 : time);
    }

    // The guests turn to whoever comes near, and wave.
    for (const g of this.guests.values()) {
      if (g.seat) {
        // At the Grand Sukkah table: sitting, smiling, and David plays his harp.
        g.char.group.rotation.y = g.seat.facing;
        animateWalk(g.char, 0, 0, still ? 0 : time);
        g.char.limbs.armL.rotation.z = still ? -0.15 : -0.5 + Math.sin(time * 6 + g.seat.x) * 0.15;
        continue;
      }
      const d = Math.hypot(this.player.pos.x - g.home.x, this.player.pos.z - g.home.z);
      const face = d < 6 ? Math.atan2(this.player.pos.x - g.home.x, this.player.pos.z - g.home.z) : g.rest;
      g.char.group.rotation.y = turnTowards(g.char.group.rotation.y, face, dt * 4);
      animateWalk(g.char, 0, 0, still ? 0 : time);
      g.char.limbs.armL.rotation.z = d < 6 && !still ? -2.3 + Math.sin(time * 8) * 0.35 : -0.15;
    }
    this.updateLambs(dt, time);
    this.updateGuide(time);
    this.updateHelpers(dt, time, still);

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
      if (this.river) this.river.uniforms.time.value = time;
      this.jugs.forEach((j, i) => {
        j.children[0].position.y = Math.sin(time * 2 + i) * 0.06;
        j.children[0].rotation.z = Math.sin(time * 1.3 + i) * 0.12;
      });
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
    if (this.mode === 'raft') {
      // A chase camera behind the raft, looking downstream.
      const a = Math.atan2(p.z, p.x);
      const tx = -Math.sin(a);
      const tz = Math.cos(a);
      const back = portrait ? 8.5 : 7;
      return {
        pos: new THREE.Vector3(p.x - tx * back - Math.cos(a) * 1.5, portrait ? 6 : 4.6, p.z - tz * back - Math.sin(a) * 1.5),
        look: new THREE.Vector3(p.x + tx * 5, 0.5, p.z + tz * 5),
      };
    }
    // Orbit around the player at the chosen angle and distance; zooming in also lowers the camera a little.
    const back = (portrait ? 11 : 9.5) * this.zoom;
    const up = (portrait ? 10 : 7.2) * this.zoom ** 1.15 * this.tilt;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    return {
      pos: new THREE.Vector3(p.x + sin * back, up, p.z + cos * back),
      look: new THREE.Vector3(p.x - sin * 2 * this.zoom, 1.2, p.z - cos * 2 * this.zoom),
    };
  }

  private updateCamera(dt: number) {
    // Turn and zoom ease towards what the player asked for, along the shorter way round.
    const ease = 1 - Math.exp(-dt * 8);
    this.yaw = turnTowards(this.yaw, this.yawGoal, ease);
    this.zoom += (this.zoomGoal - this.zoom) * ease;
    this.tilt += (this.tiltGoal - this.tilt) * ease;
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
    if (this.mode === 'walk' && this.grandRoof && inside(this.player.pos, GRAND_SUKKAH, 0)) hiding.add(this.grandRoof);
    // Also anything tall standing right in front of the camera, which would fill the foreground.
    if (this.mode === 'walk')
      for (const o of this.occluders) {
        const at = o.getWorldPosition(scratch);
        const rx = at.x - this.player.pos.x;
        const rz = at.z - this.player.pos.z;
        // Towards the camera (along its horizontal direction) and not too far to the side.
        const along = rx * Math.sin(this.yaw) + rz * Math.cos(this.yaw);
        const side = Math.abs(rx * Math.cos(this.yaw) - rz * Math.sin(this.yaw));
        if (along > 2 && along < 11 * this.zoom && side < 7 && o.parent === this.scene) hiding.add(o);
      }
    for (const o of hiding) if (!this.faded.has(o)) setFaded(o, true);
    for (const o of this.faded) if (!hiding.has(o)) setFaded(o, false);
    this.faded = hiding;
  }

  /** Turns the camera around the player (radians) and/or zooms (factor; > 1 is further away). */
  turnCamera(turn: number, zoom = 1, tilt = 0) {
    if (this.mode !== 'walk') return;
    this.yawGoal += turn;
    this.tiltGoal = Math.min(TILT_MAX, Math.max(TILT_MIN, this.tiltGoal + tilt));
    this.zoomGoal = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.zoomGoal * zoom));
  }

  snapCamera() {
    this.yaw = this.yawGoal;
    this.zoom = this.zoomGoal;
    this.tilt = this.tiltGoal;
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
const scratch = new THREE.Vector3();

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
        clone.opacity = 0.14;
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

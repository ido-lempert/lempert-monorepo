/**
 * The 3D scene: the round world on the kitchen counter, the slingshot, the bugs and the food. It draws
 * whatever Arena it is bound to (the chapter, or a staged replay shot), turns game events into effects,
 * and moves the camera where the director (play.ts) asks. Game rules live in src/game.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Arena, Body, GameEvent } from '../game/arena';
import type { Bug } from '../game/bugs';
import { FOODS, type FoodId } from '../game/foods';
import type { Level } from '../game/levels';
import { type Aim, aimDir, COUNTER_Y, DISC_RADIUS, groundAt, launchVelocity, predictPath, rangeFor, SLING, type Vec3 } from '../game/physics';
import { Effects } from './effects';
import { backdrop, blobTexture, dotTexture, grassField, initialQuality, type Quality, setWindTime } from './look';
import { Post } from './post';
import { bugModel, type BugModel, disc, foodModel, kitchen, mop, obstacleModel, SINK, slingshot, stretchBand } from './models';

/** A soft round shadow right under something, so it's easy to see where it is above the ground. */
const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const blobMat = new THREE.MeshBasicMaterial({ map: blobTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
function blob(): THREE.Mesh {
  const m = new THREE.Mesh(blobGeo, blobMat);
  m.renderOrder = 1;
  return m;
}

interface BugView {
  bug: Bug;
  model: BugModel;
  shadow: THREE.Mesh;
  scale: number;
  /** Squash after landing. */
  squash: number;
  /** Swirling down the sink (seconds). */
  sink: number;
}

interface BodyView {
  body: Body;
  root: THREE.Group;
  spinner: THREE.Group;
  shadow: THREE.Mesh;
  wobble: number;
}

const v3 = (p: Vec3) => new THREE.Vector3(p.x, p.y, p.z);

/** Camera rig: eases towards where it is asked to be, plus a gentle shake. */
export class CameraRig {
  readonly pos = new THREE.Vector3();
  readonly look = new THREE.Vector3();
  private wantPos = new THREE.Vector3();
  private wantLook = new THREE.Vector3();
  private rate = 4;
  private shakeAmt = 0;
  private fovWant = 50;
  calm = false;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  want(pos: THREE.Vector3, look: THREE.Vector3, rate = 4, fov?: number) {
    this.wantPos.copy(pos);
    this.wantLook.copy(look);
    this.rate = rate;
    if (fov) this.fovWant = fov;
  }

  jump() {
    this.pos.copy(this.wantPos);
    this.look.copy(this.wantLook);
    this.camera.fov = this.fovWant;
  }

  shake(amount: number) {
    if (!this.calm) this.shakeAmt = Math.min(0.6, this.shakeAmt + amount);
  }

  update(dt: number) {
    const k = 1 - Math.exp(-dt * this.rate);
    this.pos.lerp(this.wantPos, k);
    this.look.lerp(this.wantLook, k);
    const fov = this.camera.fov + (this.fovWant - this.camera.fov) * k;
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.copy(this.pos);
    if (this.shakeAmt > 0.001) {
      const s = this.shakeAmt;
      this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s * 0.5));
      this.shakeAmt *= Math.exp(-dt * 9);
    }
    this.camera.lookAt(this.look);
  }
}

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  readonly cam: CameraRig;
  /** The chapter's leftovers. */
  readonly mess = new Effects();
  private effects = this.mess;
  private arena: Arena | null = null;
  private readonly bugViews = new Map<number, BugView>();
  private readonly bodyViews = new Map<number, BodyView>();
  private readonly bugLayer = new THREE.Group();
  private readonly foodLayer = new THREE.Group();
  private readonly obstacleLayer = new THREE.Group();
  private readonly sling = slingshot();
  private pouchFood: THREE.Group | null = null;
  private pouchFoodId: FoodId | null = null;
  private recoil = 0;
  private readonly guide: THREE.Sprite[] = [];
  private readonly target: THREE.Mesh;
  readonly mopModel = mop();
  private readonly sun: THREE.DirectionalLight;
  private readonly water: THREE.Object3D;
  private quality: Quality = initialQuality();
  private time = 0;
  private slowFrames = 0;
  private readonly post: Post;
  private grass: THREE.InstancedMesh | null = null;

  constructor(stage: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    // Soft, blurred shadows.
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.78;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    stage.appendChild(this.renderer.domElement);
    this.cam = new CameraRig(this.camera);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.add(backdrop());
    this.scene.add(new THREE.HemisphereLight('#fff3df', '#c98a5a', 0.7));
    // A warm sun from the window side, a cool light from behind for bright edges, and a soft fill.
    this.sun = new THREE.DirectionalLight('#ffe9c9', 2.6);
    this.sun.position.set(-9, 18, 6);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -16;
    sc.right = sc.top = 16;
    sc.near = 1;
    sc.far = 60;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 8;
    this.sun.shadow.blurSamples = 16;
    this.sun.target.position.set(2, 0, 0);
    this.scene.add(this.sun, this.sun.target);
    const back = new THREE.DirectionalLight('#dff1ff', 1.5);
    back.position.set(4, 10, -18);
    const fill = new THREE.DirectionalLight('#ffe6f0', 0.6);
    fill.position.set(10, 6, 16);
    this.scene.add(back, fill);
    this.post = new Post(this.renderer, this.scene, this.camera);

    const k = kitchen();
    this.water = k.getObjectByName('sinkWater')!;
    this.scene.add(k, disc(), this.obstacleLayer, this.bugLayer, this.foodLayer, this.mess.group);
    this.sling.root.position.set(SLING.x, SLING.y - 0.35, SLING.z);
    this.scene.add(this.sling.root);
    this.mopModel.visible = false;
    this.scene.add(this.mopModel);

    for (let i = 0; i < 40; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture, color: '#ffffff', transparent: true, depthWrite: false }));
      s.visible = false;
      this.scene.add(s);
      this.guide.push(s);
    }
    this.target = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 40),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.target.rotation.x = -Math.PI / 2;
    this.target.visible = false;
    this.scene.add(this.target);

    this.applyQuality();
    this.resize();
    this.homeCamera(0);
    addEventListener('resize', () => this.resize());
    this.homeCamera(0);
    this.cam.jump();
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** Portrait phones see less across, so the camera steps back and widens. */
  get portrait(): boolean {
    return this.camera.aspect < 0.85;
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post?.resize();
  }

  setBatterySaver(on: boolean) {
    this.quality = on ? 'low' : initialQuality();
    this.applyQuality();
  }

  private applyQuality() {
    const high = this.quality === 'high';
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, high ? 1.5 : 1));
    this.sun.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.post.setQuality(high);
    this.post.resize();
    // Fewer grass blades on slower devices.
    if (this.grass) this.scene.remove(this.grass);
    this.grass = grassField(DISC_RADIUS, high ? 8000 : 3000);
    this.scene.add(this.grass);
  }

  // --- Level and arena ----------------------------------------------------------------------------

  setLevel(level: Level) {
    this.obstacleLayer.clear();
    for (const o of level.obstacles) this.obstacleLayer.add(obstacleModel(o));
  }

  /** Draws `arena` from now on, with its own `effects` (the replay passes a fresh one). */
  bind(arena: Arena | null, effects: Effects = this.mess) {
    this.arena = arena;
    for (const v of this.bugViews.values()) this.bugLayer.remove(v.model.root);
    this.bugViews.clear();
    for (const v of this.bodyViews.values()) this.foodLayer.remove(v.root);
    this.bodyViews.clear();
    if (effects !== this.effects) {
      this.scene.remove(this.effects.group);
      this.effects = effects;
      this.scene.add(effects.group);
    }
  }

  // --- Aiming ---------------------------------------------------------------------------------------

  /** Puts a food in the pouch (null: empty, while reloading). */
  loadPouch(food: FoodId | null) {
    if (food === this.pouchFoodId) return;
    if (this.pouchFood) this.sling.root.remove(this.pouchFood);
    this.pouchFood = null;
    this.pouchFoodId = food;
    if (!food) return;
    this.pouchFood = foodModel(food);
    this.pouchFood.scale.setScalar(Math.min(0.45, FOODS[food].radius));
    this.pouchFood.userData.pop = 0;
    this.sling.root.add(this.pouchFood);
  }

  /**
   * Shows the pull: the pouch moves back against the aim, and the guide traces the flight for the first
   * `guide` part of it (0 hides it).
   */
  setAim(aim: Aim | null, food: FoodId, guide: number) {
    const pouch = this.sling.pouch.position;
    if (!aim) {
      pouch.set(0, 0.35, 0);
      for (const s of this.guide) s.visible = false;
      this.target.visible = false;
      return;
    }
    const d = aimDir(aim.yaw);
    const pull = 0.25 + aim.power * 1.7;
    pouch.set(-d.x * pull, 0.35 - aim.power * 0.45, -d.z * pull);
    const f = FOODS[food];
    const v = launchVelocity(aim.yaw, rangeFor(aim.power), f.angle, f.gravity);
    const path = predictPath(SLING, v, f.gravity, 0.035);
    const shown = Math.floor(path.length * guide);
    const every = Math.max(1, Math.ceil(path.length / this.guide.length));
    let n = 0;
    for (let i = 2; i < shown && n < this.guide.length; i += every) {
      const s = this.guide[n++];
      s.visible = true;
      s.position.copy(v3(path[i]));
      const k = 1 - i / Math.max(1, path.length);
      s.scale.setScalar(0.28 * (0.5 + k * 0.5));
      s.material.opacity = 0.9 * (1 - (i / Math.max(1, shown)) * 0.6);
    }
    for (; n < this.guide.length; n++) this.guide[n].visible = false;
    const end = path.at(-1);
    this.target.visible = guide >= 0.6 && !!end;
    if (end) {
      this.target.position.set(end.x, groundAt(end.x, end.z) + 0.04, end.z);
      this.target.scale.setScalar(f.area);
    }
  }

  /** The band snaps forward after a shot. */
  fired() {
    this.recoil = 1;
    this.loadPouch(null);
  }

  private updateSling(dt: number) {
    const s = this.sling;
    if (this.recoil > 0) {
      this.recoil = Math.max(0, this.recoil - dt * 4);
      const w = Math.sin(this.recoil * 18) * this.recoil * 0.5;
      s.pouch.position.set(0, 0.35, -w);
    }
    const p = s.pouch.position;
    stretchBand(s.bands[0], s.prongs[0], p.clone().add(new THREE.Vector3(-0.15, 0, 0)), 0.07);
    stretchBand(s.bands[1], s.prongs[1], p.clone().add(new THREE.Vector3(0.15, 0, 0)), 0.07);
    if (this.pouchFood) {
      this.pouchFood.position.copy(p).add(new THREE.Vector3(0, 0.12, 0));
      // Pop in when loaded.
      const pop = (this.pouchFood.userData.pop = Math.min(1, (this.pouchFood.userData.pop as number) + dt * 5));
      const base = Math.min(0.45, FOODS[this.pouchFoodId!].radius);
      this.pouchFood.scale.setScalar(base * (pop < 1 ? 1 + Math.sin(pop * Math.PI) * 0.4 : 1) * Math.max(0.05, pop));
    }
  }

  // --- Camera poses --------------------------------------------------------------------------------

  /** The normal view from behind the slingshot; turns a little with the aim. */
  homeCamera(yaw: number, follow?: Vec3, rate = 4) {
    const portrait = this.portrait;
    // Orbit the middle of the world a little towards the aim.
    const a = yaw * 0.3;
    const back = portrait ? 25 : 18.5;
    const height = portrait ? 14 : 8.5;
    const pos = new THREE.Vector3(Math.sin(a) * back, height, Math.cos(a) * back);
    const look = new THREE.Vector3(Math.sin(a) * 1.5, portrait ? -1 : -1.6, portrait ? -0.5 : 0.6);
    if (follow) look.lerp(v3(follow), 0.15);
    this.cam.want(pos, look, rate, portrait ? 62 : 48);
    this.post.setFocus(1, [0.02, portrait ? 0.68 : 0.66]);
  }

  /** A close-up of a spot, from the side of the flight. */
  impactCamera(at: Vec3, from: { x: number; z: number }, rate = 7, distance = 5) {
    const side = new THREE.Vector3(-from.z, 0, from.x).normalize();
    const pos = v3(at)
      .addScaledVector(side, distance * 0.75)
      .add(new THREE.Vector3(from.x * -distance * 0.6, distance * 0.42 + 0.6, from.z * -distance * 0.6));
    pos.y = Math.max(pos.y, 1.2);
    this.cam.want(pos, v3(at).add(new THREE.Vector3(0, 0.5, 0)), rate, 45);
    this.post.setFocus(1.8, [0.3, 0.6]);
  }

  /** Looking at a spot from an angle around it (the replay's cuts). */
  orbitCamera(at: Vec3, angle: number, distance: number, height: number, rate = 3) {
    const pos = new THREE.Vector3(at.x + Math.sin(angle) * distance, at.y + height, at.z + Math.cos(angle) * distance);
    this.cam.want(pos, v3(at).add(new THREE.Vector3(0, 0.4, 0)), rate, 48);
    this.post.setFocus(1.8, [0.3, 0.62]);
  }

  /** High above, with the sink in view (the mop). */
  overviewCamera(rate = 2) {
    const portrait = this.portrait;
    this.cam.want(
      new THREE.Vector3(portrait ? 7 : 4, portrait ? 34 : 23, portrait ? 24 : 21),
      new THREE.Vector3(portrait ? 6 : 4.5, -1, 0),
      rate,
      portrait ? 62 : 48,
    );
    this.post.setFocus(0.5, [0.15, 0.75]);
  }

  /** A slow turn around the whole world (menus). */
  menuCamera(t: number) {
    const a = Math.sin(t * 0.12) * 0.5;
    const r = this.portrait ? 30 : 22;
    this.cam.want(new THREE.Vector3(Math.sin(a) * r, this.portrait ? 16 : 11, Math.cos(a) * r), new THREE.Vector3(0, 0, 0), 2, this.portrait ? 58 : 46);
    this.post.setFocus(1.2, [0.2, 0.62]);
  }

  /** Where a 3D point is on the screen, in CSS pixels. */
  project(p: Vec3): { x: number; y: number; visible: boolean } {
    const v = v3(p).project(this.camera);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight, visible: v.z < 1 };
  }

  // --- Events ---------------------------------------------------------------------------------------

  /** Turns game events into things to see. */
  show(events: GameEvent[]) {
    for (const e of events) {
      switch (e.type) {
        case 'impact': {
          const n = Math.hypot(e.body.vx, e.body.vz) || 1;
          const effect = e.body.piece === 'slice' ? 'slices' : e.body.food.effect;
          this.effects.burst(effect, e.point, { x: e.body.vx / n, z: e.body.vz / n }, e.body.piece === 'whole' ? 1 : 0.6, e.last);
          const view = this.bodyViews.get(e.body.id);
          if (view) view.wobble = 1;
          this.cam.shake(e.hits.length ? 0.25 + e.body.food.knock * 0.1 : 0.08);
          for (const h of e.hits) this.effects.sparkle(h.bug, 6, h.bug.def.rare ? '#ffd23f' : '#ffffff', 0.7);
          break;
        }
        case 'roll-hit':
          for (const h of e.hits) this.effects.sparkle(h.bug, 6, '#ffffff', 0.7);
          this.cam.shake(0.15);
          break;
        case 'stop':
          this.effects.burst(e.body.piece === 'ring' ? 'rings' : e.body.food.effect, e.body, { x: 0, z: 0 }, 0.5, true);
          break;
        case 'pieces':
          this.effects.sparkle(e.from, 8, '#fff3c4');
          break;
        case 'escape':
          this.effects.sparkle(e.bug, 10, '#ffd23f');
          break;
      }
    }
  }

  // --- The mop --------------------------------------------------------------------------------------

  /** Places the mop's edge at `x` (null hides it) and pushes everything in front of it. */
  mopTo(x: number | null, dt: number): number {
    this.mopModel.visible = x !== null;
    if (x === null) return 0;
    this.mopModel.position.set(x - 0.7, COUNTER_Y + 0.2, 0);
    this.mopModel.rotation.z = Math.sin(this.time * 9) * 0.03;
    let drained = this.effects.sweep(x, dt);
    for (const v of this.bugViews.values()) {
      const b = v.bug;
      if (v.sink > 0 || b.x > x + b.def.radius) continue;
      if (b.state !== 'dazed') {
        // Still walking? Now it's flat on its back too.
        b.state = 'dazed';
        b.t = 0;
      }
      b.x = x + b.def.radius;
      b.z += (SINK.z - b.z) * Math.min(1, dt * 0.6);
      b.y = groundAt(b.x, b.z);
      if (b.x > SINK.x - SINK.radius * 0.7) {
        v.sink = 0.001;
        drained++;
      }
    }
    return drained;
  }

  /** Bubbles in the sink. */
  private updateSink(dt: number) {
    this.water.rotation.z += dt * 2;
  }

  // --- Frame ----------------------------------------------------------------------------------------

  /**
   * Draws a frame. `dt` is real time (camera, UI-ish motion), `gameDt` the slowed game time (bugs, food,
   * debris) so slow motion slows the world but not the camera.
   */
  frame(dt: number, gameDt: number) {
    this.time += dt;
    this.syncBugs(gameDt);
    this.syncBodies(gameDt);
    this.effects.update(gameDt);
    this.updateSling(dt);
    this.updateSink(dt);
    this.cam.update(dt);
    setWindTime(this.time);
    if (this.quality === 'high') this.post.render();
    else this.renderer.render(this.scene, this.camera);
    this.watchSpeed(dt);
  }

  /** Drops to low quality when frames are consistently slow. */
  private watchSpeed(dt: number) {
    if (this.quality === 'low') return;
    this.slowFrames = dt > 1 / 40 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 90) {
      this.quality = 'low';
      this.applyQuality();
    }
  }

  private syncBugs(dt: number) {
    const bugs = this.arena?.bugs ?? [];
    const seen = new Set<number>();
    for (const b of bugs) {
      seen.add(b.id);
      let v = this.bugViews.get(b.id);
      if (!v) {
        const model = bugModel(b.kind);
        v = { bug: b, model, shadow: blob(), scale: b.def.radius * 1.4, squash: 0, sink: 0 };
        model.root.scale.setScalar(0.01);
        this.bugLayer.add(model.root, v.shadow);
        this.bugViews.set(b.id, v);
      }
      this.animateBug(v, dt);
    }
    for (const [id, v] of this.bugViews)
      if (!seen.has(id) || v.bug.state === 'gone') {
        // Pop away.
        const s = v.model.root.scale.x * (1 - Math.min(1, dt * 10));
        v.model.root.scale.setScalar(s);
        v.shadow.visible = false;
        if (s < 0.02 || !seen.has(id)) {
          this.bugLayer.remove(v.model.root, v.shadow);
          this.bugViews.delete(id);
        }
      }
  }

  private animateBug(v: BugView, dt: number) {
    const { bug: b, model: m } = v;
    const t = b.age;
    const root = m.root;
    if (v.sink > 0) {
      v.sink += dt;
      const a = v.sink * 5;
      const r = Math.max(0, 1.8 - v.sink * 1.2);
      root.position.set(SINK.x + Math.cos(a) * r, COUNTER_Y - v.sink * 1.2, SINK.z + Math.sin(a) * r);
      root.rotation.y += dt * 9;
      if (v.sink > 1.5) b.state = 'gone';
      return;
    }
    root.position.set(b.x, b.y, b.z);
    root.rotation.y = b.heading;
    // The contact shadow shrinks and fades as the bug goes up.
    const ground = groundAt(b.x, b.z);
    const lift = Math.max(0, b.y - ground);
    v.shadow.visible = true;
    v.shadow.position.set(b.x, ground + 0.02, b.z);
    v.shadow.scale.setScalar(Math.max(0.2, b.def.radius * 2.6 * (root.scale.x / v.scale) * (1 - Math.min(0.6, lift * 0.15))));

    // Grow in when arriving.
    const grow = Math.min(1, root.scale.x / v.scale + dt * 4);
    let sx = v.scale * grow;
    let sy = sx;
    const body = m.body;
    body.rotation.set(0, 0, 0);
    body.position.set(0, 0, 0);
    m.stars.visible = false;
    const walking = b.state === 'walk' || b.state === 'enter' || b.state === 'leaving';
    if (walking) {
      const step = b.speed * 7;
      body.position.y = Math.abs(Math.sin(t * step * 0.5)) * 0.08;
      sy *= 1 + Math.sin(t * step) * 0.04;
      for (const leg of m.legs) leg.rotation.x = Math.sin(t * step + (leg.userData.phase as number)) * 0.6;
    } else if (b.state === 'hidden') {
      sy *= 0.75;
    } else if (b.state === 'knocked') {
      body.position.y = 0.5;
      body.rotation.set(b.tumble, 0, b.tumble * 0.4);
      for (const leg of m.legs) leg.rotation.x = Math.sin(this.time * 40) * 0.8;
      v.squash = 1;
    } else if (b.state === 'dazed') {
      // On its back, legs wiggling, stars going round.
      body.rotation.z = Math.PI;
      body.position.y = 0.95;
      for (const leg of m.legs) leg.rotation.x = Math.sin(this.time * 18 + (leg.userData.phase as number)) * 0.7;
      m.stars.visible = b.t < 8;
      m.stars.rotation.y = this.time * 4;
      if (v.squash > 0) {
        v.squash = Math.max(0, v.squash - dt * 3);
        const k = Math.sin(v.squash * Math.PI) * 0.35;
        sy *= 1 - k;
        sx *= 1 + k * 0.6;
      }
    }
    // Eyes: look about while walking, go round and round when dizzy.
    const dizzy = b.state === 'knocked' || b.state === 'dazed';
    m.pupils.forEach((p, i) => {
      const a = dizzy ? this.time * 12 + i * Math.PI : Math.sin(t * 0.7 + i) * 0.4;
      const r = dizzy ? 0.22 : 0.12;
      p.position.x = Math.cos(a) * r;
      p.position.y = 0.05 + Math.sin(a) * r * (dizzy ? 1 : 0.3);
    });
    // Wings: big slow flaps for butterflies, a buzz for flies.
    for (const w of m.wings) {
      const side = w.userData.side as number;
      const fast = b.kind === 'fly';
      const flap = dizzy ? 0.2 : fast ? Math.sin(this.time * 60) * 0.5 : Math.sin(this.time * 9) * 0.9;
      w.rotation.z = side * (0.3 + flap);
    }
    if (b.def.rare && walking && Math.random() < dt * 8) this.effects.sparkle(b, 1, '#ffd23f', 0.4);
    if (b.state === 'leaving' || b.state === 'gone') sx = sy = Math.min(sx, root.scale.x);
    root.scale.set(sx, sy, sx);
  }

  private syncBodies(dt: number) {
    const live = new Set<number>();
    for (const shot of this.arena?.shots ?? [])
      for (const b of shot.bodies) {
        if (b.mode === 'done') continue;
        live.add(b.id);
        let v = this.bodyViews.get(b.id);
        if (!v) {
          const root = new THREE.Group();
          const spinner = new THREE.Group();
          spinner.add(foodModel(b.food.id, b.piece));
          root.add(spinner);
          root.scale.setScalar(b.piece === 'whole' ? b.food.radius : b.radius);
          const shadow = blob();
          this.foodLayer.add(root, shadow);
          v = { body: b, root, spinner, shadow, wobble: 0 };
          this.bodyViews.set(b.id, v);
        }
        this.animateBody(v, dt);
      }
    for (const [id, v] of this.bodyViews)
      if (!live.has(id)) {
        this.foodLayer.remove(v.root, v.shadow);
        this.bodyViews.delete(id);
      }
  }

  private animateBody(v: BodyView, dt: number) {
    const b = v.body;
    const root = v.root;
    root.position.set(b.x, b.y, b.z);
    // A shadow straight below shows where the food will come down.
    const ground = groundAt(b.x, b.z);
    v.shadow.position.set(b.x, ground + 0.03, b.z);
    v.shadow.scale.setScalar(Math.max(0.3, b.radius * 2.4 * (1 - Math.min(0.7, (b.y - ground) * 0.08))));
    const base = b.piece === 'whole' ? b.food.radius : b.radius;
    if (b.mode === 'roll') {
      // Roll along the ground.
      const dir = Math.atan2(b.vx, b.vz);
      root.rotation.set(0, dir, 0);
      const sp = Math.hypot(b.vx, b.vz);
      if (b.piece === 'ring') {
        v.spinner.rotation.set(Math.PI / 2, 0, 0);
        v.spinner.children[0].rotation.y += (sp / b.radius) * dt;
      } else v.spinner.rotation.x += (sp / b.radius) * dt;
      root.scale.setScalar(base);
      return;
    }
    // Stretch along the flight and spin.
    const speed = Math.hypot(b.vx, b.vy, b.vz);
    root.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
    const stretch = 1 + Math.min(0.35, speed * 0.012);
    if (v.wobble > 0) {
      // Squashy wobble after a bounce (jelly).
      v.wobble = Math.max(0, v.wobble - dt * 2.5);
      const k = Math.sin(v.wobble * 20) * v.wobble * 0.35;
      root.scale.set(base * (1 + k), base * (1 - k), base * stretch);
    } else root.scale.set(base / Math.sqrt(stretch), base / Math.sqrt(stretch), base * stretch);
    const spin = b.food.id === 'pie' || b.food.id === 'pizza' || b.piece === 'slice' ? 0 : 6;
    v.spinner.rotation.x += spin * dt;
    if (b.food.id === 'pizza' || b.piece === 'slice' || b.food.id === 'cookie') v.spinner.rotation.y += 10 * dt;
  }
}

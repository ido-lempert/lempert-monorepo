/**
 * The 3D scene: the round world on the kitchen counter, the slingshot, the bugs and the food. It draws
 * whatever Arena it is bound to (the chapter, or a staged replay shot), turns game events into effects,
 * and moves the camera where the director (play.ts) asks. Game rules live in src/game.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Arena, Body, GameEvent } from '../game/arena';
import { type Bug, footprint } from '../game/bugs';
import { FOODS, type FoodId } from '../game/foods';
import { type Level, LEVELS } from '../game/levels';
import type { SkinId } from '../game/progress';
import { type Aim, aimDir, field, groundAt, onDisc, launchVelocity, predictPath, rangeFor, slingAt, type Vec3 } from '../game/physics';
import { AcidView } from './acid';
import { FriendView } from './friend';
import { WeatherView } from './weather';
import { Effects, SMEAR } from './effects';
import { backdrop, blobTexture, dotTexture, grassField, initialQuality, mat, type Quality, setOutlines, setWindTime } from './look';
import { free, share } from './optimize';
import { Post } from './post';
import { type GfxStats, log } from '../debug';
import { bugModel, setBugDetail, type BugModel } from './bugs3d';
import { disc, foodModel, kitchen, kitchenProps, mop, obstacleModel, slingshot, stretchBand } from './models';
import { THEMES } from './themes';

/** A soft round shadow right under something, so it's easy to see where it is above the ground. */
const blobGeo = share(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
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
  /** Swept off the world by the mop (seconds). */
  swept: number;
  /** Seconds until the next blink. */
  blink: number;
  /** Food smeared on it so far. */
  goo: number;
}

interface BodyView {
  body: Body;
  root: THREE.Group;
  spinner: THREE.Group;
  shadow: THREE.Mesh;
  wobble: number;
}

const v3 = (p: Vec3) => new THREE.Vector3(p.x, p.y, p.z);
const gooGeo = share(new THREE.SphereGeometry(1, 16, 12));

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

const DARK_SUN = new THREE.Color('#8aa4ff');
const DARK_SKY = [new THREE.Color('#080b26'), new THREE.Color('#141240'), new THREE.Color('#221a40')];

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
  private readonly acid = new AcidView();
  private readonly friend = new FriendView();
  private readonly weather = new WeatherView();
  private sling = slingshot();
  private pouchFood: THREE.Group | null = null;
  private pouchFoodId: FoodId | null = null;
  private recoil = 0;
  private readonly guide: THREE.Sprite[] = [];
  private readonly target: THREE.Mesh;
  private mopModel = mop(7.5);
  private readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly sky: THREE.Mesh;
  /** How dark a dark chapter is right now (0 daylight .. 1 night); it eases back to 0 while a caught firefly lights the world. */
  private dim = 0;
  private dimApplied = -1;
  private readonly lit = { sun: 2.6, hemi: 0.55, sunColor: new THREE.Color(), sky: [new THREE.Color(), new THREE.Color(), new THREE.Color()] };
  private ground: THREE.Group | null = null;
  private level: Level = LEVELS[0];
  private quality: Quality = initialQuality();
  private time = 0;
  private battery = false;
  /** Resolution multiplier the world lowers when frames are slow and raises again when there is room. */
  private resScale = 1;
  private scaleCeiling = 1;
  private frameAvg = 1 / 60;
  private lastFrameAt = 0;
  private holdUntil = 0;
  private fastFor = 0;
  private lastRaise = -Infinity;
  private readonly post: Post;
  private grass: THREE.InstancedMesh | null = null;

  constructor(stage: HTMLElement) {
    // Edge smoothing costs memory and fill on phones, which start in low quality (they still get a sharp picture from the pixel ratio).
    this.renderer = new THREE.WebGLRenderer({ antialias: this.quality === 'high', powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = this.quality === 'high' ? THREE.VSMShadowMap : THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.66;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // The post-processing draws in several passes: count the whole frame, reset by hand once per frame.
    this.renderer.info.autoReset = false;
    stage.appendChild(this.renderer.domElement);
    this.watchContext(this.renderer.domElement);
    this.logCapabilities();
    this.cam = new CameraRig(this.camera);

    this.makeEnvironment();
    this.sky = backdrop();
    this.scene.add(this.sky);
    this.hemi = new THREE.HemisphereLight('#fff3df', '#a8704a', 0.55);
    this.scene.add(this.hemi);
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
    this.post = new Post(this.renderer, this.scene, this.camera, this.quality === 'high');

    this.scene.add(kitchen(), this.obstacleLayer, this.bugLayer, this.foodLayer, this.mess.group, this.acid.group, this.friend.group, this.weather.group);
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
    this.setLevel(LEVELS[0]);
    this.resize();
    this.homeCamera(0);
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 300));
    visualViewport?.addEventListener('resize', () => this.resize());
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
    // Mobile browsers report 0x0 for a moment while rotating or moving toolbars: a NaN aspect blanks the whole view.
    if (w < 1 || h < 1) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post?.resize();
  }

  /** Called when the 3D view stayed lost for a few seconds (the game decides how to come back). */
  onLost: () => void = () => location.reload();

  /** The reflections live only on the graphics chip, so a lost view needs them made again. */
  private makeEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment?.dispose();
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }

  /**
   * A phone can drop the 3D view when it is overloaded. Polled, not only on events: a browser that has given up on
   * the page hands it a view that is lost from the start, and no event ever comes.
   */
  private watchContext(canvas: HTMLCanvasElement) {
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      log('gl', `webglcontextlost event ${this.describeState()}`);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      log('gl', `webglcontextrestored event (page ${document.visibilityState}): rebuilding in low quality`);
      this.quality = 'low';
      this.applyQuality();
      // The reflections are drawn by the graphics chip, and a context restored while the screen is off can silently draw
      // nothing (a real phone came back all black): wait until the page is visible and has drawn a few frames.
      this.settle = 0;
      this.envPending = true;
    });
    const gl = this.renderer.getContext();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !this.envPending) this.checkIn = 30;
    });
    let lostFor = 0;
    setInterval(() => {
      lostFor = gl.isContextLost() ? lostFor + 1 : 0;
      if (lostFor === 1) log('gl', `context is lost (poll) ${this.describeState()}`);
      if (lostFor === 3) {
        log('gl', 'context still lost after 3s: asking the game to recover');
        this.onLost();
      }
    }, 1000);
  }

  /**
   * A phone can bring the 3D view back after it was lost (or while the screen was off) and then draw only black. Read a
   * few pixels right after drawing: if all are black the view is useless, and reloading is the proven way back.
   */
  private checkBlack() {
    const gl = this.renderer.getContext();
    if (gl.isContextLost() || this.level.effects?.includes('dark')) return;
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const px = new Uint8Array(4);
    let brightest = 0;
    for (const [fx, fy] of [[0.2, 0.3], [0.5, 0.3], [0.8, 0.3], [0.2, 0.5], [0.5, 0.5], [0.8, 0.5], [0.2, 0.7], [0.5, 0.7], [0.8, 0.7]]) {
      gl.readPixels(Math.floor(w * fx), Math.floor(h * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      brightest = Math.max(brightest, px[0], px[1], px[2]);
    }
    if (brightest < 12) {
      log('gl', `screen check: BLACK (brightest sample ${brightest}), asking the game to recover`);
      this.onLost();
    } else log('gl', `screen check ok (brightest sample ${brightest})`);
  }

  private describeState() {
    return `quality ${this.quality} res ${this.resScale.toFixed(2)} calls ${this.renderer.info.render.calls} geo ${this.renderer.info.memory.geometries} tex ${this.renderer.info.memory.textures} prog ${this.renderer.info.programs?.length ?? '?'}`;
  }

  private logCapabilities() {
    const gl = this.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = dbg ? `${gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)} / ${gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)}` : String(gl.getParameter(gl.RENDERER));
    this.gpuName = gpu;
    log(
      'gl',
      `${gl instanceof WebGL2RenderingContext ? 'WebGL2' : 'WebGL1'} ${gpu} | max texture ${gl.getParameter(gl.MAX_TEXTURE_SIZE)} | max varyings ${gl.getParameter(gl.MAX_VARYING_VECTORS)} | max samples ${gl instanceof WebGL2RenderingContext ? gl.getParameter(gl.MAX_SAMPLES) : 0} | start quality ${this.quality} | lost at start: ${gl.isContextLost()}`,
    );
  }

  gpuName = '';
  private envPending = false;
  private settle = 0;
  /** Frames left before the screen is checked for black (after a restore or coming back to the page). */
  private checkIn = 0;
  private cpuMs = 0;

  /** For the crash test in the developer menu: the browser really drops the view, as a phone does when it is overloaded. */
  loseContext() {
    const ext = this.renderer.getContext().getExtension('WEBGL_lose_context');
    log('gl', 'test: losing the context on purpose');
    ext?.loseContext();
    return Boolean(ext);
  }

  /** Numbers for the developer overlay and report. Walks the whole scene, so call it a few times a second at most. */
  debugStats(): GfxStats {
    const info = this.renderer.info;
    const geos = new Set<THREE.BufferGeometry>();
    const texs = new Set<THREE.Texture>();
    let meshes = 0;
    let total = 0;
    let instances = 0;
    let casters = 0;
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh && !(o as THREE.Points).isPoints && !(o as THREE.Line).isLine && !(o as THREE.Sprite).isSprite) return;
      total++;
      if (o.visible) meshes++;
      if (m.castShadow) casters++;
      if ((m as THREE.InstancedMesh).isInstancedMesh) instances += (m as THREE.InstancedMesh).count;
      if (m.geometry) geos.add(m.geometry);
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const x of mats) for (const v of Object.values(x)) if (v && (v as THREE.Texture).isTexture) texs.add(v as THREE.Texture);
    });
    if (this.scene.environment) texs.add(this.scene.environment);
    let geoBytes = 0;
    for (const g of geos) {
      for (const a of Object.values(g.attributes)) geoBytes += a.array.byteLength;
      if (g.index) geoBytes += g.index.array.byteLength;
    }
    let texBytes = 0;
    for (const t of texs) {
      const img = t.image as { width?: number; height?: number } | undefined;
      if (img?.width && img.height) texBytes += img.width * img.height * 4 * (t.generateMipmaps ? 1.33 : 1);
    }
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const shadow = this.sun.shadow.map ? this.sun.shadow.mapSize.x * this.sun.shadow.mapSize.y * 4 * (this.quality === 'high' ? 3 : 1) : 0;
    const MB = 1 / 1048576;
    return {
      calls: info.render.calls,
      triangles: info.render.triangles,
      lines: info.render.lines,
      points: info.render.points,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      meshes,
      meshesTotal: total,
      instances,
      casters,
      sceneGeometries: geos.size,
      sceneTextures: texs.size,
      geometryMB: geoBytes * MB,
      textureMB: texBytes * MB,
      canvasMB: size.x * size.y * 4 * 3 * MB,
      shadowMB: shadow * MB,
      canvas: `${size.x}x${size.y}`,
      pixelRatio: this.renderer.getPixelRatio(),
      resScale: this.resScale,
      quality: this.quality,
      battery: this.battery,
      lost: this.renderer.getContext().isContextLost(),
      cpuMs: this.cpuMs,
    };
  }

  /** What the arena holds right now, for the report. */
  debugArena() {
    return { bugs: this.arena?.bugs.length ?? 0, bugViews: this.bugViews.size, bodyViews: this.bodyViews.size };
  }

  setBatterySaver(on: boolean) {
    this.battery = on;
    this.quality = on ? 'low' : initialQuality();
    this.resScale = this.scaleCeiling = 1;
    this.applyQuality();
  }

  private applyQuality() {
    const high = this.quality === 'high';
    log('gl', `quality -> ${this.quality} (battery ${this.battery}) ${this.describeState()}`);
    // Soft blurred shadows (VSM, several passes) only on high; low uses the cheap filter and a smaller map.
    const type = high ? THREE.VSMShadowMap : THREE.PCFShadowMap;
    if (this.renderer.shadowMap.type !== type) {
      this.renderer.shadowMap.type = type;
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        for (const x of Array.isArray(m) ? m : m ? [m] : []) x.needsUpdate = true;
      });
    }
    this.sun.shadow.radius = high ? 8 : 2;
    this.sun.shadow.blurSamples = 16;
    this.applyResolution();
    const size = high ? 1024 : 512;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    setOutlines(high);
    setBugDetail(high);
    this.scene.traverse((o) => {
      if (o.userData.rimShadow) o.castShadow = high;
    });
    if (!high) this.bugLayer.traverse((o) => (o.castShadow = false));
    this.post.setQuality(high);
    this.post.resize();
    this.plantGrass();
  }

  /** The canvas resolution: capped by tier, then scaled down while the device cannot keep up. */
  private applyResolution() {
    const cap = this.quality === 'high' ? 1.5 : 1.25;
    log('gl', `resolution scale ${this.resScale.toFixed(2)} pixel ratio ${(Math.min(devicePixelRatio, cap) * this.resScale).toFixed(2)}`);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, cap) * this.resScale);
  }

  /** Grass blades for the world's size and theme (fewer on slower devices). */
  private plantGrass() {
    if (this.grass) {
      this.scene.remove(this.grass);
      this.grass.geometry.dispose();
    }
    const look = THEMES[this.level.theme].blades;
    const area = (this.level.radius / 7.5) ** 2;
    const high = this.quality === 'high';
    const count = Math.round((high ? 10000 : 3000) * area * look.amount);
    this.grass = count > 0 ? grassField(this.level.radius, count, look, (x, z) => onDisc(x, z, 0.3), high ? 3 : 2) : null;
    if (this.grass) this.scene.add(this.grass);
  }

  // --- Level and arena ----------------------------------------------------------------------------

  /** Dresses the world for a chapter: its theme and size, obstacles, and the light (night is darker). */
  setLevel(level: Level) {
    const theme = level.theme;
    const changed = !this.ground || this.level.theme !== theme || this.level.radius !== level.radius || this.level.shape !== level.shape;
    this.level = level;
    field.radius = level.radius;
    field.shape = level.shape;
    for (const o of this.obstacleLayer.children) free(o);
    this.obstacleLayer.clear();
    for (const o of level.obstacles) this.obstacleLayer.add(obstacleModel(o));
    this.setSlingAngle(field.angle);
    if (!changed) return;
    this.dropGround();
    this.ground = disc(theme, level.radius, level.shape);
    this.scene.add(this.ground);
    this.plantGrass();
    this.scene.remove(this.mopModel);
    free(this.mopModel);
    this.mopModel = mop(level.radius);
    this.mopModel.visible = false;
    this.scene.add(this.mopModel);
    const night = !!THEMES[theme].night;
    this.lit.sun = night ? 1.1 : 2.6;
    this.lit.hemi = night ? 0.3 : 0.55;
    this.lit.sunColor.set(night ? '#9fb8ff' : '#ffe9c9');
    this.hemi.color.set(night ? '#8090ff' : '#fff3df');
    this.lit.sky[0].set(night ? '#1a1f4a' : '#5fb0e6');
    this.lit.sky[1].set(night ? '#3a2f6a' : '#efcf9c');
    this.lit.sky[2].set(night ? '#5a3f6a' : '#d99a64');
    this.dimApplied = -1;
  }

  private darkTarget(): number {
    const a = this.arena;
    return a?.dark ? 1 - Math.min(1, a.light / 1.5) : 0;
  }

  /** A dark chapter dims the sun, the sky and the room until a firefly is caught. */
  private dimLights(dt: number) {
    this.dim += (this.darkTarget() - this.dim) * Math.min(1, dt * 3);
    if (Math.abs(this.dim - this.dimApplied) < 0.002) return;
    this.dimApplied = this.dim;
    const k = this.dim;
    this.sun.intensity = this.lit.sun * (1 - 0.8 * k);
    this.hemi.intensity = this.lit.hemi * (1 - 0.4 * k);
    this.scene.environmentIntensity = 1 - 0.86 * k;
    this.sun.color.copy(this.lit.sunColor).lerp(DARK_SUN, k);
    const u = (this.sky.material as THREE.ShaderMaterial).uniforms;
    ['top', 'middle', 'bottom'].forEach((name, i) => u[name].value.copy(this.lit.sky[i]).lerp(DARK_SKY[i], k));
  }

  /** Repaints the slingshot (colours unlocked with stars). */
  setSkin(skin: SkinId) {
    const old = this.sling;
    this.sling = slingshot(skin);
    this.sling.root.position.copy(old.root.position);
    this.sling.root.rotation.copy(old.root.rotation);
    if (this.pouchFood) this.sling.root.add(this.pouchFood);
    this.scene.remove(old.root);
    free(old.root);
    this.scene.add(this.sling.root);
  }

  /** Once the ready-made models have loaded: the kitchen things, and a fresh world with them on its rim. */
  assetsLoaded() {
    this.scene.add(kitchenProps());
    this.dropGround();
    this.setLevel(this.level);
    if (this.pouchFoodId) {
      const id = this.pouchFoodId;
      this.pouchFoodId = null;
      this.loadPouch(id);
    }
  }

  /** Clears every last crumb, splat and dizzy bug (after the mop). */
  cleanUp() {
    this.effects.clear();
    for (const v of this.bugViews.values()) v.bug.state = 'gone';
  }

  /** Moves the slingshot around the world (it always faces the middle). */
  setSlingAngle(angle: number) {
    const s = slingAt(angle);
    this.sling.root.position.set(s.x, s.y - 0.35, s.z);
    this.sling.root.rotation.y = angle;
  }

  private dropGround() {
    if (!this.ground) return;
    this.scene.remove(this.ground);
    free(this.ground);
    this.ground = null;
  }

  private dropBug(v: BugView) {
    this.bugLayer.remove(v.model.root, v.shadow);
    free(v.model.root);
  }

  private dropBody(v: BodyView) {
    this.foodLayer.remove(v.root, v.shadow);
    free(v.root);
  }

  /** Draws `arena` from now on, with its own `effects` (the replay passes a fresh one). */
  bind(arena: Arena | null, effects: Effects = this.mess) {
    this.arena = arena;
    this.acid.clear();
    this.friend.clear();
    this.weather.clear();
    this.dim = this.darkTarget();
    for (const v of this.bugViews.values()) this.dropBug(v);
    this.bugViews.clear();
    for (const v of this.bodyViews.values()) this.dropBody(v);
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
    if (this.pouchFood) {
      this.sling.root.remove(this.pouchFood);
      free(this.pouchFood);
    }
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
    // In the slingshot's own space, where yaw 0 is straight ahead (-z).
    const d = aimDir(aim.yaw, 0);
    const pull = 0.25 + aim.power * 1.7;
    pouch.set(-d.x * pull, 0.35 - aim.power * 0.45, -d.z * pull);
    const f = FOODS[food];
    const v = launchVelocity(aim.yaw, rangeFor(aim.power), f.angle, f.gravity);
    const path = predictPath(slingAt(), v, f.gravity, 0.035);
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
    // Wide screens show the world from further off, so the slingshot is drawn bigger to stay easy to see.
    s.root.scale.setScalar(this.portrait ? 1 : 1.25);
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

  /** How much bigger than the first world this one is (cameras step back to match). */
  private get scale(): number {
    // Only part of the way: bigger worlds are seen a little smaller, but bugs stay easy to see.
    return 1 + (this.level.radius / 7.5 - 1) * 0.55;
  }

  /** Turns a point around the middle of the world to where the slingshot stands. */
  private aroundSling(v: THREE.Vector3): THREE.Vector3 {
    return v.applyAxisAngle(new THREE.Vector3(0, 1, 0), field.angle);
  }

  /** The normal view from behind the slingshot; turns a little with the aim. */
  homeCamera(yaw: number, follow?: Vec3, rate = 4) {
    const portrait = this.portrait;
    const k = this.scale;
    // Orbit the middle of the world a little towards the aim.
    const a = yaw * 0.3;
    const back = (portrait ? 25 : 15.5) * k;
    const height = (portrait ? 14 : 8) * k;
    const pos = this.aroundSling(new THREE.Vector3(Math.sin(a) * back, height, Math.cos(a) * back));
    const look = this.aroundSling(new THREE.Vector3(Math.sin(a) * 1.5, (portrait ? -1 : -1.6) * k, (portrait ? -0.5 * k : this.landscapeLookZ(k))));
    if (follow) look.lerp(v3(follow), 0.15);
    this.cam.want(pos, look, rate, portrait ? 62 : 53);
    this.post.setFocus(0.8, [0.02, portrait ? 0.74 : 0.76]);
  }

  /** Where a wide screen looks along the aim: a fixed (scaled) distance short of the slingshot, so it stays in view whatever the world's size and shape. */
  private landscapeLookZ(k: number): number {
    const s = slingAt();
    return Math.hypot(s.x, s.z) - 6.9 * k;
  }

  /** A close-up of a spot, from the side of the flight. */
  impactCamera(at: Vec3, from: { x: number; z: number }, rate = 7, distance = 5) {
    // A narrow phone screen needs to step back to keep the whole bug (and its flight) in view.
    distance *= this.closeUpScale;
    const target = v3(at).add(new THREE.Vector3(0, 0.5, 0));
    const place = (sideSign: number, lift: number) => {
      const side = new THREE.Vector3(-from.z, 0, from.x).normalize().multiplyScalar(sideSign);
      const pos = v3(at)
        .addScaledVector(side, distance * 0.75)
        .add(new THREE.Vector3(from.x * -distance * 0.6, distance * (0.42 + lift) + 0.6, from.z * -distance * 0.6));
      pos.y = Math.max(pos.y, 1.2);
      return pos;
    };
    // Pick the side where no mushroom, cup or fence is in the way; failing that, look from higher up.
    const pick = this.lastSide ?? 1;
    let pos = place(pick, 0);
    if (this.blocked(pos, target)) {
      const other = place(-pick, 0);
      if (!this.blocked(other, target)) {
        pos = other;
        this.lastSide = -pick;
      } else pos = place(pick, 0.9);
    } else this.lastSide = pick;
    this.cam.want(pos, target, rate, 45);
    this.post.setFocus(1.6, [0.2, 0.78]);
  }

  private lastSide: number | null = null;

  /** Whether an obstacle stands between the camera and what it looks at. */
  private blocked(from: THREE.Vector3, to: THREE.Vector3): boolean {
    for (const o of this.level.obstacles) {
      for (let k = 0.15; k < 0.95; k += 0.1) {
        const p = from.clone().lerp(to, k);
        if (p.y > o.height + 0.3) continue;
        if (footprint(o, p.x, p.z).d < 0.3) return true;
      }
    }
    return false;
  }


  /** Looking at a spot from an angle around it (the replay's cuts). */
  orbitCamera(at: Vec3, angle: number, distance: number, height: number, rate = 3) {
    const pos = new THREE.Vector3(at.x + Math.sin(angle) * distance, at.y + height, at.z + Math.cos(angle) * distance);
    this.cam.want(pos, v3(at).add(new THREE.Vector3(0, 0.4, 0)), rate, 48);
    this.post.setFocus(1.6, [0.2, 0.78]);
  }

  /** How much further a close-up must be on this screen (phones in portrait are narrow). */
  get closeUpScale(): number {
    return Math.max(1, 1 / Math.min(1, this.camera.aspect));
  }

  /** High above the whole world (the mop and the results). */
  overviewCamera(rate = 2) {
    const portrait = this.portrait;
    const k = this.scale;
    this.cam.want(new THREE.Vector3(0, (portrait ? 34 : 22) * k, (portrait ? 20 : 17) * k), new THREE.Vector3(0, -1, 0), rate, portrait ? 62 : 48);
    this.post.setFocus(0.5, [0.15, 0.75]);
  }

  /** A slow turn around the whole world (menus). */
  menuCamera(t: number) {
    const a = Math.sin(t * 0.12) * 0.5;
    const k = this.scale;
    const r = (this.portrait ? 30 : 22) * k;
    this.cam.want(new THREE.Vector3(Math.sin(a) * r, (this.portrait ? 16 : 11) * k, Math.cos(a) * r), new THREE.Vector3(0, 0, 0), 2, this.portrait ? 58 : 46);
    this.post.setFocus(1.2, [0.2, 0.62]);
  }

  /** The spot on the grass under a point of the screen (null when it points above the horizon). */
  groundPoint(clientX: number, clientY: number): Vec3 | null {
    const ndc = new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    return hit ? { x: hit.x, y: 0, z: hit.z } : null;
  }

  /** Where a 3D point is on the screen, in CSS pixels. */
  project(p: Vec3): { x: number; y: number; visible: boolean } {
    const v = v3(p).project(this.camera);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight, visible: v.z < 1 };
  }

  // --- Events ---------------------------------------------------------------------------------------

  /** Turns game events into things to see. */
  show(events: GameEvent[]) {
    this.friend.show(events, this.effects);
    this.weather.show(events, this.effects);
    for (const e of events) {
      switch (e.type) {
        case 'splat':
        case 'dodged':
        case 'blocked': {
          // A puddle where it came down (the umbrella only gets a few drops).
          const at = { x: e.acid.to.x, y: groundAt(e.acid.to.x, e.acid.to.z), z: e.acid.to.z };
          if (e.type !== 'blocked') this.effects.splat(at, e.type === 'splat' ? 2.6 : 2, '#7bd62a', { x: 0, z: 1 });
          this.effects.dust(at, '#9be83a', e.type === 'blocked' ? 0.5 : 1, e.type === 'blocked' ? 6 : 12);
          break;
        }
        case 'impact': {
          const n = Math.hypot(e.body.vx, e.body.vz) || 1;
          const effect = e.body.piece === 'slice' ? 'slices' : e.body.food.effect;
          this.effects.burst(effect, e.point, { x: e.body.vx / n, z: e.body.vz / n }, e.body.piece === 'whole' ? 1 : 0.6, e.last);
          const view = this.bodyViews.get(e.body.id);
          if (view) view.wobble = 1;
          this.cam.shake(e.hits.length ? 0.25 + e.body.food.knock * 0.1 : 0.08);
          for (const h of e.hits) {
            this.effects.sparkle(h.bug, 6, h.bug.def.rare ? '#ffd23f' : '#ffffff', 0.7);
            if (!h.blocked) this.smearBug(h.bug, SMEAR[effect]);
          }
          break;
        }
        case 'roll-hit':
          for (const h of e.hits) {
            this.effects.sparkle(h.bug, 6, '#ffffff', 0.7);
            this.smearBug(h.bug, SMEAR[e.body.piece === 'ring' ? 'rings' : e.body.food.effect]);
          }
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

  /** Food stuck on a bug that was hit: a glossy blob on its back and a splodge on its face, which stay. */
  private smearBug(b: Bug, color: string) {
    const v = this.bugViews.get(b.id);
    if (!v || v.goo >= 3) return;
    v.goo++;
    const m = mat(color, { rough: 0.25, clearcoat: 1, rim: 0.15 });
    const spots: [number, number, number, number][] = [
      [0.05, 0.95, -0.25, 0.32],
      [-0.12, 0.92, 0.55, 0.2],
      [0.2, 0.7, -0.55, 0.22],
    ];
    const [x, y, z, r] = spots[v.goo - 1];
    for (const p of v.model.parts) {
      const blob = new THREE.Mesh(gooGeo, m);
      blob.position.set(x, y, z);
      blob.scale.set(r * 1.2, r * 0.55, r);
      blob.rotation.y = v.goo;
      // A drip running down.
      const drip = new THREE.Mesh(gooGeo, m);
      drip.position.set(x + r * 0.4, y - r * 0.5, z + r * 0.3);
      drip.scale.set(r * 0.3, r * 0.6, r * 0.3);
      p.body.add(blob, drip);
    }
  }

  // --- The mop --------------------------------------------------------------------------------------

  /** Where the mop takes everything: off the side of the screen. */
  get mopEnd(): number {
    return this.level.radius + 14 * this.scale;
  }

  /** Places the mop's edge at `x` (null hides it) and pushes everything in front of it off the screen. */
  mopTo(x: number | null, dt: number): number {
    this.mopModel.visible = x !== null;
    if (x === null) return 0;
    this.mopModel.position.set(x - 0.7, -0.6, 0);
    this.mopModel.rotation.z = Math.sin(this.time * 9) * 0.03;
    const gone = this.level.radius + 8 * this.scale;
    let swept = this.effects.sweep(x, dt, gone);
    for (const v of this.bugViews.values()) {
      const b = v.bug;
      if (v.swept > 0 || b.x > x + b.def.radius) continue;
      if (b.state !== 'dazed') {
        // Still walking? Now it's flat on its back too.
        b.state = 'dazed';
        b.t = 0;
      }
      b.x = x + b.def.radius;
      b.y = groundAt(b.x, b.z);
      if (b.x > gone) {
        v.swept = 0.001;
        swept++;
      }
    }
    return swept;
  }

  // --- Frame ----------------------------------------------------------------------------------------

  /**
   * Draws a frame. `dt` is real time (camera, UI-ish motion), `gameDt` the slowed game time (bugs, food,
   * debris) so slow motion slows the world but not the camera.
   */
  frame(dt: number, gameDt: number) {
    const began = performance.now();
    this.renderer.info.reset();
    if (this.envPending && !document.hidden && ++this.settle > 10) {
      this.envPending = false;
      this.makeEnvironment();
      this.checkIn = 20;
    }
    this.time += dt;
    this.syncBugs(gameDt);
    this.syncBodies(gameDt);
    this.acid.update(this.arena, gameDt, this.time, this.effects);
    this.friend.update(this.arena, gameDt, this.time);
    this.weather.update(this.arena, gameDt, this.time, this.quality === 'high', this.effects);
    this.dimLights(dt);
    this.effects.update(gameDt);
    this.updateSling(dt);
    this.cam.update(dt);
    setWindTime(this.time);
    if (this.quality === 'high') this.post.render();
    else this.renderer.render(this.scene, this.camera);
    if (this.checkIn > 0 && --this.checkIn === 0) this.checkBlack();
    this.cpuMs += (performance.now() - began - this.cpuMs) * 0.1;
    this.watchSpeed();
  }

  /**
   * Keeps the frame rate up on weak devices: when frames are consistently slow it first drops to low quality, then
   * lowers the resolution step by step; it raises the resolution again slowly when there is room (never past the
   * level that was too slow last time).
   */
  private watchSpeed() {
    const now = performance.now();
    const real = (now - this.lastFrameAt) / 1000;
    this.lastFrameAt = now;
    if (real > 0.4 || real <= 0) return; // a hitch (tab in the background, a menu) says nothing about speed
    this.frameAvg += (real - this.frameAvg) * 0.08;
    if (now < this.holdUntil) return;
    const expected = this.battery ? 1 / 30 : 1 / 60;
    if (this.frameAvg > expected * 1.5) {
      this.fastFor = 0;
      this.holdUntil = now + 2500;
      if (this.quality === 'high') {
        this.quality = 'low';
        this.applyQuality();
      } else if (this.resScale > 0.55) {
        if (now - this.lastRaise < 12000) this.scaleCeiling = Math.max(0.55, this.resScale - 0.15);
        this.resScale = Math.max(0.55, this.resScale - 0.15);
        this.applyResolution();
        this.post.resize();
      }
      this.frameAvg = expected;
    } else if (this.resScale < this.scaleCeiling && this.frameAvg < expected * 1.1) {
      this.fastFor += real;
      if (this.fastFor > 6) {
        this.fastFor = 0;
        this.resScale = Math.min(this.scaleCeiling, this.resScale + 0.1);
        this.lastRaise = now;
        this.applyResolution();
        this.post.resize();
      }
    } else this.fastFor = 0;
  }

  private syncBugs(dt: number) {
    const bugs = this.arena?.bugs ?? [];
    const seen = new Set<number>();
    for (const b of bugs) {
      seen.add(b.id);
      let v = this.bugViews.get(b.id);
      if (!v) {
        const model = bugModel(b.kind, b.boss);
        v = { bug: b, model, shadow: blob(), scale: b.def.radius * 1.55, squash: 0, swept: 0, blink: 1 + Math.random() * 3, goo: 0 };
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
          this.dropBug(v);
          this.bugViews.delete(id);
        }
      }
  }

  private animateBug(v: BugView, dt: number) {
    const { bug: b, model: m } = v;
    const t = b.age;
    const root = m.root;
    if (v.swept > 0) {
      // Off the side of the screen: shrink away.
      v.swept += dt;
      root.scale.multiplyScalar(1 - Math.min(0.5, dt * 4));
      v.shadow.visible = false;
      if (v.swept > 0.6) b.state = 'gone';
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
    m.stars.visible = false;
    const walking = b.state === 'walk' || b.state === 'enter' || b.state === 'leaving';
    const dizzy = b.state === 'knocked' || b.state === 'dazed';
    // Blink now and then.
    v.blink -= dt;
    if (v.blink < -0.12) v.blink = 1.5 + Math.random() * 3;
    const eyeOpen = v.blink < 0 ? 0.1 : 1;
    if (b.state === 'dazed') {
      m.stars.visible = b.t < 8;
      m.stars.rotation.y = this.time * 4;
      if (v.squash > 0) {
        v.squash = Math.max(0, v.squash - dt * 3);
        const k = Math.sin(v.squash * Math.PI) * 0.35;
        sy *= 1 - k;
        sx *= 1 + k * 0.6;
      }
    } else if (b.state === 'knocked') v.squash = 1;
    else if (b.state === 'hidden') sy *= 0.75;
    if (walking) sy *= 1 + Math.sin(t * b.speed * 7) * 0.04;
    // A king: squashes when hit, and hides in a bubble while it can't be hurt.
    if (b.boss) {
      if (b.hurt > 0) {
        const k = Math.sin((b.hurt / 0.6) * Math.PI) * 0.25;
        sy *= 1 - k;
        sx *= 1 + k;
      }
      if (m.bubble) {
        m.bubble.visible = b.shelled > 0;
        m.bubble.rotation.y = this.time;
        m.bubble.scale.setScalar(1.25 + Math.sin(this.time * 6) * 0.04);
      }
    }
    for (const p of m.parts) {
      const body = p.body;
      body.rotation.set(0, 0, 0);
      body.position.set(0, 0, 0);
      if (walking) {
        const step = b.speed * 7;
        body.position.y = Math.abs(Math.sin(t * step * 0.5)) * 0.08;
        body.rotation.z = Math.sin(t * step * 0.5) * 0.06;
        for (const leg of p.legs) leg.rotation.x = Math.sin(t * step + (leg.userData.phase as number)) * 0.6;
      } else if (b.state === 'knocked') {
        body.position.y = 0.5;
        body.rotation.set(b.tumble, 0, b.tumble * 0.4);
        for (const leg of p.legs) leg.rotation.x = Math.sin(this.time * 40) * 0.8;
      } else if (b.state === 'dazed') {
        // On its back, legs wiggling.
        body.rotation.z = Math.PI;
        body.position.y = 1.1;
        for (const leg of p.legs) leg.rotation.x = Math.sin(this.time * 18 + (leg.userData.phase as number)) * 0.7;
      }
      for (const e of p.eyes) {
        e.visible = !dizzy;
        e.scale.y = eyeOpen;
      }
      for (const sw of p.dizzy) {
        sw.visible = dizzy;
        sw.rotation.z = -this.time * 8;
      }
      p.oh.visible = b.state === 'knocked' || (b.boss !== undefined && b.hurt > 0);
      p.smile.visible = !p.oh.visible;
      // Wings: big slow flaps for butterflies, a buzz for flies.
      for (const w of p.wings) {
        const side = w.userData.side as number;
        const fast = b.kind === 'fly' || b.boss?.look === 'fly';
        const flap = dizzy ? 0.2 : fast ? Math.sin(this.time * 60) * 0.5 : Math.sin(this.time * 9) * 0.9;
        w.rotation.z = side * (0.3 + flap);
      }
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
          root.scale.setScalar(this.bodyScale(b));
          const shadow = blob();
          this.foodLayer.add(root, shadow);
          v = { body: b, root, spinner, shadow, wobble: 0 };
          this.bodyViews.set(b.id, v);
        }
        this.animateBody(v, dt);
      }
    for (const [id, v] of this.bodyViews)
      if (!live.has(id)) {
        this.dropBody(v);
        this.bodyViews.delete(id);
      }
  }

  /** What a flying piece looks like: a slice is as big as the pizza it came from (its hit radius is smaller). */
  private bodyScale(b: Body): number {
    return b.piece === 'ring' ? b.radius : b.food.radius;
  }

  private animateBody(v: BodyView, dt: number) {
    const b = v.body;
    const root = v.root;
    root.position.set(b.x, b.y, b.z);
    // A shadow straight below shows where the food will come down.
    const ground = groundAt(b.x, b.z);
    v.shadow.position.set(b.x, ground + 0.03, b.z);
    v.shadow.scale.setScalar(Math.max(0.3, b.radius * 2.4 * (1 - Math.min(0.7, (b.y - ground) * 0.08))));
    const base = this.bodyScale(b);
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
    // Stretch along the flight and spin, with a puffy trail behind.
    const speed = Math.hypot(b.vx, b.vy, b.vz);
    if (b.mode === 'fly') this.effects.trail(b, b.piece === 'slice' ? 'slices' : b.food.effect, dt);
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

/**
 * The 3D stage: renderer, lights, sky, an orbiting camera, name tags (CSS2D), picking and the frame loop.
 * The restaurant adds its objects to `stage`. Copied from Archipelago and trimmed.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { initialQuality, skyDome, type Quality } from './look';

export interface Pick {
  type: string;
  id: string;
}

/**
 * GTAO draws every visible object into its depth/normal pass, so see-through things (sparkles, glass
 * pipes) would cast square dark shadows. Hide them from that pass.
 */
function skipSeeThrough(ao: GTAOPass) {
  const pass = ao as unknown as { _overrideVisibility(): void; _visibilityCache: THREE.Object3D[]; scene: THREE.Scene };
  const original = pass._overrideVisibility.bind(pass);
  pass._overrideVisibility = () => {
    original();
    pass.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (!o.visible) return;
      if (o instanceof THREE.Sprite || (m && !Array.isArray(m) && m.transparent)) {
        o.visible = false;
        pass._visibilityCache.push(o);
      }
    });
  };
}

/** Half the restaurant's width plus a margin: what the camera must fit across the screen. */
const FIT_RADIUS = 7.4;

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
  readonly controls: OrbitControls;
  readonly labels = new CSS2DRenderer();
  /** Everything that belongs to the current night. */
  readonly stage = new THREE.Group();
  quality: Quality = initialQuality();
  private composer: EffectComposer | null = null;
  private readonly sun = new THREE.DirectionalLight('#fff4dc', 2.4);
  private readonly frameFns = new Set<(dt: number, t: number) => void>();
  private readonly timer = new THREE.Timer();
  private readonly raycaster = new THREE.Raycaster();
  private slowFrames = 0;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: this.quality === 'high', powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    host.appendChild(this.renderer.domElement);
    this.labels.domElement.className = 'labels';
    host.appendChild(this.labels.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    this.scene.add(skyDome(), this.stage);
    this.scene.fog = new THREE.Fog('#f3dcc0', 40, 110);
    this.scene.add(new THREE.HemisphereLight('#fff1dc', '#8a6a52', 1.1));
    this.sun.position.set(6, 14, 8);
    this.sun.castShadow = true;
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -9;
    this.sun.shadow.camera.right = this.sun.shadow.camera.top = 9;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 4;
    this.scene.add(this.sun);

    this.camera.position.set(0, 11, 13.5);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.4, 0);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = 1.2;
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };

    this.applyQuality();
    addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private applyQuality() {
    const high = this.quality === 'high';
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, high ? 1.5 : 1.25));
    this.sun.shadow.mapSize.setScalar(high ? 2048 : 1024);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.composer?.dispose();
    this.composer = high ? this.buildComposer() : null;
  }

  private buildComposer(): EffectComposer {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    const c = new EffectComposer(this.renderer, target);
    c.addPass(new RenderPass(this.scene, this.camera));
    const ao = new GTAOPass(this.scene, this.camera, size.x, size.y);
    skipSeeThrough(ao);
    ao.blendIntensity = 0.7;
    ao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.5, thickness: 1, scale: 1 });
    c.addPass(ao);
    c.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.25, 0.4, 1.6));
    c.addPass(new OutputPass());
    c.setPixelRatio(1);
    c.setSize(size.x, size.y);
    return c;
  }

  resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.camera.aspect = w / h;
    // Portrait phones need to stand further back to see the whole restaurant.
    this.camera.fov = w < h ? 50 : 42;
    this.camera.updateProjectionMatrix();
    // Stand far enough back that the whole restaurant fits across the screen.
    const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect);
    const fit = Math.max(17, FIT_RADIUS / Math.sin(half));
    this.controls.maxDistance = fit * 1.5;
    this.controls.minDistance = Math.min(8, fit * 0.5);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(dir, fit);
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    if (this.composer) {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.composer.setSize(size.x, size.y);
    }
  }

  onFrame(fn: (dt: number, t: number) => void): () => void {
    this.frameFns.add(fn);
    return () => this.frameFns.delete(fn);
  }

  /** The front-most pickable thing under a screen point. */
  pick(clientX: number, clientY: number): Pick | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const p = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(p, this.camera);
    for (const hit of this.raycaster.intersectObject(this.stage, true)) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.pick) o = o.parent;
      if (o) return o.userData.pick as Pick;
    }
    return null;
  }

  /** Screen position of a world point, for HTML that follows an object. */
  toScreen(v: THREE.Vector3): { x: number; y: number } {
    const p = v.clone().project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }

  /** A small picture of a model (for the tray and the concept cards), as a data URL. */
  snapshot(obj: THREE.Object3D, size = 160): string {
    const scene = new THREE.Scene();
    scene.environment = this.scene.environment;
    scene.environmentIntensity = 0.6;
    scene.add(new THREE.HemisphereLight('#ffffff', '#9fb0d0', 1.4));
    const light = new THREE.DirectionalLight('#fff4dc', 2.2);
    light.position.set(3, 5, 6);
    scene.add(light, obj);
    const sphere = new THREE.Box3().setFromObject(obj).getBoundingSphere(new THREE.Sphere());
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    cam.position.copy(sphere.center).add(new THREE.Vector3(0.45, 0.35, 1).normalize().multiplyScalar(sphere.radius / Math.sin(0.25)));
    cam.lookAt(sphere.center);
    const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
    const r = this.renderer;
    const clear = r.getClearAlpha();
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(scene, cam);
    const px = new Uint8Array(size * size * 4);
    r.readRenderTargetPixels(rt, 0, 0, size, size, px);
    r.setRenderTarget(null);
    r.setClearAlpha(clear);
    rt.dispose();
    // Render targets hold linear colour; turn it into sRGB and flip it the right way up.
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      const c = Math.min(1, (i / 255) * 1.1);
      lut[i] = 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
    }
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d')!;
    const img = g.createImageData(size, size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const s = ((size - 1 - y) * size + x) * 4;
        const d = (y * size + x) * 4;
        const a = px[s + 3] / 255 || 1;
        img.data[d] = lut[Math.min(255, Math.round(px[s] / a))];
        img.data[d + 1] = lut[Math.min(255, Math.round(px[s + 1] / a))];
        img.data[d + 2] = lut[Math.min(255, Math.round(px[s + 2] / a))];
        img.data[d + 3] = px[s + 3];
      }
    g.putImageData(img, 0, 0);
    scene.remove(obj);
    return canvas.toDataURL();
  }

  private frame() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);
    const t = this.timer.getElapsed();
    this.controls.update();
    for (const fn of this.frameFns) fn(dt, t);
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
    // Phones that can't keep up drop to the light look for good.
    if (this.quality === 'high' && t > 3) {
      this.slowFrames = dt > 1 / 30 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1);
      if (this.slowFrames > 45) {
        this.quality = 'low';
        this.applyQuality();
      }
    }
  }
}

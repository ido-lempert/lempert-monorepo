/**
 * The prize reveal, like the car reveals in racing games: the screen dims, light rays turn, confetti
 * falls, and the new food (or slingshot colour) spins in its own little 3D stage, with its name, what it
 * does and a big button to go and use it.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { foodModel, slingshot } from './world/models';
import type { FoodId } from './game/foods';
import type { SkinId } from './game/progress';

export type Prize = { kind: 'food'; id: FoodId } | { kind: 'skin'; id: SkinId };

export class RevealStage {
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  private item: THREE.Object3D | null = null;
  private running = false;
  private t = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.camera.position.set(0, 0.6, 5.2);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.HemisphereLight('#fff6e8', '#ffb3d1', 1.2));
    const key = new THREE.DirectionalLight('#ffffff', 2.6);
    key.position.set(3, 4, 5);
    const rim = new THREE.DirectionalLight('#bfe0ff', 2);
    rim.position.set(-4, 2, -3);
    this.scene.add(key, rim);
  }

  private ensure() {
    if (this.renderer) return this.renderer;
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.toneMapping = THREE.NeutralToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.renderer = r;
    return r;
  }

  show(prize: Prize) {
    const r = this.ensure();
    const size = this.canvas.clientWidth || 260;
    r.setSize(size, size, false);
    if (this.item) this.scene.remove(this.item);
    if (prize.kind === 'food') {
      const g = foodModel(prize.id);
      g.scale.setScalar(1.7);
      this.item = g;
    } else {
      const s = slingshot(prize.id).root;
      s.scale.setScalar(0.62);
      s.position.y = 0.55;
      this.item = s;
    }
    this.scene.add(this.item);
    this.t = 0;
    if (!this.running) {
      this.running = true;
      requestAnimationFrame(this.tick);
    }
  }

  hide() {
    this.running = false;
  }

  private tick = () => {
    if (!this.running || !this.renderer || !this.item) return;
    this.t += 1 / 60;
    // Pops in big, then turns slowly with a little bob.
    const pop = Math.min(1, this.t * 2.5);
    const k = pop < 1 ? 1 + Math.sin(pop * Math.PI) * 0.35 : 1;
    this.item.scale.setScalar((this.item.userData.base ??= this.item.scale.x) * k * Math.max(0.05, pop));
    this.item.rotation.y = this.t * 1.2;
    this.item.rotation.x = 0.35 + Math.sin(this.t * 2) * 0.08;
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.tick);
  };
}

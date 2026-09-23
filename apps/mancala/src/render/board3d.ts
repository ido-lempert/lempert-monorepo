import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { BOARD_SIZE, isStore, type MoveResult, ownerOf, type Player } from '../game/kalah';
import { fireStyle, iceStyle, ParticleSystem } from './particles';

export const PLAYER_COLORS: Record<Player, string> = { 0: '#f5a524', 1: '#3fb8ff' };

const PIT_R = 0.5;
const PIT_SPACING = 1.25;
const ROW_Z = 0.78;
const STORE_X = 4.55;
const STORE_RX = 0.58;
const STORE_RZ = 1.35;
const BOARD_W = 11.2;
const BOARD_D = 3.5;
const BOARD_DEPTH = 0.6;
const BEVEL = 0.08;
const TOP = BOARD_DEPTH + BEVEL;
const BOWL_Y = BOARD_DEPTH;
const BOWL_DEPTH_SCALE = 0.55;
const STONE_R = 0.13;

const STONE_COLORS = ['#e4572e', '#29335c', '#f3a712', '#a8c686', '#669bbc', '#c1121f', '#f0ead2', '#6a4c93'];

interface Container {
  index: number;
  center: THREE.Vector3;
  rx: number;
  rz: number;
  stones: THREE.Mesh[];
  label: HTMLDivElement;
  ring?: THREE.Mesh;
  bowl: THREE.Mesh;
}

/**
 * Container centre in world space. Sowing runs clockwise: each player's store is on their left.
 * Player 0 is the near row (+z) and sows right→left into store 6 at -x; player 1 sows along the far row
 * left→right into store 13 at +x. Pit i and pit 12-i face each other.
 */
function containerCenter(i: number): THREE.Vector3 {
  if (i === 6) return new THREE.Vector3(-STORE_X, BOWL_Y, 0);
  if (i === 13) return new THREE.Vector3(STORE_X, BOWL_Y, 0);
  if (i < 6) return new THREE.Vector3((2.5 - i) * PIT_SPACING, BOWL_Y, ROW_Z);
  return new THREE.Vector3((i - 7 - 2.5) * PIT_SPACING, BOWL_Y, -ROW_Z);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function tween(duration: number, onUpdate: (t: number) => void): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      onUpdate(t);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

function woodTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#8b5a2b';
  g.fillRect(0, 0, c.width, c.height);
  for (let n = 0; n < 140; n++) {
    const y0 = Math.random() * c.height;
    const amp = 4 + Math.random() * 14;
    const freq = 0.002 + Math.random() * 0.006;
    const phase = Math.random() * Math.PI * 2;
    g.strokeStyle = Math.random() < 0.5 ? 'rgba(60,32,12,0.35)' : 'rgba(180,120,70,0.25)';
    g.lineWidth = 0.5 + Math.random() * 2.5;
    g.beginPath();
    for (let x = 0; x <= c.width; x += 8) {
      const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1) * amp * 0.3;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / BOARD_W, 1 / BOARD_D);
  tex.offset.set(0.5, 0.5); // shape UVs are centred on 0; avoid a seam down the middle
  tex.anisotropy = 8;
  return tex;
}

export class Board3D {
  private renderer: THREE.WebGLRenderer;
  private labels: CSS2DRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  private containers: Container[] = [];
  private hitTargets: THREE.Mesh[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private hovered: number | null = null;
  /** Bumped on every reset so in-flight animations from a previous game stop touching the board. */
  private epoch = 0;
  private active: { player: Player; legal: Set<number> } | null = null;
  private controls: OrbitControls;
  private target = new THREE.Vector3(0, 0.2, 0);
  private portrait: boolean | null = null;
  private viewer: Player = 0;
  private lastFrame = performance.now();
  /** Player 1 sows with fire, player 2 with ice. */
  private trails: Record<Player, ParticleSystem> = { 0: new ParticleSystem(fireStyle()), 1: new ParticleSystem(iceStyle()) };
  private stoneGeometry = new THREE.SphereGeometry(STONE_R, 20, 14);
  /** Animation hooks, e.g. for sound: a stone settled in a container / a pit was emptied into the hand. */
  onStoneLanded: ((container: number, element: Player) => void) | null = null;
  onLift: (() => void) | null = null;
  private stoneMaterials = STONE_COLORS.map(
    (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 }),
  );

  constructor(
    private host: HTMLElement,
    private onPick: (pit: number) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'labels';
    host.appendChild(this.labels.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(this.target);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.05;
    this.controls.maxPolarAngle = 1.3; // never look from under the table
    this.controls.rotateSpeed = 0.7;

    this.buildScene();
    this.bindInput();

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.renderer.setAnimationLoop(() => this.render());
  }

  private buildScene() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.5;
    this.scene.background = new THREE.Color('#1b1e2b');

    this.scene.add(new THREE.HemisphereLight('#fff4e0', '#202030', 0.6));
    const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
    sun.position.set(-4, 10, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -8;
    sun.shadow.camera.right = 8;
    sun.shadow.camera.top = 5;
    sun.shadow.camera.bottom = -5;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    this.scene.add(this.trails[0].points, this.trails[1].points);

    const table = new THREE.Mesh(
      new THREE.CircleGeometry(30, 64),
      new THREE.MeshStandardMaterial({ color: '#2a2f45', roughness: 0.9 }),
    );
    table.rotation.x = -Math.PI / 2;
    table.position.y = -BEVEL;
    table.receiveShadow = true;
    this.scene.add(table);

    // Board: a rounded slab with pits and stores cut out as holes, extruded upwards.
    const shape = new THREE.Shape();
    const w = BOARD_W / 2;
    const d = BOARD_D / 2;
    const r = 1.2;
    shape.moveTo(-w + r, -d);
    shape.lineTo(w - r, -d);
    shape.quadraticCurveTo(w, -d, w, -d + r);
    shape.lineTo(w, d - r);
    shape.quadraticCurveTo(w, d, w - r, d);
    shape.lineTo(-w + r, d);
    shape.quadraticCurveTo(-w, d, -w, d - r);
    shape.lineTo(-w, -d + r);
    shape.quadraticCurveTo(-w, -d, -w + r, -d);
    for (let i = 0; i < BOARD_SIZE; i++) {
      const c = containerCenter(i);
      const hole = new THREE.Path();
      // Shape y maps to world -z after the -90° x rotation below.
      if (isStore(i)) hole.absellipse(c.x, -c.z, STORE_RX, STORE_RZ, 0, Math.PI * 2, true, 0);
      else hole.absarc(c.x, -c.z, PIT_R, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
    const boardGeo = new THREE.ExtrudeGeometry(shape, {
      depth: BOARD_DEPTH,
      bevelEnabled: true,
      bevelThickness: BEVEL,
      bevelSize: BEVEL,
      bevelSegments: 4,
      curveSegments: 48,
    });
    boardGeo.rotateX(-Math.PI / 2);
    const woodMat = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.55 });
    const board = new THREE.Mesh(boardGeo, woodMat);
    board.castShadow = true;
    board.receiveShadow = true;
    this.scene.add(board);

    const bowlMat = new THREE.MeshStandardMaterial({ color: '#5a3517', roughness: 0.8, side: THREE.BackSide });
    const bowlGeo = new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

    for (let i = 0; i < BOARD_SIZE; i++) {
      const center = containerCenter(i);
      const store = isStore(i);
      const rx = store ? STORE_RX : PIT_R;
      const rz = store ? STORE_RZ : PIT_R;

      const bowl = new THREE.Mesh(bowlGeo, bowlMat.clone());
      bowl.scale.set(rx, PIT_R * BOWL_DEPTH_SCALE, rz);
      bowl.position.copy(center);
      bowl.receiveShadow = true;
      this.scene.add(bowl);

      const labelEl = document.createElement('div');
      labelEl.className = store ? 'count store' : 'count';
      labelEl.textContent = '0';
      const label = new CSS2DObject(labelEl);
      label.position.set(center.x, TOP + 0.05, store ? 0 : Math.sign(center.z) * (BOARD_D / 2 + 0.35));
      if (store) label.position.set(center.x + Math.sign(center.x) * 1.0, TOP + 0.05, 0);
      this.scene.add(label);

      const container: Container = { index: i, center, rx, rz, stones: [], label: labelEl, bowl };

      if (!store) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(PIT_R + 0.06, PIT_R + 0.14, 48),
          new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(center.x, TOP + 0.004, center.z);
        this.scene.add(ring);
        container.ring = ring;

        const hit = new THREE.Mesh(new THREE.CylinderGeometry(PIT_R + 0.12, PIT_R + 0.12, 0.9, 24), hitMat);
        hit.position.set(center.x, TOP - 0.3, center.z);
        hit.userData.pit = i;
        this.scene.add(hit);
        this.hitTargets.push(hit);
      }
      this.containers.push(container);
    }
  }

  private bindInput() {
    const el = this.renderer.domElement;
    const pick = (e: PointerEvent): number | null => {
      const rect = el.getBoundingClientRect();
      this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObjects(this.hitTargets, false)[0];
      return hit ? (hit.object.userData.pit as number) : null;
    };
    el.addEventListener('pointermove', (e) => {
      this.hovered = pick(e);
      const clickable = this.hovered !== null && !!this.active?.legal.has(this.hovered);
      el.style.cursor = clickable ? 'pointer' : 'default';
      this.refreshHighlights();
    });
    el.addEventListener('pointerleave', () => {
      this.hovered = null;
      this.refreshHighlights();
    });
    // Dragging orbits the camera; only treat near-stationary presses as clicks on a pit.
    const down = { x: 0, y: 0 };
    el.addEventListener('pointerdown', (e) => {
      down.x = e.clientX;
      down.y = e.clientY;
    });
    el.addEventListener('click', (e) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
      const pit = pick(e as PointerEvent);
      if (pit !== null && this.active?.legal.has(pit)) this.onPick(pit);
    });
  }

  private resize() {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height);
    this.labels.setSize(width, height);
    const aspect = width / height;
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 1 ? 50 : 38;
    const scale = this.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    this.trails[0].setScale(scale);
    this.trails[1].setScale(scale);

    // Keep the player's chosen viewing angle across resizes, unless the screen flips orientation.
    const portrait = aspect < 0.9;
    const reset = portrait !== this.portrait;
    this.portrait = portrait;
    this.fitCamera(reset ? this.defaultDirection() : this.camera.position.clone().sub(this.target).normalize());
  }

  private defaultDirection(): THREE.Vector3 {
    const dir = this.portrait ? new THREE.Vector3(-0.35, 1, 0) : new THREE.Vector3(0, 1, 0.7);
    // Player 2 views the board from the opposite side, so their own pits are nearest to them.
    if (this.viewer === 1) dir.set(-dir.x, dir.y, -dir.z);
    return dir.normalize();
  }

  /** Which side of the table the local player sits on (online games put player 2 opposite). */
  setViewer(player: Player) {
    if (player === this.viewer) return;
    this.viewer = player;
    this.resetCamera();
  }

  /** Back to the default view that shows the whole board. */
  resetCamera() {
    this.fitCamera(this.defaultDirection());
  }

  /** Places the camera along `dir` at the distance where the whole board fits the screen, below the HUD. */
  private fitCamera(dir: THREE.Vector3) {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();

    const extentX = BOARD_W / 2 + 0.2;
    const extentZ = BOARD_D / 2 + 0.7; // room for the count labels
    const corners: THREE.Vector3[] = [];
    for (const x of [-extentX, extentX])
      for (const y of [-BEVEL, TOP + 0.3])
        for (const z of [-extentZ, extentZ]) corners.push(new THREE.Vector3(x, y, z));

    const hudPx = Math.min(110, height * 0.2);
    const halfY = 0.94 - hudPx / height;
    const fits = (dist: number) => {
      this.camera.position.copy(this.target).addScaledVector(dir, dist);
      this.camera.lookAt(this.target);
      this.camera.updateMatrixWorld();
      return corners.every((c) => {
        const p = c.clone().project(this.camera);
        return Math.abs(p.x) <= 0.94 && Math.abs(p.y) <= halfY;
      });
    };
    let lo = 2;
    let hi = 80;
    for (let n = 0; n < 30; n++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    fits(hi);
    this.controls.minDistance = hi * 0.45;
    this.controls.maxDistance = hi * 1.5;
    this.controls.update();
    // Shift the image down by half the HUD height so the board sits centred below it.
    this.camera.setViewOffset(width, height, 0, -hudPx / 2, width, height);
    this.camera.updateProjectionMatrix();
  }

  private render() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.controls.update();
    this.trails[0].update(dt);
    this.trails[1].update(dt);
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  /** Where the k-th stone in a container should rest. */
  private slot(c: Container, k: number): THREE.Vector3 {
    const store = isStore(c.index);
    const perLayer = store ? 14 : 6;
    const layer = Math.floor(k / perLayer);
    const angle = Math.random() * Math.PI * 2;
    const rho = Math.sqrt(Math.random()) * 0.62;
    const ox = Math.cos(angle) * rho;
    const oz = Math.sin(angle) * rho;
    const bowlDepth = PIT_R * BOWL_DEPTH_SCALE;
    const surface = BOWL_Y - bowlDepth * Math.sqrt(Math.max(0, 1 - rho * rho));
    const y = Math.min(surface + STONE_R * 0.7 + layer * STONE_R * 1.1, TOP + STONE_R * 2);
    return new THREE.Vector3(c.center.x + ox * c.rx, y, c.center.z + oz * c.rz);
  }

  private newStone(): THREE.Mesh {
    const m = new THREE.Mesh(
      this.stoneGeometry,
      this.stoneMaterials[Math.floor(Math.random() * this.stoneMaterials.length)],
    );
    m.scale.set(1, 0.72, 1);
    m.rotation.y = Math.random() * Math.PI;
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  /** Rebuilds all stones to match a board array (used on new game). */
  setBoard(board: number[]) {
    this.epoch++;
    for (const c of this.containers) {
      for (const s of c.stones) this.scene.remove(s);
      c.stones = [];
      for (let k = 0; k < board[c.index]; k++) {
        const s = this.newStone();
        s.position.copy(this.slot(c, k));
        this.scene.add(s);
        c.stones.push(s);
      }
      this.updateLabel(c);
    }
  }

  private updateLabel(c: Container) {
    c.label.textContent = String(c.stones.length);
    c.label.classList.remove('bump');
    void c.label.offsetWidth;
    c.label.classList.add('bump');
  }

  setActive(player: Player | null, legal: number[] = []) {
    this.active = player === null ? null : { player, legal: new Set(legal) };
    this.refreshHighlights();
  }

  /** Highlights a pit as if hovered, e.g. while its keyboard button has focus. */
  setHover(pit: number | null) {
    this.hovered = pit;
    this.refreshHighlights();
  }

  private refreshHighlights() {
    for (const c of this.containers) {
      if (!c.ring) continue;
      const mat = c.ring.material as THREE.MeshBasicMaterial;
      const legal = !!this.active?.legal.has(c.index);
      if (legal) mat.color.set(PLAYER_COLORS[this.active!.player]);
      mat.opacity = legal ? (this.hovered === c.index ? 1 : 0.45) : 0;
      const bowlMat = c.bowl.material as THREE.MeshStandardMaterial;
      bowlMat.emissive.set(legal && this.hovered === c.index ? PLAYER_COLORS[this.active!.player] : '#000000');
      bowlMat.emissiveIntensity = 0.25;
    }
  }

  private async flyStone(stone: THREE.Mesh, to: Container, duration: number, epoch: number, trail: ParticleSystem) {
    if (epoch !== this.epoch) return;
    const from = stone.position.clone();
    const dest = this.slot(to, to.stones.length);
    to.stones.push(stone);
    const height = 0.9 + from.distanceTo(dest) * 0.12;
    const prev = from.clone();
    const point = new THREE.Vector3();
    await tween(duration, (t) => {
      const e = easeInOut(t);
      stone.position.lerpVectors(from, dest, e);
      stone.position.y += Math.sin(Math.PI * e) * height;
      // Emit along the path travelled since the last frame so the trail stays continuous at any frame rate.
      const steps = Math.min(12, Math.ceil(prev.distanceTo(stone.position) / 0.035));
      for (let k = 1; k <= steps; k++) trail.trail(point.lerpVectors(prev, stone.position, k / steps));
      prev.copy(stone.position);
    });
    trail.emit(dest, 14, 0.15, 1.8);
    this.updateLabel(to);
    this.onStoneLanded?.(to.index, trail === this.trails[0] ? 0 : 1);
  }

  /** Animates a move produced by the rules engine. Resolves when all stones have settled. */
  async playMove(pit: number, result: MoveResult, mover: Player) {
    const epoch = this.epoch;
    const trail = this.trails[mover];
    const source = this.containers[pit];
    const hand = source.stones.splice(0);
    this.updateLabel(source);
    this.onLift?.();

    // Lift the handful out of the pit before sowing.
    await Promise.all(
      hand.map((s, k) => {
        const from = s.position.clone();
        return tween(180, (t) => {
          s.position.y = from.y + easeInOut(t) * (0.5 + k * 0.03);
        });
      }),
    );

    const flights: Promise<void>[] = [];
    result.sown.forEach((target, k) => {
      const stone = hand.pop()!;
      flights.push(wait(k * 150).then(() => this.flyStone(stone, this.containers[target], 380, epoch, trail)));
    });
    await Promise.all(flights);

    if (result.capture) {
      await wait(250);
      await this.moveAll([result.capture.pit, result.capture.opposite], result.capture.store, epoch, trail);
    }
    // Captures burn/freeze with the mover's element; end-game sweeps use the store owner's.
    for (const sweep of result.sweeps) {
      await wait(120);
      await this.moveAll([sweep.from], sweep.store, epoch, this.trails[ownerOf(sweep.store)]);
    }
  }

  private async moveAll(from: number[], to: number, epoch: number, trail: ParticleSystem) {
    if (epoch !== this.epoch) return;
    const target = this.containers[to];
    const flights: Promise<void>[] = [];
    let k = 0;
    for (const i of from) {
      const c = this.containers[i];
      for (const stone of c.stones.splice(0)) {
        flights.push(wait(k++ * 60).then(() => this.flyStone(stone, target, 520, epoch, trail)));
      }
      this.updateLabel(c);
    }
    await Promise.all(flights);
  }

  /** Screen-space position of a container, for HUD effects. */
  screenPosition(i: number): { x: number; y: number } {
    const p = this.containers[i].center.clone().setY(TOP).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
  }
}

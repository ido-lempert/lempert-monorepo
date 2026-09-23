import * as THREE from 'three';

export interface TrailStyle {
  texture: THREE.Texture;
  /** Colour gradient over a particle's lifetime, start → end. */
  colors: string[];
  life: [number, number];
  /** World-space size at birth and death. */
  size: [number, number];
  /** Writes a random initial velocity into `out`. */
  velocity: (out: THREE.Vector3) => void;
  /** Vertical acceleration: positive rises (flames), negative falls (frost). */
  gravity: number;
  drag: number;
  /** Particles emitted per trail step. */
  density: number;
}

const VERTEX = /* glsl */ `
  attribute float size;
  attribute float alpha;
  attribute vec3 pcolor;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = pcolor;
    vAlpha = alpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
    #include <colorspace_fragment>
  }
`;

/** CPU-simulated additive point particles. One instance per visual style. */
export class ParticleSystem {
  readonly points: THREE.Points;
  private alive = 0;
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private alphas: Float32Array;
  private velocities: Float32Array;
  private ages: Float32Array;
  private lives: Float32Array;
  private gradient: THREE.Color[];
  private geometry = new THREE.BufferGeometry();
  private material: THREE.ShaderMaterial;
  private tmp = new THREE.Vector3();
  private tmpColor = new THREE.Color();

  constructor(
    private style: TrailStyle,
    private max = 4000,
  ) {
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.sizes = new Float32Array(max);
    this.alphas = new Float32Array(max);
    this.velocities = new Float32Array(max * 3);
    this.ages = new Float32Array(max);
    this.lives = new Float32Array(max);
    this.gradient = style.colors.map((c) => new THREE.Color(c));

    const attr = (a: Float32Array, n: number) => new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', attr(this.positions, 3));
    this.geometry.setAttribute('pcolor', attr(this.colors, 3));
    this.geometry.setAttribute('size', attr(this.sizes, 1));
    this.geometry.setAttribute('alpha', attr(this.alphas, 1));
    this.geometry.setDrawRange(0, 0);

    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: style.texture }, uScale: { value: 500 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  /** Pixels per world unit at distance 1; call on resize. */
  setScale(scale: number) {
    this.material.uniforms.uScale.value = scale;
  }

  /** Emits one trail step's worth of particles at a point on a moving stone's path. */
  trail(at: THREE.Vector3) {
    this.emit(at, this.style.density);
  }

  emit(at: THREE.Vector3, count: number, jitter = 0.06, speed = 1) {
    for (let n = 0; n < count && this.alive < this.max; n++) {
      const i = this.alive++;
      this.positions[i * 3] = at.x + (Math.random() - 0.5) * jitter;
      this.positions[i * 3 + 1] = at.y + (Math.random() - 0.5) * jitter;
      this.positions[i * 3 + 2] = at.z + (Math.random() - 0.5) * jitter;
      this.style.velocity(this.tmp);
      this.velocities[i * 3] = this.tmp.x * speed;
      this.velocities[i * 3 + 1] = this.tmp.y * speed;
      this.velocities[i * 3 + 2] = this.tmp.z * speed;
      this.ages[i] = 0;
      const [lo, hi] = this.style.life;
      this.lives[i] = lo + Math.random() * (hi - lo);
    }
  }

  update(dt: number) {
    const { gravity, drag, size } = this.style;
    const damp = Math.exp(-drag * dt);
    for (let i = 0; i < this.alive; ) {
      this.ages[i] += dt;
      if (this.ages[i] >= this.lives[i]) {
        this.swapRemove(i);
        continue;
      }
      const t = this.ages[i] / this.lives[i];
      const v = i * 3;
      this.velocities[v] *= damp;
      this.velocities[v + 1] = this.velocities[v + 1] * damp + gravity * dt;
      this.velocities[v + 2] *= damp;
      this.positions[v] += this.velocities[v] * dt;
      this.positions[v + 1] += this.velocities[v + 1] * dt;
      this.positions[v + 2] += this.velocities[v + 2] * dt;

      const g = t * (this.gradient.length - 1);
      const k = Math.min(Math.floor(g), this.gradient.length - 2);
      this.tmpColor.copy(this.gradient[k]).lerp(this.gradient[k + 1], g - k);
      this.colors[v] = this.tmpColor.r;
      this.colors[v + 1] = this.tmpColor.g;
      this.colors[v + 2] = this.tmpColor.b;
      this.sizes[i] = size[0] + (size[1] - size[0]) * t;
      // Quick fade in, long fade out.
      this.alphas[i] = Math.min(1, t * 8) * (1 - t) ** 1.5;
      i++;
    }
    this.geometry.setDrawRange(0, this.alive);
    for (const name of ['position', 'pcolor', 'size', 'alpha']) this.geometry.getAttribute(name).needsUpdate = true;
  }

  private swapRemove(i: number) {
    const last = --this.alive;
    if (i === last) return;
    for (let c = 0; c < 3; c++) {
      this.positions[i * 3 + c] = this.positions[last * 3 + c];
      this.velocities[i * 3 + c] = this.velocities[last * 3 + c];
    }
    this.ages[i] = this.ages[last];
    this.lives[i] = this.lives[last];
  }
}

function canvasTexture(draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  draw(c.getContext('2d')!, 64);
  return new THREE.CanvasTexture(c);
}

const glowTexture = () =>
  canvasTexture((g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });

/** A four-pointed sparkle with a soft core: reads as frost/ice crystals. */
const sparkleTexture = () =>
  canvasTexture((g, s) => {
    const h = s / 2;
    const core = g.createRadialGradient(h, h, 0, h, h, h * 0.5);
    core.addColorStop(0, 'rgba(255,255,255,1)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = core;
    g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    for (let a = 0; a < 8; a++) {
      const r = a % 2 === 0 ? h : h * 0.12;
      const ang = (a * Math.PI) / 4;
      g.lineTo(h + Math.cos(ang) * r, h + Math.sin(ang) * r);
    }
    g.closePath();
    g.fill();
  });

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export const fireStyle = (): TrailStyle => ({
  texture: glowTexture(),
  colors: ['#ffffff', '#ffe066', '#ff8c1a', '#e0300b', '#3a0a00'],
  life: [0.35, 0.75],
  size: [0.62, 0.1],
  velocity: (v) => v.set(rand(-0.35, 0.35), rand(0.5, 1.3), rand(-0.35, 0.35)),
  gravity: 2.4,
  drag: 2.5,
  density: 3,
});

export const iceStyle = (): TrailStyle => ({
  texture: sparkleTexture(),
  colors: ['#ffffff', '#c8f6ff', '#6fd0ff', '#2a6fd6', '#08204a'],
  life: [0.5, 1.0],
  size: [0.3, 0.06],
  velocity: (v) => v.set(rand(-0.5, 0.5), rand(-0.2, 0.5), rand(-0.5, 0.5)),
  gravity: -1.4,
  drag: 2.2,
  density: 1,
});

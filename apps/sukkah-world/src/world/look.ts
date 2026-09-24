/**
 * The visual style shared by every model: soft, saturated "toy" materials with a rim light, dark outlines
 * on characters and collectibles, a gradient sky and wind for grass. Kept apart from the models so the
 * look can be tuned in one place.
 */
import * as THREE from 'three';

// --- Materials --------------------------------------------------------------------------------------

export interface MatOptions {
  /** 0..n glow; glowing things also bloom. */
  emissive?: number;
  rough?: number;
  metal?: number;
  flat?: boolean;
  /** Strength of the soft light around the edges; 0 turns it off. */
  rim?: number;
  transparent?: number;
  /** Visible from both sides (leaves, fabric). */
  double?: boolean;
}

const mats = new Map<string, THREE.MeshStandardMaterial>();

/** Adds a view-dependent rim light, which gives the soft "toy" edge glow of modern mobile games. */
function withRim(m: THREE.MeshStandardMaterial, strength: number) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.rimStrength = { value: strength };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float rimStrength;\nvoid main() {')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rimDot = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
        totalEmissiveRadiance += (diffuseColor.rgb * 0.6 + 0.4) * pow(rimDot, 3.0) * rimStrength;`,
      );
  };
  m.customProgramCacheKey = () => 'rim';
}

/** Shared material per colour and options. */
export function mat(color: string, o: MatOptions = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${JSON.stringify(o)}`;
  let m = mats.get(key);
  if (!m) {
    const c = new THREE.Color(color);
    m = new THREE.MeshStandardMaterial({
      color: c,
      roughness: o.rough ?? 0.62,
      metalness: o.metal ?? 0,
      flatShading: o.flat ?? false,
      emissive: o.emissive ? c : new THREE.Color(0),
      emissiveIntensity: o.emissive ?? 0,
      transparent: o.transparent !== undefined,
      opacity: o.transparent ?? 1,
      envMapIntensity: 0.6,
      side: o.double ? THREE.DoubleSide : THREE.FrontSide,
    });
    const rim = o.rim ?? 0.35;
    if (rim > 0 && !o.flat) withRim(m, rim);
    mats.set(key, m);
  }
  return m;
}

// --- Outlines -------------------------------------------------------------------------------------

const outlineMat = new THREE.MeshBasicMaterial({ color: '#1d2340', side: THREE.BackSide });
outlineMat.onBeforeCompile = (shader) => {
  shader.uniforms.outlineWidth = { value: 0.025 };
  shader.vertexShader = shader.vertexShader
    .replace('void main() {', 'uniform float outlineWidth;\nvoid main() {')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * outlineWidth;');
};
outlineMat.customProgramCacheKey = () => 'outline';

/** Gives every mesh in a model a dark cartoon outline (the "inverted hull" trick: one extra draw each). */
export function outline(root: THREE.Object3D) {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.noOutline && !(o.material as THREE.Material).transparent) meshes.push(o);
  });
  for (const m of meshes) {
    const hull = new THREE.Mesh(m.geometry, outlineMat);
    hull.userData.noOutline = true;
    hull.raycast = () => {};
    m.add(hull);
  }
}

// --- Sky ------------------------------------------------------------------------------------------

export const HORIZON = '#cfeeff';

export function skyDome(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(160, 32, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color('#3aa0ff') },
      middle: { value: new THREE.Color('#8fd3ff') },
      bottom: { value: new THREE.Color(HORIZON) },
    },
    vertexShader: `varying vec3 vPos;
      void main() {
        vPos = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform vec3 top; uniform vec3 middle; uniform vec3 bottom; varying vec3 vPos;
      void main() {
        float h = vPos.y;
        vec3 c = h > 0.25 ? mix(middle, top, smoothstep(0.25, 0.8, h)) : mix(bottom, middle, smoothstep(0.0, 0.25, h));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(geo, material);
  dome.renderOrder = -1;
  return dome;
}

/** A puffy cartoon cloud made of overlapping spheres. */
export function cloud(seed: number): THREE.Group {
  const g = new THREE.Group();
  const m = mat('#ffffff', { rough: 1, rim: 0.5, emissive: 0.25 });
  const n = 4 + (seed % 3);
  for (let i = 0; i < n; i++) {
    const r = 1.6 + ((seed * 7 + i * 3) % 5) * 0.35;
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m);
    s.position.set((i - n / 2) * 1.7, Math.sin(i * 1.3 + seed) * 0.5, Math.cos(i * 2.1) * 0.8);
    s.scale.y = 0.75;
    g.add(s);
  }
  return g;
}

// --- Wind -------------------------------------------------------------------------------------------

const wind = { value: 0 };

export function setWindTime(t: number) {
  wind.value = t;
}

/** A material whose vertices sway with the wind, stronger towards the top (for grass and flowers). */
export function swayMat(color: string | null, amount = 0.18): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: color ?? '#ffffff', roughness: 0.8 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = wind;
    shader.vertexShader = shader.vertexShader.replace('void main() {', 'uniform float windTime;\nvoid main() {').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vec4 root = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float bend = max(position.y, 0.0);
      transformed.x += sin(windTime * 1.8 + root.x * 0.35 + root.z * 0.25) * bend * ${amount.toFixed(3)};
      transformed.z += cos(windTime * 1.5 + root.z * 0.3) * bend * ${(amount * 0.5).toFixed(3)};`,
    );
  };
  m.customProgramCacheKey = () => `sway${amount}`;
  return m;
}

// --- Textures ---------------------------------------------------------------------------------------

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A soft four-pointed sparkle, for particle bursts. */
export const sparkleTexture = canvasTexture(64, (g, s) => {
  const h = s / 2;
  const grad = g.createRadialGradient(h, h, 0, h, h, h);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(h, 0);
  g.quadraticCurveTo(h, h, s, h);
  g.quadraticCurveTo(h, h, h, s);
  g.quadraticCurveTo(h, h, 0, h);
  g.quadraticCurveTo(h, h, h, 0);
  g.fill();
});

/** A vertical fade, for light beams over collectibles. */
export const beamTexture = canvasTexture(64, (g, s) => {
  const grad = g.createLinearGradient(0, 0, 0, s);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(255,255,255,0.9)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
});

/** Striped fabric for sukkah walls, with soft shading between the stripes. */
export function fabricTexture(colors: string[]): THREE.CanvasTexture {
  const tex = canvasTexture(128, (g, s) => {
    const n = colors.length * 2;
    for (let i = 0; i < n; i++) {
      g.fillStyle = colors[i % colors.length];
      g.fillRect((i * s) / n, 0, s / n + 1, s);
    }
    // A scalloped hem along the top and a soft shadow along the bottom.
    const shade = g.createLinearGradient(0, 0, 0, s);
    shade.addColorStop(0, 'rgba(0,0,0,0.12)');
    shade.addColorStop(0.15, 'rgba(0,0,0,0)');
    shade.addColorStop(0.85, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = shade;
    g.fillRect(0, 0, s, s);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Warm stone tiles for the plaza. */
export function tileTexture(): THREE.CanvasTexture {
  const tex = canvasTexture(256, (g, s) => {
    g.fillStyle = '#e9d7b0';
    g.fillRect(0, 0, s, s);
    const n = 8;
    const t = s / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const light = 82 + ((x * 7 + y * 13) % 5) * 2;
        g.fillStyle = `hsl(40, 55%, ${light}%)`;
        const off = y % 2 ? t / 2 : 0;
        g.beginPath();
        g.roundRect(x * t + off + 2, y * t + 2, t - 4, t - 4, 6);
        g.fill();
      }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** A butterfly wing, drawn once per colour. */
export function wingTexture(color: string): THREE.CanvasTexture {
  return canvasTexture(64, (g, s) => {
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(s * 0.5, s * 0.35, s * 0.42, s * 0.3, 0, 0, Math.PI * 2);
    g.ellipse(s * 0.45, s * 0.75, s * 0.28, s * 0.2, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath();
    g.arc(s * 0.55, s * 0.32, s * 0.1, 0, Math.PI * 2);
    g.fill();
  });
}

// --- Quality ----------------------------------------------------------------------------------------

export type Quality = 'high' | 'low';

/** A first guess from the device; World lowers it at runtime if frames are slow. */
export function initialQuality(): Quality {
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
  return cores <= 4 || mem <= 2 ? 'low' : 'high';
}

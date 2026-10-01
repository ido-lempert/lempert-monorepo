/**
 * The visual style: soft, saturated "toy" materials with a rim light, dark cartoon outlines on bugs and
 * food, a warm kitchen backdrop and the canvas textures (grass, wood, splats, sparkles). Kept apart from
 * the models so the look can be tuned in one place.
 */
import * as THREE from 'three';

// --- Materials --------------------------------------------------------------------------------------

export interface MatOptions {
  emissive?: number;
  rough?: number;
  metal?: number;
  flat?: boolean;
  /** Strength of the soft light around the edges; 0 turns it off. */
  rim?: number;
  transparent?: number;
  double?: boolean;
  map?: THREE.Texture;
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
  const key = `${color}|${o.map?.uuid ?? ''}|${JSON.stringify({ ...o, map: undefined })}`;
  let m = mats.get(key);
  if (!m) {
    const c = new THREE.Color(color);
    m = new THREE.MeshStandardMaterial({
      color: c,
      map: o.map ?? null,
      roughness: o.rough ?? 0.55,
      metalness: o.metal ?? 0,
      flatShading: o.flat ?? false,
      emissive: o.emissive ? c : new THREE.Color(0),
      emissiveIntensity: o.emissive ?? 0,
      transparent: o.transparent !== undefined,
      opacity: o.transparent ?? 1,
      envMapIntensity: 0.7,
      side: o.double ? THREE.DoubleSide : THREE.FrontSide,
    });
    const rim = o.rim ?? 0.4;
    if (rim > 0 && !o.flat) withRim(m, rim);
    mats.set(key, m);
  }
  return m;
}

// --- Outlines -------------------------------------------------------------------------------------

function outlineMaterial(width: number) {
  const m = new THREE.MeshBasicMaterial({ color: '#2a1d3d', side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.outlineWidth = { value: width };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float outlineWidth;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * outlineWidth;');
  };
  m.customProgramCacheKey = () => `outline${width}`;
  return m;
}
const outlineMats = new Map<number, THREE.MeshBasicMaterial>();

/** Gives every mesh in a model a dark cartoon outline (the "inverted hull" trick: one extra draw each). */
export function outline(root: THREE.Object3D, width = 0.03) {
  let m = outlineMats.get(width);
  if (!m) outlineMats.set(width, (m = outlineMaterial(width)));
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.noOutline && !(o.material as THREE.Material).transparent) meshes.push(o);
  });
  for (const mesh of meshes) {
    const hull = new THREE.Mesh(mesh.geometry, m);
    hull.userData.noOutline = true;
    hull.raycast = () => {};
    mesh.add(hull);
  }
}

// --- Backdrop ---------------------------------------------------------------------------------------

/** A warm kitchen-coloured dome behind everything. */
export function backdrop(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color('#7fd0ff') },
      middle: { value: new THREE.Color('#ffe2b0') },
      bottom: { value: new THREE.Color('#ffc58a') },
    },
    vertexShader: `varying vec3 vPos;
      void main() {
        vPos = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform vec3 top; uniform vec3 middle; uniform vec3 bottom; varying vec3 vPos;
      void main() {
        float h = vPos.y;
        vec3 c = h > 0.2 ? mix(middle, top, smoothstep(0.2, 0.75, h)) : mix(bottom, middle, smoothstep(-0.1, 0.2, h));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 16), material);
  dome.renderOrder = -1;
  return dome;
}

// --- Textures ---------------------------------------------------------------------------------------

export function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, w = size): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = size;
  draw(c.getContext('2d')!, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Soft, lumpy lawn with lighter tufts. */
export const grassTexture = (() => {
  const tex = canvasTexture(256, (g, s) => {
    g.fillStyle = '#6fcf4f';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const x = (i * 97) % s;
      const y = (i * 61 + ((i * i) % 37)) % s;
      g.fillStyle = i % 3 ? 'rgba(160, 235, 110, 0.5)' : 'rgba(60, 160, 60, 0.45)';
      g.beginPath();
      g.ellipse(x, y, 3 + (i % 4), 1.5 + (i % 3), (i % 7) * 0.4, 0, Math.PI * 2);
      g.fill();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  return tex;
})();

/** Warm wooden planks for the kitchen counter. */
export const woodTexture = (() => {
  const tex = canvasTexture(256, (g, s) => {
    const planks = 4;
    for (let p = 0; p < planks; p++) {
      g.fillStyle = `hsl(${30 + p * 3}, 55%, ${66 + (p % 2) * 5}%)`;
      g.fillRect(0, (p * s) / planks, s, s / planks);
      g.strokeStyle = 'rgba(120, 70, 30, 0.18)';
      g.lineWidth = 2;
      for (let l = 0; l < 6; l++) {
        g.beginPath();
        const y = (p * s) / planks + 6 + l * 10;
        g.moveTo(0, y);
        g.bezierCurveTo(s * 0.3, y + 5, s * 0.6, y - 5, s, y + 2);
        g.stroke();
      }
      g.fillStyle = 'rgba(90, 50, 20, 0.35)';
      g.fillRect(0, ((p + 1) * s) / planks - 2, s, 2);
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
})();

/** Checked tiles for the kitchen wall. */
export const tileTexture = (() => {
  const tex = canvasTexture(128, (g, s) => {
    const n = 4;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        g.fillStyle = (x + y) % 2 ? '#fff4dc' : '#9fe0d8';
        g.fillRect((x * s) / n, (y * s) / n, s / n, s / n);
      }
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 2;
    for (let i = 0; i <= n; i++) {
      g.beginPath();
      g.moveTo((i * s) / n, 0);
      g.lineTo((i * s) / n, s);
      g.moveTo(0, (i * s) / n);
      g.lineTo(s, (i * s) / n);
      g.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
})();

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

/** A soft round dot, for the aiming guide and shadows. */
export const dotTexture = canvasTexture(64, (g, s) => {
  const h = s / 2;
  const grad = g.createRadialGradient(h, h, 0, h, h, h);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
});

/** A blobby splat with drips, tinted per food by the material colour. */
export const splatTexture = canvasTexture(128, (g, s) => {
  const h = s / 2;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(h, h, s * 0.3, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + (i % 3) * 0.2;
    const d = s * (0.3 + (i % 4) * 0.04);
    const r = s * (0.05 + (i % 3) * 0.03);
    g.beginPath();
    g.arc(h + Math.cos(a) * d, h + Math.sin(a) * d, r, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(h, h);
    g.lineTo(h + Math.cos(a - 0.12) * d, h + Math.sin(a - 0.12) * d);
    g.lineTo(h + Math.cos(a + 0.12) * d, h + Math.sin(a + 0.12) * d);
    g.fill();
  }
  // A darker rim reads as thickness.
  g.globalCompositeOperation = 'source-atop';
  const grad = g.createRadialGradient(h, h, s * 0.15, h, h, s * 0.48);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(200,200,200,1)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
});

/** Watermelon rind: dark and light green stripes. */
export const melonTexture = (() => {
  const tex = canvasTexture(128, (g, s) => {
    g.fillStyle = '#58b94a';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#2f7d32';
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      const x = (i * s) / 8;
      g.moveTo(x, 0);
      for (let y = 0; y <= s; y += 8) g.lineTo(x + Math.sin(y * 0.15 + i) * 3 + 5, y);
      for (let y = s; y >= 0; y -= 8) g.lineTo(x + Math.sin(y * 0.15 + i) * 3 - 3, y);
      g.fill();
    }
  });
  return tex;
})();

/** Ladybug back: red with black spots. */
export function spotsTexture(base: string, spot: string): THREE.CanvasTexture {
  return canvasTexture(128, (g, s) => {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    g.fillStyle = spot;
    const spots = [[0.25, 0.3], [0.7, 0.25], [0.45, 0.55], [0.15, 0.7], [0.8, 0.65], [0.5, 0.85]];
    for (const [x, y] of spots) {
      g.beginPath();
      g.arc(x * s, y * s, s * 0.08, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** A butterfly wing, drawn once per colour. */
export function wingTexture(color: string, dots: string): THREE.CanvasTexture {
  return canvasTexture(64, (g, s) => {
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(s * 0.5, s * 0.36, s * 0.45, s * 0.32, 0, 0, Math.PI * 2);
    g.ellipse(s * 0.44, s * 0.76, s * 0.3, s * 0.22, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = dots;
    for (const [x, y, r] of [[0.6, 0.3, 0.11], [0.35, 0.4, 0.07], [0.45, 0.78, 0.08]]) {
      g.beginPath();
      g.arc(x * s, y * s, r * s, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(40, 20, 60, 0.8)';
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(s * 0.5, s * 0.36, s * 0.43, s * 0.3, 0, 0, Math.PI * 2);
    g.stroke();
  });
}

// --- Quality ----------------------------------------------------------------------------------------

export type Quality = 'high' | 'low';

/** A first guess from the device; the world lowers it at runtime if frames are slow. */
export function initialQuality(): Quality {
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
  return cores <= 4 || mem <= 2 ? 'low' : 'high';
}

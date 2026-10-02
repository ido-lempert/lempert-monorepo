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
  /** Opacity (0..1). Glass and jelly use this, not real transmission, which re-renders the scene and is far too slow on phones. */
  transparent?: number;
  double?: boolean;
  map?: THREE.Texture;
  /** A glossy varnish on top (toy plastic, candy, wet eyes). */
  clearcoat?: number;
  /** Soft velvet sheen (fuzzy bodies, sponge, cake). */
  sheen?: number;
  /** Soap-bubble colours (fly wings, bubbles). */
  iridescence?: number;
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
        totalEmissiveRadiance += (diffuseColor.rgb * 0.5 + 0.5) * pow(rimDot, 3.0) * rimStrength;`,
      );
  };
  m.customProgramCacheKey = () => 'rim';
}

/** Shared material per colour and options. Physical (clearcoat, sheen, glass) when any of those is asked for. */
export function mat(color: string, o: MatOptions = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${o.map?.uuid ?? ''}|${JSON.stringify({ ...o, map: undefined })}`;
  let m = mats.get(key);
  if (!m) {
    const c = new THREE.Color(color);
    const physical = o.clearcoat || o.sheen || o.iridescence;
    const params: THREE.MeshPhysicalMaterialParameters = {
      color: c,
      map: o.map ?? null,
      roughness: o.rough ?? 0.5,
      metalness: o.metal ?? 0,
      flatShading: o.flat ?? false,
      emissive: o.emissive ? c : new THREE.Color(0),
      emissiveIntensity: o.emissive ?? 0,
      transparent: o.transparent !== undefined,
      opacity: o.transparent ?? 1,
      depthWrite: !(o.transparent !== undefined && o.transparent < 0.4),
      envMapIntensity: 0.6,
      side: o.double ? THREE.DoubleSide : THREE.FrontSide,
    };
    if (physical) {
      const p = new THREE.MeshPhysicalMaterial({
        ...params,
        clearcoat: o.clearcoat ?? 0,
        clearcoatRoughness: 0.12,
        sheen: o.sheen ?? 0,
        sheenRoughness: 0.5,
        sheenColor: new THREE.Color('#ffffff'),
        ior: 1.35,
        iridescence: o.iridescence ?? 0,
        iridescenceIOR: 1.3,
      });
      m = p;
    } else m = new THREE.MeshStandardMaterial(params);
    const rim = o.rim ?? 0.3;
    if (rim > 0 && !o.flat) withRim(m, rim);
    mats.set(key, m);
  }
  return m;
}

// --- Outlines -------------------------------------------------------------------------------------

function outlineMaterial(width: number) {
  const m = new THREE.MeshBasicMaterial({ color: '#3a2238', side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.outlineWidth = { value: width };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float outlineWidth;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * outlineWidth;');
  };
  m.customProgramCacheKey = () => `outline${width}`;
  return m;
}
const outlineMats = new Map<string, THREE.MeshBasicMaterial>();

let outlinesOn = true;

/** The cartoon outlines are an extra draw for every mesh, so low quality turns them off. */
export function setOutlines(on: boolean) {
  outlinesOn = on;
  for (const [key, m] of outlineMats) if (!key.endsWith('|always')) m.visible = on;
}

/** Gives every mesh in a model a dark cartoon outline (the "inverted hull" trick: one extra draw each). */
export function outline(root: THREE.Object3D, width = 0.022, always = false) {
  const key = `${width}${always ? '|always' : ''}`;
  let m = outlineMats.get(key);
  if (!m) {
    m = outlineMaterial(width);
    m.visible = always || outlinesOn;
    outlineMats.set(key, m);
  }
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
      top: { value: new THREE.Color('#5fb0e6') },
      middle: { value: new THREE.Color('#efcf9c') },
      bottom: { value: new THREE.Color('#d99a64') },
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

/** A soft dark round blot, for contact shadows under bugs and flying food. */
export const blobTexture = canvasTexture(64, (g, s) => {
  const h = s / 2;
  const grad = g.createRadialGradient(h, h, 0, h, h, h);
  grad.addColorStop(0, 'rgba(20,10,30,0.55)');
  grad.addColorStop(0.5, 'rgba(20,10,30,0.3)');
  grad.addColorStop(1, 'rgba(20,10,30,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
});

/** A sunny window: sky, a cloud and a hint of garden. */
export const windowTexture = canvasTexture(256, (g, s) => {
  const sky = g.createLinearGradient(0, 0, 0, s);
  sky.addColorStop(0, '#6cc6ff');
  sky.addColorStop(0.7, '#d9f3ff');
  sky.addColorStop(1, '#9fe08a');
  g.fillStyle = sky;
  g.fillRect(0, 0, s, s);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  for (const [x, y, r] of [[70, 70, 26], [100, 60, 32], [130, 74, 24], [190, 120, 18], [210, 112, 22]]) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#5fbf45';
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    g.arc(i * 40, s, 40 + (i % 3) * 12, 0, Math.PI * 2);
    g.fill();
  }
});

/** Light oak boards for the kitchen table: wide planks with soft grain and staggered joints (low contrast, so it never shimmers). */
export const woodTexture = (() => {
  const tex = canvasTexture(512, (g, s) => {
    const rows = 4;
    const h = s / rows;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let r = 0; r < rows; r++) {
      const cut = (0.25 + rnd() * 0.5) * s;
      for (const [x0, x1] of [[0, cut], [cut, s]]) {
        const light = 66 + rnd() * 6;
        g.fillStyle = `hsl(${31 + rnd() * 5}, ${42 + rnd() * 6}%, ${light}%)`;
        g.fillRect(x0, r * h, x1 - x0, h);
        // Long soft grain.
        for (let l = 0; l < 7; l++) {
          const y = r * h + 6 + rnd() * (h - 12);
          g.strokeStyle = `rgba(150, 95, 50, ${0.05 + rnd() * 0.07})`;
          g.lineWidth = 1 + rnd() * 2;
          g.beginPath();
          g.moveTo(x0, y);
          g.bezierCurveTo(x0 + (x1 - x0) * 0.3, y + rnd() * 8 - 4, x0 + (x1 - x0) * 0.7, y + rnd() * 8 - 4, x1, y + rnd() * 4 - 2);
          g.stroke();
        }
        g.fillStyle = 'rgba(120, 75, 40, 0.22)';
        g.fillRect(x0, r * h, 2, h);
      }
      g.fillStyle = 'rgba(120, 75, 40, 0.22)';
      g.fillRect(0, r * h, s, 3);
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.repeat.set(5, 5);
  return tex;
})();

/** Checked tiles for the kitchen wall. */
export const tileTexture = (() => {
  const tex = canvasTexture(128, (g, s) => {
    const n = 4;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        g.fillStyle = (x + y) % 2 ? '#f2e6cc' : '#7fc8c0';
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

// --- Grass ----------------------------------------------------------------------------------------

const wind = { value: 0 };

export function setWindTime(t: number) {
  wind.value = t;
}

/**
 * Thousands of little grass blades in one draw call, swaying in the wind, darker at the root and sunlit
 * at the tip. `radius`: the circle to fill; `count` depends on quality.
 */
export function grassField(
  radius: number,
  count: number,
  palette: { h: [number, number]; s: [number, number]; l: [number, number]; height: number },
  inside: (x: number, z: number) => boolean,
  segs = 4,
): THREE.InstancedMesh {
  // A blade: long, thin and tapering, gently curved, in four segments.
  const geo = new THREE.BufferGeometry();
  const w = 0.022;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const half = w * (1 - t * 0.85);
    const bend = t * t * 0.18;
    pos.push(-half, t, bend, half, t, bend);
    if (i < segs) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
    }
  }
  // A sharp tip.
  pos.push(0, 1.08, 0.2);
  idx.push(segs * 2, segs * 2 + 1, segs * 2 + 2);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = wind;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float windTime;\nvarying float vH;\nvoid main() {')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vH = position.y;
        vec4 root = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float bend = position.y * position.y;
        transformed.x += sin(windTime * 1.7 + root.x * 0.6 + root.z * 0.4) * bend * 0.08;
        transformed.z += cos(windTime * 1.3 + root.z * 0.5) * bend * 0.05;`,
      );
    // Normals point up so blades light like the lawn rather than flickering paper.
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying float vH;\nvoid main() {')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.85, 1.12, vH);');
  };
  m.customProgramCacheKey = () => 'grassBlade';
  const mesh = new THREE.InstancedMesh(geo, m, count);
  const d = new THREE.Object3D();
  const c = new THREE.Color();
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 8; tries++) {
      const r = Math.sqrt(rnd()) * (radius - 0.25);
      const a = rnd() * Math.PI * 2;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
      if (inside(x, z)) break;
      x = z = 0;
    }
    d.position.set(x, 0, z);
    d.rotation.set(0, rnd() * Math.PI, (rnd() - 0.5) * 0.35);
    const h = (0.22 + rnd() * 0.3) * palette.height;
    d.scale.set(0.8 + rnd() * 0.5, h, h);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
    const lerp = (r: [number, number]) => r[0] + rnd() * (r[1] - r[0]);
    c.setHSL(lerp(palette.h), lerp(palette.s), lerp(palette.l));
    mesh.setColorAt(i, c);
  }
  mesh.raycast = () => {};
  return mesh;
}

// --- Quality ----------------------------------------------------------------------------------------

export type Quality = 'high' | 'low';

/** A first guess from the device; the world lowers it at runtime if frames are slow. */
/** Set when a phone's graphics chip dropped the 3D view: from then on this device starts in low quality. */
export const LOW_GFX_KEY = 'smashIt.lowGfx';

export function initialQuality(): Quality {
  try {
    if (localStorage.getItem(LOW_GFX_KEY)) return 'low';
  } catch {
    // storage blocked: use the device guess
  }
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
  // Phones start light: post-processing and soft shadows are too much for most of them.
  const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 700;
  if (phone && (cores < 8 || mem < 8)) return 'low';
  return cores <= 4 || mem <= 2 ? 'low' : 'high';
}

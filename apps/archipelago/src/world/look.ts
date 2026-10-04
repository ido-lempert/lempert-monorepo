/**
 * The visual style shared by every model: glossy toy materials with a soft rim light, a gradient sky,
 * textures drawn on a canvas, and the quality guess. Kept apart from the models so the look is tuned in
 * one place.
 */
import * as THREE from 'three';

export interface MatOptions {
  emissive?: number;
  rough?: number;
  metal?: number;
  /** Strength of the soft light around the edges; 0 turns it off. */
  rim?: number;
  /** Opacity (0..1); real transmission is far too slow on phones. */
  transparent?: number;
  double?: boolean;
  map?: THREE.Texture;
  /** A glossy varnish on top (toy plastic, wet eyes). */
  clearcoat?: number;
  /** Soft velvet sheen (fuzzy critters). */
  sheen?: number;
}

const mats = new Map<string, THREE.MeshStandardMaterial>();

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

/** Shared material per colour and options; physical (clearcoat, sheen) when asked for. */
export function mat(color: string, o: MatOptions = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${o.map?.uuid ?? ''}|${JSON.stringify({ ...o, map: undefined })}`;
  let m = mats.get(key);
  if (!m) {
    const c = new THREE.Color(color);
    const params: THREE.MeshPhysicalMaterialParameters = {
      color: c,
      map: o.map ?? null,
      roughness: o.rough ?? 0.5,
      metalness: o.metal ?? 0,
      emissive: o.emissive ? c : new THREE.Color(0),
      emissiveIntensity: o.emissive ?? 0,
      transparent: o.transparent !== undefined,
      opacity: o.transparent ?? 1,
      depthWrite: !(o.transparent !== undefined && o.transparent < 0.5),
      envMapIntensity: 0.7,
      side: o.double ? THREE.DoubleSide : THREE.FrontSide,
    };
    m =
      o.clearcoat || o.sheen
        ? new THREE.MeshPhysicalMaterial({
            ...params,
            clearcoat: o.clearcoat ?? 0,
            clearcoatRoughness: 0.15,
            sheen: o.sheen ?? 0,
            sheenRoughness: 0.5,
            sheenColor: new THREE.Color('#ffffff'),
          })
        : new THREE.MeshStandardMaterial(params);
    const rim = o.rim ?? 0.28;
    if (rim > 0) withRim(m, rim);
    mats.set(key, m);
  }
  return m;
}

/** A material of its own (not shared), for things that fade or change colour. */
export function ownMat(color: string, o: MatOptions = {}): THREE.MeshStandardMaterial {
  const m = mat(color, o).clone();
  withRim(m, o.rim ?? 0.28);
  return m;
}

// --- Sky ------------------------------------------------------------------------------------------

export function skyDome(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color('#4ab3ff') },
      middle: { value: new THREE.Color('#9edcff') },
      bottom: { value: new THREE.Color('#e3f6ff') },
    },
    vertexShader: `varying vec3 vPos;
      void main() {
        vPos = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform vec3 top; uniform vec3 middle; uniform vec3 bottom; varying vec3 vPos;
      void main() {
        float h = vPos.y;
        vec3 c = h > 0.2 ? mix(middle, top, smoothstep(0.2, 0.8, h)) : mix(bottom, middle, smoothstep(-0.05, 0.2, h));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(120, 32, 16), material);
  dome.renderOrder = -1;
  return dome;
}

// --- Textures ---------------------------------------------------------------------------------------

export function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A soft four-pointed sparkle, for bursts. */
export const sparkleTexture = canvasTexture(64, (g, s) => {
  const h = s / 2;
  const grad = g.createRadialGradient(h, h, 0, h, h, h);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.8)');
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

/** A soft round blob, for contact shadows under critters. */
export const blobTexture = canvasTexture(64, (g, s) => {
  const h = s / 2;
  const grad = g.createRadialGradient(h, h, 0, h, h, h);
  grad.addColorStop(0, 'rgba(20,30,60,0.55)');
  grad.addColorStop(1, 'rgba(20,30,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
});

/** Arrows along a pipe; scrolling the texture makes them march from caller to callee. */
export const arrowTexture = (() => {
  const t = canvasTexture(128, (g, s) => {
    g.fillStyle = 'rgba(255,255,255,0)';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(s * 0.3, s * 0.15);
    g.lineTo(s * 0.7, s * 0.5);
    g.lineTo(s * 0.3, s * 0.85);
    g.lineTo(s * 0.42, s * 0.5);
    g.closePath();
    g.fill();
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();

/** Grass with little darker tufts. */
export const grassTexture = (() => {
  const t = canvasTexture(256, (g, s) => {
    g.fillStyle = '#86cc63';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 260; i++) {
      const x = (i * 97) % s;
      const y = (i * 61 + (i * i) % 37) % s;
      g.fillStyle = i % 3 ? 'rgba(60,150,50,0.25)' : 'rgba(200,255,150,0.3)';
      g.beginPath();
      g.ellipse(x, y, 5 + (i % 4), 2 + (i % 3), (i % 7) * 0.4, 0, Math.PI * 2);
      g.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
})();

// --- Quality ----------------------------------------------------------------------------------------

export type Quality = 'high' | 'low';

/** A first guess from the device; World lowers it at runtime when frames are slow. */
export function initialQuality(): Quality {
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
  const phone = matchMedia('(pointer: coarse)').matches;
  return phone || cores <= 4 || mem <= 2 ? 'low' : 'high';
}

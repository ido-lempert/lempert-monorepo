/**
 * Ready-made models: Kenney's Food Kit (CC0, public domain: free for commercial use, no attribution
 * required; see public/models/kenney-food/License.txt). Used for most foods, the giant kitchen things
 * around the world and some of the little things around its rim. They are loaded once at start (and
 * precached by the service worker, so the game still works offline); until they arrive, or if they
 * fail, the procedural models stand in.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { roundOff } from './smooth';

const BASE = 'models/kenney-food/';

export const ASSETS = [
  'cookie-chocolate', 'cheese', 'pudding', 'pie', 'pizza',
  'plate', 'mug', 'cup-tea', 'bowl', 'apple', 'orange', 'banana', 'pear', 'lemon', 'bottle-ketchup',
  'shaker-salt', 'shaker-pepper', 'pepper-mill', 'knife-block', 'loaf-round', 'bread', 'cherries',
  'strawberry', 'lollypop', 'tomato', 'carrot', 'radish', 'cupcake', 'cake-birthday', 'honey', 'pumpkin',
] as const;
export type AssetId = (typeof ASSETS)[number];

/** Triangles each mesh may have after smoothing: big props are seen up close; small things and flying food are many, on phones. */
const BIG = new Set<AssetId>(['plate', 'mug', 'cup-tea', 'bowl', 'bottle-ketchup', 'shaker-salt', 'shaker-pepper', 'pepper-mill', 'knife-block', 'loaf-round', 'cake-birthday', 'honey', 'pumpkin', 'apple', 'orange', 'banana', 'pear', 'lemon']);
const FOODS = new Set<AssetId>(['cookie-chocolate', 'cheese', 'pudding', 'pie', 'pizza']);
const budgetOf = (id: AssetId) => (BIG.has(id) ? 1500 : FOODS.has(id) ? 500 : 0);

interface Template {
  scene: THREE.Object3D;
  /** Size of its bounding box. */
  size: THREE.Vector3;
}

const templates = new Map<AssetId, Template>();

/** Toy-like finish: a little gloss and the environment's reflections on the flat colours. */
function polish(o: THREE.Object3D, budget: number) {
  o.traverse((c) => {
    if (!(c instanceof THREE.Mesh)) return;
    const old = c.material as THREE.MeshStandardMaterial;
    const m = new THREE.MeshPhysicalMaterial({
      map: old.map,
      color: old.color,
      roughness: 0.55,
      metalness: 0,
      clearcoat: 0.35,
      clearcoatRoughness: 0.35,
      envMapIntensity: 0.7,
    });
    c.material = m;
    const geo = c.geometry;
    const tris = (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
    const cuts = Math.min(5, Math.floor(Math.sqrt(budget / Math.max(1, tris))));
    c.geometry = cuts > 1 ? roundOff(geo, cuts) : geo;
    if (c.geometry !== geo) geo.dispose();
    c.castShadow = true;
    c.receiveShadow = true;
  });
}

/** Loads every model (in parallel); resolves even if some fail (those keep their procedural stand-ins). */
export async function loadAssets(): Promise<void> {
  const loader = new GLTFLoader();
  await Promise.all(
    ASSETS.map(async (id) => {
      try {
        const gltf = await loader.loadAsync(`${BASE}${id}.glb`);
        const scene = gltf.scene;
        polish(scene, budgetOf(id));
        const box = new THREE.Box3().setFromObject(scene);
        templates.set(id, { scene, size: box.getSize(new THREE.Vector3()) });
      } catch (err) {
        console.warn(`Model ${id} could not be loaded`, err);
      }
    }),
  );
}

export function hasAsset(id: AssetId): boolean {
  return templates.has(id);
}

/**
 * A copy of a model, scaled and placed:
 * - `fit: 'radius'`: centred on its middle and scaled to fit in a ball of radius `size` (flying food);
 * - `fit: 'height'` / `'width'`: standing on y = 0, scaled to that height or widest footprint (props).
 */
export function asset(id: AssetId, size: number, fit: 'radius' | 'height' | 'width' = 'radius'): THREE.Group | null {
  const t = templates.get(id);
  if (!t) return null;
  const copy = t.scene.clone(true);
  const box = new THREE.Box3().setFromObject(copy);
  const center = box.getCenter(new THREE.Vector3());
  const k =
    fit === 'radius' ? size / Math.max(0.0001, t.size.length() / 2) : fit === 'height' ? size / Math.max(0.0001, t.size.y) : size / Math.max(0.0001, t.size.x, t.size.z);
  copy.position.set(-center.x, fit === 'radius' ? -center.y : -box.min.y, -center.z);
  const g = new THREE.Group();
  g.add(copy);
  g.scale.setScalar(k);
  return g;
}

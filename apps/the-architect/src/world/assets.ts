/**
 * Ready-made models: KayKit Restaurant Bits (furniture, kitchen, food) and Quaternius characters, both CC0,
 * in `public/models/` next to their licence files. Each file loads once; callers get clones.
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();

function load(url: string): Promise<GLTF> {
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url).then((g) => {
      g.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
      });
      return g;
    });
    cache.set(url, p);
  }
  return p;
}

export type Prop = string;

/** A KayKit restaurant piece by its file name (e.g. `table_round_A_decorated`). */
export async function prop(name: Prop): Promise<THREE.Object3D> {
  const g = await load(`models/kaykit-restaurant/${name}.gltf`);
  return g.scene.clone(true);
}

export type Who = 'woman' | 'suit' | 'woman2' | 'worker' | 'business' | 'farmer';

export interface Person {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  /** Plays the clip whose name ends with `name` (Walk, Idle, Sitting, Interact, Wave...), fading from the last one. */
  play(name: string): void;
}

/** Bounds of a rigged model as posed by its skeleton (its meshes' own bounds ignore the bones' scale). */
function skinnedBox(model: THREE.Object3D): THREE.Box3 {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3();
  model.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    m.computeBoundingBox();
    box.union(m.boundingBox!.clone().applyMatrix4(m.matrixWorld));
  });
  return box;
}

/** A Quaternius character, scaled to `height` metres, with its animations ready. */
export async function person(who: Who, height = 1.85): Promise<Person> {
  const g = await load(`models/quaternius/${who}.glb`);
  const model = cloneSkinned(g.scene);
  // Skinned meshes keep their bind-pose bounds, which are tiny here, so the camera would cull them.
  model.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false;
  });
  const root = new THREE.Group();
  root.add(model);
  const box = skinnedBox(model);
  model.scale.setScalar(height / (box.max.y - box.min.y));
  model.position.y = -box.min.y * model.scale.y;
  const mixer = new THREE.AnimationMixer(model);
  let current: THREE.AnimationAction | null = null;
  const play = (name: string) => {
    const clip = g.animations.find((a) => a.name.split('|').pop()!.toLowerCase() === name.toLowerCase()) ?? g.animations.find((a) => a.name.toLowerCase().endsWith(name.toLowerCase()));
    if (!clip) return;
    const next = mixer.clipAction(clip);
    if (next === current) return;
    next.reset().fadeIn(0.25).play();
    current?.fadeOut(0.25);
    current = next;
  };
  return { root, mixer, play };
}

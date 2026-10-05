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

export type Move = 'idle' | 'walk' | 'run' | 'sit' | 'work' | 'wave';

/** Each pack names its clips its own way. */
const CLIPS: Record<Move, string[]> = {
  idle: ['idle', 'man_idle', 'idle_neutral'],
  walk: ['walk', 'walking', 'man_walk'],
  run: ['run', 'running', 'man_run'],
  sit: ['sitidle', 'man_sitting', 'sitting'],
  work: ['interact', 'pickup', 'idle'],
  wave: ['wave', 'idle'],
};

export interface Person {
  who: Who;
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  /** Plays a move, fading from the last one. */
  play(move: Move): void;
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
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    m.frustumCulled = false;
    // Some exports flag fully opaque materials as transparent, which makes people look like ghosts.
    for (const mat of [m.material].flat()) if (mat.opacity >= 1) mat.transparent = false;
  });
  const root = new THREE.Group();
  root.add(model);
  const box = skinnedBox(model);
  model.scale.setScalar(height / (box.max.y - box.min.y));
  model.position.y = -box.min.y * model.scale.y;
  const mixer = new THREE.AnimationMixer(model);
  let current: THREE.AnimationAction | null = null;
  const named = (n: string) => g.animations.find((a) => a.name.split('|').pop()!.toLowerCase() === n);
  const play = (move: Move) => {
    const clip = CLIPS[move].map(named).find(Boolean);
    if (!clip) return;
    const next = mixer.clipAction(clip);
    if (next === current) return;
    next.reset().fadeIn(0.25).play();
    current?.fadeOut(0.25);
    current = next;
  };
  return { who, root, mixer, play };
}

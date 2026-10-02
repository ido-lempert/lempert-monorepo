import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { withRim } from './look';

const shared = new WeakSet<THREE.BufferGeometry>();

/** Marks a geometry that many models use, so `free` leaves it on the graphics chip. */
export function share<T extends THREE.BufferGeometry>(g: T): T {
  shared.add(g);
  return g;
}

/**
 * Frees the graphics memory of a model that is going away (geometries stay on the chip until disposed, and a phone
 * that fills up drops the whole 3D view). Shared geometries and the cached materials and textures stay.
 */
export function free(root: THREE.Object3D): void {
  root.traverse((o) => {
    const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (g && !shared.has(g)) g.dispose();
  });
}

/**
 * Materials that differ only in colour become one white material with the colour baked into the vertices, so a
 * rim of sprinkles in ten colours is one draw call and not ten. Emissive things keep their own material.
 */
const twins = new Map<string, THREE.MeshStandardMaterial>();

function twinOf(m: THREE.Material): { key: string; twin: THREE.MeshStandardMaterial } | null {
  const s = m as THREE.MeshPhysicalMaterial;
  if (!s.isMeshStandardMaterial || s.emissiveIntensity > 0 || s.vertexColors) return null;
  const key = [s.type, s.roughness, s.metalness, s.flatShading, s.opacity, s.transparent, s.depthWrite, s.side, s.map?.uuid, s.envMapIntensity, s.clearcoat, s.sheen, s.iridescence, s.userData.rim].join('|');
  let twin = twins.get(key);
  if (!twin) {
    twin = s.clone();
    twin.color.set('#ffffff');
    twin.vertexColors = true;
    if (s.userData.rim > 0) withRim(twin, s.userData.rim);
    twins.set(key, twin);
  }
  return { key, twin };
}

function prune(o: THREE.Object3D) {
  for (const c of [...o.children]) {
    prune(c);
    if (c.type === 'Group' && c.children.length === 0) c.removeFromParent();
  }
}

/**
 * Welds the static meshes under `root` into one mesh per (material, shadow flags): scenery that never moves costs
 * one draw call per material instead of one per object, which is what phones run out of first. Meshes with
 * several materials, instanced meshes and anything marked `userData.keep` stay as they are. `root` must not move
 * after this (positions are baked relative to it). `flags` overrides the shadow flags of everything merged.
 */
export function mergeStatic(root: THREE.Object3D, flags: { cast?: boolean; receive?: boolean } = {}): void {
  root.updateWorldMatrix(true, true);
  const toRoot = root.matrixWorld.clone().invert();
  const groups = new Map<string, { material: THREE.Material; geos: THREE.BufferGeometry[]; cast: boolean; receive: boolean }>();
  const taken: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material) || o.userData.keep || !m.visible) return;
    const cast = flags.cast ?? m.castShadow;
    const receive = flags.receive ?? m.receiveShadow;
    const tw = twinOf(m.material);
    const key = `${tw ? `twin|${tw.key}` : m.material.uuid}|${cast}|${receive}`;
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { material: tw ? tw.twin : m.material, geos: [], cast, receive }));
    const g = m.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    if (!g.index) g.setIndex(Array.from({ length: g.getAttribute('position').count }, (_, i) => i));
    if (tw) {
      const c = (m.material as THREE.MeshStandardMaterial).color;
      const n = g.getAttribute('position').count;
      const colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    g.applyMatrix4(m.matrixWorld.clone().premultiply(toRoot));
    group.geos.push(g);
    taken.push(m);
  });
  for (const m of taken) m.removeFromParent();
  for (const { material, geos, cast, receive } of groups.values()) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.matrixAutoUpdate = false;
    mesh.raycast = () => {};
    root.add(mesh);
  }
  prune(root);
}

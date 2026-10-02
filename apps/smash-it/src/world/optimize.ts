import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
    const key = `${m.material.uuid}|${cast}|${receive}`;
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { material: m.material, geos: [], cast, receive }));
    const g = m.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    if (!g.index) g.setIndex(Array.from({ length: g.getAttribute('position').count }, (_, i) => i));
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

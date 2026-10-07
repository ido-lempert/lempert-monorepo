import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Welds a group of static props into one mesh per material (a kitchen of ~30 props is ~1,500 small
 * meshes otherwise). Instanced parts (jars, bottles) stay instanced. Glass does not cast shadows.
 */
export function bake(src: THREE.Object3D, name: string): THREE.Group {
  src.updateMatrixWorld(true);
  const inv = src.matrixWorld.clone().invert();
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const out = new THREE.Group();
  out.name = name;
  const keep: THREE.InstancedMesh[] = [];
  src.traverse((o) => {
    if ((o as THREE.InstancedMesh).isInstancedMesh) return void keep.push(o as THREE.InstancedMesh);
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone());
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    const mat = m.material as THREE.Material;
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat)!.push(g);
  });
  for (const [mat, geos] of byMat) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.name = `${name} (${mat.name || 'part'})`;
    mesh.castShadow = !mat.transparent;
    mesh.receiveShadow = true;
    out.add(mesh);
    geos.forEach((g) => g.dispose());
  }
  for (const im of keep) {
    new THREE.Matrix4().multiplyMatrices(inv, im.matrixWorld).decompose(im.position, im.quaternion, im.scale);
    out.add(im);
  }
  return out;
}

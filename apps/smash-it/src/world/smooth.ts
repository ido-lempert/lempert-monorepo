import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const key = (x: number, y: number, z: number) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;

/**
 * Makes a low-poly mesh look round. Shading uses creased normals (smooth on curves, sharp on real
 * corners). The silhouette is rounded with Phong tessellation: every triangle is cut into `cuts`² and each
 * new point is pulled onto the tangent planes of the corners. The pull uses a normal averaged over every
 * face that meets at a position, so two faces sharing an edge move it identically and nothing cracks.
 */
export function roundOff(source: THREE.BufferGeometry, cuts = 4, crease = THREE.MathUtils.degToRad(70), strength = 0.55): THREE.BufferGeometry {
  const shaded = toCreasedNormals(source, crease);
  const pos = shaded.getAttribute('position');
  const nor = shaded.getAttribute('normal');
  const uv = shaded.getAttribute('uv');
  const tris = pos.count / 3;

  // Average normal per position, weighted by triangle area, for the silhouette pull.
  const area = new Map<string, THREE.Vector3>();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3();
  for (let t = 0; t < tris; t++) {
    a.fromBufferAttribute(pos, t * 3);
    b.fromBufferAttribute(pos, t * 3 + 1);
    c.fromBufferAttribute(pos, t * 3 + 2);
    fn.subVectors(b, a).cross(c.clone().sub(a)); // length = 2 x area
    for (let k = 0; k < 3; k++) {
      const p = [a, b, c][k];
      const id = key(p.x, p.y, p.z);
      const acc = area.get(id) ?? new THREE.Vector3();
      acc.add(fn);
      area.set(id, acc);
    }
  }
  for (const v of area.values()) v.normalize();

  const per = cuts * cuts * 3;
  const out = new Float32Array(tris * per * 3);
  const outN = new Float32Array(tris * per * 3);
  const outUv = uv ? new Float32Array(tris * per * 2) : null;
  const P = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const S = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const N = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const U = [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()];
  const q = new THREE.Vector3(), r = new THREE.Vector3(), n = new THREE.Vector3(), d = new THREE.Vector3();

  const point = (bary: [number, number, number], o: number, ou: number) => {
    q.set(0, 0, 0);
    for (let k = 0; k < 3; k++) q.addScaledVector(P[k], bary[k]);
    r.set(0, 0, 0);
    for (let k = 0; k < 3; k++) {
      d.subVectors(q, P[k]);
      r.addScaledVector(d.addScaledVector(S[k], -d.dot(S[k])).add(P[k]), bary[k]);
    }
    q.lerp(r, strength);
    n.set(0, 0, 0);
    for (let k = 0; k < 3; k++) n.addScaledVector(N[k], bary[k]);
    n.normalize();
    out[o] = q.x; out[o + 1] = q.y; out[o + 2] = q.z;
    outN[o] = n.x; outN[o + 1] = n.y; outN[o + 2] = n.z;
    if (outUv) {
      outUv[ou] = U[0].x * bary[0] + U[1].x * bary[1] + U[2].x * bary[2];
      outUv[ou + 1] = U[0].y * bary[0] + U[1].y * bary[1] + U[2].y * bary[2];
    }
  };

  let w = 0;
  let wu = 0;
  for (let t = 0; t < tris; t++) {
    for (let k = 0; k < 3; k++) {
      P[k].fromBufferAttribute(pos, t * 3 + k);
      N[k].fromBufferAttribute(nor, t * 3 + k);
      S[k].copy(area.get(key(P[k].x, P[k].y, P[k].z)) ?? N[k]);
      if (uv) U[k].set(uv.getX(t * 3 + k), uv.getY(t * 3 + k));
    }
    const bary = (i: number, j: number): [number, number, number] => [1 - (i + j) / cuts, i / cuts, j / cuts];
    for (let i = 0; i < cuts; i++) {
      for (let j = 0; j < cuts - i; j++) {
        const tri = [bary(i, j), bary(i + 1, j), bary(i, j + 1)];
        for (const bc of tri) { point(bc, w, wu); w += 3; wu += 2; }
        if (i + j < cuts - 1) {
          const tri2 = [bary(i + 1, j), bary(i + 1, j + 1), bary(i, j + 1)];
          for (const bc of tri2) { point(bc, w, wu); w += 3; wu += 2; }
        }
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out.slice(0, w), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(outN.slice(0, w), 3));
  if (outUv) g.setAttribute('uv', new THREE.BufferAttribute(outUv.slice(0, wu), 2));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  shaded.dispose();
  return g;
}

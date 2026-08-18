/**
 * CPU-built geometry for the signal bloom: curved tapered petal strips,
 * core icosahedron cluster transforms, and the starfield shell.
 * All randomness is deterministic (seeded) so rebuilds are stable.
 */
import * as THREE from "three";

export const GOLDEN_ANGLE = 2.399963229728653;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * A curved, tapered petal strip: PlaneGeometry 1.0 × 1.6 (12×20 segments),
 * base moved to y=0, then bent lengthwise + slightly cupped across width.
 * uv.y is rewritten to run 0 (base) → 1 (tip).
 *
 * The geometry is de-indexed and given per-FACE shard attributes (aDir,
 * aCtr): during the disperse dissolve each triangle flies out as a small
 * coherent shard (shrinking toward its centroid) so the bloom breaks into
 * a glyph cloud instead of stretching into connected slivers.
 */
export function createPetalGeometry(): THREE.BufferGeometry {
  const length = 1.6;
  const width = 1.0;
  const plane = new THREE.PlaneGeometry(width, length, 12, 20);
  plane.translate(0, length / 2, 0);
  const ppos = plane.attributes.position;
  const puv = plane.attributes.uv;
  for (let i = 0; i < ppos.count; i++) {
    const x = ppos.getX(i);
    const y = ppos.getY(i);
    // clamp: translate() leaves ~-1e-16 at the base, and pow(negative, 0.75) is NaN
    const t = Math.min(Math.max(y / length, 0), 1); // 0 base → 1 tip
    const u = x / (width / 2); // -1..1 across width
    // taper: narrow base, widest ~mid, pinched tip
    const bell = Math.pow(Math.sin(Math.PI * Math.min(t, 0.999)), 0.75);
    const taper = (0.34 + 0.66 * bell) * (1 - 0.82 * smoothstep(0.8, 1, t));
    const nx = x * taper;
    // lengthwise bend (curl toward +Z) + slight cup across width
    let z = 0.55 * t * t - 0.08 * Math.sin(Math.PI * t);
    z += u * u * 0.14 * taper;
    ppos.setXYZ(i, nx, y, z);
    puv.setY(i, t);
  }
  plane.computeVertexNormals();
  const geo = plane.toNonIndexed();
  plane.dispose();

  const pos = geo.attributes.position;
  const faceCount = pos.count / 3;
  const dirs = new Float32Array(pos.count * 3);
  const ctrs = new Float32Array(pos.count * 3);
  const rand = mulberry32(777);
  const d = new THREE.Vector3();
  for (let f = 0; f < faceCount; f++) {
    const i0 = f * 3;
    const cx = (pos.getX(i0) + pos.getX(i0 + 1) + pos.getX(i0 + 2)) / 3;
    const cy = (pos.getY(i0) + pos.getY(i0 + 1) + pos.getY(i0 + 2)) / 3;
    const cz = (pos.getZ(i0) + pos.getZ(i0 + 1) + pos.getZ(i0 + 2)) / 3;
    d.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
    if (d.lengthSq() < 1e-6) d.set(0, 1, 0);
    d.normalize();
    for (let k = 0; k < 3; k++) {
      const j = (i0 + k) * 3;
      dirs[j] = d.x;
      dirs[j + 1] = d.y;
      dirs[j + 2] = d.z;
      ctrs[j] = cx;
      ctrs[j + 1] = cy;
      ctrs[j + 2] = cz;
    }
  }
  geo.setAttribute("aDir", new THREE.BufferAttribute(dirs, 3));
  geo.setAttribute("aCtr", new THREE.BufferAttribute(ctrs, 3));
  return geo;
}

export interface PetalSpec {
  tilt: number; // polar angle from vertical axis (rad)
  azimuth: number; // rotation about Y (rad)
  roll: number; // small twist about the petal's own axis (rad)
  scale: number;
  seed: number;
}

/** 10 petals, two whorls: 6 outer (~65° tilt) + 4 inner (~35°), golden-angle azimuths. */
export function createPetalSpecs(): PetalSpec[] {
  const rand = mulberry32(1337);
  const specs: PetalSpec[] = [];
  for (let i = 0; i < 10; i++) {
    const outer = i < 6;
    const baseTilt = outer ? (65 * Math.PI) / 180 : (35 * Math.PI) / 180;
    specs.push({
      tilt: baseTilt + (rand() - 0.5) * 0.10,
      azimuth: i * GOLDEN_ANGLE + (outer ? 0 : GOLDEN_ANGLE * 0.5),
      roll: (rand() - 0.5) * 0.24,
      scale: (outer ? 1.0 : 0.62) * (0.96 + rand() * 0.08),
      seed: rand() * 10 + i,
    });
  }
  return specs;
}

export const CORE_COUNT = 40;

/** Fill an InstancedMesh with ~40 tiny icosahedra clustered in a 0.35-radius ball. */
export function fillCoreInstances(mesh: THREE.InstancedMesh): void {
  const rand = mulberry32(4242);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const cA = new THREE.Color("#fb7185");
  const cB = new THREE.Color("#f9a8d4");
  const c = new THREE.Color();
  for (let i = 0; i < CORE_COUNT; i++) {
    const dir = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
    if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
    dir.normalize();
    const r = 0.35 * Math.cbrt(rand());
    p.copy(dir).multiplyScalar(r);
    const sc = 0.05 + rand() * 0.04; // radius 0.05–0.09
    s.set(sc, sc, sc);
    eul.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    q.setFromEuler(eul);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    c.copy(cA).lerp(cB, rand());
    mesh.setColorAt(i, c);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

export const STAR_COUNT = 250;

/** ~250 points in a 12–30 unit shell, biased behind the bloom (−Z). */
export function createStarGeometry(): THREE.BufferGeometry {
  const rand = mulberry32(9001);
  const positions = new Float32Array(STAR_COUNT * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < STAR_COUNT; i++) {
    v.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
    if (v.lengthSq() < 1e-6) v.set(0, 0, -1);
    v.normalize().multiplyScalar(12 + rand() * 18);
    if (v.z > 0 && rand() < 0.6) v.z *= -1; // bias behind
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geo;
}

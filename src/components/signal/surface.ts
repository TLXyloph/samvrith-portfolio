/**
 * v4 anatomy — the organic half must be unmistakably a BRAIN:
 *  - buildBrainSurface: two-lobe cerebrum with CONVOLUTED GYRI — domain-
 *    warped sinusoid ridge folds (not noise bumps), fold wavelength
 *    ~0.145u flowing front-to-back, deep enough to read in silhouette;
 *    per-vertex aFold drives valley shading (sulci dark / crests bright)
 *    and aCluster drives activation.
 *  - buildCerebellum: distinct back-bottom lobe with finer parallel
 *    striations (folia).
 *  - buildBrainstem: short curved tapering cylinder descending from the
 *    bottom-center (medulla curve).
 *  - buildBackplane: UV-mapped silicon substrate half-disc for the painted
 *    PCB texture (see pcbTexture.ts), edge-faded via vertex colors.
 */
import * as THREE from "three";
import { clusterOf, fbm3, shellZ, type SignalVariant } from "./brain";

export const PCB_U0 = 0.03;
export const PCB_U1 = 1.32;
export const PCB_V = 1.0;

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Domain-warped ridge field: 1 at gyral crests, 0 in sulci. */
function gyriField(x: number, y: number, z: number): number {
  const K = Math.PI / 0.145; // ridge spacing ~0.145u
  const c = 0.78 * x + 0.6 * y; // iso-lines run front-to-back (along z)
  const warp = (fbm3(x * 1.9 + 3.1, y * 1.9, z * 1.9) - 0.5) * 0.85;
  const ridge = Math.abs(Math.sin(K * (c + warp)));
  return Math.pow(ridge, 0.7);
}

export function buildBrainSurface(variant: SignalVariant): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 160, 112);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const folds = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    n.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    // two-lobe ellipsoid, radii ~(1.3, 1.0, 1.1)
    v.set(n.x * 1.3, n.y * 1.0, n.z * 1.1);
    // slight frontal taper (front = +z, toward the camera)
    v.x *= 1 - 0.1 * smoothstep(0.2, 1.0, n.z);
    // occipital taper (back narrows a touch)
    v.multiplyScalar(1 - 0.06 * smoothstep(0.55, 1.0, -n.z));
    // interhemispheric fissure, mostly dorsal
    const groove =
      Math.exp(-(v.x / 0.15) * (v.x / 0.15)) *
      (0.3 + 0.7 * smoothstep(-0.2, 0.5, n.y));
    v.multiplyScalar(1 - 0.11 * groove);
    // — convoluted gyri: ridged stripes, deep enough for the silhouette —
    const ridge = gyriField(v.x, v.y, v.z);
    const amp =
      0.115 *
      (0.3 + 0.7 * smoothstep(0.05, 0.3, Math.abs(v.x))) * // calm at the seam
      (1 - 0.55 * smoothstep(-0.45, -0.95, v.y)); // calm at the underside
    v.multiplyScalar(1 + (ridge - 0.5) * amp);
    folds[i] = ridge;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  geo.setAttribute("aFold", new THREE.BufferAttribute(folds, 1));

  const clusters = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    clusters[i] = clusterOf(pos.getX(i), pos.getY(i), pos.getZ(i));
  }
  geo.setAttribute("aCluster", new THREE.BufferAttribute(clusters, 1));

  if (variant === "silicon") {
    // keep the viewer-left hemisphere only (crisp cut happens in-shader)
    const idx = geo.index;
    if (idx) {
      const kept: number[] = [];
      for (let t = 0; t < idx.count; t += 3) {
        const a = idx.getX(t);
        const b = idx.getX(t + 1);
        const c = idx.getX(t + 2);
        const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
        if (cx <= -0.02) kept.push(a, b, c);
      }
      geo.setIndex(kept);
    }
  }
  return geo;
}

/** Distinct cerebellum lobe: finer parallel folia striations. */
export function buildCerebellum(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 96, 64);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const folds = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i) * 0.52, pos.getY(i) * 0.36, pos.getZ(i) * 0.46);
    // folia: tight horizontal striations (~0.05u pitch)
    const warp = (fbm3(v.x * 4.1 + 9.7, v.y * 4.1, v.z * 4.1) - 0.5) * 0.12;
    const s = Math.pow(Math.abs(Math.sin((v.y + warp) * (Math.PI / 0.052))), 0.8);
    v.multiplyScalar(1 + (s - 0.5) * 0.075);
    folds[i] = s;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  geo.setAttribute("aFold", new THREE.BufferAttribute(folds, 1));
  const clusters = new Float32Array(pos.count).fill(4); // deep/stem region
  geo.setAttribute("aCluster", new THREE.BufferAttribute(clusters, 1));
  return geo;
}

/** Brainstem: short curved tapering cylinder (midbrain → medulla). */
export function buildBrainstem(): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(0.19, 0.115, 0.78, 28, 16, true);
  const pos = geo.attributes.position;
  const folds = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = (0.39 - y) / 0.78; // 0 at the attachment, 1 at the bottom
    const s = Math.pow(Math.abs(Math.sin(Math.atan2(x, z) * 5 + y * 3)), 0.9);
    folds[i] = 0.35 + 0.5 * s; // faint longitudinal striation
    pos.setXYZ(i, x, y, z - 0.3 * t * t); // posterior medulla curve
  }
  geo.computeVertexNormals();
  geo.setAttribute("aFold", new THREE.BufferAttribute(folds, 1));
  const clusters = new Float32Array(pos.count).fill(4); // deep/stem region
  geo.setAttribute("aCluster", new THREE.BufferAttribute(clusters, 1));
  return geo;
}

/** UV-mapped silicon substrate: carries the painted PCB texture. */
export function buildBackplane(): THREE.BufferGeometry {
  const NU = 30; // finer grid → the cell staircase hugs the silhouette
  const NV = 46;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const inside = (u: number, vv: number) => {
    const a = (u + 0.06) / 1.36;
    const b = vv / PCB_V;
    return a * a + b * b <= 1;
  };
  const radial = (u: number, vv: number) => {
    const a = (u + 0.06) / 1.36;
    const b = vv / PCB_V;
    return Math.sqrt(a * a + b * b);
  };
  const push = (u: number, vv: number) => {
    const fade = (1 - smoothstep(0.55, 1.0, radial(u, vv))) * 0.75 + 0.25;
    const seamFade = 0.4 + 0.6 * smoothstep(0.02, 0.3, u);
    positions.push(u, vv, shellZ(u, vv) - 0.06);
    // v4.1: emissive gain raised 0.8 → 1.3 so the painted board clearly
    // reads through the 0.1× underlayer at hero exposure
    const s = 1.3 * fade * seamFade;
    colors.push(s, s, s);
    uvs.push((u - PCB_U0) / (PCB_U1 - PCB_U0), (vv + PCB_V) / (2 * PCB_V));
  };
  for (let iu = 0; iu < NU; iu++) {
    for (let iv = 0; iv < NV; iv++) {
      const u0 = PCB_U0 + (iu / NU) * (PCB_U1 - PCB_U0);
      const u1 = PCB_U0 + ((iu + 1) / NU) * (PCB_U1 - PCB_U0);
      const v0 = -PCB_V + (iv / NV) * 2 * PCB_V;
      const v1 = -PCB_V + ((iv + 1) / NV) * 2 * PCB_V;
      if (!inside(u0, v0) || !inside(u1, v0) || !inside(u0, v1) || !inside(u1, v1)) continue;
      push(u0, v0);
      push(u1, v0);
      push(u1, v1);
      push(u0, v0);
      push(u1, v1);
      push(u0, v1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
  return geo;
}

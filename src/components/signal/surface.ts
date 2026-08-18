/**
 * v3 solid geometry — the flower formula returns:
 *  - buildBrainSurface: a cohesive wrinkled two-lobe brain SURFACE mesh
 *    (fbm gyri displacement, interhemispheric groove, frontal taper,
 *    cerebellum bulge) with a baked per-vertex region attribute; the
 *    silicon variant keeps only the viewer-left half (x ≤ −0.03).
 *  - buildBackplane: a dim PCB-substrate half-disc behind the silicon
 *    traces (edge-faded vertex colors) so the 0.1× underlayer shows a
 *    cohesive hazy die-shot glow.
 */
import * as THREE from "three";
import { clusterOf, fbm3, shellZ, type SignalVariant } from "./brain";

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function buildBrainSurface(variant: SignalVariant): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 96, 64);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    // two-lobe ellipsoid, radii ~(1.3, 1.0, 1.1)
    v.set(n.x * 1.3, n.y * 1.0, n.z * 1.1);
    // slight frontal taper (front = +z, toward the camera)
    v.x *= 1 - 0.12 * smoothstep(0.2, 1.0, n.z);
    // interhemispheric groove, mostly dorsal
    const groove =
      Math.exp(-(v.x / 0.16) * (v.x / 0.16)) *
      (0.35 + 0.65 * smoothstep(-0.2, 0.5, n.y));
    v.multiplyScalar(1 - 0.1 * groove);
    // gyri-scale wrinkles — amplitude keeps the silhouette clean; damped
    // near the midline so the seam cut edge stays smooth
    const w = fbm3(v.x * 2.6 + 11.3, v.y * 2.6, v.z * 2.6) - 0.5;
    const wAmp = 0.18 * (0.3 + 0.7 * smoothstep(0.05, 0.3, Math.abs(v.x)));
    v.multiplyScalar(1 + w * wAmp);
    // cerebellum bulge (lower back)
    const bx = v.x / 0.5;
    const by = (v.y + 0.62) / 0.34;
    const bz = (v.z + 0.55) / 0.42;
    const bulge = Math.exp(-(bx * bx + by * by + bz * bz));
    v.addScaledVector(n, 0.22 * bulge);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();

  // per-vertex region for activation (0 frontal … 4 deep/stem)
  const clusters = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    clusters[i] = clusterOf(pos.getX(i), pos.getY(i), pos.getZ(i));
  }
  geo.setAttribute("aCluster", new THREE.BufferAttribute(clusters, 1));

  if (variant === "silicon") {
    // keep the viewer-left hemisphere only (organic half of the seam)
    const idx = geo.index;
    if (idx) {
      const kept: number[] = [];
      for (let t = 0; t < idx.count; t += 3) {
        const a = idx.getX(t);
        const b = idx.getX(t + 1);
        const c = idx.getX(t + 2);
        const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
        if (cx <= -0.03) kept.push(a, b, c);
      }
      geo.setIndex(kept);
    }
  }
  return geo;
}

/** Dim silicon substrate: silhouette-clipped grid with edge-faded colors. */
export function buildBackplane(): THREE.BufferGeometry {
  const NU = 22;
  const NV = 34;
  const U1 = 1.32;
  const positions: number[] = [];
  const colors: number[] = [];
  const base = new THREE.Color("#3b4266"); // pale board-blue, scaled way down
  const inside = (u: number, vv: number) => {
    const a = (u + 0.06) / 1.36;
    const b = vv / 1.0;
    return a * a + b * b <= 1;
  };
  const radial = (u: number, vv: number) => {
    const a = (u + 0.06) / 1.36;
    const b = vv / 1.0;
    return Math.sqrt(a * a + b * b);
  };
  const push = (u: number, vv: number) => {
    const fade = (1 - smoothstep(0.55, 1.0, radial(u, vv))) * 0.75 + 0.25;
    const seamFade = 0.4 + 0.6 * smoothstep(0.02, 0.3, u);
    positions.push(u, vv, shellZ(u, vv) - 0.06);
    const s = 0.11 * fade * seamFade; // very low luminance — underlayer haze
    colors.push(base.r * s, base.g * s, base.b * s);
  };
  for (let iu = 0; iu < NU; iu++) {
    for (let iv = 0; iv < NV; iv++) {
      const u0 = 0.03 + (iu / NU) * (U1 - 0.03);
      const u1 = 0.03 + ((iu + 1) / NU) * (U1 - 0.03);
      const v0 = -1 + (iv / NV) * 2;
      const v1 = -1 + ((iv + 1) / NV) * 2;
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
  return geo;
}

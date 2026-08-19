/**
 * Camera choreography for the SparseEMG board deep-dive (emg_2ch rev A).
 *
 * Each scroll beat is a DISCRETE camera pose — an orbit (azimuth θ /
 * elevation φ / radius) around a look-target on the board — chased with
 * the same critically-damped-spring + scroll-momentum-injection recipe
 * the brain's Driver uses, so fast scrolling slings the view past the
 * pose and it settles with weight.
 *
 * Anchor positions are resolved at load time from the GLB's refdes-named
 * nodes (KiCad exports J1/J2/J3/U1/U2… — verified in the file); the
 * RAW_FALLBACKS below are the measured board-space coordinates (meters,
 * straight from the GLB) used if an export ever drops the names.
 */
import * as THREE from "three";

export const BEAT_COUNT = 5;

/** Mutable section-local scroll state shared HardwareDive → BoardStage. */
export interface HwProgress {
  /** 0..1 through the tall scroll region. */
  p: number;
  /** Discrete beat index 0..BEAT_COUNT-1. */
  beat: number;
}

/** Pose spring — same constants family as the brain (ω 3.2, critical). */
export const SPRING_HZ = 3.2;
export const SPRING_DAMP = 1.0;
/** Section-local scroll velocity → θ angular-velocity injection. */
export const MOMENTUM_GAIN = 1.2;

/**
 * v6: continuous scrub — within a beat, sub-beat scroll progress
 * (−0.5..0.5 around the beat center) adds to the θ target, so the board
 * visibly REVOLVES with the scroll instead of only stepping pose to
 * pose; the spring still owns the motion and parks on the pose when
 * scrolling stops.
 */
export const SCRUB_GAIN = 0.38;

/** Normalized board width in world units (X = electrode → output edge). */
export const BOARD_WIDTH = 3.4;

/** One critically-damped spring scalar (semi-implicit Euler, Driver recipe). */
export interface SpringState {
  v: number;
  vel: number;
}

export function springStep(s: SpringState, target: number, dt: number): void {
  s.vel += (SPRING_HZ * SPRING_HZ * (target - s.v) - 2 * SPRING_HZ * SPRING_DAMP * s.vel) * dt;
  s.v += s.vel * dt;
}

export interface BeatPose {
  /** Orbit azimuth around +Y (rad). Walks monotonically — a part-revolve. */
  theta: number;
  /** Elevation above the board plane (rad). */
  phi: number;
  /** Orbit radius (world units) — the "zoom" of the pose. */
  radius: number;
  /** Look-target key into the resolved anchor table. */
  target: AnchorKey;
  /** Callout anchor key (the label's pin point). */
  anchor: AnchorKey;
}

export type AnchorKey =
  | "center" // board center
  | "silk" // "EMG 2CH REV A" title silk, center-left
  | "u1" // AD8226 in-amp, CH1 row
  | "u2" // MCP6002 gain/filter stage, CH1 row
  | "gain" // RC band between U1 and U2
  | "electrodes" // J1/J2 3-pin headers, left edge
  | "j3"; // output header, right edge

/**
 * The five beats (indices match hardwareBeats in data/content.ts):
 * overview → in-amp → gain/filter → electrode edge → output edge.
 * θ increases monotonically so scroll momentum always slings forward.
 */
export const BEAT_POSES: readonly BeatPose[] = [
  { theta: -0.65, phi: 1.04, radius: 6.6, target: "center", anchor: "silk" },
  { theta: -0.25, phi: 0.6, radius: 2.05, target: "u1", anchor: "u1" },
  { theta: 0.35, phi: 0.72, radius: 2.2, target: "gain", anchor: "u2" },
  { theta: 1.05, phi: 0.4, radius: 2.4, target: "electrodes", anchor: "electrodes" },
  { theta: 1.75, phi: 0.52, radius: 2.3, target: "j3", anchor: "j3" },
];

/** Measured node translations in the GLB's own space (meters). */
export const RAW_FALLBACKS: Record<string, [number, number, number]> = {
  U1: [0.121, 0.0016, 0.108],
  U2: [0.1405, 0.0016, 0.108],
  J1: [0.1035, 0.0016, 0.1055],
  J2: [0.1035, 0.0016, 0.1315],
  J3: [0.1465, 0.0016, 0.1172],
};

/** Post-normalization label lifts (world units above the resolved point). */
export const ANCHOR_LIFT: Partial<Record<AnchorKey, number>> = {
  u1: 0.16,
  u2: 0.16,
  gain: 0.14,
  electrodes: 0.5, // 2.54 mm headers stand tall
  j3: 0.48,
  silk: 0.05,
};

/** Resolved anchor table in normalized board-local space. */
export type AnchorTable = Record<AnchorKey, THREE.Vector3>;

/**
 * Build the anchor table from a loaded, NOT-yet-normalized gltf scene.
 * `center` / `scale` are the normalization the stage applies afterwards
 * (world = (raw − center) · scale in board-local space).
 */
export function buildAnchors(
  scene: THREE.Object3D,
  center: THREE.Vector3,
  scale: number,
): AnchorTable {
  scene.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  const resolve = (name: keyof typeof RAW_FALLBACKS): THREE.Vector3 => {
    const node = scene.getObjectByName(name);
    if (node) {
      node.getWorldPosition(v);
    } else {
      v.fromArray(RAW_FALLBACKS[name]);
    }
    return v.clone().sub(center).multiplyScalar(scale);
  };
  const u1 = resolve("U1");
  const u2 = resolve("U2");
  const j1 = resolve("J1");
  const j2 = resolve("J2");
  const j3 = resolve("J3");
  const table: AnchorTable = {
    center: new THREE.Vector3(0, 0, 0),
    // board title silk sits center-left between the two channel rows
    silk: new THREE.Vector3(-0.85, 0.05, 0),
    u1,
    // the RC band between the in-amp and the op-amp stage
    gain: u1.clone().lerp(u2, 0.65),
    u2,
    electrodes: j1.clone().add(j2).multiplyScalar(0.5),
    j3,
  };
  for (const key of Object.keys(ANCHOR_LIFT) as AnchorKey[]) {
    const lift = ANCHOR_LIFT[key];
    if (lift) table[key] = table[key].clone().setY(table[key].y + lift);
  }
  return table;
}

/** Camera position for an orbit sample around a world-space target. */
export function orbitPosition(
  target: THREE.Vector3,
  theta: number,
  phi: number,
  radius: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const ch = Math.cos(phi) * radius;
  out.set(
    target.x + ch * Math.sin(theta),
    target.y + Math.sin(phi) * radius,
    target.z + ch * Math.cos(theta),
  );
  return out;
}

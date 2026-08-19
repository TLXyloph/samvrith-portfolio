/**
 * Shared mutable per-frame state for the SignalField rig, plus the v2
 * scroll choreography stops (activation walk, spike rate, synchrony,
 * accent color). No React state — everything here is written/read inside
 * useFrame callbacks.
 */
import * as THREE from "three";
import type { FocusId } from "./scrollBus";
import type { SignalVariant } from "./brain";

export const VOID_HEX = "#050508";

export interface FieldState {
  /** Animation clock (frozen when prefers-reduced-motion). */
  time: number;
  /** Clamped frame delta (0 when reduced motion). */
  dt: number;
  /** EMG-like envelope — kept as the spike-rate clock + global breath. */
  pulse: number;
  pulseStart: number;
  nextPulseAt: number;
  /** Scroll-choreographed values (already composed with props). */
  exposure: number;
  exposureBase: number;
  underlayer: number;
  cellPx: number;
  contrast: number;
  globalDim: number;
  orbitGain: number;
  objPos: THREE.Vector3;
  objScale: number;
  /** v2 choreography. */
  variant: SignalVariant;
  accent: THREE.Color;
  spikeRate: number;
  sync: number;
  /** v3 scroll ripple: smoothed d(progress)/dt drives a brightness band
   * sweeping the long axis; amplitude decays ~600 ms after scrolling. */
  scrollVel: number;
  wavePhase: number;
  rippleAmp: number;
  rippleGain: number;
  /** v3 variable glyph size (macro grid): scale = min + gain·(index/9). */
  glyphMin: number;
  glyphGain: number;
  /** v5 rotation choreography: critically-damped spring chasing the
   * discrete section pose, with scroll momentum slung into yaw velocity. */
  poseYaw: number;
  poseYawVel: number;
  posePitch: number;
  posePitchVel: number;
  yawTarget: number;
  pitchTarget: number;
  /** Discrete section index 0..6 (hero…contact, incl. hardware). */
  section: number;
  /** True once the spring is near its pose. */
  settled: boolean;
  springHz: number; // spring natural frequency ω (rad/s)
  springDamp: number; // damping ratio (1 = critical)
  momentumGain: number; // scrollVel → yaw angular-velocity injection
  /** Registered by Cortex: the rotating rig. */
  spinObj: THREE.Object3D | null;
  /** Per-cluster eased activation, indices 0..8 (organic 0–4, silicon 5–8).
   * Shader uniforms reference this array directly. */
  clusterAct: Float32Array;
  /** Focus override (frozen scrollBus API) + lab override. */
  focus: FocusId;
  clusterOverride: number | null;
  /** Monotonic counters consumed by the spike system. */
  spikeBurstSeq: number;
  focusPacketSeq: number;
  /** Registered by Cortex when the silicon variant is live (ID pass). */
  idScene: THREE.Scene | null;
  /** Camera orbit state (radians). */
  camYaw: number;
  camPitch: number;
  /** Pointer state (window-space listeners write here). */
  pointerNdc: THREE.Vector2;
  pointerActive: boolean;
  pointerSpeed: number; // px/s, smoothed
  /** Environment flags. */
  reduced: boolean;
  fine: boolean;
  narrow: boolean;
  /** First-frame handshake: the pipeline flags its first complete frame and
   * keeps offering the callback until SignalField consumes it (fade-in). */
  firstFrameDone: boolean;
  onFirstFrame: (() => void) | null;
}

export function createFieldState(): FieldState {
  return {
    time: 0,
    dt: 0,
    pulse: 0,
    pulseStart: -10,
    nextPulseAt: 1.1,
    exposure: 1,
    exposureBase: 1,
    underlayer: 0.6,
    cellPx: 18,
    contrast: 1.12,
    globalDim: 1,
    orbitGain: 1,
    objPos: new THREE.Vector3(1.05, 0.1, 0),
    objScale: 1.15,
    variant: "silicon",
    accent: new THREE.Color("#8b9cf5"),
    spikeRate: 0.35,
    sync: 0,
    scrollVel: 0,
    wavePhase: -1.6,
    rippleAmp: 0,
    rippleGain: 4,
    glyphMin: 0.85,
    glyphGain: 0.45,
    poseYaw: 0,
    poseYawVel: 0,
    posePitch: 0,
    posePitchVel: 0,
    yawTarget: 0,
    pitchTarget: 0,
    section: 0,
    settled: true,
    springHz: 3.2,
    springDamp: 1,
    momentumGain: 2.5,
    spinObj: null,
    clusterAct: new Float32Array(9),
    focus: null,
    clusterOverride: null,
    spikeBurstSeq: 0,
    focusPacketSeq: 0,
    idScene: null,
    camYaw: 0,
    camPitch: 0,
    pointerNdc: new THREE.Vector2(0, 0),
    pointerActive: false,
    pointerSpeed: 0,
    reduced: false,
    fine: true,
    narrow: false,
    firstFrameDone: false,
    onFirstFrame: null,
  };
}

interface Stop {
  p: number;
  yaw: number; // discrete pose target (spring-followed, not lerped)
  pitch: number;
  scale: number;
  exposure: number;
  orbitGain: number;
  active: number; // −1 resting
  rate: number;
  sync: number;
  accent: THREE.Color;
}

// v5: the fly-away/come-back translation is retired. The brain stays
// present at a fixed position; each section is a DISCRETE POSE (yaw +
// slight pitch) — a full revolve over the page (contact = 2π, same face
// as hero, reached by rotating forward). Poses avoid the edge-on band
// around ±π/2 where the silicon plane degenerates.
//
// v6 retune: the #hardware deep-dive (500svh, between projects and
// open-source) grew the page — p-values recomputed against the built
// page (hardware spans ~0.38–0.79 of scroll). The hardware stop gives
// the brain a subtle pose of its own between projects and open-source,
// dimmed under the board stage, with silicon block 5 (the SparseEMG
// focus block) active — the board section IS the silicon story.
const STOPS: readonly Stop[] = [
  { p: 0.0, yaw: 0, pitch: 0, scale: 1.15, exposure: 0.95, orbitGain: 1.0, active: -1, rate: 0.35, sync: 0, accent: new THREE.Color("#8b9cf5") },
  { p: 0.09, yaw: 0.55, pitch: 0.12, scale: 1.05, exposure: 0.9, orbitGain: 1.0, active: 0, rate: 0.5, sync: 0, accent: new THREE.Color("#9994f8") },
  { p: 0.19, yaw: 1.15, pitch: -0.1, scale: 1.05, exposure: 0.88, orbitGain: 1.0, active: 1, rate: 0.6, sync: 0, accent: new THREE.Color("#a78bfa") },
  { p: 0.55, yaw: 1.5, pitch: 0.06, scale: 1.05, exposure: 0.62, orbitGain: 1.0, active: 5, rate: 0.8, sync: 0, accent: new THREE.Color("#b985e9") },
  { p: 0.82, yaw: 1.9, pitch: 0.18, scale: 1.05, exposure: 0.8, orbitGain: 1.0, active: 2, rate: 1.0, sync: 0, accent: new THREE.Color("#ce7fd8") },
  { p: 0.885, yaw: 2.7, pitch: -0.14, scale: 1.05, exposure: 0.88, orbitGain: 1.0, active: 3, rate: 0.5, sync: 0, accent: new THREE.Color("#f472b6") },
  { p: 0.985, yaw: Math.PI * 2, pitch: 0, scale: 1.05, exposure: 0.95, orbitGain: 0.6, active: -1, rate: 0.7, sync: 1, accent: new THREE.Color("#fb7185") },
];

/** Fixed on-screen home of the brain (v5 — no translation choreography). */
const HOME_X = 1.05;
const HOME_Y = 0.1;

function smooth(u: number): number {
  const t = u < 0 ? 0 : u > 1 ? 1 : u;
  return t * t * (3 - 2 * t);
}

export interface StopSample {
  pos: THREE.Vector3;
  scale: number;
  exposure: number;
  orbitGain: number;
  active: number;
  rate: number;
  sync: number;
  accent: THREE.Color;
  /** Discrete pose targets — the driver's spring chases these. */
  yaw: number;
  pitch: number;
  /** Discrete section index 0..6 (hero…contact, incl. hardware). */
  section: number;
}

export function createStopSample(): StopSample {
  return {
    pos: new THREE.Vector3(),
    scale: 1,
    exposure: 1,
    orbitGain: 1,
    active: -1,
    rate: 0.35,
    sync: 0,
    accent: new THREE.Color("#8b9cf5"),
    yaw: 0,
    pitch: 0,
    section: 0,
  };
}

/**
 * Evaluate the choreography at scroll progress p (0..1). Scale/exposure/
 * orbit lerp smoothly; yaw/pitch/section/activeCluster switch DISCRETELY
 * mid-segment (the driver's spring + per-cluster easing smooth them). On
 * narrow viewports (<768px) the home x is multiplied by 0.3.
 */
export function evaluateStops(p: number, narrow: boolean, out: StopSample): StopSample {
  const q = p < 0 ? 0 : p > 1 ? 1 : p;
  let a = STOPS[0];
  let b = STOPS[0];
  let ai = 0;
  for (let i = 0; i < STOPS.length; i++) {
    if (q >= STOPS[i].p) {
      a = STOPS[i];
      ai = i;
      b = i + 1 < STOPS.length ? STOPS[i + 1] : STOPS[i];
    }
  }
  const span = b.p - a.p;
  const u = span > 0 ? smooth((q - a.p) / span) : 0;
  const xMul = narrow ? 0.3 : 1;
  out.pos.set(HOME_X * xMul, HOME_Y, 0);
  out.scale = a.scale + (b.scale - a.scale) * u;
  out.exposure = a.exposure + (b.exposure - a.exposure) * u;
  out.orbitGain = a.orbitGain + (b.orbitGain - a.orbitGain) * u;
  out.rate = a.rate + (b.rate - a.rate) * u;
  out.sync = a.sync + (b.sync - a.sync) * u;
  out.active = u < 0.5 ? a.active : b.active;
  out.yaw = u < 0.5 ? a.yaw : b.yaw;
  out.pitch = u < 0.5 ? a.pitch : b.pitch;
  out.section = u < 0.5 ? ai : Math.min(ai + 1, STOPS.length - 1);
  out.accent.copy(a.accent).lerp(b.accent, u);
  return out;
}

/** Focus → cluster mapping per variant (frozen FocusId values). */
export function focusCluster(focus: Exclude<FocusId, null>, variant: SignalVariant): number {
  if (variant === "silicon") {
    return focus === "sparse-emg" ? 5 : 2; // silicon block 5 / parietal
  }
  return focus === "sparse-emg" ? 1 : 2; // temporal / parietal
}

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
    objPos: new THREE.Vector3(1.15, 0.12, 0),
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
  pos: readonly [number, number, number];
  scale: number;
  exposure: number;
  orbitGain: number;
  active: number; // −1 resting
  rate: number;
  sync: number;
  accent: THREE.Color;
}

// v3: bigger, present, less shrink — the brain stays a protagonist.
const STOPS: readonly Stop[] = [
  { p: 0.0, pos: [1.15, 0.12, 0.0], scale: 1.15, exposure: 0.95, orbitGain: 1.0, active: -1, rate: 0.35, sync: 0, accent: new THREE.Color("#8b9cf5") },
  { p: 0.14, pos: [1.7, 0.2, -0.6], scale: 0.95, exposure: 0.85, orbitGain: 1.0, active: 0, rate: 0.5, sync: 0, accent: new THREE.Color("#9994f8") },
  { p: 0.3, pos: [2.0, 0.3, -1.2], scale: 0.9, exposure: 0.7, orbitGain: 1.0, active: 1, rate: 0.6, sync: 0, accent: new THREE.Color("#a78bfa") },
  { p: 0.55, pos: [2.0, 0.3, -1.2], scale: 0.9, exposure: 0.68, orbitGain: 1.0, active: 2, rate: 1.0, sync: 0, accent: new THREE.Color("#ce7fd8") },
  { p: 0.75, pos: [2.0, 0.3, -1.2], scale: 0.9, exposure: 0.62, orbitGain: 1.0, active: 3, rate: 0.5, sync: 0, accent: new THREE.Color("#f472b6") },
  { p: 0.92, pos: [0.0, 0.1, 0.0], scale: 1.05, exposure: 0.95, orbitGain: 0.6, active: -1, rate: 0.7, sync: 1, accent: new THREE.Color("#fb7185") },
];

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
  };
}

/**
 * Evaluate the choreography at scroll progress p (0..1), smoothstep-lerped
 * between neighboring stops (activeCluster switches discretely mid-segment;
 * the per-cluster easing in the driver smooths the handover). On narrow
 * viewports (<768px) objPos.x is multiplied by 0.3.
 */
export function evaluateStops(p: number, narrow: boolean, out: StopSample): StopSample {
  const q = p < 0 ? 0 : p > 1 ? 1 : p;
  let a = STOPS[0];
  let b = STOPS[0];
  for (let i = 0; i < STOPS.length; i++) {
    if (q >= STOPS[i].p) {
      a = STOPS[i];
      b = i + 1 < STOPS.length ? STOPS[i + 1] : STOPS[i];
    }
  }
  const span = b.p - a.p;
  const u = span > 0 ? smooth((q - a.p) / span) : 0;
  const xMul = narrow ? 0.3 : 1;
  out.pos.set(
    (a.pos[0] + (b.pos[0] - a.pos[0]) * u) * xMul,
    a.pos[1] + (b.pos[1] - a.pos[1]) * u,
    a.pos[2] + (b.pos[2] - a.pos[2]) * u,
  );
  out.scale = a.scale + (b.scale - a.scale) * u;
  out.exposure = a.exposure + (b.exposure - a.exposure) * u;
  out.orbitGain = a.orbitGain + (b.orbitGain - a.orbitGain) * u;
  out.rate = a.rate + (b.rate - a.rate) * u;
  out.sync = a.sync + (b.sync - a.sync) * u;
  out.active = u < 0.5 ? a.active : b.active;
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

/**
 * Shared mutable per-frame state for the SignalField rig, plus the
 * scroll choreography stops. No React state — everything here is
 * written/read inside useFrame callbacks.
 */
import * as THREE from "three";

export const VOID_HEX = "#050508";

export interface FieldState {
  /** Animation clock (frozen when prefers-reduced-motion). */
  time: number;
  /** Clamped frame delta (0 when reduced motion). */
  dt: number;
  /** EMG-like pulse envelope 0..1. */
  pulse: number;
  pulseStart: number;
  nextPulseAt: number;
  /** Scroll-choreographed values (already composed with props). */
  disperse: number;
  exposure: number;
  exposureBase: number;
  underlayer: number;
  cellPx: number;
  contrast: number;
  globalDim: number;
  orbitGain: number;
  objPos: THREE.Vector3;
  objScale: number;
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
}

export function createFieldState(): FieldState {
  return {
    time: 0,
    dt: 0,
    pulse: 0,
    pulseStart: -10,
    nextPulseAt: 1.1,
    disperse: 0,
    exposure: 1,
    exposureBase: 1,
    underlayer: 0.35,
    cellPx: 12,
    contrast: 1.12,
    globalDim: 1,
    orbitGain: 1,
    objPos: new THREE.Vector3(0.9, 0, 0),
    objScale: 1,
    camYaw: 0,
    camPitch: 0,
    pointerNdc: new THREE.Vector2(0, 0),
    pointerActive: false,
    pointerSpeed: 0,
    reduced: false,
    fine: true,
    narrow: false,
  };
}

interface Stop {
  p: number;
  pos: readonly [number, number, number];
  scale: number;
  exposure: number;
  disperse: number;
  orbitGain: number;
}

const STOPS: readonly Stop[] = [
  { p: 0.0, pos: [1.15, 0.12, 0.0], scale: 1.0, exposure: 0.95, disperse: 0.0, orbitGain: 1.0 },
  { p: 0.14, pos: [1.7, 0.2, -1.0], scale: 0.85, exposure: 0.75, disperse: 0.0, orbitGain: 1.0 },
  { p: 0.3, pos: [2.2, 0.4, -2.5], scale: 0.6, exposure: 0.5, disperse: 0.0, orbitGain: 1.0 },
  { p: 0.55, pos: [2.2, 0.4, -2.5], scale: 0.6, exposure: 0.46, disperse: 0.5, orbitGain: 1.0 },
  { p: 0.75, pos: [2.2, 0.4, -2.5], scale: 0.6, exposure: 0.42, disperse: 0.85, orbitGain: 1.0 },
  { p: 0.92, pos: [0.0, 0.1, 0.0], scale: 0.9, exposure: 0.9, disperse: 0.0, orbitGain: 0.6 },
];

function smooth(u: number): number {
  const t = u < 0 ? 0 : u > 1 ? 1 : u;
  return t * t * (3 - 2 * t);
}

export interface StopSample {
  pos: THREE.Vector3;
  scale: number;
  exposure: number;
  disperse: number;
  orbitGain: number;
}

export function createStopSample(): StopSample {
  return { pos: new THREE.Vector3(), scale: 1, exposure: 1, disperse: 0, orbitGain: 1 };
}

/**
 * Evaluate the choreography at scroll progress p (0..1), smoothstep-lerped
 * between neighboring stops. On narrow viewports (<768px) objPos.x is
 * multiplied by 0.3. Writes into `out` (no allocation).
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
  out.disperse = a.disperse + (b.disperse - a.disperse) * u;
  out.orbitGain = a.orbitGain + (b.orbitGain - a.orbitGain) * u;
  return out;
}

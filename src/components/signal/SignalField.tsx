"use client";

/* eslint-disable react-hooks/immutability --
 * r3f idiom: the shared FieldState is transient rAF-loop state, mutated
 * inside useFrame/useEffect callbacks only, never during render. */

/**
 * SignalField — fixed, full-viewport, pointer-events-none WebGL background
 * (z-0, aria-hidden). Renders the "Silicon Cortex" — a procedural brain
 * point cloud (variant "silicon": half organic, half Manhattan-trace
 * silicon; variant "connectome": full organic) through a dual-resolution
 * ASCII postprocess; orbits around the mouse, sheds discreet pointer
 * motes, and walks activation/accent with scroll (see scrollBus.ts).
 *
 * IMPORTANT: consumers must import this via next/dynamic with ssr disabled:
 *   const SignalField = dynamic(() => import("@/components/signal/SignalField"), { ssr: false });
 *
 * Props (all optional): externalScroll (skip the internal window-scroll
 * fallback; drive progress via scrollBus/Lenis instead), cellPx (glyph cell
 * size in CSS px — default 18 fine-pointer / 20 coarse), exposure (base
 * multiplier, default 1), underlayer (soft color bed strength, default
 * 0.6), variant ("silicon" default | "connectome"; `?variant=a` in the URL
 * overrides to "connectome"), clusterOverride (lab: pin activation −1..8),
 * rippleGain (scroll-ripple sensitivity, default 4), glyphMin/glyphGain
 * (variable glyph size: scale = min + gain·tier, defaults 0.85/0.45).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Cortex } from "./Cortex";
import { Motes } from "./Motes";
import { AsciiPipeline } from "./AsciiPipeline";
import { AnnotationPublisher } from "./Annotations";
import {
  getFocus,
  getScrollProgress,
  onFocus,
  onScrollProgress,
  setScrollProgress,
  type FocusId,
} from "./scrollBus";
import { buildBrainData, type SignalVariant } from "./brain";
import {
  createFieldState,
  createStopSample,
  evaluateStops,
  focusCluster,
  type FieldState,
} from "./state";

export interface SignalFieldProps {
  /** When true, the internal window-scroll fallback listener is disabled. */
  externalScroll?: boolean;
  /** Glyph cell size in CSS px (default 12 fine pointers / 14 coarse). */
  cellPx?: number;
  /** Base exposure multiplier composed with the scroll choreography. */
  exposure?: number;
  /** Underlayer strength 0..~0.8 (default 0.35). */
  underlayer?: number;
  /** Hero variant. `?variant=a` in the URL overrides to "connectome". */
  variant?: SignalVariant;
  /** Lab: pin the active cluster (−1 resting .. 8); undefined = scroll-driven. */
  clusterOverride?: number;
  /** Scroll-ripple sensitivity (default 2.5). */
  rippleGain?: number;
  /** Variable glyph size floor (default 0.78). */
  glyphMin?: number;
  /** Variable glyph size gain per luminance tier (default 0.4). */
  glyphGain?: number;
  /** v5 pose spring natural frequency ω rad/s (default 3.2). */
  springStiffness?: number;
  /** v5 pose spring damping ratio, 1 = critical (default 1). */
  springDamping?: number;
  /** v5 scroll-momentum → yaw velocity gain (default 2.5). */
  momentumGain?: number;
  /** v5 publish 3D-anchored labels to the annotationBus (default true). */
  annotations?: boolean;
}

interface Env {
  ok: boolean;
  fine: boolean;
  reduced: boolean;
  dpr: number;
  urlVariant: SignalVariant | null;
}

function detectEnv(): Env {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { ok: false, fine: true, reduced: false, dpr: 1, urlVariant: null };
  }
  let ok = false;
  try {
    const c = document.createElement("canvas");
    const gl2 = c.getContext("webgl2");
    ok = !!(window.WebGL2RenderingContext && gl2);
    // release the probe context immediately — browsers cap ~16 live contexts
    gl2?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    ok = false;
  }
  let urlVariant: SignalVariant | null = null;
  try {
    if (new URLSearchParams(window.location.search).get("variant") === "a") {
      urlVariant = "connectome";
    }
  } catch {
    urlVariant = null;
  }
  const fine = window.matchMedia("(pointer: fine)").matches;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dpr = Math.min(window.devicePixelRatio || 1, fine ? 2 : 1.5);
  return { ok, fine, reduced, dpr, urlVariant };
}

/** Advances time, the spike-rate clock, ripple, activation, choreography. */
function Driver({ fs }: { fs: FieldState }) {
  const sample = useMemo(() => createStopSample(), []);
  const prevFocus = useRef<FocusId>(null);
  const prevP = useRef<number | null>(null);
  useFrame((state, delta) => {
    const dt = fs.reduced ? 0 : Math.min(Math.max(delta, 0), 0.05);
    fs.dt = dt;
    fs.narrow = state.size.width < 768;
    const p = getScrollProgress();
    evaluateStops(p, fs.narrow, sample);
    fs.objPos.copy(sample.pos);
    fs.objScale = sample.scale;
    fs.orbitGain = sample.orbitGain;
    fs.exposure = sample.exposure * fs.exposureBase;
    fs.spikeRate = sample.rate;
    fs.sync = sample.sync;
    fs.accent.copy(sample.accent);

    // — scroll ripple: smoothed velocity → sweeping band + burst boost —
    if (!fs.reduced && dt > 0) {
      const dp = prevP.current === null ? 0 : p - prevP.current;
      const raw = dp / dt;
      fs.scrollVel += (raw - fs.scrollVel) * (1 - Math.exp(-8 * dt));
      const target = Math.min(Math.abs(fs.scrollVel) * fs.rippleGain, 1);
      fs.rippleAmp = Math.max(target, fs.rippleAmp * Math.exp(-dt / 0.22)); // ~600 ms decay
      fs.wavePhase += dp * 14; // band follows scroll direction along the long axis
      if (fs.wavePhase > 1.9 || fs.wavePhase < -1.9) {
        fs.wavePhase = ((((fs.wavePhase + 1.9) % 3.8) + 3.8) % 3.8) - 1.9;
      }
    } else {
      fs.scrollVel = 0;
      fs.rippleAmp = 0;
    }
    prevP.current = p;
    const rippleBoost = 1 + 5 * Math.min(Math.abs(fs.scrollVel) * fs.rippleGain, 1);

    // — v5 pose spring: chase the discrete section pose (yaw/pitch) with a
    // critically-damped spring; scroll velocity is slung into yaw angular
    // velocity so fast scrolling overshoots and settles with weight —
    fs.yawTarget = sample.yaw;
    fs.pitchTarget = sample.pitch;
    fs.section = sample.section;
    if (fs.reduced || dt <= 0) {
      fs.poseYaw = sample.yaw;
      fs.posePitch = sample.pitch;
      fs.poseYawVel = 0;
      fs.posePitchVel = 0;
      fs.settled = true;
    } else {
      const w = fs.springHz;
      const z = fs.springDamp;
      fs.poseYawVel += (w * w * (sample.yaw - fs.poseYaw) - 2 * w * z * fs.poseYawVel) * dt;
      fs.posePitchVel += (w * w * (sample.pitch - fs.posePitch) - 2 * w * z * fs.posePitchVel) * dt;
      fs.poseYawVel += fs.scrollVel * fs.momentumGain * dt; // the sling
      fs.poseYaw += fs.poseYawVel * dt;
      fs.posePitch += fs.posePitchVel * dt;
      fs.settled = Math.abs(sample.yaw - fs.poseYaw) < 0.12 && Math.abs(fs.poseYawVel) < 0.4;
    }

    if (fs.reduced) {
      fs.time = 11.0; // frozen, composed pose
      fs.pulse = 0;
      fs.pointerSpeed = 0;
    } else {
      fs.time += dt;
      // envelope generator kept as the spike-rate clock: intervals shrink
      // as the choreography's spikeRate rises (storm at open-source) and
      // while scrolling (ripple boost)
      if (fs.time >= fs.nextPulseAt) {
        fs.pulseStart = fs.time;
        fs.nextPulseAt =
          fs.time + (2.4 + Math.random() * 1.6) / ((0.3 + 2.2 * fs.spikeRate) * rippleBoost);
        fs.spikeBurstSeq++;
      }
      const e = fs.time - fs.pulseStart;
      const env = e < 0 ? 0 : e < 0.12 ? e / 0.12 : Math.exp(-(e - 0.12) * 3.3);
      const baseline = 0.05 + 0.05 * (0.5 + 0.5 * Math.sin(fs.time * 1.9));
      fs.pulse = Math.max(env, baseline);
      fs.pointerSpeed *= Math.exp(-3 * dt);
    }

    // entering sparse-emg focus on silicon → burst packets through block 5
    if (fs.focus !== prevFocus.current) {
      if (fs.focus === "sparse-emg" && fs.variant === "silicon") fs.focusPacketSeq++;
      prevFocus.current = fs.focus;
    }

    // activation target: focus > lab override > scroll stop
    let target = sample.active;
    if (fs.clusterOverride !== null) target = fs.clusterOverride;
    if (fs.focus) target = focusCluster(fs.focus, fs.variant);

    // ease per-cluster activation toward the target (~300 ms settle)
    const k = fs.reduced ? 1 : 1 - Math.exp(-10 * dt);
    for (let i = 0; i < 9; i++) {
      const goal = i === target ? 1 : 0;
      fs.clusterAct[i] += (goal - fs.clusterAct[i]) * k;
    }
  });
  return null;
}

/** Mouse-orbit parallax rig: exponential damping toward pointer targets. */
function CameraRig({ fs }: { fs: FieldState }) {
  useFrame((state) => {
    let ty = 0;
    let tp = 0;
    if (fs.reduced) {
      tp = 0.05;
    } else if (fs.fine) {
      if (fs.pointerActive) {
        ty = fs.pointerNdc.x * 0.35 * fs.orbitGain;
        tp = fs.pointerNdc.y * 0.2 * fs.orbitGain;
      }
    } else {
      // coarse pointer: slow auto-orbit
      ty = Math.sin(fs.time * 0.11) * 0.22 * fs.orbitGain;
      tp = Math.cos(fs.time * 0.07) * 0.1 * fs.orbitGain;
    }
    const k = fs.reduced ? 1 : 1 - Math.exp(-3.5 * fs.dt); // λ ≈ 3.5/s
    fs.camYaw += (ty - fs.camYaw) * k;
    fs.camPitch += (tp - fs.camPitch) * k;
    const r = 7;
    const cp = Math.cos(fs.camPitch);
    state.camera.position.set(
      r * Math.sin(fs.camYaw) * cp,
      0.1 + r * Math.sin(fs.camPitch),
      r * Math.cos(fs.camYaw) * cp,
    );
    state.camera.lookAt(0, 0.1, 0);
  });
  return null;
}

/** Pauses when hidden; re-renders on scroll/prop changes in demand mode. */
function LoopGovernor({
  reduced,
  cellPx,
  exposure,
  underlayer,
  clusterOverride,
  rippleGain,
  glyphMin,
  glyphGain,
}: {
  reduced: boolean;
  cellPx?: number;
  exposure?: number;
  underlayer?: number;
  clusterOverride?: number;
  rippleGain?: number;
  glyphMin?: number;
  glyphGain?: number;
}) {
  const setFrameloop = useThree((s) => s.setFrameloop);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        setFrameloop("never");
      } else {
        setFrameloop(reduced ? "demand" : "always");
        invalidate();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    onVis();
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [reduced, setFrameloop, invalidate]);
  useEffect(() => onScrollProgress(() => invalidate()), [invalidate]);
  useEffect(() => onFocus(() => invalidate()), [invalidate]);
  useEffect(() => {
    invalidate();
  }, [cellPx, exposure, underlayer, clusterOverride, rippleGain, glyphMin, glyphGain, invalidate]);
  return null;
}

export default function SignalField({
  externalScroll = false,
  cellPx,
  exposure,
  underlayer,
  variant = "silicon",
  clusterOverride,
  rippleGain,
  glyphMin,
  glyphGain,
  springStiffness,
  springDamping,
  momentumGain,
  annotations,
}: SignalFieldProps) {
  const [env] = useState(detectEnv);
  const [reduced, setReduced] = useState(env.reduced);
  const [ready, setReady] = useState(false); // first frame rendered → fade in
  const effVariant: SignalVariant = env.urlVariant ?? variant;
  const fs = useMemo(() => {
    const s = createFieldState();
    s.fine = env.fine;
    s.reduced = env.reduced;
    s.cellPx = env.fine ? 18 : 20;
    s.variant = effVariant;
    return s;
  }, [env, effVariant]);
  const data = useMemo(
    () => (env.ok ? buildBrainData(effVariant) : null),
    [env.ok, effVariant],
  );

  // focus channel (frozen scrollBus API) → field state
  useEffect(() => {
    fs.focus = getFocus();
    return onFocus((id) => {
      fs.focus = id;
    });
  }, [fs]);

  // lab activation override → field state
  useEffect(() => {
    fs.clusterOverride = clusterOverride ?? null;
  }, [fs, clusterOverride]);

  // first-frame handshake: reveal the canvas once the pipeline has drawn
  useEffect(() => {
    if (fs.firstFrameDone) {
      // frame landed before this effect (shouldn't happen, but stay safe)
      const id = window.setTimeout(() => setReady(true), 0);
      return () => window.clearTimeout(id);
    }
    fs.onFirstFrame = () => setReady(true);
    return () => {
      fs.onFirstFrame = null;
    };
  }, [fs]);

  // props → field state
  useEffect(() => {
    fs.cellPx = cellPx ?? (env.fine ? 18 : 20);
    fs.exposureBase = exposure ?? 1;
    fs.underlayer = underlayer ?? 0.6;
    fs.rippleGain = rippleGain ?? 4;
    fs.glyphMin = glyphMin ?? 0.85;
    fs.glyphGain = glyphGain ?? 0.45;
    fs.springHz = springStiffness ?? 3.2;
    fs.springDamp = springDamping ?? 1;
    fs.momentumGain = momentumGain ?? 2.5;
    fs.annotationsOn = annotations ?? true;
  }, [fs, env.fine, cellPx, exposure, underlayer, rippleGain, glyphMin, glyphGain, springStiffness, springDamping, momentumGain, annotations]);

  // reduced-motion preference may change at runtime
  useEffect(() => {
    if (!env.ok) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => {
      fs.reduced = mq.matches;
      setReduced(mq.matches);
    };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [fs, env.ok]);

  // pointer tracking (window-level; the canvas itself is pointer-events-none)
  useEffect(() => {
    if (!env.ok) return;
    let lastX = 0;
    let lastY = 0;
    let lastT = 0;
    let has = false;
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      if (has) {
        const ms = now - lastT;
        if (ms > 0) {
          const d = Math.hypot(e.clientX - lastX, e.clientY - lastY);
          const inst = Math.min((d / ms) * 1000, 4000);
          fs.pointerSpeed = fs.pointerSpeed * 0.7 + inst * 0.3;
        }
      }
      lastX = e.clientX;
      lastY = e.clientY;
      lastT = now;
      has = true;
      fs.pointerNdc.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1,
      );
      fs.pointerActive = true;
    };
    const onLeave = () => {
      fs.pointerActive = false;
      fs.pointerSpeed = 0;
      has = false;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("blur", onLeave);
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("blur", onLeave);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [fs, env.ok]);

  // internal scroll fallback so the field works standalone
  useEffect(() => {
    if (!env.ok || externalScroll) return;
    const onScroll = () => {
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      setScrollProgress(window.scrollY / max);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [env.ok, externalScroll]);

  if (!env.ok || !data) return null; // no WebGL2 → page stays plain #050508

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
      style={{
        // hidden until the first complete ASCII frame, then ease in
        opacity: ready ? 1 : 0,
        transition: reduced ? "none" : "opacity 600ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <Canvas
        key={effVariant}
        frameloop={reduced ? "demand" : "always"}
        dpr={env.dpr}
        camera={{ fov: 42, near: 0.1, far: 80, position: [0, 0, 7] }}
        gl={{
          antialias: false,
          alpha: false,
          stencil: false,
          powerPreference: "high-performance",
        }}
        onCreated={(state) => {
          state.gl.toneMapping = THREE.NoToneMapping; // ACES runs in the ASCII pass
        }}
      >
        <Driver fs={fs} />
        <CameraRig fs={fs} />
        <Cortex fs={fs} data={data} />
        <AnnotationPublisher fs={fs} data={data} />
        {!reduced && <Motes fs={fs} />}
        <AsciiPipeline fs={fs} />
        <LoopGovernor
          reduced={reduced}
          cellPx={cellPx}
          exposure={exposure}
          underlayer={underlayer}
          clusterOverride={clusterOverride}
          rippleGain={rippleGain}
          glyphMin={glyphMin}
          glyphGain={glyphGain}
        />
      </Canvas>
    </div>
  );
}

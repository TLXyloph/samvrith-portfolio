"use client";

/* eslint-disable react-hooks/immutability --
 * r3f idiom: the shared FieldState is transient rAF-loop state, mutated
 * inside useFrame/useEffect callbacks only, never during render. */

/**
 * SignalField — fixed, full-viewport, pointer-events-none WebGL background
 * (z-0, aria-hidden). Renders an iridescent signal bloom through a custom
 * ASCII postprocess; orbits around the mouse, sheds glyph particles from
 * the pointer, and evolves with scroll (see scrollBus.ts).
 *
 * IMPORTANT: consumers must import this via next/dynamic with ssr disabled:
 *   const SignalField = dynamic(() => import("@/components/signal/SignalField"), { ssr: false });
 *
 * Props (all optional): externalScroll (skip the internal window-scroll
 * fallback; drive progress via scrollBus/Lenis instead), cellPx (glyph cell
 * size in CSS px — default 12 fine-pointer / 14 coarse), exposure (base
 * multiplier, default 1), underlayer (soft color bed strength, default 0.35).
 */
import { useEffect, useMemo, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Bloom, Starfield } from "./Bloom";
import { Particles } from "./Particles";
import { AsciiPipeline } from "./AsciiPipeline";
import { getScrollProgress, onScrollProgress, setScrollProgress } from "./scrollBus";
import {
  createFieldState,
  createStopSample,
  evaluateStops,
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
}

interface Env {
  ok: boolean;
  fine: boolean;
  reduced: boolean;
  dpr: number;
}

function detectEnv(): Env {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { ok: false, fine: true, reduced: false, dpr: 1 };
  }
  let ok = false;
  try {
    const c = document.createElement("canvas");
    ok = !!(window.WebGL2RenderingContext && c.getContext("webgl2"));
  } catch {
    ok = false;
  }
  const fine = window.matchMedia("(pointer: fine)").matches;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dpr = Math.min(window.devicePixelRatio || 1, fine ? 2 : 1.5);
  return { ok, fine, reduced, dpr };
}

/** Advances time, the EMG pulse envelope, and the scroll choreography. */
function Driver({ fs }: { fs: FieldState }) {
  const sample = useMemo(() => createStopSample(), []);
  useFrame((state, delta) => {
    const dt = fs.reduced ? 0 : Math.min(Math.max(delta, 0), 0.05);
    fs.dt = dt;
    fs.narrow = state.size.width < 768;
    if (fs.reduced) {
      fs.time = 11.0; // frozen, composed pose
      fs.pulse = 0;
      fs.pointerSpeed = 0;
    } else {
      fs.time += dt;
      if (fs.time >= fs.nextPulseAt) {
        fs.pulseStart = fs.time;
        fs.nextPulseAt = fs.time + 2.4 + Math.random() * 1.6; // every 2.4–4.0s
      }
      const e = fs.time - fs.pulseStart;
      const env = e < 0 ? 0 : e < 0.12 ? e / 0.12 : Math.exp(-(e - 0.12) * 3.3);
      const baseline = 0.05 + 0.05 * (0.5 + 0.5 * Math.sin(fs.time * 1.9));
      fs.pulse = Math.max(env, baseline);
      fs.pointerSpeed *= Math.exp(-3 * dt);
    }
    evaluateStops(getScrollProgress(), fs.narrow, sample);
    fs.objPos.copy(sample.pos);
    fs.objScale = sample.scale;
    fs.disperse = sample.disperse;
    fs.orbitGain = sample.orbitGain;
    fs.exposure = sample.exposure * fs.exposureBase;
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
}: {
  reduced: boolean;
  cellPx?: number;
  exposure?: number;
  underlayer?: number;
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
  useEffect(() => {
    invalidate();
  }, [cellPx, exposure, underlayer, invalidate]);
  return null;
}

export default function SignalField({
  externalScroll = false,
  cellPx,
  exposure,
  underlayer,
}: SignalFieldProps) {
  const [env] = useState(detectEnv);
  const [reduced, setReduced] = useState(env.reduced);
  const fs = useMemo(() => {
    const s = createFieldState();
    s.fine = env.fine;
    s.reduced = env.reduced;
    s.cellPx = env.fine ? 12 : 14;
    return s;
  }, [env]);

  // props → field state
  useEffect(() => {
    fs.cellPx = cellPx ?? (env.fine ? 12 : 14);
    fs.exposureBase = exposure ?? 1;
    fs.underlayer = underlayer ?? 0.35;
  }, [fs, env.fine, cellPx, exposure, underlayer]);

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

  if (!env.ok) return null; // no WebGL2 → page stays plain #050508

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <Canvas
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
        <Bloom fs={fs} />
        <Starfield fs={fs} />
        {!reduced && <Particles fs={fs} />}
        <AsciiPipeline fs={fs} />
        <LoopGovernor
          reduced={reduced}
          cellPx={cellPx}
          exposure={exposure}
          underlayer={underlayer}
        />
      </Canvas>
    </div>
  );
}

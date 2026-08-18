"use client";

/**
 * CursorDot — a 4px DOM dot in mix-blend-mode: difference that follows the
 * pointer via rAF + translate3d. Hidden on coarse pointers and when
 * prefers-reduced-motion is set.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";

function enabledNow(): boolean {
  return (
    window.matchMedia("(pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function subscribeMedia(cb: () => void): () => void {
  const fine = window.matchMedia("(pointer: fine)");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  fine.addEventListener("change", cb);
  reduced.addEventListener("change", cb);
  return () => {
    fine.removeEventListener("change", cb);
    reduced.removeEventListener("change", cb);
  };
}

export default function CursorDot() {
  const ref = useRef<HTMLDivElement>(null);
  // SSR-safe client-only flag (server snapshot: false — no hydration mismatch)
  const enabled = useSyncExternalStore(subscribeMedia, enabledNow, () => false);

  useEffect(() => {
    if (!enabled) return;
    let x = -100;
    let y = -100;
    let dirty = false;
    let shown = false;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      dirty = true;
    };
    const loop = () => {
      const el = ref.current;
      if (el && dirty) {
        el.style.transform = `translate3d(${x - 2}px, ${y - 2}px, 0)`;
        if (!shown) {
          el.style.opacity = "1";
          shown = true;
        }
        dirty = false;
      }
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-50 h-1 w-1 rounded-full bg-white mix-blend-difference"
      style={{ opacity: 0 }}
    />
  );
}

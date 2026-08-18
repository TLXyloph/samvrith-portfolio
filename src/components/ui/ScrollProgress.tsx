"use client";

import { useEffect, useRef } from "react";

/**
 * Hairline read-out of document scroll position — a liquid-metal fill scaled
 * along X. Decorative, so it stays out of the a11y tree and out of the hit
 * region. Fixed-position, so it costs no layout.
 *
 * Deliberately stateless: the scroll listener writes `transform` straight to
 * the node through a ref, rAF-coalesced, so a scroll never re-renders React.
 * Renders at scaleX(0) on the server and self-corrects on mount (restored
 * scroll positions, deep links).
 */
export default function ScrollProgress() {
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fill = fillRef.current;
    if (!fill) return;

    let frame = 0;

    const write = () => {
      frame = 0;
      const span = document.documentElement.scrollHeight - window.innerHeight;
      const raw = span > 0 ? window.scrollY / span : 0;
      const progress = raw < 0 ? 0 : raw > 1 ? 1 : raw;
      fill.style.transform = `scaleX(${progress})`;
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(write);
    };

    write();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px]"
    >
      <div
        ref={fillRef}
        className="liquid-metal h-full w-full origin-left"
        style={{ transform: "scaleX(0)" }}
      />
    </div>
  );
}

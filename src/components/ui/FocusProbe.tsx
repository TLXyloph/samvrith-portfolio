"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { getFocus, setFocus, type FocusId } from "@/components/signal/scrollBus";

/**
 * The non-null half of the frozen scrollBus focus channel. Type-only export —
 * a "use client" module can't hand runtime helpers to a server component.
 */
export type FocusTarget = NonNullable<FocusId>;

type FocusProbeProps = {
  focusId: FocusTarget;
  children: ReactNode;
};

/**
 * Publishes "this element owns the scene highlight" to the signal layer while
 * its subject sits in the middle band of the viewport. Purely observational —
 * a bare wrapper div, no tabindex, no handlers, nothing keyboard-reachable.
 *
 * Release is guarded on ownership: probes overlap during fast scrolls, and the
 * outgoing one must not clear a focus the incoming one just claimed.
 */
export default function FocusProbe({ focusId, children }: FocusProbeProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setFocus(focusId);
        else if (getFocus() === focusId) setFocus(null);
      },
      // Only the centre 20% of the viewport counts as "looking at this".
      { rootMargin: "-40% 0px -40% 0px" },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      if (getFocus() === focusId) setFocus(null);
    };
  }, [focusId]);

  return <div ref={ref}>{children}</div>;
}

"use client";

import { useSyncExternalStore } from "react";
import {
  getAnnotations,
  onAnnotations,
  type Annotation,
} from "@/components/signal/annotationBus";

/** Stable empty snapshot for SSR — the scene only publishes on the client. */
const EMPTY: readonly Annotation[] = [];

/** Gap between the anchor dot and the leader, and leader length. */
const DOT = 3;
const LEADER = 14;
const GAP = 4;
/** Labels this close to the right edge get mirrored to the other side. */
const EDGE = 180;

function subscribeWidth(onChange: () => void) {
  window.addEventListener("resize", onChange, { passive: true });
  return () => window.removeEventListener("resize", onChange);
}

/**
 * Mono callouts anchored to the 3D scene. SignalField projects anchor points to
 * screen space and publishes them on the (frozen, already throttled) annotation
 * bus; this layer just paints them.
 *
 * Decorative and inert: fixed, aria-hidden, pointer-events-none, and sandwiched
 * between the canvas (z-0) and <main> (z-10) so it never steals a click or a
 * screen-reader stop.
 */
export default function AnnotationLayer() {
  const annotations = useSyncExternalStore(
    onAnnotations,
    getAnnotations,
    () => EMPTY,
  );

  const viewport = useSyncExternalStore(
    subscribeWidth,
    () => window.innerWidth,
    () => 0,
  );

  if (annotations.length === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[5] overflow-hidden"
    >
      {annotations.map((annotation) => {
        // Near the right edge the label would run off-screen, so it flips to
        // the left of its dot and the leader mirrors with it.
        const flip = viewport > 0 && annotation.x > viewport - EDGE;

        return (
          <div
            key={annotation.id}
            className="absolute top-0 left-0 h-0 w-0"
            style={{
              transform: `translate3d(${annotation.x}px, ${annotation.y}px, 0)`,
              opacity: annotation.opacity,
            }}
          >
            <span
              className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sig-iris"
              style={{ width: DOT, height: DOT }}
            />
            <span
              className="absolute top-0 h-px -translate-y-1/2 bg-white/25"
              style={
                flip
                  ? { width: LEADER, right: DOT }
                  : { width: LEADER, left: DOT }
              }
            />
            <span
              className="absolute top-0 -translate-y-1/2 font-mono text-[11px] tracking-[0.14em] whitespace-nowrap text-faint"
              style={
                flip
                  ? { right: DOT + LEADER + GAP }
                  : { left: DOT + LEADER + GAP }
              }
            >
              {annotation.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

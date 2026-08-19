"use client";

/**
 * Scroll detents for the hardware deep-dive — the "rolling stop".
 *
 * While a wheel/trackpad gesture is live the section scrubs freely (the
 * stage's spring + momentum sling is untouched — detents only ever move
 * the scroll). Once the gesture ends INSIDE the section span, the page
 * glides onto a beat offset with an easeOutQuart settle via Lenis. One
 * detent per gesture: the snap target is clamped to settled ± 1, so a
 * hard fling never skips beats in either direction.
 *
 * Never a trap: stops outside the ±5% fringe are ignored, outward stops
 * past the first/last beat exit freely, and a gesture is only considered
 * over after DETENT_IDLE_MS without input AND lenis velocity has decayed
 * — momentum that carries past the section's edges leaves untouched.
 *
 * Fallback (reduced motion → Lenis is null; coarse pointers → Lenis never
 * sees the native touch gesture): JS detents are skipped, the hook returns
 * true, and the caller renders native CSS snap rails instead while the
 * hook holds `scroll-snap-type: y proximity` on the root (removed on
 * unmount/mode change — never left behind).
 */
import { useEffect, useSyncExternalStore, type RefObject } from "react";
import { getLenis } from "@/components/lenisRef";
import { BEAT_COUNT } from "./poses";

/** Gesture-end: no wheel/touch input for this long… */
export const DETENT_IDLE_MS = 140;
/** …AND |lenis.velocity| (px per rAF frame) has decayed below this. */
export const DETENT_VEL_EPS = 1;
/** Local-progress fringe around [0, 1] in which detents still engage. */
export const DETENT_FRINGE = 0.05;
/** Glide duration bounds (s) — scaled by distance up to one beat span. */
export const DETENT_MIN_DUR = 0.7;
export const DETENT_MAX_DUR = 1.0;
/** Within this many px of a beat offset counts as parked on it. */
const LAND_EPS_PX = 3;

/** The magnetic settle: quick catch, long eased deceleration. */
const easeOutQuart = (t: number): number => 1 - Math.pow(1 - t, 4);

// media-query externals for useSyncExternalStore (SSR snapshot: false, so
// server and hydration markup stay rail-free; React re-renders post-mount)
const subscribeCoarse = (onChange: () => void): (() => void) => {
  const mq = window.matchMedia("(pointer: coarse)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
const coarseSnapshot = () => window.matchMedia("(pointer: coarse)").matches;
const emptySubscribe = () => () => {};
const trueSnapshot = () => true;
const falseSnapshot = () => false;

/**
 * Mount the detents on the tall scroll region. Listeners and the rAF
 * decision loop exist only while `inView`. Returns whether the CSS
 * fallback is active (caller renders the snap rails then).
 */
export function useScrollDetents(
  regionRef: RefObject<HTMLDivElement | null>,
  inView: boolean,
  reduced: boolean,
): boolean {
  const coarse = useSyncExternalStore(subscribeCoarse, coarseSnapshot, falseSnapshot);
  // `reduced` can already be true during hydration (client matchMedia
  // initializer) — gate on post-hydration so markup matches the server
  const hydrated = useSyncExternalStore(emptySubscribe, trueSnapshot, falseSnapshot);
  const cssFallback = hydrated && (reduced || coarse);

  // CSS-fallback mode: proximity snap on the root only while this mode is
  // mounted; the previous inline value is restored on cleanup.
  useEffect(() => {
    if (!cssFallback) return;
    const root = document.documentElement;
    const prev = root.style.scrollSnapType;
    root.style.scrollSnapType = "y proximity";
    return () => {
      root.style.scrollSnapType = prev;
    };
  }, [cssFallback]);

  // — JS detents —
  useEffect(() => {
    if (cssFallback || !inView) return;
    const region = regionRef.current;
    if (!region) return;

    const LAST = BEAT_COUNT - 1;
    let raf = 0;
    let lastInput = 0;
    let gestureActive = false;
    /** Scroll position when the current gesture began (direction basis). */
    let gestureFrom = 0;
    let snapping = false;
    let snapId = 0;
    let snapTo = 0;
    let snapBeat = 0;
    let snapAt = 0;
    /** The beat the page last came to rest on (null = free / outside). */
    let settled: number | null = null;

    const onInput = () => {
      if (!gestureActive) {
        const lenis = getLenis();
        gestureFrom = lenis ? lenis.scroll : window.scrollY;
      }
      lastInput = performance.now();
      gestureActive = true;
      if (snapping) {
        snapping = false; // the user takes the wheel back mid-glide
        snapId++; // …and orphans that glide's onComplete
      }
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const lenis = getLenis();
      if (!lenis) return;

      if (snapping) {
        // arrival: within a few px of the detent (onComplete is the backup)
        if (Math.abs(lenis.scroll - snapTo) < LAND_EPS_PX) {
          snapping = false;
          settled = snapBeat;
        } else if (
          lenis.isScrolling === false &&
          performance.now() - snapAt > 250
        ) {
          snapping = false; // glide was stopped externally (resize, anchors…)
        }
        return;
      }

      const now = performance.now();
      const deciding =
        gestureActive &&
        now - lastInput >= DETENT_IDLE_MS &&
        Math.abs(lenis.velocity) <= DETENT_VEL_EPS;
      if (!deciding && settled === null) return; // nothing to track

      // geometry — measured fresh so resizes and layout shifts never go stale
      const rect = region.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      if (span <= 0) return;
      const top = window.scrollY + rect.top;
      const pos = lenis.targetScroll;
      const p = (pos - top) / span;

      // any excursion outside the fringe forgets the settled beat (covers
      // anchor jumps too, so a stale beat can never clamp a later re-entry)
      const outside = p < -DETENT_FRINGE || p > 1 + DETENT_FRINGE;
      if (outside) settled = null;
      if (!deciding) return;

      // the gesture is over — exactly one decision per gesture
      gestureActive = false;
      if (outside) return; // came to rest beyond the section: free scrolling

      // outward stops past the terminal beats leave the section normally;
      // only inward motion (or an overshooting fling launched from an
      // inner beat) is pulled onto the edge beat
      const inward = p > 1 ? pos < gestureFrom : pos > gestureFrom;
      if (p > 1 && !inward && (settled === null || settled >= LAST)) {
        settled = null;
        return;
      }
      if (p < 0 && !inward && (settled === null || settled <= 0)) {
        settled = null;
        return;
      }

      // beat i's offset lands local progress exactly on i/LAST — the
      // round() beat display and the zero point of the sub-beat scrub
      const nearest = Math.min(LAST, Math.max(0, Math.round(p * LAST)));
      const target =
        settled === null
          ? nearest // entered with this gesture: nearest, never a yank back
          : Math.min(settled + 1, Math.max(settled - 1, nearest));
      const offset = top + (target / LAST) * span;
      const dist = Math.abs(offset - pos);
      if (dist < LAND_EPS_PX) {
        settled = target; // already parked
        return;
      }

      const perBeat = span / LAST;
      const duration =
        DETENT_MIN_DUR +
        (DETENT_MAX_DUR - DETENT_MIN_DUR) * Math.min(1, dist / perBeat);
      const id = ++snapId;
      snapping = true;
      snapTo = offset;
      snapBeat = target;
      snapAt = now;
      lenis.scrollTo(offset, {
        duration,
        easing: easeOutQuart,
        lock: false, // input always interrupts — never fight the user
        onComplete: () => {
          if (id !== snapId) return; // superseded by input or teardown
          snapping = false;
          settled = snapBeat;
        },
      });
    };

    window.addEventListener("wheel", onInput, { passive: true });
    window.addEventListener("touchstart", onInput, { passive: true });
    window.addEventListener("touchmove", onInput, { passive: true });
    window.addEventListener("touchend", onInput, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      snapId++; // orphan any in-flight glide's onComplete
      cancelAnimationFrame(raf);
      window.removeEventListener("wheel", onInput);
      window.removeEventListener("touchstart", onInput);
      window.removeEventListener("touchmove", onInput);
      window.removeEventListener("touchend", onInput);
    };
  }, [cssFallback, inView, regionRef]);

  return cssFallback;
}

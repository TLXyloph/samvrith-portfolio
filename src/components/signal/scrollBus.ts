/**
 * scrollBus — tiny module-level scroll-progress store (no React state).
 * SignalField consumes it every frame; any driver (Lenis, a lab slider,
 * or SignalField's own fallback listener) publishes into it.
 */

type Listener = (p: number) => void;

let progress = 0;
const listeners = new Set<Listener>();

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function setScrollProgress(p: number): void {
  const next = clamp01(Number.isFinite(p) ? p : 0);
  if (next === progress) return;
  progress = next;
  for (const listener of listeners) listener(progress);
}

export function getScrollProgress(): number {
  return progress;
}

export function onScrollProgress(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

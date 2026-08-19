/**
 * lenisRef — shared handle to the page's Lenis instance (or null when
 * smooth scroll is off: reduced motion, SSR). FROZEN contract: SignalLayer
 * registers, consumers (hardware detents) read. Never store React state here.
 */
import type Lenis from "lenis";

let instance: Lenis | null = null;

export function setLenis(lenis: Lenis | null): void {
  instance = lenis;
}

export function getLenis(): Lenis | null {
  return instance;
}

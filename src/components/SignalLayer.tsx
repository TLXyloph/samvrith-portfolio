"use client";

import { Component, useEffect, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Lenis from "lenis";
import CursorDot from "@/components/signal/CursorDot";
import { setScrollProgress } from "@/components/signal/scrollBus";
import { setLenis } from "@/components/lenisRef";

const SignalField = dynamic(() => import("@/components/signal/SignalField"), {
  ssr: false,
});

/** A GPU hiccup loses the background, never the page. */
class SignalBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Mounts the fixed ASCII canvas + cursor dot and drives the scroll bus:
 * Lenis (native-scroll mode, so Nav's scrollY listener keeps working) when
 * motion is allowed, a plain passive listener under prefers-reduced-motion.
 */
export default function SignalLayer() {
  useEffect(() => {
    const readNative = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
    };
    readNative();

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.addEventListener("scroll", readNative, { passive: true });
      window.addEventListener("resize", readNative);
      return () => {
        window.removeEventListener("scroll", readNative);
        window.removeEventListener("resize", readNative);
      };
    }

    const lenis = new Lenis({ autoRaf: true, lerp: 0.1, anchors: true });
    lenis.on("scroll", (l: Lenis) => setScrollProgress(l.progress));
    setLenis(lenis);
    return () => {
      setLenis(null);
      lenis.destroy();
    };
  }, []);

  return (
    <SignalBoundary>
      <SignalField externalScroll underlayer={0.6} />
      <CursorDot />
    </SignalBoundary>
  );
}

"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const RISE = 14;
const DURATION = 0.6;

type RevealProps = {
  children: ReactNode;
  /** seconds; stagger siblings in ~0.06 increments */
  delay?: number;
  /** animate on mount instead of on scroll-into-view (hero load-in) */
  immediate?: boolean;
  className?: string;
};

/**
 * Fade + rise wrapper. Runs once, respects prefers-reduced-motion by
 * collapsing both the offset and the duration to zero.
 */
export default function Reveal({
  children,
  delay = 0,
  immediate = false,
  className,
}: RevealProps) {
  const reduced = useReducedMotion();

  // Hidden tabs never tick rAF, so motion can't play the entrance there
  // (background-tab preloads would sit at opacity 0 until a scroll).
  // SSR and first client render stay identical; the swap happens after
  // hydration, which is the one legal place for this divergence.
  const [inert, setInert] = useState(false);
  useEffect(() => {
    if (document.visibilityState === "hidden") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional two-pass client divergence
      setInert(true);
    }
  }, []);

  if (inert) {
    return <div className={className}>{children}</div>;
  }

  const hidden = { opacity: 0, y: reduced ? 0 : RISE };
  const shown = { opacity: 1, y: 0 };
  const transition = reduced
    ? { duration: 0 }
    : { duration: DURATION, ease: EASE, delay };

  if (immediate) {
    return (
      <motion.div
        className={className}
        initial={hidden}
        animate={shown}
        transition={transition}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      className={className}
      initial={hidden}
      whileInView={shown}
      viewport={{ once: true, margin: "-80px" }}
      transition={transition}
    >
      {children}
    </motion.div>
  );
}

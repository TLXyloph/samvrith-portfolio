"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TransitionEvent as ReactTransitionEvent,
} from "react";

/**
 * Keyframes for the entry sheen. globals.css is owned elsewhere, so this rides
 * along in a hoisted <style> — the same pattern Glyph.tsx uses for sb-blink.
 * React 19 dedupes by `href`, so every card shares one tag.
 */
const TILT_CSS = `
@keyframes sb-sheen {
  0%   { transform: translateX(-140%) skewX(-18deg); opacity: 0; }
  22%  { opacity: 1; }
  100% { transform: translateX(280%) skewX(-18deg); opacity: 0; }
}
.sb-sheen { animation: sb-sheen 650ms cubic-bezier(0.32, 0.72, 0.3, 1); }
@media (prefers-reduced-motion: reduce) {
  .sb-sheen { animation: none; }
}
`;

/** Weight, not wobble — a couple of degrees is all a heavy card would give. */
const MAX_TILT = 1.8;
/** Short enough to feel pointer-locked, long enough to smooth the rAF steps. */
const TRACK_MS = "140ms";
/** Spring-back when the pointer leaves. */
const RETURN_MS = "450ms";

const BASE_STYLE: CSSProperties = {
  transformStyle: "preserve-3d",
  transitionProperty: "transform",
  transitionDuration: RETURN_MS,
  transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
};

const GLARE_STYLE = {
  "--mx": "50%",
  "--my": "50%",
  background:
    "radial-gradient(circle 320px at var(--mx) var(--my), rgba(255,255,255,0.07), transparent 70%)",
} as CSSProperties;

const SHEEN_STYLE: CSSProperties = {
  background:
    "linear-gradient(90deg, transparent, rgba(255,255,255,0.085), transparent)",
};

function clamp(value: number, lo: number, hi: number) {
  return value < lo ? lo : value > hi ? hi : value;
}

function join(...parts: (string | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type TiltCardProps = {
  children: ReactNode;
  /** Rounding utility matching the wrapped card, so the overlays clip to it. */
  radius?: string;
  className?: string;
};

/**
 * Gives a card physical weight on hover: a pointer-tracked specular highlight,
 * a capped parallax tilt, and a one-shot diagonal sheen on entry. Everything
 * runs through refs on a rAF, so a pointer sweep never re-renders React.
 *
 * A plain wrapper div — never interactive, never focusable — so links, headings
 * and landmarks inside keep their semantics. Coarse pointers and
 * prefers-reduced-motion get the children with no listeners at all.
 */
export default function TiltCard({
  children,
  radius = "rounded-2xl",
  className,
}: TiltCardProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  const sheenRef = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const frame = useRef(0);
  const hovered = useRef(false);

  // SSR and the first client render stay identical (plain children); the hover
  // chrome mounts after hydration once the pointer's capabilities are known.
  const [active, setActive] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setActive(fine.matches && !still.matches);
    };
    // Capability probe; the two-pass client divergence is deliberate.
    sync();
    fine.addEventListener("change", sync);
    still.addEventListener("change", sync);
    return () => {
      fine.removeEventListener("change", sync);
      still.removeEventListener("change", sync);
    };
  }, []);

  const apply = useCallback(() => {
    frame.current = 0;
    const root = rootRef.current;
    if (!root || !hovered.current) return;

    const rect = root.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const px = pointer.current.x - rect.left;
    const py = pointer.current.y - rect.top;

    const glare = glareRef.current;
    if (glare) {
      glare.style.setProperty("--mx", `${px.toFixed(1)}px`);
      glare.style.setProperty("--my", `${py.toFixed(1)}px`);
    }

    const nx = clamp((px / rect.width) * 2 - 1, -1, 1);
    const ny = clamp((py / rect.height) * 2 - 1, -1, 1);

    root.style.transform =
      `perspective(900px) rotateX(${(-ny * MAX_TILT).toFixed(3)}deg) ` +
      `rotateY(${(nx * MAX_TILT).toFixed(3)}deg) translateY(-2px) scale(1.005)`;
  }, []);

  const schedule = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(apply);
  }, [apply]);

  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const handleEnter = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      hovered.current = true;
      pointer.current = { x: event.clientX, y: event.clientY };

      const root = rootRef.current;
      if (root) {
        root.style.willChange = "transform";
        root.style.transitionDuration = TRACK_MS;
      }
      if (glareRef.current) glareRef.current.style.opacity = "1";

      const sheen = sheenRef.current;
      if (sheen) {
        sheen.classList.remove("sb-sheen");
        // Reading layout flushes the removal, so re-entering inside the 650 ms
        // window restarts the sheen instead of being swallowed.
        sheen.style.setProperty("--sb-reflow", String(sheen.offsetWidth));
        sheen.classList.add("sb-sheen");
      }

      schedule();
    },
    [schedule],
  );

  const handleMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      pointer.current = { x: event.clientX, y: event.clientY };
      schedule();
    },
    [schedule],
  );

  const handleLeave = useCallback(() => {
    hovered.current = false;
    if (frame.current) {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    }
    const root = rootRef.current;
    if (root) {
      root.style.transitionDuration = RETURN_MS;
      root.style.transform = "";
    }
    if (glareRef.current) glareRef.current.style.opacity = "0";
  }, []);

  /** Drop the compositor hint once the card has settled back to rest. */
  const handleSettled = useCallback(
    (event: ReactTransitionEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      if (!hovered.current && rootRef.current) {
        rootRef.current.style.willChange = "";
      }
    },
    [],
  );

  const handleSheenEnd = useCallback(() => {
    sheenRef.current?.classList.remove("sb-sheen");
  }, []);

  if (!active) {
    return <div className={join("relative", className)}>{children}</div>;
  }

  return (
    <>
      <style href="sb-tilt-keyframes" precedence="default">
        {TILT_CSS}
      </style>
      <div
        ref={rootRef}
        className={join("relative", className)}
        style={BASE_STYLE}
        onPointerEnter={handleEnter}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
        onPointerCancel={handleLeave}
        onTransitionEnd={handleSettled}
      >
        {children}
        <div
          aria-hidden="true"
          className={join(
            "pointer-events-none absolute inset-0 overflow-hidden",
            radius,
          )}
        >
          <div
            ref={glareRef}
            className="absolute inset-0 opacity-0 transition-opacity duration-300 ease-out"
            style={GLARE_STYLE}
          />
          <div
            ref={sheenRef}
            className="absolute inset-y-0 left-0 w-2/5 opacity-0"
            style={SHEEN_STYLE}
            onAnimationEnd={handleSheenEnd}
          />
        </div>
      </div>
    </>
  );
}

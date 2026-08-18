import type { ReactNode } from "react";

/**
 * Terminal glyphs that need CSS keyframes. globals.css is owned elsewhere, so
 * the keyframes ride along in a scoped <style> tag; reduced-motion is handled
 * in CSS, which keeps both of these server components (no hydration cost).
 */
const GLYPH_CSS = `
@keyframes sb-blink { from { opacity: 1 } to { opacity: 0 } }
@keyframes sb-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.32 } }
.sb-blink { animation: sb-blink 1.1s steps(2, jump-none) infinite; }
.sb-pulse { animation: sb-pulse 2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .sb-blink, .sb-pulse { animation: none; opacity: 1; }
}
`;

/** React 19 hoists + dedupes by `href`, so every call site shares one <style>. */
function Keyframes() {
  return (
    <style href="sb-glyph-keyframes" precedence="default">
      {GLYPH_CSS}
    </style>
  );
}

function join(...parts: (string | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/** Blinking block cursor for the shell prompts (Nav, Contact). */
export function Blink({ className }: { className?: string }) {
  return (
    <>
      <Keyframes />
      <span aria-hidden="true" className={join("sb-blink", className)}>
        ▮
      </span>
    </>
  );
}

/**
 * Softly pulsing status mark. Pass `●` as children for the hero telemetry line,
 * or leave it empty and size it with classes for the timeline terminal node.
 */
export function Pulse({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <>
      <Keyframes />
      <span aria-hidden="true" className={join("sb-pulse", className)}>
        {children}
      </span>
    </>
  );
}

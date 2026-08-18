import type { ReactNode } from "react";

/** Stack tag — hairline pill, mono, dim. */
export default function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-hairline px-2.5 py-1 font-mono text-[11px] text-dim">
      {children}
    </span>
  );
}

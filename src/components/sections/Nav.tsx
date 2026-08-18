"use client";

import { useEffect, useState } from "react";
import { identity } from "@/data/content";
import ArrowLink from "@/components/ui/ArrowLink";
import { Blink } from "@/components/ui/Glyph";

const LINKS = [
  { href: "#projects", label: "projects" },
  { href: "#open-source", label: "open-source" },
  { href: "#timeline", label: "timeline" },
  { href: "#contact", label: "contact" },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      aria-label="Primary"
      className={[
        "fixed inset-x-0 top-0 z-40 border-b transition-colors duration-300",
        scrolled
          ? "border-hairline bg-void/70"
          : "border-transparent bg-transparent",
      ].join(" ")}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 md:px-10">
        <span className="font-mono text-[12px] text-ink">
          samvrith@bandi:~$
          <Blink className="ml-1" />
        </span>

        <div className="flex items-center gap-7">
          <div className="hidden items-center gap-7 sm:flex">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="font-mono text-[12px] text-dim transition-colors hover:text-ink"
              >
                {link.label}
              </a>
            ))}
          </div>
          <ArrowLink href={identity.github} label="github" />
        </div>
      </div>
    </nav>
  );
}

import { Fragment } from "react";
import { identity } from "@/data/content";
import ArrowLink from "@/components/ui/ArrowLink";
import Reveal from "@/components/ui/Reveal";
import { Pulse } from "@/components/ui/Glyph";

/** Verified telemetry, mirrored from heroStats + the resume. */
const TELEMETRY = [
  "SIG LIVE",
  "EMG 95.4% / 1-CH",
  "102 MS E2E",
  "~$9 BOM",
  "610 COMMITS / YR",
];

export default function Hero() {
  return (
    <section className="relative flex min-h-[100svh] items-center">
      <div className="mx-auto w-full max-w-6xl px-6 pt-24 pb-36 md:px-10">
        <div className="relative z-10 max-w-xl">
          <Reveal immediate>
            <p className="eyebrow">{identity.eyebrow}</p>
          </Reveal>

          <Reveal immediate delay={0.06}>
            <h1 className="mt-5 font-sans text-[clamp(3.2rem,9vw,7rem)] font-medium leading-[0.95] tracking-[-0.045em] text-ink">
              Samvrith
              <br />
              Bandi
            </h1>
          </Reveal>

          <Reveal immediate delay={0.12}>
            <p className="mt-3 bg-gradient-to-r from-sig-blue via-sig-iris to-sig-pink bg-clip-text font-serif text-[clamp(1.5rem,3.2vw,2.4rem)] italic leading-tight text-transparent">
              {identity.thesis}
            </p>
          </Reveal>

          <Reveal immediate delay={0.18}>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-dim">
              {identity.headline}
            </p>
          </Reveal>

          <Reveal immediate delay={0.24}>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <a
                href="#projects"
                className="glass-panel rounded-full px-6 py-3 font-mono text-[13px] text-ink transition duration-300 hover:-translate-y-px hover:border-white/20"
              >
                view projects <span aria-hidden="true">↓</span>
              </a>
              <ArrowLink href={identity.github} label="github" />
            </div>
          </Reveal>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-8 z-10">
        <div className="mx-auto w-full max-w-6xl px-6 md:px-10">
          <Reveal immediate delay={0.36}>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] tracking-wider text-faint">
              <Pulse className="text-sig-blue">●</Pulse>
              {TELEMETRY.map((item, i) => (
                <Fragment key={item}>
                  {i > 0 ? <span aria-hidden="true">·</span> : null}
                  <span>{item}</span>
                </Fragment>
              ))}
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

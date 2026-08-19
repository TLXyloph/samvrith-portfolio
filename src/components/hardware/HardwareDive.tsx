"use client";

/**
 * HardwareDive — the SparseEMG board deep-dive: a tall scroll region
 * (~100svh per beat × 5) with a position-sticky full-viewport stage. The
 * real emg_2ch rev A KiCad model (BoardStage) revolves through discrete
 * camera poses while the hardwareBeats copy crossfades in a left column.
 *
 * Section-local progress comes from getBoundingClientRect via a passive
 * scroll listener — the page-global scrollBus is not touched. The WebGL
 * stage is instantiated only within ~1.5 viewports, pauses fully when
 * off-screen or the tab hides, and falls back to the static layout plot
 * when WebGL2 (or the model) is unavailable.
 */
import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { hardwareBeats } from "@/data/content";
import Reveal from "@/components/ui/Reveal";
import { BEAT_COUNT, type HwProgress } from "./poses";

const BoardStage = dynamic(() => import("./BoardStage"), { ssr: false });

function detectWebGL2(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl2 = canvas.getContext("webgl2");
    const ok = !!(window.WebGL2RenderingContext && gl2);
    gl2?.getExtension("WEBGL_lose_context")?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

/** No WebGL2 / model failure: the beats read beside the static layout plot. */
function StaticFallback() {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="mx-auto w-full max-w-6xl px-6 pb-[34svh] md:px-10 md:pb-0">
        <figure className="overflow-hidden rounded-lg border border-hairline bg-white/[0.02] md:ml-[52%] md:max-w-[44%]">
          <Image
            src="/pcb/layout.svg"
            width={500}
            height={420}
            alt="Copper pours and silkscreen across both layers of the emg_2ch layout"
            unoptimized
            className="w-full opacity-90"
            // same violet duotone the layout plot wore on the project card
            style={{
              filter:
                "grayscale(0.3) sepia(0.7) hue-rotate(234deg) saturate(1.45) brightness(0.56)",
            }}
          />
          <figcaption className="px-2.5 py-1.5 font-mono text-[10px] text-faint">
            copper + silk · 2 layers
          </figcaption>
        </figure>
      </div>
    </div>
  );
}

export default function HardwareDive() {
  const regionRef = useRef<HTMLDivElement>(null);
  // mutable section-scroll store shared with the stage's frame loop —
  // lazy state (not a ref) so render never reads a ref
  const [hw] = useState<HwProgress>(() => ({ p: 0, beat: 0 }));
  const [beat, setBeat] = useState(0);
  const [near, setNear] = useState(false);
  const [inView, setInView] = useState(false);
  // probe once on the client; SignalField runs the same cheap probe at load
  const [webglOk, setWebglOk] = useState<boolean | null>(() =>
    typeof window === "undefined" ? null : detectWebGL2(),
  );
  const [tabVisible, setTabVisible] = useState(() =>
    typeof document === "undefined" ? true : !document.hidden,
  );
  const [reduced, setReduced] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  // — section-local progress: rect-derived, rAF-coalesced, scrollBus untouched —
  useEffect(() => {
    const region = regionRef.current;
    if (!region) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const rect = region.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      const p = span > 0 ? Math.min(1, Math.max(0, -rect.top / span)) : 0;
      hw.p = p;
      const b = Math.min(BEAT_COUNT - 1, Math.max(0, Math.round(p * (BEAT_COUNT - 1))));
      if (b !== hw.beat) {
        hw.beat = b;
        setBeat(b);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [hw]);

  // — instantiate within ~1.5 viewports; track real visibility separately —
  useEffect(() => {
    const region = regionRef.current;
    if (!region || typeof IntersectionObserver === "undefined") {
      setNear(true);
      setInView(true);
      return;
    }
    const nearObs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          nearObs.disconnect();
        }
      },
      { rootMargin: "150% 0px 150% 0px" },
    );
    const viewObs = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: "15% 0px 15% 0px" },
    );
    nearObs.observe(region);
    viewObs.observe(region);
    return () => {
      nearObs.disconnect();
      viewObs.disconnect();
    };
  }, []);

  useEffect(() => {
    const onVis = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <section id="hardware" className="relative scroll-mt-24">
      <h2 className="sr-only">SparseEMG hardware</h2>

      <div ref={regionRef} className="relative h-[500svh]">
        <div className="sticky top-0 h-svh overflow-hidden">
          {/* soft violet glow the board floats over (the in-scene contact
              shadow darkens it back down beneath the model) */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-1/2 h-[72vmin] w-[92vmin] -translate-x-1/2 -translate-y-1/2 md:left-[62%]"
            style={{
              background:
                "radial-gradient(closest-side, rgba(139,124,246,0.12), rgba(139,124,246,0.04) 55%, transparent 78%)",
            }}
          />

          {near ? (
            webglOk === false ? (
              <StaticFallback />
            ) : (
              <BoardStage
                hw={hw}
                beat={beat}
                active={inView && tabVisible}
                reduced={reduced}
                onError={() => setWebglOk(false)}
              />
            )
          ) : null}

          {/* readability: left scrim on wide screens (stronger than the
              shared .scrim — the lit board is brighter than the glyph
              field), bottom scrim on mobile */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 hidden md:block"
            style={{
              background:
                "linear-gradient(to right, rgba(5,5,8,0.78) 0%, rgba(5,5,8,0.5) 44%, transparent 86%)",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] bg-gradient-to-t from-void/85 via-void/45 to-transparent md:hidden"
          />

          {/* text beats — left column (bottom overlay on mobile) */}
          <div className="pointer-events-none relative z-[3] mx-auto flex h-full w-full max-w-6xl items-end px-6 pb-16 md:items-center md:px-10 md:pb-0">
            <div className="pointer-events-auto w-full max-w-md">
              <Reveal>
                <p className="eyebrow">~/hardware/sparse-emg</p>
              </Reveal>

              <div className="mt-6 grid">
                {hardwareBeats.map((b, i) => (
                  <div
                    key={b.title}
                    className="col-start-1 row-start-1 transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-opacity"
                    style={{
                      opacity: i === beat ? 1 : 0,
                      transform: i === beat ? "none" : "translateY(10px)",
                    }}
                  >
                    <h3 className="text-2xl font-medium text-ink md:text-[28px]">
                      {b.title}
                    </h3>
                    <p className="mt-4 leading-relaxed text-dim">{b.body}</p>
                  </div>
                ))}
              </div>

              <p className="mt-8 font-mono text-[11px] tracking-[0.18em] text-faint">
                {String(beat + 1).padStart(2, "0")} /{" "}
                {String(BEAT_COUNT).padStart(2, "0")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

import Image from "next/image";
import { projects, type Project } from "@/data/content";
import Section from "@/components/ui/Section";
import Reveal from "@/components/ui/Reveal";
import Chip from "@/components/ui/Chip";
import ArrowLink from "@/components/ui/ArrowLink";
import FocusProbe, { type FocusTarget } from "@/components/ui/FocusProbe";
import TiltCard from "@/components/ui/TiltCard";

const CARD_HOVER =
  "transition duration-300 hover:border-white/[0.16] hover:bg-white/[0.045]";

type PcbTile = {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  /**
   * Per-asset duotone onto the site's iris. The raytrace is a lit surface, so
   * it keeps some of its own shading; the two KiCad plots are dark line art on
   * a transparent ground, so they invert first or they'd vanish into the void.
   */
  filter: string;
  /** KiCad SVGs skip the optimizer (no dangerouslyAllowSVG in next.config). */
  unoptimized?: boolean;
  /** The schematic needs room to read as anything but noise. */
  wideOnly?: boolean;
};

const PCB_TILES: PcbTile[] = [
  {
    src: "/pcb/render-persp.png",
    width: 1400,
    height: 950,
    alt: "Raytraced perspective render of the emg_2ch board",
    caption: "emg_2ch · rev a · kicad render",
    filter:
      "grayscale(0.35) sepia(0.5) hue-rotate(215deg) saturate(1.15) brightness(0.95)",
  },
  {
    src: "/pcb/layout.svg",
    width: 500,
    height: 420,
    alt: "Copper pours and silkscreen across both layers of the emg_2ch layout",
    caption: "copper + silk · 2 layers",
    // The copper pour is a full-bleed field, so this darkens rather than
    // inverts — inverted it becomes a lavender slab that shouts over the void.
    filter:
      "grayscale(0.3) sepia(0.7) hue-rotate(234deg) saturate(1.45) brightness(0.56)",
    unoptimized: true,
  },
  {
    src: "/pcb/schematic.svg",
    width: 1188,
    height: 840,
    alt: "Analog front-end schematic with two AD8226 instrumentation amplifiers",
    caption: "afe schematic · ad8226 ×2",
    // Dark line art on a transparent ground: invert first or it vanishes.
    filter: "invert(1) sepia(1) hue-rotate(212deg) saturate(1.8) brightness(1.05)",
    unoptimized: true,
    wideOnly: true,
  },
];

/** The board itself, in the site's register: violet duotone over the void. */
function PcbStrip() {
  return (
    <Reveal delay={0.1}>
      <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-3">
        {PCB_TILES.map((tile) => (
          <figure
            key={tile.src}
            className={[
              "overflow-hidden rounded-lg border border-hairline bg-white/[0.02]",
              tile.wideOnly ? "hidden md:block" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <Image
              src={tile.src}
              width={tile.width}
              height={tile.height}
              alt={tile.alt}
              unoptimized={tile.unoptimized}
              className="h-36 w-full object-cover opacity-90"
              style={{ filter: tile.filter }}
            />
            <figcaption className="px-2.5 py-1.5 font-mono text-[10px] text-faint">
              {tile.caption}
            </figcaption>
          </figure>
        ))}
      </div>
    </Reveal>
  );
}

/** Slugs the signal layer knows how to highlight; the literal type-checks. */
const FOCUS_TARGETS: readonly FocusTarget[] = ["sparse-emg", "neuromcp"];

function isFocusTarget(slug: string): slug is FocusTarget {
  return (FOCUS_TARGETS as readonly string[]).includes(slug);
}

const featured = projects.filter((p) => p.featured);
const rest = projects.filter((p) => !p.featured);

function Links({ project, className }: { project: Project; className?: string }) {
  if (!project.href && !project.live) return null;
  return (
    <div className={["flex flex-wrap gap-6", className].filter(Boolean).join(" ")}>
      {project.href ? <ArrowLink href={project.href} label="github" /> : null}
      {project.live ? <ArrowLink href={project.live} label="live" /> : null}
    </div>
  );
}

function FeaturedCard({ project }: { project: Project }) {
  return (
    <article className={`glass-panel rounded-2xl p-8 md:p-10 ${CARD_HOVER}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h3 className="text-2xl font-medium text-ink md:text-[28px]">
          {project.name}
        </h3>
        {project.note ? (
          <span className="hidden shrink-0 font-mono text-[11px] text-faint sm:block">
            {project.note}
          </span>
        ) : null}
      </div>

      <p className="mt-1 font-serif text-lg italic text-dim">{project.tagline}</p>

      <p className="mt-5 max-w-3xl leading-relaxed text-dim">
        {project.description}
      </p>

      {project.metrics?.length ? (
        <div className="mt-7 flex flex-wrap gap-x-10 gap-y-4">
          {project.metrics.map((metric) => (
            <div key={metric.label}>
              <p className="font-mono text-xl text-ink">{metric.value}</p>
              <p className="mt-1 font-mono text-[11px] text-faint">
                {metric.label}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {project.slug === "sparse-emg" ? <PcbStrip /> : null}

      <div className="mt-7 flex flex-wrap gap-2">
        {project.stack.map((tech) => (
          <Chip key={tech}>{tech}</Chip>
        ))}
      </div>

      <Links project={project} className="mt-6" />
    </article>
  );
}

function CompactCard({ project }: { project: Project }) {
  const overflow = project.stack.length - 3;
  const hasLink = Boolean(project.href || project.live);

  return (
    <article className={`glass-panel flex h-full flex-col rounded-xl p-6 ${CARD_HOVER}`}>
      <h3 className="text-[15px] font-medium text-ink">{project.name}</h3>
      <p className="mt-1 font-serif text-sm italic text-dim">{project.tagline}</p>
      <p className="mt-3 text-[13.5px] leading-relaxed text-faint">
        {project.description}
      </p>

      {/* Spacer absorbs the slack so every card's chip/link block sits on the
          same baseline within a grid row, whatever the description's length. */}
      <div className="mt-auto" />

      <div className="mt-5 flex flex-wrap gap-2">
        {project.stack.slice(0, 3).map((tech) => (
          <Chip key={tech}>{tech}</Chip>
        ))}
        {overflow > 0 ? <Chip>+{overflow}</Chip> : null}
      </div>

      {hasLink ? (
        <Links project={project} className="mt-4" />
      ) : project.note ? (
        <p className="mt-4 font-mono text-[10px] text-faint">{project.note}</p>
      ) : null}
    </article>
  );
}

export default function Projects() {
  return (
    <Section
      id="projects"
      eyebrow="~/projects"
      scrim
      title="Built at the"
      titleAccent="seam"
    >
      <div className="mt-12 space-y-6">
        {featured.map((project, i) => {
          const card = (
            <TiltCard radius="rounded-2xl">
              <FeaturedCard project={project} />
            </TiltCard>
          );
          return (
            <Reveal key={project.slug} delay={0.06 + i * 0.06}>
              {/* Cards the signal layer knows how to highlight get a probe. */}
              {isFocusTarget(project.slug) ? (
                <FocusProbe focusId={project.slug}>{card}</FocusProbe>
              ) : (
                card
              )}
            </Reveal>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rest.map((project, i) => (
          <Reveal key={project.slug} delay={i * 0.06} className="h-full">
            <TiltCard radius="rounded-xl" className="h-full">
              <CompactCard project={project} />
            </TiltCard>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

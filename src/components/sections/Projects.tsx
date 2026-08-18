import { projects, type Project } from "@/data/content";
import Section from "@/components/ui/Section";
import Reveal from "@/components/ui/Reveal";
import Chip from "@/components/ui/Chip";
import ArrowLink from "@/components/ui/ArrowLink";

const CARD_HOVER =
  "transition duration-300 hover:border-white/[0.16] hover:bg-white/[0.045]";

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
      <p className="mt-3 line-clamp-3 text-[13.5px] leading-relaxed text-faint">
        {project.description}
      </p>

      <div className="flex-1" />

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
        {featured.map((project, i) => (
          <Reveal key={project.slug} delay={0.06 + i * 0.06}>
            <FeaturedCard project={project} />
          </Reveal>
        ))}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rest.map((project, i) => (
          <Reveal key={project.slug} delay={i * 0.06} className="h-full">
            <CompactCard project={project} />
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

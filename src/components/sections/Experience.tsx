import { identity, roles } from "@/data/content";
import Section from "@/components/ui/Section";
import Reveal from "@/components/ui/Reveal";
import { Pulse } from "@/components/ui/Glyph";

export default function Experience() {
  return (
    <Section
      id="timeline"
      eyebrow="~/timeline"
      title="Where the time"
      titleAccent="went"
    >
      <div className="mt-12 ml-1 space-y-14 border-l border-hairline pl-8">
        {roles.map((role, i) => (
          <Reveal key={role.org} delay={0.06 + i * 0.06}>
            <div className="relative">
              <span
                aria-hidden="true"
                className="absolute -left-[37px] top-2 size-2 rounded-full border border-white/40 bg-white/25"
              />

              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h3 className="text-[17px] font-medium text-ink">{role.org}</h3>
                <p className="text-[15px] text-dim">{role.title}</p>
                <p className="ml-auto font-mono text-[11px] text-faint">
                  {role.period}
                </p>
              </div>

              <ul className="mt-3 max-w-2xl space-y-2 text-[14.5px] leading-relaxed text-dim">
                {role.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          </Reveal>
        ))}

        <Reveal delay={0.06 + roles.length * 0.06}>
          <div className="relative">
            <Pulse className="absolute -left-[37px] top-1.5 block size-2 rounded-full bg-sig-blue" />
            <p className="font-mono text-[13px] text-ink">
              next <span aria-hidden="true">→</span> {identity.school}
            </p>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

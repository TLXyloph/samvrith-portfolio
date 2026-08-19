import { heroStats, identity, type Metric } from "@/data/content";
import Section from "@/components/ui/Section";
import Reveal from "@/components/ui/Reveal";
import Chip from "@/components/ui/Chip";
import TiltCard from "@/components/ui/TiltCard";

const TILES: Metric[] = [
  ...heroStats.slice(0, 3),
  { value: "27 ms", label: "per NeuroMCP tool call" },
];

export default function About() {
  return (
    <Section
      id="about"
      eyebrow="~/about"
      scrim
      title="Signal chain,"
      titleAccent="end to end"
    >
      <div className="mt-12 grid gap-14 lg:grid-cols-[1.2fr_1fr]">
        <Reveal delay={0.06}>
          <p className="text-xl leading-relaxed text-dim md:text-2xl">
            {identity.summary}
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {identity.interests.map((interest) => (
              <Chip key={interest}>{interest}</Chip>
            ))}
          </div>
          <p className="mt-6 font-mono text-[12px] text-faint">
            {identity.school}
          </p>
        </Reveal>

        <div className="grid grid-cols-2 gap-4">
          {TILES.map((tile, i) => (
            <Reveal key={tile.label} delay={0.12 + i * 0.06} className="h-full">
              <TiltCard radius="rounded-xl" className="h-full">
                <div className="glass-panel h-full rounded-xl p-5">
                  <p className="font-mono text-2xl text-ink">{tile.value}</p>
                  <p className="mt-1.5 font-mono text-[11px] leading-snug text-faint">
                    {tile.label}
                  </p>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </div>
    </Section>
  );
}

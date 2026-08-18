import { honors } from "@/data/content";
import Section from "@/components/ui/Section";
import Reveal from "@/components/ui/Reveal";

export default function Honors() {
  return (
    <Section id="honors" eyebrow="~/honors" srTitle="Honors" compact>
      <Reveal delay={0.06}>
        <ul className="mt-6 flex flex-wrap gap-x-8 gap-y-3 font-mono text-[12px] text-faint">
          {honors.map((honor) => (
            <li key={honor} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-[3px] shrink-0 rounded-full bg-white/25"
              />
              {honor}
            </li>
          ))}
        </ul>
      </Reveal>
    </Section>
  );
}

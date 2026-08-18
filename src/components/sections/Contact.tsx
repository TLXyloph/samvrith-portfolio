import { identity } from "@/data/content";
import Section from "@/components/ui/Section";
import Reveal from "@/components/ui/Reveal";
import ArrowLink from "@/components/ui/ArrowLink";
import { Blink } from "@/components/ui/Glyph";

export default function Contact() {
  return (
    <Section
      id="contact"
      eyebrow="~/contact"
      scrim
      className="flex min-h-[70vh] items-center"
      innerClassName="flex flex-col justify-center"
      title="Building something at the hardware–intelligence seam?"
      titleClassName="max-w-4xl font-serif text-[clamp(2rem,5vw,3.6rem)] italic leading-tight text-ink [text-wrap:balance]"
    >
      <Reveal delay={0.06}>
        <div className="glass-panel mt-10 max-w-xl rounded-xl p-6 font-mono text-[14px]">
          <p className="text-faint"># reaches a human, usually same day</p>
          <a
            href={`mailto:${identity.email}`}
            className="mt-2 inline-flex items-center text-ink transition-colors hover:text-sig-blue"
          >
            $ open mailto:{identity.email}
            <Blink className="ml-1" />
          </a>
        </div>
      </Reveal>

      <Reveal delay={0.12}>
        <div className="mt-8 flex flex-wrap items-center gap-8">
          <ArrowLink href={identity.github} label="github" />
          <p className="font-mono text-[12px] text-faint">
            san francisco, ca <span aria-hidden="true">→</span> west lafayette, in
          </p>
        </div>
      </Reveal>
    </Section>
  );
}

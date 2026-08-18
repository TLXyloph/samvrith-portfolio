import { contributions, type Contribution } from "@/data/content";
import Section from "@/components/ui/Section";
import Reveal from "@/components/ui/Reveal";

function Row({ item }: { item: Contribution }) {
  const merged = item.state === "merged";

  return (
    <div className="grid grid-cols-[64px_1fr] items-baseline gap-4 py-4 transition-colors hover:bg-white/[0.02] sm:grid-cols-[64px_220px_1fr_20px]">
      <span
        className={[
          "justify-self-start rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase",
          merged
            ? "border-sig-iris/40 text-sig-iris"
            : "border-hairline text-faint",
        ].join(" ")}
      >
        {item.state}
      </span>

      <div className="min-w-0">
        <p className="font-mono text-[13px] break-words text-ink">{item.repo}</p>
        <p className="mt-0.5 hidden font-mono text-[10px] text-faint sm:block">
          {item.repoNote}
        </p>
      </div>

      <p className="col-start-2 text-[13.5px] leading-relaxed text-dim sm:col-start-3">
        {item.title}
      </p>

      <span
        aria-hidden="true"
        className="hidden text-right font-mono text-[12px] text-faint sm:block"
      >
        {item.href ? "↗" : ""}
      </span>
    </div>
  );
}

export default function OpenSource() {
  return (
    <Section
      id="open-source"
      eyebrow="~/open-source"
      scrim
      title="Merged"
      titleAccent="upstream"
    >
      <Reveal delay={0.06}>
        <p className="mt-4 font-mono text-[12px] text-faint">
          $ git log --author=samvrith --merged --oneline
        </p>
      </Reveal>

      <div className="mt-8 divide-y divide-hairline border-y border-hairline">
        {contributions.map((item, i) => (
          <Reveal key={item.title} delay={0.12 + i * 0.06}>
            {item.href ? (
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${item.repo}: ${item.title} (opens in a new tab)`}
                className="block"
              >
                <Row item={item} />
              </a>
            ) : (
              <Row item={item} />
            )}
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

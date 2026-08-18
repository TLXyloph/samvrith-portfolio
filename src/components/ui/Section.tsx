import type { ReactNode } from "react";
import Reveal from "@/components/ui/Reveal";

const H2 =
  "text-[30px] md:text-[36px] font-medium tracking-[-0.02em] leading-tight text-ink";

type SectionProps = {
  id: string;
  /** unix-path eyebrow, e.g. "~/projects" */
  eyebrow: string;
  /** h2 lead — plain sans by default */
  title?: ReactNode;
  /** trailing words rendered in serif italic */
  titleAccent?: string;
  /** replaces the default h2 classes wholesale (Contact's serif display line) */
  titleClassName?: string;
  /** visually-hidden h2 for sections with no display heading (Honors) */
  srTitle?: string;
  /** full-bleed readability gradient behind the section */
  scrim?: boolean;
  /** tighter vertical rhythm */
  compact?: boolean;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
};

/** Shared section shell: scroll offset, optional scrim, container, eyebrow + h2. */
export default function Section({
  id,
  eyebrow,
  title,
  titleAccent,
  titleClassName,
  srTitle,
  scrim = false,
  compact = false,
  className,
  innerClassName,
  children,
}: SectionProps) {
  return (
    <section
      id={id}
      className={["relative scroll-mt-24", className].filter(Boolean).join(" ")}
    >
      {scrim ? (
        <div
          aria-hidden="true"
          className="scrim pointer-events-none absolute inset-0 -z-10"
        />
      ) : null}

      <div
        className={[
          "mx-auto w-full max-w-6xl px-6 md:px-10",
          compact ? "py-16 md:py-20" : "py-28 md:py-36",
          innerClassName,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <Reveal>
          <p className="eyebrow">{eyebrow}</p>
          {srTitle ? <h2 className="sr-only">{srTitle}</h2> : null}
          {title ? (
            <h2 className={["mt-4", titleClassName ?? H2].join(" ")}>
              {title}
              {titleAccent ? (
                <>
                  {" "}
                  <em className="font-serif italic">{titleAccent}</em>
                </>
              ) : null}
            </h2>
          ) : null}
        </Reveal>

        {children}
      </div>
    </section>
  );
}

type ArrowLinkProps = {
  href: string;
  /** visible text; the arrow glyph is appended */
  label: string;
  /** defaults to "↗" for external hrefs, "→" otherwise */
  arrow?: "↗" | "↓" | "→" | "↑";
  /** overrides the http(s) sniff */
  external?: boolean;
  ariaLabel?: string;
  className?: string;
};

/** Mono 12px link, dim → ink on hover. Arrow is a text glyph, never an icon font. */
export default function ArrowLink({
  href,
  label,
  arrow,
  external,
  ariaLabel,
  className,
}: ArrowLinkProps) {
  const isExternal = external ?? /^https?:\/\//.test(href);
  const glyph = arrow ?? (isExternal ? "↗" : "→");

  return (
    <a
      href={href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
      aria-label={
        ariaLabel ?? (isExternal ? `${label} (opens in a new tab)` : undefined)
      }
      className={[
        "inline-flex items-center gap-1.5 font-mono text-[12px] text-dim transition-colors hover:text-ink",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {label}
      <span aria-hidden="true">{glyph}</span>
    </a>
  );
}

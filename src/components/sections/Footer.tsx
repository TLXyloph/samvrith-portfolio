export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-hairline">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-6 px-6 font-mono text-[11px] text-faint md:px-10">
        <p>© 2026 samvrith bandi · rendered in glyphs</p>
        <a
          href="#content"
          className="shrink-0 transition-colors hover:text-ink"
        >
          back to top <span aria-hidden="true">↑</span>
        </a>
      </div>
    </footer>
  );
}

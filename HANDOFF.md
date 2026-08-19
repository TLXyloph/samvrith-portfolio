# HANDOFF — samvrith-portfolio

Start a fresh session with this file's path to continue work on the site.

## Goal

Samvrith Bandi's live portfolio: **https://samvrith-portfolio.vercel.app** ·
repo `TLXyloph/samvrith-portfolio` (public). Push to `main` → Vercel
auto-deploys. This handoff covers the likely future work: editing/reordering
cards, adjusting copy, and adding new scroll set pieces like the PCB
deep-dive. Full design record: `docs/superpowers/specs/2026-08-18-portfolio-design.md`.

## Where everything lives

- **All content = `src/data/content.ts`** — the single source of truth.
  Projects (cards), OSS contributions, roles/timeline, honors, interests,
  `hardwareBeats` (PCB-section copy), identity/motto. **Card changes are
  edits here, not in components**: array order = display order,
  `featured: true` = big card with metrics, the rest land in the grid.
  House rule: every number must be verified (resume or GitHub) — never
  invent metrics. No phone number on the site, ever.
- **Sections** = `src/components/sections/*` (server components rendering
  content.ts). Shared primitives in `src/components/ui/*`: `Section`
  (shell + eyebrow + scrim), `Reveal` (scroll fade-in, hidden-tab-safe),
  `TiltCard` (hover tilt + glimmer), `Chip`, `ArrowLink`, `ScrollProgress`,
  `FocusProbe` (featured cards → brain highlight), `Glyph` (hoisted
  keyframes — add new @keyframes there, `globals.css` holds only tokens
  and the utilities `.breathe`, `.signal-bar`, `.scrim`).
- **The brain** = `src/components/signal/**`. ASCII two-pass shader
  (`AsciiPipeline`), brain+silicon (`Cortex`, `brain.ts`, `surface.ts`,
  painted PCB texture in `pcbTexture.ts`/`pcbLayout.ts`), choreography in
  `state.ts` — **STOPS p-values are fractions of TOTAL page height; any
  change to page length (new section, much longer card grid) requires
  retuning them** or poses/activation drift off their sections.
  `scrollBus.ts` is a FROZEN API (Lenis publishes, SignalField consumes).
  Tuning surface: **`/lab`** (cellPx, exposure, underlayer, rippleGain,
  glyphMin/Gain, spring/momentum, variant + focus simulators).
- **PCB deep-dive** = `src/components/hardware/**`. `poses.ts` holds
  `BEAT_POSES` (camera orbit per beat), anchors resolved from **refdes-named
  GLB nodes** (U1/J1/J3… — KiCad exports these; `RAW_FALLBACKS` as backup),
  and the feel constants `SCRUB_GAIN` (0.38) / `MOMENTUM_GAIN` (1.2).
  Beat copy = `hardwareBeats` in content.ts. Model = `public/pcb/emg_2ch.glb`.

## Recipe: adding another 3D/diagram set piece (the PCB-dive pattern)

1. Asset: for KiCad boards —
   `/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli pcb export glb
   <board>.kicad_pcb -o public/<name>.glb --subst-models --include-tracks
   --include-pads --include-zones --include-silkscreen --include-soldermask`.
   ~5MB is fine if lazy-loaded. GLB nodes keep refdes names — anchor labels
   to real components, **never to midpoints of two things** (that pins to
   empty space; this bug happened with the electrode headers).
2. Copy the section pattern from `hardware/HardwareDive.tsx`: tall region
   (~100svh per beat) + sticky full-viewport stage, section-local progress
   from `getBoundingClientRect` (do NOT touch scrollBus), own R3F Canvas
   (crisp, no ASCII — "one real object on a quantized site" is deliberate),
   spring + scroll-momentum pose chasing (Driver recipe), one animated
   callout per beat, beats copy in content.ts, IntersectionObserver-gated
   lazy mount (ssr:false dynamic import), frameloop off when off-screen,
   reduced-motion static pose, no-WebGL2 image fallback.
3. Then: add the nav link, and **retune the brain STOPS** for the new page
   height (measure section offsets on the built page).

## Build · run · deploy

- `pnpm lint` && `pnpm build` are the gates (both must stay clean).
- Local prod serve: `./node_modules/.bin/next start` (background).
  **Gotcha that bit us repeatedly**: a running server holds an in-memory
  manifest — rebuilding `.next` under it serves corrupted/stale pages, and
  killing the `pnpm start` wrapper orphans the actual `next-server` child,
  which squats port 3000 serving old content. Always: kill by port
  (`lsof -ti tcp:3000 -sTCP:LISTEN`, verify cwd is this repo, kill), then
  `rm -rf .next && pnpm build`, then start `next start` directly.
- Deploy = `git push` (Vercel Hobby). `metadataBase` is set to the prod URL.
- **When adding large binary assets to `public/`** (more GLBs, videos…):
  Tailwind v4 auto-scans un-ignored project files for class candidates and
  its binary heuristic misses formats like `.glb` — the 5.4MB board model
  OOM-killed Vercel's postcss subprocess (passed locally, SIGKILL in the
  build container; every deploy failed silently for hours). The guard is
  already in place — `@source not "../../public";` in `globals.css` — keep
  it, and keep new asset dirs under `public/`. After any push, glance at
  the repo's commit status (`gh api repos/TLXyloph/samvrith-portfolio/commits/main/status --jq .state`)
  rather than assuming green; verify prod assets by content-type, not
  status code (a range request on Vercel's 404 page returns 206).

## What worked (keep doing)

- **The flower formula** for anything ASCII-rendered: cohesive luminous
  solid geometry + strong blurred underlayer (0.6) + big glyphs (18px,
  luminance-scaled size). Sparse point clouds quantize into "a bunch of
  dots" — that failure happened and was reworked.
- Design religion: monochrome chrome; color lives in the signal; one hero
  gradient; quiet `.breathe` CTA (liquid metal was tried and removed);
  mono eyebrows as `~/paths`; real numbers only. `--faint` is tuned to
  ≥4.5:1 AA on the void — don't darken it.
- No `backdrop-filter` over the WebGL canvas (mobile-Safari perf).
- Subagent rounds with disjoint file ownership + explicit-path `git add`
  (a `git add -A` while an agent was mid-work swept its files once).
- `/lab` for visual tuning before baking defaults.

## What didn't work (don't repeat)

- Point-cloud brain (dots, not characters) → replaced by solid mesh.
- Fly-away/come-back scroll choreography → felt tacky; replaced by
  fixed-position rotation poses with spring + momentum.
- Brain-mounted labels → user moved them to the PCB section instead.
- Bright liquid-metal accents → too flashy; `.breathe`/`.signal-bar` now.
- Tiny-bright starfield points → underlayer blobs; stars must fill ~a cell
  at low luminance to read as characters.
- Anything relying on rAF in a hidden/occluded tab (fade-in gate, Reveal,
  motion) — `Reveal` has an inert fallback for that; keep it.

## Open items

- **OG image**: `src/app/opengraph-image.png` still missing — capture a
  1200×630 still of the cortex (needs a visible tab / live render), drop
  the file in `src/app/`, done (App Router auto-wires it).
- Silkscreen designators in the brain's painted PCB underlayer are
  deliberately blurry; a sharper option exists (silk in RT0) if ever wanted.
- Mobile nav shows only name + GitHub (parked product call).
- Canvas DPR is captured at mount (stale after moving between monitors
  until reload).
- Feel constants worth a periodic look: `SCRUB_GAIN`, `MOMENTUM_GAIN`
  (hardware/poses.ts), spring sliders on `/lab`.

## Do-nots

- Don't modify `scrollBus.ts`'s API; don't re-add an annotation bus for the
  brain (removed by user request — labels live in the PCB section only).
- Don't push to `TLXyloph/portfolio` — that's the user's separate private
  vanilla-JS portfolio repo.
- Don't put secrets/phone in content; don't read Desktop files matching
  `*recovery-codes*` / `*.ncryptsec`.
- Keep files under 500 lines; lint/build clean before any push.

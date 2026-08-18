# Portfolio design spec — "From microvolts to meaning"

2026-08-18 · Samvrith Bandi personal portfolio · target: Vercel (localhost first)

## Thesis

Samvrith's work is one signal chain: amplify a microvolt biosignal → sample →
quantize → extract intelligence. ASCII rendering is that same chain applied to
light (continuous image → sampled cells → quantized glyphs). The site's visual
system *is* his engineering story.

Reference: kail_designs on X — "Portfolio website design with ASCII aesthetic"
(iridescent ASCII flower on black). Fused with MengTo-school refinement:
generous spacing, glass hairlines, calm springs, scroll-tied 3D storytelling.

## Signature element (all boldness goes here)

A fixed, full-viewport WebGL "signal field": an iridescent bloom (10 petals,
two whorls, phyllotaxis azimuths) rendered through a custom two-pass ASCII
postprocess. It pulses with an EMG-like burst envelope (120 ms attack / 900 ms
decay), orbits around the mouse via a damped camera rig, sheds glyph particles
from the pointer (pre-quantization, so sparks are glyphs too), and evolves with
scroll: hero (centered, bright) → recedes for reading → partially disperses
into the particle field → reassembles at contact as a bookend.

## Design rules

- Color lives in the signal; chrome stays monochrome. One gradient exception:
  the hero thesis line "from microvolts to meaning".
- Palette: void #050508 · ink #f4f4f6 · hairline white/8 · glass white/3 ·
  signal hues #8b9cf5 / #a78bfa / #f472b6 / #fb7185 (canvas + tiny accents only).
- Type: Geist Sans (body/display), Geist Mono (terminal register, eyebrows as
  unix paths: ~/about, ~/projects, …), Instrument Serif italic (a few display
  words only).
- Copy: plain, confident, real numbers only (95.4%, 102 ms, ~$9 BOM, 610
  commits/yr, 813★ norse). No buzzwords. Phone number deliberately excluded.
- No backdrop-filter over the WebGL canvas (mobile Safari); readability via
  rgba scrims + scroll-driven exposure dimming of the scene itself.

## Key technical decisions (Fable advisor consult, adopted)

1. Bloom engineered for ASCII legibility: few wide petals (≥6 glyph cells at
   rest), Lambert-wrap + fresnel rim as emissive (rim draws the silhouette),
   color by UV part not by light, backfaces ×0.4, starfield capped below the
   first glyph threshold.
2. Single full-page canvas, scene RT at 0.6× (quantization hides softness),
   DPR clamp 2 / 1.5, scroll state table lerped {pos, scale, exposure,
   disperse, orbitGain}.
3. Shader: pass A scene→HalfFloat RT (ACES before quantize), pass A2 0.1×
   underlayer blit, pass B: 4-tap cell average → 10-step ramp " .:-=+*x#%@" →
   runtime-baked Geist Mono glyph atlas (never regenerated on resize) →
   scene-chroma-preserving tint + soft underlayer. Art-direction params:
   cellPx, exposure, contrast, underlayerOpacity, globalDim.
4. Pointer particles inside the scene at cursor-unprojected z-plane; 4px DOM
   cursor dot (mix-blend difference) covers perceived latency.

## Structure

Nav · Hero (100svh) · ~/about · ~/projects (SparseEMG + NeuroMCP featured;
mediBot, learnit, leverage-monopoly, realTimeCompliance, afterscroll, Lance
grid) · ~/open-source (git-log-styled merged-PR list) · ~/timeline ·
~/honors · ~/contact · footer. Content: src/data/content.ts (single source of
truth, every number verified against resume or GitHub).

## Quality floor

prefers-reduced-motion → static frame, no particles/pulse; pause when hidden;
context-loss recovery; WebGL-absent fallback = plain void bg; keyboard focus
visible; semantic landmarks; Lighthouse-conscious (one canvas, no heavy deps).

## Stack

Next.js 16 · React 19 · TS · Tailwind v4 · three + @react-three/fiber ·
hand-rolled ASCII postprocess (no postprocessing lib) · motion · lenis.

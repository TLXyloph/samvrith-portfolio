/**
 * Glyph atlas for the ASCII postprocess: a 16×1-cell canvas texture,
 * generated ONCE at runtime and cached at module level (never regenerated
 * on resize). 64px cells, glyphs drawn white on transparent, centered.
 * Starts with the fallback-font atlas immediately, then redraws once
 * document.fonts.ready resolves (async swap-in of Geist Mono).
 */
import * as THREE from "three";

export const GLYPH_RAMP = " .:-=+*x#%@";
/** Silicon extras in the free cells: '|' at 11, 'o' at 12 (see ASCII_FRAG). */
export const GLYPH_EXTRAS = "|o";
export const ATLAS_CELLS = 16;
const CELL = 64;

let cached: THREE.CanvasTexture | null = null;

function fontStack(): string {
  // next/font registers Geist Mono under an obfuscated family exposed via
  // the --font-geist-mono CSS variable; resolve it so the real face is used.
  let resolved = "";
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue("--font-geist-mono")
      .trim();
    if (v) resolved = `${v}, `;
  } catch {
    // ignore — fall through to the literal stack
  }
  return `500 54px ${resolved}"Geist Mono", "SFMono-Regular", Menlo, monospace`;
}

function drawAtlas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = fontStack();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < GLYPH_RAMP.length; i++) {
    const ch = GLYPH_RAMP[i];
    if (ch === " ") continue;
    ctx.fillText(ch, i * CELL + CELL / 2, CELL / 2 + 2);
  }
  for (let i = 0; i < GLYPH_EXTRAS.length; i++) {
    ctx.fillText(GLYPH_EXTRAS[i], (GLYPH_RAMP.length + i) * CELL + CELL / 2, CELL / 2 + 2);
  }
}

export function getGlyphAtlas(): THREE.CanvasTexture {
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_CELLS * CELL;
  canvas.height = CELL;
  drawAtlas(canvas);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  cached = tex;
  try {
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready
        .then(() => {
          drawAtlas(canvas);
          tex.needsUpdate = true;
        })
        .catch(() => {
          /* keep fallback atlas */
        });
    }
  } catch {
    /* keep fallback atlas */
  }
  return tex;
}

/**
 * Painted PCB texture — drawn ONCE at runtime into a canvas (like the
 * glyph atlas) FROM the same seeded silicon trace layout, so the geometric
 * orientation-glyph traces sit exactly on their own hazy painted ghosts.
 * The 0.1× underlayer blur of this texture is the cohesive "circuit board
 * out of focus" image. Mapped onto the backplane (see surface.ts).
 */
import * as THREE from "three";
import { mulberry32, type SiliconData } from "./brain";
import { PCB_U0, PCB_U1, PCB_V } from "./surface";

const W = 1024;
const H = 1536;

function px(u: number): number {
  return ((u - PCB_U0) / (PCB_U1 - PCB_U0)) * W;
}
function py(v: number): number {
  return (1 - (v + PCB_V) / (2 * PCB_V)) * H;
}

export function buildPcbTexture(silicon: SiliconData): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (!ctx) return tex;
  const rand = mulberry32(9091);

  // substrate + faint fab grid
  ctx.fillStyle = "#241f4b";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(63, 58, 118, 0.5)";
  ctx.lineWidth = 1;
  const grid = px(PCB_U0 + 0.047 * 2) - px(PCB_U0); // 2 fine cells
  for (let x = 0; x < W; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // IC / footprint rectangles with pin stubs (seeded, one per quadrant-ish)
  for (let i = 0; i < 4; i++) {
    const cx = px(0.28 + (i % 2) * 0.55 + rand() * 0.12);
    const cy = py((i < 2 ? 0.42 : -0.5) + (rand() - 0.5) * 0.24);
    const w = 130 + rand() * 70;
    const h = 100 + rand() * 60;
    ctx.fillStyle = "#1a1738";
    ctx.strokeStyle = "#413f7c";
    ctx.lineWidth = 4;
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
    ctx.strokeStyle = "#5b639f";
    ctx.lineWidth = 5;
    const pins = 6;
    for (let p = 0; p < pins; p++) {
      const off = -w / 2 + ((p + 0.5) / pins) * w;
      ctx.beginPath();
      ctx.moveTo(cx + off, cy - h / 2);
      ctx.lineTo(cx + off, cy - h / 2 - 16);
      ctx.moveTo(cx + off, cy + h / 2);
      ctx.lineTo(cx + off, cy + h / 2 + 16);
      ctx.stroke();
    }
  }

  // thick bus traces along the SAME seeded layout (rounded corners)
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const strokeTrace = (pts: Float32Array, width: number, style: string) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(px(pts[0]), py(pts[1]));
    for (let i = 1; i < pts.length / 3; i++) {
      ctx.lineTo(px(pts[i * 3]), py(pts[i * 3 + 1]));
    }
    ctx.stroke();
  };
  for (const trace of silicon.traces) {
    strokeTrace(trace.points, 17, "#4b55a6");
    strokeTrace(trace.points, 6, "#7079c4");
  }

  // via rings at trace ends
  for (const trace of silicon.traces) {
    const pts = trace.points;
    const ends = [0, pts.length - 3];
    for (const e of ends) {
      const cx = px(pts[e]);
      const cy = py(pts[e + 1]);
      ctx.fillStyle = "#241f4b";
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#828bd4";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, cy, 13, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // silkscreen hairlines
  ctx.strokeStyle = "rgba(154, 160, 216, 0.3)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 10; i++) {
    const x0 = rand() * W;
    const y0 = rand() * H;
    ctx.beginPath();
    if (rand() < 0.5) {
      const len = 80 + rand() * 260;
      const horizontal = rand() < 0.5;
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + (horizontal ? len : 0), y0 + (horizontal ? 0 : len));
    } else {
      ctx.arc(x0, y0, 24 + rand() * 60, 0, Math.PI * (0.5 + rand()));
    }
    ctx.stroke();
  }

  tex.needsUpdate = true;
  return tex;
}

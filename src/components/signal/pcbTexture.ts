/**
 * Painted PCB texture — drawn ONCE at runtime into a canvas (like the
 * glyph atlas) FROM the same seeded silicon trace layout, so the geometric
 * orientation-glyph traces sit exactly on their own hazy painted ghosts.
 * The 0.1× underlayer blur of this texture is the cohesive "circuit board
 * out of focus" image. Mapped onto the backplane (see surface.ts).
 *
 * v4.1 — real board language at 1320×2048 (long side at the 2048 cap; the
 * canvas keeps the backplane's 1.29 : 2.0 world aspect) so structure
 * survives the blur: copper pours with clearance halos, 45°-beveled ghost
 * corners, parallel bus bundles + QFP pin fan-outs, IC footprints carrying
 * the site's real parts (U1 AD8226 · U2 RP2040 · U3 MCP6002), 0402 passive
 * pad pairs, stitching + bright annular vias, silkscreen designators and
 * hairlines, mounting holes, fiducials, and a board-edge line following
 * the hemisphere silhouette. Deep-violet solder mask, iris/lavender
 * copper, near-white pads — the site's colors, no PCB green. Deterministic
 * placement lives in pcbLayout.ts.
 */
import * as THREE from "three";
import { mulberry32, type SiliconData } from "./brain";
import {
  BCX, BCY, BRX, BRY, CELL, FIDUCIALS, H, MOUNTS, PAD_LEN, POURS, W,
  bevelPath, chamferRect, icPads, occupancy, addBundle, placeICs,
  placePassives, placeStitching, px, py, routeFanouts, toPts,
  type IC, type Passive, type Pt, type RPad, type Route,
} from "./pcbLayout";

/* palette — the site's violet family (mask / copper / plating) */
const SUBSTRATE = "#211c46";
const SUBSTRATE_DEEP = "#181440";
const HOLE = "#0d0b22";
const POUR = "#332c66";
const POUR_EDGE = "#423b80";
const TRACE_BODY = "#5560b2";
const TRACE_CORE = "#8d97dd";
const THIN_COPPER = "#4d57a8";
const PAD = "#e7e4f9";
const PAD_SOFT = "#bcc2ea";
const PIN = "#5b639f";
const IC_BODY = "#14112e";
const IC_EDGE = "#3e3a78";
const IC_DIE = "#231e50";
const SILK = "rgba(224, 226, 249, 0.85)";
const SILK_FAINT = "rgba(198, 202, 240, 0.42)";
const font = (wgt: number, sz: number) => `${wgt} ${sz}px Menlo, "SF Mono", monospace`;

function strokePts(ctx: CanvasRenderingContext2D, pts: Pt[], wd: number, style: string): void {
  ctx.strokeStyle = style;
  ctx.lineWidth = wd;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, style: string): void {
  ctx.fillStyle = style;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, wd: number, style: string): void {
  ctx.strokeStyle = style;
  ctx.lineWidth = wd;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function polyPath(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

function drawIC(ctx: CanvasRenderingContext2D, ic: IC): void {
  const m = PAD_LEN + 8;
  ctx.fillStyle = SUBSTRATE_DEEP; // courtyard clearance
  ctx.fillRect(ic.cx - ic.bw / 2 - m, ic.cy - ic.bh / 2 - m, ic.bw + 2 * m, ic.bh + 2 * m);
  const across = ic.quad ? 9 : 12;
  const tip = PAD_LEN * 0.55;
  for (const t of icPads(ic)) {
    const bx = t.x - t.dx * PAD_LEN;
    const by = t.y - t.dy * PAD_LEN;
    ctx.fillStyle = PIN; // stub…
    if (t.dx !== 0) ctx.fillRect(Math.min(bx, t.x), by - across / 2, PAD_LEN, across);
    else ctx.fillRect(bx - across / 2, Math.min(by, t.y), across, PAD_LEN);
    ctx.fillStyle = PAD; // …with a near-white pad tip
    if (t.dx > 0) ctx.fillRect(t.x - tip, by - across / 2, tip, across);
    else if (t.dx < 0) ctx.fillRect(t.x, by - across / 2, tip, across);
    else if (t.dy > 0) ctx.fillRect(bx - across / 2, t.y - tip, across, tip);
    else ctx.fillRect(bx - across / 2, t.y, across, tip);
  }
  ctx.fillStyle = IC_BODY;
  ctx.fillRect(ic.cx - ic.bw / 2, ic.cy - ic.bh / 2, ic.bw, ic.bh);
  ctx.strokeStyle = IC_EDGE;
  ctx.lineWidth = 3;
  ctx.strokeRect(ic.cx - ic.bw / 2, ic.cy - ic.bh / 2, ic.bw, ic.bh);
  if (ic.quad) {
    ctx.fillStyle = IC_DIE;
    ctx.fillRect(ic.cx - ic.bw * 0.21, ic.cy - ic.bh * 0.21, ic.bw * 0.42, ic.bh * 0.42);
  }
  disc(ctx, ic.cx - ic.bw / 2 + 15, ic.cy - ic.bh / 2 + 15, 5.5, "#8f96cf"); // pin-1 dot
}

function silkscreen(ctx: CanvasRenderingContext2D, ics: IC[], passives: Passive[], rand: () => number): void {
  // board edge following the hemisphere silhouette
  ctx.strokeStyle = "rgba(200, 204, 240, 0.3)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(BCX, BCY, BRX * 0.955, BRY * 0.955, 0, 0, Math.PI * 2);
  ctx.stroke();
  // courtyards + the real reference designators (large → suggestively
  // legible even through the 0.1× blur)
  for (const ic of ics) {
    const m = PAD_LEN + 12;
    ctx.strokeStyle = SILK_FAINT;
    ctx.lineWidth = 2;
    ctx.strokeRect(ic.cx - ic.bw / 2 - m, ic.cy - ic.bh / 2 - m, ic.bw + 2 * m, ic.bh + 2 * m);
    disc(ctx, ic.cx - ic.bw / 2 - m - 9, ic.cy - ic.bh / 2 - m - 9, 4, SILK);
    const size = ic.quad ? 64 : 48;
    ctx.font = font(700, size);
    ctx.fillStyle = SILK;
    const label = `${ic.ref} ${ic.part}`;
    const above = ic.cy - ic.bh / 2 - m - 22;
    const y = above > 90 ? above : ic.cy + ic.bh / 2 + m + size + 8;
    const tw = ctx.measureText(label).width;
    const x = Math.max(8, Math.min(ic.cx - ic.bw / 2 - m, W - 8 - tw));
    ctx.fillText(label, x, y);
  }
  // tiny passive designators (C__ / R__)
  ctx.font = font(600, 26);
  ctx.fillStyle = "rgba(210, 214, 244, 0.6)";
  for (const p of passives) {
    if (p.label) ctx.fillText(p.label, p.x + 0.55 * CELL, p.y - 0.35 * CELL);
  }
  // hairlines: assembly corner L-marks on the pour outlines + two arcs
  ctx.strokeStyle = SILK_FAINT;
  ctx.lineWidth = 2;
  for (const [u0, v0, u1, v1] of POURS) {
    const x0 = px(u0) - 8;
    const y0 = py(v1) - 8;
    const x1 = px(u1) + 8;
    const y1 = py(v0) + 8;
    ctx.beginPath();
    if (rand() < 0.5) {
      ctx.moveTo(x0, y0 + 40);
      ctx.lineTo(x0, y0);
      ctx.lineTo(x0 + 40, y0);
    } else {
      ctx.moveTo(x1, y1 - 40);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x1 - 40, y1);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 2; i++) {
    ctx.beginPath();
    ctx.arc(px(0.2 + rand() * 0.9), py(-0.8 + rand() * 1.6), 30 + rand() * 50, 0, Math.PI * (0.5 + rand()));
    ctx.stroke();
  }
  for (const m of MOUNTS) ring(ctx, m.x, m.y, 34, 2, SILK_FAINT); // keepouts
  for (const f of FIDUCIALS) ring(ctx, f.x, f.y, 13, 2, SILK_FAINT);
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
  const occ = occupancy(silicon);

  // — layout —
  const ics = placeICs(occ, rand);
  const routes: Route[] = [];
  const roundPads: RPad[] = [];
  routeFanouts(routes, roundPads, ics, rand);
  addBundle(routes, roundPads, px(0.63), py(0.8), 0, 1, 4, 0.55 * CELL, 1, 2.5 * CELL, 1.5 * CELL, (2.5 + rand() * 2) * CELL);
  addBundle(routes, roundPads, px(0.1), py(-0.34), 1, 0, 5, 0.55 * CELL, 1, 3 * CELL, 1.8 * CELL, (3 + rand() * 3) * CELL);
  const passives = placePassives(occ, ics, rand);
  const pourPx = POURS.map(([u0, v0, u1, v1]) => [px(u0), py(v1), px(u1), py(v0)] as const);
  const stitches = placeStitching(occ, ics, pourPx, rand);
  const ghosts = silicon.traces.map((t) => bevelPath(toPts(t.points), 0.5 * CELL));

  // — substrate + big soft mottle (large tonal unevenness survives blur) —
  ctx.fillStyle = SUBSTRATE;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 4; i++) {
    const gx = rand() * W;
    const gy = rand() * H;
    const r = 380 + rand() * 320;
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
    const tone = rand() < 0.5 ? "40, 34, 92" : "22, 18, 54";
    g.addColorStop(0, `rgba(${tone}, 0.5)`);
    g.addColorStop(1, `rgba(${tone}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
  }
  // faint fab grid (2 fine cells)
  ctx.strokeStyle = "rgba(63, 58, 118, 0.4)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 2 * CELL) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 2 * CELL) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // — copper pours, clipped to the board silhouette —
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(BCX, BCY, BRX * 0.99, BRY * 0.99, 0, 0, Math.PI * 2);
  ctx.clip();
  for (const [x0, y0, x1, y1] of pourPx) {
    polyPath(ctx, chamferRect((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, 0.9 * CELL));
    ctx.fillStyle = POUR;
    ctx.fill();
    ctx.strokeStyle = POUR_EDGE;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.restore();

  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // — clearance phase: substrate halos cut every copper feature free —
  for (const r of routes) strokePts(ctx, r.pts, r.w + 14, SUBSTRATE);
  for (const g of ghosts) strokePts(ctx, g, 37, SUBSTRATE);
  for (const p of roundPads) disc(ctx, p.x, p.y, p.r + 7, SUBSTRATE);
  for (const t of silicon.traces) {
    for (const e of [0, t.points.length - 3]) {
      disc(ctx, px(t.points[e]), py(t.points[e + 1]), 20, SUBSTRATE);
    }
  }
  for (const s of stitches) disc(ctx, s.x, s.y, 12, SUBSTRATE);
  ctx.fillStyle = SUBSTRATE;
  for (const p of passives) {
    const L = 0.82 * CELL + 14;
    const Wp = 0.32 * CELL + 14;
    if (p.horiz) ctx.fillRect(p.x - L / 2, p.y - Wp / 2, L, Wp);
    else ctx.fillRect(p.x - Wp / 2, p.y - L / 2, Wp, L);
  }
  for (const m of MOUNTS) disc(ctx, m.x, m.y, 30, SUBSTRATE);
  for (const f of FIDUCIALS) disc(ctx, f.x, f.y, 16, SUBSTRATE);

  // — copper phase (ghost traces last, so the glyph layer stays dominant) —
  for (const r of routes) strokePts(ctx, r.pts, r.w, THIN_COPPER);
  for (const p of roundPads) disc(ctx, p.x, p.y, p.r, PAD_SOFT);
  for (const s of stitches) {
    ring(ctx, s.x, s.y, 7, 4, "#6a6fb0");
    disc(ctx, s.x, s.y, 3.5, HOLE);
  }
  for (const g of ghosts) {
    strokePts(ctx, g, 21, TRACE_BODY);
    strokePts(ctx, g, 8, TRACE_CORE);
  }
  for (const t of silicon.traces) {
    for (const e of [0, t.points.length - 3]) {
      const x = px(t.points[e]);
      const y = py(t.points[e + 1]);
      ring(ctx, x, y, 12, 7, PAD); // bright annular ring
      disc(ctx, x, y, 5.5, SUBSTRATE_DEEP);
    }
  }
  for (const p of passives) {
    const pl = 0.28 * CELL;
    const pw = 0.32 * CELL;
    const gap = 0.26 * CELL;
    ctx.fillStyle = "#3d3766"; // body between the terminals
    if (p.horiz) ctx.fillRect(p.x - gap / 2, p.y - pw * 0.38, gap, pw * 0.76);
    else ctx.fillRect(p.x - pw * 0.38, p.y - gap / 2, pw * 0.76, gap);
    ctx.fillStyle = PAD;
    if (p.horiz) {
      ctx.fillRect(p.x - gap / 2 - pl, p.y - pw / 2, pl, pw);
      ctx.fillRect(p.x + gap / 2, p.y - pw / 2, pl, pw);
    } else {
      ctx.fillRect(p.x - pw / 2, p.y - gap / 2 - pl, pw, pl);
      ctx.fillRect(p.x - pw / 2, p.y + gap / 2, pw, pl);
    }
  }
  for (const m of MOUNTS) {
    ring(ctx, m.x, m.y, 21, 12, "#d3d5f0"); // plated mounting ring
    disc(ctx, m.x, m.y, 14, HOLE);
  }
  for (const f of FIDUCIALS) disc(ctx, f.x, f.y, 6, PAD);

  // — footprints + silkscreen —
  for (const ic of ics) drawIC(ctx, ic);
  silkscreen(ctx, ics, passives, rand);

  tex.needsUpdate = true;
  return tex;
}

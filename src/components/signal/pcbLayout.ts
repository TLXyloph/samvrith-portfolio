/**
 * PCB paint layout — the deterministic geometry half of the painted board
 * (see pcbTexture.ts for the painter): texture-space mapping of the seeded
 * silicon trace grid, 45° corner bevels for the ghost polylines, trace-
 * occupancy scoring, and seeded placement of pours, IC footprints (the
 * site's real parts), bus bundles, pin fan-outs, 0402 passives, stitching
 * vias, mounting holes and fiducials.
 */
import { mulberry32, shellZ, SIL_CELL, type SiliconData } from "./brain";
import { PCB_U0, PCB_U1, PCB_V } from "./surface";

export const W = 1320;
export const H = 2048;
const USPAN = PCB_U1 - PCB_U0;
/** One fine ASCII cell (SIL_CELL) in texture px ≈ 48. */
export const CELL = (SIL_CELL / USPAN) * W;
export const PAD_LEN = 0.42 * CELL;

export function px(u: number): number {
  return ((u - PCB_U0) / USPAN) * W;
}
export function py(v: number): number {
  return (1 - (v + PCB_V) / (2 * PCB_V)) * H;
}

/* board silhouette (matches surface.ts inside()) as a px-space ellipse */
export const BCX = ((-0.06 - PCB_U0) / USPAN) * W;
export const BCY = H / 2;
export const BRX = (1.36 / USPAN) * W;
export const BRY = H / 2;

export interface Pt {
  x: number;
  y: number;
}

export function inBoard(x: number, y: number, inset: number): boolean {
  const a = (x - BCX) / (BRX * inset);
  const b = (y - BCY) / (BRY * inset);
  return a * a + b * b <= 1;
}

export function toPts(points: Float32Array): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < points.length; i += 3) {
    pts.push({ x: px(points[i]), y: py(points[i + 1]) });
  }
  return pts;
}

/**
 * Chamfer the right-angle corners so painted routing reads as real-PCB 45°
 * bends. Endpoints and straight runs are untouched, so the Manhattan glyph
 * traces stay glued to their ghosts; only the corner cell (which carries a
 * '+' junction glyph anyway) gets the diagonal shortcut.
 */
export function bevelPath(pts: Pt[], d: number): Pt[] {
  if (pts.length < 3) return pts;
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const bcx = c.x - b.x;
    const bcy = c.y - b.y;
    if (Math.abs(abx * bcy - aby * bcx) < 0.5) continue; // collinear step
    const l1 = Math.hypot(abx, aby);
    const l2 = Math.hypot(bcx, bcy);
    const k1 = Math.min(d, l1 * 0.45) / l1;
    const k2 = Math.min(d, l2 * 0.45) / l2;
    out.push({ x: b.x - abx * k1, y: b.y - aby * k1 });
    out.push({ x: b.x + bcx * k2, y: b.y + bcy * k2 });
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Chamfered-corner rectangle outline (copper-pour language). */
export function chamferRect(cx: number, cy: number, w: number, h: number, ch: number): Pt[] {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  return [
    { x: x0 + ch, y: y0 },
    { x: x1 - ch, y: y0 },
    { x: x1, y: y0 + ch },
    { x: x1, y: y1 - ch },
    { x: x1 - ch, y: y1 },
    { x: x0 + ch, y: y1 },
    { x: x0, y: y1 - ch },
    { x: x0, y: y0 + ch },
  ];
}

/* ————— seeded-trace occupancy (fine-cell grid, 1-cell dilation) ————— */

export function occupancy(silicon: SiliconData): Set<number> {
  const occ = new Set<number>();
  for (const t of silicon.traces) {
    for (let i = 0; i < t.points.length; i += 3) {
      const cx = Math.floor(px(t.points[i]) / CELL);
      const cy = Math.floor(py(t.points[i + 1]) / CELL);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) occ.add((cx + dx) * 1024 + (cy + dy));
      }
    }
  }
  return occ;
}

export function occupied(occ: Set<number>, x: number, y: number): boolean {
  return occ.has(Math.floor(x / CELL) * 1024 + Math.floor(y / CELL));
}

function rectScore(occ: Set<number>, x: number, y: number, w: number, h: number): number {
  let s = 0;
  for (let cx = Math.floor((x - w / 2) / CELL); cx <= Math.floor((x + w / 2) / CELL); cx++) {
    for (let cy = Math.floor((y - h / 2) / CELL); cy <= Math.floor((y + h / 2) / CELL); cy++) {
      if (occ.has(cx * 1024 + cy)) s++;
    }
  }
  return s;
}

/* ————— layout ————— */

export interface IC {
  ref: string;
  part: string;
  cx: number;
  cy: number;
  bw: number;
  bh: number;
  pins: number; // per populated side
  quad: boolean;
}

export interface PadTip {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export interface Route {
  pts: Pt[];
  w: number;
}

export interface RPad {
  x: number;
  y: number;
  r: number;
}

export interface Passive {
  x: number;
  y: number;
  horiz: boolean;
  label: string | null;
}

/** Copper pour zones as [u0, v0, u1, v1] (gaps between them are channels). */
export const POURS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.07, 0.28, 0.6, 0.9],
  [0.66, -0.22, 1.24, 0.52],
  [0.1, -0.9, 0.88, -0.4],
  [0.68, 0.6, 1.05, 0.88],
];

export const MOUNTS: Pt[] = [
  { x: px(0.82), y: py(0.6) },
  { x: px(0.7), y: py(-0.72) },
];
export const FIDUCIALS: Pt[] = [
  { x: px(0.12), y: py(0.86) },
  { x: px(0.95), y: py(-0.5) },
];

const IC_CANDS: ReadonlyArray<readonly [number, number]> = [
  [0.34, 0.58], [0.46, 0.12], [0.88, 0.16], [0.56, -0.58], [0.92, -0.32],
  [0.34, -0.24], [0.76, 0.66], [0.62, 0.36], [0.27, -0.66], [1.02, 0.02],
];

/** Place the footprints where the seeded glyph traces are least dense. */
export function placeICs(occ: Set<number>, rand: () => number): IC[] {
  const specs = [
    { ref: "U2", part: "RP2040", bw: 4.6 * CELL, bh: 4.6 * CELL, pins: 12, quad: true },
    { ref: "U1", part: "AD8226", bw: 2.3 * CELL, bh: 3.0 * CELL, pins: 4, quad: false },
    { ref: "U3", part: "MCP6002", bw: 2.2 * CELL, bh: 2.8 * CELL, pins: 4, quad: false },
  ];
  const used: IC[] = [];
  for (const s of specs) {
    const hw = s.bw / 2 + PAD_LEN + 16;
    const hh = s.bh / 2 + PAD_LEN + 16;
    let best: Pt | null = null;
    let bestScore = Infinity;
    for (const [u, v] of IC_CANDS) {
      const x = px(u) + (rand() - 0.5) * CELL;
      const y = py(v) + (rand() - 0.5) * CELL;
      if (
        !inBoard(x - hw, y - hh, 0.94) || !inBoard(x + hw, y - hh, 0.94) ||
        !inBoard(x - hw, y + hh, 0.94) || !inBoard(x + hw, y + hh, 0.94)
      ) continue;
      if (used.some((o) =>
        Math.abs(x - o.cx) < (s.bw + o.bw) / 2 + 2.5 * CELL &&
        Math.abs(y - o.cy) < (s.bh + o.bh) / 2 + 2.5 * CELL,
      )) continue;
      if (MOUNTS.some((m) => Math.abs(x - m.x) < hw + 44 && Math.abs(y - m.y) < hh + 44)) continue;
      const score = rectScore(occ, x, y, s.bw + 2 * PAD_LEN, s.bh + 2 * PAD_LEN) + rand() * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
    const at = best ?? { x: px(IC_CANDS[used.length * 3][0]), y: py(IC_CANDS[used.length * 3][1]) };
    used.push({ ref: s.ref, part: s.part, cx: at.x, cy: at.y, bw: s.bw, bh: s.bh, pins: s.pins, quad: s.quad });
  }
  return used;
}

/** Pad tip positions + outward normals (shared by drawing and fan-outs). */
export function icPads(ic: IC): PadTip[] {
  const tips: PadTip[] = [];
  const side = (nx: number, ny: number) => {
    const span = (nx !== 0 ? ic.bh : ic.bw) * 0.82;
    for (let p = 0; p < ic.pins; p++) {
      const t = ((p + 0.5) / ic.pins - 0.5) * span;
      const bx = ic.cx + nx * (ic.bw / 2) + (nx !== 0 ? 0 : t);
      const by = ic.cy + ny * (ic.bh / 2) + (ny !== 0 ? 0 : t);
      tips.push({ x: bx + nx * PAD_LEN, y: by + ny * PAD_LEN, dx: nx, dy: ny });
    }
  };
  side(1, 0);
  side(-1, 0);
  if (ic.quad) {
    side(0, 1);
    side(0, -1);
  }
  return tips;
}

/** A parallel bus: k members, shared bend ordinate → parallel 45° diagonals. */
export function addBundle(
  routes: Route[], roundPads: RPad[],
  x0: number, y0: number, ax: number, ay: number,
  k: number, pitch: number, dsign: number,
  run1: number, diag: number, run2: number,
): void {
  const sx = ay !== 0 ? 1 : 0;
  const sy = ax !== 0 ? 1 : 0;
  for (let i = 0; i < k; i++) {
    const p0 = { x: x0 + sx * pitch * i, y: y0 + sy * pitch * i };
    const p1 = { x: p0.x + ax * run1, y: p0.y + ay * run1 };
    const p2 = { x: p1.x + (ax + sx * dsign) * diag, y: p1.y + (ay + sy * dsign) * diag };
    const p3 = { x: p2.x + ax * run2, y: p2.y + ay * run2 };
    routes.push({ pts: [p0, p1, p2, p3], w: 8 });
    roundPads.push({ x: p3.x, y: p3.y, r: 7 });
  }
}

/** QFP bus bundle + per-pin fan-out stubs (some with 45° doglegs). */
export function routeFanouts(routes: Route[], roundPads: RPad[], ics: IC[], rand: () => number): void {
  for (const ic of ics) {
    const tips = icPads(ic);
    const bundled = new Set<PadTip>();
    if (ic.quad) {
      const nx = ic.cx < W / 2 ? 1 : -1;
      const sidePads = tips.filter((t) => t.dx === nx).sort((a, b) => a.y - b.y);
      const first = Math.max(0, Math.floor((sidePads.length - 5) / 2));
      const dsign = ic.cy < BCY ? 1 : -1;
      const run1 = 2.2 * CELL;
      const diag = 1.6 * CELL;
      const run2 = (2.6 + rand() * 2) * CELL;
      for (const t of sidePads.slice(first, first + 5)) {
        const p1 = { x: t.x + nx * run1, y: t.y };
        const p2 = { x: p1.x + nx * diag, y: p1.y + dsign * diag };
        const p3 = { x: p2.x + nx * run2, y: p2.y };
        routes.push({ pts: [{ x: t.x, y: t.y }, p1, p2, p3], w: 8 });
        roundPads.push({ x: p3.x, y: p3.y, r: 7 });
        bundled.add(t);
      }
    }
    for (const t of tips) {
      if (bundled.has(t) || rand() < 0.35) continue;
      const len = (0.7 + rand() * 0.9) * CELL;
      const p0 = { x: t.x, y: t.y };
      if (rand() < 0.5) {
        const p1 = { x: t.x + t.dx * len, y: t.y + t.dy * len };
        routes.push({ pts: [p0, p1], w: 7 });
        roundPads.push({ x: p1.x, y: p1.y, r: 6 });
      } else {
        const p1 = { x: t.x + t.dx * len * 0.55, y: t.y + t.dy * len * 0.55 };
        const s = rand() < 0.5 ? 1 : -1;
        const d = len * 0.6;
        const p2 = t.dx !== 0
          ? { x: p1.x + t.dx * d, y: p1.y + s * d }
          : { x: p1.x + s * d, y: p1.y + t.dy * d };
        routes.push({ pts: [p0, p1, p2], w: 7 });
        roundPads.push({ x: p2.x, y: p2.y, r: 6 });
      }
    }
  }
}

export function placePassives(occ: Set<number>, ics: IC[], rand: () => number): Passive[] {
  const LABELS = ["C4", "C7", "R12", "C11", "R3", "C9", "R7", "C16"];
  const out: Passive[] = [];
  let guard = 0;
  while (out.length < 14 && guard++ < 300) {
    const x = px(0.06 + rand() * 1.2);
    const y = py(-0.94 + rand() * 1.88);
    if (!inBoard(x, y, 0.92)) continue;
    if (occupied(occ, x, y)) continue;
    if (ics.some((ic) =>
      Math.abs(x - ic.cx) < ic.bw / 2 + 2.4 * CELL && Math.abs(y - ic.cy) < ic.bh / 2 + 2.4 * CELL,
    )) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.y - y) < 2.2 * CELL)) continue;
    if (MOUNTS.some((m) => Math.hypot(m.x - x, m.y - y) < 2.2 * CELL)) continue;
    out.push({ x, y, horiz: rand() < 0.5, label: out.length < LABELS.length ? LABELS[out.length] : null });
  }
  return out;
}

/**
 * Deterministic re-derivation of the painted IC positions (identical seed
 * and draw order as buildPcbTexture: occupancy consumes no randomness,
 * placeICs is the first consumer of mulberry32(9091)) → object-space
 * anchor points for the annotation layer, keyed by ref ("U1", "U2", "U3").
 */
export function getIcAnchors(silicon: SiliconData): Record<string, { u: number; v: number; z: number }> {
  const ics = placeICs(occupancy(silicon), mulberry32(9091));
  const out: Record<string, { u: number; v: number; z: number }> = {};
  for (const ic of ics) {
    const u = (ic.cx / W) * (PCB_U1 - PCB_U0) + PCB_U0;
    const v = 1 - (2 * ic.cy) / H;
    out[ic.ref] = { u, v, z: shellZ(u, v) + 0.05 };
  }
  return out;
}

export function placeStitching(
  occ: Set<number>, ics: IC[],
  pourPx: ReadonlyArray<readonly [number, number, number, number]>,
  rand: () => number,
): Pt[] {
  const out: Pt[] = [];
  for (const [x0, y0, x1, y1] of pourPx) {
    for (let gx = x0 + CELL; gx < x1 - 0.5 * CELL; gx += 1.7 * CELL) {
      for (let gy = y0 + CELL; gy < y1 - 0.5 * CELL; gy += 1.7 * CELL) {
        if (rand() > 0.4) continue;
        const x = gx + (rand() - 0.5) * 0.8 * CELL;
        const y = gy + (rand() - 0.5) * 0.8 * CELL;
        if (!inBoard(x, y, 0.95) || occupied(occ, x, y)) continue;
        if (ics.some((ic) =>
          Math.abs(x - ic.cx) < ic.bw / 2 + PAD_LEN + 20 && Math.abs(y - ic.cy) < ic.bh / 2 + PAD_LEN + 20,
        )) continue;
        out.push({ x, y });
        if (out.length >= 40) return out;
      }
    }
  }
  return out;
}

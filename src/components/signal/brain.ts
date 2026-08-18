/**
 * Procedural "silicon cortex" data — deterministic (seeded):
 *  - brain-ish organic POINT CLOUD (ellipsoid radii ~(1.3, 1.0, 1.1), fbm
 *    wrinkle on the shell, frontal taper, cerebellum bulge), clustered into
 *    5 regions (0 frontal, 1 temporal, 2 parietal, 3 occipital, 4 deep/stem)
 *  - short nearest-neighbor synapse edges for spike travel
 *  - a Manhattan-trace silicon hemisphere on a gently curved shell,
 *    quantized to the fine ASCII grid (block clusters 5–8, vias, junctions)
 *  - the starfield shell
 */
import * as THREE from "three";

export type SignalVariant = "silicon" | "connectome";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/* ————— deterministic value-noise fbm ————— */

function hash3(ix: number, iy: number, iz: number): number {
  const s = Math.sin(ix * 127.1 + iy * 311.7 + iz * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

function vnoise(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const c00 = lerp(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), u);
  const c10 = lerp(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), u);
  const c01 = lerp(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), u);
  const c11 = lerp(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), u);
  return lerp(lerp(c00, c10, v), lerp(c01, c11, v), w);
}

export function fbm3(x: number, y: number, z: number): number {
  return (
    vnoise(x, y, z) * 0.5 +
    vnoise(x * 2.07, y * 2.07, z * 2.07) * 0.3 +
    vnoise(x * 4.31, y * 4.31, z * 4.31) * 0.2
  );
}

/* ————— organic cloud ————— */

export interface BrainCloud {
  positions: Float32Array;
  clusters: Float32Array; // 0..4
  rands: Float32Array;
  count: number;
}

function cerebellumQ(x: number, y: number, z: number): number {
  const cx = x / 0.6;
  const cy = (y + 0.66) / 0.4;
  const cz = (z + 0.52) / 0.5;
  return cx * cx + cy * cy + cz * cz;
}

function brainQ(x: number, y: number, z: number): number {
  const taper = 1 - 0.14 * smoothstep(0.25, 1.05, z); // frontal taper
  const qx = x / (1.3 * taper);
  const qy = y / 1.0;
  const qz = z / 1.1;
  return qx * qx + qy * qy + qz * qz;
}

function insideBrain(x: number, y: number, z: number): boolean {
  const q = brainQ(x, y, z);
  const w = (fbm3(x * 2.2 + 7.7, y * 2.2, z * 2.2) - 0.5) * 0.42; // wrinkle
  if (q <= 1 + w * 0.7 && q >= 0.5 + w * 0.35) return true;
  const cb = cerebellumQ(x, y, z);
  return cb <= 1 && cb >= 0.3;
}

export function clusterOf(x: number, y: number, z: number): number {
  if (cerebellumQ(x, y, z) <= 1) return 4; // cerebellum → deep/stem
  if (brainQ(x, y, z) < 0.62) return 4; // core → deep/stem
  if (z > 0.42) return 0; // frontal
  if (z < -0.5) return 3; // occipital
  if (y > 0.28) return 2; // parietal
  return 1; // temporal
}

export function buildBrainCloud(
  target: number,
  keep: ((x: number, y: number, z: number) => boolean) | null,
  seed: number,
): BrainCloud {
  const rand = mulberry32(seed);
  const positions = new Float32Array(target * 3);
  const clusters = new Float32Array(target);
  const rands = new Float32Array(target);
  let n = 0;
  let guard = 0;
  while (n < target && guard < 400000) {
    guard++;
    const x = (rand() * 2 - 1) * 1.5;
    const y = (rand() * 2 - 1) * 1.15;
    const z = (rand() * 2 - 1) * 1.25;
    if (!insideBrain(x, y, z)) continue;
    if (keep && !keep(x, y, z)) continue;
    positions[n * 3] = x;
    positions[n * 3 + 1] = y;
    positions[n * 3 + 2] = z;
    clusters[n] = clusterOf(x, y, z);
    rands[n] = rand();
    n++;
  }
  return {
    positions: positions.subarray(0, n * 3) as Float32Array,
    clusters: clusters.subarray(0, n) as Float32Array,
    rands: rands.subarray(0, n) as Float32Array,
    count: n,
  };
}

/* ————— synapse edges (short nearest-neighbor pairs) ————— */

export function buildEdges(cloud: BrainCloud, count: number, seed: number): Uint16Array {
  const rand = mulberry32(seed);
  const { positions, count: n } = cloud;
  const out = new Uint16Array(count * 2);
  const seen = new Set<number>();
  let e = 0;
  let guard = 0;
  while (e < count && guard < count * 60) {
    guard++;
    const a = Math.floor(rand() * n);
    // approximate nearest neighbor among a random candidate set
    let best = -1;
    let bestD = 0.45 * 0.45;
    for (let k = 0; k < 48; k++) {
      const b = Math.floor(rand() * n);
      if (b === a) continue;
      const dx = positions[a * 3] - positions[b * 3];
      const dy = positions[a * 3 + 1] - positions[b * 3 + 1];
      const dz = positions[a * 3 + 2] - positions[b * 3 + 2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD && d > 0.12 * 0.12) {
        bestD = d;
        best = b;
      }
    }
    if (best < 0) continue;
    const key = a < best ? a * 65536 + best : best * 65536 + a;
    if (seen.has(key)) continue;
    seen.add(key);
    out[e * 2] = a;
    out[e * 2 + 1] = best;
    e++;
  }
  return out.subarray(0, e * 2) as Uint16Array;
}

/* ————— silicon hemisphere (Manhattan traces on a curved shell) ————— */

export const SIL_CELL = 0.038; // world units per FINE ascii cell (hero scale)
const U0 = 0.03; // seam edge → total seam gap ≈ 0.06 with organic cut at −0.03
const NX = 33;
const NY = 52;

export interface SiliconTrace {
  points: Float32Array; // step points, one per fine cell (for packets)
  block: number; // 5..8
}

export interface SiliconData {
  positions: Float32Array; // non-indexed triangles
  orients: Float32Array; // 0.25 '-', 0.5 '|', 0.75 '+', 1.0 'o'
  blocks: Float32Array; // 5..8
  traces: SiliconTrace[];
}

function cellU(ix: number): number {
  return U0 + (ix + 0.5) * SIL_CELL;
}
function cellV(iy: number): number {
  return (iy - NY / 2 + 0.5) * SIL_CELL;
}
function inSilhouette(ix: number, iy: number): boolean {
  const u = (cellU(ix) + 0.06) / 1.36;
  const v = cellV(iy) / 1.0;
  return u * u + v * v <= 1;
}
export function shellZ(u: number, v: number): number {
  const q = 1 - (u / 1.55) * (u / 1.55) - (v / 1.25) * (v / 1.25);
  return 0.42 * Math.sqrt(Math.max(q, 0.0001)) - 0.05;
}
function cellWorld(ix: number, iy: number, lift: number): [number, number, number] {
  const u = cellU(ix);
  const v = cellV(iy);
  return [u, v, shellZ(u, v) + lift];
}
function blockOf(ix: number, iy: number): number {
  return 5 + (cellU(ix) > 0.6 ? 1 : 0) + (cellV(iy) > 0 ? 0 : 2);
}

interface Emit {
  pos: number[];
  orient: number[];
  block: number[];
}

/** Axis-aligned quad centered on a cell (junctions, vias). */
function emitCellQuad(out: Emit, ix: number, iy: number, size: number, orient: number, lift: number, block: number): void {
  const [x, y, z] = cellWorld(ix, iy, lift);
  const h = (SIL_CELL * size) / 2;
  const corners = [
    [x - h, y - h], [x + h, y - h], [x + h, y + h],
    [x - h, y - h], [x + h, y + h], [x - h, y + h],
  ];
  for (const [cx, cy] of corners) {
    out.pos.push(cx, cy, z);
    out.orient.push(orient);
    out.block.push(block);
  }
}

/** Thin quad strip along a straight run of cells (subdivided for the shell). */
function emitRun(out: Emit, cells: Array<[number, number]>, horizontal: boolean, block: number): void {
  const w = SIL_CELL * 0.82;
  const step = 3;
  for (let i = 0; i < cells.length - 1; i += step) {
    const j = Math.min(i + step, cells.length - 1);
    const [ax, ay, az] = cellWorld(cells[i][0], cells[i][1], 0.002);
    const [bx, by, bz] = cellWorld(cells[j][0], cells[j][1], 0.002);
    const px = horizontal ? 0 : w / 2;
    const py = horizontal ? w / 2 : 0;
    const quad = [
      [ax - px, ay - py, az], [bx - px, by - py, bz], [bx + px, by + py, bz],
      [ax - px, ay - py, az], [bx + px, by + py, bz], [ax + px, ay + py, az],
    ];
    for (const [qx, qy, qz] of quad) {
      out.pos.push(qx, qy, qz);
      out.orient.push(horizontal ? 0.25 : 0.5);
      out.block.push(block);
    }
  }
}

/**
 * Structured channel placement: horizontal channels launched from the seam
 * plus long vertical fillers, on a 3-cell pitch. Perpendicular traces may
 * CROSS (different "layers"); a crossing cell becomes a '+' junction, as do
 * right-angle turns. Cell states: 0 empty, 1 horizontal, 2 vertical, 3 node.
 */
export function buildSilicon(seed: number): SiliconData {
  const rand = mulberry32(seed);
  const grid = new Uint8Array(NX * NY);
  const at = (ix: number, iy: number) => grid[iy * NX + ix];
  const inBounds = (ix: number, iy: number) =>
    ix >= 0 && iy >= 0 && ix < NX && iy < NY && inSilhouette(ix, iy);
  /** May a run of this orientation enter the cell? (crossing perp is fine) */
  const enterable = (ix: number, iy: number, horizontal: boolean): boolean => {
    if (!inBounds(ix, iy)) return false;
    const v = at(ix, iy);
    if (v === 3) return false;
    if (horizontal) {
      if (v === 1) return false;
      // lateral clearance against parallel traces only
      if (iy > 0 && at(ix, iy - 1) === 1) return false;
      if (iy < NY - 1 && at(ix, iy + 1) === 1) return false;
    } else {
      if (v === 2) return false;
      if (ix > 0 && at(ix - 1, iy) === 2) return false;
      if (ix < NX - 1 && at(ix + 1, iy) === 2) return false;
    }
    return true;
  };

  const out: Emit = { pos: [], orient: [], block: [] };
  const traces: SiliconTrace[] = [];

  interface Walk {
    path: Array<[number, number]>;
    runs: Array<{ cells: Array<[number, number]>; horizontal: boolean }>;
    nodes: Array<[number, number]>; // turns + crossings
    marks: Array<{ idx: number; prev: number }>;
  }

  const step = (w: Walk, ix: number, iy: number, horizontal: boolean): void => {
    const idx = iy * NX + ix;
    const prev = grid[idx];
    w.marks.push({ idx, prev });
    if (prev === 0) {
      grid[idx] = horizontal ? 1 : 2;
    } else {
      grid[idx] = 3; // crossing → junction node
      w.nodes.push([ix, iy]);
    }
    w.path.push([ix, iy]);
    w.runs[w.runs.length - 1].cells.push([ix, iy]);
  };

  const rollback = (w: Walk): void => {
    for (let i = w.marks.length - 1; i >= 0; i--) grid[w.marks[i].idx] = w.marks[i].prev;
  };

  const commit = (w: Walk): void => {
    const mid = w.path[Math.floor(w.path.length / 2)];
    const block = blockOf(mid[0], mid[1]);
    for (const r of w.runs) if (r.cells.length > 1) emitRun(out, r.cells, r.horizontal, block);
    for (const [jx, jy] of w.nodes) emitCellQuad(out, jx, jy, 0.95, 0.75, 0.006, block);
    emitCellQuad(out, w.path[0][0], w.path[0][1], 0.8, 1.0, 0.008, block); // vias
    emitCellQuad(out, w.path[w.path.length - 1][0], w.path[w.path.length - 1][1], 0.8, 1.0, 0.008, block);
    const pts = new Float32Array(w.path.length * 3);
    for (let i = 0; i < w.path.length; i++) {
      const [wx, wy, wz] = cellWorld(w.path[i][0], w.path[i][1], 0.012);
      pts[i * 3] = wx;
      pts[i * 3 + 1] = wy;
      pts[i * 3 + 2] = wz;
    }
    traces.push({ points: pts, block });
  };

  const walkRun = (
    w: Walk,
    sx: number,
    sy: number,
    dx: number,
    dy: number,
    target: number,
  ): [number, number, number] => {
    let ix = sx;
    let iy = sy;
    let n = 0;
    while (n < target && enterable(ix + dx, iy + dy, dy === 0)) {
      ix += dx;
      iy += dy;
      step(w, ix, iy, dy === 0);
      n++;
    }
    return [ix, iy, n];
  };

  const newWalk = (ix: number, iy: number, horizontal: boolean): Walk | null => {
    if (!enterable(ix, iy, horizontal)) return null;
    const w: Walk = { path: [], runs: [{ cells: [], horizontal }], nodes: [], marks: [] };
    step(w, ix, iy, horizontal);
    return w;
  };

  // — horizontal channels launched from the seam (3-cell pitch) —
  for (let iy = 2; iy < NY - 2; iy += 3) {
    if (rand() < 0.22) continue; // leave breathing gaps
    const w = newWalk(0, iy, true);
    if (!w) continue;
    // extent available to the silhouette edge from the seam
    let extent = 0;
    while (inBounds(1 + extent, iy) && extent < NX) extent++;
    if (extent < 12) {
      rollback(w); // too tight even for a cap connector
      continue;
    }
    const len = extent >= 27 ? 18 + Math.floor(rand() * (extent - 18)) : extent - 1;
    let [ix2, iy2] = walkRun(w, 0, iy, 1, 0, len);
    if (w.path.length < 10) {
      rollback(w);
      continue;
    }
    if (rand() < 0.72) {
      // right-angle turn north/south to a via
      const dy = rand() < 0.5 ? 1 : -1;
      w.nodes.push([ix2, iy2]);
      w.runs.push({ cells: [[ix2, iy2]], horizontal: false });
      [ix2, iy2] = walkRun(w, ix2, iy2, 0, dy, 4 + Math.floor(rand() * 14));
    }
    commit(w);
  }

  // — long vertical fillers (3-cell pitch, offset from the seam) —
  for (let ix = 3; ix < NX - 1; ix += 3) {
    if (rand() < 0.3) continue;
    // find the vertical span inside the silhouette at this column
    let top = -1;
    let bottom = -1;
    for (let iy = 0; iy < NY; iy++) {
      if (inBounds(ix, iy)) {
        if (top < 0) top = iy;
        bottom = iy;
      }
    }
    if (top < 0 || bottom - top < 24) continue;
    const startY = top + 1 + Math.floor(rand() * 3);
    const w = newWalk(ix, startY, false);
    if (!w) continue;
    const target = 22 + Math.floor(rand() * 24);
    let [ix2, iy2] = walkRun(w, ix, startY, 0, 1, target);
    if (w.path.length < 16) {
      rollback(w);
      continue;
    }
    if (rand() < 0.6) {
      const dx = rand() < 0.5 ? 1 : -1;
      w.nodes.push([ix2, iy2]);
      w.runs.push({ cells: [[ix2, iy2]], horizontal: true });
      [ix2, iy2] = walkRun(w, ix2, iy2, dx, 0, 4 + Math.floor(rand() * 10));
    }
    commit(w);
  }

  return {
    positions: new Float32Array(out.pos),
    orients: new Float32Array(out.orient),
    blocks: new Float32Array(out.block),
    traces,
  };
}

/* ————— assembled per-variant data ————— */

export interface BrainData {
  variant: SignalVariant;
  cloud: BrainCloud;
  edges: Uint16Array;
  silicon: SiliconData | null;
}

export function buildBrainData(variant: SignalVariant): BrainData {
  // v3: the solid surface mesh carries the image — the cloud is only a
  // light cortical sprinkle + the anchor set for synapse edges.
  if (variant === "connectome") {
    const cloud = buildBrainCloud(900, null, 1013);
    return { variant, cloud, edges: buildEdges(cloud, 180, 2027), silicon: null };
  }
  // silicon: organic LEFT hemisphere (viewer's left = −x), silicon right
  const cloud = buildBrainCloud(550, (x) => x <= -0.03, 1013);
  return { variant, cloud, edges: buildEdges(cloud, 180, 2027), silicon: buildSilicon(3301) };
}

/* ————— starfield positions (v3 renders them as glyph-sized quads) ————— */

export const STAR_COUNT = 180;

export function createStarPositions(count: number): Float32Array {
  const rand = mulberry32(9001);
  const positions = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
    if (v.lengthSq() < 1e-6) v.set(0, 0, -1);
    v.normalize().multiplyScalar(12 + rand() * 18);
    if (v.z > 0 && rand() < 0.6) v.z *= -1; // bias behind
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
  }
  return positions;
}

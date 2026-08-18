/**
 * SpikeSystem — traveling neural packets.
 * Organic spikes ride synapse edges (500–800 ms, bright head + short trail);
 * on the silicon variant, spikes finishing near the seam hand off into
 * packets that step along a silicon trace cell-by-cell (~30 cells/s).
 * The pulse-envelope clock in the driver schedules bursts via
 * fs.spikeBurstSeq; focus "sparse-emg" bursts packets via fs.focusPacketSeq.
 * All positions are object-space — the mesh is parented under the cortex
 * spin group by Cortex.
 */
import * as THREE from "three";
import { SPARK_VERT, SPARK_FRAG } from "./shaders";
import type { BrainData } from "./brain";
import type { FieldState } from "./state";

const CAP = 64;
const MAX_SPIKES = 4;
const MAX_PACKETS = 4;
const SPIKE_TRAIL = 3;
const PACKET_TRAIL = 6;
const PACKET_CELLS_PER_S = 30;

interface Spike {
  active: boolean;
  edge: number;
  t: number;
  dur: number;
}

interface Packet {
  active: boolean;
  trace: number;
  step: number;
}

export class SpikeSystem {
  readonly mesh: THREE.InstancedMesh;
  private readonly data: BrainData;
  private readonly spikes: Spike[] = [];
  private readonly packets: Packet[] = [];
  private lastBurst = 0;
  private lastFocusPacket = 0;
  private readonly geo: THREE.PlaneGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private readonly m = new THREE.Matrix4();
  private readonly cHead = new THREE.Color();
  private readonly c = new THREE.Color();

  constructor(data: BrainData) {
    this.data = data;
    for (let i = 0; i < MAX_SPIKES; i++) this.spikes.push({ active: false, edge: 0, t: 0, dur: 0.6 });
    for (let i = 0; i < MAX_PACKETS; i++) this.packets.push({ active: false, trace: 0, step: 0 });
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: SPARK_VERT,
      fragmentShader: SPARK_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(this.geo, this.mat, CAP);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < CAP; i++) mesh.setMatrixAt(i, zero);
    mesh.instanceMatrix.needsUpdate = true;
    this.mesh = mesh;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    this.mesh.dispose();
  }

  /** Most-active cluster in [lo, hi], or −1 when nothing exceeds 0.35. */
  private argmaxAct(fs: FieldState, lo: number, hi: number): number {
    let best = -1;
    let bestV = 0.35;
    for (let i = lo; i <= hi; i++) {
      if (fs.clusterAct[i] > bestV) {
        bestV = fs.clusterAct[i];
        best = i;
      }
    }
    return best;
  }

  private spawnSpike(fs: FieldState): void {
    const slot = this.spikes.find((s) => !s.active);
    if (!slot) return;
    const { edges } = this.data;
    const edgeCount = edges.length / 2;
    if (edgeCount === 0) return;
    const activeC = this.argmaxAct(fs, 0, 4);
    let pick = Math.floor(Math.random() * edgeCount);
    if (activeC >= 0) {
      for (let k = 0; k < 8; k++) {
        const e = Math.floor(Math.random() * edgeCount);
        const ca = this.data.cloud.clusters[edges[e * 2]];
        const cb = this.data.cloud.clusters[edges[e * 2 + 1]];
        if (ca === activeC || cb === activeC) {
          pick = e;
          break;
        }
      }
    }
    slot.active = true;
    slot.edge = pick;
    slot.t = 0;
    slot.dur = 0.5 + Math.random() * 0.3;
  }

  private spawnPacket(fs: FieldState): void {
    const sil = this.data.silicon;
    if (!sil || sil.traces.length === 0) return;
    const slot = this.packets.find((p) => !p.active);
    if (!slot) return;
    const activeB = this.argmaxAct(fs, 5, 8);
    let pool = sil.traces.map((_, i) => i);
    if (activeB >= 0) {
      const filtered = pool.filter((i) => sil.traces[i].block === activeB);
      if (filtered.length > 0) pool = filtered;
    }
    slot.active = true;
    slot.trace = pool[Math.floor(Math.random() * pool.length)];
    slot.step = 0;
  }

  update(fs: FieldState, dt: number): void {
    // burst clocks
    if (fs.spikeBurstSeq !== this.lastBurst) {
      this.lastBurst = fs.spikeBurstSeq;
      this.spawnSpike(fs);
      if (Math.random() < 0.4) this.spawnSpike(fs);
    }
    if (fs.focusPacketSeq !== this.lastFocusPacket) {
      this.lastFocusPacket = fs.focusPacketSeq;
      this.spawnPacket(fs);
      this.spawnPacket(fs);
      if (Math.random() < 0.5) this.spawnPacket(fs);
    }

    const { mesh, m, c, cHead } = this;
    const colors = mesh.instanceColor as THREE.InstancedBufferAttribute;
    const pos = this.data.cloud.positions;
    const edges = this.data.edges;
    cHead.copy(fs.accent).lerp(WHITE, 0.35).multiplyScalar(2.1);
    let idx = 0;
    const put = (x: number, y: number, z: number, s: number, col: THREE.Color) => {
      if (idx >= CAP) return;
      m.set(s, 0, 0, x, 0, s, 0, y, 0, 0, s, z, 0, 0, 0, 1);
      mesh.setMatrixAt(idx, m);
      colors.setXYZ(idx, col.r, col.g, col.b);
      idx++;
    };

    // organic spikes
    for (const s of this.spikes) {
      if (!s.active) continue;
      s.t += dt / s.dur;
      const a = edges[s.edge * 2] * 3;
      const b = edges[s.edge * 2 + 1] * 3;
      if (s.t >= 1) {
        s.active = false;
        // seam handoff: continue into a silicon trace as a stepping packet
        if (this.data.silicon && pos[b] > -0.32 && Math.random() < 0.65) this.spawnPacket(fs);
        continue;
      }
      for (let k = 0; k <= SPIKE_TRAIL; k++) {
        const tt = Math.max(0, s.t - k * 0.09);
        const e = tt * tt * (3 - 2 * tt); // ease
        const x = pos[a] + (pos[b] - pos[a]) * e;
        const y = pos[a + 1] + (pos[b + 1] - pos[a + 1]) * e;
        const z = pos[a + 2] + (pos[b + 2] - pos[a + 2]) * e;
        const fall = k === 0 ? 1 : 0.5 / k;
        c.copy(cHead).multiplyScalar(fall);
        put(x, y, z, k === 0 ? 0.055 : 0.04 - k * 0.006, c);
      }
    }

    // silicon packets
    const sil = this.data.silicon;
    if (sil) {
      for (const p of this.packets) {
        if (!p.active) continue;
        p.step += PACKET_CELLS_PER_S * dt;
        const pts = sil.traces[p.trace].points;
        const last = pts.length / 3 - 1;
        if (p.step >= last) {
          p.active = false;
          continue;
        }
        for (let k = 0; k <= PACKET_TRAIL; k++) {
          const st = Math.max(0, p.step - k);
          const i0 = Math.floor(st);
          const f = st - i0;
          const j = i0 * 3;
          const x = pts[j] + (pts[j + 3] - pts[j]) * f;
          const y = pts[j + 1] + (pts[j + 4] - pts[j + 1]) * f;
          const z = pts[j + 2] + (pts[j + 5] - pts[j + 2]) * f;
          const fall = k === 0 ? 1 : Math.pow(0.58, k);
          c.copy(cHead).multiplyScalar(fall);
          put(x, y, z, k === 0 ? 0.05 : 0.038, c);
        }
      }
    }

    // clear the rest of the pool
    for (; idx < CAP; idx++) {
      m.makeScale(0, 0, 0);
      mesh.setMatrixAt(idx, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    colors.needsUpdate = true;
  }
}

const WHITE = new THREE.Color(1, 1, 1);

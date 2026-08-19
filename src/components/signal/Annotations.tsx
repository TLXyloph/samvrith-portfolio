"use client";

/**
 * AnnotationPublisher — projects object-space anatomy/silicon anchor
 * points through the camera each frame and publishes 3D-anchored labels
 * (id / text / CSS-px x,y / eased opacity) into the FROZEN annotationBus.
 * Labels follow the v5 section poses: they fade in once the pose spring
 * settles, fade out during transit, hide on the far side of the brain
 * (anchor normal · view test), and at most 2 are visible at once.
 * Publishes are throttled to meaningful changes (>0.5 px / >0.02 opacity).
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { setAnnotations, type Annotation } from "./annotationBus";
import { getIcAnchors } from "./pcbLayout";
import type { BrainData } from "./brain";
import type { FieldState } from "./state";

interface Anchor {
  p: THREE.Vector3;
  n: THREE.Vector3; // outward surface normal (facing test)
}

interface LabelDef {
  id: string;
  text: string;
  anchor: string;
}

function mk(x: number, y: number, z: number, nx: number, ny: number, nz: number): Anchor {
  return { p: new THREE.Vector3(x, y, z), n: new THREE.Vector3(nx, ny, nz).normalize() };
}

/** Object-space anchors in the rotating rig's frame (spin space). */
function buildAnchors(data: BrainData): Record<string, Anchor> {
  const silicon = data.variant === "silicon";
  const anchors: Record<string, Anchor> = {
    frontal: mk(-0.52, 0.32, 1.02, -0.25, 0.25, 1),
    temporal: mk(-1.18, -0.18, 0.28, -1, -0.15, 0.25),
    parietal: mk(-0.55, 0.9, 0.05, -0.35, 1, 0.05),
    occipital: mk(-0.58, 0.22, -1.0, -0.3, 0.2, -1),
    cerebellum: silicon
      ? mk(-0.74, -0.9, -0.8, -0.6, -0.65, -0.5)
      : mk(-0.35, -0.92, -0.82, -0.4, -0.7, -0.6),
    brainstem: silicon
      ? mk(-0.3, -1.2, -0.42, -0.4, -1, -0.3)
      : mk(0, -1.28, -0.45, 0, -1, -0.35),
    seam: mk(0, 0.9, 0.35, 0, 1, 0.3),
  };
  if (data.silicon) {
    // the painted footprints, re-derived deterministically (same seed)
    const ics = getIcAnchors(data.silicon);
    if (ics.U1) anchors.u1 = mk(ics.U1.u, ics.U1.v, ics.U1.z, 0.1, 0, 1);
    if (ics.U2) anchors.u2 = mk(ics.U2.u, ics.U2.v, ics.U2.z, 0.1, 0, 1);
  }
  return anchors;
}

/** Per-section label copy (indices match the choreography stops). */
const SECTION_LABELS: ReadonlyArray<ReadonlyArray<LabelDef>> = [
  [
    { id: "rest", text: "[cortex · resting state]", anchor: "temporal" },
    { id: "afe", text: "[2-ch afe · silicon]", anchor: "u2" },
  ],
  [{ id: "frontal", text: "[frontal cortex · planning]", anchor: "frontal" }],
  [{ id: "temporal", text: "[temporal lobe]", anchor: "temporal" }],
  [{ id: "storm", text: "[spike storm · synops]", anchor: "seam" }],
  [{ id: "occipital", text: "[occipital lobe]", anchor: "occipital" }],
  [{ id: "sync", text: "[global synchrony]", anchor: "seam" }],
];

const FOCUS_LABELS: Record<"sparse-emg" | "neuromcp", LabelDef> = {
  "sparse-emg": { id: "emg", text: "[U1 AD8226 · emg afe]", anchor: "u1" },
  neuromcp: { id: "mcp", text: "[parietal cortex · motor imagery]", anchor: "parietal" },
};

interface LabelState {
  o: number;
  x: number;
  y: number;
  text: string;
}

export function AnnotationPublisher({ fs, data }: { fs: FieldState; data: BrainData }) {
  const anchors = useMemo(() => buildAnchors(data), [data]);
  const states = useRef(new Map<string, LabelState>());
  const last = useRef<readonly Annotation[]>([]);
  const tmp = useMemo(
    () => ({ w: new THREE.Vector3(), n: new THREE.Vector3(), view: new THREE.Vector3() }),
    [],
  );

  // never leave stale labels behind when the field unmounts/remounts
  useEffect(
    () => () => {
      setAnnotations([]);
    },
    [],
  );

  useFrame((state) => {
    const spin = fs.spinObj;
    if (!spin || !fs.annotationsOn) {
      states.current.clear();
      if (last.current.length) {
        setAnnotations([]);
        last.current = [];
      }
      return;
    }
    spin.updateWorldMatrix(true, false); // fresh pose (set this frame)

    // desired labels: an active focus overrides the section's list
    let defs: ReadonlyArray<LabelDef> = SECTION_LABELS[fs.section] ?? [];
    if (fs.focus) {
      const f = FOCUS_LABELS[fs.focus];
      if (anchors[f.anchor]) defs = [f]; // connectome keeps the section list
    }

    const kIn = fs.reduced ? 1 : 1 - Math.exp(-6 * Math.max(fs.dt, 1e-3));
    const kOut = fs.reduced ? 1 : 1 - Math.exp(-9 * Math.max(fs.dt, 1e-3));
    const seen = new Set<string>();
    for (const def of defs) {
      const anchor = anchors[def.anchor];
      if (!anchor) continue;
      seen.add(def.id);
      tmp.w.copy(anchor.p).applyMatrix4(spin.matrixWorld);
      tmp.n.copy(anchor.n).transformDirection(spin.matrixWorld);
      tmp.view.copy(tmp.w).sub(state.camera.position).normalize();
      const facing = -tmp.n.dot(tmp.view);
      let f = (facing + 0.25) / 0.3; // far side → hidden, lateral → kept
      f = f < 0 ? 0 : f > 1 ? 1 : f;
      const fade = f * f * (3 - 2 * f);
      tmp.w.project(state.camera);
      const x = (tmp.w.x * 0.5 + 0.5) * state.size.width;
      const y = (-tmp.w.y * 0.5 + 0.5) * state.size.height;
      const target = (fs.settled ? 1 : 0) * fade; // in only once settled
      let st = states.current.get(def.id);
      if (!st) {
        st = { o: 0, x, y, text: def.text };
        states.current.set(def.id, st);
      }
      st.text = def.text;
      st.x = x;
      st.y = y;
      st.o += (target - st.o) * (target > st.o ? kIn : kOut);
    }
    // labels no longer wanted decay out, then drop
    for (const [id, st] of states.current) {
      if (seen.has(id)) continue;
      st.o += (0 - st.o) * kOut;
      if (st.o < 0.01) states.current.delete(id);
    }

    const list: Annotation[] = [];
    for (const [id, st] of states.current) {
      if (st.o > 0.02) list.push({ id, text: st.text, x: st.x, y: st.y, opacity: st.o });
    }
    list.sort((a, b) => b.opacity - a.opacity);
    const capped = list.slice(0, 2); // max 2 visible at once

    const prev = last.current;
    const changed =
      capped.length !== prev.length ||
      capped.some((a, i) => {
        const b = prev[i];
        return (
          !b ||
          a.id !== b.id ||
          a.text !== b.text ||
          Math.abs(a.x - b.x) > 0.5 ||
          Math.abs(a.y - b.y) > 0.5 ||
          Math.abs(a.opacity - b.opacity) > 0.02
        );
      });
    if (changed) {
      setAnnotations(capped);
      last.current = capped;
    }
  }, 0.5);

  return null;
}

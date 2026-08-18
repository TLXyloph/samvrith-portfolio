"use client";

/* eslint-disable react-hooks/immutability --
 * r3f idiom: ring-buffer mote state + instance buffers are mutated inside
 * useFrame callbacks (rAF loop), never during render. */

/**
 * Pointer motes v3 — ASCII citizens. Each mote is sized ≈1 coarse cell at
 * its depth so it reads as ONE character; its luminance decays through the
 * whole ramp over its life (x → + → = → : → .) with a subtle ±1-tier
 * flicker (~3 Hz) for a shifting-character shimmer. Emits ~14/s while the
 * pointer moves, life 2.5–5 s, slow upward drift, cap 48. No emission on
 * coarse pointers or reduced motion.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SPARK_VERT, SPARK_FRAG } from "./shaders";
import type { FieldState } from "./state";

const MAX = 48;
const EMIT_PLANE_Z = 2;
const MIN_INTERVAL = 0.071; // s between emissions (≈14/s)
const TAN_HALF_FOV = Math.tan((42 * Math.PI) / 360);

interface MoteAssets {
  mesh: THREE.InstancedMesh;
  pos: Float32Array;
  vel: Float32Array;
  age: Float32Array;
  life: Float32Array;
  size: Float32Array;
  phase: Float32Array;
  dispose: () => void;
}

function buildMotes(): MoteAssets {
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.ShaderMaterial({
    vertexShader: SPARK_VERT,
    fragmentShader: SPARK_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  mesh.layers.set(1); // glyph citizen: rendered after the underlayer blit
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < MAX; i++) mesh.setMatrixAt(i, zero);
  mesh.instanceMatrix.needsUpdate = true;
  return {
    mesh,
    pos: new Float32Array(MAX * 3),
    vel: new Float32Array(MAX * 3),
    age: new Float32Array(MAX).fill(99),
    life: new Float32Array(MAX).fill(1),
    size: new Float32Array(MAX),
    phase: new Float32Array(MAX),
    dispose: () => {
      geo.dispose();
      mat.dispose();
      mesh.dispose();
    },
  };
}

const COL_A = new THREE.Color("#a78bfa");
const COL_B = new THREE.Color("#8b9cf5");

export function Motes({ fs }: { fs: FieldState }) {
  const assets = useMemo(() => buildMotes(), []);
  useEffect(() => () => assets.dispose(), [assets]);

  const head = useRef(0);
  const lastEmit = useRef(-1);
  const tmpV = useRef(new THREE.Vector3());
  const tmpM = useRef(new THREE.Matrix4());
  const tmpC = useRef(new THREE.Color());

  useFrame((state, delta) => {
    const dt = Math.min(Math.max(delta, 0), 0.05);
    const { mesh, pos, vel, age, life, size, phase } = assets;

    // — emission: only while the pointer is actually moving —
    const moving = fs.pointerActive && fs.pointerSpeed > 40;
    if (fs.fine && !fs.reduced && moving && fs.time - lastEmit.current >= MIN_INTERVAL) {
      const camera = state.camera;
      const v = tmpV.current.set(fs.pointerNdc.x, fs.pointerNdc.y, 0.5).unproject(camera);
      v.sub(camera.position).normalize();
      const t = Math.abs(v.z) > 1e-5 ? (EMIT_PLANE_Z - camera.position.z) / v.z : -1;
      if (t > 0 && Number.isFinite(t)) {
        lastEmit.current = fs.time;
        const i = head.current;
        head.current = (i + 1) % MAX;
        const j = i * 3;
        pos[j] = camera.position.x + v.x * t + (Math.random() - 0.5) * 0.05;
        pos[j + 1] = camera.position.y + v.y * t + (Math.random() - 0.5) * 0.05;
        pos[j + 2] = EMIT_PLANE_Z;
        const speed = 0.04 + Math.random() * 0.08; // slow drift, upward bias
        const ang = Math.random() * Math.PI * 2;
        vel[j] = Math.cos(ang) * speed * 0.45;
        vel[j + 1] = Math.abs(Math.sin(ang)) * speed * 0.6 + speed * 0.4;
        vel[j + 2] = (Math.random() - 0.5) * speed * 0.3;
        age[i] = 0;
        life[i] = 2.5 + Math.random() * 2.5;
        phase[i] = Math.random() * Math.PI * 2;
        // ≈1 coarse cell at this depth → the mote IS one character
        const dist = t; // ray length ≈ camera distance to the emit plane
        const cellWorld = (fs.cellPx / Math.max(1, state.size.height)) * 2 * TAN_HALF_FOV * dist;
        size[i] = cellWorld * (0.85 + Math.random() * 0.2);
      }
    }

    // — update —
    const m = tmpM.current;
    const c = tmpC.current;
    const colors = mesh.instanceColor as THREE.InstancedBufferAttribute;
    for (let i = 0; i < MAX; i++) {
      const j = i * 3;
      if (age[i] < life[i]) {
        age[i] += dt;
        pos[j] += vel[j] * dt;
        pos[j + 1] += vel[j + 1] * dt;
        pos[j + 2] += vel[j + 2] * dt;
        const lt = Math.min(age[i] / life[i], 1);
        // luminance walks DOWN the whole ramp: start ~tier 6–7 → blank,
        // with a ±1-tier flicker at ~3 Hz
        const easeIn = Math.min(1, lt / 0.08);
        const decay = Math.pow(1 - lt, 1.6);
        const flicker = 1 + 0.16 * Math.sin(fs.time * 19 + phase[i]);
        const b = 4.5 * easeIn * decay * flicker;
        m.set(size[i], 0, 0, pos[j], 0, size[i], 0, pos[j + 1], 0, 0, size[i], pos[j + 2], 0, 0, 0, 1);
        mesh.setMatrixAt(i, m);
        c.copy(COL_A).lerp(COL_B, lt).multiplyScalar(b);
        colors.setXYZ(i, c.r, c.g, c.b);
      } else if (age[i] < 98) {
        age[i] = 99;
        m.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, m);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    colors.needsUpdate = true;
  });

  return <primitive object={assets.mesh} dispose={null} />;
}

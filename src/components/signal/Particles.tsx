"use client";

/* eslint-disable react-hooks/immutability --
 * r3f idiom: ring-buffer particle state + instance buffers are mutated
 * inside useFrame callbacks (rAF loop), never during render. */

/**
 * Pointer glyph particles — ~300 billboarded quads emitted from the cursor,
 * living INSIDE the scene (pre-quantization) so they land on the top of the
 * ASCII ramp. Ring-buffer emission; the cursor is unprojected onto the
 * world plane z=2 with the CURRENT camera each frame so tracking stays
 * glued while orbiting. No emission on coarse pointers or reduced motion.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PARTICLE_VERT, PARTICLE_FRAG } from "./shaders";
import type { FieldState } from "./state";

const MAX = 300;
const BASE_SIDE = 0.035;
const EMIT_PLANE_Z = 2;

interface ParticleAssets {
  mesh: THREE.InstancedMesh;
  pos: Float32Array;
  vel: Float32Array;
  age: Float32Array;
  life: Float32Array;
  dispose: () => void;
}

function buildParticles(): ParticleAssets {
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.ShaderMaterial({
    vertexShader: PARTICLE_VERT,
    fragmentShader: PARTICLE_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < MAX; i++) mesh.setMatrixAt(i, zero);
  mesh.instanceMatrix.needsUpdate = true;
  return {
    mesh,
    pos: new Float32Array(MAX * 3),
    vel: new Float32Array(MAX * 3),
    age: new Float32Array(MAX).fill(1),
    life: new Float32Array(MAX).fill(0.0001),
    dispose: () => {
      geo.dispose();
      mat.dispose();
      mesh.dispose();
    },
  };
}

const COL_A = new THREE.Color("#f9a8d4");
const COL_B = new THREE.Color("#8b9cf5");

export function Particles({ fs }: { fs: FieldState }) {
  const assets = useMemo(() => buildParticles(), []);
  useEffect(() => () => assets.dispose(), [assets]);

  const head = useRef(0);
  const pending = useRef(0);
  const world = useRef(new THREE.Vector3());
  const prevWorld = useRef(new THREE.Vector3());
  const hasPrev = useRef(false);
  const tmpV = useRef(new THREE.Vector3());
  const tmpM = useRef(new THREE.Matrix4());
  const tmpC = useRef(new THREE.Color());

  useFrame((state, delta) => {
    const dt = Math.min(Math.max(delta, 0), 0.05);
    const { mesh, pos, vel, age, life } = assets;

    // — emission —
    if (fs.fine && !fs.reduced && fs.pointerActive && dt > 0) {
      const camera = state.camera as THREE.PerspectiveCamera;
      // unproject cursor NDC onto plane z = EMIT_PLANE_Z with the current camera
      const v = tmpV.current.set(fs.pointerNdc.x, fs.pointerNdc.y, 0.5).unproject(camera);
      v.sub(camera.position).normalize();
      const denom = v.z;
      const t = Math.abs(denom) > 1e-5 ? (EMIT_PLANE_Z - camera.position.z) / denom : -1;
      if (t > 0 && Number.isFinite(t)) {
        world.current.copy(camera.position).addScaledVector(v, t);
        const pw = prevWorld.current;
        const inheritX = hasPrev.current ? ((world.current.x - pw.x) / dt) * 0.15 : 0;
        const inheritY = hasPrev.current ? ((world.current.y - pw.y) / dt) * 0.15 : 0;
        pw.copy(world.current);
        hasPrev.current = true;

        const rate = Math.min(fs.pointerSpeed * 0.12, 120); // particles/s, cap 120
        pending.current += rate * dt;
        let n = Math.floor(pending.current);
        pending.current -= n;
        if (n > 24) n = 24; // per-frame safety cap
        for (let k = 0; k < n; k++) {
          const i = head.current;
          head.current = (i + 1) % MAX;
          const j = i * 3;
          const px = world.current.x + (Math.random() - 0.5) * 0.12;
          const py = world.current.y + (Math.random() - 0.5) * 0.12;
          pos[j] = px;
          pos[j + 1] = py;
          pos[j + 2] = EMIT_PLANE_Z;
          const rl = Math.hypot(px, py) || 1;
          const clampI = (x: number) => Math.max(-1.2, Math.min(1.2, x));
          vel[j] = clampI(inheritX) + (Math.random() - 0.5) * 0.3 + (px / rl) * 0.12;
          vel[j + 1] = clampI(inheritY) + (Math.random() - 0.5) * 0.3 + (py / rl) * 0.12;
          vel[j + 2] = (Math.random() - 0.5) * 0.12;
          age[i] = 0;
          life[i] = 0.7 + Math.random() * 0.7;
        }
      }
    } else {
      hasPrev.current = false;
    }

    // — update + write instance data —
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
        const ease = 1 - lt * lt * (3 - 2 * lt); // scale eases out to 0
        const s = BASE_SIDE * ease;
        m.set(s, 0, 0, pos[j], 0, s, 0, pos[j + 1], 0, 0, s, pos[j + 2], 0, 0, 0, 1);
        mesh.setMatrixAt(i, m);
        c.copy(COL_A).lerp(COL_B, lt).multiplyScalar(2.4 * (1 - 0.25 * lt));
        colors.setXYZ(i, c.r, c.g, c.b);
      } else if (age[i] < life[i] + 1) {
        age[i] = life[i] + 2; // retire once: zero out and skip next frames
        m.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, m);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    colors.needsUpdate = true;
  });

  return <primitive object={assets.mesh} dispose={null} />;
}

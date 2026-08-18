"use client";

/* eslint-disable react-hooks/immutability --
 * r3f idiom: transient field-state + three.js objects are mutated inside
 * useFrame callbacks (rAF loop), never during render. */

/**
 * Cortex — the v2 scene: organic brain point cloud (glyph dust), dim
 * synapse edges, the Manhattan-trace silicon hemisphere (display + an
 * isolated orientation-ID scene for the dual-res ASCII pass), the spike
 * system, and the starfield. All PRE-quantization.
 */
import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  POINT_VERT,
  POINT_FRAG,
  TRACE_VERT,
  TRACE_FRAG,
  TRACE_ID_VERT,
  TRACE_ID_FRAG,
} from "./shaders";
import { createStarGeometry, type BrainData } from "./brain";
import { SpikeSystem } from "./Spikes";
import type { FieldState } from "./state";

interface CortexAssets {
  root: THREE.Group;
  brainRig: THREE.Group;
  spin: THREE.Group;
  starRig: THREE.Group;
  pointsMat: THREE.ShaderMaterial;
  traceMat: THREE.ShaderMaterial | null;
  idScene: THREE.Scene | null;
  idGroup: THREE.Group | null;
  spikes: SpikeSystem;
  dispose: () => void;
}

function buildCortex(data: BrainData, fs: FieldState): CortexAssets {
  const rig = new THREE.Group();
  const spin = new THREE.Group();
  rig.add(spin);

  // — organic point cloud —
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute("position", new THREE.BufferAttribute(data.cloud.positions, 3));
  pgeo.setAttribute("aCluster", new THREE.BufferAttribute(data.cloud.clusters, 1));
  pgeo.setAttribute("aRand", new THREE.BufferAttribute(data.cloud.rands, 1));
  const pointsMat = new THREE.ShaderMaterial({
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uSync: { value: 0 },
      uPointPx: { value: 14 },
      uClusterAct: { value: fs.clusterAct }, // live reference — uploads each frame
      uAccent: { value: new THREE.Color("#8b9cf5") },
      uColA: { value: new THREE.Color("#8b9cf5") },
      uColB: { value: new THREE.Color("#a78bfa") },
    },
  });
  const points = new THREE.Points(pgeo, pointsMat);
  points.frustumCulled = false;
  spin.add(points);

  // — synapse edges: hairlines at/below the first ramp step —
  const egeo = new THREE.BufferGeometry();
  const epos = new Float32Array(data.edges.length * 3);
  for (let i = 0; i < data.edges.length; i++) {
    const p = data.edges[i] * 3;
    epos[i * 3] = data.cloud.positions[p];
    epos[i * 3 + 1] = data.cloud.positions[p + 1];
    epos[i * 3 + 2] = data.cloud.positions[p + 2];
  }
  egeo.setAttribute("position", new THREE.BufferAttribute(epos, 3));
  const edgeMat = new THREE.LineBasicMaterial({
    color: new THREE.Color("#232840"),
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const edgeLines = new THREE.LineSegments(egeo, edgeMat);
  edgeLines.frustumCulled = false;
  spin.add(edgeLines);

  // — silicon hemisphere (display + isolated orientation-ID scene) —
  let traceMat: THREE.ShaderMaterial | null = null;
  let idScene: THREE.Scene | null = null;
  let idGroup: THREE.Group | null = null;
  let sgeo: THREE.BufferGeometry | null = null;
  let idMat: THREE.ShaderMaterial | null = null;
  if (data.silicon) {
    sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute("position", new THREE.BufferAttribute(data.silicon.positions, 3));
    sgeo.setAttribute("aOrient", new THREE.BufferAttribute(data.silicon.orients, 1));
    sgeo.setAttribute("aBlock", new THREE.BufferAttribute(data.silicon.blocks, 1));
    traceMat = new THREE.ShaderMaterial({
      vertexShader: TRACE_VERT,
      fragmentShader: TRACE_FRAG,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSync: { value: 0 },
        uClusterAct: { value: fs.clusterAct },
        uAccent: { value: new THREE.Color("#8b9cf5") },
        uTraceCol: { value: new THREE.Color("#96a3cf") },
      },
    });
    const traces = new THREE.Mesh(sgeo, traceMat);
    traces.frustumCulled = false;
    spin.add(traces);

    // ID pass: same geometry, flat orientation codes, NoBlending, its own
    // scene — additive display materials can never pollute these IDs.
    idMat = new THREE.ShaderMaterial({
      vertexShader: TRACE_ID_VERT,
      fragmentShader: TRACE_ID_FRAG,
      blending: THREE.NoBlending,
    });
    const idMesh = new THREE.Mesh(sgeo, idMat);
    idMesh.frustumCulled = false;
    idGroup = new THREE.Group();
    idGroup.matrixAutoUpdate = false;
    idGroup.add(idMesh);
    idScene = new THREE.Scene();
    idScene.add(idGroup);
  }

  // — spikes / packets (object-space, parented under spin) —
  const spikes = new SpikeSystem(data);
  spin.add(spikes.mesh);

  // — starfield (coordinator-tuned material, unchanged) —
  const starRig = new THREE.Group();
  const starGeo = createStarGeometry();
  const starMat = new THREE.PointsMaterial({
    // full-cell coverage at low luminance: the 4-tap average then lands on
    // the dimmest glyphs (`.`/`:`) crisply, while the blurred underlayer
    // contribution of so dim a point stays invisible (tiny-but-bright
    // points do the opposite — blank glyphs plus gray underlayer blobs)
    color: new THREE.Color("#4c5478"),
    size: 7,
    sizeAttenuation: false,
    depthWrite: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  starRig.add(stars);

  const root = new THREE.Group();
  root.add(rig);
  root.add(starRig);

  return {
    root,
    brainRig: rig,
    spin,
    starRig,
    pointsMat,
    traceMat,
    idScene,
    idGroup,
    spikes,
    dispose: () => {
      pgeo.dispose();
      pointsMat.dispose();
      egeo.dispose();
      edgeMat.dispose();
      sgeo?.dispose();
      traceMat?.dispose();
      idMat?.dispose();
      spikes.dispose();
      starGeo.dispose();
      starMat.dispose();
    },
  };
}

export function Cortex({ fs, data }: { fs: FieldState; data: BrainData }) {
  const gl = useThree((s) => s.gl);
  const assets = useMemo(() => buildCortex(data, fs), [data, fs]);
  useEffect(() => () => assets.dispose(), [assets]);

  // register the ID scene for the pipeline while mounted
  useEffect(() => {
    fs.idScene = assets.idScene;
    return () => {
      fs.idScene = null;
    };
  }, [fs, assets]);

  useFrame(() => {
    const inner = assets.brainRig;
    inner.position.copy(fs.objPos);
    inner.scale.setScalar(fs.objScale);
    inner.rotation.y = fs.camYaw * -0.1; // layered orbital parallax
    if (fs.variant === "silicon") {
      // gentle breathing wander — the seam stays readable
      assets.spin.rotation.y = fs.reduced ? 0 : Math.sin(fs.time * 0.05) * 0.12;
    } else if (fs.reduced) {
      assets.spin.rotation.y = 0.35;
    } else {
      assets.spin.rotation.y += 0.04 * fs.dt; // slow auto-rotate
    }
    assets.starRig.rotation.y = fs.camYaw * 0.3;

    const pu = assets.pointsMat.uniforms;
    pu.uTime.value = fs.time;
    pu.uPulse.value = fs.pulse;
    pu.uSync.value = fs.sync;
    pu.uPointPx.value = fs.cellPx * gl.getPixelRatio() * 0.6; // ≈1 coarse cell in RT0
    (pu.uAccent.value as THREE.Color).copy(fs.accent);
    if (assets.traceMat) {
      const tu = assets.traceMat.uniforms;
      tu.uTime.value = fs.time;
      tu.uSync.value = fs.sync;
      (tu.uAccent.value as THREE.Color).copy(fs.accent);
    }

    // keep the ID hemisphere glued to the display hemisphere
    if (assets.idGroup) {
      assets.root.updateMatrixWorld(true);
      assets.idGroup.matrix.copy(assets.spin.matrixWorld);
    }

    if (!fs.reduced) assets.spikes.update(fs, fs.dt);
  });

  return <primitive object={assets.root} dispose={null} />;
}

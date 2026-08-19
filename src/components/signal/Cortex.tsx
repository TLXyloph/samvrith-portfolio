"use client";

/* eslint-disable react-hooks/immutability --
 * r3f idiom: transient field-state + three.js objects are mutated inside
 * useFrame callbacks (rAF loop), never during render. */

/**
 * Cortex — the v3 scene: a SOLID luminous wrinkled brain surface (the
 * flower formula: lambert-wrap + fresnel rim + hue ramp) with a light
 * cortical point sprinkle, dim synapse edges, the Manhattan-trace silicon
 * hemisphere over a hazy substrate backplane (display + an isolated
 * orientation-ID scene for the dual-res ASCII pass), the spike system,
 * and a starfield of glyph-sized quads. All PRE-quantization.
 */
import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  BRAIN_VERT,
  BRAIN_FRAG,
  POINT_VERT,
  POINT_FRAG,
  TRACE_VERT,
  TRACE_FRAG,
  TRACE_ID_VERT,
  TRACE_ID_FRAG,
  STAR_VERT,
  STAR_FRAG,
} from "./shaders";
import { createStarPositions, mulberry32, STAR_COUNT, type BrainData } from "./brain";
import { buildBrainSurface, buildBackplane, buildCerebellum, buildBrainstem } from "./surface";
import { buildPcbTexture } from "./pcbTexture";
import { SpikeSystem } from "./Spikes";
import type { FieldState } from "./state";

interface CortexAssets {
  root: THREE.Group;
  brainRig: THREE.Group;
  spin: THREE.Group;
  starRig: THREE.Group;
  brainMats: THREE.ShaderMaterial[];
  pointsMat: THREE.ShaderMaterial;
  traceMat: THREE.ShaderMaterial | null;
  starMat: THREE.ShaderMaterial;
  idScene: THREE.Scene | null;
  idGroup: THREE.Group | null;
  spikes: SpikeSystem;
  dispose: () => void;
}

function buildCortex(data: BrainData, fs: FieldState): CortexAssets {
  const rig = new THREE.Group();
  const spin = new THREE.Group();
  rig.add(spin);
  const silicon = data.variant === "silicon";

  // — organ material family: flat mauve "gray matter", fold-shaded —
  const brainMats: THREE.ShaderMaterial[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const makeOrganMat = (baseGain: number, offsetX: number) =>
    new THREE.ShaderMaterial({
      vertexShader: BRAIN_VERT,
      fragmentShader: BRAIN_FRAG,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0 },
        uSync: { value: 0 },
        uRipple: { value: 0 },
        uWavePhase: { value: -1.6 },
        uBaseGain: { value: baseGain },
        // planar seam cut in spin space → shift by the mesh offset
        uClipX: { value: silicon ? -0.03 - offsetX : 1000 },
        uClusterAct: { value: fs.clusterAct },
        uAccent: { value: new THREE.Color("#8b9cf5") },
        uColBase: { value: new THREE.Color("#b795ad") },
        uColRim: { value: new THREE.Color("#c4b5fd") },
      },
    });
  const addOrgan = (
    geo: THREE.BufferGeometry,
    baseGain: number,
    pos: [number, number, number],
    rotX = 0,
  ) => {
    const mat = makeOrganMat(baseGain, pos[0]);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.rotation.x = rotX;
    mesh.frustumCulled = false;
    spin.add(mesh);
    brainMats.push(mat);
    geos.push(geo);
  };
  // cerebrum (carries the image), cerebellum (finer folia), brainstem
  addOrgan(buildBrainSurface(data.variant), 0.78, [0, 0, 0]);
  addOrgan(buildCerebellum(), 0.6, silicon ? [-0.38, -0.62, -0.52] : [0, -0.64, -0.55]);
  addOrgan(buildBrainstem(), 0.66, silicon ? [-0.24, -0.88, -0.2] : [0, -0.9, -0.22], 0.12);

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
    depthTest: false, // sprinkle glitters over the solid body
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
  let backGeo: THREE.BufferGeometry | null = null;
  let backMat: THREE.MeshBasicMaterial | null = null;
  let backMatRear: THREE.MeshBasicMaterial | null = null;
  let pcbTex: THREE.CanvasTexture | null = null;
  if (data.silicon) {
    // painted PCB image behind the traces — its underlayer blur is the
    // cohesive hazy circuit board (aligned with the glyph traces)
    backGeo = buildBackplane();
    pcbTex = buildPcbTexture(data.silicon);
    backMat = new THREE.MeshBasicMaterial({
      map: pcbTex,
      vertexColors: true,
      depthWrite: false,
    });
    const back = new THREE.Mesh(backGeo, backMat);
    back.frustumCulled = false;
    spin.add(back);
    // v5 rotation poses can show the board from behind — a dimmed
    // BackSide twin keeps the rear view a hazy board instead of a hole
    backMatRear = new THREE.MeshBasicMaterial({
      map: pcbTex,
      vertexColors: true,
      depthWrite: false,
      side: THREE.BackSide,
      color: new THREE.Color(0.42, 0.42, 0.42),
    });
    const backRear = new THREE.Mesh(backGeo, backMatRear);
    backRear.frustumCulled = false;
    spin.add(backRear);

    sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute("position", new THREE.BufferAttribute(data.silicon.positions, 3));
    sgeo.setAttribute("aOrient", new THREE.BufferAttribute(data.silicon.orients, 1));
    sgeo.setAttribute("aBlock", new THREE.BufferAttribute(data.silicon.blocks, 1));
    traceMat = new THREE.ShaderMaterial({
      vertexShader: TRACE_VERT,
      fragmentShader: TRACE_FRAG,
      depthWrite: false,
      side: THREE.DoubleSide, // rear view: dimmed in-shader, never a hole
      uniforms: {
        uTime: { value: 0 },
        uSync: { value: 0 },
        uRipple: { value: 0 },
        uWavePhase: { value: -1.6 },
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
      side: THREE.DoubleSide, // micro glyphs persist on the rear view
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

  // — starfield: glyph-sized quads, each star IS a dim ramp character —
  const starRig = new THREE.Group();
  const starGeo = new THREE.PlaneGeometry(1, 1);
  const starMat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    uniforms: { uStarK: { value: 0.01 } },
  });
  const stars = new THREE.InstancedMesh(starGeo, starMat, STAR_COUNT);
  {
    const positions = createStarPositions(STAR_COUNT);
    const srand = mulberry32(7707);
    const m = new THREE.Matrix4();
    const cA = new THREE.Color("#aeb6e6");
    const cB = new THREE.Color("#8b9cf5");
    const c = new THREE.Color();
    stars.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(STAR_COUNT * 3), 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const s = 0.85 + srand() * 0.3; // relative size jitter (shader scales)
      m.set(s, 0, 0, positions[i * 3], 0, s, 0, positions[i * 3 + 1], 0, 0, s, positions[i * 3 + 2], 0, 0, 0, 1);
      stars.setMatrixAt(i, m);
      // luminance targets ramp index 2–4; a few land 5–6
      const bright = srand() < 0.08 ? 1.8 + srand() * 0.4 : 0.7 + srand() * 0.55;
      c.copy(cA).lerp(cB, srand()).multiplyScalar(bright);
      stars.instanceColor.setXYZ(i, c.r, c.g, c.b);
    }
    stars.instanceMatrix.needsUpdate = true;
    stars.instanceColor.needsUpdate = true;
  }
  stars.frustumCulled = false;
  stars.layers.set(1); // glyph citizens: rendered after the underlayer blit
  starRig.add(stars);

  const root = new THREE.Group();
  root.add(rig);
  root.add(starRig);

  return {
    root,
    brainRig: rig,
    spin,
    starRig,
    brainMats,
    pointsMat,
    traceMat,
    starMat,
    idScene,
    idGroup,
    spikes,
    dispose: () => {
      for (const g of geos) g.dispose();
      for (const m of brainMats) m.dispose();
      pgeo.dispose();
      pointsMat.dispose();
      egeo.dispose();
      edgeMat.dispose();
      sgeo?.dispose();
      traceMat?.dispose();
      idMat?.dispose();
      backGeo?.dispose();
      backMat?.dispose();
      backMatRear?.dispose();
      pcbTex?.dispose();
      spikes.dispose();
      starGeo.dispose();
      starMat.dispose();
      stars.dispose();
    },
  };
}

export function Cortex({ fs, data }: { fs: FieldState; data: BrainData }) {
  const gl = useThree((s) => s.gl);
  const assets = useMemo(() => buildCortex(data, fs), [data, fs]);
  useEffect(() => () => assets.dispose(), [assets]);

  // register the ID scene for the pipeline + the rotating rig for the
  // annotation publisher while mounted
  useEffect(() => {
    fs.idScene = assets.idScene;
    fs.spinObj = assets.spin;
    return () => {
      fs.idScene = null;
      fs.spinObj = null;
    };
  }, [fs, assets]);

  useFrame((state) => {
    const inner = assets.brainRig;
    inner.position.copy(fs.objPos);
    inner.scale.setScalar(fs.objScale);
    inner.rotation.y = fs.camYaw * -0.1; // layered orbital parallax
    // v5: the scroll choreography IS the rotation — the driver's spring
    // pose plus a tiny breathing wander (both variants share the poses)
    const wander = fs.reduced ? 0 : Math.sin(fs.time * 0.05) * 0.05;
    assets.spin.rotation.y = fs.poseYaw + wander;
    assets.spin.rotation.x = fs.posePitch;
    assets.starRig.rotation.y = fs.camYaw * 0.3;

    for (const m of assets.brainMats) {
      const bu = m.uniforms;
      bu.uTime.value = fs.time;
      bu.uPulse.value = fs.pulse;
      bu.uSync.value = fs.sync;
      bu.uRipple.value = fs.rippleAmp;
      bu.uWavePhase.value = fs.wavePhase;
      (bu.uAccent.value as THREE.Color).copy(fs.accent);
    }

    const pu = assets.pointsMat.uniforms;
    pu.uTime.value = fs.time;
    pu.uPulse.value = fs.pulse;
    pu.uSync.value = fs.sync;
    pu.uPointPx.value = fs.cellPx * gl.getPixelRatio() * 0.6 * 0.55; // sub-cell sprinkle
    (pu.uAccent.value as THREE.Color).copy(fs.accent);
    if (assets.traceMat) {
      const tu = assets.traceMat.uniforms;
      tu.uTime.value = fs.time;
      tu.uSync.value = fs.sync;
      tu.uRipple.value = fs.rippleAmp;
      tu.uWavePhase.value = fs.wavePhase;
      (tu.uAccent.value as THREE.Color).copy(fs.accent);
    }
    // each star ≈ a coarse cell at its depth (slightly over, so whichever
    // cell it lands in reliably samples it as one dim character)
    assets.starMat.uniforms.uStarK.value =
      1.3 * (fs.cellPx / Math.max(1, state.size.height)) * 2 * Math.tan((42 * Math.PI) / 360);

    // keep the ID hemisphere glued to the display hemisphere
    if (assets.idGroup) {
      assets.root.updateMatrixWorld(true);
      assets.idGroup.matrix.copy(assets.spin.matrixWorld);
    }

    if (!fs.reduced) assets.spikes.update(fs, fs.dt);
  });

  return <primitive object={assets.root} dispose={null} />;
}

"use client";

/* eslint-disable react-hooks/immutability --
 * r3f idiom: transient field-state + three.js objects are mutated inside
 * useFrame callbacks (rAF loop), never during render. */

/**
 * Bloom — the 10-petal signal flower + emissive core cluster.
 * Starfield — dim points shell that only ever maps to the faintest glyphs.
 * Both live PRE-quantization; the ASCII pass reads whatever they render.
 */
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PETAL_VERT, PETAL_FRAG } from "./shaders";
import {
  createPetalGeometry,
  createPetalSpecs,
  createStarGeometry,
  fillCoreInstances,
  CORE_COUNT,
} from "./geometry";
import type { FieldState } from "./state";

interface BloomAssets {
  rig: THREE.Group;
  spin: THREE.Group;
  mats: THREE.ShaderMaterial[];
  coreMat: THREE.MeshBasicMaterial;
  dispose: () => void;
}

function buildBloom(): BloomAssets {
  const rig = new THREE.Group();
  const spin = new THREE.Group();
  // pitch the bloom face toward the camera so the petal fan reads radially
  // through the glyph grid (yaw spins about the flower's own axis: Rx·Ry)
  spin.rotation.x = 0.55;
  spin.position.y = -0.35;
  rig.add(spin);

  const petalGeo = createPetalGeometry();
  const mats: THREE.ShaderMaterial[] = [];
  for (const spec of createPetalSpecs()) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: PETAL_VERT,
      fragmentShader: PETAL_FRAG,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0 },
        uDisperse: { value: 0 },
        uSeed: { value: spec.seed },
        uColBase: { value: new THREE.Color("#f472b6") },
        uColMid: { value: new THREE.Color("#a78bfa") },
        uColTip: { value: new THREE.Color("#8b9cf5") },
        uColRim: { value: new THREE.Color("#c4b5fd") },
      },
    });
    const mesh = new THREE.Mesh(petalGeo, mat);
    mesh.rotation.order = "YXZ";
    mesh.rotation.set(spec.tilt, spec.azimuth, spec.roll);
    mesh.scale.setScalar(spec.scale);
    mesh.frustumCulled = false;
    spin.add(mesh);
    mats.push(mat);
  }

  const coreGeo = new THREE.IcosahedronGeometry(1, 0);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const core = new THREE.InstancedMesh(coreGeo, coreMat, CORE_COUNT);
  core.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  fillCoreInstances(core);
  core.frustumCulled = false;
  spin.add(core);

  return {
    rig,
    spin,
    mats,
    coreMat,
    dispose: () => {
      petalGeo.dispose();
      coreGeo.dispose();
      coreMat.dispose();
      core.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

export function Bloom({ fs }: { fs: FieldState }) {
  const assets = useMemo(() => buildBloom(), []);
  useEffect(() => () => assets.dispose(), [assets]);

  useFrame(() => {
    for (const m of assets.mats) {
      m.uniforms.uTime.value = fs.time;
      m.uniforms.uPulse.value = fs.pulse;
      m.uniforms.uDisperse.value = fs.disperse;
    }
    // core brightness 0.7 + 0.8·pulse (multiplies per-instance ramp colors)
    assets.coreMat.color.setScalar(0.7 + 0.8 * fs.pulse);
    assets.rig.position.copy(fs.objPos);
    assets.rig.scale.setScalar(fs.objScale);
    // layered orbital parallax: bloom counter-rotates against the camera yaw
    assets.rig.rotation.y = fs.camYaw * -0.1;
    if (fs.reduced) {
      assets.spin.rotation.y = 0.6;
    } else {
      assets.spin.rotation.y += 0.04 * fs.dt; // slow auto-rotate
    }
  });

  return <primitive object={assets.rig} dispose={null} />;
}

interface StarAssets {
  rig: THREE.Group;
  dispose: () => void;
}

function buildStars(): StarAssets {
  const rig = new THREE.Group();
  const geo = createStarGeometry();
  const mat = new THREE.PointsMaterial({
    // bright pixels, but tiny: the 4-tap cell average dilutes them so they
    // only ever land on the dimmest glyphs (`.`/`:`)
    color: new THREE.Color("#e2e6ff"),
    size: 3,
    sizeAttenuation: false,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  rig.add(points);
  return {
    rig,
    dispose: () => {
      geo.dispose();
      mat.dispose();
    },
  };
}

export function Starfield({ fs }: { fs: FieldState }) {
  const assets = useMemo(() => buildStars(), []);
  useEffect(() => () => assets.dispose(), [assets]);

  useFrame(() => {
    // parallax layer: follows camera yaw at gain 0.30
    assets.rig.rotation.y = fs.camYaw * 0.3;
  });

  return <primitive object={assets.rig} dispose={null} />;
}

"use client";

/* eslint-disable react-hooks/immutability --
 * r3f idiom: render targets and pass uniforms are mutated inside the
 * useFrame render takeover (rAF loop), never during render. */

/**
 * Hand-rolled ASCII postprocess (no postprocessing lib):
 *   Pass A  — scene → RT0 at 0.6× drawing-buffer size (HalfFloat, Linear).
 *   Pass ID — silicon-only orientation IDs → RT_ID at 0.3× (RGBA8, NEAREST;
 *             isolated scene + NoBlending materials, so additive display
 *             materials can never pollute the IDs — see Cortex).
 *   Pass A2 — RT0 → RT1 at 0.1× (soft color underlayer; bilinear upsample
 *             acts as a free blur).
 *   Pass B  — fullscreen triangle to screen: dual-resolution quantization —
 *             organic macro cells by luminance ramp; silicon micro cells
 *             (cellPx/2, exactly nested) by trace orientation ('-' '|' '+' 'o').
 * Runs as a useFrame(…, 1) takeover, so r3f's own render is disabled.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { ASCII_FRAG, BLIT_FRAG, FSQ_VERT } from "./shaders";
import { getGlyphAtlas } from "./glyphAtlas";
import { VOID_HEX, type FieldState } from "./state";

interface Targets {
  rt0: THREE.WebGLRenderTarget;
  rt1: THREE.WebGLRenderTarget;
  rtId: THREE.WebGLRenderTarget;
  w: number;
  h: number;
}

function buildPack() {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  const blitMat = new THREE.ShaderMaterial({
    vertexShader: FSQ_VERT,
    fragmentShader: BLIT_FRAG,
    uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2(1, 1) } },
    depthTest: false,
    depthWrite: false,
  });
  const asciiMat = new THREE.ShaderMaterial({
    vertexShader: FSQ_VERT,
    fragmentShader: ASCII_FRAG,
    uniforms: {
      tScene: { value: null },
      tUnder: { value: null },
      tID: { value: null },
      uHasID: { value: 0 },
      tGlyphs: { value: getGlyphAtlas() },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uCellSize: { value: 24 },
      uExposure: { value: 1 },
      uContrast: { value: 1.12 },
      uUnderlayer: { value: 0.35 },
      uGlobalDim: { value: 1 },
      uVoid: { value: new THREE.Color(VOID_HEX) },
    },
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, blitMat);
  mesh.frustumCulled = false;
  const fsScene = new THREE.Scene();
  fsScene.add(mesh);
  return {
    cam,
    geo,
    blitMat,
    asciiMat,
    mesh,
    fsScene,
    dispose: () => {
      geo.dispose();
      blitMat.dispose();
      asciiMat.dispose();
    },
  };
}

export function AsciiPipeline({ fs }: { fs: FieldState }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);

  const pack = useMemo(() => buildPack(), []);
  const targets = useRef<Targets | null>(null);
  const sizeVec = useMemo(() => new THREE.Vector2(), []);
  const warm = useRef<"idle" | "pending" | "ready">("idle");

  // scene ground: everything quantizes against #050508
  useEffect(() => {
    scene.background = new THREE.Color(VOID_HEX);
  }, [scene]);

  // WebGL context loss / restore
  useEffect(() => {
    const el = gl.domElement;
    const onLost = (e: Event) => {
      e.preventDefault();
    };
    const onRestored = () => {
      const t = targets.current;
      if (t) {
        t.rt0.dispose();
        t.rt1.dispose();
        t.rtId.dispose();
        targets.current = null; // re-init RTs on next frame
      }
      invalidate();
    };
    el.addEventListener("webglcontextlost", onLost, false);
    el.addEventListener("webglcontextrestored", onRestored, false);
    return () => {
      el.removeEventListener("webglcontextlost", onLost, false);
      el.removeEventListener("webglcontextrestored", onRestored, false);
    };
  }, [gl, invalidate]);

  // dispose everything but the module-cached glyph atlas
  useEffect(
    () => () => {
      pack.dispose();
      const t = targets.current;
      if (t) {
        t.rt0.dispose();
        t.rt1.dispose();
        t.rtId.dispose();
        targets.current = null;
      }
    },
    [pack],
  );

  useFrame(() => {
    // — cold-start warmup: compile all programs before any visible frame —
    if (warm.current !== "ready") {
      if (warm.current === "idle") {
        warm.current = "pending";
        const done = () => {
          if (warm.current === "ready") return;
          warm.current = "ready";
          invalidate(); // demand mode: schedule the real first frame
        };
        try {
          if (typeof gl.compileAsync === "function") {
            gl.compileAsync(scene, camera)
              .then(() => (fs.idScene ? gl.compileAsync(fs.idScene, camera) : null))
              .then(() => {
                pack.mesh.material = pack.asciiMat;
                return gl.compileAsync(pack.fsScene, pack.cam);
              })
              .then(() => {
                pack.mesh.material = pack.blitMat;
                return gl.compileAsync(pack.fsScene, pack.cam);
              })
              .then(done, done);
            window.setTimeout(done, 1500); // safety net (context loss mid-warm)
          } else {
            gl.compile(scene, camera);
            done();
          }
        } catch {
          done();
        }
      }
      return; // skip rendering until programs are warm
    }

    const db = gl.getDrawingBufferSize(sizeVec);
    const w = Math.max(2, Math.floor(db.x));
    const h = Math.max(2, Math.floor(db.y));

    let t = targets.current;
    if (!t || t.w !== w || t.h !== h) {
      if (t) {
        t.rt0.dispose();
        t.rt1.dispose();
        t.rtId.dispose();
      }
      const type =
        gl.extensions.has("EXT_color_buffer_float") ||
        gl.extensions.has("EXT_color_buffer_half_float")
          ? THREE.HalfFloatType
          : THREE.UnsignedByteType;
      const rt0 = new THREE.WebGLRenderTarget(
        Math.max(1, Math.floor(w * 0.6)),
        Math.max(1, Math.floor(h * 0.6)),
        {
          type,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          depthBuffer: true,
          stencilBuffer: false,
        },
      );
      const rt1 = new THREE.WebGLRenderTarget(
        Math.max(1, Math.floor(w * 0.1)),
        Math.max(1, Math.floor(h * 0.1)),
        {
          type,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          depthBuffer: false,
          stencilBuffer: false,
        },
      );
      // orientation IDs must never interpolate → NEAREST, plain RGBA8
      const rtId = new THREE.WebGLRenderTarget(
        Math.max(1, Math.floor(w * 0.3)),
        Math.max(1, Math.floor(h * 0.3)),
        {
          minFilter: THREE.NearestFilter,
          magFilter: THREE.NearestFilter,
          depthBuffer: false,
          stencilBuffer: false,
        },
      );
      // start defined (all zero = "no silicon") even if the ID pass never runs
      gl.setRenderTarget(rtId);
      gl.clear(true, false, false);
      gl.setRenderTarget(null);
      t = { rt0, rt1, rtId, w, h };
      targets.current = t;
      pack.blitMat.uniforms.uTexel.value.set(1 / rt0.width, 1 / rt0.height);
    }

    const u = pack.asciiMat.uniforms;
    u.tScene.value = t.rt0.texture;
    u.tUnder.value = t.rt1.texture;
    u.tID.value = t.rtId.texture;
    u.uHasID.value = fs.idScene ? 1 : 0;
    u.uResolution.value.set(w, h);
    u.uCellSize.value = Math.max(4, fs.cellPx * gl.getPixelRatio());
    u.uExposure.value = fs.exposure;
    u.uContrast.value = fs.contrast;
    u.uUnderlayer.value = fs.underlayer;
    u.uGlobalDim.value = fs.globalDim;

    // Pass A: scene → RT0
    gl.setRenderTarget(t.rt0);
    gl.render(scene, camera);
    // Pass ID: silicon orientation codes → RT_ID (silicon variant only)
    if (fs.idScene) {
      gl.setRenderTarget(t.rtId);
      gl.render(fs.idScene, camera);
    }
    // Pass A2: RT0 → RT1
    pack.blitMat.uniforms.tSrc.value = t.rt0.texture;
    pack.mesh.material = pack.blitMat;
    gl.setRenderTarget(t.rt1);
    gl.render(pack.fsScene, pack.cam);
    // Pass B: ASCII quantization to screen
    pack.mesh.material = pack.asciiMat;
    gl.setRenderTarget(null);
    gl.render(pack.fsScene, pack.cam);

    // first complete 3-pass frame → let SignalField fade the canvas in
    // (re-offered every frame until a consumer picks it up)
    fs.firstFrameDone = true;
    if (fs.onFirstFrame) {
      const cb = fs.onFirstFrame;
      fs.onFirstFrame = null;
      cb();
    }
  }, 1);

  return null;
}

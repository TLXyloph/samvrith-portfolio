"use client";

/* eslint-disable react-hooks/immutability --
 * r3f idiom: springs, camera, and callout DOM are transient rAF-loop
 * state, mutated inside useFrame callbacks only, never during render. */

/**
 * BoardStage — the SparseEMG board deep-dive's WebGL stage: the real
 * emg_2ch rev A KiCad GLB rendered CRISP (deliberately no ASCII pass —
 * the board is the one true physical object on an otherwise quantized
 * site). The camera revolves through five discrete beat poses chased by
 * a critically-damped spring with scroll-momentum injection (the brain
 * Driver's recipe), and one mono callout per beat is projected from its
 * 3D anchor into container px each frame.
 *
 * Import via next/dynamic with ssr:false (HardwareDive does).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { hardwareBeats } from "@/data/content";
import {
  BEAT_COUNT,
  BEAT_POSES,
  BOARD_WIDTH,
  MOMENTUM_GAIN,
  SCRUB_GAIN,
  buildAnchors,
  orbitPosition,
  springStep,
  type AnchorTable,
  type HwProgress,
  type SpringState,
} from "./poses";

interface BoardModel {
  scene: THREE.Group;
  scale: number;
  offset: [number, number, number];
  anchors: AnchorTable;
  /** Normalized bottom of the board — the contact shadow sits just below. */
  minY: number;
  dispose: () => void;
}

function disposeMaterial(mat: THREE.Material) {
  for (const value of Object.values(mat)) {
    if (value instanceof THREE.Texture) value.dispose();
  }
  mat.dispose();
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach(disposeMaterial);
    else if (material) disposeMaterial(material);
  });
}

/** Center the board at the origin and scale its width to BOARD_WIDTH. */
function prepareBoard(scene: THREE.Group): BoardModel {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const scale = BOARD_WIDTH / Math.max(size.x, 1e-6);
  return {
    scene,
    scale,
    offset: [-center.x * scale, -center.y * scale, -center.z * scale],
    anchors: buildAnchors(scene, center, scale),
    minY: (box.min.y - center.y) * scale,
    dispose: () => disposeObject(scene),
  };
}

/** Soft radial contact-shadow texture (darkens the DOM glow beneath). */
function makeShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 128);
    grad.addColorStop(0, "rgba(0,0,0,0.55)");
    grad.addColorStop(0.55, "rgba(0,0,0,0.26)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  return new THREE.CanvasTexture(canvas);
}

function spring(v: number): SpringState {
  return { v, vel: 0 };
}

interface RigRefs {
  callout: React.RefObject<HTMLDivElement | null>;
  arm: React.RefObject<HTMLDivElement | null>;
  dot: React.RefObject<HTMLSpanElement | null>;
  leader: React.RefObject<HTMLSpanElement | null>;
  text: React.RefObject<HTMLSpanElement | null>;
}

/** Neutral studio reflections so soldermask/copper/pins read as materials. */
function Environment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const rt = pmrem.fromScene(room, 0.04);
    scene.environment = rt.texture;
    scene.environmentIntensity = 0.3;
    pmrem.dispose();
    return () => {
      scene.environment = null;
      rt.dispose();
    };
  }, [gl, scene]);
  return null;
}

/** Shift the composition right of the text column (up, above it, on mobile). */
function ViewOffset() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    if (size.width >= 768) {
      cam.setViewOffset(size.width, size.height, -size.width * 0.12, 0, size.width, size.height);
    } else {
      cam.setViewOffset(size.width, size.height, 0, size.height * 0.07, size.width, size.height);
    }
    return () => cam.clearViewOffset();
  }, [camera, size]);
  return null;
}

/** Re-render demand frames when the beat changes under reduced motion. */
function DemandInvalidator({ beat, reduced }: { beat: number; reduced: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (reduced) invalidate();
  }, [beat, reduced, invalidate]);
  return null;
}

function StageRig({
  model,
  hw,
  reduced,
  refs,
}: {
  model: BoardModel;
  hw: HwProgress;
  reduced: boolean;
  refs: RigRefs;
}) {
  const floatRef = useRef<THREE.Group>(null);
  const shadowTex = useMemo(() => makeShadowTexture(), []);
  useEffect(() => () => shadowTex.dispose(), [shadowTex]);

  // springs seed at the overview pose; a mid-section (re)mount simply
  // settles onto the live beat over the first ~second
  const st = useMemo(() => {
    const pose = BEAT_POSES[0];
    return {
      theta: spring(pose.theta),
      phi: spring(pose.phi),
      radius: spring(pose.radius),
      tx: spring(0),
      ty: spring(0),
      tz: spring(0),
      scrollVel: 0,
      prevP: null as number | null,
      time: 0,
      displayed: 0,
      o: 0,
      target: new THREE.Vector3(),
      camPos: new THREE.Vector3(),
      world: new THREE.Vector3(),
    };
  }, []);

  useFrame((state, delta) => {
    const dt = reduced ? 0 : Math.min(Math.max(delta, 0), 0.05);
    st.time += dt;
    const beat = reduced ? 0 : Math.min(Math.max(hw.beat, 0), BEAT_POSES.length - 1);
    const pose = BEAT_POSES[beat];
    const tgt = model.anchors[pose.target];

    // — section-local scroll velocity (smoothed, Driver recipe) —
    const p = hw.p;
    if (!reduced && dt > 0) {
      const dp = st.prevP === null ? 0 : p - st.prevP;
      const raw = dp / dt;
      st.scrollVel += (raw - st.scrollVel) * (1 - Math.exp(-8 * dt));
    } else {
      st.scrollVel = 0;
    }
    st.prevP = p;

    // — critically-damped pose chase + the scroll sling into θ —
    // sub-beat scrub keeps the board revolving WITH the scroll: scroll
    // position inside the beat window (−0.5..0.5 around its center)
    // biases the θ target, so slow scrolling turns the board and the
    // spring parks it back on the pose when scrolling stops
    const beatF = p * (BEAT_COUNT - 1);
    const sub = Math.min(0.5, Math.max(-0.5, beatF - beat));
    const thetaTarget = pose.theta + (reduced ? 0 : sub * SCRUB_GAIN);
    if (reduced || dt <= 0) {
      st.theta.v = thetaTarget;
      st.phi.v = pose.phi;
      st.radius.v = pose.radius;
      st.tx.v = tgt.x;
      st.ty.v = tgt.y;
      st.tz.v = tgt.z;
      st.theta.vel = st.phi.vel = st.radius.vel = 0;
      st.tx.vel = st.ty.vel = st.tz.vel = 0;
    } else {
      springStep(st.theta, thetaTarget, dt);
      st.theta.vel += st.scrollVel * MOMENTUM_GAIN * dt; // the sling
      springStep(st.phi, pose.phi, dt);
      springStep(st.radius, pose.radius, dt);
      springStep(st.tx, tgt.x, dt);
      springStep(st.ty, tgt.y, dt);
      springStep(st.tz, tgt.z, dt);
    }
    // "near the (scrubbed) target": loose enough that a slow scrub keeps
    // the label pinned while the board turns; beat transits and fast
    // flings still hide it until the spring catches up
    const settled =
      Math.abs(thetaTarget - st.theta.v) < 0.2 &&
      Math.abs(st.theta.vel) < 0.9 &&
      Math.abs(pose.radius - st.radius.v) < 0.25;

    // — slow idle float (board only; the camera target ignores the bob) —
    const float = floatRef.current;
    if (float) {
      float.position.y = reduced ? 0 : Math.sin(st.time * 0.5) * 0.045;
      float.rotation.y = reduced ? 0 : Math.sin(st.time * 0.23) * 0.012;
    }

    st.target.set(st.tx.v, st.ty.v, st.tz.v);
    orbitPosition(st.target, st.theta.v, st.phi.v, st.radius.v, st.camPos);
    state.camera.position.copy(st.camPos);
    state.camera.lookAt(st.target);

    // — the beat's callout, projected to container px; the entrance is
    // ANIMATED: the dot pops, the leader draws out from it, the text
    // wipes in alongside — all driven by the eased reveal each frame —
    const el = refs.callout.current;
    const arm = refs.arm.current;
    const dot = refs.dot.current;
    const leader = refs.leader.current;
    const txt = refs.text.current;
    if (el && arm && dot && leader && txt && float) {
      const kIn = reduced ? 1 : 1 - Math.exp(-6 * Math.max(dt, 1e-3));
      const kOut = reduced ? 1 : 1 - Math.exp(-9 * Math.max(dt, 1e-3));
      if (st.displayed !== beat && st.o < 0.02) st.displayed = beat;
      const shown = BEAT_POSES[st.displayed];
      txt.textContent = hardwareBeats[st.displayed]?.callout ?? "";
      const want = st.displayed === beat && (settled || reduced) ? 1 : 0;
      st.o += (want - st.o) * (want > st.o ? kIn : kOut);

      st.world.copy(model.anchors[shown.anchor]);
      float.localToWorld(st.world);
      st.world.project(state.camera);
      const behind = st.world.z > 1;
      const x = (st.world.x * 0.5 + 0.5) * state.size.width;
      const y = (-st.world.y * 0.5 + 0.5) * state.size.height;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      el.style.opacity = (behind ? 0 : st.o).toFixed(3);
      const flip = x > state.size.width - 270;
      arm.style.flexDirection = flip ? "row-reverse" : "row";
      arm.style.transform = flip
        ? "translate(calc(-100% + 1.5px), -50%)"
        : "translate(-1.5px, -50%)";
      // entrance choreography from the reveal value
      const rv = st.o * st.o * (3 - 2 * st.o); // smoothstep the fade
      dot.style.transform = `scale(${(0.25 + 0.75 * rv).toFixed(3)})`;
      leader.style.transformOrigin = flip ? "right center" : "left center";
      leader.style.transform = `scaleX(${rv.toFixed(3)})`;
      const cut = ((1 - rv) * 100).toFixed(1);
      txt.style.clipPath = flip ? `inset(0 0 0 ${cut}%)` : `inset(0 ${cut}% 0 0)`;
      txt.style.transform = `translateX(${((1 - rv) * (flip ? 8 : -8)).toFixed(2)}px)`;
    }
  });

  return (
    <>
      <group ref={floatRef}>
        <group scale={model.scale} position={model.offset}>
          <primitive object={model.scene} dispose={null} />
        </group>
      </group>
      {/* contact shadow — darkens the violet DOM glow under the board */}
      <mesh rotation-x={-Math.PI / 2} position={[0, model.minY - 0.09, 0]}>
        <planeGeometry args={[6.2, 4.8]} />
        <meshBasicMaterial map={shadowTex} transparent depthWrite={false} />
      </mesh>
      {/* cool key, violet fill, soft rim — soldermask deep, silkscreen legible */}
      <directionalLight position={[-3, 4, 2.5]} intensity={1.9} color="#dfe6ff" />
      <directionalLight position={[3.5, 1.6, -1.2]} intensity={0.85} color="#8b7cf5" />
      <directionalLight position={[0.6, 2.4, -4]} intensity={0.95} color="#b7bdfa" />
      <hemisphereLight args={["#262640", "#0a0a12", 0.4]} />
    </>
  );
}

const SHIMMER_CSS = `
@keyframes sb-hw-shimmer { 0%, 100% { opacity: 0.3 } 50% { opacity: 0.85 } }
.sb-hw-shimmer { animation: sb-hw-shimmer 1.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .sb-hw-shimmer { animation: none; opacity: 0.6; } }
`;

export interface BoardStageProps {
  /** Mutable section-local progress/beat — written by HardwareDive's listener. */
  hw: HwProgress;
  /** Current beat (React state; drives demand-mode re-renders). */
  beat: number;
  /** In-view and tab visible → real frameloop; otherwise fully paused. */
  active: boolean;
  reduced: boolean;
  /** GLB failed to load/parse — parent swaps to the static fallback. */
  onError: () => void;
}

export default function BoardStage({ hw, beat, active, reduced, onError }: BoardStageProps) {
  const [model, setModel] = useState<BoardModel | null>(null);
  const [revealed, setRevealed] = useState(false);
  const calloutRef = useRef<HTMLDivElement>(null);
  const armRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const leaderRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [dpr] = useState(() =>
    typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2),
  );

  useEffect(() => {
    let alive = true;
    const loader = new GLTFLoader();
    loader.load(
      "/pcb/emg_2ch.glb",
      (gltf) => {
        const prepared = prepareBoard(gltf.scene);
        if (!alive) {
          prepared.dispose();
          return;
        }
        setModel(prepared);
      },
      undefined,
      () => {
        if (alive) onError();
      },
    );
    return () => {
      alive = false;
    };
    // load exactly once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => (model ? () => model.dispose() : undefined), [model]);

  // ease the stage in on the frame after the model lands (transition needs
  // a committed opacity-0 start state)
  useEffect(() => {
    if (!model) return;
    const id = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(id);
  }, [model]);

  return (
    <div className="absolute inset-0">
      <style href="sb-hw-shimmer" precedence="default">
        {SHIMMER_CSS}
      </style>

      {model ? (
        <div
          className="absolute inset-0"
          style={{
            opacity: revealed ? 1 : 0,
            transition: reduced ? "none" : "opacity 700ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <Canvas
            frameloop={reduced ? "demand" : active ? "always" : "never"}
            dpr={dpr}
            camera={{ fov: 40, near: 0.08, far: 60, position: [-1.7, 4.2, 2.3] }}
            gl={{
              antialias: true,
              alpha: true,
              stencil: false,
              powerPreference: "high-performance",
            }}
          >
            <Environment />
            <ViewOffset />
            <DemandInvalidator beat={beat} reduced={reduced} />
            <StageRig
              model={model}
              hw={hw}
              reduced={reduced}
              refs={{
                callout: calloutRef,
                arm: armRef,
                dot: dotRef,
                leader: leaderRef,
                text: textRef,
              }}
            />
          </Canvas>
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <span className="sb-hw-shimmer font-mono text-[11px] tracking-[0.18em] text-faint">
            loading model —
          </span>
        </div>
      )}

      {/* the beat callout: 3px dot + 14px leader + mono label, driven
          imperatively from the frame loop (same language the brain used) */}
      <div
        ref={calloutRef}
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 z-[2]"
        style={{ opacity: 0 }}
      >
        <div
          ref={armRef}
          className="flex items-center gap-1.5"
          style={{ transform: "translate(-2.5px, -50%)" }}
        >
          <span
            ref={dotRef}
            className="h-[5px] w-[5px] shrink-0 rounded-full bg-sig-iris"
          />
          <span ref={leaderRef} className="h-px w-5 shrink-0 bg-white/40" />
          <span
            ref={textRef}
            className="rounded-md border border-hairline bg-void/80 px-2.5 py-1 font-mono text-[14px] tracking-[0.08em] whitespace-nowrap text-ink"
          />
        </div>
      </div>
    </div>
  );
}

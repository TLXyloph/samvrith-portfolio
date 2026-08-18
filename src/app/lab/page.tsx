"use client";

/**
 * /lab — art-direction surface for the SignalField "Silicon Cortex".
 * No page scroll: progress, focus, and activation are driven straight
 * into the scroll bus / component props.
 */
import dynamic from "next/dynamic";
import { useState } from "react";
import { setScrollProgress, setFocus, type FocusId } from "@/components/signal/scrollBus";
import type { SignalVariant } from "@/components/signal/brain";
import CursorDot from "@/components/signal/CursorDot";

const SignalField = dynamic(() => import("@/components/signal/SignalField"), {
  ssr: false,
});

interface SliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onChange: (v: number) => void;
}

function Slider({ label, min, max, step, value, display, onChange }: SliderProps) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-4">
        <span className="uppercase tracking-widest text-white/50">{label}</span>
        <span className="tabular-nums text-white/90">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[#a78bfa]"
      />
    </label>
  );
}

function Toggle({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border px-2 py-1 uppercase tracking-widest transition-colors ${
        active
          ? "border-[#a78bfa] bg-[#a78bfa]/20 text-white"
          : "border-white/15 text-white/50 hover:text-white/80"
      }`}
    >
      {label}
    </button>
  );
}

export default function LabPage() {
  const [progress, setProgress] = useState(0);
  const [cellPx, setCellPx] = useState(14);
  const [exposure, setExposure] = useState(1);
  const [underlayer, setUnderlayer] = useState(0.5);
  const [rippleGain, setRippleGain] = useState(2.5);
  const [glyphMin, setGlyphMin] = useState(0.78);
  const [glyphGain, setGlyphGain] = useState(0.4);
  const [variant, setVariant] = useState<SignalVariant>("silicon");
  const [focus, setFocusState] = useState<FocusId>(null);
  const [overrideOn, setOverrideOn] = useState(false);
  const [cluster, setCluster] = useState(-1);

  const applyFocus = (id: FocusId) => {
    setFocusState(id);
    setFocus(id);
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#050508] text-neutral-300">
      <SignalField
        key={variant}
        externalScroll
        variant={variant}
        cellPx={cellPx}
        exposure={exposure}
        underlayer={underlayer}
        rippleGain={rippleGain}
        glyphMin={glyphMin}
        glyphGain={glyphGain}
        clusterOverride={overrideOn ? cluster : undefined}
      />
      <CursorDot />
      <div className="fixed bottom-4 left-4 z-10 w-72 space-y-3 border border-white/10 bg-black/70 p-4 font-mono text-[11px] backdrop-blur">
        <div className="flex items-baseline justify-between">
          <span className="uppercase tracking-widest text-white/80">signal / lab</span>
          <span className="text-white/40">v2 cortex</span>
        </div>
        <div className="flex gap-2">
          <Toggle active={variant === "silicon"} label="silicon" onClick={() => setVariant("silicon")} />
          <Toggle active={variant === "connectome"} label="connectome" onClick={() => setVariant("connectome")} />
        </div>
        <div className="flex gap-2">
          <Toggle active={focus === "sparse-emg"} label="emg" onClick={() => applyFocus(focus === "sparse-emg" ? null : "sparse-emg")} />
          <Toggle active={focus === "neuromcp"} label="mcp" onClick={() => applyFocus(focus === "neuromcp" ? null : "neuromcp")} />
          <Toggle active={focus === null} label="none" onClick={() => applyFocus(null)} />
        </div>
        <Slider
          label="scroll"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          display={progress.toFixed(3)}
          onChange={(v) => {
            setProgress(v);
            setScrollProgress(v);
          }}
        />
        <div className="flex items-end gap-2">
          <div className="grow">
            <Slider
              label={overrideOn ? "cluster (pinned)" : "cluster (scroll)"}
              min={-1}
              max={8}
              step={1}
              value={cluster}
              display={overrideOn ? String(cluster) : "auto"}
              onChange={(v) => {
                setCluster(v);
                setOverrideOn(true);
              }}
            />
          </div>
          <Toggle active={!overrideOn} label="auto" onClick={() => setOverrideOn(false)} />
        </div>
        <Slider
          label="cellPx"
          min={8}
          max={20}
          step={1}
          value={cellPx}
          display={`${cellPx}px`}
          onChange={setCellPx}
        />
        <Slider
          label="exposure"
          min={0.2}
          max={1.6}
          step={0.01}
          value={exposure}
          display={exposure.toFixed(2)}
          onChange={setExposure}
        />
        <Slider
          label="underlayer"
          min={0}
          max={0.8}
          step={0.01}
          value={underlayer}
          display={underlayer.toFixed(2)}
          onChange={setUnderlayer}
        />
        <Slider
          label="rippleGain"
          min={0}
          max={4}
          step={0.05}
          value={rippleGain}
          display={rippleGain.toFixed(2)}
          onChange={setRippleGain}
        />
        <Slider
          label="glyphMin"
          min={0.5}
          max={1}
          step={0.01}
          value={glyphMin}
          display={glyphMin.toFixed(2)}
          onChange={setGlyphMin}
        />
        <Slider
          label="glyphGain"
          min={0}
          max={0.8}
          step={0.01}
          value={glyphGain}
          display={glyphGain.toFixed(2)}
          onChange={setGlyphGain}
        />
      </div>
    </main>
  );
}

"use client";

/**
 * /lab — art-direction surface for the SignalField ASCII canvas.
 * No page scroll: progress is driven straight into the scroll bus.
 */
import dynamic from "next/dynamic";
import { useState } from "react";
import { setScrollProgress } from "@/components/signal/scrollBus";
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

export default function LabPage() {
  const [progress, setProgress] = useState(0);
  const [cellPx, setCellPx] = useState(12);
  const [exposure, setExposure] = useState(1);
  const [underlayer, setUnderlayer] = useState(0.35);

  return (
    <main className="min-h-screen overflow-hidden bg-[#050508] text-neutral-300">
      <SignalField
        externalScroll
        cellPx={cellPx}
        exposure={exposure}
        underlayer={underlayer}
      />
      <CursorDot />
      <div className="fixed bottom-4 left-4 z-10 w-72 space-y-3 border border-white/10 bg-black/70 p-4 font-mono text-[11px] backdrop-blur">
        <div className="flex items-baseline justify-between">
          <span className="uppercase tracking-widest text-white/80">signal / lab</span>
          <span className="text-white/40">tuning</span>
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
      </div>
    </main>
  );
}

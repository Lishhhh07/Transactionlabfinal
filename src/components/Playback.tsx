"use client";

import { useEffect, useState } from "react";

interface Props {
  cursor: number;
  total: number;
  onChange: (cursor: number) => void;
}

const SPEEDS = [
  { label: "0.5×", ms: 1800 },
  { label: "1×", ms: 900 },
  { label: "2×", ms: 450 },
];

export default function Playback({ cursor, total, onChange }: Props) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const togglePlay = () => {
    if (cursor >= total) onChange(0);
    setPlaying((p) => !p);
  };
const isPlaying = playing && cursor < total;
          {isPlaying ? "⏸ Pause" : "▶ Play"}
  // Autoplay
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => onChange(cursor + 1), SPEEDS[speed].ms);
    return () => clearTimeout(t);
  }, [playing, cursor, total, speed, onChange]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      // Never steal keys while the person is typing or using a form control.
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      // A focused button already handles Space natively.
      if (e.key === " " && tag === "BUTTON") return;

      switch (e.key) {
        case "ArrowRight":
          setPlaying(false);
          onChange(Math.min(total, cursor + 1));
          break;
        case "ArrowLeft":
          setPlaying(false);
          onChange(Math.max(0, cursor - 1));
          break;
        case "Home":
          setPlaying(false);
          onChange(0);
          break;
        case "End":
          setPlaying(false);
          onChange(total);
          break;
        case " ":
          togglePlay();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const btn =
    "rounded border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-40";

  return (
    <div className="sticky top-2 z-20 rounded-md border border-slate-300 bg-white p-3 shadow">
      <div className="flex flex-wrap items-center gap-2">
        <button className={btn} disabled={cursor === 0} onClick={() => { setPlaying(false); onChange(0); }}>
          ⏮
        </button>
        <button className={btn} disabled={cursor === 0} onClick={() => { setPlaying(false); onChange(cursor - 1); }}>
          ◀ Prev
        </button>
        <button className={btn} onClick={togglePlay}>
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <button className={btn} disabled={cursor >= total} onClick={() => { setPlaying(false); onChange(cursor + 1); }}>
          Next ▶
        </button>
        <button className={btn} disabled={cursor >= total} onClick={() => { setPlaying(false); onChange(total); }}>
          ⏭
        </button>

        <div className="ml-2 flex overflow-hidden rounded border border-slate-300 text-xs">
          {SPEEDS.map((s, i) => (
            <button
              key={s.label}
              onClick={() => setSpeed(i)}
              className={`px-2 py-1 ${i === speed ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-100"}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <span className="ml-auto text-sm text-slate-500">
          Step {cursor} / {total}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={total}
        value={cursor}
        onChange={(e) => { setPlaying(false); onChange(Number(e.target.value)); }}
        className="mt-3 w-full"
      />
      <div className="mt-1 text-xs text-slate-400">← → step · Space play/pause · Home/End jump</div>
    </div>
  );
}
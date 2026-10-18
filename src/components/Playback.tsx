"use client";

import { useEffect, useState } from "react";

interface Props {
  cursor: number;
  total: number;
  onChange: (cursor: number) => void;
}

export default function Playback({ cursor, total, onChange }: Props) {
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    if (cursor >= total) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => onChange(cursor + 1), 900);
    return () => clearTimeout(t);
  }, [playing, cursor, total, onChange]);

  const btn =
    "rounded border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-40";

  return (
    <div className="rounded-md border border-slate-300 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className={btn} disabled={cursor === 0} onClick={() => { setPlaying(false); onChange(0); }}>
          ⏮
        </button>
        <button className={btn} disabled={cursor === 0} onClick={() => { setPlaying(false); onChange(cursor - 1); }}>
          ◀ Prev
        </button>
        <button
          className={btn}
          onClick={() => {
            if (cursor >= total) onChange(0);
            setPlaying((p) => !p);
          }}
        >
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <button className={btn} disabled={cursor >= total} onClick={() => { setPlaying(false); onChange(cursor + 1); }}>
          Next ▶
        </button>
        <button className={btn} disabled={cursor >= total} onClick={() => { setPlaying(false); onChange(total); }}>
          ⏭
        </button>
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
    </div>
  );
}
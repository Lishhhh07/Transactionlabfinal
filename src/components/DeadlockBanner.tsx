"use client";

import { DeadlockEvent } from "@/engine";

interface Props {
  events: DeadlockEvent[];
  cursor: number;
  onSelect: (cursor: number) => void;
}

export default function DeadlockBanner({ events, cursor, onSelect }: Props) {
  const visible = events.filter((e) => e.detectedAt < cursor);
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {visible.map((e, i) => {
        const cycleText = [...e.cycle, e.cycle[0]].join(" → ");
        const resolved = e.victimStep !== undefined && e.victimStep < cursor;
        return (
          <button
            key={i}
            onClick={() => onSelect((e.victimStep ?? e.detectedAt) + 1)}
            className={`block w-full rounded-md border p-3 text-left text-sm ${
              resolved
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : "border-red-300 bg-red-50 text-red-800"
            }`}
          >
            <div className="font-bold">
              {resolved ? "✓ DEADLOCK RESOLVED" : "⛔ DEADLOCK DETECTED"}: {cycleText}
            </div>
            <div className="mt-1">
              Each transaction in the cycle waits for a lock held by the next, so none can ever proceed.
              {e.victim === undefined && " Deadlock handling is off, so the simulation halts here."}
              {e.victim !== undefined && !resolved && ` The DBMS will abort ${e.victim}: ${e.reason}.`}
              {e.victim !== undefined && resolved && ` ${e.victim} was aborted (${e.reason}) and the others continued.`}
            </div>
            <div className="mt-1 text-xs opacity-70">click to jump</div>
          </button>
        );
      })}
    </div>
  );
}
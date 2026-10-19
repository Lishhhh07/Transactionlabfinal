"use client";

import { Anomaly } from "@/engine";

interface Props {
  anomalies: Anomaly[];
  cursor: number;
  total: number;
  stuck?: boolean; // the run ended frozen in a deadlock
  onSelect: (cursor: number) => void;
}

const KIND_STYLE: Record<Anomaly["kind"], string> = {
  LOST_UPDATE: "border-red-300 bg-red-50 text-red-800",
  DIRTY_READ: "border-orange-300 bg-orange-50 text-orange-800",
  NON_REPEATABLE_READ: "border-yellow-300 bg-yellow-50 text-yellow-900",
};

export default function AnomalyBanner({ anomalies, cursor, total, stuck, onSelect }: Props) {
  const visible = anomalies.filter((a) => a.at < cursor);

  if (visible.length === 0) {
    if (cursor === total && total > 0) {
      return stuck ? (
        <div className="rounded-md border border-slate-300 bg-slate-50 p-3 text-sm text-slate-600">
          The run halted in a deadlock before finishing. No data anomalies occurred before it stopped.
        </div>
      ) : (
        <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm font-semibold text-green-800">
          ✓ No anomalies detected in this schedule.
        </div>
      );
    }
    return (
      <div className="rounded-md border border-slate-300 bg-white p-3 text-sm text-slate-500">
        No anomalies so far…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {visible.map((a, i) => (
        <button
          key={i}
          onClick={() => onSelect(a.at + 1)}
          className={`block w-full rounded-md border p-3 text-left text-sm ${KIND_STYLE[a.kind]}`}
        >
          <div className="font-bold">
            ⚠ {a.title.toUpperCase()} on {a.item}
          </div>
          <div className="mt-1">{a.explanation}</div>
          <div className="mt-1 text-xs opacity-70">
            Steps involved: {a.steps.map((s) => s + 1).join(", ")} · click to jump
          </div>
        </button>
      ))}
    </div>
  );
}
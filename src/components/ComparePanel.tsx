"use client";

import { AnomalyKind, CcMode, CompareRow, MODE_LABEL } from "@/engine";

const KIND_LABEL: Record<AnomalyKind, string> = {
  LOST_UPDATE: "Lost update",
  DIRTY_READ: "Dirty read",
  NON_REPEATABLE_READ: "Non-repeatable read",
};

const VERDICT_STYLE: Record<CompareRow["verdict"], string> = {
  CLEAN: "text-green-700",
  ANOMALY: "text-red-700",
  NOT_SERIALIZABLE: "text-red-700",
  DEADLOCK: "text-amber-700",
  RESOLVED: "text-sky-700",
};

interface Props {
  rows: CompareRow[];
  current: CcMode;
  onPick: (mode: CcMode) => void;
}

export default function ComparePanel({ rows, current, onPick }: Props) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-300 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Same schedule under every mode (click a row to replay it)
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
            <th className="px-3 py-1">Mode</th>
            <th className="px-3 py-1">Result</th>
            <th className="px-3 py-1">Serializable?</th>
            <th className="px-3 py-1">Waits</th>
            <th className="px-3 py-1">Final DB</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.mode}
              onClick={() => onPick(r.mode)}
              className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${
                r.mode === current ? "bg-slate-100 font-semibold" : ""
              }`}
            >
              <td className="px-3 py-1.5">{MODE_LABEL[r.mode]}</td>
              <td className={`px-3 py-1.5 ${VERDICT_STYLE[r.verdict]}`}>
                {r.verdict === "CLEAN" && "✓ Clean"}
                {r.verdict === "DEADLOCK" && "⛔ Deadlock (halted)"}
                {r.verdict === "NOT_SERIALIZABLE" && "✗ Not serializable"}
                {r.verdict === "RESOLVED" &&
                  `🔁 Deadlock resolved (${r.deadlocksResolved} victim${r.deadlocksResolved === 1 ? "" : "s"})`}
                {r.verdict === "ANOMALY" && `⚠ ${r.anomalies.map((k) => KIND_LABEL[k]).join(", ")}`}
              </td>
              <td className="px-3 py-1.5">
                {r.serializable === null ? (
                  <span className="text-slate-400">–</span>
                ) : r.serializable ? (
                  <span className="text-green-700">✓</span>
                ) : (
                  <span className="text-red-700">✗</span>
                )}
              </td>
              <td className="px-3 py-1.5 text-slate-600">{r.blockedSteps}</td>
              <td className="px-3 py-1.5 font-mono text-xs text-slate-600">
                {r.deadlock
                  ? "stuck"
                  : Object.entries(r.finalDb).map(([k, v]) => `${k}=${v}`).join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
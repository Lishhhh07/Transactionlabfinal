"use client";

import { Anomaly, SimulationResult, opToString } from "@/engine";
import { styleOf } from "./colors";

interface Props {
  txnIds: string[];
  result: SimulationResult;
  cursor: number;
  anomalies: Anomaly[];
  onSelect: (cursor: number) => void;
}

export default function Timeline({ txnIds, result, cursor, anomalies, onSelect }: Props) {
  const visible = anomalies.filter((a) => a.at < cursor);
  const involved = new Set(visible.flatMap((a) => a.steps));
  const flagged = new Set(visible.map((a) => a.at));

  return (
    <div className="overflow-x-auto rounded-md border border-slate-300 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="w-14 px-2 py-2 text-left text-slate-500">#</th>
            {txnIds.map((id) => (
              <th key={id} className={`px-2 py-2 text-left font-bold ${styleOf(id).head}`}>
                {id}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.steps.map((s, i) => {
            const isCurrent = i === cursor - 1;
            const isFuture = i >= cursor;
            const blocked = s.outcome === "BLOCKED";
            const victim = s.outcome === "DEADLOCK_VICTIM";
            return (
              <tr
                key={i}
                onClick={() => onSelect(i + 1)}
                className={[
                  "cursor-pointer border-b border-slate-100",
                  isFuture ? "opacity-35" : "",
                  isCurrent ? "ring-2 ring-inset ring-slate-900" : "",
                ].join(" ")}
              >
                <td
                  className={`border-l-4 px-2 py-1.5 text-slate-500 ${
                    involved.has(i) ? "border-red-500" : "border-transparent"
                  }`}
                >
                  {flagged.has(i) && <span className="mr-1 text-red-600">⚠</span>}
                  {i + 1}
                </td>
                {txnIds.map((id) => (
                  <td
                    key={id}
                    className={`px-2 py-1.5 font-mono ${
                      s.txn === id
                        ? victim
                          ? "bg-red-100"
                          : blocked
                          ? "bg-amber-100"
                          : styleOf(id).cell
                        : ""
                    }`}
                  >
                    {s.txn === id && (
                      <>
                        <div>{opToString(s.op)}</div>
                        {victim ? (
                          <div className="text-xs font-semibold text-red-700">
                            💀 DEADLOCK VICTIM (aborted)
                          </div>
                        ) : blocked ? (
                          <div className="text-xs font-semibold text-amber-700">
                            ⏳ BLOCKED by {s.blockedBy?.join(", ")}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500">
                            {s.resumed && (
                              <span className="mr-1 font-semibold text-emerald-700">▶ resumed</span>
                            )}
                            {s.op.type === "READ" && `→ ${s.valueRead}`}
                            {s.op.type === "WRITE" && `${s.before} → ${s.after}`}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
"use client";

import { SimulationResult, opToString } from "@/engine";
import { styleOf } from "./colors";

interface Props {
  txnIds: string[];
  result: SimulationResult;
  cursor: number;                 // number of steps "executed" so far
  onSelect: (cursor: number) => void;
}

export default function Timeline({ txnIds, result, cursor, onSelect }: Props) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-300 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="w-12 px-2 py-2 text-left text-slate-500">#</th>
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
                <td className="px-2 py-1.5 text-slate-500">{i + 1}</td>
                {txnIds.map((id) => (
                  <td
                    key={id}
                    className={`px-2 py-1.5 font-mono ${s.txn === id ? styleOf(id).cell : ""}`}
                  >
                    {s.txn === id && (
                      <>
                        <div>{opToString(s.op)}</div>
                        <div className="text-xs text-slate-500">
                          {s.op.type === "READ" && `→ ${s.valueRead}`}
                          {s.op.type === "WRITE" && `${s.before} → ${s.after}`}
                        </div>
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
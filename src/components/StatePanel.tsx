"use client";

import { Scenario, SimulationResult, TxnSnapshot } from "@/engine";
import { styleOf } from "./colors";

interface Props {
  scenario: Scenario;
  result: SimulationResult;
  cursor: number;
}

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-slate-200 text-slate-700",
  COMMITTED: "bg-green-100 text-green-800",
  ABORTED: "bg-red-100 text-red-800",
};

export default function StatePanel({ scenario, result, cursor }: Props) {
  const step = cursor > 0 ? result.steps[cursor - 1] : null;

  const db = step ? step.dbAfter : scenario.initialDb;

  const txns: Record<string, TxnSnapshot> = step
    ? step.txnsAfter
    : Object.fromEntries(
        scenario.transactions.map((t) => [t.id, { status: "ACTIVE" as const, nextOp: 0, locals: {} }])
      );

  const changedItem = step && step.after !== undefined ? step.item : undefined;

  return (
    <div className="space-y-4">
      {/* Explanation of current step */}
      <div className="min-h-[3.5rem] rounded-md border border-slate-300 bg-white p-3 text-sm">
        {step ? (
          <>
            <span className="mr-2 font-semibold text-slate-500">Step {step.index + 1}:</span>
            {step.message}
          </>
        ) : (
          <span className="text-slate-400">Press Next or drag the slider to start.</span>
        )}
      </div>

      {/* Database */}
      <div>
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Database
        </h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(db).map(([item, value]) => (
            <div
              key={item}
              className={`rounded-md border px-4 py-2 text-center transition-colors ${
                item === changedItem
                  ? "border-amber-400 bg-amber-100"
                  : "border-slate-300 bg-white"
              }`}
            >
              <div className="text-xs text-slate-500">{item}</div>
              <div className="font-mono text-xl font-bold">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Transactions */}
      <div>
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Transactions
        </h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {scenario.transactions.map((t) => {
            const snap = txns[t.id];
            const locals = Object.entries(snap.locals);
            return (
              <div key={t.id} className="rounded-md border border-slate-300 bg-white p-2">
                <div className="flex items-center justify-between">
                  <span className={`font-bold ${styleOf(t.id).head}`}>{t.id}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[snap.status]}`}>
                    {snap.status}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Progress: {snap.nextOp}/{t.ops.length} ops
                </div>
                <div className="mt-1 font-mono text-xs">
                  Local reads:{" "}
                  {locals.length === 0
                    ? "none"
                    : locals.map(([k, v]) => `${k}=${v}`).join(", ")}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
"use client";

import { DraftScenario, countOps } from "@/scenarios/draft";
import { PRESETS } from "@/scenarios/presets";
import { styleOf } from "./colors";

const MAX_TXNS = 4;

interface Props {
  draft: DraftScenario;
  onChange: (d: DraftScenario) => void;
  onRun: () => void;
  error: string | null;
}

export default function ScenarioBuilder({ draft, onChange, onRun, error }: Props) {
  const set = (patch: Partial<DraftScenario>) => onChange({ ...draft, ...patch });

  const setOps = (id: string, ops: string) =>
    set({ txns: draft.txns.map((t) => (t.id === id ? { ...t, ops } : t)) });

  const addTxn = () => {
    if (draft.txns.length >= MAX_TXNS) return;
    set({ txns: [...draft.txns, { id: `T${draft.txns.length + 1}`, ops: "READ(A)\nCOMMIT" }] });
  };

  const removeLastTxn = () => {
    if (draft.txns.length <= 1) return;
    const last = draft.txns[draft.txns.length - 1].id;
    set({
      txns: draft.txns.slice(0, -1),
      schedule: draft.schedule.filter((id) => id !== last),
    });
  };

  const used = (id: string) => draft.schedule.filter((x) => x === id).length;

  const addToSchedule = (id: string) => set({ schedule: [...draft.schedule, id] });
  const undoSchedule = () => set({ schedule: draft.schedule.slice(0, -1) });
  const clearSchedule = () => set({ schedule: [] });

  const serial = () =>
    set({ schedule: draft.txns.flatMap((t) => Array(countOps(draft, t.id)).fill(t.id)) });

  const roundRobin = () => {
    const remaining = Object.fromEntries(draft.txns.map((t) => [t.id, countOps(draft, t.id)]));
    const out: string[] = [];
    let left = Object.values(remaining).reduce((a, b) => a + b, 0);
    while (left > 0) {
      for (const t of draft.txns) {
        if (remaining[t.id] > 0) {
          out.push(t.id);
          remaining[t.id]--;
          left--;
        }
      }
    }
    set({ schedule: out });
  };

  return (
    <div className="space-y-5">
      {/* Presets */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Presets</h2>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              title={p.description}
              onClick={() => onChange(structuredClone(p.draft))}
              className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-100"
            >
              {p.name}
            </button>
          ))}
        </div>
      </section>

      {/* Database */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Initial database
        </h2>
        <input
          value={draft.db}
          onChange={(e) => set({ db: e.target.value })}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
          placeholder="A=1000, B=500"
        />
      </section>

      {/* Transactions */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Transactions
          </h2>
          <div className="flex gap-2">
            <button
              onClick={addTxn}
              disabled={draft.txns.length >= MAX_TXNS}
              className="rounded border border-slate-300 bg-white px-2 py-0.5 text-sm hover:bg-slate-100 disabled:opacity-40"
            >
              + Add
            </button>
            <button
              onClick={removeLastTxn}
              disabled={draft.txns.length <= 1}
              className="rounded border border-slate-300 bg-white px-2 py-0.5 text-sm hover:bg-slate-100 disabled:opacity-40"
            >
              − Remove last
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {draft.txns.map((t) => (
            <div key={t.id} className={`rounded-md border p-2 ${styleOf(t.id).chip}`}>
              <div className="mb-1 text-sm font-bold">{t.id}</div>
              <textarea
                value={t.ops}
                onChange={(e) => setOps(t.id, e.target.value)}
                rows={5}
                spellCheck={false}
                className="w-full rounded border border-slate-300 bg-white p-2 font-mono text-sm text-slate-900"
              />
            </div>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          One operation per line: <code>READ(A)</code>, <code>WRITE(A, 800)</code>,{" "}
          <code>WRITE(A, A-200)</code>, <code>COMMIT</code>, <code>ROLLBACK</code>
        </p>
      </section>

      {/* Schedule */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Schedule (execution order)
        </h2>

        <div className="mb-2 flex flex-wrap gap-2">
          {draft.txns.map((t) => {
            const total = countOps(draft, t.id);
            const u = used(t.id);
            return (
              <button
                key={t.id}
                onClick={() => addToSchedule(t.id)}
                disabled={u >= total}
                className={`rounded-md border px-3 py-1 text-sm font-semibold disabled:opacity-40 ${styleOf(t.id).chip}`}
                title={`Run the next operation of ${t.id}`}
              >
                + {t.id} <span className="font-normal">({u}/{total})</span>
              </button>
            );
          })}
        </div>

        <div className="min-h-[2.5rem] rounded-md border border-dashed border-slate-300 bg-white p-2">
          {draft.schedule.length === 0 ? (
            <span className="text-sm text-slate-400">Click the buttons above to add steps…</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {draft.schedule.map((id, i) => (
                <span
                  key={i}
                  className={`rounded border px-2 py-0.5 text-xs font-semibold ${styleOf(id).chip}`}
                >
                  {i + 1}·{id}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <button onClick={undoSchedule} className="rounded border border-slate-300 bg-white px-2 py-0.5 hover:bg-slate-100">
            Undo last
          </button>
          <button onClick={clearSchedule} className="rounded border border-slate-300 bg-white px-2 py-0.5 hover:bg-slate-100">
            Clear
          </button>
          <button onClick={serial} className="rounded border border-slate-300 bg-white px-2 py-0.5 hover:bg-slate-100">
            Auto: serial
          </button>
          <button onClick={roundRobin} className="rounded border border-slate-300 bg-white px-2 py-0.5 hover:bg-slate-100">
            Auto: interleaved
          </button>
        </div>
      </section>

      {/* Run */}
      <section>
        <button
          onClick={onRun}
          className="w-full rounded-md bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700"
        >
          ▶ Run simulation
        </button>
        {error && (
          <p className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
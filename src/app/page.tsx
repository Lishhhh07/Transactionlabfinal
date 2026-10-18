"use client";

import { useState } from "react";
import { Scenario, SimulationResult, simulate } from "@/engine";
import { DraftScenario, buildScenario } from "@/scenarios/draft";
import { PRESETS } from "@/scenarios/presets";
import ScenarioBuilder from "@/components/ScenarioBuilder";
import Timeline from "@/components/Timeline";
import Playback from "@/components/Playback";
import StatePanel from "@/components/StatePanel";

interface Run {
  scenario: Scenario;
  result: SimulationResult;
}

export default function Home() {
  const [draft, setDraft] = useState<DraftScenario>(() => structuredClone(PRESETS[0].draft));
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);

  const handleRun = () => {
    const built = buildScenario(draft);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    try {
      const result = simulate(built.scenario);
      setRun({ scenario: built.scenario, result });
      setError(null);
      setCursor(0);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const total = run?.result.steps.length ?? 0;

  return (
    <main className="mx-auto max-w-7xl p-4 lg:p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">TransactionLab</h1>
        <p className="text-sm text-slate-500">
          Build concurrent transactions, run a schedule, and watch what happens inside the database.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <ScenarioBuilder draft={draft} onChange={setDraft} onRun={handleRun} error={error} />

        <div className="space-y-4">
          {run ? (
            <>
              <Playback cursor={cursor} total={total} onChange={setCursor} />
              <Timeline
                txnIds={run.scenario.transactions.map((t) => t.id)}
                result={run.result}
                cursor={cursor}
                onSelect={setCursor}
              />
              <StatePanel scenario={run.scenario} result={run.result} cursor={cursor} />
            </>
          ) : (
            <div className="rounded-md border border-dashed border-slate-300 p-10 text-center text-slate-400">
              Pick a preset and press <b>Run simulation</b>.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
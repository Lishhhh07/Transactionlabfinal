"use client";

import { useEffect, useState } from "react";
import {
  ALL_MODES,
  Anomaly,
  CompareRow,
  DeadlockMode,
  MODE_BLURB,
  MODE_LABEL,
  Scenario,
  SimulationResult,
  VictimPolicy,
  compareModes,
  detectAnomalies,
  simulate,
} from "@/engine";
import { DraftScenario, buildScenario } from "@/scenarios/draft";
import { LESSONS, Look, Variant, beatAt, viewOf } from "@/scenarios/lessons";
import { PRESETS } from "@/scenarios/presets";
import { DEFAULT_SETTINGS, Settings, simOptions } from "@/scenarios/settings";
import ScenarioBuilder from "@/components/ScenarioBuilder";
import Timeline from "@/components/Timeline";
import Playback from "@/components/Playback";
import StatePanel from "@/components/StatePanel";
import AnomalyBanner from "@/components/AnomalyBanner";
import ComparePanel from "@/components/ComparePanel";
import DeadlockBanner from "@/components/DeadlockBanner";
import WaitForGraph from "@/components/WaitForGraph";
import PrecedenceGraph from "@/components/PrecedenceGraph";
import LearnPanel from "@/components/LearnPanel";
import Spot from "@/components/Spot";
import Tour from "@/components/Tour";

type View = "sandbox" | "learn";

const DEADLOCK_CHOICES: { value: DeadlockMode; label: string }[] = [
  { value: "ABORT_VICTIM", label: "Detect & abort a victim" },
  { value: "HALT", label: "Halt (just freeze)" },
];

const VICTIM_CHOICES: { value: VictimPolicy; label: string }[] = [
  { value: "YOUNGEST", label: "Youngest" },
  { value: "OLDEST", label: "Oldest" },
  { value: "FEWEST_WRITES", label: "Fewest writes" },
];

interface Run {
  scenario: Scenario;
  result: SimulationResult;
  anomalies: Anomaly[];
  settings: Settings;
  compare: CompareRow[];
}

const chip = (active: boolean) =>
  `rounded-md border px-3 py-1 ${
    active
      ? "border-slate-900 bg-slate-900 text-white"
      : "border-slate-300 bg-white hover:bg-slate-100"
  }`;

const TOUR_KEY = "transactionlab-tour-seen";

export default function Home() {
  const [view, setView] = useState<View>("sandbox");
  const [lessonId, setLessonId] = useState(LESSONS[0].id);
  const [variant, setVariant] = useState<Variant>("problem");

  const [draft, setDraft] = useState<DraftScenario>(() => structuredClone(PRESETS[0].draft));
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [tourOpen, setTourOpen] = useState(false);

  // Show the tour once, on a first visit.
    // Show the tour once, on a first visit. This is a one-time sync with browser storage on mount.
  useEffect(() => {
    try {
      if (!localStorage.getItem(TOUR_KEY)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTourOpen(true);
      }
    } catch {
      /* storage can be blocked; the Tour button still works */
    }
  }, []);

  const closeTour = () => {
    setTourOpen(false);
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const execute = (d: DraftScenario, s: Settings) => {
    const built = buildScenario(d);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    try {
      const result = simulate(built.scenario, simOptions(s));
      const anomalies = detectAnomalies(result.steps);
      const compare = compareModes(built.scenario, { deadlock: s.deadlock, victim: s.victim });
      setRun({ scenario: built.scenario, result, anomalies, settings: s, compare });
      setError(null);
      setCursor(0);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleRun = () => execute(draft, settings);

  /** Sandbox: change a setting and replay the same scenario under it. */
  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (run) execute(draft, next);
  };

  /** Learn: load a lesson's preset and settings, and run it. */
  const openLesson = (id: string, v: Variant) => {
    const lesson = LESSONS.find((l) => l.id === id);
    const preset = lesson && PRESETS.find((p) => p.name === lesson.preset);
    if (!lesson || !preset) return;
    const d = structuredClone(preset.draft);
    const s = viewOf(lesson, v).settings;
    setLessonId(id);
    setVariant(v);
    setDraft(d);
    setSettings(s);
    execute(d, s);
  };

  const switchView = (v: View) => {
    setView(v);
    if (v === "learn") openLesson(lessonId, variant);
    // Going back to the sandbox keeps the lesson's scenario so you can tinker with it.
  };

  const total = run?.result.steps.length ?? 0;
  const stuck = !!run && run.result.blockedAtEnd.length > 0;
  const locks = run && cursor > 0 ? run.result.steps[cursor - 1].locksAfter : [];
  const txnIds = run ? run.scenario.transactions.map((t) => t.id) : [];

  const lesson = LESSONS.find((l) => l.id === lessonId)!;
  const look: Look | undefined =
    view === "learn" ? beatAt(viewOf(lesson, variant).beats, cursor).look : undefined;

  return (
    <main className="mx-auto max-w-7xl p-4 lg:p-6">
      <Tour open={tourOpen} onClose={closeTour} />

      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">TransactionLab</h1>
          <p className="text-sm text-slate-500">
            Build concurrent transactions, run a schedule, and watch what happens inside the database.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <div className="flex overflow-hidden rounded-md border border-slate-300">
            {(["sandbox", "learn"] as const).map((v) => (
              <button
                key={v}
                onClick={() => switchView(v)}
                className={`px-3 py-1.5 ${
                  view === v ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-100"
                }`}
              >
                {v === "sandbox" ? "🧪 Sandbox" : "🎓 Learn"}
              </button>
            ))}
          </div>
          <button
            onClick={() => setTourOpen(true)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-100"
          >
            ? Tour
          </button>
        </div>
      </header>

      {/* Mode controls (sandbox only: lessons choose their own settings) */}
      {view === "sandbox" && (
        <div className="mb-6 space-y-4 rounded-md border border-slate-300 bg-white p-3 text-sm">
          <div>
            <div className="mb-2 font-semibold uppercase tracking-wide text-slate-500">
              Isolation level
            </div>
            <div className="flex flex-wrap gap-2">
              {ALL_MODES.map((m) => (
                <button key={m} onClick={() => update({ mode: m })} className={chip(settings.mode === m)}>
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">{MODE_BLURB[settings.mode]}</p>
          </div>

          <div>
            <div className="mb-2 font-semibold uppercase tracking-wide text-slate-500">
              When a deadlock happens
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {DEADLOCK_CHOICES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => update({ deadlock: c.value })}
                  className={chip(settings.deadlock === c.value)}
                >
                  {c.label}
                </button>
              ))}
              {settings.deadlock === "ABORT_VICTIM" && (
                <>
                  <span className="ml-2 text-xs text-slate-500">Victim:</span>
                  {VICTIM_CHOICES.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => update({ victim: c.value })}
                      className={chip(settings.victim === c.value)}
                    >
                      {c.label}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* LEFT: builder or lesson */}
        {view === "learn" ? (
          <div className="lg:sticky lg:top-2 lg:self-start">
            <LearnPanel
              lessons={LESSONS}
              lessonId={lessonId}
              variant={variant}
              cursor={cursor}
              total={total}
              onPick={(id) => openLesson(id, "problem")}
              onVariant={(v) => openLesson(lessonId, v)}
              onJump={setCursor}
              onSandbox={() => switchView("sandbox")}
            />
          </div>
        ) : (
          <ScenarioBuilder draft={draft} onChange={setDraft} onRun={handleRun} error={error} />
        )}

        {/* RIGHT: visualisation */}
        <div className="space-y-4">
          {run ? (
            <>
              {view === "sandbox" && (
                <details open>
                  <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Compare all modes
                  </summary>
                  <div className="mt-2">
                    <ComparePanel
                      rows={run.compare}
                      current={run.settings.mode}
                      onPick={(m) => update({ mode: m })}
                    />
                  </div>
                </details>
              )}

              <Playback cursor={cursor} total={total} onChange={setCursor} />

              <DeadlockBanner events={run.result.deadlocks} cursor={cursor} onSelect={setCursor} />

              <Spot on={look === "anomaly"}>
                <AnomalyBanner
                  anomalies={run.anomalies}
                  cursor={cursor}
                  total={total}
                  stuck={stuck}
                  onSelect={setCursor}
                />
              </Spot>

              <Spot on={look === "timeline"}>
                <Timeline
                  txnIds={txnIds}
                  result={run.result}
                  cursor={cursor}
                  anomalies={run.anomalies}
                  onSelect={setCursor}
                />
              </Spot>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Spot on={look === "waitfor"}>
                  <WaitForGraph
                    txnIds={txnIds}
                    locks={locks}
                    enabled={run.settings.mode !== "NONE"}
                  />
                </Spot>
                <Spot on={look === "precedence"}>
                  <PrecedenceGraph txnIds={txnIds} steps={run.result.steps} cursor={cursor} />
                </Spot>
              </div>

              <Spot on={look === "state"}>
                <StatePanel
                  scenario={run.scenario}
                  result={run.result}
                  cursor={cursor}
                  locking={run.settings.mode === "NONE" ? "NONE" : "STRICT_2PL"}
                />
              </Spot>
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
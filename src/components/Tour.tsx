"use client";

import { useState } from "react";

const STEPS = [
  {
    title: "Welcome to TransactionLab",
    body: "A database runs many transactions at once. This tool lets you build a concurrent schedule and watch exactly what the DBMS does with it: locks, waits, deadlocks and all.",
  },
  {
    title: "Sandbox: build your own",
    body: "On the left, write each transaction (READ, WRITE, COMMIT, ROLLBACK), then click the +T1 / +T2 buttons to choose the execution order. Press Run simulation.",
  },
  {
    title: "Play it back",
    body: "Use Next / Prev, the slider, or the keyboard: ← → to step, Space to play and pause, Home / End to jump. Everything on the right rewinds together.",
  },
  {
    title: "Choose the rules",
    body: "Pick an isolation level and what happens on a deadlock. The comparison table runs the same schedule under every mode, so you can see which ones allow which problems.",
  },
  {
    title: "Read the verdicts",
    body: "Banners flag anomalies and deadlocks. The lock table and wait-for graph show who is waiting for whom. The precedence graph tells you whether the schedule is serializable.",
  },
  {
    title: "Learn mode",
    body: "Switch to the Learn tab for guided lessons. Each one narrates a classic problem step by step, then lets you apply the fix and watch the same schedule behave differently.",
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function Tour({ open, onClose }: Props) {
  const [i, setI] = useState(0);
  if (!open) return null;

  const last = i === STEPS.length - 1;
  const close = () => {
    setI(0);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={close}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Tour · {i + 1} / {STEPS.length}
        </div>
        <h2 className="mt-1 text-lg font-bold">{STEPS[i].title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{STEPS[i].body}</p>

        <div className="mt-5 flex items-center justify-between">
          <button onClick={close} className="text-sm text-slate-500 hover:underline">
            Skip
          </button>
          <div className="flex gap-2">
            <button
              disabled={i === 0}
              onClick={() => setI(i - 1)}
              className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-40"
            >
              Back
            </button>
            <button
              onClick={() => (last ? close() : setI(i + 1))}
              className="rounded-md bg-slate-900 px-3 py-1 text-sm font-semibold text-white hover:bg-slate-700"
            >
              {last ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
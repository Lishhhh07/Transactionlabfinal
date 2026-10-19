"use client";

import { MODE_LABEL } from "@/engine";
import { Lesson, Variant, beatAt, viewOf } from "@/scenarios/lessons";

interface Props {
  lessons: Lesson[];
  lessonId: string;
  variant: Variant;
  cursor: number;
  total: number;
  onPick: (id: string) => void;
  onVariant: (v: Variant) => void;
  onJump: (cursor: number) => void;
  onSandbox: () => void;
}

const btn = "rounded-md border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-100";

export default function LearnPanel({
  lessons,
  lessonId,
  variant,
  cursor,
  total,
  onPick,
  onVariant,
  onJump,
  onSandbox,
}: Props) {
  const lesson = lessons.find((l) => l.id === lessonId)!;
  const v = viewOf(lesson, variant);
  const beat = beatAt(v.beats, cursor);
  const done = total > 0 && cursor === total;
  const idx = lessons.findIndex((l) => l.id === lessonId);
  const next = lessons[idx + 1];

  return (
    <div className="space-y-4">
      {/* Lesson picker */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Lessons</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {lessons.map((l, i) => (
            <button
              key={l.id}
              onClick={() => onPick(l.id)}
              className={`rounded-md border p-2 text-left ${
                l.id === lessonId
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-slate-300 bg-white hover:bg-slate-50"
              }`}
            >
              <div className="text-sm font-bold">
                {i + 1}. {l.title}
              </div>
              <div className="text-xs text-slate-500">{l.blurb}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Problem / fix tabs */}
      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            onClick={() => onVariant("problem")}
            className={`rounded-md border px-3 py-1 text-sm ${
              variant === "problem"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white hover:bg-slate-100"
            }`}
          >
            The problem
          </button>
          {lesson.fix && (
            <button
              onClick={() => onVariant("fix")}
              className={`rounded-md border px-3 py-1 text-sm ${
                variant === "fix"
                  ? "border-emerald-700 bg-emerald-700 text-white"
                  : "border-slate-300 bg-white hover:bg-slate-100"
              }`}
            >
              The fix: {lesson.fix.label}
            </button>
          )}
          <span className="ml-auto text-xs text-slate-500">
            Isolation: <b>{MODE_LABEL[v.settings.mode]}</b>
          </span>
        </div>

        {/* Narration */}
        <div className="rounded-md border border-indigo-200 bg-indigo-50 p-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-600">
            {cursor === 0 ? "Setup" : `Step ${cursor} of ${total}`}
          </div>
          <p className="text-base leading-relaxed text-slate-900">{beat.text}</p>
        </div>

        {/* Story chapters */}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs text-slate-500">Jump to:</span>
          {v.beats.map((b) => (
            <button
              key={b.at}
              onClick={() => onJump(b.at)}
              className={`rounded border px-2 py-0.5 text-xs ${
                b === beat
                  ? "border-indigo-500 bg-indigo-100 font-semibold"
                  : "border-slate-300 bg-white hover:bg-slate-100"
              }`}
            >
              {b.at === 0 ? "Setup" : b.at}
            </button>
          ))}
        </div>
      </section>

      {/* Ending */}
      {done && (
        <section className="space-y-3 rounded-md border border-green-300 bg-green-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-green-700">Takeaway</div>
          <p className="text-sm text-slate-900">{v.takeaway}</p>
          <div className="flex flex-wrap gap-2">
            {variant === "problem" && lesson.fix && (
              <button
                onClick={() => onVariant("fix")}
                className="rounded-md bg-emerald-700 px-3 py-1 text-sm font-semibold text-white hover:bg-emerald-800"
              >
                Apply the fix: {lesson.fix.label} →
              </button>
            )}
            {variant === "fix" && (
              <button onClick={() => onVariant("problem")} className={btn}>
                ← Back to the problem
              </button>
            )}
            <button onClick={onSandbox} className={btn}>
              🧪 Open in sandbox
            </button>
            {next && (
              <button onClick={() => onPick(next.id)} className={btn}>
                Next lesson: {next.title} →
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
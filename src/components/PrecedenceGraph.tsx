"use client";

import { TraceStep, analyzeSerializability, describeConflict } from "@/engine";
import { H, NODE, W, edgePath, point } from "./graphGeo";

interface Props {
  txnIds: string[];
  steps: TraceStep[];
  cursor: number;
}

export default function PrecedenceGraph({ txnIds, steps, cursor }: Props) {
  const r = analyzeSerializability(steps.slice(0, cursor));
  const committed = new Set(r.nodes);
  const inCycle = new Set(r.cycle ?? []);
  const hot = new Set<string>();
  r.cycle?.forEach((from, i) => hot.add(`${from}>${r.cycle![(i + 1) % r.cycle!.length]}`));

  // Layout uses ALL transactions so nodes don't jump around as others commit.
  const pos = new Map(txnIds.map((id, i) => [id, point(i, txnIds.length)]));
  const finished = cursor === steps.length;

  return (
    <div className="rounded-md border border-slate-300 bg-white p-3">
      <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Precedence graph (serializability)
      </h3>

      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto h-44 w-full max-w-xs">
        <defs>
          <marker id="pg-arrow-grey" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="#64748b" />
          </marker>
          <marker id="pg-arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="#dc2626" />
          </marker>
        </defs>

        {r.edges.map((e) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          const isHot = hot.has(`${e.from}>${e.to}`);
          return (
            <path
              key={`${e.from}>${e.to}`}
              pathLength={1}
              className="edge-draw"
              d={edgePath(a, b)}
              fill="none"
              stroke={isHot ? "#dc2626" : "#64748b"}
              strokeWidth={2}
              markerEnd={`url(#pg-arrow-${isHot ? "red" : "grey"})`}
            />
          );
        })}

        {txnIds.map((id) => {
          const p = pos.get(id)!;
          const isIn = committed.has(id);
          return (
            <g key={id} opacity={isIn ? 1 : 0.4}>
              <circle
                cx={p.x}
                cy={p.y}
                r={NODE}
                fill={inCycle.has(id) ? "#fee2e2" : "#ffffff"}
                stroke={inCycle.has(id) ? "#dc2626" : "#94a3b8"}
                strokeWidth={2}
                strokeDasharray={isIn ? undefined : "4 3"}
              />
              <text
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="13"
                fontWeight="bold"
                fill="#0f172a"
              >
                {id}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Verdict */}
      {r.nodes.length === 0 ? (
        <p className="text-center text-xs text-slate-400">
          Nothing has committed yet. Only committed transactions are analysed, so edges appear as
          transactions commit.
        </p>
      ) : r.serializable ? (
        <p className="rounded border border-green-300 bg-green-50 p-2 text-center text-sm font-semibold text-green-800">
          ✓ Conflict-serializable. Equivalent serial order: {r.serialOrder!.join(" → ")}
        </p>
      ) : (
        <p className="rounded border border-red-300 bg-red-50 p-2 text-center text-sm font-semibold text-red-800">
          ✗ Not conflict-serializable. Cycle: {[...r.cycle!, r.cycle![0]].join(" → ")}
        </p>
      )}

      {/* Why each edge exists */}
      {r.edges.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-slate-600">
          {r.edges.map((e) => (
            <li
              key={`${e.from}>${e.to}`}
              className={hot.has(`${e.from}>${e.to}`) ? "font-semibold text-red-700" : ""}
            >
              <span className="font-mono">
                {e.from} → {e.to}
              </span>{" "}
              ({[...new Set(e.conflicts.map((c) => `${c.kind} on ${c.item}`))].join(", ")}):{" "}
              {describeConflict(e.conflicts[0])}
            </li>
          ))}
        </ul>
      )}

      {finished && r.ignored.length > 0 && (
        <p className="mt-2 text-xs text-slate-400">
          Ignored (never committed): {r.ignored.join(", ")}
        </p>
      )}
    </div>
  );
}
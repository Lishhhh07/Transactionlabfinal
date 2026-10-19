"use client";

import { LockRow, cycleEdges, findCycle, waitForEdges } from "@/engine";
import { H, NODE, W, edgePath, point } from "./graphGeo";

interface Props {
  txnIds: string[];
  locks: LockRow[];
  enabled: boolean; // false when locking is off
}


export default function WaitForGraph({ txnIds, locks, enabled }: Props) {
  const edges = waitForEdges(locks);
  const cycle = findCycle(edges);
  const hot = new Set(cycleEdges(edges, cycle ?? []).map((e) => `${e.from}>${e.to}`));
  const inCycle = new Set(cycle ?? []);

  const pos = new Map(txnIds.map((id, i) => [id, point(i, txnIds.length)]));

  // One arrow per (from,to) pair, even if they wait on several items.
  const drawn = new Map<string, (typeof edges)[number]>();
  for (const e of edges) drawn.set(`${e.from}>${e.to}`, e);

  return (
    <div className="rounded-md border border-slate-300 bg-white p-3">
      <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Wait-for graph
      </h3>

      {!enabled ? (
        <p className="text-xs text-slate-400">Locking is off, so nobody ever waits.</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto h-44 w-full max-w-xs">
            <defs>
              <marker id="arrow-grey" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill="#64748b" />
              </marker>
              <marker id="arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill="#dc2626" />
              </marker>
            </defs>

            {[...drawn.entries()].map(([key, e]) => {
              const a = pos.get(e.from);
              const b = pos.get(e.to);
              if (!a || !b) return null;
              const isHot = hot.has(key);
              return (
                <path
                  key={key}
                  pathLength={1}
                  className="edge-draw"
                  d={edgePath(a, b)}
                  fill="none"
                  stroke={isHot ? "#dc2626" : "#64748b"}
                  strokeWidth={2}
                  markerEnd={`url(#arrow-${isHot ? "red" : "grey"})`}
                />
              );
            })}

            {txnIds.map((id) => {
              const p = pos.get(id)!;
              return (
                <g key={id}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={NODE}
                    fill={inCycle.has(id) ? "#fee2e2" : "#ffffff"}
                    stroke={inCycle.has(id) ? "#dc2626" : "#94a3b8"}
                    strokeWidth={2}
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

          {edges.length === 0 ? (
            <p className="text-center text-xs text-slate-400">Nobody is waiting.</p>
          ) : (
            <ul className="space-y-0.5 text-center font-mono text-xs text-slate-600">
              {edges.map((e, i) => (
                <li key={i} className={hot.has(`${e.from}>${e.to}`) ? "font-bold text-red-700" : ""}>
                  {e.from} → {e.to} <span className="text-slate-400">(waits for {e.item})</span>
                </li>
              ))}
            </ul>
          )}
          {cycle && (
            <p className="mt-1 text-center text-xs font-bold text-red-700">
              Cycle: {[...cycle, cycle[0]].join(" → ")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
import { LockRow, TxnId, VictimPolicy, WaitEdge } from "./types";

/**
 * Build the wait-for graph from a lock-table snapshot.
 * For every waiter W on item X, add W → H for each holder H whose lock conflicts with W's request.
 */
export function waitForEdges(rows: LockRow[]): WaitEdge[] {
  const edges: WaitEdge[] = [];
  for (const row of rows) {
    for (const w of row.waiting) {
      for (const h of row.holders) {
        if (h.txn === w.txn) continue;
        // S vs S is compatible. Everything else conflicts.
        const conflict = w.mode === "X" || h.mode === "X";
        if (conflict) edges.push({ from: w.txn, to: h.txn, item: row.item });
      }
    }
  }
  return edges;
}

/**
 * DFS cycle detection. Returns the cycle as an ordered list (T1 → T2 → T3 → back to T1),
 * or null if the graph has no cycle.
 *
 * colour 0 = not visited, 1 = on the current DFS path, 2 = finished.
 * Meeting a colour-1 node again means we walked back into our own path: a cycle.
 */
export function findCycle(edges: WaitEdge[]): TxnId[] | null {
  const adj = new Map<TxnId, TxnId[]>();
  for (const e of edges) {
    const list = adj.get(e.from) ?? [];
    if (!list.includes(e.to)) list.push(e.to);
    adj.set(e.from, list);
  }

  const nodes = [...new Set(edges.flatMap((e) => [e.from, e.to]))].sort();
  const colour = new Map<TxnId, 0 | 1 | 2>();
  const path: TxnId[] = [];

  const dfs = (u: TxnId): TxnId[] | null => {
    colour.set(u, 1);
    path.push(u);
    for (const v of adj.get(u) ?? []) {
      const c = colour.get(v) ?? 0;
      if (c === 1) return path.slice(path.indexOf(v)); // found: cut the cycle out of the path
      if (c === 0) {
        const found = dfs(v);
        if (found) return found;
      }
    }
    path.pop();
    colour.set(u, 2);
    return null;
  };

  for (const n of nodes) {
    if ((colour.get(n) ?? 0) === 0) {
      const found = dfs(n);
      if (found) return found;
    }
  }
  return null;
}

/** The edges that make up a given cycle (for highlighting). */
export function cycleEdges(edges: WaitEdge[], cycle: TxnId[]): WaitEdge[] {
  const out: WaitEdge[] = [];
  cycle.forEach((from, i) => {
    const to = cycle[(i + 1) % cycle.length];
    const e = edges.find((x) => x.from === from && x.to === to);
    if (e) out.push(e);
  });
  return out;
}

// ───────────────────────── Victim selection ─────────────────────────

export interface VictimInfo {
  startOrder: number; // smaller = started earlier (older)
  writes: number;     // size of the undo log = cost of rolling back
}

export function chooseVictim(
  cycle: TxnId[],
  info: Record<TxnId, VictimInfo>,
  policy: VictimPolicy
): { victim: TxnId; reason: string } {
  const youngestOf = (ids: TxnId[]) =>
    ids.reduce((a, b) => (info[b].startOrder > info[a].startOrder ? b : a));
  const oldestOf = (ids: TxnId[]) =>
    ids.reduce((a, b) => (info[b].startOrder < info[a].startOrder ? b : a));

  if (policy === "OLDEST") {
    const v = oldestOf(cycle);
    return { victim: v, reason: `${v} is the oldest transaction in the cycle` };
  }

  if (policy === "FEWEST_WRITES") {
    const min = Math.min(...cycle.map((t) => info[t].writes));
    const v = youngestOf(cycle.filter((t) => info[t].writes === min));
    return {
      victim: v,
      reason: `${v} has the cheapest rollback (${min} write${min === 1 ? "" : "s"} to undo)`,
    };
  }

  const v = youngestOf(cycle);
  return { victim: v, reason: `${v} is the youngest transaction in the cycle, so it has lost the least work` };
}
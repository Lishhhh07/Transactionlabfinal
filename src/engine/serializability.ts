import { findCycle } from "./deadlock";
import { ItemId, TraceStep, TxnId } from "./types";

export type ConflictKind = "RW" | "WR" | "WW";

export interface Conflict {
  kind: ConflictKind;
  item: ItemId;
  from: TxnId;       // the transaction whose operation came first
  to: TxnId;
  fromStep: number;  // 0-based trace indices
  toStep: number;
}

/** One edge of the precedence graph, with every conflict that justifies it. */
export interface PrecedenceEdge {
  from: TxnId;
  to: TxnId;
  conflicts: Conflict[];
}

export interface SerializabilityResult {
  nodes: TxnId[];                 // committed transactions
  edges: PrecedenceEdge[];
  serializable: boolean;
  cycle: TxnId[] | null;          // e.g. ["T1","T2"] means T1 → T2 → T1
  serialOrder: TxnId[] | null;    // an equivalent serial order, if one exists
  ignored: TxnId[];               // transactions that never committed
}

/** Kahn's algorithm. Ties are broken by id so the answer is deterministic. */
function topologicalOrder(nodes: TxnId[], edges: PrecedenceEdge[]): TxnId[] | null {
  const indegree = new Map<TxnId, number>(nodes.map((n) => [n, 0]));
  for (const e of edges) indegree.set(e.to, indegree.get(e.to)! + 1);

  const ready = nodes.filter((n) => indegree.get(n) === 0);
  const order: TxnId[] = [];

  while (ready.length > 0) {
    ready.sort();
    const n = ready.shift()!;
    order.push(n);
    for (const e of edges) {
      if (e.from !== n) continue;
      const d = indegree.get(e.to)! - 1;
      indegree.set(e.to, d);
      if (d === 0) ready.push(e.to);
    }
  }
  return order.length === nodes.length ? order : null; // shorter means a cycle blocked some nodes
}

export function analyzeSerializability(steps: TraceStep[]): SerializabilityResult {
  // 1. Who committed? (Aborted, blocked and unfinished transactions are ignored.)
  const seen = new Set<TxnId>();
  const committed = new Set<TxnId>();
  for (const s of steps) {
    seen.add(s.txn);
    if (s.outcome === "OK" && s.op.type === "COMMIT") committed.add(s.txn);
  }

  // 2. The committed projection: real reads/writes by committed transactions, in trace order.
  const accesses = steps.filter(
    (s) =>
      s.outcome === "OK" &&
      (s.op.type === "READ" || s.op.type === "WRITE") &&
      s.item !== undefined &&
      committed.has(s.txn)
  );

  // 3. Every conflicting pair (earlier, later) becomes part of an edge.
  const edgeMap = new Map<string, PrecedenceEdge>();
  for (let i = 0; i < accesses.length; i++) {
    for (let j = i + 1; j < accesses.length; j++) {
      const a = accesses[i];
      const b = accesses[j];
      if (a.txn === b.txn || a.item !== b.item) continue;
      if (a.op.type === "READ" && b.op.type === "READ") continue;

      const kind = `${a.op.type === "READ" ? "R" : "W"}${
        b.op.type === "READ" ? "R" : "W"
      }` as ConflictKind;

      const key = `${a.txn}>${b.txn}`;
      let edge = edgeMap.get(key);
      if (!edge) {
        edge = { from: a.txn, to: b.txn, conflicts: [] };
        edgeMap.set(key, edge);
      }
      edge.conflicts.push({
        kind,
        item: a.item!,
        from: a.txn,
        to: b.txn,
        fromStep: a.index,
        toStep: b.index,
      });
    }
  }

  const edges = [...edgeMap.values()].sort(
    (x, y) => x.from.localeCompare(y.from) || x.to.localeCompare(y.to)
  );
  const nodes = [...committed].sort();
  const ignored = [...seen].filter((t) => !committed.has(t)).sort();

  // 4. Cycle? (same DFS as the wait-for graph; it only needs from/to/item)
  const cycle = findCycle(edges.map((e) => ({ from: e.from, to: e.to, item: e.conflicts[0].item })));

  return {
    nodes,
    edges,
    serializable: cycle === null,
    cycle,
    serialOrder: cycle === null ? topologicalOrder(nodes, edges) : null,
    ignored,
  };
}

/** "T1 reads A (step 1) before T2 writes it (step 4)" */
export function describeConflict(c: Conflict): string {
  const [x, y] = c.kind.split("") as ("R" | "W")[];
  const verb = (k: "R" | "W") => (k === "R" ? "reads" : "writes");
  return (
    `${c.from} ${verb(x)} ${c.item} (step ${c.fromStep + 1}) before ` +
    `${c.to} ${verb(y)} it (step ${c.toStep + 1})`
  );
}
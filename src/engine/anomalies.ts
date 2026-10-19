import { ItemId, TraceStep, TxnId } from "./types";

export type AnomalyKind = "LOST_UPDATE" | "DIRTY_READ" | "NON_REPEATABLE_READ";

export interface Anomaly {
  kind: AnomalyKind;
  item: ItemId;
  /** The transaction that is harmed / observes the problem. */
  victim: TxnId;
  /** The other transaction involved. */
  other: TxnId;
  /** 0-based step indices involved, in execution order. */
  steps: number[];
  /** 0-based step where the anomaly "happens" (when the UI should raise the alarm). */
  at: number;
  title: string;
  /** Human-readable text. Uses 1-based step numbers, like the UI does. */
  explanation: string;
}

interface Terminal {
  index: number;
  kind: "COMMIT" | "ROLLBACK";
}

/**
 * NOTE: these detectors use `step.index` as a position in the `steps` array.
 * The simulator guarantees steps[i].index === i (Phase 4 keeps this too).
 */

/** For each transaction, where (and how) it finished. */
function findTerminals(steps: TraceStep[]): Map<TxnId, Terminal> {
  const m = new Map<TxnId, Terminal>();
  for (const s of steps) {
    if (s.op.type === "COMMIT" || s.op.type === "ROLLBACK") {
      m.set(s.txn, { index: s.index, kind: s.op.type });
    }
  }
  return m;
}

// ───────────────────────── Dirty Read ─────────────────────────

function detectDirtyReads(steps: TraceStep[], terms: Map<TxnId, Terminal>): Anomaly[] {
  const out: Anomaly[] = [];

  for (const r of steps) {
    if (r.op.type !== "READ" || r.item === undefined) continue;
    const item = r.item;

    // The most recent write to this item before the read = where the value came from.
    let w: TraceStep | undefined;
    for (let k = r.index - 1; k >= 0; k--) {
      if (steps[k].op.type === "WRITE" && steps[k].item === item) {
        w = steps[k];
        break;
      }
    }
    if (!w || w.txn === r.txn) continue; // no writer, or reading own write

    const t = terms.get(w.txn);
    if (t && t.index < r.index) continue; // writer had already finished: not dirty

    const fate =
      t?.kind === "ROLLBACK"
        ? ` ${w.txn} later rolled back (step ${t.index + 1}), so ${r.txn} used a value that never officially existed.`
        : t?.kind === "COMMIT"
        ? ` ${w.txn} only committed later (step ${t.index + 1}), but at the moment of the read the value was uncommitted.`
        : "";

    out.push({
      kind: "DIRTY_READ",
      item,
      victim: r.txn,
      other: w.txn,
      steps: [w.index, r.index],
      at: r.index,
      title: "Dirty Read",
      explanation:
        `${r.txn} read ${item} = ${r.valueRead} at step ${r.index + 1}, but that value was written by ` +
        `${w.txn} at step ${w.index + 1} and ${w.txn} had not committed yet.` +
        fate,
    });
  }
  return out;
}

// ──────────────────── Non-repeatable Read ────────────────────

function detectNonRepeatableReads(steps: TraceStep[], terms: Map<TxnId, Terminal>): Anomaly[] {
  const out: Anomaly[] = [];
  const lastRead = new Map<string, TraceStep>(); // key: "T1|A"
  const key = (t: TxnId, i: ItemId) => `${t}|${i}`;

  for (const s of steps) {
    const item = s.item;
    if (item === undefined) continue;

    // After its own write, a txn legitimately sees its own value, so reset.
    if (s.op.type === "WRITE") {
      lastRead.delete(key(s.txn, item));
      continue;
    }
    if (s.op.type !== "READ") continue;

    const k = key(s.txn, item);
    const prev = lastRead.get(k);

    if (prev && prev.valueRead !== s.valueRead) {
      // Look for another txn that wrote the item in between AND committed before this read.
      for (let j = prev.index + 1; j < s.index; j++) {
        const w = steps[j];
        if (w.op.type !== "WRITE" || w.item !== item || w.txn === s.txn) continue;

        const t = terms.get(w.txn);
        if (t && t.kind === "COMMIT" && t.index < s.index) {
          out.push({
            kind: "NON_REPEATABLE_READ",
            item,
            victim: s.txn,
            other: w.txn,
            steps: [prev.index, w.index, s.index],
            at: s.index,
            title: "Non-repeatable Read",
            explanation:
              `${s.txn} read ${item} = ${prev.valueRead} at step ${prev.index + 1}, then read it again ` +
              `at step ${s.index + 1} and got ${s.valueRead}, because ${w.txn} changed it ` +
              `(step ${w.index + 1}) and committed (step ${t.index + 1}) in between.`,
          });
          break;
        }
      }
    }
    lastRead.set(k, s);
  }
  return out;
}

// ───────────────────────── Lost Update ─────────────────────────

function detectLostUpdates(steps: TraceStep[], terms: Map<TxnId, Terminal>): Anomaly[] {
  const out: Anomaly[] = [];

  for (const wi of steps) {
    if (wi.op.type !== "WRITE" || wi.item === undefined) continue;
    const item = wi.item;
    if (terms.get(wi.txn)?.kind !== "COMMIT") continue; // only committed overwrites matter

    // Ti's most recent access to this item before the write.
    let ri: TraceStep | undefined;
    for (let k = wi.index - 1; k >= 0; k--) {
      if (steps[k].txn === wi.txn && steps[k].item === item) {
        ri = steps[k];
        break;
      }
    }
    // Must be a READ: Ti is writing based on what it read earlier.
    if (!ri || ri.op.type !== "READ") continue;

    // Did another txn write this item after Ti's read and commit?
    for (let k = ri.index + 1; k < wi.index; k++) {
      const wj = steps[k];
      if (wj.op.type !== "WRITE" || wj.item !== item || wj.txn === wi.txn) continue;
      if (terms.get(wj.txn)?.kind !== "COMMIT") continue;

      out.push({
        kind: "LOST_UPDATE",
        item,
        victim: wj.txn, // the one whose update disappears
        other: wi.txn,  // the one who overwrote it
        steps: [ri.index, wj.index, wi.index],
        at: wi.index,
        title: "Lost Update",
        explanation:
          `${wi.txn} read ${item} at step ${ri.index + 1}. Then ${wj.txn} wrote ${item} ` +
          `(step ${wj.index + 1}). ${wi.txn} never saw that write and overwrote it at step ${wi.index + 1}, ` +
          `so ${wj.txn}'s update to ${item} is lost.`,
      });
      break;
    }
  }
  return out;
}


export function detectAnomalies(steps: TraceStep[]): Anomaly[] {
  // BLOCKED steps never read or wrote anything, so hide their item from the detectors.
  // (Same array length, so step.index still equals the array position.)
  const view = steps.map((s) => (s.outcome === "OK" ? s : { ...s, item: undefined }));

  const terms = findTerminals(view);
  return [
    ...detectDirtyReads(view, terms),
    ...detectNonRepeatableReads(view, terms),
    ...detectLostUpdates(view, terms),
  ].sort((a, b) => a.at - b.at);
}
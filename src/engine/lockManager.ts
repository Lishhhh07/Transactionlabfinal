import { ItemId, LockHolder, LockMode, LockRow, TxnId } from "./types";

export type AcquireResult =
  | { granted: true; change: "NEW" | "UPGRADE" | "HELD" }
  | { granted: false; blockedBy: TxnId[] };

interface ItemLocks {
  holders: Map<TxnId, LockMode>;
  waiting: LockHolder[];
}

export class LockManager {
  private table = new Map<ItemId, ItemLocks>();

  private row(item: ItemId): ItemLocks {
    let r = this.table.get(item);
    if (!r) {
      r = { holders: new Map(), waiting: [] };
      this.table.set(item, r);
    }
    return r;
  }

  holds(txn: TxnId, item: ItemId): LockMode | undefined {
    return this.table.get(item)?.holders.get(txn);
  }

  /** Try to get a lock. Never waits: it just says yes or "blocked by these txns". */
  tryAcquire(txn: TxnId, item: ItemId, mode: LockMode): AcquireResult {
    const r = this.row(item);
    const mine = r.holders.get(txn);

    // Already strong enough: X covers everything, S covers S.
    if (mine === "X" || (mine === "S" && mode === "S")) {
      return { granted: true, change: "HELD" };
    }

    const others = [...r.holders.entries()].filter(([t]) => t !== txn);

    // S conflicts only with someone's X. X conflicts with any other holder.
    const conflicting = mode === "S" ? others.filter(([, m]) => m === "X") : others;

    if (conflicting.length > 0) {
      return { granted: false, blockedBy: conflicting.map(([t]) => t) };
    }

    r.holders.set(txn, mode);
    return { granted: true, change: mine ? "UPGRADE" : "NEW" };
  }

  /** Remember that a txn is queued for a lock (for display, and for Phase 5). */
  addWaiter(txn: TxnId, item: ItemId, mode: LockMode): void {
    const w = this.row(item).waiting;
    if (!w.some((x) => x.txn === txn)) w.push({ txn, mode });
  }

  removeWaiter(txn: TxnId): void {
    for (const r of this.table.values()) {
      r.waiting = r.waiting.filter((w) => w.txn !== txn);
    }
  }
  /** Release ONE lock early (used for READ COMMITTED's short read locks). */
    /** Release ONE lock early (used for READ COMMITTED's short read locks). */
  release(txn: TxnId, item: ItemId): boolean {
    const r = this.table.get(item);
    return r ? r.holders.delete(txn) : false;
  }

  /** Strict 2PL: called once, at COMMIT or ROLLBACK. Returns what was released. */
  releaseAll(txn: TxnId): { item: ItemId; mode: LockMode }[] {
    this.removeWaiter(txn);
    const released: { item: ItemId; mode: LockMode }[] = [];
    for (const [item, r] of this.table) {
      const mode = r.holders.get(txn);
      if (mode) {
        r.holders.delete(txn);
        released.push({ item, mode });
      }
    }
    return released;
  }

  /** Plain-data copy for the trace. */
  snapshot(): LockRow[] {
    return [...this.table.entries()]
      .filter(([, r]) => r.holders.size > 0 || r.waiting.length > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([item, r]) => ({
        item,
        holders: [...r.holders].map(([txn, mode]) => ({ txn, mode })),
        waiting: r.waiting.map((w) => ({ ...w })),
      }));
  }
}
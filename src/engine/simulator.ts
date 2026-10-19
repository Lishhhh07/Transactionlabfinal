import { chooseVictim, cycleEdges, findCycle, VictimInfo, waitForEdges } from "./deadlock"; // 5
import { policyFor } from "./isolation";
import { LockManager } from "./lockManager";
import {
  Database,
  DeadlockEvent, // 5
  ItemId,
  LockMode,
  Operation,
  Scenario,
  SimOptions,
  SimulationResult,
  TraceStep,
  TxnId,
  TxnRuntime,
  TxnSnapshot,
  TxnStatus,
} from "./types";
import { validateScenario } from "./validate";

function snapshotTxns(runtimes: Map<TxnId, TxnRuntime>): Record<TxnId, TxnSnapshot> {
  const out: Record<TxnId, TxnSnapshot> = {};
  for (const [id, rt] of runtimes) {
    out[id] = { status: rt.status, nextOp: rt.nextOp, locals: { ...rt.locals } };
  }
  return out;
}

export function simulate(scenario: Scenario, options: SimOptions = {}): SimulationResult {
  validateScenario(scenario);
  const policy = policyFor(options);
  const useLocks = policy !== null;

  // 5: deadlock handling options
  const abortMode = (options.deadlock ?? "HALT") === "ABORT_VICTIM";
  const victimPolicy = options.victim ?? "YOUNGEST";

  const db: Database = { ...scenario.initialDb };
  const opsOf = new Map<TxnId, Operation[]>();
  const runtimes = new Map<TxnId, TxnRuntime>();

  for (const t of scenario.transactions) {
    opsOf.set(t.id, t.ops);
    runtimes.set(t.id, { id: t.id, status: "ACTIVE", nextOp: 0, locals: {}, undoLog: [] });
  }

  // 5: a transaction "starts" at its first appearance in the schedule
  const startOrder = new Map<TxnId, number>();
  scenario.schedule.forEach((id, i) => {
    if (!startOrder.has(id)) startOrder.set(id, i);
  });

  const lm = new LockManager();
  const steps: TraceStep[] = [];
  const pending: TxnId[] = [...scenario.schedule];
  const blockedOrder: TxnId[] = [];
  const deadlocks: DeadlockEvent[] = []; // 5
  const reported = new Set<string>();    // 5: HALT mode must not report the same cycle twice

  const lockNeeded = (op: Operation): { item: ItemId; mode: LockMode } | null => {
    if (!policy) return null;
    if (op.type === "READ") return policy.readLocks ? { item: op.item, mode: "S" } : null;
    if (op.type === "WRITE") return { item: op.item, mode: "X" };
    return null;
  };

  const tryExecute = (txnId: TxnId): boolean => {
    const rt = runtimes.get(txnId)!;
    const op = opsOf.get(txnId)![rt.nextOp];
    const wasBlocked = rt.status === "BLOCKED";
    const need = lockNeeded(op);
    let lockNote = "";
    let shortRelease = false;

    if (need) {
      const res = lm.tryAcquire(txnId, need.item, need.mode);

      if (!res.granted) {
        if (!wasBlocked) {
          rt.status = "BLOCKED";
          blockedOrder.push(txnId);
          lm.addWaiter(txnId, need.item, need.mode);
          steps.push({
            index: steps.length,
            txn: txnId,
            op,
            outcome: "BLOCKED",
            message:
              `${txnId} requests an ${need.mode}-lock on ${need.item}, but ` +
              `${res.blockedBy.join(", ")} holds a conflicting lock. ${txnId} must wait.`,
            item: need.item,
            blockedBy: res.blockedBy,
            dbAfter: { ...db },
            txnsAfter: snapshotTxns(runtimes),
            locksAfter: lm.snapshot(),
          });
        }
        return false;
      }

      if (res.change === "NEW") lockNote = ` [${need.mode}-lock on ${need.item} granted]`;
      if (res.change === "UPGRADE") lockNote = ` [lock on ${need.item} upgraded S → X]`;

      if (op.type === "READ" && policy!.shortReadLocks && res.change === "NEW") {
        shortRelease = true;
      }
    }

    if (wasBlocked) {
      rt.status = "ACTIVE";
      blockedOrder.splice(blockedOrder.indexOf(txnId), 1);
      lm.removeWaiter(txnId);
    }
    pending.splice(pending.indexOf(txnId), 1);

    let message = "";
    let extra: Partial<TraceStep> = {};

    switch (op.type) {
      case "READ": {
        const value = db[op.item];
        rt.locals[op.item] = value;
        message = `${txnId} reads ${op.item} = ${value}.`;
        extra = { item: op.item, valueRead: value };
        break;
      }
      case "WRITE": {
        const before = db[op.item];
        const after =
          op.value.kind === "const"
            ? op.value.value
            : rt.locals[op.value.item] + op.value.delta;
        rt.undoLog.push({ item: op.item, before });
        db[op.item] = after;
        message = `${txnId} writes ${op.item}: ${before} → ${after}.`;
        extra = { item: op.item, before, after };
        break;
      }
      case "COMMIT": {
        rt.status = "COMMITTED";
        rt.undoLog = [];
        message = `${txnId} commits. Its writes are now permanent.`;
        break;
      }
      case "ROLLBACK": {
        for (let i = rt.undoLog.length - 1; i >= 0; i--) {
          const u = rt.undoLog[i];
          db[u.item] = u.before;
        }
        message = `${txnId} rolls back. ${rt.undoLog.length} write(s) undone.`;
        rt.undoLog = [];
        rt.status = "ABORTED";
        break;
      }
    }

    rt.nextOp += 1;

    if (shortRelease && need) {
      lm.release(txnId, need.item);
      lockNote = ` [S-lock on ${need.item} granted, then released right away]`;
    }

    if (useLocks && (op.type === "COMMIT" || op.type === "ROLLBACK")) {
      const released = lm.releaseAll(txnId);
      message += released.length
        ? ` Releases ${released.map((r) => `${r.mode}(${r.item})`).join(", ")}.`
        : " It held no locks.";
    }

    steps.push({
      index: steps.length,
      txn: txnId,
      op,
      outcome: "OK",
      message: (wasBlocked ? "Lock granted, so " : "") + message + lockNote,
      ...extra,
      resumed: wasBlocked || undefined,
      dbAfter: { ...db },
      txnsAfter: snapshotTxns(runtimes),
      locksAfter: lm.snapshot(),
    });
    return true;
  };

  const wakeWaiters = () => {
    let progress = true;
    while (progress) {
      progress = false;
      for (const id of [...blockedOrder]) {
        if (tryExecute(id)) {
          progress = true;
          break;
        }
      }
    }
  };

  // ── 5: abort a deadlock victim ────────────────────────────
  const abortVictim = (victim: TxnId, cycle: TxnId[], reason: string) => {
    const rt = runtimes.get(victim)!;

    // Undo its writes, newest first (same logic as an explicit ROLLBACK).
    const undone = rt.undoLog.length;
    for (let i = undone - 1; i >= 0; i--) {
      db[rt.undoLog[i].item] = rt.undoLog[i].before;
    }
    rt.undoLog = [];
    rt.status = "ABORTED";

    // It no longer waits, and its remaining operations will never run.
    const bi = blockedOrder.indexOf(victim);
    if (bi >= 0) blockedOrder.splice(bi, 1);
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i] === victim) pending.splice(i, 1);
    }

    const released = lm.releaseAll(victim); // also removes its wait-queue entries

    steps.push({
      index: steps.length,
      txn: victim,
      op: { type: "ROLLBACK" }, // lets the anomaly detectors treat it as rolled back
      outcome: "DEADLOCK_VICTIM",
      message:
        `DEADLOCK: ${[...cycle, cycle[0]].join(" → ")}. ` +
        `${victim} is chosen as the victim (${reason}) and is aborted: ${undone} write(s) undone.` +
        (released.length ? ` Releases ${released.map((r) => `${r.mode}(${r.item})`).join(", ")}.` : ""),
      dbAfter: { ...db },
      txnsAfter: snapshotTxns(runtimes),
      locksAfter: lm.snapshot(),
    });
  };

  // ── 5: look for cycles; in ABORT mode, break them one by one ──
  const handleDeadlocks = () => {
    while (blockedOrder.length > 0) {
      const edges = waitForEdges(lm.snapshot());
      const cycle = findCycle(edges);
      if (!cycle) return;

      const event: DeadlockEvent = {
        cycle,
        edges: cycleEdges(edges, cycle),
        detectedAt: steps.length - 1,
      };

      if (!abortMode) {
        const key = [...cycle].sort().join(",");
        if (!reported.has(key)) {
          reported.add(key);
          deadlocks.push(event);
        }
        return; // HALT: leave them stuck
      }

      const info: Record<TxnId, VictimInfo> = {};
      for (const id of cycle) {
        info[id] = { startOrder: startOrder.get(id) ?? 0, writes: runtimes.get(id)!.undoLog.length };
      }
      const { victim, reason } = chooseVictim(cycle, info, victimPolicy);

      event.victim = victim;
      event.reason = reason;
      event.victimStep = steps.length; // the step abortVictim is about to record
      deadlocks.push(event);

      abortVictim(victim, cycle, reason);
      wakeWaiters(); // the victim's locks are free: let the others continue
      // loop again: breaking one cycle might leave another
    }
  };

  // ── Main loop ─────────────────────────────────────────────
  while (pending.length > 0) {
    const next = pending.find((id) => runtimes.get(id)!.status === "ACTIVE");
    if (next === undefined) break; // everyone left is blocked and nothing could resolve it

    const ran = tryExecute(next);
    if (ran && blockedOrder.length > 0) wakeWaiters();
    if (blockedOrder.length > 0) handleDeadlocks(); // 5
  }

  const finalStatus: Record<TxnId, TxnStatus> = {};
  for (const [id, rt] of runtimes) finalStatus[id] = rt.status;

  return { steps, finalDb: { ...db }, finalStatus, blockedAtEnd: [...blockedOrder], deadlocks };
}
import {
  Database,
  Operation,
  Scenario,
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

export function simulate(scenario: Scenario): SimulationResult {
  validateScenario(scenario);

  const db: Database = { ...scenario.initialDb };
  const opsOf = new Map<TxnId, Operation[]>();
  const runtimes = new Map<TxnId, TxnRuntime>();

  for (const t of scenario.transactions) {
    opsOf.set(t.id, t.ops);
    runtimes.set(t.id, {
      id: t.id,
      status: "ACTIVE",
      nextOp: 0,
      locals: {},
      undoLog: [],
    });
  }

  const steps: TraceStep[] = [];

  scenario.schedule.forEach((txnId, index) => {
    const rt = runtimes.get(txnId)!;
    const op = opsOf.get(txnId)![rt.nextOp];

    // Fields specific to the op type; filled in below.
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
            : rt.locals[op.value.item] + op.value.delta; // validated earlier

        rt.undoLog.push({ item: op.item, before }); // for ROLLBACK
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
        // Undo in REVERSE order of writing.
        for (let i = rt.undoLog.length - 1; i >= 0; i--) {
          const u = rt.undoLog[i];
          db[u.item] = u.before;
        }
        const undone = rt.undoLog.length;
        rt.undoLog = [];
        rt.status = "ABORTED";
        message = `${txnId} rolls back. ${undone} write(s) undone.`;
        break;
      }
    }

    rt.nextOp += 1;

    steps.push({
      index,
      txn: txnId,
      op,
      outcome: "OK",
      message,
      ...extra,
      dbAfter: { ...db },
      txnsAfter: snapshotTxns(runtimes),
    });
  });

  const finalStatus: Record<TxnId, TxnStatus> = {};
  for (const [id, rt] of runtimes) finalStatus[id] = rt.status;

  return { steps, finalDb: { ...db }, finalStatus };
}
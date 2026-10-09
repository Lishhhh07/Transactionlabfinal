export type TxnId = string;   // "T1" for transactionss
export type ItemId = string;  // "A", like DB K ITEM NAMES
// A WRITE either writes a constant, or "what I previously read + delta(+-200 wtever)".
// The second form is what makes "withdraw 200" realistic:
//   READ(A); WRITE(A, A-200)   → delta = -200
//like first is write A to wtever number, second is like write A-VALUE
export type ValueExpr =
  | { kind: "const"; value: number }
  | { kind: "readPlus"; item: ItemId; delta: number };

export type Operation =
  | { type: "READ"; item: ItemId }
  | { type: "WRITE"; item: ItemId; value: ValueExpr }
  | { type: "COMMIT" }
  | { type: "ROLLBACK" };

export interface Transaction {
  id: TxnId;
  ops: Operation[];
}

export type Database = Record<ItemId, number>;
export interface Scenario {
  initialDb: Database;
  transactions: Transaction[];
  /** Interleaving: each entry runs the NEXT unexecuted op of that txn specific transaction. */
  schedule: TxnId[];
}

//statee
export type TxnStatus = "ACTIVE" | "COMMITTED" | "ABORTED";

export interface UndoEntry {
  item: ItemId;
  before: number;
}
/** Internal mutable state (not shown directly in the trace). */
export interface TxnRuntime {
  id: TxnId;
  status: TxnStatus;
  nextOp: number;
  /** Values this transaction has read (its private "local variables"). */
  locals: Record<ItemId, number>;
  undoLog: UndoEntry[]; // for rollback
}

export type StepOutcome = "OK";

export interface TxnSnapshot {
  status: TxnStatus;
  nextOp: number;
  locals: Record<ItemId, number>;
}
//for like evry step in the trace, we want to know what happened, and what the db looks like after that step
export interface TraceStep {
  index: number;            // 0-based step number
  txn: TxnId;
  op: Operation;
  outcome: StepOutcome;
  message: string;          // human-readable explanation
  item?: ItemId;            // for READ / WRITE
  valueRead?: number;       // for READ
  before?: number;          // for WRITE (old value)
  after?: number;           // for WRITE (new value)
  dbAfter: Database;        // full DB snapshot after this step
  txnsAfter: Record<TxnId, TxnSnapshot>;
}

export interface SimulationResult {
  steps: TraceStep[];
  finalDb: Database;
  finalStatus: Record<TxnId, TxnStatus>;
}
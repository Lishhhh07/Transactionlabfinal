// ---------- Basic identifiers ----------
export type TxnId = string;   // "T1", "T2"
export type ItemId = string;  // "A", "B"

// ---------- Values ----------
export type ValueExpr =
  | { kind: "const"; value: number }
  | { kind: "readPlus"; item: ItemId; delta: number };

// ---------- Operations ----------
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

// ---------- Input to the engine ----------
export interface Scenario {
  initialDb: Database;
  transactions: Transaction[];
  /** Preferred interleaving. Blocked transactions are skipped and resumed later. */
  schedule: TxnId[];
}

// NEW: simulator options
export type LockingMode = "NONE" | "STRICT_2PL";

// NEW
export type IsolationLevel =
  | "READ_UNCOMMITTED"
  | "READ_COMMITTED"
  | "REPEATABLE_READ"
  | "SERIALIZABLE";

/** What the UI selects: no concurrency control, or one of the four levels. */
export type CcMode = "NONE" | IsolationLevel;

export type DeadlockMode = "HALT" | "ABORT_VICTIM";
export type VictimPolicy = "YOUNGEST" | "OLDEST" | "FEWEST_WRITES";

export interface SimOptions {
  locking?: LockingMode;      // old switch. "STRICT_2PL" means REPEATABLE_READ
  isolation?: IsolationLevel; // if set, it wins over `locking`
  deadlock?: DeadlockMode;    // NEW. default "HALT"
  victim?: VictimPolicy;      // NEW. default "YOUNGEST"
}

// ---------- NEW: Locks ----------
export type LockMode = "S" | "X";

export interface LockHolder {
  txn: TxnId;
  mode: LockMode;
}

/** One row of the lock table, as shown in the UI. */
export interface LockRow {
  item: ItemId;
  holders: LockHolder[];
  waiting: LockHolder[];
}
// ---------- NEW: Deadlocks ----------
/** "from is waiting for a lock that `to` holds." One edge of the wait-for graph. */
export interface WaitEdge {
  from: TxnId;
  to: TxnId;
  item: ItemId;
}

export interface DeadlockEvent {
  cycle: TxnId[];           // e.g. ["T1","T2"] means T1 → T2 → T1
  edges: WaitEdge[];        // the edges that form the cycle
  detectedAt: number;       // index of the last step before the deadlock was noticed
  victim?: TxnId;           // missing in HALT mode
  victimStep?: number;      // index of the DEADLOCK_VICTIM step
  reason?: string;          // why this victim was chosen
}

// ---------- Runtime state ----------
export type TxnStatus = "ACTIVE" | "BLOCKED" | "COMMITTED" | "ABORTED"; // NEW: BLOCKED

export interface UndoEntry {
  item: ItemId;
  before: number;
}

export interface TxnRuntime {
  id: TxnId;
  status: TxnStatus;
  nextOp: number;
  locals: Record<ItemId, number>;
  undoLog: UndoEntry[];
}

export type StepOutcome = "OK" | "BLOCKED" | "DEADLOCK_VICTIM"; // NEW: BLOCKED (Phase 5 adds DEADLOCK_VICTIM)

export interface TxnSnapshot {
  status: TxnStatus;
  nextOp: number;
  locals: Record<ItemId, number>;
}

export interface TraceStep {
  index: number;
  txn: TxnId;
  op: Operation;
  outcome: StepOutcome;
  message: string;
  item?: ItemId;
  valueRead?: number;
  before?: number;
  after?: number;
  blockedBy?: TxnId[];      // NEW: for BLOCKED steps, who holds the conflicting lock
  resumed?: boolean;        // NEW: true if this op ran after waiting for a lock
  dbAfter: Database;
  txnsAfter: Record<TxnId, TxnSnapshot>;
  locksAfter: LockRow[];    // NEW: lock table after this step
}

export interface SimulationResult {
  steps: TraceStep[];
  finalDb: Database;
  finalStatus: Record<TxnId, TxnStatus>;
  blockedAtEnd: TxnId[];
  deadlocks: DeadlockEvent[];   // NEW
}
import { describe, it, expect } from "vitest";
import {
  LockRow,
  Scenario,
  SimOptions,
  WaitEdge,
  chooseVictim,
  compareModes,
  detectAnomalies,
  findCycle,
  parseOps,
  simulate,
  waitForEdges,
} from "../index";

function run(
  db: Record<string, number>,
  txns: Record<string, string[]>,
  schedule: string,
  opts: SimOptions
) {
  const scenario: Scenario = {
    initialDb: db,
    transactions: Object.entries(txns).map(([id, lines]) => ({ id, ops: parseOps(lines) })),
    schedule: schedule.split(" "),
  };
  return simulate(scenario, opts);
}

const RMW = (d: string) => ["READ(A)", `WRITE(A, A${d})`, "COMMIT"];
const RR: SimOptions = { isolation: "REPEATABLE_READ" };
const RR_ABORT: SimOptions = { isolation: "REPEATABLE_READ", deadlock: "ABORT_VICTIM" };

const LOST = { txns: { T1: RMW("-200"), T2: RMW("-300") }, schedule: "T1 T2 T1 T2 T1 T2" };

const CLASSIC = {
  db: { A: 100, B: 100 },
  txns: {
    T1: ["WRITE(A, 1)", "WRITE(B, 1)", "COMMIT"],
    T2: ["WRITE(B, 2)", "WRITE(A, 2)", "COMMIT"],
  },
  schedule: "T1 T2 T1 T2 T1 T2",
};

// T1 (older) has done 1 write, T2 (younger) has done 2 when the deadlock forms.
const CHOICE = {
  db: { A: 100, B: 100, C: 100 },
  txns: {
    T1: ["WRITE(A, 1)", "WRITE(B, 1)", "COMMIT"],
    T2: ["WRITE(C, 2)", "WRITE(B, 2)", "WRITE(A, 2)", "COMMIT"],
  },
  schedule: "T1 T2 T2 T1 T2 T1 T2",
};

describe("waitForEdges", () => {
  it("two S-holders that both want X wait for each other", () => {
    const rows: LockRow[] = [
      {
        item: "A",
        holders: [{ txn: "T1", mode: "S" }, { txn: "T2", mode: "S" }],
        waiting: [{ txn: "T1", mode: "X" }, { txn: "T2", mode: "X" }],
      },
    ];
    expect(waitForEdges(rows)).toEqual([
      { from: "T1", to: "T2", item: "A" },
      { from: "T2", to: "T1", item: "A" },
    ]);
  });

  it("an S request does not wait for an S holder", () => {
    const rows: LockRow[] = [
      { item: "A", holders: [{ txn: "T1", mode: "S" }], waiting: [{ txn: "T2", mode: "S" }] },
    ];
    expect(waitForEdges(rows)).toEqual([]);
  });
});

describe("findCycle", () => {
  const e = (from: string, to: string): WaitEdge => ({ from, to, item: "A" });

  it("returns null when there is no cycle", () => {
    expect(findCycle([e("T1", "T2"), e("T2", "T3")])).toBeNull();
  });
  it("finds a 2-cycle", () => {
    expect(findCycle([e("T1", "T2"), e("T2", "T1")])).toEqual(["T1", "T2"]);
  });
  it("finds a 3-cycle", () => {
    expect(findCycle([e("T1", "T2"), e("T2", "T3"), e("T3", "T1")])).toEqual(["T1", "T2", "T3"]);
  });
  it("finds a cycle that does not include the start node", () => {
    expect(findCycle([e("T1", "T2"), e("T2", "T3"), e("T3", "T2")])).toEqual(["T2", "T3"]);
  });
});

describe("chooseVictim", () => {
  const info = {
    T1: { startOrder: 0, writes: 2 },
    T2: { startOrder: 1, writes: 5 },
  };
  it("YOUNGEST picks the txn that started last", () => {
    expect(chooseVictim(["T1", "T2"], info, "YOUNGEST").victim).toBe("T2");
  });
  it("OLDEST picks the txn that started first", () => {
    expect(chooseVictim(["T1", "T2"], info, "OLDEST").victim).toBe("T1");
  });
  it("FEWEST_WRITES picks the cheapest rollback", () => {
    expect(chooseVictim(["T1", "T2"], info, "FEWEST_WRITES").victim).toBe("T1");
  });
  it("FEWEST_WRITES breaks ties by choosing the youngest", () => {
    const tie = { T1: { startOrder: 0, writes: 1 }, T2: { startOrder: 1, writes: 1 } };
    expect(chooseVictim(["T1", "T2"], tie, "FEWEST_WRITES").victim).toBe("T2");
  });
});

describe("deadlock resolution in the simulator", () => {
  it("lost update under REPEATABLE READ: victim T2 aborted, T1 finishes (800)", () => {
    const r = run({ A: 1000 }, LOST.txns, LOST.schedule, RR_ABORT);
    expect(r.steps.map((s) => s.outcome)).toEqual([
      "OK", "OK", "BLOCKED", "BLOCKED", "DEADLOCK_VICTIM", "OK", "OK",
    ]);
    expect(r.steps[5].resumed).toBe(true);
    expect(r.finalDb.A).toBe(800);
    expect(r.finalStatus).toEqual({ T1: "COMMITTED", T2: "ABORTED" });
    expect(r.blockedAtEnd).toEqual([]);
    expect(r.deadlocks).toHaveLength(1);
    expect(r.deadlocks[0]).toMatchObject({
      cycle: ["T1", "T2"],
      victim: "T2",
      detectedAt: 3,
      victimStep: 4,
    });
  });

  it("no anomalies remain after the deadlock is resolved", () => {
    const r = run({ A: 1000 }, LOST.txns, LOST.schedule, RR_ABORT);
    expect(detectAnomalies(r.steps)).toEqual([]);
  });

  it("classic deadlock: the victim's write to B is undone", () => {
    const r = run(CLASSIC.db, CLASSIC.txns, CLASSIC.schedule, RR_ABORT);
    expect(r.steps.map((s) => s.outcome)).toEqual([
      "OK", "OK", "BLOCKED", "BLOCKED", "DEADLOCK_VICTIM", "OK", "OK",
    ]);
    expect(r.steps[4].dbAfter).toEqual({ A: 1, B: 100 }); // B restored from T2's undo log
    expect(r.finalDb).toEqual({ A: 1, B: 1 });
    expect(r.finalStatus).toEqual({ T1: "COMMITTED", T2: "ABORTED" });
  });

  it("OLDEST policy aborts T1 instead, so T2 finishes (700)", () => {
    const r = run({ A: 1000 }, LOST.txns, LOST.schedule, { ...RR_ABORT, victim: "OLDEST" });
    expect(r.deadlocks[0].victim).toBe("T1");
    expect(r.finalDb.A).toBe(700);
    expect(r.finalStatus).toEqual({ T1: "ABORTED", T2: "COMMITTED" });
  });

  it("YOUNGEST aborts T2 even though it has done more work", () => {
    const r = run(CHOICE.db, CHOICE.txns, CHOICE.schedule, RR_ABORT);
    expect(r.deadlocks[0].victim).toBe("T2");
    expect(r.finalDb).toEqual({ A: 1, B: 1, C: 100 }); // T2's writes to C and B were undone
  });

  it("FEWEST_WRITES aborts T1 (1 write) instead of T2 (2 writes)", () => {
    const r = run(CHOICE.db, CHOICE.txns, CHOICE.schedule, { ...RR_ABORT, victim: "FEWEST_WRITES" });
    expect(r.deadlocks[0].victim).toBe("T1");
    expect(r.finalDb).toEqual({ A: 2, B: 2, C: 2 });
    expect(r.finalStatus).toEqual({ T1: "ABORTED", T2: "COMMITTED" });
  });

  it("three-way deadlock: T3 is aborted, then T2 and T1 finish in turn", () => {
    const r = run(
      { A: 100, B: 100, C: 100 },
      {
        T1: ["WRITE(A, 1)", "WRITE(B, 1)", "COMMIT"],
        T2: ["WRITE(B, 2)", "WRITE(C, 2)", "COMMIT"],
        T3: ["WRITE(C, 3)", "WRITE(A, 3)", "COMMIT"],
      },
      "T1 T2 T3 T1 T2 T3 T1 T2 T3",
      RR_ABORT
    );
    expect(r.deadlocks).toHaveLength(1);
    expect(r.deadlocks[0].cycle).toEqual(["T1", "T2", "T3"]);
    expect(r.deadlocks[0].victim).toBe("T3");
    expect(r.steps.map((s) => s.outcome)).toEqual([
      "OK", "OK", "OK", "BLOCKED", "BLOCKED", "BLOCKED", "DEADLOCK_VICTIM", "OK", "OK", "OK", "OK",
    ]);
    expect(r.finalDb).toEqual({ A: 1, B: 1, C: 2 });
    expect(r.finalStatus).toEqual({ T1: "COMMITTED", T2: "COMMITTED", T3: "ABORTED" });
  });

  it("default (HALT) still freezes, but now reports the cycle", () => {
    const r = run({ A: 1000 }, LOST.txns, LOST.schedule, RR);
    expect(r.steps).toHaveLength(4);
    expect(r.blockedAtEnd).toEqual(["T1", "T2"]);
    expect(r.deadlocks).toHaveLength(1);
    expect(r.deadlocks[0].cycle).toEqual(["T1", "T2"]);
    expect(r.deadlocks[0].victim).toBeUndefined();
  });

  it("no deadlock means no events", () => {
    const r = run({ A: 1000 }, { T1: RMW("-200"), T2: RMW("-300") }, "T1 T1 T2 T2 T1 T2", RR_ABORT);
    expect(r.deadlocks).toEqual([]);
    expect(r.finalDb.A).toBe(500);
  });
});

describe("compareModes with deadlock resolution", () => {
  it("RR / SERIALIZABLE become RESOLVED instead of DEADLOCK", () => {
    const scenario: Scenario = {
      initialDb: { A: 1000 },
      transactions: Object.entries(LOST.txns).map(([id, l]) => ({ id, ops: parseOps(l) })),
      schedule: LOST.schedule.split(" "),
    };
    const rows = compareModes(scenario, { deadlock: "ABORT_VICTIM" });
    const by = Object.fromEntries(rows.map((r) => [r.mode, r]));
    expect(by.NONE.verdict).toBe("ANOMALY");
    expect(by.READ_COMMITTED.verdict).toBe("ANOMALY");
    expect(by.REPEATABLE_READ.verdict).toBe("RESOLVED");
    expect(by.REPEATABLE_READ.deadlocksResolved).toBe(1);
    expect(by.REPEATABLE_READ.finalDb).toEqual({ A: 800 });
    expect(by.SERIALIZABLE.verdict).toBe("RESOLVED");
  });
});
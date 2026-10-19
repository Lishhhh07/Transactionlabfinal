import { describe, it, expect } from "vitest";
import { LockManager, Scenario, detectAnomalies, parseOps, simulate } from "../index";

function run(
  db: Record<string, number>,
  txns: Record<string, string[]>,
  schedule: string,
  locking: "NONE" | "STRICT_2PL" = "STRICT_2PL"
) {
  const scenario: Scenario = {
    initialDb: db,
    transactions: Object.entries(txns).map(([id, lines]) => ({ id, ops: parseOps(lines) })),
    schedule: schedule.split(" "),
  };
  return simulate(scenario, { locking });
}

const RMW = (d: string) => ["READ(A)", `WRITE(A, A${d})`, "COMMIT"];

describe("LockManager", () => {
  it("lets many transactions share an S lock", () => {
    const lm = new LockManager();
    expect(lm.tryAcquire("T1", "A", "S")).toMatchObject({ granted: true, change: "NEW" });
    expect(lm.tryAcquire("T2", "A", "S")).toMatchObject({ granted: true });
  });

  it("blocks X when someone holds S", () => {
    const lm = new LockManager();
    lm.tryAcquire("T1", "A", "S");
    expect(lm.tryAcquire("T2", "A", "X")).toEqual({ granted: false, blockedBy: ["T1"] });
  });

  it("blocks S when someone holds X", () => {
    const lm = new LockManager();
    lm.tryAcquire("T1", "A", "X");
    expect(lm.tryAcquire("T2", "A", "S")).toEqual({ granted: false, blockedBy: ["T1"] });
  });

  it("upgrades S → X when the txn is the only holder", () => {
    const lm = new LockManager();
    lm.tryAcquire("T1", "A", "S");
    expect(lm.tryAcquire("T1", "A", "X")).toMatchObject({ granted: true, change: "UPGRADE" });
  });

  it("refuses an upgrade while another txn also holds S", () => {
    const lm = new LockManager();
    lm.tryAcquire("T1", "A", "S");
    lm.tryAcquire("T2", "A", "S");
    expect(lm.tryAcquire("T1", "A", "X")).toEqual({ granted: false, blockedBy: ["T2"] });
  });

  it("treats a repeated request as already held", () => {
    const lm = new LockManager();
    lm.tryAcquire("T1", "A", "X");
    expect(lm.tryAcquire("T1", "A", "S")).toMatchObject({ granted: true, change: "HELD" });
  });

  it("releaseAll frees the item for others", () => {
    const lm = new LockManager();
    lm.tryAcquire("T1", "A", "X");
    expect(lm.releaseAll("T1")).toEqual([{ item: "A", mode: "X" }]);
    expect(lm.tryAcquire("T2", "A", "X")).toMatchObject({ granted: true });
  });
});

describe("simulator with STRICT_2PL", () => {
  it("prevents a dirty read: the reader waits, then sees the restored value", () => {
    const r = run(
      { A: 1000 },
      { T1: ["WRITE(A, 500)", "ROLLBACK"], T2: ["READ(A)", "COMMIT"] },
      "T1 T2 T1 T2"
    );
    expect(r.steps.map((s) => s.outcome)).toEqual(["OK", "BLOCKED", "OK", "OK", "OK"]);
    expect(r.steps[1].blockedBy).toEqual(["T1"]);
    expect(r.steps[3].resumed).toBe(true);
    expect(r.steps[3].valueRead).toBe(1000);
    expect(r.finalDb.A).toBe(1000);
    expect(r.blockedAtEnd).toEqual([]);
    expect(detectAnomalies(r.steps)).toEqual([]);
  });

  it("same schedule with NO locking still has the dirty read", () => {
    const r = run(
      { A: 1000 },
      { T1: ["WRITE(A, 500)", "ROLLBACK"], T2: ["READ(A)", "COMMIT"] },
      "T1 T2 T1 T2",
      "NONE"
    );
    expect(detectAnomalies(r.steps).map((a) => a.kind)).toEqual(["DIRTY_READ"]);
  });

  it("writer blocks reader, then the schedule finishes correctly (500)", () => {
    const r = run({ A: 1000 }, { T1: RMW("-200"), T2: RMW("-300") }, "T1 T1 T2 T2 T1 T2");
    expect(r.steps.map((s) => s.outcome)).toEqual([
      "OK", "OK", "BLOCKED", "OK", "OK", "OK", "OK",
    ]);
    expect(r.finalDb.A).toBe(500);
    expect(r.blockedAtEnd).toEqual([]);
    expect(detectAnomalies(r.steps)).toEqual([]);
  });

  it("lost-update schedule becomes a DEADLOCK under 2PL (both want to upgrade)", () => {
    const r = run({ A: 1000 }, { T1: RMW("-200"), T2: RMW("-300") }, "T1 T2 T1 T2 T1 T2");
    expect(r.steps.map((s) => s.outcome)).toEqual(["OK", "OK", "BLOCKED", "BLOCKED"]);
    expect(r.steps[2].blockedBy).toEqual(["T2"]);
    expect(r.steps[3].blockedBy).toEqual(["T1"]);
    expect(r.blockedAtEnd).toEqual(["T1", "T2"]);
    expect(r.finalStatus).toEqual({ T1: "BLOCKED", T2: "BLOCKED" });
    expect(r.steps[3].locksAfter).toEqual([
      {
        item: "A",
        holders: [{ txn: "T1", mode: "S" }, { txn: "T2", mode: "S" }],
        waiting: [{ txn: "T1", mode: "X" }, { txn: "T2", mode: "X" }],
      },
    ]);
  });

  it("classic two-item deadlock halts with both transactions blocked", () => {
    const r = run(
      { A: 100, B: 100 },
      {
        T1: ["WRITE(A, 1)", "WRITE(B, 1)", "COMMIT"],
        T2: ["WRITE(B, 2)", "WRITE(A, 2)", "COMMIT"],
      },
      "T1 T2 T1 T2 T1 T2"
    );
    expect(r.blockedAtEnd).toEqual(["T1", "T2"]);
  });

  it("two readers never block each other", () => {
    const r = run(
      { A: 1000 },
      { T1: ["READ(A)", "COMMIT"], T2: ["READ(A)", "COMMIT"] },
      "T1 T2 T1 T2"
    );
    expect(r.steps.every((s) => s.outcome === "OK")).toBe(true);
  });
});
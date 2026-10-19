import { describe, it, expect } from "vitest";
import {
  ALL_MODES,
  IsolationLevel,
  LockManager,
  Scenario,
  compareModes,
  detectAnomalies,
  parseOps,
  simulate,
} from "../index";

function run(
  db: Record<string, number>,
  txns: Record<string, string[]>,
  schedule: string,
  level: IsolationLevel | "NONE"
) {
  const scenario: Scenario = {
    initialDb: db,
    transactions: Object.entries(txns).map(([id, lines]) => ({ id, ops: parseOps(lines) })),
    schedule: schedule.split(" "),
  };
  return simulate(scenario, level === "NONE" ? {} : { isolation: level });
}

const RMW = (d: string) => ["READ(A)", `WRITE(A, A${d})`, "COMMIT"];
const kinds = (r: ReturnType<typeof run>) => detectAnomalies(r.steps).map((a) => a.kind);

const DIRTY = {
  txns: { T1: ["WRITE(A, 500)", "ROLLBACK"], T2: ["READ(A)", "COMMIT"] },
  schedule: "T1 T2 T1 T2",
};
const NRR = {
  txns: { T1: ["READ(A)", "READ(A)", "COMMIT"], T2: ["WRITE(A, 500)", "COMMIT"] },
  schedule: "T1 T2 T2 T1 T1",
};
const LOST = { txns: { T1: RMW("-200"), T2: RMW("-300") }, schedule: "T1 T2 T1 T2 T1 T2" };

describe("LockManager.release", () => {
  it("releases a single lock early", () => {
    const lm = new LockManager();
    lm.tryAcquire("T1", "A", "S");
    expect(lm.release("T1", "A")).toBe(true);
    expect(lm.tryAcquire("T2", "A", "X")).toMatchObject({ granted: true });
  });
});

describe("READ UNCOMMITTED", () => {
  it("allows a dirty read (reads take no locks)", () => {
    const r = run({ A: 1000 }, DIRTY.txns, DIRTY.schedule, "READ_UNCOMMITTED");
    expect(r.steps.every((s) => s.outcome === "OK")).toBe(true);
    expect(kinds(r)).toEqual(["DIRTY_READ"]);
  });

  it("still suffers a lost update (the writer just waits, then overwrites)", () => {
    const r = run({ A: 1000 }, LOST.txns, LOST.schedule, "READ_UNCOMMITTED");
    expect(r.steps.map((s) => s.outcome)).toEqual([
      "OK", "OK", "OK", "BLOCKED", "OK", "OK", "OK",
    ]);
    expect(r.finalDb.A).toBe(700);
    expect(kinds(r)).toEqual(["LOST_UPDATE"]);
  });
});

describe("READ COMMITTED", () => {
  it("prevents the dirty read: the reader waits for the writer", () => {
    const r = run({ A: 1000 }, DIRTY.txns, DIRTY.schedule, "READ_COMMITTED");
    expect(r.steps.map((s) => s.outcome)).toEqual(["OK", "BLOCKED", "OK", "OK", "OK"]);
    expect(r.steps[3].valueRead).toBe(1000);
    expect(kinds(r)).toEqual([]);
  });

  it("still allows a non-repeatable read (S-lock is dropped after each read)", () => {
    const r = run({ A: 1000 }, NRR.txns, NRR.schedule, "READ_COMMITTED");
    expect(r.steps.every((s) => s.outcome === "OK")).toBe(true);
    expect(kinds(r)).toEqual(["NON_REPEATABLE_READ"]);
  });

  it("still suffers a lost update", () => {
    const r = run({ A: 1000 }, LOST.txns, LOST.schedule, "READ_COMMITTED");
    expect(r.finalDb.A).toBe(700);
    expect(kinds(r)).toEqual(["LOST_UPDATE"]);
  });

  it("writer blocks reader, then everything finishes correctly (500)", () => {
    const r = run({ A: 1000 }, { T1: RMW("-200"), T2: RMW("-300") }, "T1 T1 T2 T2 T1 T2", "READ_COMMITTED");
    expect(r.steps.map((s) => s.outcome)).toEqual([
      "OK", "OK", "BLOCKED", "OK", "OK", "OK", "OK",
    ]);
    expect(r.finalDb.A).toBe(500);
    expect(kinds(r)).toEqual([]);
  });

  it("drops the S-lock immediately after the read", () => {
    const r = run({ A: 1000 }, { T1: ["READ(A)", "COMMIT"] }, "T1 T1", "READ_COMMITTED");
    expect(r.steps[0].locksAfter).toEqual([]);
  });
});

describe("REPEATABLE READ / SERIALIZABLE", () => {
  it("keeps the S-lock until commit", () => {
    const r = run({ A: 1000 }, { T1: ["READ(A)", "COMMIT"] }, "T1 T1", "REPEATABLE_READ");
    expect(r.steps[0].locksAfter).toEqual([
      { item: "A", holders: [{ txn: "T1", mode: "S" }], waiting: [] },
    ]);
  });

  it("prevents the non-repeatable read: the writer waits until T1 commits", () => {
    const r = run({ A: 1000 }, NRR.txns, NRR.schedule, "REPEATABLE_READ");
    expect(r.steps.map((s) => s.outcome)).toEqual(["OK", "BLOCKED", "OK", "OK", "OK", "OK"]);
    expect(r.steps[0].valueRead).toBe(1000);
    expect(r.steps[2].valueRead).toBe(1000);
    expect(r.finalDb.A).toBe(500);
    expect(kinds(r)).toEqual([]);
  });

  it("turns the lost update into a deadlock", () => {
    const r = run({ A: 1000 }, LOST.txns, LOST.schedule, "REPEATABLE_READ");
    expect(r.blockedAtEnd).toEqual(["T1", "T2"]);
  });

  it("SERIALIZABLE behaves the same as REPEATABLE READ (no phantoms modelled)", () => {
    const r = run({ A: 1000 }, LOST.txns, LOST.schedule, "SERIALIZABLE");
    expect(r.blockedAtEnd).toEqual(["T1", "T2"]);
  });
});

describe("compatibility with Phase 4A", () => {
  it("locking: STRICT_2PL gives exactly the REPEATABLE_READ trace", () => {
    const scenario: Scenario = {
      initialDb: { A: 1000 },
      transactions: Object.entries(NRR.txns).map(([id, l]) => ({ id, ops: parseOps(l) })),
      schedule: NRR.schedule.split(" "),
    };
    expect(simulate(scenario, { locking: "STRICT_2PL" })).toEqual(
      simulate(scenario, { isolation: "REPEATABLE_READ" })
    );
  });
});

describe("compareModes", () => {
  it("shows lost update disappearing into a deadlock as isolation rises", () => {
    const scenario: Scenario = {
      initialDb: { A: 1000 },
      transactions: Object.entries(LOST.txns).map(([id, l]) => ({ id, ops: parseOps(l) })),
      schedule: LOST.schedule.split(" "),
    };
    const rows = compareModes(scenario);
    expect(rows.map((r) => r.mode)).toEqual(ALL_MODES);

    const by = Object.fromEntries(rows.map((r) => [r.mode, r]));
    expect(by.NONE.anomalies).toEqual(["LOST_UPDATE"]);
    expect(by.READ_UNCOMMITTED.anomalies).toEqual(["LOST_UPDATE"]);
    expect(by.READ_COMMITTED.anomalies).toEqual(["LOST_UPDATE"]);
    expect(by.REPEATABLE_READ.verdict).toBe("DEADLOCK");
    expect(by.SERIALIZABLE.verdict).toBe("DEADLOCK");
  });
});
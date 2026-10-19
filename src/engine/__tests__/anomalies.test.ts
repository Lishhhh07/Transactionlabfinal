import { describe, it, expect } from "vitest";
import { simulate, parseOps, detectAnomalies, Scenario } from "../index";

/** Helper: txns as { T1: [lines], T2: [lines] }, schedule as "T1 T2 T1 ..." */
function analyze(
  db: Record<string, number>,
  txns: Record<string, string[]>,
  schedule: string
) {
  const scenario: Scenario = {
    initialDb: db,
    transactions: Object.entries(txns).map(([id, lines]) => ({ id, ops: parseOps(lines) })),
    schedule: schedule.split(" "),
  };
  return detectAnomalies(simulate(scenario).steps);
}

const RMW = (delta: string) => ["READ(A)", `WRITE(A, A${delta})`, "COMMIT"];

describe("anomaly detection", () => {
  it("Lost Update: interleaved read-modify-write", () => {
    const a = analyze({ A: 1000 }, { T1: RMW("-200"), T2: RMW("-300") }, "T1 T2 T1 T2 T1 T2");
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({
      kind: "LOST_UPDATE",
      victim: "T1",
      other: "T2",
      steps: [1, 2, 3],
      at: 3,
    });
  });

  it("Lost Update: also works with constant writes (your doc's example)", () => {
    const a = analyze(
      { A: 1000 },
      {
        T1: ["READ(A)", "WRITE(A, 800)", "COMMIT"],
        T2: ["READ(A)", "WRITE(A, 700)", "COMMIT"],
      },
      "T1 T2 T1 T2 T1 T2"
    );
    expect(a.map((x) => x.kind)).toEqual(["LOST_UPDATE"]);
  });

  it("Serial schedule has no anomalies", () => {
    const a = analyze({ A: 1000 }, { T1: RMW("-200"), T2: RMW("-300") }, "T1 T1 T1 T2 T2 T2");
    expect(a).toEqual([]);
  });

  it("Lost Update is NOT reported when the other transaction rolls back", () => {
    const a = analyze(
      { A: 1000 },
      {
        T1: ["READ(A)", "WRITE(A, 800)", "ROLLBACK"],
        T2: ["READ(A)", "WRITE(A, 700)", "COMMIT"],
      },
      "T1 T2 T1 T2 T1 T2"
    );
    expect(a.filter((x) => x.kind === "LOST_UPDATE")).toHaveLength(0);
  });

  it("Dirty Read: reader sees a value that is later rolled back", () => {
    const a = analyze(
      { A: 1000 },
      { T1: ["WRITE(A, 500)", "ROLLBACK"], T2: ["READ(A)", "COMMIT"] },
      "T1 T2 T1 T2"
    );
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: "DIRTY_READ", victim: "T2", other: "T1", at: 1 });
    expect(a[0].explanation).toMatch(/rolled back/);
  });

  it("Dirty Read: still flagged when the writer commits later", () => {
    const a = analyze(
      { A: 1000 },
      { T1: ["WRITE(A, 500)", "COMMIT"], T2: ["READ(A)", "COMMIT"] },
      "T1 T2 T1 T2"
    );
    expect(a.map((x) => x.kind)).toEqual(["DIRTY_READ"]);
  });

  it("Reading your own uncommitted write is not a dirty read", () => {
    const a = analyze({ A: 1000 }, { T1: ["WRITE(A, 500)", "READ(A)", "COMMIT"] }, "T1 T1 T1");
    expect(a).toEqual([]);
  });

  it("Non-repeatable Read: value changes between two reads", () => {
    const a = analyze(
      { A: 1000 },
      { T1: ["READ(A)", "READ(A)", "COMMIT"], T2: ["WRITE(A, 500)", "COMMIT"] },
      "T1 T2 T2 T1 T1"
    );
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({
      kind: "NON_REPEATABLE_READ",
      victim: "T1",
      other: "T2",
      steps: [0, 1, 3],
      at: 3,
    });
  });

  it("Transactions touching different items produce no anomalies", () => {
    const a = analyze(
      { A: 1000, B: 500 },
      {
        T1: ["READ(A)", "WRITE(A, A-200)", "COMMIT"],
        T2: ["READ(B)", "WRITE(B, B-100)", "COMMIT"],
      },
      "T1 T2 T1 T2 T1 T2"
    );
    expect(a).toEqual([]);
  });
});
import { describe, it, expect } from "vitest";
import { simulate, parseOps, Scenario } from "../index";

const txn = (id: string, ...lines: string[]) => ({ id, ops: parseOps(lines) });

describe("simulator (Phase 1: no concurrency control)", () => {
  const T1 = txn("T1", "READ(A)", "WRITE(A, A-200)", "COMMIT");
  const T2 = txn("T2", "READ(A)", "WRITE(A, A-300)", "COMMIT");

  it("serial schedule gives the correct balance (500)", () => {
    const s: Scenario = {
      initialDb: { A: 1000 },
      transactions: [T1, T2],
      schedule: ["T1", "T1", "T1", "T2", "T2", "T2"],
    };
    const r = simulate(s);
    expect(r.finalDb.A).toBe(500);
    expect(r.finalStatus).toEqual({ T1: "COMMITTED", T2: "COMMITTED" });
  });

  it("interleaved schedule causes a LOST UPDATE (700, not 500)", () => {
    const s: Scenario = {
      initialDb: { A: 1000 },
      transactions: [T1, T2],
      schedule: ["T1", "T2", "T1", "T2", "T1", "T2"],
    };
    const r = simulate(s);
    expect(r.steps[0].valueRead).toBe(1000); // T1 reads 1000
    expect(r.steps[1].valueRead).toBe(1000); // T2 reads 1000 as well
    expect(r.finalDb.A).toBe(700);
  });

  it("allows a DIRTY READ and then restores the value on rollback", () => {
    const s: Scenario = {
      initialDb: { A: 1000 },
      transactions: [
        txn("T1", "WRITE(A, 500)", "ROLLBACK"),
        txn("T2", "READ(A)", "COMMIT"),
      ],
      schedule: ["T1", "T2", "T1", "T2"],
    };
    const r = simulate(s);
    expect(r.steps[1].valueRead).toBe(500); // T2 saw uncommitted data
    expect(r.finalDb.A).toBe(1000);         // ...which was then undone
    expect(r.finalStatus.T1).toBe("ABORTED");
  });

  it("rejects a schedule that doesn't cover all operations", () => {
    const s: Scenario = {
      initialDb: { A: 1000 },
      transactions: [T1],
      schedule: ["T1", "T1"],
    };
    expect(() => simulate(s)).toThrow(/Schedule has 2 entries/);
  });

  it("rejects WRITE(A, A-200) without a prior READ(A)", () => {
    const s: Scenario = {
      initialDb: { A: 1000 },
      transactions: [txn("T1", "WRITE(A, A-200)", "COMMIT")],
      schedule: ["T1", "T1"],
    };
    expect(() => simulate(s)).toThrow(/has not READ/);
  });
});
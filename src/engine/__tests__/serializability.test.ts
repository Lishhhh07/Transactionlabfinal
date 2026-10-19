import { describe, it, expect } from "vitest";
import {
  Scenario,
  SimOptions,
  analyzeSerializability,
  compareModes,
  describeConflict,
  detectAnomalies,
  parseOps,
  simulate,
} from "../index";

function build(db: Record<string, number>, txns: Record<string, string[]>, schedule: string): Scenario {
  return {
    initialDb: db,
    transactions: Object.entries(txns).map(([id, lines]) => ({ id, ops: parseOps(lines) })),
    schedule: schedule.split(" "),
  };
}

function check(
  db: Record<string, number>,
  txns: Record<string, string[]>,
  schedule: string,
  opts: SimOptions = {}
) {
  const result = simulate(build(db, txns, schedule), opts);
  return {
    result,
    ser: analyzeSerializability(result.steps),
    anomalies: detectAnomalies(result.steps).map((a) => a.kind),
  };
}

const RMW = (d: string) => ["READ(A)", `WRITE(A, A${d})`, "COMMIT"];
const edgeSummary = (s: ReturnType<typeof analyzeSerializability>) =>
  s.edges.map((e) => [e.from, e.to, e.conflicts.map((c) => c.kind)]);

describe("precedence graph", () => {
  it("lost update has a cycle T1 ⇄ T2", () => {
    const { ser } = check({ A: 1000 }, { T1: RMW("-200"), T2: RMW("-300") }, "T1 T2 T1 T2 T1 T2");
    expect(ser.serializable).toBe(false);
    expect(ser.cycle).toEqual(["T1", "T2"]);
    expect(ser.serialOrder).toBeNull();
    expect(edgeSummary(ser)).toEqual([
      ["T1", "T2", ["RW", "WW"]],
      ["T2", "T1", ["RW"]],
    ]);
  });

  it("serial schedule gives T1 → T2 and the serial order [T1, T2]", () => {
    const { ser } = check({ A: 1000 }, { T1: RMW("-200"), T2: RMW("-300") }, "T1 T1 T1 T2 T2 T2");
    expect(ser.serializable).toBe(true);
    expect(edgeSummary(ser)).toEqual([["T1", "T2", ["RW", "WR", "WW"]]]);
    expect(ser.serialOrder).toEqual(["T1", "T2"]);
  });

  it("serial order follows the schedule: T2 first gives [T2, T1]", () => {
    const { ser } = check({ A: 1000 }, { T1: RMW("-200"), T2: RMW("-300") }, "T2 T2 T2 T1 T1 T1");
    expect(edgeSummary(ser)).toEqual([["T2", "T1", ["RW", "WR", "WW"]]]);
    expect(ser.serialOrder).toEqual(["T2", "T1"]);
  });

  it("transactions on different items have no edges", () => {
    const { ser } = check(
      { A: 1000, B: 500 },
      {
        T1: ["READ(A)", "WRITE(A, A-200)", "COMMIT"],
        T2: ["READ(B)", "WRITE(B, B-100)", "COMMIT"],
      },
      "T1 T2 T1 T2 T1 T2"
    );
    expect(ser.edges).toEqual([]);
    expect(ser.serializable).toBe(true);
    expect(ser.serialOrder).toEqual(["T1", "T2"]);
  });

  it("interleaved but still serializable: only T1 → T2", () => {
    const { ser, anomalies } = check(
      { A: 1, B: 1 },
      {
        T1: ["READ(A)", "READ(B)", "COMMIT"],
        T2: ["READ(A)", "WRITE(B, 5)", "COMMIT"],
      },
      "T1 T2 T1 T2 T1 T2"
    );
    expect(edgeSummary(ser)).toEqual([["T1", "T2", ["RW"]]]);
    expect(ser.serialOrder).toEqual(["T1", "T2"]);
    expect(anomalies).toEqual([]);
  });

  it("non-repeatable read is a cycle", () => {
    const { ser } = check(
      { A: 1000 },
      { T1: ["READ(A)", "READ(A)", "COMMIT"], T2: ["WRITE(A, 500)", "COMMIT"] },
      "T1 T2 T2 T1 T1"
    );
    expect(ser.cycle).toEqual(["T1", "T2"]);
  });

  it("finds a cycle of length 3", () => {
    const { ser } = check(
      { A: 100, B: 100, C: 100 },
      {
        T1: ["WRITE(A, 1)", "WRITE(B, 1)", "COMMIT"],
        T2: ["WRITE(B, 2)", "WRITE(C, 2)", "COMMIT"],
        T3: ["WRITE(C, 3)", "WRITE(A, 3)", "COMMIT"],
      },
      "T1 T2 T3 T1 T2 T3 T1 T2 T3"
    );
    expect(ser.cycle).toEqual(["T1", "T3", "T2"]); // T1→T3 (A), T3→T2 (C), T2→T1 (B)
  });
});

describe("what counts", () => {
  it("aborted transactions are ignored", () => {
    const { ser, anomalies } = check(
      { A: 1000 },
      { T1: ["WRITE(A, 500)", "ROLLBACK"], T2: ["READ(A)", "COMMIT"] },
      "T1 T2 T1 T2"
    );
    expect(ser.nodes).toEqual(["T2"]);
    expect(ser.ignored).toEqual(["T1"]);
    expect(ser.edges).toEqual([]);
    expect(ser.serializable).toBe(true);
    expect(anomalies).toEqual(["DIRTY_READ"]); // Phase 3 still catches it
  });

  it("transactions stuck in a halted deadlock are ignored too", () => {
    const { ser } = check(
      { A: 1000 },
      { T1: RMW("-200"), T2: RMW("-300") },
      "T1 T2 T1 T2 T1 T2",
      { isolation: "REPEATABLE_READ" } // deadlock: "HALT" is the default
    );
    expect(ser.nodes).toEqual([]);
    expect(ser.ignored).toEqual(["T1", "T2"]);
    expect(ser.serialOrder).toEqual([]);
  });

  it("a dirty read whose writer commits is still conflict-serializable (the checker's blind spot)", () => {
    const { ser, anomalies } = check(
      { A: 1000 },
      { T1: ["WRITE(A, 500)", "COMMIT"], T2: ["READ(A)", "COMMIT"] },
      "T1 T2 T1 T2"
    );
    expect(ser.serializable).toBe(true);
    expect(anomalies).toEqual(["DIRTY_READ"]);
  });

  it("describeConflict reads naturally", () => {
    const { ser } = check({ A: 1000 }, { T1: RMW("-200"), T2: RMW("-300") }, "T1 T2 T1 T2 T1 T2");
    expect(describeConflict(ser.edges[0].conflicts[0])).toBe(
      "T1 reads A (step 1) before T2 writes it (step 4)"
    );
  });
});

describe("closing the gaps left by earlier phases", () => {
  const CLASSIC = {
    db: { A: 100, B: 100 },
    txns: {
      T1: ["WRITE(A, 1)", "WRITE(B, 1)", "COMMIT"],
      T2: ["WRITE(B, 2)", "WRITE(A, 2)", "COMMIT"],
    },
    schedule: "T1 T2 T1 T2 T1 T2",
  };

  it("classic deadlock with NO locks (dirty writes) is flagged as non-serializable", () => {
    const { ser, anomalies } = check(CLASSIC.db, CLASSIC.txns, CLASSIC.schedule);
    expect(anomalies).toEqual([]); // the Phase 3 detectors cannot see dirty writes
    expect(ser.cycle).toEqual(["T1", "T2"]);
  });

  const SKEW = {
    db: { A: 1, B: 1 },
    txns: {
      T1: ["READ(A)", "READ(B)", "WRITE(A, 0)", "COMMIT"],
      T2: ["READ(A)", "READ(B)", "WRITE(B, 0)", "COMMIT"],
    },
    schedule: "T1 T2 T1 T2 T1 T2 T1 T2",
  };

  it("write skew: no Phase 3 anomaly, but the schedule is not serializable", () => {
    const { ser, anomalies, result } = check(SKEW.db, SKEW.txns, SKEW.schedule);
    expect(anomalies).toEqual([]);
    expect(ser.cycle).toEqual(["T1", "T2"]);
    expect(result.finalDb).toEqual({ A: 0, B: 0 }); // the invariant "at least one is 1" broke
  });

  it("write skew survives READ COMMITTED, but REPEATABLE READ resolves it", () => {
    const rc = check(SKEW.db, SKEW.txns, SKEW.schedule, { isolation: "READ_COMMITTED" });
    expect(rc.ser.serializable).toBe(false);

    const rr = check(SKEW.db, SKEW.txns, SKEW.schedule, {
      isolation: "REPEATABLE_READ",
      deadlock: "ABORT_VICTIM",
    });
    expect(rr.ser.serializable).toBe(true);
    expect(rr.result.finalDb).toEqual({ A: 0, B: 1 });
  });
});

describe("isolation levels vs serializability", () => {
  const LOST = { T1: RMW("-200"), T2: RMW("-300") };

  it("lost update under READ COMMITTED is not serializable", () => {
    const { ser } = check({ A: 1000 }, LOST, "T1 T2 T1 T2 T1 T2", { isolation: "READ_COMMITTED" });
    expect(ser.cycle).toEqual(["T1", "T2"]);
  });

  it("lost update under REPEATABLE READ: victim ignored, the survivor is serializable", () => {
    const { ser } = check({ A: 1000 }, LOST, "T1 T2 T1 T2 T1 T2", {
      isolation: "REPEATABLE_READ",
      deadlock: "ABORT_VICTIM",
    });
    expect(ser.nodes).toEqual(["T1"]);
    expect(ser.ignored).toEqual(["T2"]);
    expect(ser.serializable).toBe(true);
    expect(ser.serialOrder).toEqual(["T1"]);
  });
});

// ───────────── Property tests: random schedules ─────────────

/** Small deterministic PRNG (mulberry32), so a failure is reproducible from its seed. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomScenario(seed: number): Scenario {
  const rand = rng(seed);
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const items = ["A", "B", "C"];

  const transactions = [];
  const n = 2 + Math.floor(rand() * 2); // 2 or 3 transactions
  for (let i = 1; i <= n; i++) {
    const lines: string[] = [];
    const len = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < len; k++) {
      lines.push(
        rand() < 0.5 ? `READ(${pick(items)})` : `WRITE(${pick(items)}, ${Math.floor(rand() * 100)})`
      );
    }
    lines.push(rand() < 0.85 ? "COMMIT" : "ROLLBACK");
    transactions.push({ id: `T${i}`, ops: parseOps(lines) });
  }

  // Random interleaving = shuffle the multiset of transaction ids.
  const schedule = transactions.flatMap((t) => t.ops.map(() => t.id));
  for (let i = schedule.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [schedule[i], schedule[j]] = [schedule[j], schedule[i]];
  }
  return { initialDb: { A: 0, B: 0, C: 0 }, transactions, schedule };
}

describe("property tests (300 random schedules)", () => {
  it("strict 2PL (REPEATABLE READ / SERIALIZABLE) always produces a conflict-serializable history", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const scenario = randomScenario(seed);
      for (const isolation of ["REPEATABLE_READ", "SERIALIZABLE"] as const) {
        const r = simulate(scenario, { isolation, deadlock: "ABORT_VICTIM" });
        const ser = analyzeSerializability(r.steps);
        expect(ser.serializable, `seed ${seed}, ${isolation}`).toBe(true);
      }
    }
  });

  it("without locks the checker really does find violations (so the test above isn't vacuous)", () => {
    let violations = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const r = simulate(randomScenario(seed));
      if (!analyzeSerializability(r.steps).serializable) violations++;
    }
    expect(violations).toBeGreaterThan(0);
  });
});

describe("compareModes", () => {
  it("adds the serializable column and the NOT_SERIALIZABLE verdict", () => {
    const rows = compareModes(
      build(
        { A: 100, B: 100 },
        {
          T1: ["WRITE(A, 1)", "WRITE(B, 1)", "COMMIT"],
          T2: ["WRITE(B, 2)", "WRITE(A, 2)", "COMMIT"],
        },
        "T1 T2 T1 T2 T1 T2"
      ),
      { deadlock: "ABORT_VICTIM" }
    );
    const by = Object.fromEntries(rows.map((r) => [r.mode, r]));
    expect(by.NONE.verdict).toBe("NOT_SERIALIZABLE");
    expect(by.NONE.serializable).toBe(false);
    expect(by.REPEATABLE_READ.verdict).toBe("RESOLVED");
    expect(by.REPEATABLE_READ.serializable).toBe(true);
  });
});
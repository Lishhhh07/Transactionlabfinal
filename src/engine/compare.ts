import { AnomalyKind, detectAnomalies } from "./anomalies";
import { ALL_MODES, optionsFor } from "./isolation";
import { analyzeSerializability } from "./serializability";
import { simulate } from "./simulator";
import { CcMode, Database, Scenario, SimOptions, TxnId, TxnStatus } from "./types";

export interface CompareRow {
  mode: CcMode;
  verdict: "CLEAN" | "ANOMALY" | "NOT_SERIALIZABLE" | "DEADLOCK" | "RESOLVED";
  anomalies: AnomalyKind[];
  serializable: boolean | null;   // null = the run halted, so there is nothing to judge
  deadlock: boolean;              // true = the run HALTED stuck in a deadlock
  deadlocksResolved: number;
  blockedSteps: number;
  finalDb: Database;
  finalStatus: Record<TxnId, TxnStatus>;
}

export function compareModes(
  scenario: Scenario,
  extra: Pick<SimOptions, "deadlock" | "victim"> = {}
): CompareRow[] {
  return ALL_MODES.map((mode) => {
    const r = simulate(scenario, { ...optionsFor(mode), ...extra });
    const anomalies = [...new Set(detectAnomalies(r.steps).map((a) => a.kind))];
    const ser = analyzeSerializability(r.steps);
    const halted = r.blockedAtEnd.length > 0;
    const resolved = r.deadlocks.filter((d) => d.victim !== undefined).length;

    const verdict: CompareRow["verdict"] = halted
      ? "DEADLOCK"
      : anomalies.length > 0
      ? "ANOMALY"
      : !ser.serializable
      ? "NOT_SERIALIZABLE"
      : resolved > 0
      ? "RESOLVED"
      : "CLEAN";

    return {
      mode,
      verdict,
      anomalies,
      serializable: halted ? null : ser.serializable,
      deadlock: halted,
      deadlocksResolved: resolved,
      blockedSteps: r.steps.filter((s) => s.outcome === "BLOCKED").length,
      finalDb: r.finalDb,
      finalStatus: r.finalStatus,
    };
  });
}
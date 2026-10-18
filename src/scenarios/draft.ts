import { Database, Scenario, parseOps } from "@/engine";

export interface DraftTxn {
  id: string;   // "T1"
  ops: string;  // one operation per line
}

export interface DraftScenario {
  db: string;           
  txns: DraftTxn[];
  schedule: string[];   
}

export type BuildResult =
  | { ok: true; scenario: Scenario }
  | { ok: false; error: string };

export function parseDb(text: string): Database {
  const parts = text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    throw new Error("Database is empty. Write something like A=1000, B=500.");
  }

  const db: Database = {};
  for (const p of parts) {
    const m = p.match(/^([A-Za-z][A-Za-z0-9_]*)\s*=\s*(-?\d+(?:\.\d+)?)$/);
    if (!m) throw new Error(`Bad database entry "${p}". Use the form A=1000.`);
    db[m[1].toUpperCase()] = Number(m[2]);
  }
  return db;
}

export function opLines(ops: string): string[] {
  return ops
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}
export function countOps(d: DraftScenario, id: string): number {
  const t = d.txns.find((x) => x.id === id);
  return t ? opLines(t.ops).length : 0;
}

export function buildScenario(d: DraftScenario): BuildResult {
  try {
    const initialDb = parseDb(d.db);

    const transactions = d.txns.map((t) => {
      try {
        return { id: t.id, ops: parseOps(opLines(t.ops)) };
      } catch (e) {
        throw new Error(`${t.id}: ${(e as Error).message}`);
      }
    });

    return {
      ok: true,
      scenario: { initialDb, transactions, schedule: d.schedule },
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
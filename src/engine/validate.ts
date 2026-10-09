import { Scenario } from "./types";

export class ScenarioError extends Error {}

export function validateScenario(s: Scenario): void {
  const ids = new Set<string>();

  for (const t of s.transactions) {
    if (ids.has(t.id)) throw new ScenarioError(`Duplicate transaction id "${t.id}".`);
    ids.add(t.id);

    if (t.ops.length === 0) throw new ScenarioError(`${t.id} has no operations.`);

    const itemsRead = new Set<string>();

    t.ops.forEach((op, i) => {
      const isLast = i === t.ops.length - 1;
      const isTerminal = op.type === "COMMIT" || op.type === "ROLLBACK";

      if (isTerminal && !isLast) {
        throw new ScenarioError(`${t.id}: ${op.type} must be the last operation.`);
      }
      if (isLast && !isTerminal) {
        throw new ScenarioError(`${t.id}: must end with COMMIT or ROLLBACK.`);
      }

      if (op.type === "READ" || op.type === "WRITE") {
        if (!(op.item in s.initialDb)) {
          throw new ScenarioError(`${t.id}: item "${op.item}" does not exist in the database.`);
        }
      }

      if (op.type === "READ") itemsRead.add(op.item);

      if (op.type === "WRITE" && op.value.kind === "readPlus") {
        if (!itemsRead.has(op.value.item)) {
          throw new ScenarioError(
            `${t.id}: WRITE uses ${op.value.item} but ${t.id} has not READ(${op.value.item}) yet.`
          );
        }
      }
    });
  }

  // Schedule must use known transactions and cover every operation exactly once.
  const counts: Record<string, number> = {};
  for (const id of s.schedule) {
    if (!ids.has(id)) throw new ScenarioError(`Schedule mentions unknown transaction "${id}".`);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  for (const t of s.transactions) {
    const c = counts[t.id] ?? 0;
    if (c !== t.ops.length) {
      throw new ScenarioError(
        `Schedule has ${c} entries for ${t.id}, but ${t.id} has ${t.ops.length} operations.`
      );
    }
  }
}
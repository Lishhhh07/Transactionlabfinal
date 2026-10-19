import { simulate, parseOps } from "./index";
import { detectAnomalies } from "./index";

const result = simulate({
  initialDb: { A: 1000 },
  transactions: [
    { id: "T1", ops: parseOps(["READ(A)", "WRITE(A, A-200)", "COMMIT"]) },
    { id: "T2", ops: parseOps(["READ(A)", "WRITE(A, A-300)", "COMMIT"]) },
  ],
  schedule: ["T1", "T2", "T1", "T2", "T1", "T2"],
});

for (const s of result.steps) {
  console.log(`Step ${s.index + 1}: ${s.message}   DB=${JSON.stringify(s.dbAfter)}`);
}

for (const a of detectAnomalies(result.steps)) {
  console.log(`⚠ ${a.title} (${a.item}) at step ${a.at + 1}: ${a.explanation}`);
}
console.log("Final:", result.finalDb, result.finalStatus);
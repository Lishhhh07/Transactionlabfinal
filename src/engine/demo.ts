import { simulate, parseOps } from "./index";

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
console.log("Final:", result.finalDb, result.finalStatus);
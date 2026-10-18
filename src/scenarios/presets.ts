import { DraftScenario } from "./draft";

export interface Preset {
  name: string;
  description: string;
  draft: DraftScenario;
}

export const PRESETS: Preset[] = [
  {
    name: "Lost Update",
    description: "Both transactions read 1000, so one withdrawal overwrites the other.",
    draft: {
      db: "A=1000",
      txns: [
        { id: "T1", ops: "READ(A)\nWRITE(A, A-200)\nCOMMIT" },
        { id: "T2", ops: "READ(A)\nWRITE(A, A-300)\nCOMMIT" },
      ],
      schedule: ["T1", "T2", "T1", "T2", "T1", "T2"],
    },
  },
  {
    name: "Serial (correct)",
    description: "Same transactions, run one after the other. Result is 500.",
    draft: {
      db: "A=1000",
      txns: [
        { id: "T1", ops: "READ(A)\nWRITE(A, A-200)\nCOMMIT" },
        { id: "T2", ops: "READ(A)\nWRITE(A, A-300)\nCOMMIT" },
      ],
      schedule: ["T1", "T1", "T1", "T2", "T2", "T2"],
    },
  },
  {
    name: "Dirty Read",
    description: "T2 reads a value T1 wrote but later rolled back.",
    draft: {
      db: "A=1000",
      txns: [
        { id: "T1", ops: "WRITE(A, 500)\nROLLBACK" },
        { id: "T2", ops: "READ(A)\nCOMMIT" },
      ],
      schedule: ["T1", "T2", "T1", "T2"],
    },
  },
  {
    name: "Non-repeatable Read",
    description: "T1 reads A twice and gets different values.",
    draft: {
      db: "A=1000",
      txns: [
        { id: "T1", ops: "READ(A)\nREAD(A)\nCOMMIT" },
        { id: "T2", ops: "WRITE(A, 500)\nCOMMIT" },
      ],
      schedule: ["T1", "T2", "T2", "T1", "T1"],
    },
  },
];
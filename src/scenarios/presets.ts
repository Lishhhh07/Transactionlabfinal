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
    {
    name: "Safe interleaving",
    description: "Interleaved, but the transactions touch different items, so nothing goes wrong.",
    draft: {
      db: "A=1000, B=500",
      txns: [
        { id: "T1", ops: "READ(A)\nWRITE(A, A-200)\nCOMMIT" },
        { id: "T2", ops: "READ(B)\nWRITE(B, B-100)\nCOMMIT" },
      ],
      schedule: ["T1", "T2", "T1", "T2", "T1", "T2"],
    },
  },
    {
    name: "Three-way Deadlock",
    description: "T1 waits for T2, T2 waits for T3, T3 waits for T1. A cycle of length 3.",
    draft: {
      db: "A=100, B=100, C=100",
      txns: [
        { id: "T1", ops: "WRITE(A, 1)\nWRITE(B, 1)\nCOMMIT" },
        { id: "T2", ops: "WRITE(B, 2)\nWRITE(C, 2)\nCOMMIT" },
        { id: "T3", ops: "WRITE(C, 3)\nWRITE(A, 3)\nCOMMIT" },
      ],
      schedule: ["T1", "T2", "T3", "T1", "T2", "T3", "T1", "T2", "T3"],
    },
  },
  {
    name: "Victim choice",
    description: "T1 (older) has done 1 write, T2 (younger) has done 2. Compare the victim policies.",
    draft: {
      db: "A=100, B=100, C=100",
      txns: [
        { id: "T1", ops: "WRITE(A, 1)\nWRITE(B, 1)\nCOMMIT" },
        { id: "T2", ops: "WRITE(C, 2)\nWRITE(B, 2)\nWRITE(A, 2)\nCOMMIT" },
      ],
      schedule: ["T1", "T2", "T2", "T1", "T2", "T1", "T2"],
    },
  },
    {
    name: "Write skew",
    description:
      "Each doctor checks that someone else is on call, then goes off call. No lost update, no dirty read, yet the result is wrong.",
    draft: {
      db: "A=1, B=1",
      txns: [
        { id: "T1", ops: "READ(A)\nREAD(B)\nWRITE(A, 0)\nCOMMIT" },
        { id: "T2", ops: "READ(A)\nREAD(B)\nWRITE(B, 0)\nCOMMIT" },
      ],
      schedule: ["T1", "T2", "T1", "T2", "T1", "T2", "T1", "T2"],
    },
  },
  {
    name: "Interleaved but serializable",
    description:
      "The operations interleave, but every conflict points the same way (T1 → T2), so it equals the serial order T1, T2.",
    draft: {
      db: "A=1, B=1",
      txns: [
        { id: "T1", ops: "READ(A)\nREAD(B)\nCOMMIT" },
        { id: "T2", ops: "READ(A)\nWRITE(B, 5)\nCOMMIT" },
      ],
      schedule: ["T1", "T2", "T1", "T2", "T1", "T2"],
    },
  },
    {
    name: "Writer blocks reader",
    description: "T2 tries to read what T1 is modifying. With locks on, T2 waits until T1 commits.",
    draft: {
      db: "A=1000",
      txns: [
        { id: "T1", ops: "READ(A)\nWRITE(A, A-200)\nCOMMIT" },
        { id: "T2", ops: "READ(A)\nWRITE(A, A-300)\nCOMMIT" },
      ],
      schedule: ["T1", "T1", "T2", "T2", "T1", "T2"],
    },
  },
  {
    name: "Classic Deadlock",
    description: "T1 and T2 take A and B in opposite order. With locks on, neither can proceed.",
    draft: {
      db: "A=100, B=100",
      txns: [
        { id: "T1", ops: "WRITE(A, 1)\nWRITE(B, 1)\nCOMMIT" },
        { id: "T2", ops: "WRITE(B, 2)\nWRITE(A, 2)\nCOMMIT" },
      ],
      schedule: ["T1", "T2", "T1", "T2", "T1", "T2"],
    },
  },
];
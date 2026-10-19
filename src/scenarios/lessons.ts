import { AnomalyKind, CcMode, Database } from "@/engine";
import { Settings } from "./settings";

/** Which panel the learner should look at. */
export type Look = "anomaly" | "timeline" | "state" | "waitfor" | "precedence";
export type Variant = "problem" | "fix";

export interface Beat {
  at: number;      // cursor value (number of steps executed) from which this text applies
  text: string;
  look?: Look;
}

/** What the real engine must produce. A test enforces this. */
export interface Expect {
  steps: number;
  finalDb: Database;
  anomalies: AnomalyKind[];
  serializable: boolean;
}

export interface LessonVariant {
  settings: Settings;
  beats: Beat[];
  expect: Expect;
  takeaway: string;
}

export interface Lesson extends LessonVariant {
  id: string;
  title: string;
  blurb: string;
  preset: string; // name of an entry in PRESETS
  fix?: LessonVariant & { label: string };
}

const on = (mode: CcMode): Settings => ({
  mode,
  deadlock: "ABORT_VICTIM",
  victim: "YOUNGEST",
});

export function viewOf(lesson: Lesson, variant: Variant): LessonVariant {
  return variant === "fix" && lesson.fix ? lesson.fix : lesson;
}

/** The latest beat whose `at` is at or before the cursor. */
export function beatAt(beats: Beat[], cursor: number): Beat {
  let current = beats[0];
  for (const b of beats) if (b.at <= cursor) current = b;
  return current;
}

export const LESSONS: Lesson[] = [
  // ───────────────────────── 1. Lost update ─────────────────────────
  {
    id: "lost-update",
    title: "Lost Update",
    blurb: "Two withdrawals, one disappears.",
    preset: "Lost Update",
    settings: on("NONE"),
    beats: [
      { at: 0, text: "Two customers withdraw from the same account at the same moment: T1 takes ₹200, T2 takes ₹300. The balance A is 1000, so the correct result is 500. Press Next to watch it go wrong.", look: "state" },
      { at: 1, text: "T1 reads A = 1000 into its private memory. Nothing wrong yet.", look: "state" },
      { at: 2, text: "T2 also reads A = 1000. Both transactions now work from the same old value, and neither knows about the other.", look: "timeline" },
      { at: 3, text: "T1 computes 1000 − 200 and writes 800.", look: "state" },
      { at: 4, text: "T2 computes from its stale copy: 1000 − 300 = 700, and overwrites T1's 800. T1's withdrawal has vanished. This is a LOST UPDATE.", look: "anomaly" },
      { at: 5, text: "T1 commits. Its write was already overwritten, so committing changes nothing.", look: "timeline" },
      { at: 6, text: "T2 commits. Final balance 700 instead of 500, and the database never raised an error. Check the precedence graph: T1 must come before T2 and T2 before T1, so no serial order explains this result.", look: "precedence" },
    ],
    expect: { steps: 6, finalDb: { A: 700 }, anomalies: ["LOST_UPDATE"], serializable: false },
    takeaway:
      "A lost update happens when a transaction writes a value computed from a read that someone else has since invalidated. Both commits succeed, so it is silent data corruption. It is also an anomaly that Read Committed does NOT fix.",
    fix: {
      label: "Repeatable Read",
      settings: on("REPEATABLE_READ"),
      beats: [
        { at: 0, text: "Same transactions, same schedule, but now under Repeatable Read: every lock is held until commit.", look: "state" },
        { at: 1, text: "T1 reads A and takes a shared (S) lock on it, which it keeps until it commits.", look: "state" },
        { at: 2, text: "T2 reads A too. Two S-locks can coexist, so this is allowed.", look: "state" },
        { at: 3, text: "T1 wants to write A, which needs an exclusive (X) lock. But T2 holds an S-lock on A, so T1 must wait for T2.", look: "waitfor" },
        { at: 4, text: "T2 wants to write A, but T1 holds an S-lock. T2 waits for T1. Each is waiting for the other: a DEADLOCK (T1 → T2 → T1).", look: "waitfor" },
        { at: 5, text: "The DBMS finds the cycle in the wait-for graph and aborts T2 (the youngest). Its locks are released.", look: "timeline" },
        { at: 6, text: "T1 can now upgrade its lock and write: 1000 − 200 = 800.", look: "state" },
        { at: 7, text: "T1 commits. A = 800. T2 was aborted, and the application would simply retry it (giving 500). The silent corruption became a safe abort plus retry.", look: "precedence" },
      ],
      expect: { steps: 7, finalDb: { A: 800 }, anomalies: [], serializable: true },
      takeaway:
        "Locking converted silent corruption into a detectable deadlock, and aborting one transaction kept the data correct. Real systems then retry the victim. (Another standard fix is SELECT … FOR UPDATE, which takes the exclusive lock at read time and avoids the deadlock.)",
    },
  },

  // ───────────────────────── 2. Dirty read ─────────────────────────
  {
    id: "dirty-read",
    title: "Dirty Read",
    blurb: "Reading data that never officially existed.",
    preset: "Dirty Read",
    settings: on("NONE"),
    beats: [
      { at: 0, text: "T1 is going to change A to 500, then change its mind and roll back. T2 reads A somewhere in between.", look: "timeline" },
      { at: 1, text: "T1 writes A = 500. It has not committed, so this is only a tentative change.", look: "state" },
      { at: 2, text: "T2 reads A = 500: a value that has not been committed. This is a DIRTY READ.", look: "anomaly" },
      { at: 3, text: "T1 rolls back and A returns to 1000. The value 500 never officially existed, but T2 has already seen it.", look: "state" },
      { at: 4, text: "T2 commits, having acted on a value that never existed. Notice the precedence graph is green: serializability only looks at committed work, so dirty reads are a separate problem.", look: "precedence" },
    ],
    expect: { steps: 4, finalDb: { A: 1000 }, anomalies: ["DIRTY_READ"], serializable: true },
    takeaway:
      "A dirty read uses data from a transaction that has not committed (and may never). Read Uncommitted allows it; every stricter level forbids it.",
    fix: {
      label: "Read Committed",
      settings: on("READ_COMMITTED"),
      beats: [
        { at: 0, text: "Same schedule under Read Committed: a reader must get a shared lock first, and it can't get one on data that has an exclusive lock.", look: "state" },
        { at: 1, text: "T1 writes A = 500 and holds an X-lock on A.", look: "state" },
        { at: 2, text: "T2 asks to read A, but T1 holds an X-lock. T2 waits instead of reading uncommitted data.", look: "timeline" },
        { at: 3, text: "T1 rolls back. A is 1000 again and the lock is released.", look: "state" },
        { at: 4, text: "T2 resumes and reads A = 1000, the real committed value.", look: "timeline" },
        { at: 5, text: "T2 commits. No dirty read happened.", look: "anomaly" },
      ],
      expect: { steps: 5, finalDb: { A: 1000 }, anomalies: [], serializable: true },
      takeaway:
        "Making readers wait for writers' exclusive locks is the only thing Read Committed adds over Read Uncommitted.",
    },
  },

  // ───────────────────────── 3. Non-repeatable read ─────────────────────────
  {
    id: "non-repeatable",
    title: "Non-repeatable Read",
    blurb: "Same row, same transaction, two answers.",
    preset: "Non-repeatable Read",
    settings: on("NONE"),
    beats: [
      { at: 0, text: "T1 reads A twice inside one transaction. T2 changes A between the two reads.", look: "timeline" },
      { at: 1, text: "T1 reads A = 1000.", look: "state" },
      { at: 2, text: "T2 writes A = 500.", look: "state" },
      { at: 3, text: "T2 commits, so 500 is now the committed value.", look: "timeline" },
      { at: 4, text: "T1 reads A again and gets 500. Same transaction, same item, different answer: a NON-REPEATABLE READ.", look: "anomaly" },
      { at: 5, text: "T1 commits. Any logic in T1 that assumed A would stay 1000 is now wrong.", look: "precedence" },
    ],
    expect: { steps: 5, finalDb: { A: 500 }, anomalies: ["NON_REPEATABLE_READ"], serializable: false },
    takeaway:
      "Read Committed allows this because it drops its read lock immediately after each read, so a writer can slip in between your two reads.",
    fix: {
      label: "Repeatable Read",
      settings: on("REPEATABLE_READ"),
      beats: [
        { at: 0, text: "Under Repeatable Read a read lock is kept until the transaction ends.", look: "state" },
        { at: 1, text: "T1 reads A = 1000 and keeps its S-lock.", look: "state" },
        { at: 2, text: "T2 tries to write A, but T1's S-lock blocks it. T2 waits.", look: "state" },
        { at: 3, text: "T1 reads A again and gets 1000: nothing could change it.", look: "anomaly" },
        { at: 4, text: "T1 commits and releases its lock.", look: "state" },
        { at: 5, text: "T2's write finally runs: 1000 → 500.", look: "timeline" },
        { at: 6, text: "T2 commits. The result is the same as running T1 and then T2 serially.", look: "precedence" },
      ],
      expect: { steps: 6, finalDb: { A: 500 }, anomalies: [], serializable: true },
      takeaway:
        "Holding read locks until commit guarantees repeatable reads. The price is more waiting, and the possibility of deadlocks.",
    },
  },

  // ───────────────────────── 4. Write skew ─────────────────────────
  {
    id: "write-skew",
    title: "Write Skew",
    blurb: "No single item is mistreated, yet the result is wrong.",
    preset: "Write skew",
    settings: on("NONE"),
    beats: [
      { at: 0, text: "A = 1 and B = 1 mean two doctors are on call. The rule is that at least one must stay on call. Each transaction checks that both are on call, then takes itself off: T1 sets A = 0, T2 sets B = 0.", look: "state" },
      { at: 1, text: "T1 reads A = 1.", look: "state" },
      { at: 2, text: "T2 reads A = 1.", look: "state" },
      { at: 3, text: "T1 reads B = 1. Both are on call, so T1 decides it is safe to leave.", look: "timeline" },
      { at: 4, text: "T2 reads B = 1. T2 decides the same thing.", look: "timeline" },
      { at: 5, text: "T1 sets A = 0 (off call).", look: "state" },
      { at: 6, text: "T2 sets B = 0. They wrote different items, so no write overwrote another. Notice the anomaly banner stays quiet.", look: "anomaly" },
      { at: 7, text: "T1 commits.", look: "timeline" },
      { at: 8, text: "T2 commits. A = 0 and B = 0: nobody is on call. The precedence graph exposes it: T1 read B before T2 wrote it, and T2 read A before T1 wrote it, so each must precede the other.", look: "precedence" },
    ],
    expect: { steps: 8, finalDb: { A: 0, B: 0 }, anomalies: [], serializable: false },
    takeaway:
      "Write skew: two transactions read overlapping data, then write different items based on what they read. Item-level detectors miss it because no item is overwritten. Only the precedence graph shows the cycle.",
    fix: {
      label: "Repeatable Read",
      settings: on("REPEATABLE_READ"),
      beats: [
        { at: 0, text: "Under lock-based Repeatable Read, each transaction keeps S-locks on everything it read.", look: "state" },
        { at: 4, text: "All four reads are done. Both transactions hold S-locks on both A and B.", look: "state" },
        { at: 5, text: "T1 wants to write A, but T2 holds an S-lock on A. T1 waits.", look: "waitfor" },
        { at: 6, text: "T2 wants to write B, but T1 holds an S-lock on B. Deadlock.", look: "waitfor" },
        { at: 7, text: "T2 is aborted as the victim.", look: "timeline" },
        { at: 8, text: "T1's write to A goes through.", look: "state" },
        { at: 9, text: "T1 commits. A = 0, B = 1: someone is still on call. T2 would be retried, and this time would see A = 0 and refuse to leave.", look: "precedence" },
      ],
      expect: { steps: 9, finalDb: { A: 0, B: 1 }, anomalies: [], serializable: true },
      takeaway:
        "This works because this simulator's Repeatable Read holds read locks. Real PostgreSQL's Repeatable Read is snapshot isolation and still allows write skew. You need its Serializable level to prevent it.",
    },
  },

  // ───────────────────────── 5. Deadlock ─────────────────────────
  {
    id: "deadlock",
    title: "Deadlock",
    blurb: "Two transactions, opposite lock order.",
    preset: "Classic Deadlock",
    settings: on("REPEATABLE_READ"),
    beats: [
      { at: 0, text: "T1 wants A and then B. T2 wants B and then A. Opposite order is the classic recipe for deadlock.", look: "timeline" },
      { at: 1, text: "T1 writes A and takes an X-lock on A.", look: "state" },
      { at: 2, text: "T2 writes B and takes an X-lock on B.", look: "state" },
      { at: 3, text: "T1 now needs B, but T2 holds it. T1 waits for T2.", look: "waitfor" },
      { at: 4, text: "T2 needs A, but T1 holds it. T2 waits for T1. The wait-for graph has a cycle T1 → T2 → T1, so neither can ever proceed.", look: "waitfor" },
      { at: 5, text: "The DBMS runs a DFS on the wait-for graph, finds the cycle, and aborts T2 (the youngest). T2's write to B is undone, so B is back to 100.", look: "state" },
      { at: 6, text: "T2's locks are gone, so T1 gets B and continues.", look: "state" },
      { at: 7, text: "T1 commits. T2 would be retried by the application.", look: "precedence" },
    ],
    expect: { steps: 7, finalDb: { A: 1, B: 1 }, anomalies: [], serializable: true },
    takeaway:
      "A deadlock is a cycle in the wait-for graph. The DBMS can't prevent every cycle, so it detects them, aborts a victim using its undo log, and lets the rest continue. Try the Sandbox with the victim policy set to Oldest to see a different outcome.",
  },

  // ───────────────────────── 6. Interleaved but fine ─────────────────────────
  {
    id: "interleaved-ok",
    title: "Interleaved ≠ Wrong",
    blurb: "A mixed-up schedule that is perfectly safe.",
    preset: "Interleaved but serializable",
    settings: on("NONE"),
    beats: [
      { at: 0, text: "Everything so far went wrong, so it is tempting to think any interleaving is wrong. T1 only reads. T2 reads A and writes B.", look: "timeline" },
      { at: 2, text: "Both transactions read A. Two reads never conflict.", look: "timeline" },
      { at: 3, text: "T1 reads B = 1.", look: "state" },
      { at: 4, text: "T2 writes B. T1 already read B before this write. That is the only conflict in the whole schedule, and it points one way: T1 → T2.", look: "precedence" },
      { at: 6, text: "Both commit. One arrow and no cycle, so the schedule is equivalent to running T1 and then T2.", look: "precedence" },
    ],
    expect: { steps: 6, finalDb: { A: 1, B: 5 }, anomalies: [], serializable: true },
    takeaway:
      "What matters is not whether operations interleave, but whether the conflicts form a cycle. A DBMS is free to interleave as long as the result equals some serial order.",
  },
];
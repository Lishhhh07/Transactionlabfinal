# TransactionLab

An interactive simulator for **database transactions and concurrency control**.
Build concurrent transactions, choose a schedule and an isolation level, and watch
what the DBMS does: locks, waiting, deadlocks, anomalies and serializability.

**Live demo:** https://transactionlabfinal.vercel.app/

## What it demonstrates

| Concept | What you can see |
|---|---|
| Concurrency anomalies | Lost update, dirty read, non-repeatable read, flagged at the exact step |
| Strict two-phase locking | S/X lock table, blocking, lock upgrades, FIFO wake-up |
| Isolation levels | Read Uncommitted / Committed, Repeatable Read, Serializable, compared side by side |
| Deadlocks | Wait-for graph, DFS cycle detection, victim selection, rollback via undo log |
| Serializability | Precedence graph, cycle check, equivalent serial order, write skew |
| Learn mode | Six guided lessons, each with a "problem" run and a "fix" run |

## Architecture

The engine is a **pure TypeScript library**: `Scenario in, Trace out`.
It has no React or Next imports. The UI only replays the trace.

```
                 ┌─────────────────────── src/engine (pure TS, 108 tests) ──────────────────────┐
 Scenario ─────► │ validate → simulate ──┬─ LockManager     (S/X locks, queues)                 │
 (txns, order,   │                       ├─ isolation       (policy: when to lock/unlock)       │ ──► Trace
  options)       │                       └─ deadlock        (wait-for graph, DFS, victim)       │     (steps with
                 │                                                                              │      db, locks,
                 │ analysis of the trace: anomalies · serializability (precedence graph)        │      txn state)
                 └──────────────────────────────────────────────────────────────────────────────┘
                                                      │
                          src/components + src/app (Next.js, React, Tailwind)
                          Timeline · lock table · wait-for graph · precedence graph · Learn mode
```

Every trace step carries a full snapshot (database, lock table, transaction states),
so step-through playback and rewinding need no recomputation.

## Concept → file map

| Concept | File |
|---|---|
| Operation / trace types | `src/engine/types.ts` |
| Parsing `WRITE(A, A-200)` | `src/engine/parser.ts` |
| Schedule validation | `src/engine/validate.ts` |
| Execution, undo log, rollback, main loop | `src/engine/simulator.ts` |
| Shared/exclusive locks, upgrade, queues | `src/engine/lockManager.ts` |
| Isolation level policy table | `src/engine/isolation.ts` |
| Wait-for graph, cycle detection, victim policy | `src/engine/deadlock.ts` |
| Lost update / dirty read / non-repeatable read | `src/engine/anomalies.ts` |
| Conflicts, precedence graph, serial order | `src/engine/serializability.ts` |
| Same schedule under every mode | `src/engine/compare.ts` |
| Lesson scripts (checked against the engine) | `src/scenarios/lessons.ts` |

## Key design decisions

- **Writes are in place with a per-transaction undo log.** This is how real systems roll back, and it is why dirty reads are possible without locks.
- **Isolation levels are lock policies, not separate engines.** They differ only in whether reads lock, and when read locks are released.
- **A schedule is a preferred order.** A blocked transaction is skipped and resumed when its lock frees.
- **The wait-for graph is recomputed from the lock table**, so there is no second structure to keep in sync.
- **The same DFS (`findCycle`) serves both** the wait-for graph and the precedence graph.
- **Lessons are data, and tests re-run them against the engine**, so the narration cannot drift from reality.

## Testing

```bash
npm test
```

Includes unit tests per module and a property test: 300 random schedules run under
Repeatable Read and Serializable must always produce a conflict-serializable history.
A companion test confirms the checker does find violations without locks.

## Known limitations

- No phantoms: there are no rows or predicates, so **Serializable behaves like Repeatable Read**.
- Lock-based only. There is no MVCC or snapshot isolation (so PostgreSQL's Repeatable Read behaves differently).
- Items are single named values, with no tables.
- Dirty writes are not a named anomaly, but the serializability checker catches them.
- Deadlock victims are not automatically restarted.
- Locks are granted by compatibility with holders only, so a stream of readers could starve a queued writer.

## Run locally

```bash
npm install
npm run dev     # http://localhost:3000
```

## Tech

Next.js · TypeScript · Tailwind CSS · Vitest

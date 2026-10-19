import { CcMode, IsolationLevel, SimOptions } from "./types";

export interface LockPolicy {
  /** Does a READ take an S-lock at all? */
  readLocks: boolean;
  /** If so, is that S-lock dropped immediately after the read? */
  shortReadLocks: boolean;
  // Writes always take an X-lock held until COMMIT/ROLLBACK (this prevents dirty writes).
}

export const ISOLATION_POLICY: Record<IsolationLevel, LockPolicy> = {
  READ_UNCOMMITTED: { readLocks: false, shortReadLocks: false },
  READ_COMMITTED:   { readLocks: true,  shortReadLocks: true },
  REPEATABLE_READ:  { readLocks: true,  shortReadLocks: false },
  SERIALIZABLE:     { readLocks: true,  shortReadLocks: false }, // differs only for phantoms
};

/** null = no locking at all. */
export function policyFor(o: SimOptions): LockPolicy | null {
  if (o.isolation) return ISOLATION_POLICY[o.isolation];
  if (o.locking === "STRICT_2PL") return ISOLATION_POLICY.REPEATABLE_READ;
  return null;
}

export function optionsFor(mode: CcMode): SimOptions {
  return mode === "NONE" ? {} : { isolation: mode };
}

export const ALL_MODES: CcMode[] = [
  "NONE",
  "READ_UNCOMMITTED",
  "READ_COMMITTED",
  "REPEATABLE_READ",
  "SERIALIZABLE",
];

export const MODE_LABEL: Record<CcMode, string> = {
  NONE: "None (no locks)",
  READ_UNCOMMITTED: "Read Uncommitted",
  READ_COMMITTED: "Read Committed",
  REPEATABLE_READ: "Repeatable Read",
  SERIALIZABLE: "Serializable",
};

export const MODE_BLURB: Record<CcMode, string> = {
  NONE: "No locks at all. Every anomaly is possible.",
  READ_UNCOMMITTED:
    "Writers hold X-locks until the end. Readers take no locks, so they can see uncommitted data.",
  READ_COMMITTED:
    "Readers take an S-lock only for the instant of the read. Writers hold X-locks until the end.",
  REPEATABLE_READ:
    "Readers and writers both hold their locks until commit, so a value you read can't change under you.",
  SERIALIZABLE:
    "Behaves like Repeatable Read here. It would differ only for range queries (phantoms), which this simulator doesn't model yet.",
};
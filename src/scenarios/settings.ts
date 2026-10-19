import { CcMode, DeadlockMode, SimOptions, VictimPolicy, optionsFor } from "@/engine";

export interface Settings {
  mode: CcMode;
  deadlock: DeadlockMode;
  victim: VictimPolicy;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: "NONE",
  deadlock: "ABORT_VICTIM",
  victim: "YOUNGEST",
};

export const simOptions = (s: Settings): SimOptions => ({
  ...optionsFor(s.mode),
  deadlock: s.deadlock,
  victim: s.victim,
});
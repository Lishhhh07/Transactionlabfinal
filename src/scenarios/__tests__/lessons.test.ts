import { describe, it, expect } from "vitest";
import { analyzeSerializability, detectAnomalies, simulate } from "@/engine";
import { buildScenario } from "../draft";
import { Beat, LESSONS, Lesson, beatAt } from "../lessons";
import { PRESETS } from "../presets";
import { Settings, simOptions } from "../settings";

function runLesson(presetName: string, settings: Settings) {
  const preset = PRESETS.find((p) => p.name === presetName);
  if (!preset) throw new Error(`Unknown preset "${presetName}"`);
  const built = buildScenario(preset.draft);
  if (!built.ok) throw new Error(built.error);
  const r = simulate(built.scenario, simOptions(settings));
  return {
    steps: r.steps.length,
    finalDb: r.finalDb,
    anomalies: detectAnomalies(r.steps).map((a) => a.kind),
    serializable: analyzeSerializability(r.steps).serializable,
  };
}

function checkBeats(beats: Beat[], total: number) {
  expect(beats[0].at).toBe(0);
  for (let i = 1; i < beats.length; i++) {
    expect(beats[i].at).toBeGreaterThan(beats[i - 1].at);
  }
  expect(beats[beats.length - 1].at).toBe(total); // narration reaches the final step
  beats.forEach((b) => expect(b.text.length).toBeGreaterThan(0));
}

describe("lessons", () => {
  it("have unique ids", () => {
    const ids = LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("beatAt returns the latest beat at or before the cursor", () => {
    const beats: Beat[] = [
      { at: 0, text: "intro" },
      { at: 2, text: "two" },
      { at: 5, text: "five" },
    ];
    expect(beatAt(beats, 0).text).toBe("intro");
    expect(beatAt(beats, 1).text).toBe("intro");
    expect(beatAt(beats, 2).text).toBe("two");
    expect(beatAt(beats, 4).text).toBe("two");
    expect(beatAt(beats, 5).text).toBe("five");
  });

  describe.each(LESSONS)("$title", (lesson: Lesson) => {
    it("uses an existing preset", () => {
      expect(PRESETS.some((p) => p.name === lesson.preset)).toBe(true);
    });

    it("problem run matches what the narration claims", () => {
      expect(runLesson(lesson.preset, lesson.settings)).toEqual(lesson.expect);
    });

    it("problem beats cover the whole trace", () => {
      checkBeats(lesson.beats, lesson.expect.steps);
    });

    if (lesson.fix) {
      const fix = lesson.fix;
      it("fix run matches what the narration claims", () => {
        expect(runLesson(lesson.preset, fix.settings)).toEqual(fix.expect);
      });
      it("fix beats cover the whole trace", () => {
        checkBeats(fix.beats, fix.expect.steps);
      });
    }
  });
});
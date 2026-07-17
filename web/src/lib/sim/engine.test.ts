// Regression guard for C-1 (see docs audit 2026-07-16): the console's whole
// pitch is "AI lifts utilization above the manual baseline with ~zero
// spills." These assert the simulator actually tells that story instead of
// silently drifting back to the opposite (AI undershooting / spilling every
// wagon) the way it did before that fix.
import { describe, expect, it } from "vitest";
import { TwinLiteEngine } from "./engine";
import type { PlatformMode } from "@/types/domain";

const SEEDS = [42, 7, 1234, 99, 555];
const WAGONS_PER_RUN = 40;

function runToCompletion(seed: number, mode: PlatformMode, wagons: number) {
  const engine = new TwinLiteEngine(seed);
  engine.mode = mode;
  let ticks = 0;
  const maxTicks = 20_000_000;
  while (engine.completed.length < wagons && ticks < maxTicks) {
    engine.tick();
    ticks++;
  }
  if (ticks >= maxTicks) throw new Error(`engine did not complete ${wagons} wagons within ${maxTicks} ticks`);
  return engine.completed.slice(0, wagons);
}

describe("TwinLiteEngine — ADVISORY (AI) mode", () => {
  it.each(SEEDS)("seed %i: mean utilization clears the 96.6%% manual baseline with zero spills", (seed) => {
    const completed = runToCompletion(seed, "ADVISORY", WAGONS_PER_RUN);
    const mean = completed.reduce((s, w) => s + w.utilizationPct, 0) / completed.length;
    const spills = completed.filter((w) => w.spillFlag).length;
    const overloads = completed.filter((w) => w.overloadFlag).length;

    expect(mean).toBeGreaterThan(96.6);
    expect(mean).toBeGreaterThan(97);
    expect(spills).toBe(0);
    expect(overloads).toBe(0);
    // no individual wagon should fall meaningfully short of the mean — catches a
    // regression to the old behavior where the mean looked fine but every wagon
    // tripped a freeboard/spill alarm well below target
    for (const w of completed) expect(w.utilizationPct).toBeGreaterThan(95.5);
  });
});

describe("TwinLiteEngine — MANUAL mode", () => {
  it.each(SEEDS)("seed %i: mean utilization lands near the 96-97%% baseline, spills are occasional not universal", (seed) => {
    const completed = runToCompletion(seed, "MANUAL", WAGONS_PER_RUN);
    const mean = completed.reduce((s, w) => s + w.utilizationPct, 0) / completed.length;
    const spills = completed.filter((w) => w.spillFlag).length;

    expect(mean).toBeGreaterThan(94);
    expect(mean).toBeLessThan(99);
    // "occasional near-misses", not a guaranteed spill on every wagon
    expect(spills).toBeGreaterThan(0);
    expect(spills).toBeLessThan(completed.length);
  });
});

describe("TwinLiteEngine — AI beats MANUAL", () => {
  it.each(SEEDS)("seed %i: AI mean utilization exceeds MANUAL mean utilization", (seed) => {
    const ai = runToCompletion(seed, "ADVISORY", WAGONS_PER_RUN);
    const manual = runToCompletion(seed, "MANUAL", WAGONS_PER_RUN);
    const aiMean = ai.reduce((s, w) => s + w.utilizationPct, 0) / ai.length;
    const manualMean = manual.reduce((s, w) => s + w.utilizationPct, 0) / manual.length;
    expect(aiMean).toBeGreaterThan(manualMean);
  });
});

describe("TwinLiteEngine — wagon 1 (belt pre-seed)", () => {
  it("does not spill and lands within the normal fill band, same as later wagons", () => {
    const engine = new TwinLiteEngine(42);
    engine.mode = "ADVISORY";
    let ticks = 0;
    while (engine.completed.length < 1 && ticks < 5_000_000) {
      engine.tick();
      ticks++;
    }
    const wagon1 = engine.completed[0];
    expect(wagon1.spillFlag).toBe(false);
    expect(wagon1.utilizationPct).toBeGreaterThan(96.6);
    expect(wagon1.utilizationPct).toBeLessThan(101);
  });
});

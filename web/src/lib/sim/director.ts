// Scripted demo pacing (demo-credibility audit, 2026-07-16). AUTONOMOUS mode
// is designed to spill zero times — which also means, left alone, a live
// demo can sit for a long time without a single MEDIUM/HIGH alarm firing.
// This raises the engine's baseline disturbance frequency slightly and
// independently fires a named scenario on its own ~3-5 min cadence, so a
// presenter reliably sees organic alarm activity without waiting on the raw
// random roll. It never touches spill/overload physics directly — those stay
// governed entirely by the real control loop.
import { getEngine } from "./singleton";

export type ScenarioName = "DENSITY_SHIFT" | "BELT_SLIP" | "FEED_SURGE" | "CREEP_HUNT" | "SPILL" | "OVERLOAD";

const DISTURBANCE_KIND: Record<"DENSITY_SHIFT" | "BELT_SLIP" | "FEED_SURGE" | "CREEP_HUNT", string> = {
  DENSITY_SHIFT: "density_shift",
  BELT_SLIP: "belt_slip",
  FEED_SURGE: "feed_surge",
  CREEP_HUNT: "creep_hunt",
};

const AUTO_KINDS = Object.keys(DISTURBANCE_KIND) as (keyof typeof DISTURBANCE_KIND)[];

export interface DirectorHandle {
  stop: () => void;
  fireScenario: (name: ScenarioName) => void;
}

export function startDirector(): DirectorHandle {
  const engine = getEngine();
  engine.disturbanceRateMultiplier = 2.2;

  let timer: ReturnType<typeof setTimeout> | null = null;
  const scheduleNext = () => {
    const delayMs = 180_000 + Math.random() * 120_000; // 3-5 min, wall clock
    timer = setTimeout(() => {
      const kind = AUTO_KINDS[Math.floor(Math.random() * AUTO_KINDS.length)];
      engine.injectDisturbance(DISTURBANCE_KIND[kind], 0.8 + Math.random() * 0.2, 12_000 + Math.random() * 8_000);
      scheduleNext();
    }, delayMs);
  };
  scheduleNext();

  const fireScenario = (name: ScenarioName) => {
    if (name === "SPILL") {
      engine.forceSpillOnNextGap();
    } else if (name === "OVERLOAD") {
      engine.forceOverloadActiveWagon();
    } else {
      engine.injectDisturbance(DISTURBANCE_KIND[name], 0.9, 15_000);
    }
  };

  return {
    stop: () => {
      if (timer) clearTimeout(timer);
      engine.disturbanceRateMultiplier = 1;
    },
    fireScenario,
  };
}

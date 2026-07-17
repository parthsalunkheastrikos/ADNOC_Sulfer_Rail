// Per-chart registry backing the "About / Ask AI" two-button pattern
// (ChartActions.tsx). `summary.plain` is written for a shift operator reading
// once, no jargon, no doc citations. `summary.detail` is the engineering
// version (kept for anyone who wants it, behind a "Technical detail"
// disclosure) — hand-written, no network call, no AI involved, so "About"
// still works if Gemini is unreachable. `getDataSlice` returns a small,
// chart-scoped JSON excerpt of live engine/store state, attached to the AI
// request as `context.chartScope` when the user hits "Ask AI" from that chart.
import type { TwinLiteEngine } from "@/lib/sim/engine";
import type { KpiSnapshot, AlarmRecord } from "@/types/domain";

export type ChartId =
  | "gate-hero"
  | "utilization-chart"
  | "trend-strip"
  | "recent-wagons"
  | "utilization-histogram"
  | "mode-timeline"
  | "spi-excursions"
  | "pile-height"
  | "train-canvas"
  | "signal-health"
  | "spill-events"
  | "overload-events"
  | "availability"
  | "manual-overrides"
  | "tonnage"
  | "rolling-utilization"
  | "peak-spi"
  | "trips-avoided"
  | "loading-rate-trend"
  | "twin-hud";

interface SimStoreSnapshot {
  kpi: KpiSnapshot;
  mode: string;
  overrideCount24h: number;
  alarms: AlarmRecord[];
}

export interface ChartSummary {
  /** 1-2 plain sentences, zero jargon, no doc citations. What a night-shift operator reads once and understands. */
  plain: string;
  /** The engineering-detail version, shown behind a "Technical detail" disclosure. */
  detail: string[];
}

export interface ChartDef {
  id: ChartId;
  label: string;
  summary: ChartSummary;
  getDataSlice: (engine: TwinLiteEngine, store: SimStoreSnapshot) => unknown;
}

function last<T>(arr: T[], n: number): T[] {
  return arr.slice(-n);
}

export const CHART_REGISTRY: Record<ChartId, ChartDef> = {
  "gate-hero": {
    id: "gate-hero",
    label: "Gate G-A2 · Δ vs. baseline",
    summary: {
      plain:
        "How much fuller the AI loads each wagon compared to how crews load them by hand. The pilot passes if wagons leave at least 1 percentage point fuller on average than the historian baseline.",
      detail: [
        "Shows the rolling 30-wagon mean utilization gain (ΔU) vs. the historian manual baseline of 96.6%.",
        "Computed as rollingUtilizationPct − baselineUtilizationPct, in percentage points.",
        "This is the single contractual figure the Phase A pilot is judged on: the gate passes at ΔU ≥ +1.0pp, with a +0.5pp 'trending' margin below that.",
      ],
    },
    getDataSlice: (_engine, store) => ({
      rollingUtilizationPct: store.kpi.rollingUtilizationPct,
      baselineUtilizationPct: store.kpi.baselineUtilizationPct,
      deltaPp: store.kpi.deltaPp,
      gateTargetPp: 1.0,
      trendingMarginPp: 0.5,
    }),
  },
  "spill-events": {
    id: "spill-events",
    label: "Spill events (AI-mode)",
    summary: {
      plain:
        "Counts wagons the AI overfilled enough to spill sulphur outside the hopper. The target is zero — spills are a safety and housekeeping problem, not just a yield loss.",
      detail: [
        "Count of AI-mode wagons where the crest profile exceeded the freeboard limit at gate close.",
        "Target is zero for the Phase A safety exit gate; the manual-mode count is shown alongside as baseline context, not a pass/fail threshold.",
      ],
    },
    getDataSlice: (_engine, store) => ({
      autoSpillEvents: store.kpi.autoSpillEvents,
      manualSpillEvents: store.kpi.manualSpillEvents,
    }),
  },
  "overload-events": {
    id: "overload-events",
    label: "Overload events (AI-mode)",
    summary: {
      plain:
        "Counts wagons the AI loaded past their rated axle weight. The target is zero — an overloaded wagon can be pulled from service or flagged at the weighbridge downstream.",
      detail: [
        "Count of AI-mode wagons where net weight exceeded the rated per-wagon tonnage.",
        "Target is zero; manual-mode count shown alongside as baseline context.",
      ],
    },
    getDataSlice: (_engine, store) => ({
      autoOverloadEvents: store.kpi.autoOverloadEvents,
      manualOverloadEvents: store.kpi.manualOverloadEvents,
    }),
  },
  "availability": {
    id: "availability",
    label: "Availability",
    summary: {
      plain:
        "Percent of session time the AI was actually in control and loading. Time spent in fallback (AI handed control back due to a fault) counts against this. Pilot target is 99% or higher.",
      detail: [
        "1 − (cumulative FALLBACK time / total session time), expressed as a percentage.",
        "Derived from the engine's running fallbackTimeMs total, not recomputed from a capped history buffer.",
      ],
    },
    getDataSlice: (engine, store) => ({
      availabilityPct: store.kpi.availabilityPct,
      fallbackTimeMs: engine.fallbackTimeMs,
      simTimeMs: engine.simTimeMs,
    }),
  },
  "manual-overrides": {
    id: "manual-overrides",
    label: "Manual overrides",
    summary: {
      plain: "How many times an operator took manual control away from the AI this session, for any reason.",
      detail: ["Count of TAKE MANUAL actions logged this session, from the override/audit trail."],
    },
    getDataSlice: (_engine, store) => ({ overrideCount24h: store.overrideCount24h }),
  },
  "tonnage": {
    id: "tonnage",
    label: "Tonnage (session)",
    summary: {
      plain: "Total sulphur loaded this session, and how many wagons that represents.",
      detail: [
        "Running total of net weighed tonnage across all completed wagons this session, both control modes combined.",
      ],
    },
    getDataSlice: (_engine, store) => ({
      tonnageToday: store.kpi.tonnageToday,
      wagonsLoadedToday: store.kpi.wagonsLoadedToday,
    }),
  },
  "rolling-utilization": {
    id: "rolling-utilization",
    label: "Rolling utilization",
    summary: {
      plain:
        "The average fill percentage of the last 30 wagons — how close to fully loaded (without spilling) the AI is running right now, compared to how crews load by hand.",
      detail: [
        "Rolling 30-wagon mean of per-wagon utilization % (net weight / rated capacity), regardless of control mode.",
        "The baseline sub-value is the historian's long-run manual mean, used as the comparison point for the gate figure above.",
      ],
    },
    getDataSlice: (_engine, store) => ({
      rollingUtilizationPct: store.kpi.rollingUtilizationPct,
      baselineUtilizationPct: store.kpi.baselineUtilizationPct,
      deltaPp: store.kpi.deltaPp,
    }),
  },
  "peak-spi": {
    id: "peak-spi",
    label: "Peak SPI (AI-mode)",
    summary: {
      plain:
        "The highest spill-risk reading the AI hit this session, on a 0–1 scale. Above 0.02 the controller is expected to automatically slow the flow to stay safe.",
      detail: [
        "Peak value of the Spill Probability Index observed during AI-mode control this session.",
        "Curtailment (automatic flow slowdown) triggers at 0.02; manual-mode peak is shown alongside as baseline context, not a gate threshold.",
      ],
    },
    getDataSlice: (engine, store) => ({
      autoMaxSpiSession: store.kpi.autoMaxSpiSession,
      manualMaxSpiSession: store.kpi.manualMaxSpiSession,
      curtailmentThreshold: 0.02,
      currentSpi: engine.spi,
    }),
  },
  "trips-avoided": {
    id: "trips-avoided",
    label: "Est. trips avoided",
    summary: {
      plain:
        "Because each wagon carries a bit more sulphur on average, fewer train trips are needed to move the same total tonnage over time — this estimates how many.",
      detail: [
        "Estimated reduction in train trips per period at constant total tonnage, extrapolated from the current fill-rate gain vs. baseline.",
        "extraTonnageT is the additional tonnage moved this session at the AI's current utilization vs. what the same wagon count would have moved at baseline.",
      ],
    },
    getDataSlice: (_engine, store) => ({
      tripsAvoidedRateLabel: store.kpi.tripsAvoidedRateLabel,
      extraTonnageT: store.kpi.extraTonnageT,
    }),
  },
  "loading-rate-trend": {
    id: "loading-rate-trend",
    label: "Loading rate — session",
    summary: {
      plain:
        "How fast sulphur is actually being loaded, wagon by wagon, across the whole session — each point is that wagon's net weight divided by how long it took. The dashed line is the session average.",
      detail: [
        "Implied per-wagon loading rate (net t / time since previous wagon completed), last 40 wagons — derived from completion cadence, not a raw sensor feed (the live process history ring buffer only covers the last ~180s, too short for a session-long view).",
      ],
    },
    getDataSlice: (engine) => ({
      wagons: last(engine.completed, 40).map((w) => ({ seq: w.seq, netT: Number(w.netT.toFixed(2)), completedAtMs: w.completedAtMs })),
    }),
  },
  "utilization-chart": {
    id: "utilization-chart",
    label: "Utilization — last 60 wagons",
    summary: {
      plain:
        "Fill percentage for each of the last 60 wagons, colored by who was driving — AI or a human crew. Wagons circled in red had a spill or overload.",
      detail: [
        "Plots per-wagon utilization % for the last 60 completed wagons, colored by control mode (AI vs. manual).",
        "Dashed reference lines mark the 96.6% manual baseline and the 99.0% AI target.",
        "Red-ringed points mark wagons with a spill or overload flag — useful for spotting where manual periods cluster near-misses.",
      ],
    },
    getDataSlice: (engine) => ({
      wagons: last(engine.completed, 60).map((w) => ({
        seq: w.seq,
        utilizationPct: Number(w.utilizationPct.toFixed(2)),
        controlMode: w.controlMode,
        spillFlag: w.spillFlag,
        overloadFlag: w.overloadFlag,
      })),
      baselinePct: 96.6,
      targetPct: 99.0,
    }),
  },
  "trend-strip": {
    id: "trend-strip",
    label: "Trend strip — live process trend",
    summary: {
      plain:
        "Live process traces over the last few minutes: train speed, belt flow, gate command, spill-risk score, and the surge bin level. Watch the spill-risk score and surge bin together — both climbing at once usually means the flow is about to be slowed on purpose.",
      detail: [
        "Rolling ~180s history of train speed (actual/setpoint/plan), chute flow, gate plan, SPI, and surge-bin level, sampled at the 10Hz control tick.",
        "The dotted plan line is the controller's own forward-looking commit-rate forecast for the next ~30s, not a measured value.",
        "Watch SPI and surge-bin level together: a rising surge bin with rising SPI is the leading indicator of an upcoming flow curtailment.",
      ],
    },
    getDataSlice: (engine) => {
      const n = 120;
      const h = engine.history;
      return {
        speedActual: last(Array.from(h.speedActual.toOrderedArray(n)), n),
        speedSetpoint: last(Array.from(h.speedSetpoint.toOrderedArray(n)), n),
        chuteFlow: last(Array.from(h.chuteFlow.toOrderedArray(n)), n),
        gatePlan: last(Array.from(h.gatePlan.toOrderedArray(n)), n),
        spi: last(Array.from(h.spi.toOrderedArray(n)), n),
        surgeBinLevel: last(Array.from(h.surgeBinLevel.toOrderedArray(n)), n),
        surgeBinCapacityT: 8,
        spiCurtailmentThreshold: 0.02,
      };
    },
  },
  "recent-wagons": {
    id: "recent-wagons",
    label: "Recent wagons",
    summary: {
      plain:
        "A log of the last wagons loaded: weight, fill percentage, who was driving, and whether anything went wrong. This is the source record everything else on this page is calculated from.",
      detail: [
        "The last 12 completed wagons: net weight (weighbridge-quantized to 0.05t), utilization %, control mode, and any spill/overload flag.",
        "This is the ground-truth per-wagon ledger everything else on the KPI/analytics screens is derived from.",
      ],
    },
    getDataSlice: (engine) => ({
      wagons: last(engine.completed, 12).reverse().map((w) => ({
        seq: w.seq,
        uid: w.uid,
        netT: Number(w.netT.toFixed(2)),
        utilizationPct: Number(w.utilizationPct.toFixed(2)),
        controlMode: w.controlMode,
        spillFlag: w.spillFlag,
        overloadFlag: w.overloadFlag,
      })),
    }),
  },
  "utilization-histogram": {
    id: "utilization-histogram",
    label: "Utilization histogram",
    summary: {
      plain:
        "How fill percentages are spread across the whole session, for AI vs. manual loading. A narrow, tall cluster near the top for the AI (vs. a wide spread for manual) shows it's consistently filling wagons fuller.",
      detail: [
        "Distribution of per-wagon utilization % across the session, split by control mode.",
        "A tight, right-shifted AI distribution vs. a wider, left-shifted manual one is the visual version of the ΔU story on the KPI screen.",
      ],
    },
    getDataSlice: (engine) => ({
      wagons: engine.completed.map((w) => ({
        utilizationPct: Number(w.utilizationPct.toFixed(2)),
        controlMode: w.controlMode,
      })),
    }),
  },
  "mode-timeline": {
    id: "mode-timeline",
    label: "Mode timeline",
    summary: {
      plain:
        "A timeline of who was in control over the session — AI running independently, AI advising, a human driving manually, or fallback after a fault. Useful for lining up a rough patch elsewhere on this page with who was driving at the time.",
      detail: [
        "Session timeline of platform mode transitions (AUTONOMOUS/ADVISORY/MANUAL/FALLBACK) with durations.",
        "Useful for correlating a manual stretch or fallback event with a dip in utilization elsewhere on the analytics screen.",
      ],
    },
    getDataSlice: (engine, store) => ({
      currentMode: store.mode,
      fallbackTimeMs: engine.fallbackTimeMs,
      simTimeMs: engine.simTimeMs,
      completedByMode: last(engine.completed, 60).map((w) => ({ seq: w.seq, controlMode: w.controlMode })),
    }),
  },
  "spi-excursions": {
    id: "spi-excursions",
    label: "SPI excursions",
    summary: {
      plain:
        "A log of moments the spill-risk score (SPI) crossed the safe limit and the system slowed the flow. The AI should have few or none of these — manual-mode ones are just background context, not a problem with the AI.",
      detail: [
        "Lists sessions where SPI (Spill Probability Index) crossed the 0.02 curtailment threshold.",
        "AI-mode excursions should be rare/none — that's part of the Phase A safety exit gate; manual-mode excursions are baseline context, not a gate failure.",
      ],
    },
    getDataSlice: (engine, store) => ({
      autoMaxSpiSession: store.kpi.autoMaxSpiSession,
      manualMaxSpiSession: store.kpi.manualMaxSpiSession,
      curtailmentThreshold: 0.02,
      currentSpi: engine.spi,
    }),
  },
  "pile-height": {
    id: "pile-height",
    label: "Pile height profile (active wagon)",
    summary: {
      plain:
        "A side-view scan of the sulphur pile forming inside the wagon under the chute right now, compared to where the model expects it to end up. The pile is checked at its peak, not its average height, since that's where it's most likely to spill.",
      detail: [
        "142-bin longitudinal profile of measured fill height along the active wagon's hopper, vs. the model's projected final profile.",
        "The angle-of-repose relaxation crowns the pile — the crest runs noticeably higher than the whole-wagon average height, which is why freeboard is tracked at the crest, not the average.",
      ],
    },
    getDataSlice: (engine) => {
      const w = engine.activeWagon;
      const { finalT, errT } = engine.projection();
      return {
        seq: w.seq,
        fillT: Number(w.fillT.toFixed(2)),
        projectedFinalT: Number(finalT.toFixed(2)),
        projectedErrT: Number(errT.toFixed(2)),
        minFreeboardM: Number(w.minFreeboardM.toFixed(3)),
        spillFlag: w.spillFlag,
        profileSampled: Array.from(w.profile).filter((_, i) => i % 10 === 0).map((v) => Number(v.toFixed(3))),
      };
    },
  },
  "train-canvas": {
    id: "train-canvas",
    label: "Train / gantry canvas",
    summary: {
      plain:
        "A live top-down view of the wagon currently under the loading chute, its speed, and the sulphur stream. The train creeps slowly so there's enough time to fill each wagon before it has to move on.",
      detail: [
        "Live schematic of the consist under the loading gantry: active wagon position, speed, and chute discharge stream.",
        "Speed is held to a slow creep (~0.2-1.2 km/h) so the belt has enough dwell time under each wagon opening to hit target fill within the transport dead time.",
      ],
    },
    getDataSlice: (engine) => ({
      trainCode: engine.trainCode,
      wagonCount: engine.wagonCount,
      activeSeq: engine.activeSeq,
      speedKmh: Number(engine.speedKmh.toFixed(3)),
      speedSetpointKmh: Number(engine.speedSetpointKmh.toFixed(3)),
      gateOpeningPct: Number(engine.gateOpeningPct.toFixed(1)),
    }),
  },
  "signal-health": {
    id: "signal-health",
    label: "Signal health board",
    summary: {
      plain:
        "Shows whether each sensor feed (belt scale, train speed, chute level) is reporting good data right now, or acting up. This is where you'd spot a sensor going bad before it throws off the loading control.",
      detail: [
        "Per-tag simulated data quality (belt weigher, train speed, chute radar) — GOOD/STALE/RANGE/ROC/XCHK/COMMS.",
        "Real OPC-UA feeds occasionally go briefly stale; this board is where a C&I engineer would spot a tag misbehaving before it affects the control loop.",
      ],
    },
    getDataSlice: (engine) => ({
      quality: {
        beltWeigher: "see live tag board",
        trainSpeed: "see live tag board",
        chuteRadar: "see live tag board",
      },
      connectionNote: "Signal Health reflects per-tag simulated quality, independent of console-to-edge link state.",
      simTimeMs: engine.simTimeMs,
    }),
  },
  "twin-hud": {
    id: "twin-hud",
    label: "Digital twin — live HUD",
    summary: {
      plain:
        "The 3D scene mirrors the loading console in real time: the wagon under the chute, its fill level, gate opening, train speed, and spill-risk score are all the same live numbers shown elsewhere in the app.",
      detail: [
        "Overlay bound to the same TwinLiteEngine snapshot as the console pages via useEngineBridge — not a separate animation.",
        "Fill height, particle emission rate, and train creep are all driven directly by engine.activeWagon.fillT, engine.gateOpeningPct, and engine.speedKmh respectively.",
      ],
    },
    getDataSlice: (engine, store) => ({
      activeSeq: engine.activeSeq,
      wagonCount: engine.wagonCount,
      fillT: Number(engine.activeWagon.fillT.toFixed(2)),
      gateOpeningPct: Number(engine.gateOpeningPct.toFixed(1)),
      speedKmh: Number(engine.speedKmh.toFixed(3)),
      spi: engine.spi,
      surgeBinT: engine.surgeBinT,
      mode: store.mode,
    }),
  },
};

export function getChartDataSlice(id: ChartId, engine: TwinLiteEngine, store: SimStoreSnapshot): unknown {
  return CHART_REGISTRY[id].getDataSlice(engine, store);
}

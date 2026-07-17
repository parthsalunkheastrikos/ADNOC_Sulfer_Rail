import { create } from "zustand";
import { getEngine } from "@/lib/sim/singleton";
import { TICK_MS } from "@/lib/sim/constants";
import { startDirector, type DirectorHandle, type ScenarioName } from "@/lib/sim/director";
import type { TwinLiteEngine } from "@/lib/sim/engine";
import type {
  AlarmRecord,
  ConnectionState,
  KpiSnapshot,
  OperatorEvent,
  PlatformMode,
  PreflightCheck,
  Role,
  TakeoverPhase,
} from "@/types/domain";

let alarmSeq = 0;
let eventSeq = 0;
const nextAlarmId = () => `AL-${++alarmSeq}`;
const nextEventId = () => `EV-${++eventSeq}`;
let directorHandle: DirectorHandle | null = null;

const BASELINE_UTILIZATION_PCT = 96.6;

interface SimStoreState {
  // publish cadence — bumped every published tick, cheap re-render trigger
  clock: number;
  simTimeMs: number;

  mode: PlatformMode;
  takeoverPhase: TakeoverPhase;
  preflight: PreflightCheck[];
  lastTakeoverLatencyMs: number | null;
  overrideCount24h: number;
  pendingOverrideReason: boolean;

  role: Role;
  theme: "dark" | "light";
  selectedWagonSeq: number | null;

  connection: ConnectionState;
  connectionSinceMs: number;

  alarms: AlarmRecord[];
  events: OperatorEvent[];
  kpi: KpiSnapshot;

  environment: "PHASE_A" | "PHASE_B";
  timeMultiplier: number;

  // actions
  init: () => () => void; // returns teardown
  setEnvironment: (env: "PHASE_A" | "PHASE_B") => void;
  setTimeMultiplier: (m: number) => void;
  setRole: (r: Role) => void;
  setTheme: (t: "dark" | "light") => void;
  selectWagon: (seq: number | null) => void;
  setConnection: (c: ConnectionState) => void;

  takeManual: (trigger: "UI" | "HW_BUTTON") => void;
  openResumeDialog: () => void;
  closeResumeDialog: () => void;
  armResumeComplete: () => void;
  confirmResume: () => void;
  abortRamp: () => void;
  simulateFallback: () => void;
  clearFallback: () => void;
  submitOverrideReason: (code: string, note: string) => void;

  ackAlarm: (id: string) => void;
  shelveAlarm: (id: string) => void;
  fireScenario: (name: ScenarioName) => void;
}

// Static placeholder for the store's initial state — the real snapshot is
// only ever computed from inside init() (client-only, post-mount), never at
// module-evaluation time. computeKpi() calls getEngine(), which lazily
// constructs the TwinLiteEngine singleton; calling it eagerly here would run
// during Next.js SSR/prerendering of any page that imports this module.
const EMPTY_KPI: KpiSnapshot = {
  rollingUtilizationPct: 0,
  baselineUtilizationPct: BASELINE_UTILIZATION_PCT,
  deltaPp: 0,
  tonnageToday: 0,
  wagonsLoadedToday: 0,
  overrideCount24h: 0,
  availabilityPct: 0,
  spillEvents: 0,
  overloadEvents: 0,
  tripsAvoidedRateLabel: "—",
  extraTonnageT: 0,
  maxSpiSession: 0,
  autoSpillEvents: 0,
  autoOverloadEvents: 0,
  autoMaxSpiSession: 0,
  manualSpillEvents: 0,
  manualOverloadEvents: 0,
  manualMaxSpiSession: 0,
};

function computeKpi(): KpiSnapshot {
  const engine = getEngine();
  // "Session" figures (M-1) come from the engine's own running totals, not
  // from reducing over `completed` — that array is capped at 160 entries for
  // memory, so a long-running demo would otherwise silently undercount
  // tonnage/wagons/spills/overloads once older wagons got evicted.
  const last30 = engine.completed.slice(-30);
  const rollingUtilizationPct =
    last30.length > 0 ? last30.reduce((s, w) => s + w.utilizationPct, 0) / last30.length : 0;
  const tonnageToday = engine.totalTonnageT;
  const deltaPp = rollingUtilizationPct > 0 ? rollingUtilizationPct - BASELINE_UTILIZATION_PCT : 0;
  // Honest availability: the one real "console lost authority" signal this
  // Phase-A demo has is time spent in FALLBACK (PLC local control), not a
  // fabricated figure that climbs toward its own pass threshold regardless
  // of what happens in the session.
  const availabilityPct =
    engine.simTimeMs > 0 ? 100 * (1 - engine.fallbackTimeMs / engine.simTimeMs) : 100;

  return {
    rollingUtilizationPct,
    baselineUtilizationPct: BASELINE_UTILIZATION_PCT,
    deltaPp,
    tonnageToday,
    wagonsLoadedToday: engine.totalCompletedCount,
    overrideCount24h: 0, // overwritten by store value where consumed
    availabilityPct,
    spillEvents: engine.totalSpillEvents,
    overloadEvents: engine.totalOverloadEvents,
    tripsAvoidedRateLabel: deltaPp > 0 ? `1 / ${Math.max(1, Math.round(100 / deltaPp))} trains` : "—",
    extraTonnageT: Math.max(0, tonnageToday * (deltaPp / 100)),
    maxSpiSession: engine.maxSpiSession,
    autoSpillEvents: engine.autoSpillEvents,
    autoOverloadEvents: engine.autoOverloadEvents,
    autoMaxSpiSession: engine.autoMaxSpiSession,
    manualSpillEvents: engine.manualSpillEvents,
    manualOverloadEvents: engine.manualOverloadEvents,
    manualMaxSpiSession: engine.manualMaxSpiSession,
  };
}

/**
 * Historical alarm backlog for the warm-started demo session (engine.
 * seedDemoSession() — see singleton.ts). Grounded in the engine's *actual*
 * seeded physics (wagon spill/overload flags, mode-change boundaries) rather
 * than fabricated content, so a viewer who drills from an alarm into the
 * Recent Wagons table sees a consistent story. onAlarm is null during
 * seeding, so none of this comes from the live raiseAlarm() path — it has to
 * be reconstructed here once, at session start (demo credibility audit,
 * 2026-07-16).
 */
function seedHistoricalAlarms(engine: TwinLiteEngine): AlarmRecord[] {
  const recs: AlarmRecord[] = [];
  const push = (rec: Omit<AlarmRecord, "id">) => recs.push({ id: nextAlarmId(), ...rec });
  const manualWagons = engine.completed.filter((w) => w.controlMode === "MANUAL");

  push({
    code: "TRAIN_ARRIVAL",
    priority: "LOW",
    message: `Train ${engine.trainCode} arrived at loading gantry`,
    cause: "Train detected at gantry approach sensor.",
    consequence: "Informational — no operator action required.",
    action: "None required.",
    timeToConsequenceS: null,
    raisedAt: 2_000,
    lifecycle: "CLEARED",
    trainCode: engine.trainCode,
  });
  push({
    code: "MODE_CHANGE",
    priority: "LOW",
    message: "Platform mode → AUTONOMOUS",
    cause: "Session start — AI control confirmed.",
    consequence: "Informational — no operator action required.",
    action: "None required.",
    timeToConsequenceS: null,
    raisedAt: 4_000,
    lifecycle: "CLEARED",
    trainCode: engine.trainCode,
  });

  if (manualWagons.length > 0) {
    const first = manualWagons[0];
    const last = manualWagons[manualWagons.length - 1];
    push({
      code: "MODE_CHANGE",
      priority: "LOW",
      message: "Platform mode → MANUAL (operator takeover)",
      cause: "Operator-initiated takeover.",
      consequence: "Informational — no operator action required.",
      action: "None required.",
      timeToConsequenceS: null,
      raisedAt: Math.max(0, first.completedAtMs - 60_000),
      lifecycle: "CLEARED",
      trainCode: engine.trainCode,
    });
    push({
      code: "MODE_CHANGE",
      priority: "LOW",
      message: "Platform mode → AUTONOMOUS (resume auto)",
      cause: "Supervised resume-auto ramp completed.",
      consequence: "Informational — no operator action required.",
      action: "None required.",
      timeToConsequenceS: null,
      raisedAt: last.completedAtMs,
      lifecycle: "CLEARED",
      trainCode: engine.trainCode,
    });
  }

  for (const w of engine.completed) {
    if (w.spillFlag) {
      push({
        code: "SPILL_DETECTED",
        priority: "CRITICAL",
        message: `Discharge detected over inter-wagon gap (wagon ${w.seq})`,
        cause: "Chute discharge occurred while no wagon opening was under the stream footprint.",
        consequence: "Sulfur on track / ballast at the inter-wagon gap.",
        action: "Dispatch track inspection at next safe window; log incident bundle.",
        timeToConsequenceS: null,
        raisedAt: w.completedAtMs,
        lifecycle: "ACKED",
        ackedBy: "A. Rahman",
        wagonSeq: w.seq,
        trainCode: engine.trainCode,
      });
    }
    if (w.overloadFlag) {
      push({
        code: "OVERLOAD",
        priority: "CRITICAL",
        message: `Wagon ${w.seq} net weight exceeds rated payload`,
        cause: "Net wagon weight exceeded 100.5% of rated payload.",
        consequence: "Non-conformance with consignment limits; potential mechanical stress.",
        action: "Flag wagon for weighbridge confirmation before departure.",
        timeToConsequenceS: null,
        raisedAt: w.completedAtMs,
        lifecycle: "ACKED",
        ackedBy: "A. Rahman",
        wagonSeq: w.seq,
        trainCode: engine.trainCode,
      });
    }
  }

  push({
    code: "SPI_HIGH",
    priority: "HIGH",
    message: "Spill Probability Index exceeded 0.02 — flow curtailment engaged",
    cause: "Spill Probability Index trending above the 0.02 curtailment threshold.",
    consequence: "Reduced fill margin at the next wagon boundary if trend continues.",
    action: "Flow curtailment is automatic. Monitor; no operator action required unless it escalates.",
    timeToConsequenceS: 20,
    raisedAt: manualWagons[0]?.completedAtMs ?? Math.round(engine.simTimeMs * 0.5),
    lifecycle: "ACKED",
    ackedBy: "A. Rahman",
    trainCode: engine.trainCode,
  });
  push({
    code: "SURGE_BIN_HIGH",
    priority: "HIGH",
    message: "Surge bin level > 90% capacity",
    cause: "Chute inflow rate exceeding discharge rate for a sustained period.",
    consequence: "Bin overfill risk; possible chute throat plug.",
    action: "Monitor; controller will throttle gate automatically.",
    timeToConsequenceS: 45,
    raisedAt: Math.round(engine.simTimeMs * 0.22),
    lifecycle: "CLEARED",
    trainCode: engine.trainCode,
  });
  push({
    code: "DENSITY_DRIFT",
    priority: "MEDIUM",
    message: "Sulfur bulk density estimate drifted from lot reference",
    cause: "Rolling density estimate diverged from the stockpile lot's declared reference value.",
    consequence: "Fill-mass projection band may widen slightly until recalibrated.",
    action: "Non-urgent — recalibrate at next lot changeover.",
    timeToConsequenceS: null,
    raisedAt: Math.round(engine.simTimeMs * 0.85),
    lifecycle: "SHELVED",
    trainCode: engine.trainCode,
  });

  return recs.sort((a, b) => b.raisedAt - a.raisedAt);
}

function seedHistoricalEvents(engine: TwinLiteEngine): OperatorEvent[] {
  const evs: OperatorEvent[] = [];
  const manualWagons = engine.completed.filter((w) => w.controlMode === "MANUAL");
  if (manualWagons.length > 0) {
    const first = manualWagons[0];
    const last = manualWagons[manualWagons.length - 1];
    evs.push({
      id: nextEventId(),
      ts: last.completedAtMs,
      label: "RESUME AUTO confirmed — AUTONOMOUS",
      detail: "Supervised ramp completed, full AI authority restored",
      trigger: "UI",
    });
    evs.push({
      id: nextEventId(),
      ts: Math.max(0, first.completedAtMs - 60_000),
      label: "MANUAL takeover confirmed",
      detail: "trigger HW_BUTTON · operator-initiated",
      trigger: "HW_BUTTON",
    });
  }
  evs.push({
    id: nextEventId(),
    ts: 4_000,
    label: "AUTONOMOUS authority confirmed",
    detail: `Train ${engine.trainCode} — session start`,
    trigger: "SYSTEM",
  });
  return evs.sort((a, b) => b.ts - a.ts);
}

function runPreflight(): PreflightCheck[] {
  const engine = getEngine();
  return [
    { key: "permissives", label: "Plant permissives healthy", pass: true },
    { key: "sensor_quality", label: "Sensor quality GOOD (belt/speed/radar)", pass: true },
    { key: "comms_latency", label: "Comms latency in bounds", pass: true },
    {
      key: "twin_divergence",
      label: "Twin divergence within band",
      pass: engine.spi < 0.05,
    },
    { key: "spi", label: "SPI below curtailment threshold", pass: engine.spi < 0.02 },
  ];
}

export const useSimStore = create<SimStoreState>((set, get) => ({
  clock: 0,
  simTimeMs: 0,
  mode: "AUTONOMOUS",
  environment: "PHASE_B",
  timeMultiplier: 1,
  takeoverPhase: "IDLE",
  preflight: [],
  lastTakeoverLatencyMs: null,
  overrideCount24h: 0,
  pendingOverrideReason: false,

  role: "SCO",
  theme: "dark",
  selectedWagonSeq: null,

  connection: "LIVE",
  connectionSinceMs: 0,

  alarms: [],
  events: [],
  kpi: EMPTY_KPI,

  init: () => {
    const engine = getEngine();
    engine.mode = get().mode;
    set({ kpi: { ...computeKpi(), overrideCount24h: get().overrideCount24h }, simTimeMs: engine.simTimeMs });

    // Historical backlog for the warm-started session — guarded so a
    // StrictMode-style double mount/unmount/mount doesn't seed twice (the
    // seeded content itself persists across init() calls, unlike the
    // intervals/callbacks below).
    if (get().alarms.length === 0 && get().events.length === 0) {
      set({
        alarms: seedHistoricalAlarms(engine),
        events: [
          ...seedHistoricalEvents(engine),
          {
            id: nextEventId(),
            ts: engine.simTimeMs,
            label: "Session started",
            detail: "ProAI control cockpit connected — simulator active",
            trigger: "SYSTEM",
          },
        ],
      });
    }

    const director = startDirector();

    engine.onAlarm = (ev) => {
      const rec: AlarmRecord = {
        id: nextAlarmId(),
        code: ev.code,
        priority: ev.priority,
        message: ev.message,
        cause: ev.cause,
        consequence: ev.consequence,
        action: ev.action,
        timeToConsequenceS: ev.timeToConsequenceS,
        raisedAt: engine.simTimeMs,
        lifecycle: "ACTIVE",
        wagonSeq: ev.wagonSeq,
        trainCode: engine.trainCode,
      };
      set((s) => ({ alarms: [rec, ...s.alarms].slice(0, 200) }));
    };

    // Wall-clock-driven ticking (M-4): a backgrounded tab throttles
    // setInterval to >=1s, so ticking a fixed count per firing would let sim
    // time silently fall behind wall time ~10x. Instead each firing steps
    // the engine by however many TICK_MS windows actually elapsed, capped so
    // a long suspend (laptop sleep, debugger pause) doesn't replay hours of
    // ticks in one burst.
    let raw = 0;
    let lastNowMs = performance.now();
    const interval = setInterval(() => {
      const nowMs = performance.now();
      const elapsedMs = Math.min(nowMs - lastNowMs, 5000);
      lastNowMs = nowMs;
      const steps = Math.max(1, Math.min(Math.round((elapsedMs * get().timeMultiplier) / TICK_MS), 300));
      for (let i = 0; i < steps; i++) engine.tick();
      raw++;
      // H-2: the plant/engine keeps running while DEGRADED — only the
      // console's published view of it freezes, so React-rendered readouts
      // (KPI tiles, ModeAuthorityBar figures, etc.) actually stop advancing
      // instead of silently updating live under a cosmetic header chip.
      if (raw % 2 === 0 && get().connection === "LIVE") {
        set((s) => ({ clock: s.clock + 1, simTimeMs: engine.simTimeMs }));
      }
    }, TICK_MS);

    const kpiInterval = setInterval(() => {
      if (get().connection !== "LIVE") return;
      set((s) => ({ kpi: { ...computeKpi(), overrideCount24h: s.overrideCount24h } }));
    }, 2000);

    directorHandle = director;

    return () => {
      clearInterval(interval);
      clearInterval(kpiInterval);
      engine.onAlarm = null;
      director.stop();
      directorHandle = null;
    };
  },

  setRole: (r) => set({ role: r }),
  setTheme: (t) => {
    set({ theme: t });
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", t);
    }
  },
  selectWagon: (seq) => set({ selectedWagonSeq: seq }),

  setConnection: (c) => {
    const engine = getEngine();
    const label =
      c === "LIVE"
        ? "Link restored — telemetry LIVE"
        : c === "DEGRADED"
          ? "Link degraded — telemetry aging (demo)"
          : "Live data lost (demo) — plant control unaffected";
    set((s) => ({
      connection: c,
      connectionSinceMs: engine.simTimeMs,
      events: [
        {
          id: nextEventId(),
          ts: engine.simTimeMs,
          label,
          detail: `Simulated console-to-edge link state → ${c}`,
          trigger: "SYSTEM" as const,
        },
        ...s.events,
      ].slice(0, 300),
    }));
  },

  takeManual: (trigger) => {
    const engine = getEngine();
    const state = get();
    if (state.mode === "MANUAL" || state.mode === "FALLBACK") return;
    if (state.takeoverPhase !== "IDLE") return;

    set({ takeoverPhase: "TAKING_OVER" });
    const t0 = performance.now();
    setTimeout(() => {
      const latency = Math.round(performance.now() - t0 + 40 + Math.random() * 120);
      engine.mode = "MANUAL";
      set((s) => ({
        mode: "MANUAL",
        takeoverPhase: "MANUAL_CONFIRMED",
        lastTakeoverLatencyMs: latency,
        overrideCount24h: s.overrideCount24h + 1,
        pendingOverrideReason: true,
        events: [
          {
            id: nextEventId(),
            ts: engine.simTimeMs,
            label: `MANUAL takeover confirmed ${latency} ms`,
            detail: `trigger ${trigger} · setpoints held: speed ${engine.speedKmh.toFixed(2)} km/h`,
            trigger,
          },
          ...s.events,
        ].slice(0, 300),
      }));
      setTimeout(() => set({ takeoverPhase: "IDLE" }), 1800);
    }, 220 + Math.random() * 180);
  },

  openResumeDialog: () => {
    set({ takeoverPhase: "PREFLIGHT", preflight: runPreflight() });
  },
  closeResumeDialog: () => {
    if (get().takeoverPhase === "PREFLIGHT") set({ takeoverPhase: "IDLE" });
  },
  armResumeComplete: () => {
    if (get().takeoverPhase === "PREFLIGHT") set({ takeoverPhase: "ARMED" });
  },
  confirmResume: () => {
    const engine = getEngine();
    if (get().takeoverPhase !== "ARMED") return;
    engine.mode = "AUTONOMOUS";
    set((s) => ({
      mode: "AUTONOMOUS",
      takeoverPhase: "RAMPING",
      events: [
        {
          id: nextEventId(),
          ts: engine.simTimeMs,
          label: "RESUME AUTO — 10 s supervised ramp started",
          detail: "Increments clamped to 25% authority during ramp",
          trigger: "UI" as const,
        },
        ...s.events,
      ].slice(0, 300),
    }));
    setTimeout(() => {
      if (get().takeoverPhase === "RAMPING") set({ takeoverPhase: "IDLE" });
    }, 10000);
  },
  abortRamp: () => {
    const engine = getEngine();
    if (get().takeoverPhase !== "RAMPING") return;
    engine.mode = "MANUAL";
    set((s) => ({
      mode: "MANUAL",
      takeoverPhase: "IDLE",
      events: [
        {
          id: nextEventId(),
          ts: engine.simTimeMs,
          label: "RESUME AUTO aborted — returned to MANUAL",
          detail: "Operator aborted supervised ramp",
          trigger: "UI" as const,
        },
        ...s.events,
      ].slice(0, 300),
    }));
  },

  setEnvironment: (env) => {
    const engine = getEngine();
    const nextMode = env === "PHASE_A" ? "SHADOW" : "AUTONOMOUS";
    engine.mode = nextMode;
    set((s) => ({
      environment: env,
      mode: nextMode,
      events: [
        {
          id: nextEventId(),
          ts: engine.simTimeMs,
          label: `Environment switched to ${env === "PHASE_A" ? "Phase A (Read-Only Shadow)" : "Phase B (Closed-Loop Simulator)"}`,
          detail: `Control mode set to ${nextMode}`,
          trigger: "SYSTEM" as const,
        },
        ...s.events,
      ].slice(0, 300),
    }));
  },

  setTimeMultiplier: (m) => set({ timeMultiplier: m }),

  simulateFallback: () => {
    const engine = getEngine();
    engine.mode = "FALLBACK";
    const alarmId = `AL-FALLBACK-${Date.now()}`;
    const fallbackAlarm: AlarmRecord = {
      id: alarmId,
      code: "PLC_LOCAL_ACTIVE",
      priority: "CRITICAL",
      message: "PLC LOCAL ACTIVE — ProAI commands inhibited — use plant console",
      cause: "PLC watchdog loss or critical hardware fault occurred, causing safety-system local fallback.",
      consequence: "ProAI closed-loop control is inhibited; plant is running under local PLC setpoints.",
      action: "Use physical plant gantry console for manual takeover; acknowledge alarm and review cause.",
      timeToConsequenceS: null,
      raisedAt: engine.simTimeMs,
      lifecycle: "ACTIVE",
      trainCode: engine.trainCode,
    };
    set((s) => ({
      mode: "FALLBACK",
      takeoverPhase: "IDLE",
      alarms: [fallbackAlarm, ...s.alarms],
      events: [
        {
          id: nextEventId(),
          ts: engine.simTimeMs,
          label: "FALLBACK entered (simulated fault)",
          detail: "Demo trigger — watchdog/fault path, PLC LOCAL control",
          trigger: "SYSTEM" as const,
        },
        ...s.events,
      ].slice(0, 300),
    }));
  },
  clearFallback: () => {
    const engine = getEngine();
    engine.mode = "ADVISORY";
    set((s) => ({
      mode: "ADVISORY",
      alarms: s.alarms.map((a) =>
        a.code === "PLC_LOCAL_ACTIVE" && a.lifecycle === "ACTIVE" ? { ...a, lifecycle: "CLEARED" } : a
      ),
      events: [
        {
          id: nextEventId(),
          ts: engine.simTimeMs,
          label: "FALLBACK cleared — platform in ADVISORY",
          detail: "Fault-clear checklist completed (demo)",
          trigger: "SYSTEM" as const,
        },
        ...s.events,
      ].slice(0, 300),
    }));
  },

  submitOverrideReason: (code, note) => {
    const engine = getEngine();
    set((s) => ({
      pendingOverrideReason: false,
      events: [
        {
          id: nextEventId(),
          ts: engine.simTimeMs,
          label: `Override reason recorded — ${code}`,
          detail: note || "(no free-text note)",
          trigger: "UI" as const,
        },
        ...s.events,
      ].slice(0, 300),
    }));
  },

  ackAlarm: (id) =>
    set((s) => ({
      alarms: s.alarms.map((a) => (a.id === id ? { ...a, lifecycle: "ACKED" } : a)),
    })),
  shelveAlarm: (id) =>
    set((s) => ({
      alarms: s.alarms.map((a) => (a.id === id ? { ...a, lifecycle: "SHELVED" } : a)),
    })),

  fireScenario: (name) => directorHandle?.fireScenario(name),
}));

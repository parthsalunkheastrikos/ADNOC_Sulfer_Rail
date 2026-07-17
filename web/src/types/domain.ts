// Canonical domain types for the ProAI-SLO advisory console.
// Mirrors docs/01_PRD_ProAI_Sulfur_Loading.md and docs/05_Database_Schema_Architecture.md
// This is a Phase-A, read-only advisory UI: all data below is produced by the
// client-side Digital-Twin-lite simulator (src/lib/sim), never written back to any plant system.

export type PlatformMode =
  | "AUTONOMOUS"
  | "ADVISORY"
  | "SHADOW"
  | "MANUAL"
  | "FALLBACK"
  | "MONITOR"
  | "OFF";

export type TakeoverPhase =
  | "IDLE"
  | "TAKING_OVER"
  | "MANUAL_CONFIRMED"
  | "PREFLIGHT"
  | "ARMING"
  | "ARMED"
  | "RAMPING"
  | "FAILED";

export interface OperatorEvent {
  id: string;
  ts: number; // sim clock ms
  label: string;
  detail: string;
  trigger: "UI" | "HW_BUTTON" | "SYSTEM";
}

export interface PreflightCheck {
  key: string;
  label: string;
  pass: boolean;
}

export type DataQuality = "GOOD" | "STALE" | "RANGE" | "ROC" | "XCHK" | "COMMS";

// Simulated console-to-edge link health (spec §1.4 "latency honesty" / §8
// degradation ladder). LIVE = normal 10 Hz publish; DEGRADED = telemetry is
// visibly aging (desaturate + STALE chip per the data/quality-stale token);
// LOST = full-screen veil, plant control is explicitly unaffected.
export type ConnectionState = "LIVE" | "DEGRADED" | "LOST";

export type AlarmPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type AlarmLifecycle = "ACTIVE" | "ACKED" | "SHELVED" | "CLEARED";

export interface AlarmRecord {
  id: string;
  code: string;
  priority: AlarmPriority;
  message: string;
  cause: string;
  consequence: string;
  action: string;
  timeToConsequenceS: number | null;
  raisedAt: number; // epoch ms (sim clock)
  lifecycle: AlarmLifecycle;
  ackedBy?: string;
  wagonSeq?: number;
  trainCode?: string;
}

export interface WagonState {
  seq: number; // position in consist, 1..N
  uid: string;
  tareT: number;
  ratedPayloadT: number;
  fillT: number; // current measured/estimated fill
  projectedFinalT: number; // model projection for this wagon
  projectedErrT: number; // +/- band
  utilizationPct: number; // fillT / rated * 100 (live, in-progress)
  status: "PENDING" | "FILLING" | "COMPLETE";
  overloadRisk: boolean;
  spillRisk: boolean;
  freeboardMinM: number;
  // 142-bin longitudinal profile, 0..1 normalized height (measured / model-estimated)
  profile: Float32Array;
  profileProjected: Float32Array;
}

export interface TrainState {
  code: string;
  wagonCount: number;
  activeWagonSeq: number;
  speedKmh: number;
  speedSetpointKmh: number;
  positionM: number; // distance travelled under chute since train start
  boundaryEtaS: number; // seconds until next wagon boundary reaches chute
}

export interface ProcessSnapshot {
  simTimeMs: number;
  belt: {
    feedRateTph: number;
    gatePlanTph: number;
    gateOpeningPct: number;
    inventoryT: number; // mass currently in-flight on the belt
  };
  chute: {
    surgeBinLevelT: number;
    surgeBinCapacityT: number;
    gateOpeningPct: number;
  };
  spi: number; // Spill Probability Index [0,1]
  quality: {
    beltWeigher: DataQuality;
    trainSpeed: DataQuality;
    chuteRadar: DataQuality;
  };
}

export interface TrendPoint {
  t: number; // ms, sim clock
  speedActual: number;
  speedSetpoint: number;
  speedPlan: number | null; // future/dotted plan value, null for past samples
  chuteFlow: number;
  gatePlan: number | null;
  spi: number;
  surgeBinLevel: number;
}

export interface KpiSnapshot {
  rollingUtilizationPct: number; // rolling 30-train mean
  baselineUtilizationPct: number;
  deltaPp: number;
  tonnageToday: number;
  wagonsLoadedToday: number;
  overrideCount24h: number;
  availabilityPct: number;
  spillEvents: number; // combined session total (both AI and manual control)
  overloadEvents: number; // combined session total (both AI and manual control)
  // §6.5 business translation as a rate ("1 saved per N run"), not a floored
  // integer count — at realistic ΔU (~1-2pp) a session needs ~100+ wagons
  // before a floored "trips avoided" count ever ticks past 0, which reads as
  // "no benefit" even when the underlying gain is real and steady.
  tripsAvoidedRateLabel: string; // e.g. "1 / 91 trains" or "—" pre-data
  extraTonnageT: number; // cumulative extra tonnage this session vs. baseline, at ΔU
  maxSpiSession: number; // session-peak SPI sampled at the KPI refresh cadence (illustrative)
  // Mode-scoped safety figures (docs/02 §6.3 scopes the exit gate to the
  // optimized/AI set only; MANUAL/FALLBACK incidents are baseline context).
  autoSpillEvents: number;
  autoOverloadEvents: number;
  autoMaxSpiSession: number;
  manualSpillEvents: number;
  manualOverloadEvents: number;
  manualMaxSpiSession: number;
}

export type Role = "SCO" | "RLE" | "CI_ENGINEER" | "CAO" | "OPS_MANAGER";

export const ROLE_LABEL: Record<Role, string> = {
  SCO: "Station Control Operator",
  RLE: "Rail Loading Engineer",
  CI_ENGINEER: "C&I Engineer",
  CAO: "Cybersecurity Auditing Officer",
  OPS_MANAGER: "Operations Manager",
};

// Each persona's own designated screens per docs/03_UIUX_Design_Specification.md
// §1 (persona table) / §7 (RLE/CAO screen specs) — distinct from which of the
// *built* S-01/S-02/S-40 screens a role happens to have nav access to. Used
// only to tell a demo viewer honestly which of a persona's real screens are
// still on the roadmap, instead of silently substituting SCO's operational
// screens with no explanation (H-3).
export interface RoleScreen {
  code: string;
  label: string;
  built: boolean;
}

export const ROLE_DESIGNATED_SCREENS: Record<Role, RoleScreen[]> = {
  SCO: [
    { code: "S-01", label: "Loading Console", built: true },
    { code: "S-02", label: "Alarm List", built: true },
    { code: "S-03", label: "Override & Events", built: true },
  ],
  RLE: [
    { code: "S-10", label: "Performance Analytics", built: true },
    { code: "S-11", label: "Model & Twin Studio", built: false },
    { code: "S-12", label: "Constraint Manager", built: false },
  ],
  CI_ENGINEER: [{ code: "S-30", label: "Signal Health & Integration Diagnostics", built: true }],
  CAO: [
    { code: "S-20", label: "Audit Explorer", built: true },
    { code: "S-21", label: "Security Posture", built: false },
  ],
  OPS_MANAGER: [{ code: "S-40", label: "KPI Dashboard", built: true }],
};

// Each persona's own home screen — where a role switch navigates to (AppShell).
export const ROLE_HOME_HREF: Record<Role, string> = {
  SCO: "/console",
  RLE: "/analytics",
  CI_ENGINEER: "/signals",
  CAO: "/audit",
  OPS_MANAGER: "/",
};

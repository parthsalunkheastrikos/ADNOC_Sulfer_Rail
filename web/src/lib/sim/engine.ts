// TwinLiteEngine — a lightweight, illustrative stand-in for the Phase-A
// Digital Twin (docs/02_MVP_Scope_PhaseA.md §4). It reproduces the *shape* of
// the physics (advected belt transport delay, surge-bin buffering, pile
// deposition with angle-of-repose relaxation, train kinematics, wagon
// boundary choreography) closely enough to drive a convincing operator
// console demo. It is NOT the calibrated, mass-balance-certified simulator
// that Phase A's engineering workstream builds — no control, safety, or
// business decision should ever be made from its numbers.
import { mulberry32, gaussian, clamp } from "./rng";
import { RingBuffer } from "./ringbuffer";
import type { AlarmPriority, DataQuality, PlatformMode } from "@/types/domain";
import {
  WAGON_RATED_PAYLOAD_T,
  WAGON_HOPPER_OPENING_M,
  INTER_WAGON_GAP_M,
  TRAIN_WAGON_COUNT,
  PEAK_LOADING_RATE_TPH,
  SUSTAINED_LOADING_RATE_TPH,
  CREEP_SPEED_DEFAULT_KMH,
  TRANSPORT_DEAD_TIME_S,
  SURGE_BIN_CAPACITY_T,
  RIM_FREEBOARD_M,
  RIM_HEIGHT_M,
  PROFILE_BINS,
  PROFILE_BIN_WIDTH_M,
  TICK_MS,
  TARGET_UTILIZATION_AUTONOMOUS,
  TARGET_UTILIZATION_MANUAL,
  ACCEL_LIMIT_MS2,
  DECEL_LIMIT_MS2,
  BULK_DENSITY_TPM3,
} from "./constants";

const DT_S = TICK_MS / 1000;
const DT_H = DT_S / 3600;
const BELT_CELLS = Math.round((TRANSPORT_DEAD_TIME_S * 1000) / TICK_MS); // ~453
const MAX_SLOPE_PER_BIN = Math.tan((30 * Math.PI) / 180) * PROFILE_BIN_WIDTH_M;
// Angle-of-repose relaxation crowns the pile — empirically (headless harness,
// scratch/calibrate.ts) the crest runs ~1.95x the whole-wagon bin-average
// height for this deposit/relaxation scheme (not the ~1.7x originally
// assumed), so the *average* height target is calibrated against the
// measured ratio, not the assumed one, to keep the crest itself within
// freeboard at the ~99.3% AI fill target instead of tripping at ~92% fill.
const CREST_TO_AVG_RATIO = 1.95;
const TARGET_AVG_HEIGHT_M = (RIM_HEIGHT_M - RIM_FREEBOARD_M) / CREST_TO_AVG_RATIO;
const KERNEL = [0.05, 0.15, 0.6, 0.15, 0.05];
const HISTORY_SECONDS = 180;
const HISTORY_CAPACITY = Math.round((HISTORY_SECONDS * 1000) / TICK_MS);

// Boundary choreography timings (FR-3.6): how far ahead of the wagon
// boundary the chute begins throttling/closing. AI/ADVISORY plans its feed
// so all target mass is committed and discharged *before* this lead window
// opens — mass that would only arrive during the throttle/gap window is
// deliberately not counted as deliverable to the active wagon.
const THROTTLE_LEAD_S = 6; // gate eases to a trickle
const FULL_CLOSE_LEAD_S = 2.5; // gate eases fully shut, ahead of the gap itself
// Empirical convergence-gain compensation for the AI commit-rate law
// (2026-07-16 audit item 0.3): the receding-horizon design in
// commitTargetRateTph structurally leaves some of `remaining` uncommitted
// at the instant the belt-injection window closes (verified headless,
// scratch-trace2.ts — ~3-4t of a 100t wagon's target still uncounted at
// cutoff, only partly recovered by belt/surge-bin carryover), so AI wagons
// converged to ~98.1-98.3% against the 99.3% target instead of the
// ~98.8-99.5% band the product target calls for. Aiming the commit law
// itself slightly above the true target compensates for that structural
// shortfall instead of chasing it via unrelated levers (gate lag, margins)
// that either don't move it or trade away spill-safety margin.
const AI_COMMIT_GAIN = 1.012;

/**
 * UIC/AAR-style rolling-stock check digit (docs audit 2026-07-16, Phase 5
 * §4): Luhn-family alternating-weight mod-10, applied to an 11-digit body to
 * produce a 12th check digit — the same *shape* real wagon numbers have
 * (e.g. "33 87 4971 052-6"), not a claim of UIC-conformant issuance.
 */
function uicCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    let d = body.charCodeAt(i) - 48;
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

export interface EngineWagon {
  seq: number;
  uid: string;
  tareT: number;
  fillT: number;
  profile: Float32Array; // meters, length PROFILE_BINS
  status: "FILLING" | "COMPLETE";
  minFreeboardM: number;
  spillFlag: boolean;
  // MANUAL-mode operator boundary-taper profile — a human reacts later, less
  // consistently, and sometimes not at all compared to the AI's crisp,
  // repeatable lead time (docs/03 §1: "manual ~96-97% with occasional
  // near-misses" is the intended story, not a guaranteed spill every wagon).
  opTaperLeadS: number;
  opTaperPct: number;
  opMiss: boolean;
  // Whether (and how early) the operator also remembers the final hard
  // close right at the boundary, not just the earlier partial taper — this
  // is what actually determines whether a given wagon spills or not.
  opFinalCloseLeadS: number;
}

export interface CompletedWagon {
  seq: number;
  uid: string;
  utilizationPct: number;
  netT: number;
  overloadFlag: boolean;
  spillFlag: boolean;
  controlMode: PlatformMode;
  completedAtMs: number;
}

export interface EngineAlarmEvent {
  code: string;
  priority: AlarmPriority;
  message: string;
  cause: string;
  consequence: string;
  action: string;
  timeToConsequenceS: number | null;
  wagonSeq?: number;
}

export interface HistorySample {
  t: number;
  speedActual: number;
  speedSetpoint: number;
  chuteFlow: number;
  gatePlan: number;
  spi: number;
  surgeBinLevel: number;
}

interface DisturbanceEvent {
  kind: string;
  untilMs: number;
  magnitude: number;
}

/**
 * Delay-embedded predictive commit-rate law (FR-3.6), shared by the real
 * control loop (stepGateControl) and getPlanForecast's dotted plan line
 * (M-2) — previously each re-implemented this arithmetic separately, so a
 * tuning fix to one (e.g. the FULL_CLOSE_LEAD_S cutoff added for C-1) could
 * silently leave the plan line showing stale, un-tuned behavior. Takes
 * `belt` as a parameter rather than reading `this.belt` so the forecast can
 * pass its own cloned array without mutating real engine state.
 */
function commitTargetRateTph(belt: Float32Array, boundaryEtaS: number, remainingT: number): number {
  const usableEtaS = Math.max(boundaryEtaS - FULL_CLOSE_LEAD_S, 0);
  const cells = Math.min(BELT_CELLS, Math.max(0, Math.round(usableEtaS / DT_S)));
  let committed = 0;
  for (let i = BELT_CELLS - cells; i < BELT_CELLS; i++) committed += belt[i];
  const commitWindowS = Math.max(usableEtaS - TRANSPORT_DEAD_TIME_S, 0);
  const toCommit = Math.max(0, remainingT - committed);
  return commitWindowS > 0.5 ? (toCommit / commitWindowS) * 3600 : 0;
}

export class TwinLiteEngine {
  simTimeMs = 0;
  mode: PlatformMode = "ADVISORY";
  trainSeq = 1142;
  trainCode = `ETR-${this.trainSeq}`;
  wagonCount = TRAIN_WAGON_COUNT;
  activeSeq = 1;
  wagonProgressM = 0; // chute position relative to leading edge of active wagon
  speedKmh = CREEP_SPEED_DEFAULT_KMH;
  speedSetpointKmh = CREEP_SPEED_DEFAULT_KMH;
  gateOpeningPct = 0;
  beltRateActualTph = 0;
  chuteGateOpeningPct = 1;
  surgeBinT = 1.2;
  spi = 0.002;
  belt: Float32Array = new Float32Array(BELT_CELLS);
  activeWagon: EngineWagon;
  completed: CompletedWagon[] = [];
  // Running session totals (M-1): `completed` is capped at COMPLETED_CAP for
  // memory, so KPIs that must reflect the *whole* session (tonnage, wagon
  // count, spill/overload counts) are accumulated here instead of being
  // recomputed by reducing over the (silently truncated) completed array.
  totalCompletedCount = 0;
  totalTonnageT = 0;
  totalSpillEvents = 0;
  totalOverloadEvents = 0;
  // True session-peak SPI, updated every tick (not sampled at the KPI
  // panel's slower refresh cadence, which could miss a spike entirely).
  maxSpiSession = 0;
  // Mode-scoped safety totals (2026-07-16 audit item 0.2): the Phase A exit
  // gate (docs/02 §6.3) scopes "zero spills/overloads" and "SPI never
  // exceeds 0.02" to the *optimized* (AI: ADVISORY/AUTONOMOUS) set only —
  // MANUAL/FALLBACK incidents are baseline context, not gate failures.
  // Attributed by `this.mode` at the moment the event/sample occurs.
  autoSpillEvents = 0;
  autoOverloadEvents = 0;
  autoMaxSpiSession = 0;
  manualSpillEvents = 0;
  manualOverloadEvents = 0;
  manualMaxSpiSession = 0;
  // Total time spent in FALLBACK (PLC local control) — the one real signal
  // this Phase-A demo has for "the console lost authority", used to derive
  // an honest availabilityPct instead of a fabricated always-climbing figure.
  fallbackTimeMs = 0;
  // Per-lot bulk density readout (docs audit 2026-07-16, Phase 5 §3) —
  // display-only realism: resampled ~TruncatedNormal(1.30, 0.05^2) every
  // stockpile-lot changeover. Deliberately NOT fed into the deposit/mass
  // physics — those are already calibrated against a fixed density (see
  // CREST_TO_AVG_RATIO above), and wiring a second random variable through
  // that calibration would risk destabilizing the zero-spill AI story for a
  // cosmetic readout.
  lotNumber = 1;
  lotDensityTpm3 = BULK_DENSITY_TPM3;
  private wagonsUntilLotChange = 10;
  private disturbances: DisturbanceEvent[] = [];
  // Scripted-demo knobs (src/lib/sim/director.ts) — never touched by the
  // organic control loop itself, only by the presenter-facing demo pacing /
  // trigger menu. Kept as plain public fields rather than a config object so
  // engine.test.ts's fresh engines are unaffected by default (1 / false).
  disturbanceRateMultiplier = 1;
  private forcedSpillArm = false;
  private rand: () => number;
  // Separate RNG stream for purely cosmetic randomness (wagon UID digits,
  // lot density resampling) — kept independent of `rand` so decorative
  // additions never shift the physics/control-loop random sequence. The
  // whole zero-spill-AI / occasional-manual-spill story is calibrated
  // against a *specific* draw sequence from `rand` (see engine.test.ts);
  // interleaving unrelated rand() calls into that sequence silently
  // reshuffles every downstream disturbance/noise roll.
  private cosmeticRand: () => number;
  // Per-tag simulated quality (S-30 Signal Health / tag dictionary,
  // src/lib/sim/tags.ts): each tag independently rolls a low-probability
  // chance per tick of dropping into a bounded STALE window, then recovers —
  // real OPC-UA feeds occasionally go stale for a few seconds, unlike the
  // rest of this engine's otherwise-perfect telemetry.
  private tagStaleUntilMs: Record<string, number> = {};
  private spiCritLatched = false;
  private spiHighLatched = false;
  private surgeBinHighLatched = false;
  private lastChuteInflowT = 0;
  // Public: read by TrainCanvas to drive the falling-material particle stream.
  lastDischargeT = 0;

  history = {
    t: new RingBuffer(HISTORY_CAPACITY),
    speedActual: new RingBuffer(HISTORY_CAPACITY),
    speedSetpoint: new RingBuffer(HISTORY_CAPACITY),
    chuteFlow: new RingBuffer(HISTORY_CAPACITY),
    gatePlan: new RingBuffer(HISTORY_CAPACITY),
    spi: new RingBuffer(HISTORY_CAPACITY),
    surgeBinLevel: new RingBuffer(HISTORY_CAPACITY),
  };

  onAlarm: ((ev: EngineAlarmEvent) => void) | null = null;

  constructor(seed = 42) {
    this.rand = mulberry32(seed);
    this.cosmeticRand = mulberry32(seed ^ 0x9e3779b9);
    this.activeWagon = this.spawnWagon(this.activeSeq);
    // Seed the belt as if loading had already been steadily underway — an
    // empty pipe at t=0 would starve wagon 1 for a full transport delay
    // (~45s) before any material could possibly arrive, an artificial
    // cold-start most real sessions (mid-run, or primed before the first
    // wagon spots) would never actually see.
    const steadyMassPerCell = (SUSTAINED_LOADING_RATE_TPH * 0.9) * DT_H;
    this.belt.fill(steadyMassPerCell);
    this.beltRateActualTph = SUSTAINED_LOADING_RATE_TPH * 0.9;
    this.gateOpeningPct = this.beltRateActualTph / PEAK_LOADING_RATE_TPH;
  }

  private spawnWagon(seq: number): EngineWagon {
    const body = Array.from({ length: 11 }, () => Math.floor(this.cosmeticRand() * 10)).join("");
    const uid = `${body}-${uicCheckDigit(body)}`;
    return {
      seq,
      uid,
      tareT: 21 + this.rand() * 1.2,
      fillT: 0,
      profile: new Float32Array(PROFILE_BINS),
      status: "FILLING",
      minFreeboardM: RIM_FREEBOARD_M,
      spillFlag: false,
      opTaperLeadS: 1 + this.rand() * 7,
      opTaperPct: 0.1 + this.rand() * 0.6,
      opMiss: this.rand() < 0.1,
      opFinalCloseLeadS: this.rand() < 0.8 ? 2.5 + this.rand() * 2 : 0,
    };
  }

  private targetUtilization(): number {
    const humanDriven = this.mode === "MANUAL" || this.mode === "FALLBACK";
    return humanDriven ? TARGET_UTILIZATION_MANUAL : TARGET_UTILIZATION_AUTONOMOUS;
  }

  private maybeInjectDisturbance() {
    // low-frequency scenario library, docs/02 §4.2(f) — purely cosmetic here.
    if (this.rand() < 0.0006 * this.disturbanceRateMultiplier) {
      const kinds = ["density_shift", "belt_slip", "feed_surge", "creep_hunt"];
      const kind = kinds[Math.floor(this.rand() * kinds.length)];
      this.disturbances.push({
        kind,
        untilMs: this.simTimeMs + 8000 + this.rand() * 15000,
        magnitude: 0.5 + this.rand() * 0.5,
      });
    }
    this.disturbances = this.disturbances.filter((d) => d.untilMs > this.simTimeMs);
  }

  /** Demo-only: force-injects a named disturbance regardless of the random roll (director.ts "fire scenario" menu). */
  injectDisturbance(kind: string, magnitude: number, durationMs: number) {
    this.disturbances.push({ kind, untilMs: this.simTimeMs + durationMs, magnitude });
  }

  /** Demo-only: guarantees the *next* inter-wagon gap crossing spills, bypassing the boundary choreography that normally prevents it. */
  forceSpillOnNextGap() {
    this.forcedSpillArm = true;
  }

  /** Demo-only: bumps the active wagon straight past the overload threshold so the next finalize raises OVERLOAD. */
  forceOverloadActiveWagon() {
    this.activeWagon.fillT = Math.max(this.activeWagon.fillT, WAGON_RATED_PAYLOAD_T * 1.02);
  }

  private disturbanceFactor(kind: string): number {
    const d = this.disturbances.find((x) => x.kind === kind);
    return d ? d.magnitude : 0;
  }

  private static readonly TAG_NAMES = ["beltWeigher", "trainSpeed", "chuteRadar", "chuteGate", "surgeBin"];

  private stepTagQuality() {
    // Cosmetic-only randomness (see cosmeticRand doc comment) — this runs
    // every tick, so consuming `rand()` here would otherwise reshuffle the
    // entire physics sequence downstream, same class of bug the UID/lot
    // changes had to be fixed for.
    for (const name of TwinLiteEngine.TAG_NAMES) {
      const until = this.tagStaleUntilMs[name] ?? 0;
      if (this.simTimeMs < until) continue;
      if (this.cosmeticRand() < 0.00012) {
        this.tagStaleUntilMs[name] = this.simTimeMs + 2000 + this.cosmeticRand() * 8000;
      }
    }
  }

  /** Simulated per-tag quality for the S-30 Signal Health board (src/lib/sim/tags.ts). */
  getTagQuality(name: string): DataQuality {
    const until = this.tagStaleUntilMs[name] ?? 0;
    return this.simTimeMs < until ? "STALE" : "GOOD";
  }

  tick() {
    this.simTimeMs += TICK_MS;
    if (this.mode === "FALLBACK") this.fallbackTimeMs += TICK_MS;
    this.maybeInjectDisturbance();
    this.stepTagQuality();
    this.stepTrainKinematics();
    this.stepGateControl();
    this.stepBeltTransport();
    this.stepChuteAndWagon();
    this.stepSpi();
    this.recordHistory();
  }

  private stepTrainKinematics() {
    const speedNoise = this.disturbanceFactor("creep_hunt") > 0
      ? Math.sin(this.simTimeMs / 4000) * 0.05 * this.disturbanceFactor("creep_hunt")
      : 0;

    if (this.mode === "FALLBACK") {
      this.speedSetpointKmh = 0; // controlled hold
    } else if (this.mode === "MANUAL") {
      this.speedSetpointKmh =
        CREEP_SPEED_DEFAULT_KMH + Math.sin(this.simTimeMs / 6000) * 0.08 + speedNoise;
    } else {
      this.speedSetpointKmh = CREEP_SPEED_DEFAULT_KMH + speedNoise;
    }
    this.speedSetpointKmh = clamp(this.speedSetpointKmh, 0, 1.2);

    const curMs = this.speedKmh / 3.6;
    const setMs = this.speedSetpointKmh / 3.6;
    const maxDelta = (setMs > curMs ? ACCEL_LIMIT_MS2 : DECEL_LIMIT_MS2) * DT_S;
    const nextMs = curMs + clamp(setMs - curMs, -maxDelta, maxDelta);
    const encoderNoise = gaussian(this.rand, 0, 0.003);
    this.speedKmh = Math.max(0, (nextMs + encoderNoise) * 3.6);

    this.wagonProgressM += nextMs * DT_S;
  }

  /**
   * Mass currently in the belt pipeline that will arrive before `horizonS`.
   * belt[0] was just injected (oldest travel remaining); belt[BELT_CELLS-1]
   * is about to exit to the chute — so "arrives soon" is the tail end.
   */
  private committedMassWithinS(horizonS: number): number {
    const cells = Math.min(BELT_CELLS, Math.max(0, Math.round(horizonS / DT_S)));
    let sum = 0;
    for (let i = BELT_CELLS - cells; i < BELT_CELLS; i++) sum += this.belt[i];
    return sum;
  }

  private boundaryEtaS(): number {
    const speedMs = Math.max(this.speedKmh / 3.6, 0.02);
    return Math.max(0, WAGON_HOPPER_OPENING_M - this.wagonProgressM) / speedMs;
  }

  private stepGateControl() {
    const boundaryEtaS = this.boundaryEtaS();
    const targetFillT = WAGON_RATED_PAYLOAD_T * this.targetUtilization();
    const remaining = Math.max(0, targetFillT - this.activeWagon.fillT);
    const humanDriven = this.mode === "MANUAL" || this.mode === "FALLBACK";
    const w = this.activeWagon;

    let desiredRateTph: number;
    if (this.mode === "FALLBACK") {
      desiredRateTph = 0;
    } else if (!humanDriven) {
      // Delay-embedded predictive control (FR-3.6): plan for the wagon that
      // will be under the chute one transport-delay from now. Mass is only
      // "deliverable" to the active wagon if it clears the belt with enough
      // runway to also clear the surge-bin discharge stage before the chute
      // begins closing for the boundary — so the commit horizon is cut off
      // FULL_CLOSE_LEAD_S before the boundary, not at the boundary itself.
      // Shared with getPlanForecast's dotted plan line (M-2) so the two
      // never diverge. AI_COMMIT_GAIN compensates the commit law's
      // structural convergence shortfall (see doc comment above).
      const remainingCompensated = Math.max(0, targetFillT * AI_COMMIT_GAIN - this.activeWagon.fillT);
      desiredRateTph = commitTargetRateTph(this.belt, boundaryEtaS, remainingCompensated);
    } else {
      // human heuristic: no lookahead, reacts to what's visible now, tapers
      // conservatively (and inconsistently) as fill approaches target. The
      // taper has to start well before 100% because the ~45s belt transport
      // delay means whatever is already committed to the belt keeps landing
      // regardless of what the operator decides right now — a slower, wider
      // taper (vs a lookahead controller) is what keeps overload plausible
      // but not routine.
      const frac = this.activeWagon.fillT / targetFillT;
      const hesitation = 0.85 + gaussian(this.rand, 0, 0.08);
      if (frac < 0.74) desiredRateTph = PEAK_LOADING_RATE_TPH * 0.91 * hesitation;
      else desiredRateTph = PEAK_LOADING_RATE_TPH * 0.91 * hesitation * clamp(1 - (frac - 0.74) / 0.33, 0, 1);
    }

    const slipFactor = 1 - 0.03 * this.disturbanceFactor("belt_slip");
    const surgeFactor = 1 + 0.1 * this.disturbanceFactor("feed_surge");
    desiredRateTph = clamp(desiredRateTph * slipFactor * surgeFactor, 0, PEAK_LOADING_RATE_TPH * 1.05);

    const desiredPct = desiredRateTph / PEAK_LOADING_RATE_TPH;
    const tau = 1.8;
    this.gateOpeningPct += (desiredPct - this.gateOpeningPct) * Math.min(1, DT_S / tau);
    this.gateOpeningPct = clamp(this.gateOpeningPct, 0, 1);
    this.beltRateActualTph = this.gateOpeningPct * PEAK_LOADING_RATE_TPH;

    // chute gate: closes around the boundary window (choreography, FR-3.6).
    // AI eases to a trickle at THROTTLE_LEAD_S out, then fully shut by
    // FULL_CLOSE_LEAD_S so the low-pass gate has settled near zero before
    // the gap itself opens. MANUAL uses a per-wagon operator profile: later,
    // shallower, and sometimes entirely absent reactions — occasional
    // near-misses/spills, not a guaranteed one every wagon.
    const inGap =
      this.wagonProgressM >= WAGON_HOPPER_OPENING_M &&
      this.wagonProgressM < WAGON_HOPPER_OPENING_M + INTER_WAGON_GAP_M;
    let desiredChutePct: number;
    if (inGap && this.forcedSpillArm) {
      desiredChutePct = 1; // demo-only override — see forceSpillOnNextGap()
    } else if (inGap) {
      desiredChutePct = 0;
    } else if (!humanDriven) {
      desiredChutePct =
        boundaryEtaS < FULL_CLOSE_LEAD_S ? 0 : boundaryEtaS < THROTTLE_LEAD_S ? 0.3 : 1;
    } else if (!w.opMiss && w.opFinalCloseLeadS > 0 && boundaryEtaS < w.opFinalCloseLeadS) {
      desiredChutePct = 0;
    } else if (!w.opMiss && boundaryEtaS < w.opTaperLeadS) {
      desiredChutePct = w.opTaperPct;
    } else {
      desiredChutePct = 1;
    }
    this.chuteGateOpeningPct += (desiredChutePct - this.chuteGateOpeningPct) * Math.min(1, DT_S / 0.8);
    // Hard interlock, AI-mode only (2026-07-16 audit item 0.3 stress-test
    // finding, scratch-spilltrace.ts): the eased chuteGateOpeningPct above is
    // a first-order lag that only asymptotically approaches zero, so an
    // elevated surge-bin level at gap entry (e.g. after a feed_surge/
    // belt_slip disturbance) can leak a trace discharge (>0.001t) into the
    // gap even though the AI choreography closed "in time" by design intent.
    // A real automated gate would confirm fully closed before the boundary
    // rather than rely purely on the analog approach curve — MANUAL is
    // deliberately excluded, since its occasional near-miss/spill (a human
    // reacting late or not at all) is the intended baseline story, not a bug.
    if (inGap && !humanDriven && !this.forcedSpillArm) this.chuteGateOpeningPct = 0;
  }

  private stepBeltTransport() {
    const inflowT = this.beltRateActualTph * DT_H;
    this.lastChuteInflowT = this.belt[BELT_CELLS - 1];
    this.belt.copyWithin(1, 0, BELT_CELLS - 1);
    this.belt[0] = inflowT;
  }

  private stepChuteAndWagon() {
    const humanDriven = this.mode === "MANUAL" || this.mode === "FALLBACK";
    this.surgeBinT = clamp(this.surgeBinT + this.lastChuteInflowT, 0, SURGE_BIN_CAPACITY_T * 1.2);

    const starvation = this.surgeBinT < 0.5 ? this.surgeBinT / 0.5 : 1;
    const dischargeT = Math.min(
      this.surgeBinT,
      this.chuteGateOpeningPct * (PEAK_LOADING_RATE_TPH * 1.1 * DT_H) * starvation,
    );
    this.lastDischargeT = dischargeT;
    this.surgeBinT = clamp(this.surgeBinT - dischargeT, 0, SURGE_BIN_CAPACITY_T * 1.2);
    if (this.surgeBinT > SURGE_BIN_CAPACITY_T * 0.9 && !this.surgeBinHighLatched) {
      this.surgeBinHighLatched = true;
      this.raiseAlarm("SURGE_BIN_HIGH", "HIGH", "Surge bin level > 90% capacity", 45);
    } else if (this.surgeBinT < SURGE_BIN_CAPACITY_T * 0.8) {
      this.surgeBinHighLatched = false;
    }

    const inGap =
      this.wagonProgressM >= WAGON_HOPPER_OPENING_M &&
      this.wagonProgressM < WAGON_HOPPER_OPENING_M + INTER_WAGON_GAP_M;

    if (dischargeT > 0.001 && inGap && !this.activeWagon.spillFlag) {
      this.activeWagon.spillFlag = true;
      if (humanDriven) this.manualSpillEvents += 1;
      else this.autoSpillEvents += 1;
      this.raiseAlarm("SPILL_DETECTED", "CRITICAL", `Discharge detected over inter-wagon gap (wagon ${this.activeWagon.seq})`, null, this.activeWagon.seq);
    }

    if (dischargeT > 0 && !inGap) {
      this.activeWagon.fillT += dischargeT;
      this.depositProfile(dischargeT);
      this.relaxProfile();
      const maxH = Math.max(...this.activeWagon.profile);
      const freeboard = RIM_HEIGHT_M - maxH;
      this.activeWagon.minFreeboardM = Math.min(this.activeWagon.minFreeboardM, freeboard);
      if (freeboard < 0 && !this.activeWagon.spillFlag) {
        this.activeWagon.spillFlag = true;
        if (humanDriven) this.manualSpillEvents += 1;
        else this.autoSpillEvents += 1;
        this.raiseAlarm("FREEBOARD_VIOLATION", "CRITICAL", `Pile crest exceeded rim on wagon ${this.activeWagon.seq}`, null, this.activeWagon.seq);
      }
    }

    if (this.wagonProgressM >= WAGON_HOPPER_OPENING_M + INTER_WAGON_GAP_M) {
      this.finalizeActiveWagon();
    }
  }

  private depositProfile(dischargeT: number) {
    const massFrac = dischargeT / WAGON_RATED_PAYLOAD_T;
    const heightAdd = massFrac * TARGET_AVG_HEIGHT_M * PROFILE_BINS;
    const center = clamp(Math.floor(this.wagonProgressM / PROFILE_BIN_WIDTH_M), 0, PROFILE_BINS - 1);
    for (let k = 0; k < KERNEL.length; k++) {
      const bin = center + k - 2;
      if (bin >= 0 && bin < PROFILE_BINS) {
        this.activeWagon.profile[bin] += heightAdd * KERNEL[k];
      }
    }
  }

  private relaxProfile() {
    const p = this.activeWagon.profile;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < PROFILE_BINS; i++) {
        const diff = p[i] - p[i - 1];
        if (diff > MAX_SLOPE_PER_BIN) {
          const move = (diff - MAX_SLOPE_PER_BIN) / 2;
          p[i] -= move;
          p[i - 1] += move;
        } else if (diff < -MAX_SLOPE_PER_BIN) {
          const move = (-diff - MAX_SLOPE_PER_BIN) / 2;
          p[i] += move;
          p[i - 1] -= move;
        }
      }
    }
  }

  private finalizeActiveWagon() {
    this.forcedSpillArm = false;
    const w = this.activeWagon;
    w.status = "COMPLETE";
    const utilizationPct = (w.fillT / WAGON_RATED_PAYLOAD_T) * 100;
    const overloadFlag = w.fillT > WAGON_RATED_PAYLOAD_T * 1.005;
    if (overloadFlag) {
      this.raiseAlarm("OVERLOAD", "CRITICAL", `Wagon ${w.seq} net weight exceeds rated payload`, null, w.seq);
    }
    this.completed.push({
      seq: w.seq,
      uid: w.uid,
      utilizationPct,
      netT: w.fillT,
      overloadFlag,
      spillFlag: w.spillFlag,
      controlMode: this.mode,
      completedAtMs: this.simTimeMs,
    });
    if (this.completed.length > 160) this.completed.shift();

    this.totalCompletedCount += 1;
    this.totalTonnageT += w.fillT;
    if (w.spillFlag) this.totalSpillEvents += 1;
    if (overloadFlag) {
      this.totalOverloadEvents += 1;
      const humanDriven = this.mode === "MANUAL" || this.mode === "FALLBACK";
      if (humanDriven) this.manualOverloadEvents += 1;
      else this.autoOverloadEvents += 1;
    }
    this.maybeRollLot();

    this.wagonProgressM -= WAGON_HOPPER_OPENING_M + INTER_WAGON_GAP_M;
    this.activeSeq += 1;

    if (this.activeSeq > this.wagonCount) {
      this.trainSeq += 1;
      this.trainCode = `ETR-${this.trainSeq}`;
      this.wagonCount = 92 + Math.floor(this.rand() * 19);
      this.activeSeq = 1;
    }
    this.activeWagon = this.spawnWagon(this.activeSeq);
  }

  /** Rolls to a freshly-sampled stockpile lot every 8-14 wagons (display-only, see lotDensityTpm3 doc comment). */
  private maybeRollLot() {
    this.wagonsUntilLotChange -= 1;
    if (this.wagonsUntilLotChange > 0) return;
    this.lotNumber += 1;
    this.lotDensityTpm3 = clamp(gaussian(this.cosmeticRand, BULK_DENSITY_TPM3, 0.05), 1.15, 1.45);
    this.wagonsUntilLotChange = 8 + Math.floor(this.cosmeticRand() * 7);
  }

  private stepSpi() {
    const boundaryEtaS = this.boundaryEtaS();
    const humanDriven = this.mode === "MANUAL" || this.mode === "FALLBACK";
    const base = 0.001 + gaussian(this.rand, 0, 0.0008);
    let spike = 0;
    if (boundaryEtaS < 3) {
      const proximity = 1 - boundaryEtaS / 3;
      spike = proximity * (humanDriven ? 0.03 + this.rand() * 0.05 : 0.004 + this.rand() * 0.006);
    }
    const densityRisk = 0.01 * this.disturbanceFactor("density_shift");
    this.spi = clamp(base + spike + densityRisk, 0, 1);
    if (this.spi > this.maxSpiSession) this.maxSpiSession = this.spi;
    if (humanDriven) {
      if (this.spi > this.manualMaxSpiSession) this.manualMaxSpiSession = this.spi;
    } else if (this.spi > this.autoMaxSpiSession) {
      this.autoMaxSpiSession = this.spi;
    }

    if (this.spi > 0.1 && !this.spiCritLatched) {
      this.spiCritLatched = true;
      this.raiseAlarm(
        "SPI_CRITICAL",
        "CRITICAL",
        "Spill Probability Index exceeded 0.10 — controlled pause fired",
        1,
        this.activeWagon.seq,
      );
    } else if (this.spi < 0.08) this.spiCritLatched = false;

    if (this.spi > 0.02 && !this.spiHighLatched) {
      this.spiHighLatched = true;
      this.raiseAlarm(
        "SPI_HIGH",
        "HIGH",
        "Spill Probability Index exceeded 0.02 — flow curtailment engaged",
        20,
        this.activeWagon.seq,
      );
    } else if (this.spi < 0.015) this.spiHighLatched = false;
  }

  private recordHistory() {
    this.history.t.push(this.simTimeMs);
    this.history.speedActual.push(this.speedKmh);
    this.history.speedSetpoint.push(this.speedSetpointKmh);
    this.history.chuteFlow.push(this.lastDischargeT * (3600 / DT_S));
    this.history.gatePlan.push(this.beltRateActualTph);
    this.history.spi.push(this.spi);
    this.history.surgeBinLevel.push(this.surgeBinT);
  }

  private raiseAlarm(
    code: string,
    priority: AlarmPriority,
    message: string,
    timeToConsequenceS: number | null,
    wagonSeq?: number,
  ) {
    const catalog: Record<string, { cause: string; consequence: string; action: string }> = {
      SPI_CRITICAL: {
        cause: "Predicted arrival-mass timing overlaps wagon boundary within safety margin.",
        consequence: "Material may discharge into the inter-wagon gap or over the rim.",
        action: "Controlled pause is automatic (gate close + bin hold). Verify boundary camera / proceed when SPI clears.",
      },
      SPI_HIGH: {
        cause: "Spill Probability Index trending above the 0.02 curtailment threshold.",
        consequence: "Reduced fill margin at the next wagon boundary if trend continues.",
        action: "Flow curtailment is automatic. Monitor; no operator action required unless it escalates.",
      },
      SPILL_DETECTED: {
        cause: "Chute discharge occurred while no wagon opening was under the stream footprint.",
        consequence: "Sulfur on track / ballast at the inter-wagon gap.",
        action: "Dispatch track inspection at next safe window; log incident bundle.",
      },
      FREEBOARD_VIOLATION: {
        cause: "Pile crest projected or measured above rim minus freeboard band.",
        consequence: "Risk of spillage during transit / at wagon exit.",
        action: "Review fill target for this wagon class; check density estimate.",
      },
      OVERLOAD: {
        cause: "Net wagon weight exceeded 100.5% of rated payload.",
        consequence: "Non-conformance with consignment limits; potential mechanical stress.",
        action: "Flag wagon for weighbridge confirmation before departure.",
      },
      SURGE_BIN_HIGH: {
        cause: "Chute inflow rate exceeding discharge rate for a sustained period.",
        consequence: "Bin overfill risk; possible chute throat plug.",
        action: "Monitor; controller will throttle gate automatically.",
      },
    };
    const c = catalog[code] ?? { cause: "—", consequence: "—", action: "Review." };
    this.onAlarm?.({
      code,
      priority,
      message,
      cause: c.cause,
      consequence: c.consequence,
      action: c.action,
      timeToConsequenceS,
      wagonSeq,
    });
  }

  /** Model's live projection of the active wagon's terminal fill mass. */
  projection(): { finalT: number; errT: number } {
    const boundaryEtaS = this.boundaryEtaS();
    const committed = this.committedMassWithinS(boundaryEtaS);
    const finalT = this.activeWagon.fillT + committed;
    const humanDriven = this.mode === "MANUAL" || this.mode === "FALLBACK";
    return { finalT, errT: humanDriven ? 2.5 : 0.3 };
  }

  /** Past `seconds` of history, oldest -> newest, as parallel arrays. */
  getHistory(seconds: number) {
    const n = Math.min(HISTORY_CAPACITY, Math.round((seconds * 1000) / TICK_MS));
    return {
      t: this.history.t.toOrderedArray(n),
      speedActual: this.history.speedActual.toOrderedArray(n),
      speedSetpoint: this.history.speedSetpoint.toOrderedArray(n),
      chuteFlow: this.history.chuteFlow.toOrderedArray(n),
      gatePlan: this.history.gatePlan.toOrderedArray(n),
      spi: this.history.spi.toOrderedArray(n),
      surgeBinLevel: this.history.surgeBinLevel.toOrderedArray(n),
    };
  }

  private planForecastCache: { key: string; value: ReturnType<TwinLiteEngine["computePlanForecast"]> } | null = null;

  /**
   * Deterministic forward projection of the control law for `seconds` ahead —
   * the dotted "plan" line on the trend strip. Memoized per sim tick (M-2):
   * all three TrendStrip panes call this every rAF frame at the same
   * `seconds` value, which without caching reran the full 300-step forward
   * simulation 3x per tick for identical output.
   */
  getPlanForecast(seconds: number) {
    const key = `${this.simTimeMs}:${seconds}`;
    if (this.planForecastCache?.key === key) return this.planForecastCache.value;
    const value = this.computePlanForecast(seconds);
    this.planForecastCache = { key, value };
    return value;
  }

  /** Does not mutate engine state; runs a forward pass over cloned scalars + a belt-array copy. */
  private computePlanForecast(seconds: number) {
    const steps = Math.round((seconds * 1000) / TICK_MS);
    const speedPlan = new Float32Array(steps);
    const gatePlan = new Float32Array(steps);
    const spiPlan = new Float32Array(steps);

    let speedKmh = this.speedKmh;
    let wagonProgressM = this.wagonProgressM;
    let fillT = this.activeWagon.fillT;
    const belt = this.belt.slice();
    const humanDriven = this.mode === "MANUAL" || this.mode === "FALLBACK";
    const targetFillT = WAGON_RATED_PAYLOAD_T * this.targetUtilization();

    for (let s = 0; s < steps; s++) {
      const speedSetpointKmh =
        this.mode === "FALLBACK" ? 0 : humanDriven ? CREEP_SPEED_DEFAULT_KMH : CREEP_SPEED_DEFAULT_KMH;
      const curMs = speedKmh / 3.6;
      const setMs = speedSetpointKmh / 3.6;
      const maxDelta = (setMs > curMs ? ACCEL_LIMIT_MS2 : DECEL_LIMIT_MS2) * DT_S;
      const nextMs = curMs + clamp(setMs - curMs, -maxDelta, maxDelta);
      speedKmh = Math.max(0, nextMs * 3.6);
      wagonProgressM += nextMs * DT_S;

      const speedMs = Math.max(speedKmh / 3.6, 0.02);
      const boundaryEtaS = Math.max(0, WAGON_HOPPER_OPENING_M - wagonProgressM) / speedMs;
      const remaining = Math.max(0, targetFillT * AI_COMMIT_GAIN - fillT);

      // Same commit-rate law as stepGateControl's AI branch (M-2) — the plan
      // forecast only ever projects the AI/predictive path (FALLBACK holds
      // at 0; the human heuristic has no meaningful forward "plan" to draw).
      const desiredRateTph = this.mode === "FALLBACK" ? 0 : commitTargetRateTph(belt, boundaryEtaS, remaining);

      const inflowT = clamp(desiredRateTph, 0, PEAK_LOADING_RATE_TPH) * DT_H;
      const chuteInflowT = belt[BELT_CELLS - 1];
      belt.copyWithin(1, 0, BELT_CELLS - 1);
      belt[0] = inflowT;
      fillT += chuteInflowT;

      speedPlan[s] = speedKmh;
      gatePlan[s] = clamp(desiredRateTph, 0, PEAK_LOADING_RATE_TPH);
      spiPlan[s] = boundaryEtaS < 3 ? (1 - boundaryEtaS / 3) * 0.005 : 0.001;
    }
    return { speedPlan, gatePlan, spiPlan };
  }

  /**
   * Fast-forwards the engine through a scripted mode sequence using the real
   * tick() loop (same physics as live operation, nothing fabricated) so the
   * console can open with a session already ~in progress instead of every
   * KPI/alarm/wagon-table view sitting on "awaiting data" for the ~30
   * wagons / ~2h of real time a cold engine would otherwise need (demo
   * credibility audit, 2026-07-16). Deliberately NOT called from the
   * constructor — engine.test.ts constructs bare engines and depends on a
   * truly empty `completed` array; only the app singleton (singleton.ts)
   * opts in.
   */
  seedDemoSession() {
    const stages: { mode: PlatformMode; wagons: number }[] = [
      { mode: "AUTONOMOUS", wagons: 14 },
      { mode: "MANUAL", wagons: 7 }, // mid-session operator takeover — utilization dip for contrast
      { mode: "AUTONOMOUS", wagons: 31 }, // last 30 (KPI rolling window) lands entirely in this clean stretch
    ];
    for (const stage of stages) {
      this.mode = stage.mode;
      const target = this.totalCompletedCount + stage.wagons;
      let guard = 0;
      while (this.totalCompletedCount < target && guard < 2_000_000) {
        this.tick();
        guard++;
      }
    }
    this.mode = "AUTONOMOUS";
    // The seeded MANUAL stretch was a scripted demo beat, not a real fault —
    // only live post-seed FALLBACK time should ever count against the
    // availability KPI.
    this.fallbackTimeMs = 0;
  }

  /** Consist window around a wagon seq for the train canvas (uses completed cache). */
  consistWindow(centerSeq: number, radius: number) {
    const out: { seq: number; utilizationPct: number; status: "PENDING" | "FILLING" | "COMPLETE" }[] = [];
    for (let s = centerSeq - radius; s <= centerSeq + radius; s++) {
      if (s < 1 || s > this.wagonCount) continue;
      if (s === this.activeSeq) {
        out.push({ seq: s, utilizationPct: (this.activeWagon.fillT / WAGON_RATED_PAYLOAD_T) * 100, status: "FILLING" });
      } else if (s < this.activeSeq) {
        const rec = this.completed.find((c) => c.seq === s);
        out.push({ seq: s, utilizationPct: rec?.utilizationPct ?? 0, status: "COMPLETE" });
      } else {
        out.push({ seq: s, utilizationPct: 0, status: "PENDING" });
      }
    }
    return out;
  }
}

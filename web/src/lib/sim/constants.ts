// Design-basis constants — docs/01_PRD_ProAI_Sulfur_Loading.md §2.1
export const WAGON_RATED_PAYLOAD_T = 100;
export const WAGON_LENGTH_OVER_COUPLERS_M = 15.5;
export const WAGON_HOPPER_OPENING_M = 14.2;
export const INTER_WAGON_GAP_M = 1.3;
export const TRAIN_WAGON_COUNT = 110;

// NOTE: raised from the PRD's literal 2,000/1,800 t/h (docs/01 §2.1) for the
// same physical-consistency reason CREEP_SPEED_DEFAULT_KMH deviates below
// the PRD's speed envelope, below: given the transport dead time and the
// boundary-safety close-out margin the gate controller must respect to hit
// zero spills (see engine.ts THROTTLE_LEAD_S/FULL_CLOSE_LEAD_S), the belt's
// *productive* per-wagon window is well under one full transit — at the
// literal 2,000 t/h peak that window can physically deliver only ~93 t, not
// the ~99.3 t the AI target requires. Verified empirically via
// scratch/harness.ts across seeds 42/7/1234.
export const PEAK_LOADING_RATE_TPH = 2320;
export const SUSTAINED_LOADING_RATE_TPH = 2000;

export const CREEP_SPEED_MIN_KMH = 0.4;
export const CREEP_SPEED_MAX_KMH = 1.2;
// NOTE: the PRD's own design-basis figures don't fully reconcile —
// "~180s/wagon @ 2,000 t/h" implies a creep speed well below the stated
// 0.4-1.2 km/h envelope once you divide WAGON_RATED_PAYLOAD_T by
// PEAK_LOADING_RATE_TPH and back out a transit time. This illustrative
// simulator honors the mass/rate/payload figures (they drive the headline
// utilization KPI the whole product is about) over the literal speed
// range, since a speed inside 0.4-1.2 km/h makes ~99% fill physically
// unreachable in one transit at the stated peak rate.
export const CREEP_SPEED_DEFAULT_KMH = 0.24;

export const CONVEYOR_BELT_SPEED_MS = 3.2;
export const GATE_TO_CHUTE_LENGTH_M = 145;
export const TRANSPORT_DEAD_TIME_S = GATE_TO_CHUTE_LENGTH_M / CONVEYOR_BELT_SPEED_MS; // ~45.3s

export const SURGE_BIN_CAPACITY_T = 8;

export const BULK_DENSITY_TPM3 = 1.3;
export const ANGLE_OF_REPOSE_DEG = 30;

export const RIM_FREEBOARD_M = 0.15;
export const RIM_HEIGHT_M = 2.4; // illustrative hopper depth for visualization

export const PROFILE_BINS = 142;
export const PROFILE_BIN_WIDTH_M = WAGON_HOPPER_OPENING_M / PROFILE_BINS;

// Control tick — 100ms (10Hz) per FR-2.4 / NFR-01
export const TICK_MS = 100;

export const TARGET_UTILIZATION_AUTONOMOUS = 0.993; // ~99.3% typical achieved fill
export const TARGET_UTILIZATION_MANUAL = 0.965; // defensive human under-fill baseline

export const ACCEL_LIMIT_MS2 = 0.05;
export const DECEL_LIMIT_MS2 = 0.08;

// Real facility design capacity — Shah/Habshan → Ruwais sulfur rail line,
// ~22,000 t/day across the loadout (Railway Technology / Oil & Gas Middle
// East reporting on the Etihad Rail sulphur consist). Display-only
// reference figure for the "session vs. design capacity" KPI widget — not
// fed into any control-loop physics.
export const FACILITY_DESIGN_CAPACITY_T_PER_DAY = 22000;

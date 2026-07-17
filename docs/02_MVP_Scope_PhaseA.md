# Minimum Viable Product (MVP) Scope — Phase A

## ProAI Closed-Loop Sulfur Loading Optimization Platform

| Field | Value |
|---|---|
| Document ID | MVP-PROAI-SRL-002 |
| Version | 1.0 |
| Phase | Phase A — 60-day pilot on existing infrastructure |
| Parent | PRD-PROAI-SRL-001 |
| Contractual Exit Criterion | Validated ≥ +1.0 percentage-point wagon-utilization gain, zero simulated spills/overloads |

---

## 1. MVP Thesis

Prove, in 60 days, using **only existing plant infrastructure** (no new field hardware, no PLC write access), that a delay-aware predictive controller can lift wagon utilization by at least one percentage point with zero spill risk — entirely through simulation on a historian-calibrated Digital Twin, cross-checked in live read-only shadow mode.

Everything in Phase A is **read-only with respect to the process**. The riskiest Phase B elements (PLC write-back, field sensors, edge failover) are deliberately excluded so the pilot can run without HSE re-assessment of the plant.

---

## 2. In / Out Boundary

### 2.1 IN scope (Phase A, 60 days)

| # | Deliverable | Description |
|---|---|---|
| A-1 | OT data ingestion (read-only) | OPC-UA client subscribed to existing loading PLC/SCADA tags at up to 10 Hz; Modbus TCP polling fallback for devices without OPC-UA exposure; edge store-and-forward buffer |
| A-2 | Historian backfill pipeline | Batch extraction of ≥ 12 months (minimum acceptable: 3 months) of loading-circuit history: belt weigher totals/rates, gate positions, train speed, per-wagon weights (weighbridge records), event & alarm logs, shift logs |
| A-3 | Canonical tag dictionary v1 | Versioned mapping of raw PLC tags → `slo.*` namespace with units, ranges, quality rules |
| A-4 | **Digital Twin v1** (Python) | Physics + transport-delay simulator of silo gate → conveyor → surge bin → chute → wagon circuit + train kinematics (spec in §4) |
| A-5 | Twin calibration & validation harness | Automated replay of historian windows through the twin; mass-balance and timing error reports |
| A-6 | Baseline characterization study | Statistical profile of current manual performance: utilization distribution, operator gate behavior around wagon boundaries, spill/overload incident reconstruction |
| A-7 | Optimizer v1 | Delay-embedded MPC (10 Hz) with hard constraint set; optional RL policy trained in twin with action masking (stretch, see §7) |
| A-8 | Shadow-mode advisory runner | Optimizer runs against **live** read-only data during real loadings; computed commands recorded and compared to operator actions; nothing is written to the plant |
| A-9 | Pilot dashboard (advisory) | Read-only web dashboard: live circuit state, twin-vs-actual divergence, per-wagon predicted vs. actual fill, baseline-vs-optimized KPI view |
| A-10 | Success verification report | Statistical proof pack per §6, reviewed with client — the Phase A exit gate |
| A-11 | Security baseline | Deployment inside plant L3 with 62443 zone/conduit design implemented for the read path; RBAC; audit logging layers 1, 3, 4 |
| A-12 | Phase B readiness dossier | Instrument datasheet selections (WIM, LiDAR, radar, RFID, cameras with Ex certs), PLC command-validator functional design, HAZOP/CHAZOP input pack |

### 2.2 OUT of scope (deferred to Phase B)

- Any write to PLC/DCS or locomotive control (no `AUTONOMOUS`, no `SHADOW`-with-write).
- New field instrumentation installation (WIM, LiDAR, radar, RFID, ATEX cameras).
- Redundant edge cluster / stateful failover.
- Hardware-in-the-loop rig, manual-override hardware button, alarm rationalization workshop.
- 99.99% availability engineering (pilot target: 99.0% best-effort).
- Legal-metrology (OIML) integration, SIEM integration beyond log forwarding.

### 2.3 Plant-side prerequisites (client responsibility, Week 0–1)

1. Read-only OPC-UA endpoint (or SCADA gateway) exposing the agreed tag list; firewall rule from ProAI edge node (L3) to that endpoint only.
2. Historian export access or supervised bulk extract.
3. One cabinet position, dual 230 VAC feeds, and two switch ports in the L3 control network for the pilot edge server.
4. Weighbridge / consignment records for per-wagon net weights (ground truth).
5. Nominated SCO and RLE as pilot counterparts (≈ 4 h/week).

---

## 3. MVP Architecture (Phase A only)

```
 Existing PLC/SCADA ──OPC-UA (read-only, cert-auth)──► Edge Pilot Server (single node, plant L3)
 Existing Historian ──batch export──────────────────►   ├─ ingest service (asyncua / pymodbus)
                                                        ├─ TimescaleDB (pilot instance)
                                                        ├─ Digital Twin runtime (offline + shadow)
                                                        ├─ Optimizer v1 (MPC, 10 Hz sim-time)
                                                        ├─ FastAPI + WebSocket backend
                                                        └─ Advisory dashboard (Next.js, control-room browser)
```

Single industrial server (e.g., 16-core Xeon-D fanless IPC, 128 GB ECC RAM, 2× NVMe RAID-1, dual PSU). No process write path exists — physically enforced by firewall policy (deny all toward L2 except the one OPC-UA read session) and by the PLC exposing no writable tags to this session.

---

## 4. Digital Twin v1 — Simulator Specification

### 4.1 Purpose and fidelity target

A **deterministic, discrete-time physics simulator** (Δt = 100 ms base step; sub-stepped integrators where needed) of the loading circuit, accurate enough that: (a) 30-day historian replays close the per-wagon mass balance within **≤ 1%**, and (b) event timing (gate action → chute flow response) matches recorded data within **± 2 s**.

Implementation: Python 3.12, NumPy/SciPy vectorized core; JAX optional for differentiable variants used in controller tuning; Gymnasium-compatible environment wrapper for RL; strict separation of `PlantModel` (physics) / `SensorModel` (noise, quantization, lag) / `ActuatorModel` (slew, deadband, backlash) / `Scenario` (traffic, disturbances).

### 4.2 Component models

**(a) Silo/reclaim gate → belt feed**

Mass flow through the gate as a function of gate opening `u_g ∈ [0,1]`:

```
ṁ_gate(t) = C_d · ρ_b · A(u_g) · √(g · D_h(u_g))      (Beverloo-class orifice law, calibrated)
```

- `ρ_b` bulk density ~ TruncatedNormal(1.30, 0.05², [1.20, 1.40]) t/m³, resampled per stockpile lot.
- Gate actuator: first-order lag τ = 1.8 s + slew limit (full stroke ≥ 12 s) + 0.5% deadband.
- Calibration: fit `C_d·A(·)` spline to historian (gate position vs. belt-weigher rate, delay-shifted).

**(b) Conveyor transport (the dominant dynamic)**

Belt modeled as a 1-D advected mass field, discretized into cells of `Δx = v_belt · Δt` (0.32 m at 3.2 m/s):

```
m_i(t+Δt) = m_{i-1}(t)          for i = 1..N,  N = L/Δx ≈ 453 cells
m_0(t+Δt) = ṁ_gate(t) · Δt
ṁ_chute_in(t) = m_N(t) / Δt
```

giving an exact pure transport delay `θ = L / v_belt ≈ 45.3 s`, plus: belt-speed variation input (VFD setpoint ± measured slip), material spread diffusion (small Gaussian kernel per step, calibrated), and belt-weigher sensor model at cell `i_w = 12 m/Δx ≈ 38` (0.5% accuracy class noise + 300 ms filter).

**(c) Surge bin & chute**

```
dM_bin/dt = ṁ_chute_in(t) − ṁ_disch(t)
ṁ_disch(t) = u_c(t) · ṁ_disch,max · f(M_bin)      u_c ∈ [0,1] chute gate
```

- `M_bin ∈ [0, 8 t]`; `f(M_bin)` starvation curve below 0.5 t; overfill of the bin (> 7.5 t) raises a simulated high-level alarm (mirrors radar sensor in Phase B).
- Chute gate: 0.8 s open/close stroke, discrete or proportional per plant as-built.
- Discharge stream fall time to wagon floor/pile: `t_fall = √(2h/g)` (~0.9–1.3 s, height-dependent) — included in spill-window logic.

**(d) Wagon fill & pile geometry**

Per-wagon 1-D longitudinal fill profile `h(x,t)` on a 0.1 m grid over the 14.2 m opening:

- Deposition kernel centered under chute (width from stream spread), advected by relative train motion.
- Slope relaxation: after each deposit, enforce `|∂h/∂x| ≤ tan(φ_repose)` by local avalanche redistribution (cellular sandpile relaxation, φ = 30° design, sampled 27–32°).
- Fill mass `m_w(t) = ρ_b ∫ A_cross(h(x,t)) dx`; overload event if `m_w > 1.005 · 100 t`; **spill event** if deposition occurs while no wagon opening is under the stream footprint, or if `h(x)` exceeds rim minus freeboard (0.15 m) anywhere.

**(e) Train kinematics & inertia**

Longitudinal dynamics of the consist during loading creep:

```
M_train · dv/dt = F_traction(u_v, v) − F_resist(v) − F_grade
```

- `M_train` up to 13,200 t (grows as wagons fill — mass added per step from deposition).
- Creep-control response modeled as commanded-speed tracking with: response lag τ_v = 3.5 s, accel limit 0.05 m/s², decel limit 0.08 m/s², jerk limit 0.03 m/s³, speed quantization of the creep controller (as-built), ± 2% wheel-encoder noise.
- Wagon boundary positions derived from consist geometry (15.5 m pitch, 1.3 m no-fill window) + measured stretch/slack ± 0.15 m stochastic offset per coupler (models slack run-in/out).

**(f) Disturbance & scenario library (minimum set)**

| Scenario | Injection |
|---|---|
| Density shift | ρ_b step/lot change ± 7% |
| Gate wear | C_d drift −5% over run |
| Belt slip | v_belt −3% transient, 30 s |
| Feed surge | Reclaimer surge +10% for 60 s |
| Creep hunting | Speed oscillation ± 0.05 km/h, 20 s period |
| Boundary slack event | Sudden 0.3 m boundary shift (coupler slack) |
| Sensor dropouts | Belt-weigher stale 2–10 s; encoder spikes |
| Operator baseline | Replayed real operator command traces (for A/B comparison) |

### 4.3 Calibration protocol

1. **System identification pass:** cross-correlate gate position ↔ belt-weigher rate to fit actual transport delay and gate response; fit train-speed response from setpoint/actual traces.
2. **Replay validation:** feed 30 days of recorded *inputs* (operator commands) into the twin; compare simulated vs. recorded belt-weigher integral per wagon and per-train totals. Acceptance: per-wagon closure ≤ 1% (p95), per-train ≤ 0.3%.
3. **Timing validation:** predicted vs. actual chute-flow response edges within ± 2 s (p95).
4. Freeze `TwinCalibration v1.0` (versioned parameter file, signed) — all Phase A optimization results must cite the frozen calibration.

---

## 5. Optimizer v1 Scope

- Delay-embedded MPC, 10 Hz, horizon 30 s (300 steps), condensed QP via OSQP/acados-generated solver; decision variables: gate opening rate, train speed increment, chute gate state.
- Hard constraints exactly as PRD FR-2.4; soft objective: maximize terminal wagon mass − penalty on actuator movement (equipment wear) − penalty on train speed deviation from plan.
- State from twin (offline) or from live-telemetry estimator (shadow). Same code path both ways — the twin is behind the same interface as the plant (`PlantIO` abstraction), which is what makes Phase B integration a swap, not a rewrite.
- **Explicit human-vs-AI mechanism being exploited:** the operator reacts to what they *see arriving* (already 45 s too late to change) and buffers safety margin by under-filling; the MPC shapes the gate **one transport delay ahead** of each wagon boundary and lands the fill target with ≤ 0.5 t predicted terminal error, so the safety margin shrinks from ~3–4 t to < 1 t without increasing spill probability.

---

## 6. Success Verification — Mathematical Criteria (Phase A Exit Gate G-A2)

### 6.1 Definitions

For wagon *i*: utilization `U_i = W_net,i / W_rated` with `W_rated = 100 t`.
Baseline set **B**: ≥ 500 real wagons from historian (manual operation), stratified by product lot, loading rate regime, and shift.
Optimized set **O**: ≥ 500 simulated wagons produced by Optimizer v1 in the frozen twin, driven by the **same recorded disturbance traces** (paired scenario replay — each baseline wagon has a matched optimized counterpart under identical material/traffic conditions).

### 6.2 Primary criterion (contractual)

Let `D_i = U_i^O − U_i^B` for matched pairs. Requirement:

```
(1)  ΔŪ = mean(D_i) ≥ 1.0 percentage point
(2)  One-sided paired test: H₀: ΔU ≤ 0.5 pp  vs  H₁: ΔU > 0.5 pp
     rejected at α = 0.05 (paired t-test; Wilcoxon signed-rank as
     distribution-free confirmation), n ≥ 500 pairs
(3)  95% CI lower bound of ΔŪ ≥ 0.75 pp
```

(The H₀ margin of 0.5 pp guards against declaring success on a statistically-significant-but-trivial gain.)

### 6.3 Safety side-conditions (all mandatory, zero tolerance)

```
(4)  Simulated spill events in O:        0  (vs. reconstructed baseline incidents reported for context)
(5)  Simulated overloads (>100.5%) in O: 0
(6)  P(U_i^O > 100.5%) estimated by 10,000-run Monte-Carlo over the
     disturbance library ≤ 1×10⁻⁴ per wagon
(7)  SPI never exceeded 0.02 in any optimized run
```

### 6.4 Model-credibility conditions (guards against "winning in a wrong twin")

```
(8)  Twin calibration acceptance held (mass closure ≤1% p95) on a
     VALIDATION month never used for calibration or training
(9)  Shadow-mode check on ≥ 3 live trains: twin's predicted per-wagon
     fill under recorded operator commands within ±1 t (p95) of actual
(10) Sensitivity: ΔŪ ≥ 0.8 pp retained when ρ_b, θ (delay), and creep
     lag are each perturbed ±10% from calibrated values
```

### 6.5 Business translation (reported, not gated)

At 11,000 t/train nominal: +1 pp ≈ +110 t/train ≈ one full train saved per ~91 trains at constant tonnage; at ~99% (Phase B) ≈ +2.5 pp ≈ one train saved per ~40.

---

## 7. Stretch Goals (only if Gates A-1..A-2 tracking green by Day 40)

- RL policy (SAC/PPO with action masking) trained on 10⁶+ twin episodes; report any uplift over pure MPC (expected +0.1–0.3 pp from boundary-timing finesse).
- Bayesian per-lot density estimator warm-start.
- Operator "ghost cursor" UI: show what the AI *would have done* overlaid on live operator actions (powerful trust-builder for Phase B change management).

---

## 8. 60-Day Pilot Timeline (summary — full roadmap in Document 06)

| Days | Milestone |
|---|---|
| 1–7 | Kickoff, tag list agreed, edge server installed, OPC-UA read session live, historian extract started |
| 8–21 | Ingestion hardened; tag dictionary v1; baseline characterization study; twin components (a)–(e) coded |
| 22–30 | Twin calibration + replay validation → **Gate G-A1** |
| 31–45 | Optimizer v1 tuned; paired scenario replays; Monte-Carlo safety runs; shadow mode live on real loadings |
| 46–55 | Full statistical campaign (§6); sensitivity analysis; advisory dashboard polished |
| 56–60 | Success verification report; Phase B readiness dossier; client gate review → **Gate G-A2** |

## 9. MVP Risks Specific to Phase A

| Risk | Likelihood | Mitigation |
|---|---|---|
| Historian coverage < 3 months or missing per-wagon weights | M | Day-3 data audit is the first task; if gaps, extend baseline capture window using live shadow logging weeks 1–6 and reduce n with pre-agreed fallback statistics plan |
| PLC tags not exposed at 10 Hz | M | Control-critical set reduced to ≥ 2 Hz with interpolation study proving sufficiency for twin calibration (control-loop latency claims deferred to Phase B hardware) |
| Operator behavior not reconstructable (no command logging) | L | Instrument SCADA client screens capture during pilot; derive commands from actuator feedback tags |
| Twin can't close 1% mass balance | L | Escalation path: per-subsystem residual analysis; add moisture/temperature covariates; re-scope gate to 1.5% with client sign-off and matching widening of criterion (3) |

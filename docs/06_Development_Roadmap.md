# Development Roadmap

## ProAI Closed-Loop Sulfur Loading Optimization Platform

| Field | Value |
|---|---|
| Document ID | RDM-PROAI-SRL-006 |
| Version | 1.0 |
| Parent | PRD-PROAI-SRL-001 |
| Horizon | 16 weeks core delivery (Phase A: W1–8 ≈ 60-day pilot; Phase B: W9–16) + 4-week hypercare |

---

## 1. Team Shape (assumed for this plan)

| Role | FTE | Phase |
|---|---|---|
| Project/Delivery lead | 1 | A+B |
| Control/optimization engineer (MPC/estimation) | 2 | A+B |
| ML engineer (twin, RL, data) | 2 | A+B |
| OT integration engineer (OPC-UA/PLC, with plant C&I) | 1 → 2 | A → B |
| Backend engineer (FastAPI/Kafka/Timescale) | 1 | A+B |
| Frontend engineer (Next.js HMI) | 1 | A+B |
| OT security engineer | 0.5 → 1 | A → B |
| Field/instrumentation lead (+ certified Ex installers, subcontract) | — → 1+crew | B |
| Plant-side: C&I engineer, SCO champion, HSE, CAO | part-time | A+B |

---

## 2. Phase A — Weeks 1–8 (60-day MVP pilot; read-only)

### Week 1 — Mobilization & Data Audit
- Kickoff; confirm design-basis table (PRD §2.1) against as-built documents.
- **Day-3 data audit** (gating): historian coverage, per-wagon weight records, tag availability/rates. Output: Data Audit Report + agreed canonical tag list v0.
- Install pilot edge server in L3 rack; firewall change request (read-only OPC-UA conduit); OT PKI certs issued.
- Repo/CI bootstrap: monorepo, twin regression harness skeleton, signed-artifact pipeline.
- **Exit:** OPC-UA read session live against real PLC; first tags flowing to TimescaleDB.

### Week 2 — Ingestion Hardened + Historian Backfill
- Full tag dictionary v1 loaded (`slo_core.tag`); quality-stamping rules active (range/ROC/stale/cross-check).
- Store-and-forward buffer proven by induced link-cut test (24 h replay, zero gap).
- Historian bulk extraction complete (target ≥ 12 months); loaded and unit-normalized.
- Baseline characterization started: utilization distribution by lot/shift/rate; operator gate-behavior traces around wagon boundaries.
- **Exit:** live + historical data queryable in one schema; baseline study draft.

### Weeks 3–4 — Digital Twin v1 Build
- Implement component models (MVP §4.2 a–f): gate law, advected-belt transport delay, surge bin/chute, pile deposition + angle-of-repose relaxation, train longitudinal dynamics, sensor/actuator models, disturbance library.
- System identification: fit transport delay, gate response, creep-control lag from historian cross-correlation.
- Gymnasium wrapper + scenario runner (parallelized, ≥ 1,000× real-time on batch runs).
- **Exit W4 = Gate G-A1 (Day 30):** 30-day replay closes per-wagon mass balance ≤ 1% (p95); timing edges ± 2 s (p95); `TwinCalibration v1.0` frozen and signed. Latency prototype: estimator+MPC solve ≤ 65 ms on target edge hardware.

### Weeks 5–6 — Optimizer v1 + Shadow Mode
- Delay-embedded MPC on the frozen twin: constraint set encoded from PRD FR-2.4; solver code-gen (acados/OSQP); warm-start + degradation handling (TIMEOUT → hold-safe-ramp).
- SPI estimator implemented (arrival-mass vs. boundary-timing joint distribution).
- Paired scenario replays begin (baseline operator traces vs. optimizer, identical disturbances).
- **Shadow mode live** on real loadings: same code path via `PlantIO` abstraction; computed commands logged, never sent; twin-divergence tracking on.
- Advisory dashboard v1 (S-01 subset: canvas, trends, predicted fill) in control room.
- Stretch (if green): RL policy training farm on twin; action-mask property tests in CI.
- **Exit:** optimizer beats baseline in twin on pilot scenario set; ≥ 3 live trains shadowed with per-wagon prediction error within MVP §6 condition (9).

### Week 7 — Statistical Campaign
- Full 500+ paired-wagon campaign (MVP §6.2); Monte-Carlo safety runs (10,000 episodes, condition 6); sensitivity sweeps (condition 10); validation-month holdout check (condition 8).
- Freeze results; independent internal review (someone who didn't build it re-runs the pack from raw data).
- **Exit:** criteria (1)–(10) evaluated, report drafted.

### Week 8 — Phase A Gate
- Success Verification Report + live demo (twin + shadow dashboard) to client.
- Phase B readiness dossier: instrument datasheets w/ Ex certs, cable/mounting drawings input, PLC command-validator functional design spec (FDS), HAZOP/CHAZOP input pack, updated Phase B plan & long-lead procurement list (WIM and LiDAR are long-lead — **purchase orders should be released ~W5 upon early trend evidence**, flagged as a commercial decision).
- **Exit = Gate G-A2 (Day 60):** ≥ +1.0 pp proven per MVP §6; client sign-off to proceed.

---

## 3. Phase B — Weeks 9–16 (closed loop)

> Field installation runs on the plant's outage/possession calendar; the plan below assumes two agreed track possessions (W10, W12). Slippage here shifts, not compresses, commissioning.

### Week 9 — Detailed Design & HIL Rig Up
- HAZOP/CHAZOP sessions with plant (AI-command failure modes on the study table).
- PLC command validator FDS → code (plant C&I + our OT engineer); HIL rig assembled: plant-model PLC + twin as plant surrogate.
- Redundant production cluster (EDGE-A/B, EDGE-GPU, DB-A/B) staged and burned in at lab; PREEMPT_RT loop soak: 72 h, p99 < 100 ms, jitter < 5 ms.
- Security detailed design review with CAO (zones/conduits, SL3 write conduit controls).

### Week 10 — Field Installation Window #1 (possession)
- WIM scale civil/track work + scale controller; trackside cabinets, power, fiber.
- RFID AEI readers; environmental sensors; network drops (L2/L3 VLANs, PTP grandmaster).
- Parallel (lab): validator FAT on HIL — range/rate clamps, TTL, sequence, watchdog-expiry-to-LOCAL each proven with induced faults; report signed.

### Week 11 — Field Installation Window #2 prep + Integration
- LiDAR frames, radar transmitters, ATEX cameras installed at chute area (hot-work permits, Ex inspection sign-offs per IEC 60079-14).
- Production cluster installed in L3; data migration from pilot node; live telemetry cutover.
- WIM calibration runs (test train / known weights); OIML verification if custody-relevant.
- LiDAR extrinsic calibration (empty-wagon reference profiles); volumetric vs. WIM density cross-check begins.

### Week 12 — Closed-Loop on HIL + Site SAT (no process write yet)
- End-to-end on HIL: full AUTONOMOUS episodes against twin-as-plant through the **real** PLC validator; failover drills (edge A→B ≤ 2 s), watchdog drills (400 ms → LOCAL ≤ 1 s), TAKE MANUAL ≤ 500 ms across 10/10 trials with HW button.
- Site acceptance of instruments: sensor quality dashboards green ≥ 5 consecutive loadings.
- Alarm rationalization workshop (IEC 62682): every new alarm gets cause/consequence/action/priority; console S-01/S-02/S-03 finalized with SCO champion.
- Operator training block 1 (simulator-driven: twin behind the real UI).

### Week 13 — Shadow-With-Write-Path (armed, not applied)
- Write conduit enabled to a **PLC sandbox partition**: commands traverse the full SL3 conduit and validator but drive only shadow registers. Proves the entire production write path under real traffic.
- Model retrained on Phase B sensor data (LiDAR profiles sharpen the deposition model; WIM closes the loop on density estimation).
- Security: pen-test round 1 on the complete system; findings triage.
- **Exit = Gate G-B1:** ≥ 10 trains full-shadow; zero would-be constraint violations; fill prediction ≤ 0.5 t p95; conduit packet captures reviewed by CAO.

### Week 14 — Supervised Closed-Loop Commissioning (graduated authority)
- Day 1–2: AUTONOMOUS on **feed rate only** (train speed manual) — 2 trains.
- Day 3–4: + train speed within ±25% authority clamp — 2 trains.
- Day 5: full authority envelope — SCO at console, RLE present, abort drills daily.
- Each step gated by: zero envelope clips of unexpected type, SPI < 0.02 throughout, utilization trending ≥ 98.5%.

### Week 15 — Production Validation Run
- ≥ 20 consecutive trains AUTONOMOUS (Gate G-B2 evidence window): mean utilization ≥ 99.0%, zero spills/overloads, availability ≥ 99.9%, takeover drill 10/10 ≤ 500 ms.
- Per-train auto-reports live to Operations; DMZ replication + BI feeds verified.
- Pen-test round 2 (regression on fixes) → **Gate G-B3** security acceptance.

### Week 16 — Handover
- Gate G-B2/G-B3 formal review; punch list; as-built documentation set (this doc suite updated to as-built), runbooks (fallback recovery, model deployment, cert rotation, backup restore).
- Operator training block 2 + assessment; CAO audit-pack walkthrough (hash-chain verification demo).
- Transition to 4-week hypercare (daily model-performance review, weekly KPI review), then managed-service SLA.

---

## 4. Milestone Summary

| Week | Gate | Evidence |
|---|---|---|
| W4 | **G-A1** Twin validated | Mass-balance ≤ 1% p95 on replay; latency prototype |
| W8 | **G-A2** ≥ +1 pp proven | Statistical pack per MVP §6; client sign-off |
| W13 | **G-B1** Shadow exit | 10 trains, zero would-be violations, ≤ 0.5 t p95 |
| W15/16 | **G-B2** Production | 20 trains ≥ 99.0% mean, zero spills/overloads |
| W15/16 | **G-B3** Security | Pen-test accepted, SL2/SL3 conformance |

---

## 5. Risk Mitigation Matrix (with automated fail-safe responses)

Severity: C = safety/production critical, H = high, M = medium. Every automated response ends in a state the plant can run from manually.

| # | Risk | Sev | Likelihood | Preventive Design | **Automated Fail-Safe Response (runtime)** |
|---|---|---|---|---|---|
| R1 | Telemetry packet loss / network partition L2↔L3 | C | M | Redundant switches, PTP + store-and-forward, conduit monitoring | Control-critical staleness > 300 ms → hold last safe ramp; > 500 ms → `FALLBACK` (PLC LOCAL) ≤ 1 s; edge buffers backfill historian on recovery — no data gap |
| R2 | Erratic/drifting sensor (belt weigher, encoder, LiDAR blinded by dust) | C | H | Per-signal validation (range/ROC/stale), cross-sensor consistency (belt-integral vs WIM, LiDAR-volume×density vs weight), redundant speed sensing (radar + laser) | Signal quality ≠ GOOD → excluded from estimator, estimator covariance inflates; if a control-critical signal has no healthy redundancy > 500 ms → `FALLBACK`; single-sensor degraded mode only for non-critical signals with SPI threshold tightened to 0.01 |
| R3 | Conveyor stall / chute plug | C | M | Radar plug detection at chute throat, motor-current signature monitor, surge-bin trajectory anomaly detector | Detected stall → gate-close command + feed-stop request in same tick, train speed hold; SPI forced to 1.0 (latched CRITICAL alarm); mechanical trip remains plant interlock — platform response is *earlier warning + upstream starvation*, not the protection layer |
| R4 | MPC solver timeout / infeasible | H | M | Warm-start, horizon shortening ladder (30→10→5 s), watchdog on solve time | TIMEOUT tick → apply previous validated ramp (1 tick grace); 3 consecutive → `FALLBACK`; INFEASIBLE → constraint-priority relaxation of *comfort* terms only (never safety terms), else `FALLBACK` |
| R5 | Model degradation / material drift outside training envelope | H | M | Shadow-twin divergence monitor always-on; per-lot density re-estimation; validation-month holdout discipline | Divergence > band → block `AUTONOMOUS` entry / demote to `ADVISORY` at next wagon boundary (never mid-wagon); alarm to RLE with drift diagnosis |
| R6 | PLC rejects commands (validator clip storm) | H | L | HIL FAT of validator; envelope kept strictly inside validator clamps (platform is always the tighter constraint) | Any rejection → HIGH alarm + auto-audit bundle; > 3 rejections/min → self-demote to `ADVISORY` (a healthy platform should never be clipped by the PLC) |
| R7 | Edge node failure | C | M | Redundant pair, stateful failover ≤ 2 s, watchdog independent of orchestrator | Failover succeeds → seamless (PLC sees ≤ 2 missed beats tolerance window sized accordingly); fails → PLC watchdog `FALLBACK` ≤ 1 s |
| R8 | Train creep control behaves off-model (slack run-in, adhesion loss) | H | M | Conservative jerk/accel envelope, boundary-slack disturbance in twin training, speed-tracking-error monitor | Speed tracking error > band → speed authority frozen (feed-only optimization continues), MEDIUM alarm; persistent → `ADVISORY` |
| R9 | Cyber event (cert anomaly, conduit DPI alert, integrity failure) | C | L | SL3 conduit controls, signed artifacts, SIEM detection | Confirmed indicator → immediate self-demotion to `MONITOR` (write session closed from platform side; PLC continues LOCAL); never a process trip decision by the platform |
| R10 | Spill near-miss in production (SPI excursion) | C | L | Zero-spill constraint with 99.9% confidence margin; boundary choreography validated over ≥ 10⁶ twin boundaries | SPI > 0.02 → flow curtailment (automatic, logged); > 0.10 → controlled pause (gate close, bin hold, train hold) + CRITICAL alarm; auto-generated incident bundle; `AUTONOMOUS` re-entry requires RLE review |
| R11 | WIM/LiDAR long-lead delivery slip | H | M | PO release ~W5 (commercial decision), alternates pre-qualified (nucleonic level as radar alternate, 2nd LiDAR vendor) | n/a (schedule risk) — fallback plan: commission feed-only closed loop on existing belt weighers (caps target at ~98%) while instruments arrive |
| R12 | Historian data too thin for twin calibration (Phase A) | H | M | Day-3 data audit gate; shadow-logging supplement | n/a — pre-agreed fallback statistics plan (MVP §9) |
| R13 | Operator trust / adoption failure | H | M | Ghost-cursor advisory phase, SCO champion embedded from W1, visible plan overlays ("AI acts 45 s ahead"), takeover always instant | n/a — change-management: no train runs AUTONOMOUS without the shift's SCO having simulator hours signed off |
| R14 | Track possession slippage (W10/W12) | M | H | Two possessions booked + one contingency; prefabricated cabinets/frames; all civils surveyed W9 | n/a — roadmap rule: commissioning gates shift 1:1, shadow/software workstreams continue decoupled |

---

## 6. Standing Engineering Disciplines (whole programme)

- **Twin-first rule:** no behavior reaches the plant that hasn't run ≥ 10⁴ boundary events in the twin, including its failure drills.
- **CI regression:** every merge re-runs the Gate A-2 statistical pack (reduced N) + action-mask property tests + loop-latency benchmark on representative hardware; red = no deploy.
- **Change control:** Control Core & constraint set = dual approval + non-loading-window activation; models = signed, registry-tracked, `MONITOR`-soak ≥ 48 h before eligibility.
- **Weekly KPI review** with plant (utilization, SPI excursions, override reasons, availability) from W6 onward — the same numbers that feed Gates G-A2/G-B2, so gate reviews contain no surprises.

# Product Requirement Document (PRD)

## ProAI Closed-Loop Sulfur Loading Optimization Platform

| Field | Value |
|---|---|
| Document ID | PRD-PROAI-SRL-001 |
| Version | 1.0 |
| Status | Baseline for Engineering Review |
| Author | Protocol Automation Technologies FZCO — Systems Engineering |
| Product Name | ProAI Closed-Loop Sulfur Loading Optimization Platform ("ProAI-SLO") |
| Reference | 008_MG_proAI_GCG ADNOC Summary 2026-27 |
| Applicable Standards | IEC 62443, IEC 61511, IEC 60079 (ATEX/IECEx), IEC 60204-1, ISO 13850, ISA-101, IEC 62682, OIML R106, NFPA 652/654 |

---

## 1. Executive Summary

ProAI-SLO is an AI-driven, closed-loop supervisory optimization platform that autonomously coordinates **train creep speed**, **conveyor feed rate**, and **loading chute discharge** during granulated sulfur rail-car loading, raising wagon payload utilization from the current 96–97% to **≥ 99%** with **zero spill events**, while remaining strictly subordinate to the plant's existing Safety Instrumented System (SIS) and hardwired emergency stop chain.

The platform is delivered in two phases:

- **Phase A (60-day MVP):** Read-only integration with existing SCADA/PLC infrastructure, a high-fidelity Digital Twin of the loading circuit, and offline/shadow-mode optimization proving a **≥ 1% absolute utilization gain** against historical baseline.
- **Phase B (Closed Loop):** Field instrumentation (weigh-in-motion scales, 3D LiDAR profilers, radar chute level, ATEX cameras), edge AI inference, and supervised autonomous write-back to the PLC/DCS, targeting **~99% utilization** in production.

### 1.1 Why the current manual process caps at 96–97%

Loading at up to **2,000 t/h** means material worth ~55 kg arrives at the chute **every 100 ms**. A human operator:

1. Has an irreducible **perception–decision–action latency of 1–2 s** (during which up to ~1.1 t of sulfur is committed to the chute).
2. Cannot mentally compensate for the **conveyor transport delay** (~45 s from silo gate to chute at 3.2 m/s over ~145 m): material released *now* lands in the wagon that will be under the chute *45 seconds from now*.
3. Cannot simultaneously track belt-weigher mass flow, train encoder speed, wagon boundary approach, and pile geometry.
4. Therefore adopts **defensive under-filling**: the gate is throttled back early before each wagon boundary and the target fill is set to ~96–97% so that worst-case timing error never produces a spill onto the track or inter-wagon gap.

### 1.2 Why the AI closes the gap

ProAI-SLO runs a **Model Predictive Control (MPC) loop at 10 Hz (100 ms update)** with an explicit transport-delay model (Smith-predictor structure) and a learned material-flow response model. Every 100 ms it re-solves a constrained optimization over a 30-second horizon: it knows exactly what mass is already "in flight" on the belt, when it will arrive, where the wagon boundary will be at that instant given train momentum and traction limits, and shapes the gate command **45 seconds ahead of the physical event**. A Reinforcement-Learning policy (with hard action masking against the constraint set) refines the MPC targets from accumulated operational data. Humans react; the platform pre-acts.

---

## 2. Background and Operating Context

### 2.1 Physical plant (design basis)

| Parameter | Design Value | Notes |
|---|---|---|
| Material | Granulated (formed) sulfur | Free-flowing granules 2–6 mm |
| Bulk density | 1.20–1.40 t/m³ (design 1.30 t/m³) | Varies with granule size distribution and moisture |
| Angle of repose | 27–32° (design 30°) | Governs pile crest geometry and longitudinal fill profile |
| Peak loading rate | 2,000 t/h | ≈ 555 kg/s ≈ 55.5 kg per 100 ms control tick |
| Sustained loading rate | 1,800 t/h | Thermal/mechanical conveyor limit |
| Wagon payload (rated) | 100 t net | Open-top hopper wagons, Etihad Rail sulfur service class |
| Wagon length over couplers | 15.5 m | Hopper opening ≈ 14.2 m |
| Inter-wagon gap (no-fill zone) | ≈ 1.3 m | Spill-critical window |
| Train consist | Up to 110 wagons + 2 locomotives | Trailing gross mass ≈ 13,200 t loaded |
| Loading creep speed | 0.4–1.2 km/h (0.11–0.33 m/s) | Locomotive creep control / loadout traverse |
| Time per wagon @ 2,000 t/h | ≈ 180 s | Boundary transition window 4–12 s at creep speed |
| Conveyor belt speed | 3.2 m/s | Silo discharge gate → loading chute |
| Gate-to-chute belt length | ≈ 145 m | **Transport dead time ≈ 45 s** |
| Belt weigher position | 12 m downstream of gate | Mass-flow measurement lag ≈ 3.75 s after gate action |
| Chute surge bin capacity | ≈ 8 t live | Buffers gate-to-chute mismatch, radar-monitored |

> All values above are the **design basis** for modeling and shall be confirmed against as-built plant data during Phase A Week 1 (Data Audit). Every downstream model constant is parameterized, not hard-coded.

### 2.2 Hazardous-area classification (governing constraint)

Granulated sulfur handling generates **combustible sulfur dust**, one of the most ignition-sensitive industrial dusts:

| Property | Value (literature, to be confirmed by site DHA) |
|---|---|
| Minimum Ignition Energy (MIE) | ~1–5 mJ (extremely low; static discharge can ignite) |
| Kst (deflagration index) | ~150 bar·m/s (St 1) |
| Minimum Explosible Concentration | ~30 g/m³ |
| Ignition temperature, dust cloud | ~190 °C |
| Ignition temperature, dust layer (5 mm) | ~220 °C |
| Corrosivity | Sulfur + moisture → sulfurous acid; H₂S traces possible in enclosed volumes |

**Consequences for this product:**

- Loading zone interior surfaces: **ATEX Zone 21** (Class II Div 1 equivalent); surrounding areas Zone 22.
- All field instrumentation, cameras, and edge compute in classified zones must carry **ATEX / IECEx certification for Group IIIB/IIIC dust** with maximum surface temperature **T ≤ 125 °C** (satisfies 2/3 × cloud MIT and layer MIT − 75 K rules), typical marking `Ex tb IIIC T125°C Db IP6X` or pressurized `Ex pzc` enclosures with purge interlocks per IEC 60079-2.
- Enclosures IP66 minimum, 316L stainless or coated marine-grade aluminum (corrosion).
- Electrostatic control: all sensor mounts and enclosures bonded/earthed; no isolated conductive parts; antistatic camera windows.
- **The AI platform has no role in explosion protection.** Dust suppression, venting, suppression systems, and gas detection remain hardwired SIS/F&G scope, outside this product.

### 2.3 Systems the platform touches

| System | Interface | Direction | Phase |
|---|---|---|---|
| Loading PLC / DCS (conveyor, gates, chute) | OPC-UA (primary), Modbus TCP (fallback) | Read (A), Read + supervised setpoint write (B) | A/B |
| Locomotive / trackmobile creep control | Hardwired 4–20 mA setpoint + digital enable via loading PLC, or radio remote-control gateway | Read (A), supervised setpoint write (B) | A/B |
| Plant historian (PI / equivalent) | OPC-UA HDA / vendor API, batch export | Read only | A |
| Weigh-in-motion rail scale | OPC-UA / Modbus TCP from scale controller | Read only | B |
| LiDAR wagon profilers | Ethernet (vendor SDK) → edge node | Read only | B |
| Radar chute level sensors | 4–20 mA/HART into PLC → OPC-UA | Read only | B |
| RFID AEI wagon ID readers | Ethernet/serial → edge node | Read only | B |
| ATEX cameras | RTSP over plant CCTV VLAN → edge node | Read only | B |
| SIS / E-stop chain | **None. Physically and logically isolated.** Status contacts read-only via PLC. | Read only (status), never write | — |

---

## 3. Goals, Metrics, and Non-Goals

### 3.1 Target metrics

| ID | Metric | Baseline | Phase A Target | Phase B Target | Measurement Method |
|---|---|---|---|---|---|
| M-01 | Mean wagon payload utilization | 96–97% | ≥ baseline + 1.0 pp (validated in simulation & shadow mode) | **≥ 99.0%** | Net weight (WIM scale or weighbridge) ÷ rated payload, per wagon, rolling 30-train mean |
| M-02 | Overload rate (> 100.5% rated) | occurs sporadically | 0 in simulation | **0 wagons** | WIM per-wagon net weight |
| M-03 | Spill events (material outside wagon boundary) | intermittent | 0 in simulation | **0 events** | LiDAR boundary monitor + camera analytics + manual reports |
| M-04 | Control loop update interval | n/a (manual) | 100 ms in twin | **≤ 100 ms p99** | Loop instrumentation telemetry |
| M-05 | Platform availability (loading windows) | n/a | ≥ 99.0% (pilot) | **≥ 99.99%** | Uptime monitor, excludes plant outages |
| M-06 | Manual takeover latency (operator request → operator in control) | n/a | ≤ 500 ms (twin) | **≤ 500 ms hard bound** | Command audit log timestamps |
| M-07 | Fallback-to-safe-state on platform fault | n/a | modeled | **≤ 1 s to PLC local mode** | Watchdog test records |
| M-08 | Extra train trips avoided | — | business-case projection | ≥ 2–3% trip reduction at equal tonnage | Dispatch records |
| M-09 | OT security compliance | — | IEC 62443 SL-target defined | **100% of SL2 requirements, pen-test passed** | Third-party audit |

### 3.2 Non-goals (explicitly out of scope)

- Replacing, modifying, or bypassing any SIS, E-stop, fire & gas, or dust-explosion protection function.
- Controlling locomotive traction outside the loading creep envelope (mainline operation untouched).
- Stockyard/stacker-reclaimer scheduling optimization (only the reclaim feed rate *into* the loading circuit is coordinated).
- Sulfur quality/chemistry analytics.
- Autonomous operation without a human supervisor present at the loading control station (Phase B is "supervised autonomy," IEC 61508 principle: human remains the ultimate authority above the SIS).

---

## 4. Users and Personas

| Persona | Description | Primary Needs |
|---|---|---|
| **Station Control Operator (SCO)** | Runs the loading console per shift; today manually modulates gate & speed | Trustworthy automation, instant override, clear single-screen situational awareness, alarm discipline (IEC 62682) |
| **Rail Loading Engineer (RLE)** | Owns loading process KPIs; tunes plans, reviews performance | Per-wagon/per-train analytics, model performance drill-down, constraint tuning UI, twin what-if runs |
| **Control & Instrumentation Engineer** | Owns PLC/DCS and field instruments | Clean OPC-UA namespace, deterministic write contract, diagnostics, bypass management |
| **Cybersecurity Auditing Officer (CAO)** | Owns IEC 62443 compliance | Immutable audit trails, network zone conformance evidence, access-control review, signed firmware/model inventory |
| **Operations Manager** | Accountable for throughput and cost | Utilization/tonnage dashboards, trip-reduction reporting, availability SLA reports |

---

## 5. System Overview (Reference Architecture)

```
                         ┌─────────────────────────────────────────────┐
 FIELD (Zone 21/22)      │  PROCESS CONTROL (Purdue L1/L2)             │   SUPERVISORY AI (Purdue L3)          IT/DMZ (L3.5/L4)
                         │                                             │
 WIM rail scale ────────►│                                             │
 Belt weighers ─────────►│  Loading PLC / DCS ◄──── SIS (isolated,     │
 LiDAR profilers ───────►│   • local control     hardwired, SIL-rated)│
 Radar chute level ─────►│   • interlock logic                         │
 Train encoders ────────►│   • command validator ◄─────────────┐       │
 RFID AEI readers ──────►│   • watchdog / fallback             │       │
 ATEX cameras ──────────►│                                     │       │
                         └───────────────┬─────────────────────┼───────┘
                                         │ OPC-UA (read)       │ OPC-UA (bounded setpoint write, Phase B)
                                         ▼                     │
                              ┌──────────────────────┐   ┌─────┴──────────────┐
                              │ Edge Gateway Cluster │──►│ ProAI Control Core │  MPC @10Hz + RL policy
                              │ (protocol adapters,  │   │ + State Estimator  │  + Digital Twin (shadow)
                              │  store-and-forward)  │   │ + Safety Envelope  │
                              └──────────┬───────────┘   └─────┬──────────────┘
                                         │ MQTT Sparkplug B / Kafka
                                         ▼                     ▼
                              ┌──────────────────────────────────────┐      ┌──────────────────┐
                              │ TimescaleDB Historian + Audit Store  │─────►│ DMZ replica →    │
                              │ + Operator UI backend (FastAPI/WS)   │ diode│ IT analytics/BI  │
                              └──────────────────────────────────────┘      └──────────────────┘
```

Control authority hierarchy (absolute, non-negotiable):

```
1. Hardwired E-stop / SIS trip        (highest — hardware, AI-invisible)
2. PLC local interlocks & validator   (rejects any out-of-bounds AI command)
3. Operator manual override           (≤500 ms takeover, latched)
4. ProAI autonomous supervisory loop  (lowest authority)
```

---

## 6. Functional Requirements

Priority: **M** = Must (contractual), **S** = Should, **C** = Could. Phase indicates first delivery.

### FR-1 Real-Time Telemetry Ingestion

| ID | Requirement | Pri | Phase |
|---|---|---|---|
| FR-1.1 | Ingest via OPC-UA subscriptions from the loading PLC/DCS at ≥ 10 Hz for control-critical tags (belt weigher mass flow, gate position, chute level, train speed, wagon position) and ≥ 1 Hz for auxiliary tags (motor currents, temperatures, interlock states). | M | A |
| FR-1.2 | Ingest historian backfill (≥ 12 months where available) for model training: loading rates, gate positions, train speeds, wagon tare/gross weights, event/alarm logs. | M | A |
| FR-1.3 | Timestamp all samples at source where supported (OPC-UA SourceTimestamp); apply PTP/NTP-disciplined edge clocks; end-to-end timestamp skew ≤ 10 ms across control-critical tags. | M | A |
| FR-1.4 | Buffer telemetry at the edge (store-and-forward, ≥ 24 h at full rate) across network interruptions; no gap on historian after link recovery. | M | A |
| FR-1.5 | Phase B: ingest WIM per-wagon/per-bogie weights (OIML R106 class 0.5 target), LiDAR profile point clouds at ≥ 25 Hz, radar chute level at ≥ 10 Hz, RFID wagon IDs, camera streams. | M | B |
| FR-1.6 | Validate every control-critical signal: range check, rate-of-change check, stale-data check (no update > 3× expected period), cross-sensor consistency (e.g., integrated belt-weigher mass vs. WIM delta). Signals failing validation are flagged `quality != GOOD` and excluded from the control state estimate. | M | A |
| FR-1.7 | Normalize all ingested tags into a versioned canonical tag dictionary (single namespace: `slo.<area>.<equipment>.<measurement>`). | M | A |

### FR-2 Predictive Flow-Rate Optimization

| ID | Requirement | Pri | Phase |
|---|---|---|---|
| FR-2.1 | Maintain a real-time state estimate (Kalman/moving-horizon estimator at ≥ 50 Hz internal) of: mass in flight on the belt (spatially discretized belt inventory), chute surge bin level, current wagon fill mass & volume, wagon position/velocity relative to chute. | M | A (twin) / B (live) |
| FR-2.2 | Model the gate→chute **transport dead time (~45 s)** explicitly (Smith-predictor / delay-embedded MPC state). Prediction error of arrival mass over the delay window ≤ 2% at steady flow. | M | A |
| FR-2.3 | Predict per-wagon final fill mass and 3D fill profile ≥ 30 s before wagon exit, updated every 100 ms; terminal mass prediction error ≤ 0.5 t (0.5%) by the 50%-fill point of each wagon. | M | B |
| FR-2.4 | Solve constrained optimization every 100 ms over ≥ 30 s horizon: maximize fill subject to zero-spill constraint (no discharge over inter-wagon gap with > 99.9% confidence), overload constraint (≤ 100.5% rated), pile geometry constraint (crest below wagon rim minus freeboard, respecting 30° angle of repose), equipment limits (gate slew rate, conveyor min/max, train accel/decel and jerk limits from momentum model). | M | A (twin) / B (live) |
| FR-2.5 | Compute and publish a continuous **Spill Probability Index (SPI ∈ [0,1])** every 100 ms from the joint distribution of arrival-mass timing vs. wagon boundary timing. SPI > 0.02 must trigger automatic flow curtailment; SPI > 0.10 triggers controlled pause (gate close + surge bin hold). | M | B |
| FR-2.6 | Support an RL-refined policy (offline-trained in the Digital Twin, action-masked by the same hard constraint set as MPC) as an optimization layer above MPC targets. RL actions can never relax a hard constraint (mask enforced in code, verified by property-based tests). | S | B |
| FR-2.7 | Detect material property drift (bulk density, flowability) online from belt-weigher/LiDAR volumetric ratio and re-estimate density each wagon; controller constants adapt within configured bounds. | S | B |

### FR-3 Autonomous Velocity & Flow Command Generation

| ID | Requirement | Pri | Phase |
|---|---|---|---|
| FR-3.1 | Generate coordinated setpoints every 100 ms: train creep speed (0.4–1.2 km/h envelope), silo gate position / reclaim feed rate, chute discharge gate state. Setpoints are **bounded increments** relative to current state, never absolute jumps. | M | B |
| FR-3.2 | Respect train dynamics: commanded speed profile must satisfy configured limits on acceleration (≤ 0.05 m/s²), deceleration (≤ 0.08 m/s²), and jerk, derived from trailing-mass momentum and coupler-force limits; the platform never commands a stop shorter than the physics allows — it plans around braking lag instead. | M | B |
| FR-3.3 | Write setpoints to a **dedicated, firewalled OPC-UA write namespace** on the PLC (`slo.cmd.*`). The PLC-side command validator (function block, plant-owned) independently clamps range, rate, and mode before actuation. AI commands are *requests*, PLC is the authority. | M | B |
| FR-3.4 | Every command carries: monotonic sequence number, source model version, UTC timestamp, TTL (≤ 300 ms). PLC discards stale or out-of-sequence commands and holds last-validated safe ramp. | M | B |
| FR-3.5 | Heartbeat/watchdog between Control Core and PLC at 5 Hz. Two missed beats (400 ms) → PLC autonomously reverts to LOCAL mode (see FR-4.4). | M | B |
| FR-3.6 | Wagon-boundary choreography: the platform shapes gate closure such that belt inventory arriving during the boundary window (4–12 s) is ≤ surge-bin headroom, and re-opens to ramp the next wagon — the "gate leads chute by the transport delay" behavior that humans cannot execute. | M | B |

### FR-4 Safety Interlocking & Fallback (platform-side; SIS unaffected)

| ID | Requirement | Pri | Phase |
|---|---|---|---|
| FR-4.1 | **SIS isolation (hard constraint):** the platform shall have no network route, no shared credential, no write path, and no shared hardware with the SIS. SIS/E-stop status is consumed read-only via PLC status tags. Any hardware E-stop or SIS trip instantly invalidates all platform commands at the PLC layer without platform participation. | M | A/B |
| FR-4.2 | Software safety envelope: before publishing, every candidate command is checked against a declarative constraint file (versioned, signed, dual-approval to change). Violations are logged and the command is clipped or discarded. | M | B |
| FR-4.3 | Defined platform states: `OFF`, `MONITOR` (read-only), `ADVISORY` (recommendations to operator, no write), `SHADOW` (writes computed, not sent, compared), `AUTONOMOUS` (supervised closed loop), `FALLBACK` (PLC local), `MAINTENANCE`. All transitions logged; transitions into `AUTONOMOUS` require operator confirmation at the console. | M | B |
| FR-4.4 | Fallback triggers → automatic reversion to `FALLBACK` (PLC local control, gates ramp to configured safe rate or close, train speed hold or controlled stop per plant procedure): watchdog loss; control-critical sensor quality ≠ GOOD > 500 ms; SPI > 0.10; loop deadline overrun (p99 > 100 ms sustained 5 s); edge node failover failure; security event (see FR-7). Fallback completes ≤ 1 s. Recovery to `AUTONOMOUS` is manual-only. | M | B |
| FR-4.5 | Purge & E-stop compliance: pressurized (`Ex p`) enclosures in Zone 21 interlock loss-of-purge to power removal per IEC 60079-2 — platform must ride through instrument loss (fallback) without commanding unsafe state. E-stop chain per IEC 60204-1 stop category 0/1 and ISO 13850 remains hardwired and untouched. | M | B |
| FR-4.6 | Pre-loading checklist gate: `AUTONOMOUS` cannot be entered unless plant-permissive tags are healthy (dust suppression running, chute position confirmed, WIM online, LiDAR self-test passed, comms latency in bounds). | M | B |

### FR-5 Manual Override & Takeover

| ID | Requirement | Pri | Phase |
|---|---|---|---|
| FR-5.1 | One-action takeover: a single dedicated hardware button on the console **and** a persistent on-screen control transfer the loop to MANUAL in ≤ 500 ms; the platform immediately stops publishing setpoints and the PLC latches operator authority. | M | B |
| FR-5.2 | Takeover is never blocked, queued, or rate-limited — no confirmation dialog on the take-control path. (Confirmation exists only on *returning* control to the AI.) | M | B |
| FR-5.3 | Bumpless transfer: on takeover, PLC holds last validated setpoints as the operator's starting point (no step change to the process). | M | B |
| FR-5.4 | Full context logging of every override: who, when (ms), platform state snapshot (all control-critical tags ±60 s), reason code entered post-hoc by operator (mandatory before shift close, non-blocking at takeover time). | M | B |
| FR-5.5 | Return-to-auto requires: operator confirmation, envelope pre-check pass, and a 10 s supervised ramp during which the operator can abort with one action. | M | B |

### FR-6 Multi-Layered Event & Audit Logging

| ID | Requirement | Pri | Phase |
|---|---|---|---|
| FR-6.1 | Layer 1 — Process telemetry: all ingested tags to the time-series historian at ingest resolution; retention per §Data (see DB document). | M | A |
| FR-6.2 | Layer 2 — Control decisions: every published command with full input state vector hash, model version, constraint-check results, and solver diagnostics — sufficient to deterministically replay any decision. | M | B |
| FR-6.3 | Layer 3 — Operator actions: logins, mode changes, overrides, setpoint edits, alarm acks — append-only, tamper-evident (hash-chained records). | M | A |
| FR-6.4 | Layer 4 — System/security events: service health, failovers, config/model deployments (signed), authentication events, network anomalies — forwarded to plant SIEM via DMZ. | M | A |
| FR-6.5 | Post-incident replay: reconstruct any 24 h window (process + decisions + UI state) within 15 minutes via the replay tool. | M | B |

### FR-7 Cybersecurity Functions

| ID | Requirement | Pri | Phase |
|---|---|---|---|
| FR-7.1 | Conform to IEC 62443-3-3 **SL2 minimum (SL3 for the command-write conduit)**; zone/conduit model per the Technical Stack document. | M | A/B |
| FR-7.2 | OPC-UA with X.509 mutual authentication, SignAndEncrypt (Basic256Sha256 or better); MQTT over TLS 1.3 with per-device certs; no plaintext industrial protocol crosses a zone boundary (Modbus TCP confined within L2 cell). | M | A |
| FR-7.3 | Role-based access (SCO / RLE / C&I / CAO / admin) with per-action authorization; MFA for engineering and admin roles; break-glass documented procedure. | M | A |
| FR-7.4 | Signed model & config artifacts; edge nodes verify signatures before load; SBOM maintained; quarterly patch windows; annual third-party penetration test. | M | B |
| FR-7.5 | Security event → platform demotes itself to `MONITOR` (never a process trip decision — the plant trips itself via its own systems). | M | B |

### FR-8 Digital Twin & Simulation (summarized here; full spec in MVP document)

| ID | Requirement | Pri | Phase |
|---|---|---|---|
| FR-8.1 | Physics + transport-delay simulator of the full loading circuit, calibrated against ≥ 12 months of historian data; wagon-level mass balance closure error ≤ 1%. | M | A |
| FR-8.2 | Twin runs in three modes: offline batch (training/what-if), real-time shadow (live inputs, predicted vs. actual divergence tracking), and HIL against a PLC test rack. | M | A (offline/shadow), B (HIL) |
| FR-8.3 | Divergence alarm: shadow-twin prediction error beyond configured bounds flags model degradation and blocks `AUTONOMOUS` entry. | M | B |

### FR-9 Reporting & Analytics

| ID | Requirement | Pri | Phase |
|---|---|---|---|
| FR-9.1 | Per-train loading report (auto-generated ≤ 5 min after last wagon): per-wagon net weight, utilization %, fill profile snapshot, mode timeline, alarms, SPI excursions. | M | B |
| FR-9.2 | KPI dashboards: rolling utilization, tonnage, availability, override frequency, model performance. Exported to IT via one-way DMZ replication. | M | A |

---

## 7. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-01 | Latency | End-to-end control loop (sensor sample → validated PLC setpoint) ≤ 100 ms p99 during `AUTONOMOUS`. Budget: acquisition 20 ms, transport 10 ms, estimation+optimization 50 ms, publish+PLC validate 20 ms. |
| NFR-02 | Determinism | Control Core is a real-time process (PREEMPT_RT Linux or equivalent), CPU-pinned, memory-locked; GC-based runtimes excluded from the 10 Hz path. |
| NFR-03 | Availability | 99.99% during scheduled loading windows (≤ ~5 min/yr unavailability attributable to platform). Redundant edge pair (active/standby, stateful failover ≤ 2 s → else FALLBACK). |
| NFR-04 | Fail-safe | Any single platform failure results in `FALLBACK` (plant-safe local control) — never an uncontrolled process state. The platform is *fail-silent* toward the process. |
| NFR-05 | Data integrity | No acknowledged telemetry loss; audit layers 2–4 are append-only and hash-chained; clock discipline ≤ 10 ms skew. |
| NFR-06 | UI performance | Operator dashboard live data at 10 Hz render, ≤ 250 ms glass-to-glass from field change; alarm annunciation ≤ 1 s. |
| NFR-07 | Environmental | Field/edge equipment: −5…+55 °C ambient (60 °C peak), IP66, dust-certified per §2.2; control-room equipment per plant HVAC spec. |
| NFR-08 | Maintainability | Model retraining/deployment without loading interruption (blue-green at the edge, activated only in `MONITOR`/between trains). |
| NFR-09 | Compliance | IEC 62443 (security), IEC 60079 (Ex), IEC 62682/ISA-18.2 (alarms), ISA-101 (HMI), OIML R106 (WIM legal metrology if used for custody), plant HSE case. |
| NFR-10 | Capacity | Sustain 2,500 tag-updates/s continuous (headroom over ~1,200 expected), 90-day full-resolution hot storage, 5-year audit retention. |

---

## 8. Hard Constraints (Design Invariants)

1. **The AI shall be physically incapable of overriding the SIS or E-stop chain** — enforced by network architecture (no route), PLC command validator (bounded writes only to non-safety tags), and hardwired safety circuits that de-energize actuator power independent of all software.
2. All platform write access to the process is confined to **three bounded setpoint tags** (train creep speed request, feed-rate request, chute gate request) plus its own mode/heartbeat tags. Nothing else is writable, ever.
3. The platform is **supervisory**: loss of the platform must leave the plant exactly as operable as it is today.
4. Constraint definitions (limits, envelopes) are plant-approved configuration, under dual-control change management — not model outputs.
5. No cloud dependency in the control path. Cloud/IT receives data via one-way replication only.

---

## 9. Acceptance Criteria (Contractual Gate Summary)

| Gate | Phase | Criteria |
|---|---|---|
| G-A1 | A, Day 30 | Twin calibrated: wagon mass balance ≤ 1% error vs. historian on 30-day replay; latency prototype meets NFR-01 on target hardware. |
| G-A2 | A, Day 60 | Optimizer demonstrates **≥ +1.0 pp utilization** vs. matched historical baseline across ≥ 500 simulated wagons with zero simulated spills/overloads; statistical proof per MVP §6 (one-sided test, α = 0.05). |
| G-B1 | B, Shadow exit | ≥ 10 full trains in `SHADOW`: platform commands, had they been applied, violate zero constraints; predicted fill error ≤ 0.5 t p95. |
| G-B2 | B, Commissioning | ≥ 20 consecutive trains in `AUTONOMOUS` with mean utilization ≥ 99.0%, zero spills, zero overloads, zero safety-system interactions, availability ≥ 99.9% during the run; takeover drill ≤ 500 ms demonstrated 10/10 times. |
| G-B3 | B, Security | Third-party IEC 62443 assessment: no critical/high findings open; pen-test report accepted by CAO. |

---

## 10. Glossary

| Term | Definition |
|---|---|
| Utilization | Net loaded mass ÷ rated payload (100 t), per wagon |
| SPI | Spill Probability Index — modeled probability that discharge lands outside wagon boundary in the current horizon |
| WIM | Weigh-in-motion rail scale (dynamic per-wagon/per-bogie weighing) |
| SIS | Safety Instrumented System (IEC 61511) — outside platform scope, isolated |
| Transport dead time | Delay between gate action and material arrival at chute (~45 s design) |
| Shadow mode | Platform computes commands on live data but does not send them |
| MPC | Model Predictive Control |
| Action masking | Hard filter guaranteeing an RL policy can only emit constraint-satisfying actions |

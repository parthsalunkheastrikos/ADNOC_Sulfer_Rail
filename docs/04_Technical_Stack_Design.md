# Technical Stack Design

## ProAI Closed-Loop Sulfur Loading Optimization Platform

| Field | Value |
|---|---|
| Document ID | TSD-PROAI-SRL-004 |
| Version | 1.0 |
| Parent | PRD-PROAI-SRL-001 |
| Governing Standards | IEC 62443 (zones/conduits, SL2/SL3), OPC-UA Part 2/4/14, MQTT Sparkplug B, IEC 60079 (Ex equipment), IEEE 1588 (PTP) |

---

## 1. Layered Architecture Overview

```
L4/L5  ENTERPRISE IT      BI / planning / email alerts            ┐ one-way data only
L3.5   INDUSTRIAL DMZ     Replica DB, report server, SIEM fwd,    ┤ (diode / unidirectional gw)
                          patch/AV staging, remote-access jump    ┘
─────── firewall pair (deny-by-default, application-aware) ────────────────────────────
L3     SITE OPERATIONS    ★ ProAI Platform lives here ★
                          Edge AI cluster · TimescaleDB historian · Control Core (MPC/RL)
                          Digital Twin · FastAPI/WS backend · Operator UI server
─────── firewall + conduit C2/C3 (OPC-UA only, cert-pinned) ───────────────────────────
L2     AREA CONTROL       Loading PLC/DCS, SCADA servers, engineering stations
L1     BASIC CONTROL      PLC I/O, drives (VFDs), creep-control interface, scale controllers
L0     FIELD              Sensors & actuators (Zone 21/22 Ex-certified)
  SIS  (parallel, isolated) Safety PLC + hardwired E-stop chain — no conduit to ProAI, ever
```

---

## 2. Field & Sensor Layer (L0) — Instrumentation Bill of Design

All devices in classified areas: **ATEX/IECEx Group IIIB/IIIC dust cert, T ≤ 125 °C, IP66+, 316L or coated enclosures, bonded/earthed** (sulfur dust MIE ~1–5 mJ — electrostatic discipline is absolute).

| # | Instrument | Purpose | Spec / Class | Interface | Qty |
|---|---|---|---|---|---|
| S1 | Weigh-in-motion (WIM) rail scale, dual weighbridge | Per-bogie/per-wagon net weight in motion at creep speed; ground truth for utilization | OIML R106 class 0.5 (target), full-draft static class 0.2 fallback mode | Scale controller → Modbus TCP/OPC-UA | 1 system (2 measurement zones: pre- and post-chute) |
| S2 | 3D LiDAR wagon profilers | Volumetric fill profile, rim/freeboard monitoring, boundary detection | 2D line-scan LiDAR pairs @ ≥ 25 Hz composing 3D via train motion; ±10 mm range accuracy; Ex tb housing w/ purged sapphire window + air-knife lens keeper | GigE → edge (vendor SDK) | 4 units (2 pre-chute empty-profile, 2 post-chute load-profile) |
| S3 | Radar level transmitters, chute/surge bin | Surge-bin inventory & chute plug detection | 80 GHz FMCW, ±1 mm, dust-penetrating (radar chosen over nucleonic: no source licensing burden; nucleonic listed as alternate for heavy dust re-entrainment) | 4–20 mA/HART → PLC | 2 (bin), 1 (chute throat) |
| S4 | Belt weighers (existing, verify) | Mass flow on feed conveyor | Class 0.5 multi-idler; recalibrate | Existing PLC I/O | 2 (post-gate @ 12 m, pre-chute check scale) |
| S5 | Train speed & position | Creep speed, chute-relative wagon position | Trackside doppler radar + rail-head laser odometer (redundant, no wheel-slip error); ±0.5 mm/s | Ethernet/4–20 mA → PLC | 2 |
| S6 | RFID AEI readers | Wagon identity → per-wagon records | ISO 10374 / AAR S-918 compatible trackside reader | Ethernet → edge | 2 (entry + chute) |
| S7 | ATEX cameras | Visual verification, spill evidence, remote situational awareness | Ex tb, IR-capable, wiper/air-purge, ONVIF/RTSP | RTSP → CCTV VLAN → edge tap | 4 (chute ×2, boundary, WIM) |
| S8 | Environmental | Ambient temp/humidity (density-drift covariate), dust-suppression status | Standard Ex instruments | PLC I/O | as needed |

Actuation (existing plant equipment, unchanged): silo/reclaim gate drives, conveyor VFDs, chute gate, locomotive/trackmobile creep-control interface. ProAI touches these **only** through the PLC command validator.

---

## 3. Data & Integration Layer — the OT/IT Bridge

### 3.1 Protocol matrix

| Path | Protocol | Rate | Security | Notes |
|---|---|---|---|---|
| PLC/DCS → Edge (telemetry) | **OPC-UA** (subscriptions, monitored items) | 10 Hz control-critical, 1 Hz aux | X.509 mutual auth, SignAndEncrypt, Basic256Sha256 | Primary conduit C2 |
| Legacy devices → Edge | **Modbus TCP** (polled) | ≤ 1 Hz | Confined to L2 cell; terminated at protocol gateway which re-publishes OPC-UA | Never crosses zone boundary raw |
| Edge → Platform bus | **MQTT Sparkplug B** over TLS 1.3 | event/10 Hz | Per-device certs, mTLS, broker ACLs per topic | Birth/death certificates give stateful presence |
| Control Core → PLC (commands, Phase B) | **OPC-UA** dedicated session, separate endpoint & credential | 10 Hz setpoints + 5 Hz heartbeat | SL3 conduit: cert-pinned, IP-pinned, deep-packet-inspected (OPC-UA-aware firewall), write-whitelist of exactly the `slo.cmd.*` node set | The only write path in the system |
| Historian backfill | OPC-UA HDA / vendor bulk export | batch | as above | Phase A |
| L3 → DMZ | PostgreSQL logical replication (one-way) or data diode + file drop | continuous | TLS; diode preferred for SL3 posture | No inbound from DMZ to L3 |
| Time sync | PTP (IEEE 1588) on L2/L3 control VLANs; GPS-disciplined grandmaster; NTP fallback | — | — | ≤ 10 ms end-to-end skew requirement |

### 3.2 Edge gateway responsibilities

- Protocol adaptation (OPC-UA/Modbus/vendor SDKs → normalized Sparkplug B on the canonical `slo.*` namespace).
- Quality stamping (range/rate/stale checks execute here, closest to source), unit normalization, source timestamping.
- **Store-and-forward:** local NVMe ring buffer ≥ 24 h full-rate; replay with original timestamps on link recovery.
- LiDAR preprocessing: point-cloud → wagon-frame height-map extraction runs on the edge GPU (bandwidth reduction ~100:1 before the bus).

---

## 4. Edge AI & Compute Layer (L3)

### 4.1 Hardware

| Node | Hardware | Role | Location |
|---|---|---|---|
| EDGE-A / EDGE-B (redundant pair) | Fanless industrial server: 16-core x86 (Xeon-D/EPYC Embedded), 128 GB ECC, 2× NVMe RAID-1, dual PSU, dual 10 GbE + 2× 1 GbE, TPM 2.0 | Control Core (MPC/estimator), safety envelope, command publisher, twin (shadow) | Control-room rack (safe area) |
| EDGE-GPU | Same base + NVIDIA L4-class GPU (or 2× Jetson AGX Orin industrial as alternate) | LiDAR pipeline, camera analytics, RL inference, model retraining staging | Control-room rack |
| FIELD-GW ×2 | DIN-rail industrial gateway (e.g., Jetson Orin NX class in Ex tb enclosure where required, else safe-area cabinet with barrier-protected I/O) | Sensor aggregation near track (LiDAR/RFID/radar frontends) | Trackside cabinets — **outside Zone 21 where possible; Ex tb/pressurized cabinet if not** |
| DB-A / DB-B | Storage-optimized server pair, 2× 8 TB NVMe + 4× 16 TB SSD | TimescaleDB primary/replica, MQTT broker, backend services | Control-room rack |

Failover: EDGE-A/B active-standby with state replication (estimator state, sequence numbers) at 10 Hz; standby promotion ≤ 2 s; if promotion fails → PLC watchdog expires → FALLBACK (PRD FR-4.4). Control Core runs on PREEMPT_RT kernel, CPU isolation (`isolcpus`), locked memory, dedicated NIC queue — the 10 Hz loop is jitter-bounded < 5 ms.

### 4.2 Software stack

| Concern | Selection | Rationale |
|---|---|---|
| OS | Ubuntu 24.04 LTS + PREEMPT_RT (control nodes); Ubuntu/JetPack (GPU/Jetson) | RT determinism, LTS support, SBOM tooling |
| Control Core loop | **C++20** (or Rust) real-time process: moving-horizon estimator + MPC via **acados/OSQP** generated solvers | GC-free 100 ms deadline (NFR-02); Python excluded from hot path |
| ML/optimization dev | **Python 3.12**: NumPy/SciPy, JAX (twin & differentiable tuning), PyTorch (RL: PPO/SAC w/ action masking), Gymnasium env wrapper, ONNX Runtime / TensorRT for deployed inference | Standard, portable to edge |
| Digital Twin runtime | Python (offline/training) + compiled core (shared C++ physics kernels via pybind11) for shadow real-time | One physics codebase, two speeds |
| OT connectivity | `asyncua` (Python, Phase A read), **open62541 (C)** embedded in Control Core for the write conduit; Eclipse Tahu for Sparkplug B | Certified-stack option (vendor OPC-UA SDK) kept as procurement alternate |
| Messaging | EMQX or HiveMQ (MQTT broker, clustered) + **Redpanda/Kafka** for L3 stream processing & replay | Sparkplug for OT semantics; Kafka for durable fan-out to DB/analytics |
| Historian/DB | **TimescaleDB (PostgreSQL 16)** | See Document 05 |
| Backend/API | **Python FastAPI** + WebSocket (binary CBOR frames), Pydantic schemas, Uvicorn; report worker (Celery) | 10 Hz UI fan-out, OpenAPI for integrators |
| Frontend | **Next.js (React 19, TypeScript)**, Canvas/WebGL train canvas (PixiJS), uPlot for 10 Hz trends, Tailwind + design tokens | Meets 10 Hz render & ISA-101 theming |
| Deployment | Docker + K3s (two-node, embedded etcd on third quorum device) on L3; **Control Core runs as a systemd RT service outside the container orchestrator** | Orchestration convenience must never own the RT loop |
| Observability | Prometheus + Grafana (L3), Loki logs, OpenTelemetry traces; loop-deadline & jitter exporters | NFR monitoring is itself monitored |
| Model registry | MLflow + object store (MinIO, L3); artifacts signed (cosign), edge verifies before load | PRD FR-7.4 |

### 4.3 Control loop composition (100 ms tick)

```
t+0    sample ingest (OPC-UA callbacks land in lock-free ring)          budget 20 ms
t+20   estimator update (KF/MHE: belt inventory, fill, kinematics)      budget 15 ms
t+35   MPC solve (warm-started QP, 30 s horizon)                        budget 30 ms
t+65   RL refinement (ONNX policy, optional) + action mask              budget  5 ms
t+70   safety envelope check (declarative constraints, versioned)      budget  5 ms
t+75   publish (OPC-UA write w/ seq, TTL 300 ms) + heartbeat            budget 10 ms
t+85   telemetry out (decision record → Kafka), margin                  15 ms
```

Deadline misses are counted; p99 > 100 ms sustained 5 s → self-demotion to FALLBACK (PRD FR-4.4).

---

## 5. Control & Application Frameworks — PLC Boundary Contract

The plant-side **command validator** (PLC function block, plant-owned, developed with the C&I team, tested on the HIL rig):

1. Accepts writes only on nodes `slo.cmd.speed_req`, `slo.cmd.feed_req`, `slo.cmd.chute_req`, `slo.cmd.heartbeat`, `slo.cmd.seq`.
2. Enforces: absolute range clamps, per-tick rate clamps, mode gate (applies only in REMOTE-AI mode), sequence monotonicity, TTL freshness (< 300 ms).
3. Watchdog: heartbeat 5 Hz; 400 ms silence → REMOTE-AI mode drops → LOCAL ramp-to-safe.
4. Publishes back: applied setpoints, rejection counters + reason codes (platform alarms on any rejection — a rejected command is a defect, not a retry case).
5. **No connection whatsoever to SIS logic**; safety trips act on actuator power/hardwired circuits regardless of any of the above.

---

## 6. Cybersecurity Layer (IEC 62443 implementation)

### 6.1 Zones & conduits

| Zone | Contents | Target SL |
|---|---|---|
| Z-FIELD | L0/L1 devices | SL1 (physical + protocol confinement) |
| Z-CONTROL (L2) | PLC/DCS, SCADA | SL2 |
| Z-PROAI (L3) | Everything ProAI | SL2 |
| Z-CMD conduit (L3→L2 write) | The single OPC-UA write session | **SL3** controls: cert+IP pinning, OPC-UA DPI firewall, write-node whitelist, full packet capture retention 90 days |
| Z-DMZ (L3.5) | Replica, reports, SIEM forwarder, jump host | SL2 |
| Z-SIS | Safety system | Out of scope; **no conduit** to any ProAI zone |

### 6.2 Controls checklist

- Deny-by-default firewalls at every boundary; OPC-UA/MQTT-aware inspection on OT conduits; no direct L4→L3 path (remote access only via DMZ jump host with MFA + session recording).
- Certificates: internal OT PKI; device certs 1-year, auto-rotation with dual-cert overlap; CRL/OCSP on L3.
- Hardening: CIS benchmarks; secure boot + TPM-measured boot on edge nodes; disk encryption (LUKS/TPM); USB ports disabled by policy.
- Supply chain: SBOM (SPDX) per release; artifact signing (cosign); model files treated as code (signed, versioned, reviewed).
- Detection: Falco on hosts, network sensor (Zeek) on OT SPAN, forwarding to plant SIEM via DMZ; platform self-demotes to MONITOR on confirmed compromise indicators (PRD FR-7.5).
- People/process: RBAC with named accounts (no shared operator logins; badge-tap fast user switching at console), quarterly access review (CAO screen S-21), annual third-party pen test, incident-response runbook joint with plant OT security.

---

## 7. Deployment & Environments

| Environment | Where | Purpose |
|---|---|---|
| DEV | Vendor lab | Twin, algorithms, UI development; simulated PLC (open62541 server mimic) |
| HIL | Vendor/site lab | Real PLC (same model/firmware as plant) + twin as plant surrogate; validator FAT; failover & watchdog tests |
| SHADOW/PILOT | Plant L3 | Phase A pilot node → grows into production cluster |
| PROD | Plant L3 | Redundant topology of §4.1 |

Release flow: Git (trunk-based) → CI (unit + property tests on constraint mask + twin regression suite: every release must reproduce Gate A-2 statistics within tolerance) → signed artifacts → staged deployment (MONITOR-mode soak ≥ 48 h) → activation window between trains. Control Core and safety-envelope config follow **dual-approval** change management; UI/analytics follow standard review.

# UI/UX Design Framework & Specifications

## ProAI Closed-Loop Sulfur Loading Optimization Platform — Operator HMI & Analytics Suite

| Field | Value |
|---|---|
| Document ID | UIX-PROAI-SRL-003 |
| Version | 1.0 |
| Parent | PRD-PROAI-SRL-001 |
| Governing HMI Standards | ISA-101 (HMI design), IEC 62682 / ISA-18.2 (alarm management), ISO 9241 (ergonomics), EEMUA 191 |

---

## 1. Design Philosophy

1. **High-performance HMI (ISA-101):** grayscale-dominant displays; color is reserved exclusively for abnormality and mode. A healthy, autonomous loading run is a *quiet gray screen*. If the screen is colorful, something needs attention.
2. **Authority is always unambiguous:** at any glance from 3 m away, the operator must know **who is driving** (AI / MANUAL / FALLBACK) and **how to take over** (one action, always in the same place).
3. **Trust through transparency:** the AI continuously shows *what it predicts and why* (planned gate curve, projected fill, SPI) so operators can calibrate trust instead of guessing.
4. **Latency honesty:** every live element carries data-age indication; stale data (> 1 s for control-critical) visibly degrades (desaturation + "STALE" chip) rather than freezing silently.
5. **No dead-end alarms:** every alarm carries an operator action (IEC 62682 rationalization); alarm floods are shelved/aggregated by state-based logic.

---

## 2. Personas & Their Screens

| Persona | Primary Screen(s) | Environment | Session Pattern |
|---|---|---|---|
| Station Control Operator (SCO) | S-01 Loading Console (main), S-02 Alarm List, S-03 Override & Mode | 3× 27" 16:9 industrial monitors, control room, day/night shifts, gloves possible → touch targets ≥ 12 mm + hardware button | Continuous 8–12 h monitoring, seconds-critical interactions |
| Rail Loading Engineer (RLE) | S-10 Performance Analytics, S-11 Model & Twin Studio, S-12 Constraint Manager | Office workstation, browser | Daily review, weekly tuning |
| Cybersecurity Auditing Officer (CAO) | S-20 Audit Explorer, S-21 Security Posture | Office workstation | Weekly/monthly audits, incident forensics |
| C&I Engineer | S-30 Signal Health & Integration Diagnostics | Control room / office | Commissioning & maintenance |
| Operations Manager | S-40 KPI Dashboard (read-only, auto-cycling) | Wall display + browser | Passive |

Access is role-gated (RBAC per PRD FR-7.3). SCO screens function without mouse (touch + hardware controls).

---

## 3. S-01 — Main Loading Console (the product's face)

### 3.1 Layout (center monitor, 2560×1440 reference grid)

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ ① MODE & AUTHORITY BAR (full width, h=72px, persistent, never scrolls)             │
│  [● AUTONOMOUS]  Train ETR-1142 · Wagon 47/110 · SPI 0.003 ▁▁▁   [ TAKE MANUAL ▶]  │
├──────────────────────────────────────────────┬─────────────────────────────────────┤
│ ② TRAIN CANVAS (2D, ~55% width, h=420px)     │ ③ ACTIVE WAGON PANEL (~45%)         │
│                                              │  Wagon 47  UID R-88231  Tare 21.4t  │
│   ══╦═[46|■■■■]═[47|■■■□]═[48|□□□□]═╦══      │  ┌───────────────────────────────┐  │
│     ║   99.1%     71.2%     0.0%    ║        │  │ ④ PILE-HEIGHT VISUALIZER      │  │
│   ──╨────────▼CHUTE▼────────────────╨──      │  │  (live LiDAR cross-section +  │  │
│   belt: ████████████░░░  1,842 t/h →         │  │   projected final profile)    │  │
│   speed 0.86 km/h → │ boundary in 38.2 s     │  │  rim ────────────────────     │  │
│                                              │  │      ▄▄███████████▄▄          │  │
│                                              │  └───────────────────────────────┘  │
│                                              │  Fill 71.2 t → proj 99.4t ±0.3      │
├──────────────────────────────────────────────┴─────────────────────────────────────┤
│ ⑤ SYNCHRONIZED TREND STRIP (full width, h=300px, common time axis, 10 Hz)          │
│   Train speed (km/h) ────· setpoint ····  │ Chute flow (t/h) ──· gate plan ····    │
│   SPI ▁▁▁▂▁  │ Surge bin level ──────     │ ◄────── now-45s ──── now ── +30s plan  │
├────────────────────────────────────────────────────────────────────────────────────┤
│ ⑥ ALARM BANNER (h=56px): top unacked alarm + count chip   [ACK] [ALARM LIST]       │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Component specifications

**① Mode & Authority Bar**

| Mode | Chip | Bar treatment |
|---|---|---|
| AUTONOMOUS | `● AUTONOMOUS` white-on-blue (#1B5FAA) | thin blue underline across full width |
| ADVISORY / SHADOW | `◐ ADVISORY` white-on-teal | teal underline |
| MANUAL | `✋ MANUAL — <operator id>` black-on-amber (#E8A13D) | solid amber bar, 100% width |
| FALLBACK | `▼ FALLBACK — PLC LOCAL` white-on-red (#C0392B) | red bar + 2 Hz border pulse until acknowledged |
| MONITOR / OFF | gray | gray |

- `TAKE MANUAL ▶` button: fixed top-right, 220×56 px, always enabled, never obscured by dialogs (highest z-index; modals are constrained to not overlap it). Mirrors the hardware button.
- SPI chip renders live sparkline (last 60 s); background steps gray → amber at 0.01 → red at 0.02.

**② Train Canvas (2D real-time)**

- Side-elevation schematic rendered on HTML5 Canvas/WebGL at 30 fps; world-to-screen mapping keeps chute fixed at center, train scrolls beneath.
- Each wagon: rectangle with live fill bar (from state estimator), utilization % label, wagon UID on hover/tap; color: fill bar gray-blue normally, amber if projected < 98.5%, red outline if projected overload/spill risk.
- Boundary countdown: prominent monospace timer "boundary in 38.2 s" with a track marker showing where gate-closure *has already been committed on the belt* (the 45 s in-flight inventory drawn as belt shading) — this is the single most trust-building element: operators literally see the AI acting one transport-delay ahead.
- Zoom levels: 3-wagon (default), 10-wagon, full-consist minimap strip (110 wagons) docked under the canvas.

**④ Pile-Height Visualizer**

- Live longitudinal cross-section of the active wagon: 142 bins × height; LiDAR-measured surface (solid), projected final surface at wagon exit (dashed), rim line, freeboard band (hatched 0.15 m).
- Violation preview: any projected bin crossing freeboard renders red before it happens (from the 30 s horizon), giving the operator pre-emptive veto time.
- Phase A (no LiDAR): shows model-estimated profile with `MODEL EST.` watermark chip — never present estimates as measurements.

**⑤ Synchronized Trend Strip**

- Single shared time axis: **past 120 s + future 30 s** (the controller's published plan drawn as dotted future lines). "Now" cursor fixed at 80%.
- Panes (operator-configurable from a preset library, defaults): (1) train speed actual/setpoint/plan, (2) chute flow & gate plan, (3) SPI + surge-bin level. 10 Hz decimated-to-pixel rendering (M4 aggregation), no more than 3 panes to protect scan time.
- Pinch/scroll time zoom 30 s–30 min; anything beyond streams from historian transparently.

**⑥ Alarm banner** — see §5.

### 3.3 Left monitor — S-02 Alarm List & circuit overview; Right monitor — S-03 Override & Mode detail + camera tiles (Phase B ATEX cameras: chute view, boundary view). Camera tiles carry data-age chips and are explicitly *non-safety* aids.

---

## 4. Manual Override Protocol (definitive UX workflow)

### 4.1 State machine

```
                 (single action: HW button OR on-screen TAKE MANUAL)
 AUTONOMOUS ────────────────────────────────────────────────► MANUAL
     ▲                                                          │
     │  RESUME AUTO (deliberate, multi-step, §4.3)              │ operator drives via
     │                                                          │ existing SCADA/console
     └── 10 s supervised ramp (abortable, one action) ◄─────────┘
 Any state ──(watchdog/fault/security)──► FALLBACK (PLC local) — resume path identical to RESUME AUTO,
                                          preceded by fault-clear checklist
```

### 4.2 TAKE MANUAL — timeline contract (≤ 500 ms total)

| t | System behavior | Operator-visible feedback |
|---|---|---|
| 0 ms | Button press (HW or UI). No dialog. No auth prompt (station is already an authenticated SCO session; button identity = badge-tapped session). | Button depresses; click sound (if enabled) |
| ≤ 50 ms | UI optimistically enters `TAKING OVER` state | Amber sweep animation left→right across Mode Bar; canvas dims AI plan overlays |
| ≤ 200 ms | Control Core stops publishing; PLC authority latch flips to OPERATOR; bumpless transfer (PLC holds last validated setpoints) | Mode chip → `✋ MANUAL`; the *future* (dotted) plan lines on trends disappear — visual language: "no one is predicting for you now" |
| ≤ 500 ms | PLC latch confirmation received and displayed | Solid amber bar; toast: `Manual control confirmed 312 ms · setpoints held: speed 0.86 km/h · feed 1,840 t/h`; HW button LED solid |
| > 500 ms (failure path) | If PLC confirmation not received by 500 ms: platform force-drops write session (TTL expiry guarantees PLC ignores it) and raises `OVERRIDE-CONFIRM-TIMEOUT` critical alarm; PLC watchdog independently reverts to FALLBACK within 1 s | Red FALLBACK bar; instruction card: "PLC local control active. Use plant console." |

Rules: takeover is **never** blocked, rate-limited, or interrupted by any dialog (PRD FR-5.2). If the trigger came from the HW button while the UI session is logged out, takeover still executes (button path is UI-independent, wired via PLC digital input) and the event is logged as `HW-OVERRIDE-UNATTENDED-SESSION`.

### 4.3 RESUME AUTO — deliberately heavier

1. Operator presses `RESUME AUTO` (S-03) → **pre-flight card** renders: envelope checks (all permissives, sensor quality, comms latency, twin divergence) each with pass/fail; any fail blocks with the reason and the owning discipline.
2. Two-step confirm: press-and-hold 1.5 s (`HOLD TO ARM`) → then `CONFIRM` (prevents accidental resume).
3. **10 s supervised ramp:** AI publishes at reduced authority (increments clamped to 25% for 10 s); a full-width progress band shows the ramp with a single large `ABORT` button (one tap returns to MANUAL instantly).
4. Reason-code capture: on the *previous* takeover, a non-blocking task chip persists ("Override reason pending") — mandatory before shift close (PRD FR-5.4), 8 canonical codes + free text.

### 4.4 Logging surface (what the operator sees was recorded)

Immediately after any transfer, a timeline entry appears in the right-monitor Event Lane: `14:32:07.312 MANUAL takeover · operator A. Rahman · trigger HW-BTN · state snapshot #88412` — clicking opens the frozen ±60 s snapshot (replayable). This visible-audit pattern reinforces procedural compliance and derisks incident reviews.

---

## 5. Alarm & Notification Design (IEC 62682)

| Priority | Color/behavior | Response expectation | Examples |
|---|---|---|---|
| CRITICAL | Red, 2 Hz flash until ack + audible (distinct tone) | Immediate (< 1 min) | SPI > 0.10 curtailment fired; OVERRIDE-CONFIRM-TIMEOUT; FALLBACK entered; WIM offline in AUTONOMOUS |
| HIGH | Amber, steady + single chime | < 5 min | SPI > 0.02 curtailment; sensor quality degraded; twin divergence high; surge bin > 90% |
| MEDIUM | Yellow chip, no audio | This shift | Projected utilization < 98.5% trend; density drift beyond band |
| LOW / INFO | Gray, event lane only | Awareness | Mode changes, model deployment, train arrival |

- Flash reserved **exclusively** for unacknowledged CRITICAL (flashing = "needs ack", steady = "acked, still active").
- State-based suppression: e.g., "chute flow low" suppressed when no train present. Target alarm rate per EEMUA 191: < 1/10 min steady state, ≤ 10 in any 10 min flood.
- Every alarm detail view: cause, consequence, **operator action**, time-to-consequence.

---

## 6. Visual Design Tokens

| Token | Value | Use |
|---|---|---|
| `bg/base` | #23262B (night) / #ECEDEF (day) | ISA-101 gray theme, auto shift-scheduled with manual toggle |
| `ink/primary` | #E8EAED / #1E2126 | text |
| `mode/auto` | #1B5FAA | autonomous identity |
| `mode/manual` | #E8A13D | manual identity |
| `alarm/critical` | #C0392B | reserved |
| `alarm/high` | #D9822B | reserved |
| `data/quality-stale` | 40% desaturation + hatch | stale/bad quality |
| Type family | Inter (UI) / JetBrains Mono (values, timers) | numeric legibility |
| Numeric style | Tabular lining figures, fixed decimal places per tag config | no jitter |
| Touch target | ≥ 48 px (≥ 12 mm), critical ≥ 56 px | gloves |
| Minimum text | 14 px body @ 27" 1440p viewing 0.8 m; 20 px for control-critical values | control-room ergonomics |

Charts follow the platform dataviz standard: single hue family for process values, alarm colors never reused for series, common time axes, direct labeling over legends where feasible.

---

## 7. RLE / CAO Screens (summary specs)

**S-10 Performance Analytics:** per-train report browser (utilization histogram per train, wagon strip chart, mode timeline, SPI excursion list); baseline-vs-current comparison; export (PDF/CSV) via DMZ replica.

**S-11 Model & Twin Studio:** shadow-divergence dashboards (predicted vs. actual fill scatter, error CDFs), model registry (versions, signatures, deployment state), what-if runner against the twin (parameter sliders: density, delay, creep lag), promotion workflow (train → validate → sign → schedule deployment window).

**S-12 Constraint Manager:** the declarative safety-envelope file rendered as a form (limits, envelopes, SPI thresholds); every edit requires second-person approval (dual control) and generates a diff record; deployment only in non-loading windows.

**S-20 Audit Explorer:** hash-chain-verified event browser across Layers 2–4; filter by wagon/train/operator/model-version; one-click "incident bundle" export (all four layers for a time window, signed manifest).

**S-21 Security Posture:** zone/conduit conformance checks, certificate expiry board, OPC-UA session inventory, SIEM forwarding health, last pen-test findings tracker.

---

## 8. Frontend Performance Budget

| Item | Budget |
|---|---|
| Telemetry render cadence | 10 Hz sustained on S-01 with < 30% render-thread utilization |
| Glass-to-glass (field change → pixel) | ≤ 250 ms p95 |
| WebSocket payload | Binary (CBOR/protobuf) delta frames; ≤ 8 KB/frame typical |
| Initial console load | ≤ 3 s to interactive on control-room hardware |
| Degradation ladder | 10 Hz → 5 Hz → 2 Hz with on-screen notice; never silent frame-dropping of alarm/mode elements |
| Offline behavior | Server loss > 2 s: full-screen gray veil "LIVE DATA LOST — plant control unaffected — use plant console", auto-reconnect |

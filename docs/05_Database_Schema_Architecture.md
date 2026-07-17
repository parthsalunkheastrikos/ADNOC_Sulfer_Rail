# Database Schema & Architecture Design

## ProAI Closed-Loop Sulfur Loading Optimization Platform

| Field | Value |
|---|---|
| Document ID | DBA-PROAI-SRL-005 |
| Version | 1.0 |
| Parent | PRD-PROAI-SRL-001, TSD-PROAI-SRL-004 |
| Engine | PostgreSQL 16 + TimescaleDB 2.x (self-hosted, plant L3, primary + streaming replica) |

---

## 1. Architecture Rationale

**Why TimescaleDB (single engine) rather than a specialist TSDB + separate RDBMS:**

- The workload is **high-write time-series (~1,200–2,500 tag-updates/s)** *joined against* relational entities (wagons, trains, operators, models, alarms). Hypertables give time-series write/compression performance; plain tables give ACID relational integrity; both in one engine, one backup story, one security surface — all of which matter in an air-gapped L3 deployment.
- SQL is auditable by the client's own engineers and the CAO — no proprietary query DSL in the audit path.
- Continuous aggregates serve dashboard rollups without a second analytics store; DMZ replication is native (logical replication of selected schemas).

**Write path:** sensors → edge quality-stamping → Kafka topic `slo.telemetry` → batched `COPY`-style inserts (per-second microbatches, ≥ 5,000 rows/insert capability) → hypertables. The Control Core **never blocks on the database** — decision records are fire-and-forget to Kafka; the DB is downstream of the bus, so DB latency can never violate the 100 ms loop (NFR-01).

**Storage tiers:**

| Tier | Contents | Resolution | Retention |
|---|---|---|---|
| Hot (NVMe) | Raw telemetry chunks | native (10 Hz / 1 Hz) | 90 days uncompressed 7 d, then columnar-compressed |
| Warm (SSD) | Compressed chunks + continuous aggregates | 1 s / 1 min / 1 h rollups | 2 years |
| Audit (SSD, replicated + WORM export) | Layers 2–4: decisions, operator actions, security events, per-wagon records | full | **5 years minimum** (post-incident/audit requirement); monthly signed export to DMZ WORM object store |

---

## 2. Schema Overview

```
schema slo_core   : reference/relational (trains, wagons, tags, users, models, config)
schema slo_ts     : hypertables (telemetry, control loop, health)
schema slo_audit  : append-only, hash-chained (commands, operator actions, security)
schema slo_agg    : continuous aggregates (dashboards/reports)
```

---

## 3. DDL — Reference Schema (`slo_core`)

```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA slo_core; CREATE SCHEMA slo_ts; CREATE SCHEMA slo_audit; CREATE SCHEMA slo_agg;

-- Canonical tag dictionary (versioned; the contract between OT and platform)
CREATE TABLE slo_core.tag (
    tag_id          smallint PRIMARY KEY,
    tag_name        text NOT NULL UNIQUE,          -- 'slo.conv1.belt_weigher.mass_flow'
    source_address  text NOT NULL,                 -- OPC-UA NodeId / Modbus register
    unit            text NOT NULL,                 -- 't/h', 'km/h', 'mm', '%'
    datatype        text NOT NULL CHECK (datatype IN ('float','int','bool','enum')),
    expected_period_ms integer NOT NULL,           -- staleness rule = 3x this
    range_low       double precision,
    range_high      double precision,
    max_roc_per_s   double precision,              -- rate-of-change validation
    control_critical boolean NOT NULL DEFAULT false,
    dict_version    text NOT NULL,
    valid_from      timestamptz NOT NULL DEFAULT now(),
    valid_to        timestamptz
);

CREATE TABLE slo_core.train (
    train_id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    train_code      text NOT NULL,                 -- 'ETR-1142'
    scheduled_at    timestamptz,
    arrived_at      timestamptz,
    departed_at     timestamptz,
    wagon_count     smallint,
    planned_tonnage double precision,
    status          text NOT NULL DEFAULT 'PLANNED'
        CHECK (status IN ('PLANNED','ARRIVED','LOADING','COMPLETE','ABORTED'))
);

CREATE TABLE slo_core.wagon (
    wagon_uid       text PRIMARY KEY,              -- RFID/AEI identity 'R-88231'
    wagon_class     text NOT NULL,
    rated_payload_t double precision NOT NULL DEFAULT 100.0,
    tare_weight_t   double precision NOT NULL,
    hopper_length_m double precision NOT NULL DEFAULT 14.2,
    rim_height_m    double precision NOT NULL,
    last_calibrated timestamptz
);

CREATE TABLE slo_core.app_user (
    user_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username        text NOT NULL UNIQUE,
    display_name    text NOT NULL,
    role            text NOT NULL CHECK (role IN
                    ('SCO','RLE','CI_ENGINEER','CAO','ADMIN','READONLY')),
    badge_id        text UNIQUE,
    active          boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE slo_core.model_version (
    model_id        uuid PRIMARY KEY,
    model_kind      text NOT NULL CHECK (model_kind IN
                    ('MPC_TUNING','RL_POLICY','ESTIMATOR','TWIN_CALIBRATION','DENSITY_EST')),
    semver          text NOT NULL,
    artifact_sha256 text NOT NULL,
    signature       text NOT NULL,                 -- cosign signature, verified at load
    trained_on_range tstzrange,
    gate_a2_delta_pp double precision,             -- reproduced twin-regression result
    approved_by     uuid REFERENCES slo_core.app_user(user_id),
    approved_at     timestamptz,
    deployed_at     timestamptz,
    retired_at      timestamptz,
    UNIQUE (model_kind, semver)
);

-- Declarative safety envelope: dual-approval config (PRD FR-4.2 / constraint 4)
CREATE TABLE slo_core.constraint_set (
    constraint_set_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version         text NOT NULL UNIQUE,
    body            jsonb NOT NULL,                -- limits, envelopes, SPI thresholds
    body_sha256     text NOT NULL,
    proposed_by     uuid NOT NULL REFERENCES slo_core.app_user(user_id),
    approved_by     uuid REFERENCES slo_core.app_user(user_id),  -- must differ (trigger)
    approved_at     timestamptz,
    active_from     timestamptz,
    active_to       timestamptz,
    CONSTRAINT dual_control CHECK (approved_by IS NULL OR approved_by <> proposed_by)
);
```

---

## 4. DDL — Time-Series Schema (`slo_ts`)

### 4.1 Raw telemetry (narrow hypertable — the workhorse)

```sql
CREATE TABLE slo_ts.telemetry (
    ts              timestamptz NOT NULL,          -- source timestamp (PTP-disciplined)
    tag_id          smallint NOT NULL REFERENCES slo_core.tag(tag_id),
    value           double precision,
    quality         smallint NOT NULL DEFAULT 0,   -- 0 GOOD,1 STALE,2 RANGE,3 ROC,4 XCHK,5 COMMS
    ingest_ts       timestamptz NOT NULL DEFAULT now()   -- skew observability
);
SELECT create_hypertable('slo_ts.telemetry','ts',
       chunk_time_interval => INTERVAL '4 hours');
CREATE INDEX ON slo_ts.telemetry (tag_id, ts DESC);

ALTER TABLE slo_ts.telemetry SET (timescaledb.compress,
       timescaledb.compress_segmentby = 'tag_id',
       timescaledb.compress_orderby   = 'ts DESC');
SELECT add_compression_policy('slo_ts.telemetry', INTERVAL '7 days');
SELECT add_retention_policy ('slo_ts.telemetry', INTERVAL '90 days');
-- (1s/1min/1h continuous aggregates in slo_agg retain 2y — see §6)
```

### 4.2 Per-wagon loading record (the KPI system of record; audit-tier retention)

```sql
CREATE TABLE slo_ts.wagon_load_event (
    ts                  timestamptz NOT NULL,      -- wagon-exit (fill complete) time
    load_event_id       uuid NOT NULL DEFAULT gen_random_uuid(),
    train_id            bigint NOT NULL REFERENCES slo_core.train(train_id),
    wagon_uid           text   NOT NULL REFERENCES slo_core.wagon(wagon_uid),
    wagon_seq           smallint NOT NULL,          -- position in consist 1..110
    control_mode        text NOT NULL CHECK (control_mode IN
                        ('MANUAL','ADVISORY','SHADOW','AUTONOMOUS','FALLBACK','MIXED')),
    -- mass & volume
    tare_weight_t       double precision NOT NULL,
    measured_weight_t   double precision,           -- WIM net (post-chute) — ground truth
    weight_source       text CHECK (weight_source IN ('WIM','WEIGHBRIDGE','ESTIMATED')),
    calculated_volume_m3 double precision,          -- LiDAR volumetric integral
    est_bulk_density_tpm3 double precision,         -- measured_weight / calculated_volume
    utilization_pct     double precision,           -- net / rated * 100
    predicted_weight_t  double precision,           -- model terminal prediction @50% fill
    prediction_err_t    double precision,
    -- control aggregates over this wagon's fill window
    fill_start_ts       timestamptz NOT NULL,
    fill_end_ts         timestamptz NOT NULL,
    applied_velocity_mean_kmh double precision,     -- mean applied creep speed
    applied_velocity_min_kmh  double precision,
    applied_velocity_max_kmh  double precision,
    conveyor_feed_rate_mean_tph double precision,
    conveyor_feed_rate_max_tph  double precision,
    spill_probability_index_max double precision,   -- max SPI during window
    spi_curtailments    smallint NOT NULL DEFAULT 0,
    overload_flag       boolean NOT NULL DEFAULT false,
    spill_flag          boolean NOT NULL DEFAULT false,
    freeboard_min_m     double precision,           -- closest crest-to-rim approach
    profile_snapshot    jsonb,                      -- 142-bin final h(x) profile
    model_id            uuid REFERENCES slo_core.model_version(model_id),
    constraint_set_id   uuid REFERENCES slo_core.constraint_set(constraint_set_id),
    PRIMARY KEY (ts, load_event_id)
);
SELECT create_hypertable('slo_ts.wagon_load_event','ts',
       chunk_time_interval => INTERVAL '7 days');
CREATE INDEX ON slo_ts.wagon_load_event (train_id, wagon_seq);
CREATE INDEX ON slo_ts.wagon_load_event (wagon_uid, ts DESC);
-- Retention: 5 years (audit tier). No retention policy; monthly export+verify job.
```

### 4.3 Control-loop decision log (Layer 2 audit; 10 Hz during AUTONOMOUS)

```sql
CREATE TABLE slo_ts.control_decision (
    ts                  timestamptz NOT NULL,       -- loop tick time
    seq                 bigint NOT NULL,            -- monotonic command sequence
    control_mode        text NOT NULL,
    -- inputs (state estimate at solve time)
    est_belt_inventory_t   double precision,
    est_bin_level_t        double precision,
    est_wagon_fill_t       double precision,
    est_train_speed_kmh    double precision,
    est_boundary_eta_s     double precision,
    state_vector_sha256    text NOT NULL,           -- full input vector hash (replay key)
    -- outputs
    applied_velocity_kmh   double precision,        -- commanded creep speed request
    conveyor_feed_rate_tph double precision,        -- commanded feed request
    chute_gate_cmd         double precision,        -- 0..1
    spill_probability_index double precision NOT NULL,
    -- solver & safety diagnostics
    solver_status       text NOT NULL,              -- OPTIMAL/SUBOPT/TIMEOUT/INFEASIBLE
    solve_time_ms       double precision NOT NULL,
    loop_latency_ms     double precision NOT NULL,  -- sample→publish (NFR-01 evidence)
    envelope_clips      jsonb,                      -- which constraints clipped what
    plc_ack_status      text,                       -- APPLIED/REJECTED:<reason>/TIMEOUT
    model_id            uuid,
    PRIMARY KEY (ts, seq)
);
SELECT create_hypertable('slo_ts.control_decision','ts',
       chunk_time_interval => INTERVAL '2 hours');
ALTER TABLE slo_ts.control_decision SET (timescaledb.compress,
       timescaledb.compress_orderby = 'ts DESC, seq DESC');
SELECT add_compression_policy('slo_ts.control_decision', INTERVAL '3 days');
-- Retention: 5 years compressed (≈ 3.6M rows/loading-day; compresses ~20:1)
```

### 4.4 System health

```sql
CREATE TABLE slo_ts.system_health (
    ts              timestamptz NOT NULL,
    component       text NOT NULL,     -- 'edge-a','edge-b','opcua-conduit','mqtt','db','ui'
    metric          text NOT NULL,     -- 'heartbeat','cpu','loop_p99_ms','failover','clock_skew_ms'
    value           double precision,
    status          text CHECK (status IN ('OK','DEGRADED','FAULT')),
    detail          jsonb,
    PRIMARY KEY (ts, component, metric)
);
SELECT create_hypertable('slo_ts.system_health','ts', chunk_time_interval => INTERVAL '1 day');
SELECT add_retention_policy('slo_ts.system_health', INTERVAL '2 years');
```

---

## 5. DDL — Audit Schema (`slo_audit`, append-only + hash-chained)

```sql
-- Layer 3: operator actions (overrides, mode changes, acks, config edits)
CREATE TABLE slo_audit.operator_action (
    ts              timestamptz NOT NULL,
    action_id       bigint GENERATED ALWAYS AS IDENTITY,
    user_id         uuid NOT NULL REFERENCES slo_core.app_user(user_id),
    station         text NOT NULL,                  -- console/host identity
    action          text NOT NULL CHECK (action IN
                    ('LOGIN','LOGOUT','TAKE_MANUAL','RESUME_AUTO_ARM','RESUME_AUTO_CONFIRM',
                     'RESUME_AUTO_ABORT','MODE_CHANGE','ALARM_ACK','ALARM_SHELVE',
                     'SETPOINT_EDIT','CONSTRAINT_PROPOSE','CONSTRAINT_APPROVE',
                     'MODEL_APPROVE','OVERRIDE_REASON','EXPORT')),
    target          text,                           -- tag/alarm/model id acted upon
    detail          jsonb NOT NULL DEFAULT '{}',    -- e.g. takeover latency, snapshot id
    trigger_source  text CHECK (trigger_source IN ('UI','HW_BUTTON','API','SYSTEM')),
    prev_hash       bytea NOT NULL,                 -- hash chain (tamper evidence)
    row_hash        bytea NOT NULL,
    PRIMARY KEY (ts, action_id)
);
SELECT create_hypertable('slo_audit.operator_action','ts', chunk_time_interval => INTERVAL '7 days');

-- Layer 4: security & system events (forwarded to SIEM; kept locally too)
CREATE TABLE slo_audit.security_event (
    ts              timestamptz NOT NULL,
    event_id        bigint GENERATED ALWAYS AS IDENTITY,
    severity        text NOT NULL CHECK (severity IN ('INFO','WARN','HIGH','CRITICAL')),
    category        text NOT NULL,   -- AUTH/CERT/NET/DEPLOY/INTEGRITY/CONDUIT
    source          text NOT NULL,
    message         text NOT NULL,
    detail          jsonb NOT NULL DEFAULT '{}',
    prev_hash       bytea NOT NULL,
    row_hash        bytea NOT NULL,
    PRIMARY KEY (ts, event_id)
);
SELECT create_hypertable('slo_audit.security_event','ts', chunk_time_interval => INTERVAL '7 days');

-- Alarms & events (IEC 62682 lifecycle)
CREATE TABLE slo_audit.alarm_event (
    ts              timestamptz NOT NULL,
    alarm_event_id  bigint GENERATED ALWAYS AS IDENTITY,
    alarm_code      text NOT NULL,                  -- 'SPI_HIGH','OVERRIDE_CONFIRM_TIMEOUT',...
    priority        text NOT NULL CHECK (priority IN ('CRITICAL','HIGH','MEDIUM','LOW')),
    lifecycle       text NOT NULL CHECK (lifecycle IN
                    ('RAISE','ACK','SHELVE','UNSHELVE','CLEAR','SUPPRESS_STATE')),
    train_id        bigint,
    wagon_uid       text,
    acked_by        uuid REFERENCES slo_core.app_user(user_id),
    detail          jsonb NOT NULL DEFAULT '{}',
    PRIMARY KEY (ts, alarm_event_id)
);
SELECT create_hypertable('slo_audit.alarm_event','ts', chunk_time_interval => INTERVAL '7 days');
```

### 5.1 Append-only + hash-chain enforcement

```sql
-- No UPDATE/DELETE ever on audit tables (defense in depth: also revoked at role level
-- and enforced by hypertable ACLs; DB superuser access is itself badge-controlled + logged)
CREATE OR REPLACE FUNCTION slo_audit.block_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit tables are append-only'; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_upd_del BEFORE UPDATE OR DELETE ON slo_audit.operator_action
    FOR EACH STATEMENT EXECUTE FUNCTION slo_audit.block_mutation();
CREATE TRIGGER no_upd_del BEFORE UPDATE OR DELETE ON slo_audit.security_event
    FOR EACH STATEMENT EXECUTE FUNCTION slo_audit.block_mutation();

-- Hash chain: row_hash = sha256(prev_hash || canonical_json(row))
CREATE OR REPLACE FUNCTION slo_audit.chain_hash() RETURNS trigger AS $$
DECLARE last_hash bytea;
BEGIN
    EXECUTE format('SELECT row_hash FROM %I.%I ORDER BY ts DESC, %I DESC LIMIT 1',
                   TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_ARGV[0]) INTO last_hash;
    NEW.prev_hash := COALESCE(last_hash, '\x00'::bytea);
    NEW.row_hash  := digest(NEW.prev_hash ||
                     convert_to(row_to_json(NEW)::text,'UTF8'), 'sha256');
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER chain BEFORE INSERT ON slo_audit.operator_action
    FOR EACH ROW EXECUTE FUNCTION slo_audit.chain_hash('action_id');
CREATE TRIGGER chain BEFORE INSERT ON slo_audit.security_event
    FOR EACH ROW EXECUTE FUNCTION slo_audit.chain_hash('event_id');
-- Nightly job re-verifies chains and writes an anchor hash to the DMZ WORM store.
```

---

## 6. Continuous Aggregates (`slo_agg`) & Reporting

```sql
-- 1-second rollup of control-critical tags (drives trend strip beyond live buffer)
CREATE MATERIALIZED VIEW slo_agg.telemetry_1s
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 second', ts) AS bucket, tag_id,
       avg(value) AS v_avg, min(value) AS v_min, max(value) AS v_max,
       last(value, ts) AS v_last,
       count(*) FILTER (WHERE quality <> 0) AS bad_samples
FROM slo_ts.telemetry GROUP BY bucket, tag_id;
SELECT add_continuous_aggregate_policy('slo_agg.telemetry_1s',
       start_offset => INTERVAL '2 hours', end_offset => INTERVAL '2 seconds',
       schedule_interval => INTERVAL '1 second');
SELECT add_retention_policy('slo_agg.telemetry_1s', INTERVAL '2 years');
-- analogous telemetry_1m, telemetry_1h (2y retention)

-- Rolling utilization KPI (M-01)
CREATE MATERIALIZED VIEW slo_agg.utilization_by_train
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 day', ts) AS bucket, train_id, control_mode,
       count(*) AS wagons,
       avg(utilization_pct)                    AS util_mean,
       percentile_agg(utilization_pct)         AS util_pctiles,
       sum(measured_weight_t)                  AS net_tonnes,
       max(spill_probability_index_max)        AS spi_max,
       count(*) FILTER (WHERE overload_flag)   AS overloads,
       count(*) FILTER (WHERE spill_flag)      AS spills
FROM slo_ts.wagon_load_event GROUP BY bucket, train_id, control_mode;
```

---

## 7. Sizing, Performance & Operations

| Item | Figure |
|---|---|
| Sustained insert rate (design) | 2,500 rows/s telemetry + 10 rows/s decisions (loading) — microbatched; TimescaleDB comfortably 10× headroom on DB-A hardware |
| telemetry raw volume | ~90 M rows/day loading-day ≈ 4 GB/day raw → ~0.3 GB/day compressed |
| control_decision | 864 k rows per 24 h AUTONOMOUS ≈ 500 MB/day → ~25 MB compressed |
| Hot NVMe budget | 90 d × mixed ≈ 1.5 TB (fits 2×8 TB RAID-1 with 5× headroom) |
| HA | Streaming replication DB-A→DB-B (sync), automatic failover via Patroni; UI reads may degrade to replica; **Control Core has no DB dependency** |
| Backup | Nightly pgBackRest full+WAL to DMZ object store (one-way); quarterly restore drill |
| DMZ replica | Logical replication of `slo_agg` + `slo_ts.wagon_load_event` + report views only (no raw telemetry, no user table secrets) |
| Access control | DB roles mirror RBAC: `r_control_write` (Kafka sink only), `r_ui_read`, `r_audit_read` (CAO), `r_admin` (badge-controlled, sessions logged to slo_audit.security_event) |
| Row-level security | Enabled on audit schema; CAO reads all, others read own actions |

## 8. Post-Incident Replay Contract (PRD FR-6.5)

A replay of window `[t0,t1]` is the join of: `telemetry` (all tags), `control_decision` (with `state_vector_sha256` verifying the estimator inputs), `operator_action`, `alarm_event`, `system_health`, pinned `model_version` + `constraint_set` rows. The replay tool re-executes the Control Core against logged inputs and asserts bit-equality of decision outputs (deterministic solver build) — proving the log is sufficient and untampered. Target: any 24 h window reconstructed ≤ 15 min.

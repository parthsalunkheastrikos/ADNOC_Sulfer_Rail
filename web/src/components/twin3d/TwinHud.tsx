"use client";
import { useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useEngineFrame } from "@/lib/sim/useEngineFrame";
import { WAGON_HOPPER_OPENING_M, WAGON_RATED_PAYLOAD_T, SURGE_BIN_CAPACITY_T, PEAK_LOADING_RATE_TPH } from "@/lib/sim/constants";
import { SpiSparkline } from "@/components/console/SpiSparkline";
import { ConsistMinimap } from "@/components/console/ConsistMinimap";
import { ChartActions } from "@/components/ai/ChartActions";
import { useSimStore } from "@/lib/store/useSimStore";

interface HudReadout {
  seq: number;
  wagonCount: number;
  trainCode: string;
  fillT: number;
  finalT: number;
  errT: number;
  gateOpeningPct: number;
  beltRateActualTph: number;
  speedKmh: number;
  speedSetpointKmh: number;
  surgeBinT: number;
  boundaryEtaS: number;
  spi: number;
  totalCompletedCount: number;
  totalTonnageT: number;
}

const RING_R = 30;
const RING_CIRC = 2 * Math.PI * RING_R;

function FillRing({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const offset = RING_CIRC * (1 - clamped / 100);
  const color = clamped >= 99 ? "#2c8c86" : clamped >= 96 ? "#d9a839" : "#6b7280";
  return (
    <svg width={72} height={72} viewBox="0 0 72 72" className="shrink-0">
      <circle cx={36} cy={36} r={RING_R} fill="none" stroke="var(--border-subtle)" strokeWidth={6} />
      <circle
        cx={36}
        cy={36}
        r={RING_R}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={RING_CIRC}
        strokeDashoffset={offset}
        transform="rotate(-90 36 36)"
        style={{ transition: "stroke-dashoffset 0.3s ease" }}
      />
      <text
        x={36}
        y={36}
        textAnchor="middle"
        dominantBaseline="central"
        className="tnum"
        fill="var(--ink-primary)"
        fontSize={15}
        fontWeight={600}
      >
        {clamped.toFixed(0)}%
      </text>
    </svg>
  );
}

function ProcessBar({ label, pct, tone = "default" }: { label: string; pct: number; tone?: "default" | "warn" }) {
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-[10px] text-ink-tertiary">
        <span>{label}</span>
        <span className="tnum text-ink-secondary">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-bg-sunken">
        <div
          className={`h-full rounded-full ${tone === "warn" ? "bg-alarm-high" : "bg-[#d9a839]"}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Left-docked live-KPI overlay for the digital twin (Phase 2b) — the same
 * TwinLiteEngine snapshot the console pages read, so these numbers move in
 * lockstep with the Loading Console's Active Wagon panel and KPI tiles.
 */
export function TwinHud() {
  const [collapsed, setCollapsed] = useState(false);
  const [r, setR] = useState<HudReadout | null>(null);
  const connection = useSimStore((s) => s.connection);

  useEngineFrame((engine) => {
    const { finalT, errT } = engine.projection();
    const speedMs = Math.max(engine.speedKmh / 3.6, 0.02);
    const boundaryEtaS = Math.max(0, WAGON_HOPPER_OPENING_M - engine.wagonProgressM) / speedMs;
    setR({
      seq: engine.activeSeq,
      wagonCount: engine.wagonCount,
      trainCode: engine.trainCode,
      fillT: engine.activeWagon.fillT,
      finalT,
      errT,
      gateOpeningPct: engine.gateOpeningPct * 100,
      beltRateActualTph: engine.beltRateActualTph,
      speedKmh: engine.speedKmh,
      speedSetpointKmh: engine.speedSetpointKmh,
      surgeBinT: engine.surgeBinT,
      boundaryEtaS,
      spi: engine.spi,
      totalCompletedCount: engine.totalCompletedCount,
      totalTonnageT: engine.totalTonnageT,
    });
  }, 8);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="absolute left-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle bg-bg-raised/85 text-ink-secondary shadow-lg backdrop-blur-md hover:bg-bg-hover"
        title="Show live HUD"
      >
        <CaretRight size={14} />
      </button>
    );
  }

  const utilizationPct = r ? (r.fillT / WAGON_RATED_PAYLOAD_T) * 100 : 0;
  const spiTone = r && r.spi > 0.02 ? "text-alarm-high" : r && r.spi > 0.01 ? "text-alarm-medium" : "text-ink-secondary";

  return (
    <div
      className={`panel-shadow absolute left-4 top-4 bottom-4 z-10 flex w-[290px] flex-col gap-3 overflow-y-auto rounded-lg border border-border-subtle bg-bg-panel/85 p-3 backdrop-blur-md ${
        connection !== "LIVE" ? "quality-stale" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="eyebrow">Digital twin · live</div>
        <div className="flex items-center gap-0.5">
          <ChartActions chartId="twin-hud" />
          <button
            onClick={() => setCollapsed(true)}
            className="rounded p-1 text-ink-tertiary hover:bg-bg-hover hover:text-ink-secondary"
            title="Collapse HUD"
          >
            <CaretLeft size={13} />
          </button>
        </div>
      </div>

      {/* Active wagon card */}
      <div className="rounded-md border border-border-subtle bg-bg-raised/70 p-2.5">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="tnum text-sm font-semibold text-ink-primary">
            Wagon {r?.seq ?? "—"} / {r?.wagonCount ?? "—"}
          </span>
          <span className="tnum text-[10px] text-ink-tertiary">{r?.trainCode ?? "—"}</span>
        </div>
        <div className="flex items-center gap-3">
          <FillRing pct={utilizationPct} />
          <div className="flex-1 space-y-0.5">
            <div className="tnum text-xs text-ink-secondary">
              <span className="font-semibold text-ink-primary">{r?.fillT.toFixed(1) ?? "—"} t</span>
              <span className="text-ink-tertiary"> → proj </span>
              <span className="font-semibold text-[#d9a839]">
                {r?.finalT.toFixed(1) ?? "—"}±{r?.errT.toFixed(1) ?? "—"}
              </span>
            </div>
            <div className="tnum text-[10px] text-ink-tertiary">util {utilizationPct.toFixed(1)}%</div>
          </div>
        </div>
      </div>

      {/* Process strip */}
      <div className="space-y-2 rounded-md border border-border-subtle bg-bg-raised/70 p-2.5">
        <div className="eyebrow">Process</div>
        <ProcessBar label="Gate opening" pct={r?.gateOpeningPct ?? 0} />
        <div className="flex items-center justify-between text-[10px] text-ink-tertiary">
          <span>Belt flow</span>
          <span className="tnum text-ink-secondary">
            {r?.beltRateActualTph.toFixed(0) ?? "—"} / {PEAK_LOADING_RATE_TPH} t/h
          </span>
        </div>
        <div className="flex items-center justify-between text-[10px] text-ink-tertiary">
          <span>Train speed</span>
          <span className="tnum text-ink-secondary">
            {r?.speedKmh.toFixed(2) ?? "—"} <span className="text-ink-tertiary">(set {r?.speedSetpointKmh.toFixed(2) ?? "—"})</span> km/h
          </span>
        </div>
        <ProcessBar
          label="Surge bin"
          pct={r ? (r.surgeBinT / SURGE_BIN_CAPACITY_T) * 100 : 0}
          tone={r && r.surgeBinT / SURGE_BIN_CAPACITY_T > 0.9 ? "warn" : "default"}
        />
        <div className="flex items-center justify-between text-[10px] text-ink-tertiary">
          <span>Boundary in</span>
          <span className="tnum text-ink-secondary">{r ? r.boundaryEtaS.toFixed(1) : "—"} s</span>
        </div>
      </div>

      {/* SPI */}
      <div className="rounded-md border border-border-subtle bg-bg-raised/70 p-2.5">
        <div className="mb-1 flex items-center justify-between">
          <span className="eyebrow">Spill-risk score (SPI)</span>
          <span className={`tnum text-xs font-semibold ${spiTone}`}>{r?.spi.toFixed(3) ?? "—"}</span>
        </div>
        <SpiSparkline width={258} height={28} />
      </div>

      {/* Train progress */}
      <div className="rounded-md border border-border-subtle bg-bg-raised/70 p-2.5">
        <div className="mb-1 flex items-center justify-between">
          <span className="eyebrow">Train progress</span>
          <span className="tnum text-[10px] text-ink-tertiary">
            session: {r?.totalCompletedCount ?? 0} wagons · {r?.totalTonnageT.toFixed(0) ?? 0} t
          </span>
        </div>
        <div className="h-6">
          <ConsistMinimap />
        </div>
      </div>
    </div>
  );
}

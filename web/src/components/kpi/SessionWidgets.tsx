"use client";
import { useState } from "react";
import { useEngineFrame } from "@/lib/sim/useEngineFrame";
import { useCanvasFrame } from "@/lib/sim/useCanvasFrame";
import { canvasMono } from "@/lib/sim/canvasFonts";
import { getCanvasTheme, withAlpha } from "@/lib/sim/canvasTheme";
import { useSimStore } from "@/lib/store/useSimStore";
import { FACILITY_DESIGN_CAPACITY_T_PER_DAY } from "@/lib/sim/constants";

/**
 * Session-long implied loading-rate trend (Phase 4b) — the live process
 * history ring buffer only covers the last ~180s, so a true "session"
 * series is derived from wagon completion cadence instead: net tonnage /
 * time-since-previous-wagon, per completed wagon. Honest about being
 * derived, not a raw sensor feed (matches the app's own latency-honesty
 * discipline elsewhere).
 */
export function LoadingRateTrend() {
  const canvasRef = useCanvasFrame((ctx, w, h, engine) => {
    const theme = getCanvasTheme();
    ctx.clearRect(0, 0, w, h);
    const wagons = engine.completed.slice(-40);
    if (wagons.length < 3) {
      ctx.fillStyle = theme.inkTertiary;
      ctx.font = canvasMono(11);
      ctx.fillText("Awaiting more completed wagons…", 8, h / 2);
      return;
    }

    const rates: number[] = [];
    for (let i = 1; i < wagons.length; i++) {
      const dtH = (wagons[i].completedAtMs - wagons[i - 1].completedAtMs) / 3_600_000;
      rates.push(dtH > 0 ? wagons[i].netT / dtH : 0);
    }
    const marginL = 4;
    const marginR = 50;
    const marginT = 10;
    const marginB = 6;
    const plotW = w - marginL - marginR;
    const plotH = h - marginT - marginB;
    const filteredRates = rates.filter((r) => r > 0);
    const minRate = filteredRates.length > 0 ? Math.min(...filteredRates) : 0;
    const maxRate = rates.length > 0 ? Math.max(...rates) : 1500;
    const diff = maxRate - minRate;
    const padding = diff > 0 ? diff * 0.15 : 100;
    const minV = Math.max(0, minRate - padding);
    const maxV = maxRate + padding;

    const toY = (v: number) => {
      if (maxV === minV) return marginT + plotH / 2;
      return marginT + (1 - (v - minV) / (maxV - minV)) * plotH;
    };
    const stepX = plotW / (rates.length - 1);

    const grad = ctx.createLinearGradient(0, marginT, 0, marginT + plotH);
    grad.addColorStop(0, withAlpha(theme.seriesPrimary, 0.32));
    grad.addColorStop(1, withAlpha(theme.seriesPrimary, 0.02));

    ctx.beginPath();
    ctx.moveTo(marginL, marginT + plotH);
    rates.forEach((v, i) => ctx.lineTo(marginL + i * stepX, toY(v)));
    ctx.lineTo(marginL + (rates.length - 1) * stepX, marginT + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    rates.forEach((v, i) => {
      const x = marginL + i * stepX;
      const y = toY(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = theme.seriesPrimary;
    ctx.lineWidth = 1.75;
    ctx.stroke();

    const avg = rates.reduce((s, v) => s + v, 0) / rates.length;
    ctx.strokeStyle = withAlpha(theme.inkDim, 0.4);
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(marginL, toY(avg));
    ctx.lineTo(marginL + plotW, toY(avg));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = theme.ink;
    ctx.font = canvasMono(11, true);
    ctx.fillText(`${avg.toFixed(0)} t/h avg`, marginL + plotW + 6, toY(avg) + 3);
  }, 5);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}

interface TrainReadout {
  seq: number;
  wagonCount: number;
  trainCode: string;
  avgWagonMs: number;
}

/** Current train % complete, wagons done/total, and a projected completion time at the recent per-wagon cadence. */
export function TrainCompletionCard() {
  const [r, setR] = useState<TrainReadout | null>(null);

  useEngineFrame((engine) => {
    const recent = engine.completed.slice(-10).filter((w) => w.seq <= engine.activeSeq);
    // Only average over consecutive wagons of the *current* train (a train
    // rollover resets activeSeq to 1, which would otherwise poison the
    // cadence estimate with a huge fake gap).
    let avgWagonMs = 0;
    const sameTrain = recent.filter((_, i, arr) => i === 0 || arr[i].seq > arr[i - 1].seq);
    if (sameTrain.length >= 2) {
      avgWagonMs =
        (sameTrain[sameTrain.length - 1].completedAtMs - sameTrain[0].completedAtMs) / (sameTrain.length - 1);
    }
    setR({ seq: engine.activeSeq, wagonCount: engine.wagonCount, trainCode: engine.trainCode, avgWagonMs });
  }, 2);

  const done = r ? r.seq - 1 : 0;
  const pct = r ? (done / r.wagonCount) * 100 : 0;
  const remaining = r ? r.wagonCount - done : 0;
  const etaMin = r && r.avgWagonMs > 0 ? (remaining * r.avgWagonMs) / 60_000 : null;

  return (
    <div className="rounded-md border border-border-subtle bg-bg-raised px-3.5 py-3">
      <div className="eyebrow">Train completion</div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="tnum text-xl font-semibold text-ink-primary">{done}</span>
        <span className="text-xs text-ink-tertiary">/ {r?.wagonCount ?? "—"} wagons</span>
        <span className="tnum ml-auto text-xs text-ink-tertiary">{r?.trainCode ?? "—"}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-sunken">
        <div className="h-full rounded-full bg-[#d9a839] transition-[width]" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-tertiary">
        <span className="tnum">{pct.toFixed(0)}% complete</span>
        <span className="tnum">{etaMin != null ? `ETA ~${etaMin.toFixed(0)} min` : "ETA —"}</span>
      </div>
    </div>
  );
}

/** Today's tonnage against the Shah/Habshan → Ruwais facility's real ~22,000 t/day design capacity. */
export function CapacityCard() {
  const kpi = useSimStore((s) => s.kpi);
  const pct = (kpi.tonnageToday / FACILITY_DESIGN_CAPACITY_T_PER_DAY) * 100;

  return (
    <div className="rounded-md border border-border-subtle bg-bg-raised px-3.5 py-3">
      <div className="eyebrow">Session vs. design capacity</div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="tnum text-xl font-semibold text-ink-primary">{kpi.tonnageToday.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        <span className="text-xs text-ink-tertiary">/ {FACILITY_DESIGN_CAPACITY_T_PER_DAY.toLocaleString()} t/day</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-sunken">
        <div
          className={`h-full rounded-full transition-[width] ${pct >= 100 ? "bg-mode-auto" : "bg-[#d9a839]"}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <div className="mt-1.5 text-[11px] text-ink-tertiary">
        <span className="tnum">{pct.toFixed(1)}%</span> of the facility&apos;s real design throughput
      </div>
    </div>
  );
}

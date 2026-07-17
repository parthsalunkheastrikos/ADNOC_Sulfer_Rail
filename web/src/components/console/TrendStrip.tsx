"use client";
import { useRef, type MouseEvent } from "react";
import { useCanvasFrame } from "@/lib/sim/useCanvasFrame";
import {
  drawTimeAxis,
  drawSeries,
  historyStartOffsetS,
  sampleAtOffset,
  secondsOffsetForX,
  xForSecondsOffset,
  PAST_S,
  FUTURE_S,
} from "@/lib/sim/trendLayout";
import { drawTooltip } from "@/lib/sim/useCanvasHover";
import { canvasMono } from "@/lib/sim/canvasFonts";
import { SURGE_BIN_CAPACITY_T } from "@/lib/sim/constants";
import { getCanvasTheme, withAlpha } from "@/lib/sim/canvasTheme";
import { Panel, PanelHeader } from "@/components/shell/Panel";
import { ChartActions } from "@/components/ai/ChartActions";

/** Shared across all 3 panes so the vertical time-cursor lines up identically in each — a hover in any one pane moves all three (Phase 4a). */
interface SharedHover {
  active: boolean;
  tRel: number;
}

function PaneLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2.5 pt-1.5 text-xs font-medium text-ink-secondary">{children}</div>;
}

/** Ref-safe hover handlers (react-hooks/refs requires ref access to stay inside an actual callback, not a plain helper invoked during render). */
function useHoverHandlers(hoverRef: React.RefObject<SharedHover>) {
  return {
    onMouseMove: (e: MouseEvent<HTMLCanvasElement>) => {
      const w = e.currentTarget.clientWidth;
      hoverRef.current = { active: true, tRel: secondsOffsetForX(w, e.nativeEvent.offsetX) };
    },
    onMouseLeave: () => {
      hoverRef.current = { ...hoverRef.current, active: false };
    },
  };
}

/** Draws the shared vertical cursor line at the hovered time offset, common to every pane. */
function drawCursor(ctx: CanvasRenderingContext2D, w: number, h: number, tRel: number, theme: ReturnType<typeof getCanvasTheme>) {
  const x = xForSecondsOffset(w, tRel);
  ctx.strokeStyle = withAlpha(theme.inkDim, 0.4);
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, h);
  ctx.stroke();
  ctx.setLineDash([]);
  return x;
}

function SpeedPane({ hoverRef }: { hoverRef: React.RefObject<SharedHover> }) {
  const canvasRef = useCanvasFrame((ctx, w, h, engine) => {
    const theme = getCanvasTheme();
    ctx.clearRect(0, 0, w, h);
    drawTimeAxis(ctx, w, h);
    const hist = engine.getHistory(PAST_S);
    const forecast = engine.getPlanForecast(FUTURE_S);
    const maxV = 1.3;
    const toY = (v: number) => h - 6 - (v / maxV) * (h - 12);

    const start = historyStartOffsetS(hist.speedActual.length);
    drawSeries(ctx, w, hist.speedSetpoint, start, 0, toY, theme.seriesTertiary, { dashed: true, lineWidth: 1 });
    drawSeries(ctx, w, hist.speedActual, start, 0, toY, theme.seriesPrimary, { lineWidth: 1.75 });
    drawSeries(ctx, w, forecast.speedPlan, 0, FUTURE_S, toY, theme.seriesPlan, { dashed: true, lineWidth: 1.5 });

    const hv = hoverRef.current;
    if (hv.active) {
      const x = drawCursor(ctx, w, h, hv.tRel, theme);
      const actual = hv.tRel <= 0 ? sampleAtOffset(hist.speedActual, start, 0, hv.tRel) : sampleAtOffset(forecast.speedPlan, 0, FUTURE_S, hv.tRel);
      const setpoint = hv.tRel <= 0 ? sampleAtOffset(hist.speedSetpoint, start, 0, hv.tRel) : null;
      drawTooltip(ctx, {
        x,
        y: h / 2,
        w: 118,
        canvasW: w,
        bg: theme.bgRaised,
        border: theme.borderSubtle,
        ink: theme.ink,
        inkDim: theme.inkDim,
        font: canvasMono(10.5),
        lines: [
          `t = ${hv.tRel >= 0 ? "+" : ""}${hv.tRel.toFixed(0)}s`,
          actual != null ? `${hv.tRel <= 0 ? "actual" : "plan"} ${actual.toFixed(2)} km/h` : "—",
          ...(setpoint != null ? [`setpoint ${setpoint.toFixed(2)} km/h`] : []),
        ],
      });
    }
  }, 24);
  const handlers = useHoverHandlers(hoverRef);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneLabel>Train speed (km/h) — actual · setpoint ···· · plan ⋯⋯</PaneLabel>
      <div className="min-h-0 flex-1">
        <canvas ref={canvasRef} className="block h-full w-full" {...handlers} />
      </div>
    </div>
  );
}

function FlowPane({ hoverRef }: { hoverRef: React.RefObject<SharedHover> }) {
  const canvasRef = useCanvasFrame((ctx, w, h, engine) => {
    const theme = getCanvasTheme();
    ctx.clearRect(0, 0, w, h);
    drawTimeAxis(ctx, w, h);
    const hist = engine.getHistory(PAST_S);
    const forecast = engine.getPlanForecast(FUTURE_S);
    const maxV = 2200;
    const toY = (v: number) => h - 6 - (v / maxV) * (h - 12);

    const start = historyStartOffsetS(hist.chuteFlow.length);
    drawSeries(ctx, w, hist.chuteFlow, start, 0, toY, theme.seriesPrimary, { lineWidth: 1.75 });
    drawSeries(ctx, w, hist.gatePlan, start, 0, toY, theme.seriesSecondary, { dashed: true, lineWidth: 1 });
    drawSeries(ctx, w, forecast.gatePlan, 0, FUTURE_S, toY, theme.seriesPlan, { dashed: true, lineWidth: 1.5 });

    const hv = hoverRef.current;
    if (hv.active) {
      const x = drawCursor(ctx, w, h, hv.tRel, theme);
      const flow = hv.tRel <= 0 ? sampleAtOffset(hist.chuteFlow, start, 0, hv.tRel) : null;
      const plan = hv.tRel <= 0 ? sampleAtOffset(hist.gatePlan, start, 0, hv.tRel) : sampleAtOffset(forecast.gatePlan, 0, FUTURE_S, hv.tRel);
      drawTooltip(ctx, {
        x,
        y: h / 2,
        w: 118,
        canvasW: w,
        bg: theme.bgRaised,
        border: theme.borderSubtle,
        ink: theme.ink,
        inkDim: theme.inkDim,
        font: canvasMono(10.5),
        lines: [
          `t = ${hv.tRel >= 0 ? "+" : ""}${hv.tRel.toFixed(0)}s`,
          ...(flow != null ? [`flow ${flow.toFixed(0)} t/h`] : []),
          plan != null ? `gate plan ${plan.toFixed(0)} t/h` : "—",
        ],
      });
    }
  }, 24);
  const handlers = useHoverHandlers(hoverRef);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneLabel>Chute flow (t/h) — actual · gate plan ····</PaneLabel>
      <div className="min-h-0 flex-1">
        <canvas ref={canvasRef} className="block h-full w-full" {...handlers} />
      </div>
    </div>
  );
}

function SpiBinPane({ hoverRef }: { hoverRef: React.RefObject<SharedHover> }) {
  const canvasRef = useCanvasFrame((ctx, w, h, engine) => {
    const theme = getCanvasTheme();
    ctx.clearRect(0, 0, w, h);
    drawTimeAxis(ctx, w, h);
    const hist = engine.getHistory(PAST_S);
    const forecast = engine.getPlanForecast(FUTURE_S);
    const maxSpi = 0.12;
    const toYSpi = (v: number) => h - 6 - (Math.min(v, maxSpi) / maxSpi) * (h - 12) * 0.55;
    const toYBin = (v: number) => h - 6 - (v / SURGE_BIN_CAPACITY_T) * (h - 12) * 0.4;

    // threshold guide lines
    ctx.strokeStyle = withAlpha(theme.alarmHigh, 0.4);
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(0, toYSpi(0.02));
    ctx.lineTo(w, toYSpi(0.02));
    ctx.stroke();
    ctx.strokeStyle = withAlpha(theme.alarmCritical, 0.5);
    ctx.beginPath();
    ctx.moveTo(0, toYSpi(0.1));
    ctx.lineTo(w, toYSpi(0.1));
    ctx.stroke();
    ctx.setLineDash([]);

    const start = historyStartOffsetS(hist.spi.length);
    drawSeries(ctx, w, hist.surgeBinLevel, start, 0, toYBin, theme.seriesTertiary, { lineWidth: 1 });
    drawSeries(ctx, w, hist.spi, start, 0, toYSpi, theme.seriesPrimary, { lineWidth: 1.75 });
    drawSeries(ctx, w, forecast.spiPlan, 0, FUTURE_S, toYSpi, theme.seriesPlan, { dashed: true, lineWidth: 1.5 });

    const hv = hoverRef.current;
    if (hv.active) {
      const x = drawCursor(ctx, w, h, hv.tRel, theme);
      const spi = hv.tRel <= 0 ? sampleAtOffset(hist.spi, start, 0, hv.tRel) : sampleAtOffset(forecast.spiPlan, 0, FUTURE_S, hv.tRel);
      const bin = hv.tRel <= 0 ? sampleAtOffset(hist.surgeBinLevel, start, 0, hv.tRel) : null;
      drawTooltip(ctx, {
        x,
        y: h / 2,
        w: 118,
        canvasW: w,
        bg: theme.bgRaised,
        border: theme.borderSubtle,
        ink: theme.ink,
        inkDim: theme.inkDim,
        font: canvasMono(10.5),
        lines: [
          `t = ${hv.tRel >= 0 ? "+" : ""}${hv.tRel.toFixed(0)}s`,
          spi != null ? `SPI ${spi.toFixed(3)}` : "—",
          ...(bin != null ? [`surge bin ${bin.toFixed(1)} t`] : []),
        ],
      });
    }
  }, 24);
  const handlers = useHoverHandlers(hoverRef);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PaneLabel>SPI (0.02/0.10 thresholds) · surge bin level (t)</PaneLabel>
      <div className="min-h-0 flex-1">
        <canvas ref={canvasRef} className="block h-full w-full" {...handlers} />
      </div>
    </div>
  );
}

export function TrendStrip() {
  const hoverRef = useRef<SharedHover>({ active: false, tRel: 0 });
  return (
    <Panel>
      <PanelHeader title="S-01 · Synchronized Trend Strip">
        <span className="tnum text-[11px] text-ink-tertiary">← now−120s · now · +30s plan →</span>
        <ChartActions chartId="trend-strip" />
      </PanelHeader>
      <div className="grid min-h-0 flex-1 grid-cols-3 divide-x divide-border-subtle">
        <SpeedPane hoverRef={hoverRef} />
        <FlowPane hoverRef={hoverRef} />
        <SpiBinPane hoverRef={hoverRef} />
      </div>
    </Panel>
  );
}

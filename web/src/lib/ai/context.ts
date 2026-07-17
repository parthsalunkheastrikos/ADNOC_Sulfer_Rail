"use client";
// Builds the compact JSON snapshot sent to the AI chat route alongside every
// message. Runs entirely client-side (it reads the browser-only engine
// singleton + zustand store) — the server route never touches the engine
// directly, it only ever sees this JSON. Keep this in sync with
// systemPrompt.ts's "Key concepts" section: a field the model can be asked
// about should be documented there.
import { getEngine } from "@/lib/sim/singleton";
import { useSimStore } from "@/lib/store/useSimStore";
import { getChartDataSlice, CHART_REGISTRY, type ChartId } from "./chartRegistry";

export interface AiContext {
  generatedAtSimMs: number;
  mode: string;
  connection: string;
  trainCode: string;
  wagonCount: number;
  activeWagon: {
    seq: number;
    uid: string;
    fillT: number;
    projectedFinalT: number;
    projectedErrT: number;
    minFreeboardM: number;
    spillFlag: boolean;
  };
  kpi: ReturnType<typeof useSimStore.getState>["kpi"];
  overrideCount24h: number;
  recentWagons: {
    seq: number;
    utilizationPct: number;
    controlMode: string;
    spillFlag: boolean;
    overloadFlag: boolean;
  }[];
  alarms: {
    code: string;
    priority: string;
    message: string;
    lifecycle: string;
    raisedAt: number;
  }[];
  chartScope?: { id: ChartId; label: string; data: unknown };
}

export function buildAiContext(scope?: ChartId): AiContext {
  const engine = getEngine();
  const store = useSimStore.getState();
  const { finalT, errT } = engine.projection();
  const active = engine.activeWagon;

  const ctx: AiContext = {
    generatedAtSimMs: engine.simTimeMs,
    mode: store.mode,
    connection: store.connection,
    trainCode: engine.trainCode,
    wagonCount: engine.wagonCount,
    activeWagon: {
      seq: active.seq,
      uid: active.uid,
      fillT: Number(active.fillT.toFixed(2)),
      projectedFinalT: Number(finalT.toFixed(2)),
      projectedErrT: Number(errT.toFixed(2)),
      minFreeboardM: Number(active.minFreeboardM.toFixed(3)),
      spillFlag: active.spillFlag,
    },
    kpi: store.kpi,
    overrideCount24h: store.overrideCount24h,
    recentWagons: engine.completed.slice(-30).map((w) => ({
      seq: w.seq,
      utilizationPct: Number(w.utilizationPct.toFixed(2)),
      controlMode: w.controlMode,
      spillFlag: w.spillFlag,
      overloadFlag: w.overloadFlag,
    })),
    alarms: store.alarms.slice(0, 15).map((a) => ({
      code: a.code,
      priority: a.priority,
      message: a.message,
      lifecycle: a.lifecycle,
      raisedAt: a.raisedAt,
    })),
  };

  if (scope) {
    ctx.chartScope = {
      id: scope,
      label: CHART_REGISTRY[scope].label,
      data: getChartDataSlice(scope, engine, { kpi: store.kpi, mode: store.mode, overrideCount24h: store.overrideCount24h, alarms: store.alarms }),
    };
  }

  return ctx;
}

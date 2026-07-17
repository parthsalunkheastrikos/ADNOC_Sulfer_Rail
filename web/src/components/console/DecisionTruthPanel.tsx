"use client";
import { useState } from "react";
import { useSimStore } from "@/lib/store/useSimStore";
import { useEngineFrame } from "@/lib/sim/useEngineFrame";
import { Warning, Info } from "@phosphor-icons/react";

interface InsightData {
  mode: string;
  boundaryEtaS: number;
  committedT: number;
  projectedFillT: number;
  projectedErrT: number;
  spi: number;
}

export function DecisionTruthPanel() {
  const mode = useSimStore((s) => s.mode);
  const [data, setData] = useState<InsightData | null>(null);

  useEngineFrame((engine) => {
    const boundaryEtaS = Math.max(0, 14.2 - engine.wagonProgressM) / Math.max(engine.speedKmh / 3.6, 0.02);
    // Calculate committed mass within boundaryEtaS using the engine's internal belt cells
    const cells = Math.min(engine.belt.length, Math.max(0, Math.round(boundaryEtaS / 0.1))); // DT_S is 0.1 (TICK_MS = 100ms)
    let committed = 0;
    for (let i = engine.belt.length - cells; i < engine.belt.length; i++) {
      committed += engine.belt[i];
    }
    const { finalT, errT } = engine.projection();
    
    setData({
      mode: engine.mode,
      boundaryEtaS,
      committedT: committed,
      projectedFillT: finalT,
      projectedErrT: errT,
      spi: engine.spi,
    });
  }, 5);

  if (mode === "FALLBACK") {
    return (
      <div className="w-full rounded-md border border-alarm-critical bg-alarm-critical/10 p-3.5 flex items-center gap-3 shadow-sm pulse-border select-none">
        <Warning size={20} className="text-alarm-critical shrink-0 animate-pulse" weight="fill" />
        <span className="text-sm font-semibold tracking-wide text-white font-mono uppercase">
          PLC LOCAL ACTIVE — ProAI commands inhibited — use plant console — acknowledge and review cause.
        </span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="w-full rounded-md border border-border-subtle bg-bg-panel p-3.5 flex items-center justify-center text-xs text-ink-tertiary font-mono">
        Computing decision projections...
      </div>
    );
  }

  // Construct dynamic planned gate action
  let plannedGateAction = "";
  if (data.boundaryEtaS <= 2.5) {
    plannedGateAction = "planned gate closure active (gap crossing)";
  } else if (data.boundaryEtaS <= 6.0) {
    plannedGateAction = "planned gate reduction begins now";
  } else {
    plannedGateAction = `planned gate reduction in ${(data.boundaryEtaS - 6.0).toFixed(1)} s`;
  }

  // Recommended operator action
  let recommendedAction = "no action required";
  if (data.mode === "MANUAL") {
    recommendedAction = "manual control active · monitor fill height manually";
  } else if (data.spi > 0.02) {
    recommendedAction = "action recommended: monitor automatic flow curtailment / take manual if needed";
  } else if (data.projectedFillT < 98.5) {
    recommendedAction = "action recommended: monitor low fill projection";
  }

  return (
    <div className="w-full rounded-md border border-border-subtle bg-bg-panel p-3.5 flex items-center gap-3.5 shadow-sm">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-border-subtle text-ink-secondary">
        <Info size={13} weight="bold" />
      </div>
      <div className="text-[14px] leading-relaxed text-ink-primary font-sans">
        Boundary in <span className="tnum font-semibold text-ink-primary font-mono">{data.boundaryEtaS.toFixed(1)} s</span>
        {" · "}
        <span className="tnum font-semibold text-ink-primary font-mono">{data.committedT.toFixed(1)} t</span> committed on belt
        {" · "}
        <span className="font-medium text-series-primary">{plannedGateAction}</span>
        {" · "}
        projected fill <span className="tnum font-semibold text-ink-primary font-mono">{data.projectedFillT.toFixed(1)} t</span> ±<span className="tnum font-mono">{data.projectedErrT.toFixed(1)}</span>
        {" · "}
        SPI <span className={`tnum font-semibold font-mono ${data.spi > 0.02 ? "text-alarm-high" : data.spi > 0.01 ? "text-alarm-medium" : "text-ink-primary"}`}>{data.spi.toFixed(3)}</span>
        {" · "}
        <span className={`font-semibold ${recommendedAction !== "no action required" ? "text-alarm-high" : "text-ink-secondary"}`}>{recommendedAction}</span>
      </div>
    </div>
  );
}

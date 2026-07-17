"use client";
import { useState } from "react";
import { useEngineFrame } from "@/lib/sim/useEngineFrame";
import { PileHeightVisualizer } from "./PileHeightVisualizer";
import { Panel, PanelHeader } from "@/components/shell/Panel";
import { ChartActions } from "@/components/ai/ChartActions";

interface Readout {
  seq: number;
  uid: string;
  tareT: number;
  fillT: number;
  finalT: number;
  errT: number;
  minFreeboardM: number;
  lotNumber: number;
  lotDensityTpm3: number;
}

export function ActiveWagonPanel() {
  const [r, setR] = useState<Readout | null>(null);

  useEngineFrame((engine) => {
    const w = engine.activeWagon;
    const { finalT, errT } = engine.projection();
    setR({
      seq: w.seq,
      uid: w.uid,
      tareT: w.tareT,
      fillT: w.fillT,
      finalT,
      errT,
      minFreeboardM: w.minFreeboardM,
      lotNumber: engine.lotNumber,
      lotDensityTpm3: engine.lotDensityTpm3,
    });
  }, 5);

  return (
    <Panel>
      <PanelHeader title="S-01 · Active Wagon">
        <ChartActions chartId="pile-height" />
      </PanelHeader>

      <div className="flex items-baseline gap-4 px-3 py-2.5">
        <span className="tnum text-xl font-semibold text-ink-primary">
          Wagon {r?.seq ?? "—"}
        </span>
        <span className="tnum text-sm text-ink-secondary">UID {r?.uid ?? "—"}</span>
        <span className="tnum text-sm text-ink-secondary">Tare {r?.tareT.toFixed(1) ?? "—"} t</span>
        <span className="tnum ml-auto text-xs text-ink-tertiary">
          Lot #{r?.lotNumber ?? "—"} · ρ {r?.lotDensityTpm3.toFixed(2) ?? "—"} t/m³
        </span>
      </div>

      <div className="min-h-0 flex-1 px-2 pb-1">
        <PileHeightVisualizer />
      </div>

      <div className="flex items-center justify-between border-t border-border-subtle px-3 py-2.5 text-sm">
        <span className="tnum">
          Fill <span className="font-semibold text-ink-primary">{r?.fillT.toFixed(1) ?? "—"} t</span>
          <span className="text-ink-tertiary"> → proj </span>
          <span className="font-semibold text-series-primary">
            {r?.finalT.toFixed(1) ?? "—"} t ±{r?.errT.toFixed(1) ?? "—"}
          </span>
        </span>
        <span
          className={`tnum rounded px-2 py-0.5 text-xs font-medium ${
            (r?.minFreeboardM ?? 1) < 0
              ? "bg-alarm-critical text-white"
              : (r?.minFreeboardM ?? 1) < 0.05
                ? "bg-alarm-high text-white"
                : "border border-border-subtle text-ink-tertiary"
          }`}
        >
          freeboard {r?.minFreeboardM.toFixed(2) ?? "—"} m
        </span>
      </div>
    </Panel>
  );
}

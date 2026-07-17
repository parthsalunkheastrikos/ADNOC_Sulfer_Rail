"use client";
import { useState } from "react";
import { TrainCanvas } from "./TrainCanvas";
import { ConsistMinimap } from "./ConsistMinimap";
import { Panel, PanelHeader } from "@/components/shell/Panel";
import { ChartActions } from "@/components/ai/ChartActions";

const ZOOM_LEVELS = [
  { label: "3-wagon", radius: 1 },
  { label: "10-wagon", radius: 5 },
];

export function TrainCanvasPanel() {
  const [zoomIdx, setZoomIdx] = useState(0);

  return (
    <Panel>
      <PanelHeader title="S-01 · Train Canvas">
        <div className="flex gap-0.5 rounded border border-border-subtle bg-bg-sunken p-0.5">
          {ZOOM_LEVELS.map((z, i) => (
            <button
              key={z.label}
              onClick={() => setZoomIdx(i)}
              className={`rounded-sm px-2 py-0.5 text-[11px] font-medium transition-colors ${
                zoomIdx === i
                  ? "bg-bg-raised text-ink-primary"
                  : "text-ink-tertiary hover:text-ink-secondary"
              }`}
            >
              {z.label}
            </button>
          ))}
        </div>
        <ChartActions chartId="train-canvas" />
      </PanelHeader>
      <div className="min-h-0 flex-1">
        <TrainCanvas zoomRadius={ZOOM_LEVELS[zoomIdx].radius} />
      </div>
      <div className="h-8 shrink-0 border-t border-border-subtle px-2 py-1">
        <ConsistMinimap />
      </div>
    </Panel>
  );
}

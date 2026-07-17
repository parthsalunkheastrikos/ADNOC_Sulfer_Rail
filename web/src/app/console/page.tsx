"use client";
import { useState } from "react";
import { ModeAuthorityBar } from "@/components/console/ModeAuthorityBar";
import { TrainCanvasPanel } from "@/components/console/TrainCanvasPanel";
import { ActiveWagonPanel } from "@/components/console/ActiveWagonPanel";
import { TrendStrip } from "@/components/console/TrendStrip";
import { AlarmBanner } from "@/components/console/AlarmBanner";
import { OverrideDrawer } from "@/components/console/OverrideDrawer";
import { SimulationDrawer } from "@/components/console/SimulationDrawer";
import { DecisionTruthPanel } from "@/components/console/DecisionTruthPanel";
import { ViewportWarning } from "@/components/shell/ViewportWarning";
import { useSimStore } from "@/lib/store/useSimStore";

export default function ConsolePage() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [simDrawerOpen, setSimDrawerOpen] = useState(false);
  const pendingReason = useSimStore((s) => s.pendingOverrideReason);
  const environment = useSimStore((s) => s.environment);

  return (
    <div className="flex min-h-0 flex-1 flex-col select-none">
      <ViewportWarning />
      
      <ModeAuthorityBar />

      <div className="relative flex min-h-0 flex-1 flex-col gap-2 p-2">
        <div className="absolute right-3 top-3 z-30 flex items-center gap-2">
          {environment === "PHASE_B" && (
            <button
              type="button"
              onClick={() => setSimDrawerOpen((o) => !o)}
              className="panel-shadow rounded-md border border-border-strong bg-bg-raised px-3 py-1.5 text-xs font-semibold text-ink-primary hover:bg-bg-hover"
            >
              Demo Controls ⚙️ ▸
            </button>
          )}
          <button
            type="button"
            onClick={() => setDrawerOpen((o) => !o)}
            className={`panel-shadow rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
              pendingReason
                ? "animate-pulse border-mode-manual bg-mode-manual text-mode-manual-ink"
                : "border-border-subtle bg-bg-raised text-ink-secondary hover:text-ink-primary"
            }`}
          >
            {pendingReason ? "Override reason pending ▸" : "S-03 Override & Events ▸"}
          </button>
        </div>

        {/* Zone 2: Physical Truth (Train Canvas and Active Wagon Panels) */}
        <div className="flex min-h-0 flex-[1.4] gap-2">
          <div className="min-w-0 flex-[55]">
            <TrainCanvasPanel />
          </div>
          <div className="min-w-0 flex-[45]">
            <ActiveWagonPanel />
          </div>
        </div>

        {/* Zone 3: Decision Truth Panel */}
        <div className="shrink-0">
          <DecisionTruthPanel />
        </div>

        {/* Zone 4: Trend strip */}
        <div className="min-h-0 flex-1">
          <TrendStrip />
        </div>
      </div>

      <AlarmBanner />

      <OverrideDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <SimulationDrawer open={simDrawerOpen} onClose={() => setSimDrawerOpen(false)} />
    </div>
  );
}

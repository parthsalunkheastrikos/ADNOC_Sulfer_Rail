"use client";
import { Panel, PanelHeader } from "@/components/shell/Panel";
import { UtilizationHistogram } from "@/components/analytics/UtilizationHistogram";
import { ModeTimeline } from "@/components/analytics/ModeTimeline";
import { SpiExcursionList } from "@/components/analytics/SpiExcursionList";
import { RecentWagonsTable } from "@/components/kpi/RecentWagonsTable";
import { ChartActions } from "@/components/ai/ChartActions";

export default function PerformanceAnalyticsPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mb-4 border-b border-border-subtle pb-3">
        <div className="eyebrow mb-1">S-10 · Performance Analytics</div>
        <h1 className="text-lg font-semibold tracking-tight text-ink-primary">Loading engineer workspace</h1>
        <p className="mt-0.5 text-xs text-ink-tertiary">
          Whole-session distribution, mode history, and SPI curtailment record for the active
          train. Phase A read-only — no write path to the plant exists.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Panel className="h-64">
          <PanelHeader title="Utilization distribution — completed wagons">
            <ChartActions chartId="utilization-histogram" />
          </PanelHeader>
          <div className="min-h-0 flex-1 p-3">
            <UtilizationHistogram />
          </div>
        </Panel>
        <Panel className="h-64">
          <PanelHeader title="Mode history — full session">
            <ChartActions chartId="mode-timeline" />
          </PanelHeader>
          <div className="min-h-0 flex-1 p-3">
            <ModeTimeline />
          </div>
        </Panel>
      </div>

      <div className="mt-3">
        <Panel className="h-64">
          <PanelHeader title="SPI curtailment / excursion log">
            <ChartActions chartId="spi-excursions" />
          </PanelHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SpiExcursionList />
          </div>
        </Panel>
      </div>

      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="eyebrow">Recent wagons</div>
          <ChartActions chartId="recent-wagons" />
        </div>
        <RecentWagonsTable />
      </div>
    </div>
  );
}

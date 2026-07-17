"use client";
import { useSimStore } from "@/lib/store/useSimStore";
import { StatTile } from "@/components/kpi/StatTile";
import { GateHero } from "@/components/kpi/GateHero";
import { GateChecklist } from "@/components/kpi/GateChecklist";
import { UtilizationChart } from "@/components/kpi/UtilizationChart";
import { RecentWagonsTable } from "@/components/kpi/RecentWagonsTable";
import { LoadingRateTrend, TrainCompletionCard, CapacityCard } from "@/components/kpi/SessionWidgets";
import { Panel, PanelHeader } from "@/components/shell/Panel";
import { ChartActions } from "@/components/ai/ChartActions";

export default function KpiOverviewPage() {
  const kpi = useSimStore((s) => s.kpi);
  const overrideCount = useSimStore((s) => s.overrideCount24h);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 select-none">
      <div className="mb-4 border-b border-border-subtle pb-3">
        <div className="eyebrow mb-1">S-40 · KPI Overview</div>
        <h1 className="text-lg font-semibold tracking-tight text-ink-primary">
          Executive Performance Dashboard
        </h1>
        <p className="mt-0.5 text-xs text-ink-tertiary">
          Rolling utilization analysis against matched historian baseline. Read-only advisory telemetry.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <GateHero kpi={kpi} />

        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Spill events (AI-mode)"
            value={String(kpi.autoSpillEvents)}
            animate={{ value: kpi.autoSpillEvents }}
            sub={`target: zero · manual baseline: ${kpi.manualSpillEvents}`}
            status={kpi.autoSpillEvents > 0 ? "critical" : "good"}
            chartId="spill-events"
            showAiActions={true}
          />
          <StatTile
            label="Overload events (AI-mode)"
            value={String(kpi.autoOverloadEvents)}
            animate={{ value: kpi.autoOverloadEvents }}
            sub={`target: zero · manual baseline: ${kpi.manualOverloadEvents}`}
            status={kpi.autoOverloadEvents > 0 ? "critical" : "good"}
            chartId="overload-events"
            showAiActions={true}
          />
          <StatTile
            label="Availability"
            value={kpi.availabilityPct.toFixed(2)}
            animate={{ value: kpi.availabilityPct, decimals: 2 }}
            unit="%"
            sub="contract target: 99.99%"
            status={kpi.availabilityPct >= 99.99 ? "good" : "warning"}
            chartId="availability"
            showAiActions={true}
          />
          <StatTile
            label="Manual overrides"
            value={String(overrideCount)}
            animate={{ value: overrideCount }}
            sub="this session"
            chartId="manual-overrides"
            showAiActions={true}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Tonnage (session)"
          value={kpi.tonnageToday.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          animate={{ value: kpi.tonnageToday }}
          unit="t"
          sub={`${kpi.wagonsLoadedToday} wagons loaded`}
          chartId="tonnage"
          showAiActions={true}
        />
        <StatTile
          label="Rolling utilization"
          value={kpi.rollingUtilizationPct > 0 ? kpi.rollingUtilizationPct.toFixed(2) : "—"}
          animate={kpi.rollingUtilizationPct > 0 ? { value: kpi.rollingUtilizationPct, decimals: 2 } : undefined}
          unit="%"
          sub={`manual crews: ${kpi.baselineUtilizationPct.toFixed(1)}%`}
          status={kpi.deltaPp >= 1.0 ? "good" : kpi.deltaPp > 0 ? "neutral" : "warning"}
          chartId="rolling-utilization"
          showAiActions={true}
        />
        <StatTile
          label="Peak SPI (AI-mode)"
          value={kpi.autoMaxSpiSession.toFixed(3)}
          animate={{ value: kpi.autoMaxSpiSession, decimals: 3 }}
          sub={`curtailment at 0.02 · manual baseline: ${kpi.manualMaxSpiSession.toFixed(3)}`}
          status={kpi.autoMaxSpiSession > 0.02 ? "critical" : kpi.autoMaxSpiSession > 0.01 ? "warning" : "good"}
          chartId="peak-spi"
          showAiActions={true}
        />
        <StatTile
          label="Est. trips avoided"
          value={kpi.tripsAvoidedRateLabel}
          sub={kpi.extraTonnageT > 0 ? `+${kpi.extraTonnageT.toFixed(1)} t extra this session` : "at constant tonnage"}
          chartId="trips-avoided"
          showAiActions={true}
        />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader title="Utilization — last 60 wagons">
            <ChartActions chartId="utilization-chart" />
          </PanelHeader>
          <div className="min-h-0 flex-1 p-3">
            <UtilizationChart />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Phase A exit gate (G-A2)" />
          <div className="min-h-0 flex-1 overflow-y-auto p-3.5">
            <GateChecklist kpi={kpi} />
            <p className="mt-3.5 border-t border-border-subtle pt-3 text-[11px] leading-relaxed text-ink-tertiary">
              This live view is illustrative telemetry from the console&apos;s built-in demo
              simulator, not the calibrated Digital Twin statistical campaign referenced above.
            </p>
          </div>
        </Panel>
      </div>

      <div className="mt-3 grid grid-cols-1 items-start gap-3 xl:grid-cols-3">
        <Panel className="h-32 xl:col-span-2">
          <PanelHeader title="Loading rate — session">
            <ChartActions chartId="loading-rate-trend" />
          </PanelHeader>
          <div className="min-h-0 flex-1 p-3">
            <LoadingRateTrend />
          </div>
        </Panel>
        <div className="grid grid-cols-1 content-start gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <TrainCompletionCard />
          <CapacityCard />
        </div>
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

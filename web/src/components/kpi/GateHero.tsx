import type { KpiSnapshot } from "@/types/domain";
import { AnimatedNumber } from "@/components/shell/AnimatedNumber";
import { ChartActions } from "@/components/ai/ChartActions";

const H0_MARGIN_PP = 0.5;
const TARGET_PP = 1.0;
const BAR_MIN = -0.5;
const BAR_MAX = 2.0;

function pctOnBar(pp: number) {
  return Math.min(100, Math.max(0, ((pp - BAR_MIN) / (BAR_MAX - BAR_MIN)) * 100));
}

/**
 * The contractual Phase A exit-gate figure (MVP §6.2): mean utilization gain
 * vs. matched baseline must be >= +1.0pp. Elevated as a hero instrument
 * rather than folded into an equal-weight stat grid, since it's the one
 * number the entire pilot is judged on.
 */
export function GateHero({ kpi }: { kpi: KpiSnapshot }) {
  const hasData = kpi.rollingUtilizationPct > 0;
  const has500Wagons = kpi.wagonsLoadedToday >= 500;
  const pass = kpi.deltaPp >= TARGET_PP && has500Wagons;
  const trending = kpi.deltaPp >= H0_MARGIN_PP && kpi.deltaPp < TARGET_PP;

  return (
    <div className="relative rounded-md border border-border-subtle bg-bg-raised p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Gate G-A2 · Δ vs. baseline</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`hero-figure text-5xl ${
                !hasData ? "text-ink-tertiary" : pass ? "text-mode-auto" : trending ? "text-alarm-high" : "text-ink-primary"
              }`}
            >
              {hasData ? (
                <>
                  {kpi.deltaPp >= 0 ? "+" : ""}
                  <AnimatedNumber value={kpi.deltaPp} decimals={2} />
                </>
              ) : (
                "—"
              )}
            </span>
            <span className="text-sm text-ink-tertiary">pp</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <ChartActions chartId="gate-hero" />
          <span
            className={`rounded px-2.5 py-1 text-[11px] font-semibold tracking-wide ${
              !hasData
                ? "bg-bg-sunken text-ink-tertiary"
                : pass
                  ? "bg-mode-auto/15 text-mode-auto border border-mode-auto/30"
                  : "bg-bg-sunken text-alarm-high border border-alarm-high/30"
            }`}
          >
            {!hasData
              ? "AWAITING DATA"
              : pass
                ? "GATE MET"
                : kpi.deltaPp >= TARGET_PP
                  ? `INSUFFICIENT DATA (n = ${kpi.wagonsLoadedToday}/500)`
                  : "BELOW TARGET"}
          </span>
        </div>
      </div>

      <p className="mt-3 text-xs text-ink-secondary">
        Rolling utilization <span className="tnum font-medium text-ink-primary">{hasData ? `${kpi.rollingUtilizationPct.toFixed(2)}%` : "—"}</span>{" "}
        vs. historian baseline <span className="tnum font-medium text-ink-primary">{kpi.baselineUtilizationPct.toFixed(1)}%</span>
      </p>

      <div className="mt-4">
        <div className="relative h-1.5 rounded-full bg-bg-sunken">
          <div
            className={`h-full rounded-full transition-[width] ${pass ? "bg-mode-auto" : "bg-alarm-high"}`}
            style={{ width: `${hasData ? pctOnBar(kpi.deltaPp) : 0}%` }}
          />
          <div
            className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-border-strong"
            style={{ left: `${pctOnBar(H0_MARGIN_PP)}%` }}
            title="H0 margin 0.5pp"
          />
          <div
            className="absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 bg-ink-secondary"
            style={{ left: `${pctOnBar(TARGET_PP)}%` }}
            title="Contractual target 1.0pp"
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-ink-tertiary">
          <span>0</span>
          <span className="tnum">0.5pp margin</span>
          <span className="tnum">1.0pp target</span>
        </div>
      </div>
    </div>
  );
}

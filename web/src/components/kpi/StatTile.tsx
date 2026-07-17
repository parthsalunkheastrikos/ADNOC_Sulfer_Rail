import { AnimatedNumber } from "@/components/shell/AnimatedNumber";
import { ChartActions } from "@/components/ai/ChartActions";
import type { ChartId } from "@/lib/ai/chartRegistry";

type Status = "neutral" | "good" | "warning" | "critical";

const STATUS_TEXT: Record<Status, string> = {
  neutral: "text-ink-primary",
  good: "text-mode-auto",
  warning: "text-alarm-high",
  critical: "text-alarm-critical",
};
const STATUS_DOT: Record<Status, string> = {
  neutral: "bg-ink-tertiary",
  good: "bg-mode-auto",
  warning: "bg-alarm-high",
  critical: "bg-alarm-critical",
};

export function StatTile({
  label,
  value,
  animate,
  unit,
  sub,
  status = "neutral",
  chartId,
  showAiActions = false,
}: {
  label: string;
  value: string;
  /** When set, renders a spring-tweened number instead of the static `value` string (Phase 3 craft pass). */
  animate?: { value: number; decimals?: number };
  unit?: string;
  sub?: string;
  status?: Status;
  /** Which chart-registry entry the About/Ask AI pair should scope to. Required when showAiActions is set. */
  chartId?: ChartId;
  /** Mounts the About/Ask AI ChartActions pair for this tile's own chartId. */
  showAiActions?: boolean;
}) {
  return (
    <div className="group rounded-md border border-border-subtle bg-bg-raised px-3.5 py-3 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[status]}`} aria-hidden />
          <span className="eyebrow truncate">{label}</span>
        </div>
        {showAiActions && chartId && (
          <ChartActions chartId={chartId} className="shrink-0 opacity-40 transition-opacity group-hover:opacity-100" />
        )}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className={`tnum text-xl font-semibold ${STATUS_TEXT[status]}`}>
          {animate ? <AnimatedNumber value={animate.value} decimals={animate.decimals} /> : value}
        </span>
        {unit && <span className="text-xs text-ink-tertiary">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-ink-tertiary">{sub}</div>}
    </div>
  );
}

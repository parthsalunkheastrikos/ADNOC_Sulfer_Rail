import { CheckCircle, XCircle, MinusCircle, Flask } from "@phosphor-icons/react";
import type { KpiSnapshot } from "@/types/domain";

type Row = { label: string } & (
  | { kind: "live"; pass: boolean | null; value: string }
  | { kind: "twin"; note: string }
);

function buildRows(kpi: KpiSnapshot): Row[] {
  const hasData = kpi.rollingUtilizationPct > 0;
  return [
    {
      label: "≥ +1.0 pp mean utilization gain vs. matched baseline (n ≥ 500 pairs)",
      kind: "live",
      pass: hasData ? kpi.deltaPp >= 1.0 : null,
      value: hasData ? `${kpi.deltaPp >= 0 ? "+" : ""}${kpi.deltaPp.toFixed(2)} pp (this session)` : "awaiting data",
    },
    {
      // Scoped to AI-mode operation only (docs/02 §6.3) — MANUAL/FALLBACK
      // incidents are baseline context, not exit-gate failures.
      label: "Zero simulated spills / overloads (AI-mode)",
      kind: "live",
      pass: kpi.autoSpillEvents === 0 && kpi.autoOverloadEvents === 0,
      value: `AI: ${kpi.autoSpillEvents} spill · ${kpi.autoOverloadEvents} overload — manual baseline: ${kpi.manualSpillEvents} spill · ${kpi.manualOverloadEvents} overload`,
    },
    {
      label: "SPI never exceeds 0.02 in any optimized (AI-mode) run",
      kind: "live",
      pass: kpi.autoMaxSpiSession <= 0.02,
      value: `AI peak ${kpi.autoMaxSpiSession.toFixed(3)} — manual baseline peak ${kpi.manualMaxSpiSession.toFixed(3)} (this session)`,
    },
    {
      label: "P(overload) ≤ 1×10⁻⁴ per wagon (10,000-run Monte Carlo)",
      kind: "twin",
      note: "Requires the calibrated Digital Twin statistical campaign",
    },
    {
      label: "Twin mass-balance closure ≤ 1% p95 on a held-out validation month",
      kind: "twin",
      note: "Requires the calibrated Digital Twin statistical campaign",
    },
  ];
}

export function GateChecklist({ kpi }: { kpi: KpiSnapshot }) {
  const rows = buildRows(kpi);
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.label} className="flex items-start gap-2.5 text-xs">
          {row.kind === "live" ? (
            row.pass === null ? (
              <MinusCircle size={15} weight="regular" className="mt-0.5 shrink-0 text-ink-tertiary" aria-hidden />
            ) : row.pass ? (
              <CheckCircle size={15} weight="fill" className="mt-0.5 shrink-0 text-mode-auto" aria-hidden />
            ) : (
              <XCircle size={15} weight="fill" className="mt-0.5 shrink-0 text-alarm-high" aria-hidden />
            )
          ) : (
            <Flask size={15} weight="regular" className="mt-0.5 shrink-0 text-ink-tertiary" aria-hidden />
          )}
          <div className="min-w-0">
            <div className="text-ink-secondary">{row.label}</div>
            <div className="tnum mt-0.5 text-[11px] text-ink-tertiary">
              {row.kind === "live" ? row.value : row.note}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

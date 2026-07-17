"use client";
import { useState } from "react";
import { useEngineFrame } from "@/lib/sim/useEngineFrame";
import type { CompletedWagon } from "@/lib/sim/engine";
import { useAiStore } from "@/lib/store/useAiStore";

// Weighbridge net-weight display quantization (docs audit 2026-07-16, Phase
// 5 §2) — real weighbridge nets read in 0.05 t increments, not float-smooth
// decimals. Display-only: the underlying fillT the KPI/gate-checklist math
// uses is untouched.
const WEIGHBRIDGE_QUANTUM_T = 0.05;
function quantizeNetT(netT: number): string {
  return (Math.round(netT / WEIGHBRIDGE_QUANTUM_T) * WEIGHBRIDGE_QUANTUM_T).toFixed(2);
}

export function RecentWagonsTable() {
  const [rows, setRows] = useState<CompletedWagon[]>([]);
  const askAboutWagon = useAiStore((s) => s.askAboutWagon);
  const streaming = useAiStore((s) => s.streaming);

  useEngineFrame((engine) => {
    setRows(engine.completed.slice(-12).reverse());
  }, 1);

  return (
    <div className="overflow-hidden rounded-md border border-border-subtle">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-border-subtle bg-bg-panel/60">
          <tr>
            <th className="eyebrow px-3 py-2 font-medium">Wagon</th>
            <th className="eyebrow px-3 py-2 font-medium">UID</th>
            <th className="eyebrow px-3 py-2 font-medium">Net (t)</th>
            <th className="eyebrow px-3 py-2 font-medium">Utilization</th>
            <th className="eyebrow px-3 py-2 font-medium">Mode</th>
            <th className="eyebrow px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-ink-tertiary">
                No wagons completed yet in this session.
              </td>
            </tr>
          )}
          {rows.map((w) => (
            <tr
              key={`${w.seq}-${w.completedAtMs}`}
              onClick={() => !streaming && void askAboutWagon(w)}
              title="Ask AI about this wagon"
              className="tnum cursor-pointer text-ink-secondary transition-colors hover:bg-bg-hover/40"
            >
              <td className="px-3 py-2 font-medium text-ink-primary">{w.seq}</td>
              <td className="px-3 py-2">{w.uid}</td>
              <td className="px-3 py-2">{quantizeNetT(w.netT)}</td>
              <td className="px-3 py-2">{w.utilizationPct.toFixed(1)}%</td>
              <td className="px-3 py-2 font-sans">{w.controlMode}</td>
              <td className="px-3 py-2 font-sans">
                {w.overloadFlag && (
                  <span className="mr-1 inline-flex items-center gap-1 rounded bg-alarm-critical/15 px-1.5 py-0.5 text-alarm-critical">
                    ● overload
                  </span>
                )}
                {w.spillFlag && (
                  <span className="inline-flex items-center gap-1 rounded bg-alarm-critical/15 px-1.5 py-0.5 text-alarm-critical">
                    ● spill
                  </span>
                )}
                {!w.overloadFlag && !w.spillFlag && <span className="text-ink-tertiary">nominal</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

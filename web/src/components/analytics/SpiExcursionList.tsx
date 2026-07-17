"use client";
import { useMemo } from "react";
import { useSimStore } from "@/lib/store/useSimStore";

function fmtSimTime(ms: number) {
  const totalS = Math.floor(ms / 1000);
  const h = String(Math.floor(totalS / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalS % 3600) / 60)).padStart(2, "0");
  const s = String(totalS % 60).padStart(2, "0");
  return `T+${h}:${m}:${s}`;
}

const SPI_CODES = new Set(["SPI_HIGH", "SPI_CRITICAL"]);

/** SPI curtailment/pause excursions pulled from the alarm log — same events S-02 shows, filtered to the SPI codes an RLE cares about for tuning. */
export function SpiExcursionList() {
  // Select the raw, referentially-stable array and filter in useMemo — an
  // inline `.filter()` inside the selector returns a new array every tick
  // (the store publishes on a ~200ms clock), which breaks useSyncExternalStore's
  // referential-equality check and causes an infinite re-render loop.
  const alarms = useSimStore((s) => s.alarms);
  const excursions = useMemo(() => alarms.filter((a) => SPI_CODES.has(a.code)), [alarms]);

  if (excursions.length === 0) {
    return <p className="p-3 text-xs text-ink-tertiary">No SPI excursions recorded this session.</p>;
  }

  return (
    <ul className="divide-y divide-border-subtle">
      {excursions.map((a) => (
        <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-xs">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${a.priority === "CRITICAL" ? "bg-alarm-critical" : "bg-alarm-high"}`}
            aria-hidden
          />
          <span className="tnum w-24 shrink-0 text-ink-tertiary">{fmtSimTime(a.raisedAt)}</span>
          <span className="flex-1 truncate text-ink-secondary">{a.message}</span>
          {a.wagonSeq != null && (
            <span className="tnum shrink-0 rounded bg-bg-sunken px-1.5 py-0.5 text-[11px] text-ink-tertiary">
              wagon {a.wagonSeq}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

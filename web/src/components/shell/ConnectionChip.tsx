"use client";
import { useSimStore } from "@/lib/store/useSimStore";

/**
 * Spec §1.4 "latency honesty": every live element carries data-age
 * indication. This is the compact form used in chrome (Mode Authority Bar,
 * Trend Strip header) — degrades from a quiet breathing dot to an explicit
 * STALE chip rather than freezing silently.
 */
export function ConnectionChip() {
  const connection = useSimStore((s) => s.connection);
  const since = useSimStore((s) => s.connectionSinceMs);
  const simTimeMs = useSimStore((s) => s.simTimeMs);

  if (connection === "LOST") return null; // the full veil is the signal

  if (connection === "LIVE") {
    return (
      <span className="inline-flex items-center gap-1.5 text-ink-tertiary" title="Telemetry link healthy — 10 Hz">
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-mode-auto" aria-hidden />
        <span className="eyebrow">LIVE</span>
      </span>
    );
  }

  const ageS = Math.max(0, (simTimeMs - since) / 1000);
  return (
    <span
      className="quality-stale inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-alarm-medium"
      title="Telemetry link degraded — values may be aging"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-alarm-medium" aria-hidden />
      <span className="eyebrow text-alarm-medium">STALE · {ageS.toFixed(0)}s</span>
    </span>
  );
}

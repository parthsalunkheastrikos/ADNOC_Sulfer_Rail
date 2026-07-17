"use client";
import { useEffect } from "react";
import { ArrowsClockwise, WifiSlash } from "@phosphor-icons/react";
import { useSimStore } from "@/lib/store/useSimStore";

const AUTO_RECONNECT_S = 8;

/**
 * Spec §8 degradation ladder: "Server loss > 2s: full-screen gray veil —
 * LIVE DATA LOST — plant control unaffected — use plant console, auto-
 * reconnect." Demo-triggered via the S-03 drawer's connection control.
 * Sits below the TAKE MANUAL button's z-index (that control must never be
 * obscured, per spec §3.2) but above everything else, including the S-03
 * drawer.
 */
export function DataLossVeil() {
  const connection = useSimStore((s) => s.connection);
  const connectionSinceMs = useSimStore((s) => s.connectionSinceMs);
  const simTimeMs = useSimStore((s) => s.simTimeMs);
  const setConnection = useSimStore((s) => s.setConnection);

  // countdown is derived from sim time (already ticking in the store), not
  // local component state, so there's nothing to reset on re-entry into LOST
  const remainingS = Math.max(0, Math.ceil(AUTO_RECONNECT_S - (simTimeMs - connectionSinceMs) / 1000));

  useEffect(() => {
    if (connection !== "LOST") return;
    const timeout = setTimeout(() => setConnection("LIVE"), AUTO_RECONNECT_S * 1000);
    return () => clearTimeout(timeout);
  }, [connection, connectionSinceMs, setConnection]);

  if (connection !== "LOST") return null;

  return (
    <div className="veil-in absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-bg-base/97 text-center backdrop-blur-sm">
      <WifiSlash size={40} weight="regular" className="text-ink-tertiary" aria-hidden />
      <div>
        <div className="text-lg font-semibold tracking-wide text-ink-primary">LIVE DATA LOST</div>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-secondary">
          Plant control is unaffected — this console is read-only advisory telemetry. Use the plant
          console for current process state.
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-ink-tertiary">
        <ArrowsClockwise size={14} className="animate-spin" style={{ animationDuration: "1.6s" }} aria-hidden />
        <span className="eyebrow">auto-reconnect in {remainingS}s</span>
      </div>
      <button
        type="button"
        onClick={() => setConnection("LIVE")}
        className="mt-1 rounded border border-border-strong px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:border-mode-auto hover:text-ink-primary"
      >
        Reconnect now (demo)
      </button>
    </div>
  );
}

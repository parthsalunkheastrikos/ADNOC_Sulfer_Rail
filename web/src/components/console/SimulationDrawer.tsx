"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X, Flask } from "@phosphor-icons/react";
import { useSimStore } from "@/lib/store/useSimStore";
import type { ConnectionState } from "@/types/domain";
import type { ScenarioName } from "@/lib/sim/director";

const CONNECTION_STATES: ConnectionState[] = ["LIVE", "DEGRADED", "LOST"];
const SCENARIO_BUTTONS: { name: ScenarioName; label: string }[] = [
  { name: "DENSITY_SHIFT", label: "Density shift" },
  { name: "BELT_SLIP", label: "Belt slip" },
  { name: "FEED_SURGE", label: "Feed surge" },
  { name: "CREEP_HUNT", label: "Creep hunt" },
  { name: "SPILL", label: "Force spill" },
  { name: "OVERLOAD", label: "Force overload" },
];

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="eyebrow mb-2.5">{children}</h3>;
}

export function SimulationDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mode = useSimStore((s) => s.mode);
  const connection = useSimStore((s) => s.connection);
  const setConnection = useSimStore((s) => s.setConnection);
  const simulateFallback = useSimStore((s) => s.simulateFallback);
  const clearFallback = useSimStore((s) => s.clearFallback);
  const fireScenario = useSimStore((s) => s.fireScenario);
  const [firedScenario, setFiredScenario] = useState<ScenarioName | null>(null);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: 32, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 32, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          className="panel-shadow fixed bottom-0 right-0 top-[127px] z-40 flex w-[380px] flex-col border-l border-t border-border-subtle bg-bg-panel"
        >
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3 bg-bg-sunken">
            <span className="text-sm font-semibold text-ink-primary flex items-center gap-1.5">
              <Flask size={16} className="text-ai-accent" weight="fill" />
              Demo Simulator Controls
            </span>
            <button
              onClick={onClose}
              className="rounded p-1 text-ink-tertiary transition-colors hover:bg-bg-hover hover:text-ink-primary"
              aria-label="Close"
            >
              <X size={16} weight="bold" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            <p className="text-xs leading-relaxed text-ink-tertiary">
              Use these isolated knobs to test safety thresholds, watchdog fallback, and communications degradation. These controls represent a separate simulation/training environment.
            </p>

            <div className="space-y-2.5">
              <SectionHeading>Plant Control Authority (Fault Injection)</SectionHeading>
              <div className="flex gap-2">
                <button
                  onClick={simulateFallback}
                  disabled={mode === "FALLBACK"}
                  className="h-9 flex-1 rounded border border-alarm-critical/30 bg-alarm-critical/10 text-xs font-semibold text-alarm-critical transition-all hover:bg-alarm-critical hover:text-white disabled:opacity-30 disabled:hover:bg-alarm-critical/10 disabled:hover:text-alarm-critical"
                >
                  Force PLC FALLBACK
                </button>
                <button
                  onClick={clearFallback}
                  disabled={mode !== "FALLBACK"}
                  className="h-9 flex-1 rounded border border-border-strong bg-bg-sunken text-xs font-semibold text-ink-primary transition-all hover:bg-bg-hover disabled:opacity-30"
                >
                  Clear PLC Fault
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              <SectionHeading>Console-to-Edge telemetry link</SectionHeading>
              <div className="flex gap-0.5 rounded-md border border-border-subtle bg-bg-sunken p-0.5">
                {CONNECTION_STATES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setConnection(c)}
                    className={`h-8 flex-1 rounded text-[11px] font-semibold transition-colors ${
                      connection === c
                        ? c === "LOST"
                          ? "bg-alarm-critical text-white"
                          : c === "DEGRADED"
                            ? "bg-alarm-high text-white"
                            : "bg-bg-raised text-ink-primary"
                        : "text-ink-tertiary hover:text-ink-secondary"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5">
              <SectionHeading>Demo Scenario triggers</SectionHeading>
              <div className="grid grid-cols-2 gap-1.5">
                {SCENARIO_BUTTONS.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => {
                      fireScenario(s.name);
                      setFiredScenario(s.name);
                      setTimeout(() => setFiredScenario((cur) => (cur === s.name ? null : cur)), 1600);
                    }}
                    className={`h-9 rounded border text-[11px] font-medium transition-colors ${
                      firedScenario === s.name
                        ? "border-mode-manual/60 bg-mode-manual/15 text-mode-manual"
                        : "border-border-subtle bg-bg-sunken text-ink-secondary hover:border-border-strong hover:text-ink-primary"
                    }`}
                  >
                    {firedScenario === s.name ? "fired ✓" : s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

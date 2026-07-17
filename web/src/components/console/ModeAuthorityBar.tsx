"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useSimStore } from "@/lib/store/useSimStore";
import { useEngineFrame } from "@/lib/sim/useEngineFrame";
import { ModeChip } from "./ModeChip";
import { SpiSparkline } from "./SpiSparkline";

interface Readout {
  trainCode: string;
  activeSeq: number;
  wagonCount: number;
  spi: number;
  boundaryEtaS: number;
  telemetryAgeMs: number;
}

export function ModeAuthorityBar() {
  const mode = useSimStore((s) => s.mode);
  const takeoverPhase = useSimStore((s) => s.takeoverPhase);
  const lastLatency = useSimStore((s) => s.lastTakeoverLatencyMs);
  const takeManual = useSimStore((s) => s.takeManual);
  const environment = useSimStore((s) => s.environment);
  const connection = useSimStore((s) => s.connection);

  const [r, setR] = useState<Readout>({
    trainCode: "—",
    activeSeq: 0,
    wagonCount: 0,
    spi: 0,
    boundaryEtaS: 0,
    telemetryAgeMs: 80,
  });

  useEngineFrame((engine) => {
    const speedMs = Math.max(engine.speedKmh / 3.6, 0.02);
    const boundaryEtaS = Math.max(0, 14.2 - engine.wagonProgressM) / speedMs;
    
    // Simulate dynamic telemetry age based on connection state
    let telemetryAgeMs = 80;
    if (connection === "LIVE") {
      telemetryAgeMs = Math.round(75 + Math.random() * 30);
    } else if (connection === "DEGRADED") {
      telemetryAgeMs = Math.round(1800 + Math.random() * 800);
    } else {
      telemetryAgeMs = Math.round(8500 + Math.random() * 4000);
    }

    setR({
      trainCode: engine.trainCode,
      activeSeq: engine.activeSeq,
      wagonCount: engine.wagonCount,
      spi: engine.spi,
      boundaryEtaS,
      telemetryAgeMs,
    });
  }, 5);

  const underline =
    mode === "AUTONOMOUS"
      ? "bg-mode-auto"
      : mode === "ADVISORY" || mode === "SHADOW"
        ? "bg-mode-advisory"
        : mode === "MANUAL"
          ? "bg-mode-manual"
          : mode === "FALLBACK"
            ? "bg-mode-fallback"
            : "bg-mode-monitor";

  // Takeover is allowed in Phase B simulation, but blocked in Phase A read-only shadow
  const canTakeManual = environment === "PHASE_B" && mode !== "MANUAL" && mode !== "FALLBACK" && takeoverPhase === "IDLE";
  const isTakingOver = takeoverPhase === "TAKING_OVER";

  // Freshness age label formatting
  let freshnessLabel = "";
  let freshnessClass = "text-ink-secondary";
  if (connection === "LIVE") {
    freshnessLabel = `telemetry fresh: ${r.telemetryAgeMs}ms`;
  } else if (connection === "DEGRADED") {
    freshnessLabel = `telemetry stale: ${(r.telemetryAgeMs / 1000).toFixed(1)}s`;
    freshnessClass = "text-alarm-medium animate-pulse";
  } else {
    freshnessLabel = `telemetry lost: ${(r.telemetryAgeMs / 1000).toFixed(0)}s`;
    freshnessClass = "text-alarm-critical font-bold";
  }

  return (
    <div className="shrink-0 border-b border-border-subtle bg-bg-panel select-none">
      <div className="relative h-[3px] w-full overflow-hidden">
        <div className={`h-full w-full ${underline} ${isTakingOver ? "opacity-40" : ""}`} />
        {/* Amber sweep on manual takeover */}
        <AnimatePresence>
          {(takeoverPhase === "TAKING_OVER" || takeoverPhase === "MANUAL_CONFIRMED") && (
            <motion.div
              key="takeover-sweep"
              initial={{ x: "-100%" }}
              animate={{ x: "100%" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: "easeInOut" }}
              className="absolute inset-0 bg-gradient-to-r from-transparent via-mode-manual to-transparent"
            />
          )}
        </AnimatePresence>
      </div>
      <div className="flex h-[68px] items-center gap-4 px-4">
        <ModeChip mode={mode} operatorId={mode === "MANUAL" ? "A. Rahman" : undefined} />

        <div className="flex flex-col text-left">
          <span className="text-[14px] font-semibold text-ink-primary tracking-wide">
            {environment === "PHASE_A" ? "Phase A Advisory Pilot" : "Phase B Simulator Environment"}
          </span>
          <span className={`text-[11px] font-mono leading-none mt-1 ${freshnessClass}`}>
            {freshnessLabel}
          </span>
        </div>

        <div className="flex items-center gap-4 rounded-md border border-border-subtle bg-bg-sunken px-4 py-2 text-sm tnum text-ink-secondary">
          <span>
            Train <span className="font-medium text-ink-primary font-mono">{r.trainCode}</span>
          </span>
          <span className="h-4 w-px bg-border-subtle" aria-hidden />
          <span>
            Wagon{" "}
            <span className="font-medium text-ink-primary font-mono">
              {r.activeSeq}/{r.wagonCount}
            </span>
          </span>
          <span className="h-4 w-px bg-border-subtle" aria-hidden />
          <span className="flex items-center gap-2">
            SPI{" "}
            <span
              className={`font-medium font-mono ${r.spi > 0.02 ? "text-alarm-high" : r.spi > 0.01 ? "text-alarm-medium" : "text-ink-primary"}`}
            >
              {r.spi.toFixed(3)}
            </span>
            <span className="rounded-sm bg-bg-base/60 px-1 py-0.5">
              <SpiSparkline />
            </span>
          </span>
          <span className="h-4 w-px bg-border-subtle" aria-hidden />
          <span>
            boundary in{" "}
            <span className="font-medium text-ink-primary font-mono">{r.boundaryEtaS.toFixed(1)} s</span>
          </span>
        </div>

        {lastLatency != null && takeoverPhase === "MANUAL_CONFIRMED" && (
          <span className="tnum rounded-md border border-mode-manual/40 bg-mode-manual/10 px-2.5 py-1.5 text-xs text-mode-manual font-mono">
            Manual control confirmed {lastLatency} ms
          </span>
        )}

        {environment === "PHASE_A" ? (
          <div
            className="ml-auto flex items-center justify-center h-11 px-4 rounded border border-border-subtle bg-bg-sunken text-xs font-semibold text-ink-tertiary font-mono"
            title="Manual override from the Loop is inhibited in Phase A Read-only shadow mode."
          >
            TAKEOVER INHIBITED (PHASE A)
          </div>
        ) : (
          <button
            type="button"
            disabled={!canTakeManual}
            onClick={() => takeManual("UI")}
            className={`ml-auto h-11 w-[200px] shrink-0 rounded text-xs font-semibold tracking-wider transition-all uppercase ${
              isTakingOver ? "animate-pulse" : ""
            } ${
              canTakeManual
                ? "bg-mode-manual text-mode-manual-ink hover:brightness-110 active:scale-[0.98]"
                : "cursor-not-allowed bg-bg-sunken text-ink-tertiary border border-border-subtle"
            }`}
            style={{ zIndex: 50 }}
            title="Single-action manual takeover — never blocked or confirmed"
          >
            {isTakingOver ? "TAKING OVER…" : "TAKE MANUAL ▶"}
          </button>
        )}
      </div>
    </div>
  );
}

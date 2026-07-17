import type { PlatformMode } from "@/types/domain";

const MODE_META: Record<
  PlatformMode,
  { icon: string; label: string; bg: string; ink: string }
> = {
  AUTONOMOUS: { icon: "●", label: "AUTONOMOUS", bg: "var(--mode-auto)", ink: "var(--mode-auto-ink)" },
  ADVISORY: { icon: "◐", label: "ADVISORY", bg: "var(--mode-advisory)", ink: "var(--mode-advisory-ink)" },
  SHADOW: { icon: "◐", label: "SHADOW", bg: "var(--mode-advisory)", ink: "var(--mode-advisory-ink)" },
  MANUAL: { icon: "✋", label: "MANUAL", bg: "var(--mode-manual)", ink: "var(--mode-manual-ink)" },
  FALLBACK: { icon: "▼", label: "FALLBACK — PLC LOCAL", bg: "var(--mode-fallback)", ink: "var(--mode-fallback-ink)" },
  MONITOR: { icon: "◻", label: "MONITOR", bg: "var(--mode-monitor)", ink: "var(--mode-monitor-ink)" },
  OFF: { icon: "◻", label: "OFF", bg: "var(--mode-monitor)", ink: "var(--mode-monitor-ink)" },
};

export function ModeChip({
  mode,
  operatorId,
  compact = false,
}: {
  mode: PlatformMode;
  operatorId?: string;
  compact?: boolean;
}) {
  const meta = MODE_META[mode];
  const label = mode === "MANUAL" && operatorId ? `${meta.label} — ${operatorId}` : meta.label;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded font-semibold tnum ${
        compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"
      } ${mode === "FALLBACK" ? "pulse-border" : ""}`}
      style={{ background: meta.bg, color: meta.ink }}
    >
      <span aria-hidden>{meta.icon}</span>
      {label}
    </span>
  );
}

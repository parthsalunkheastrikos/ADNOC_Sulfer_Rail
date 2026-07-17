"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Moon, Sun, WarningOctagon, Flask, Sparkle } from "@phosphor-icons/react";
import { useSimStore } from "@/lib/store/useSimStore";
import { useAiStore } from "@/lib/store/useAiStore";
import { ROLE_LABEL, ROLE_DESIGNATED_SCREENS, type Role } from "@/types/domain";
import { ModeChip } from "@/components/console/ModeChip";
import { ConnectionChip } from "@/components/shell/ConnectionChip";
import { DataLossVeil } from "@/components/shell/DataLossVeil";
import { AiPanel } from "@/components/ai/AiPanel";

const NAV = [
  { href: "/", label: "KPI Overview", code: "S-40", roles: ["OPS_MANAGER", "RLE", "SCO", "CAO", "CI_ENGINEER"] as Role[] },
  { href: "/console", label: "Loading Console", code: "S-01", roles: ["SCO", "RLE", "CI_ENGINEER"] as Role[] },
  { href: "/alarms", label: "Alarm List", code: "S-02", roles: ["SCO", "RLE", "CI_ENGINEER", "CAO"] as Role[] },
  { href: "/analytics", label: "Performance Analytics", code: "S-10", roles: ["RLE"] as Role[] },
  { href: "/signals", label: "Signal Health", code: "S-30", roles: ["CI_ENGINEER"] as Role[] },
  { href: "/audit", label: "Audit Explorer", code: "S-20", roles: ["CAO"] as Role[] },
  {
    href: "/twin",
    label: "Digital Twin 3D",
    code: "S-01B",
    roles: ["OPS_MANAGER", "RLE", "SCO", "CAO", "CI_ENGINEER"] as Role[],
  },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const init = useSimStore((s) => s.init);
  const role = useSimStore((s) => s.role);
  const theme = useSimStore((s) => s.theme);
  const setTheme = useSimStore((s) => s.setTheme);
  const mode = useSimStore((s) => s.mode);
  const unackedCritical = useSimStore(
    (s) => s.alarms.filter((a) => a.priority === "CRITICAL" && a.lifecycle === "ACTIVE").length,
  );
  const pathname = usePathname();
  const aiOpen = useAiStore((s) => s.open);
  const togglePanel = useAiStore((s) => s.togglePanel);

  useEffect(() => {
    const teardown = init();
    return teardown;
  }, [init]);

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (e.altKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        togglePanel();
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [togglePanel]);

  const connection = useSimStore((s) => s.connection);
  const visibleNav = NAV.filter((n) => n.roles.includes(role));
  const missingScreens = ROLE_DESIGNATED_SCREENS[role].filter((s) => !s.built);


  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="relative flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle bg-bg-panel px-3">
        {/* wordmark */}
        <div className="flex items-center gap-2.5 pr-2">
          <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-ink-secondary" aria-hidden>
            <rect x="2" y="11" width="4" height="8" rx="0.5" fill="currentColor" opacity="0.5" />
            <rect x="8" y="6" width="4" height="13" rx="0.5" fill="currentColor" opacity="0.75" />
            <rect x="14" y="2" width="4" height="17" rx="0.5" fill="currentColor" />
          </svg>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-semibold tracking-tight text-ink-primary">
              ProAI<span className="text-ink-tertiary font-normal">-SLO</span>
            </span>
          </div>
        </div>

        <nav className="flex items-center gap-0.5 rounded-md border border-border-subtle bg-bg-sunken p-0.5 text-sm shrink-0">
          {visibleNav.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`group relative flex items-center gap-1.5 rounded px-3 py-1.5 font-medium whitespace-nowrap transition-colors ${
                  active
                    ? "bg-bg-raised text-ink-primary panel-shadow"
                    : "text-ink-secondary hover:text-ink-primary"
                }`}
              >
                <span className="eyebrow text-[10px] text-ink-tertiary group-hover:text-ink-secondary shrink-0">
                  {n.code}
                </span>
                <span className="shrink-0">{n.label}</span>
                {active && (
                  <span className="absolute inset-x-2 -bottom-[3px] h-0.5 rounded-full bg-ink-primary" aria-hidden />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {unackedCritical > 0 && (
            <Link
              href="/alarms"
              className="flash-critical flex items-center gap-1.5 rounded bg-alarm-critical px-2.5 py-1.5 text-xs font-semibold text-white transition-transform hover:scale-[1.03] active:scale-[0.98]"
            >
              <WarningOctagon size={14} weight="fill" aria-hidden />
              {unackedCritical} CRITICAL
            </Link>
          )}

          <div className="flex items-center gap-3 rounded-md border border-border-subtle bg-bg-sunken px-3 py-1.5">
            <ConnectionChip />
            <span className="h-3.5 w-px bg-border-subtle" aria-hidden />
            <ModeChip mode={mode} compact />
          </div>

          {/* Static operator profile */}
          <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-sunken px-2.5 py-1 text-xs select-none">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-border-strong text-ink-primary font-bold text-[10px]">
              A
            </span>
            <div className="flex flex-col text-left">
              <span className="font-semibold text-ink-primary leading-tight text-[11px]">A. Rahman</span>
              <span className="text-[9px] text-ink-tertiary leading-none uppercase font-mono mt-0.5">SCO</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex items-center gap-1.5 rounded-md border border-border-subtle bg-bg-sunken px-2.5 py-1.5 text-xs text-ink-secondary transition-colors hover:border-border-strong hover:text-ink-primary"
            title="Toggle day/night theme"
          >
            {theme === "dark" ? <Moon size={14} weight="fill" /> : <Sun size={14} weight="fill" />}
            {theme === "dark" ? "Night" : "Day"}
          </button>

          <button
            type="button"
            onClick={togglePanel}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              aiOpen
                ? "border-ai-accent/50 bg-ai-accent/15 text-ai-accent"
                : "border-border-subtle bg-bg-sunken text-ink-secondary hover:border-border-strong hover:text-ink-primary"
            }`}
            title="Toggle AI Copilot (Alt+A)"
          >
            <Sparkle size={14} weight={aiOpen ? "fill" : "regular"} />
            AI Copilot
          </button>
        </div>
      </header>

      {missingScreens.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-sunken px-4 py-1.5 text-xs text-ink-tertiary">
          <Flask size={13} weight="regular" className="shrink-0" aria-hidden />
          <span>
            {ROLE_LABEL[role]}&rsquo;s own screens ({missingScreens.map((s) => s.code).join(", ")} —{" "}
            {missingScreens.map((s) => s.label).join(", ")}) are on the Phase A roadmap, not yet built. Screens
            below are the shared Phase A operational views.
          </span>
        </div>
      )}

      <main className="relative flex min-h-0 flex-1 flex-col">
        {/* H-2: DEGRADED must visibly age the data, not just the header chip
            — every canvas/engine-frame readout underneath is already frozen
            (useEngineFrame bails while connection !== "LIVE"); this applies
            the same quality-stale desaturate/hatch token the spec defines
            for individual stale elements across the whole content area. */}
        <AnimatePresence initial={false}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className={`absolute inset-0 flex min-h-0 flex-1 flex-col ${connection === "DEGRADED" ? "quality-stale" : ""}`}
          >
            {children}
          </motion.div>
        </AnimatePresence>
        <DataLossVeil />
      </main>
      <AiPanel />
    </div>
  );
}

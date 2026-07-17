"use client";
import Link from "next/link";
import { CheckCircle, ListMagnifyingGlass } from "@phosphor-icons/react";
import { useSimStore } from "@/lib/store/useSimStore";
import type { AlarmPriority } from "@/types/domain";

const PRIORITY_RANK: Record<AlarmPriority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const PRIORITY_BG: Record<AlarmPriority, string> = {
  CRITICAL: "bg-alarm-critical text-white",
  HIGH: "bg-alarm-high text-white",
  MEDIUM: "bg-alarm-medium text-ink-inverse",
  LOW: "bg-bg-sunken text-ink-secondary",
};

export function AlarmBanner() {
  const alarms = useSimStore((s) => s.alarms);
  const ackAlarm = useSimStore((s) => s.ackAlarm);

  const active = alarms.filter((a) => a.lifecycle === "ACTIVE");
  const top = [...active].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.raisedAt - a.raisedAt)[0];

  if (!top) {
    return (
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-t border-border-subtle bg-bg-panel px-4 text-sm text-ink-tertiary">
        <CheckCircle size={16} weight="fill" className="text-mode-auto/70" aria-hidden />
        No active alarms · quiet loading in progress
      </div>
    );
  }

  return (
    <div
      className={`flex h-14 shrink-0 items-center gap-3 border-t border-border-subtle px-4 ${
        top.priority === "CRITICAL" ? "flash-critical" : ""
      } ${PRIORITY_BG[top.priority]}`}
    >
      <span className="rounded bg-black/20 px-2 py-0.5 text-[11px] font-bold tracking-wide">
        {top.priority}
      </span>
      <span className="truncate text-sm font-medium">{top.message}</span>
      {top.wagonSeq != null && <span className="tnum text-xs opacity-80">wagon {top.wagonSeq}</span>}
      <span className="tnum ml-2 rounded-full bg-black/20 px-2 py-0.5 text-xs">{active.length} active</span>

      <div className="ml-auto flex gap-2">
        <button
          type="button"
          onClick={() => ackAlarm(top.id)}
          className="flex items-center gap-1.5 rounded bg-black/20 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-black/30"
        >
          <CheckCircle size={14} weight="bold" aria-hidden />
          ACK
        </button>
        <Link
          href="/alarms"
          className="flex items-center gap-1.5 rounded bg-black/20 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-black/30"
        >
          <ListMagnifyingGlass size={14} weight="bold" aria-hidden />
          ALARM LIST
        </Link>
      </div>
    </div>
  );
}

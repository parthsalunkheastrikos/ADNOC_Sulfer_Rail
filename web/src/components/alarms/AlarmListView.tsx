"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CaretDown, CheckCircle, BellSlash } from "@phosphor-icons/react";
import { useSimStore } from "@/lib/store/useSimStore";
import type { AlarmPriority, AlarmRecord } from "@/types/domain";

const PRIORITY_RANK: Record<AlarmPriority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const PRIORITY_DOT: Record<AlarmPriority, string> = {
  CRITICAL: "bg-alarm-critical",
  HIGH: "bg-alarm-high",
  MEDIUM: "bg-alarm-medium",
  LOW: "bg-alarm-low",
};

function fmtSimTime(ms: number) {
  const totalS = Math.floor(ms / 1000);
  const h = String(Math.floor(totalS / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalS % 3600) / 60)).padStart(2, "0");
  const s = String(totalS % 60).padStart(2, "0");
  return `T+${h}:${m}:${s}`;
}

function AlarmRow({ alarm }: { alarm: AlarmRecord }) {
  const [open, setOpen] = useState(false);
  const ackAlarm = useSimStore((s) => s.ackAlarm);
  const shelveAlarm = useSimStore((s) => s.shelveAlarm);
  const isActive = alarm.lifecycle === "ACTIVE";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={`overflow-hidden border-b border-border-subtle ${isActive && alarm.priority === "CRITICAL" ? "bg-alarm-critical/[0.04]" : ""}`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-bg-hover/60"
      >
        <CaretDown
          size={12}
          weight="bold"
          className={`shrink-0 text-ink-tertiary transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
        />
        <span className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[alarm.priority]}`} aria-hidden />
        <span className="w-16 shrink-0 text-[11px] font-semibold tracking-wide text-ink-secondary">
          {alarm.priority}
        </span>
        <span className="tnum w-24 shrink-0 text-xs text-ink-tertiary">{fmtSimTime(alarm.raisedAt)}</span>
        <span className="flex-1 truncate text-sm text-ink-primary">{alarm.message}</span>
        {alarm.wagonSeq != null && (
          <span className="tnum shrink-0 rounded bg-bg-sunken px-1.5 py-0.5 text-[11px] text-ink-tertiary">
            wagon {alarm.wagonSeq}
          </span>
        )}
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${
            alarm.lifecycle === "ACTIVE"
              ? "bg-alarm-critical/15 text-alarm-critical"
              : alarm.lifecycle === "ACKED"
                ? "bg-bg-sunken text-ink-secondary"
                : "bg-bg-sunken text-ink-tertiary"
          }`}
        >
          {alarm.lifecycle}
        </span>
      </button>

      {open && (
        <div className="grid grid-cols-3 gap-5 border-t border-border-subtle bg-bg-sunken/40 px-5 py-4 text-xs">
          <div>
            <div className="eyebrow mb-1.5">Cause</div>
            <div className="leading-relaxed text-ink-secondary">{alarm.cause}</div>
          </div>
          <div>
            <div className="eyebrow mb-1.5">Consequence</div>
            <div className="leading-relaxed text-ink-secondary">{alarm.consequence}</div>
            {alarm.timeToConsequenceS != null && (
              <div className="tnum mt-1.5 text-ink-tertiary">
                time-to-consequence ≈ {alarm.timeToConsequenceS}s
              </div>
            )}
          </div>
          <div>
            <div className="eyebrow mb-1.5">Operator action</div>
            <div className="leading-relaxed text-ink-secondary">{alarm.action}</div>
            <div className="mt-2.5 flex gap-2">
              {alarm.lifecycle === "ACTIVE" && (
                <button
                  onClick={() => ackAlarm(alarm.id)}
                  className="flex items-center gap-1.5 rounded-md bg-bg-panel px-2.5 py-1.5 font-semibold text-ink-primary transition-colors hover:bg-border-subtle"
                >
                  <CheckCircle size={13} weight="bold" />
                  ACK
                </button>
              )}
              {alarm.lifecycle !== "SHELVED" && (
                <button
                  onClick={() => shelveAlarm(alarm.id)}
                  className="flex items-center gap-1.5 rounded-md bg-bg-panel px-2.5 py-1.5 text-ink-secondary transition-colors hover:bg-border-subtle"
                >
                  <BellSlash size={13} weight="bold" />
                  Shelve
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export function AlarmListView() {
  const alarms = useSimStore((s) => s.alarms);
  const [filter, setFilter] = useState<AlarmPriority | "ALL">("ALL");

  const filtered = alarms
    .filter((a) => filter === "ALL" || a.priority === filter)
    .sort((a, b) => {
      const activeRank = (x: AlarmRecord) => (x.lifecycle === "ACTIVE" ? 0 : 1);
      return activeRank(a) - activeRank(b) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.raisedAt - a.raisedAt;
    });

  // Chip counts must match the same predicate the row filter itself uses
  // (all lifecycles) — counting ACTIVE-only here previously produced chips
  // like "CRITICAL (0)" while CRITICAL rows (ACKED/SHELVED/CLEARED) were
  // visibly filtered in below. ACTIVE count is shown alongside as a
  // secondary, emphasized figure rather than replacing the total.
  const counts = (["CRITICAL", "HIGH", "MEDIUM", "LOW"] as AlarmPriority[]).map((p) => ({
    p,
    n: alarms.filter((a) => a.priority === p).length,
    active: alarms.filter((a) => a.priority === p && a.lifecycle === "ACTIVE").length,
  }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-2.5">
        <button
          onClick={() => setFilter("ALL")}
          className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
            filter === "ALL" ? "bg-bg-sunken text-ink-primary" : "text-ink-tertiary hover:text-ink-secondary"
          }`}
        >
          All ({alarms.length})
        </button>
        {counts.map(({ p, n, active }) => (
          <button
            key={p}
            onClick={() => setFilter(p)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              filter === p ? "bg-bg-sunken text-ink-primary" : "text-ink-tertiary hover:text-ink-secondary"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT[p]}`} aria-hidden />
            {p} ({n}
            {active > 0 ? <span className="text-alarm-critical">{` · ${active} active`}</span> : null})
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-ink-tertiary">
            <CheckCircle size={28} className="text-ink-tertiary/60" aria-hidden />
            <p className="text-sm">No alarms match this filter.</p>
            {filter !== "ALL" && (
              <button
                onClick={() => setFilter("ALL")}
                className="text-xs text-mode-auto hover:underline"
              >
                Clear filter
              </button>
            )}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filtered.map((a) => (
              <AlarmRow key={a.id} alarm={a} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

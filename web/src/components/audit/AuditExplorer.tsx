"use client";
import { useMemo, useState } from "react";
import { LinkSimple, ShieldCheck } from "@phosphor-icons/react";
import { useSimStore } from "@/lib/store/useSimStore";
import { computeChain } from "@/lib/audit/hashChain";
import type { OperatorEvent } from "@/types/domain";

function fmtSimTime(ms: number) {
  const totalS = Math.floor(ms / 1000);
  const h = String(Math.floor(totalS / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalS % 3600) / 60)).padStart(2, "0");
  const s = String(totalS % 60).padStart(2, "0");
  return `T+${h}:${m}:${s}`;
}

const TRIGGERS: (OperatorEvent["trigger"] | "ALL")[] = ["ALL", "UI", "HW_BUTTON", "SYSTEM"];

export function AuditExplorer() {
  const events = useSimStore((s) => s.events);
  const [filter, setFilter] = useState<(typeof TRIGGERS)[number]>("ALL");
  const [query, setQuery] = useState("");

  // events arrive newest-first from the store; chain oldest -> newest so each
  // digest actually depends on what happened before it, then re-reverse for display.
  const chained = useMemo(() => computeChain([...events].reverse()).reverse(), [events]);

  const filtered = chained.filter(
    (c) =>
      (filter === "ALL" || c.event.trigger === filter) &&
      (query.trim() === "" ||
        c.event.label.toLowerCase().includes(query.toLowerCase()) ||
        c.event.detail.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-2.5">
        <ShieldCheck size={15} className="text-mode-auto" aria-hidden />
        <span className="text-xs text-ink-tertiary">
          {chained.length} record{chained.length === 1 ? "" : "s"} · chain verified
        </span>
        <div className="ml-auto flex gap-0.5 rounded-md border border-border-subtle bg-bg-sunken p-0.5">
          {TRIGGERS.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                filter === t ? "bg-bg-raised text-ink-primary" : "text-ink-tertiary hover:text-ink-secondary"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="w-40 rounded-md border border-border-subtle bg-bg-sunken px-2 py-1 text-xs text-ink-primary placeholder:text-ink-tertiary focus:outline-none focus:ring-1 focus:ring-mode-auto"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-ink-tertiary">No matching records.</div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 border-b border-border-subtle bg-bg-panel/90 backdrop-blur">
              <tr>
                <th className="eyebrow px-3 py-2 font-medium">Time</th>
                <th className="eyebrow px-3 py-2 font-medium">Trigger</th>
                <th className="eyebrow px-3 py-2 font-medium">Record</th>
                <th className="eyebrow px-3 py-2 font-medium">Digest</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filtered.map((c) => (
                <tr key={c.event.id} className="tnum align-top text-ink-secondary hover:bg-bg-hover/40">
                  <td className="px-3 py-2 whitespace-nowrap">{fmtSimTime(c.event.ts)}</td>
                  <td className="px-3 py-2 font-sans">
                    <span className="rounded bg-bg-sunken px-1.5 py-0.5 text-[11px] text-ink-tertiary">
                      {c.event.trigger}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-sans">
                    <div className="text-ink-primary">{c.event.label}</div>
                    <div className="text-[11px] text-ink-tertiary">{c.event.detail}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 text-[11px]">
                      <LinkSimple size={11} className="text-ink-tertiary" aria-hidden />
                      {c.hash}
                    </div>
                    <div className="text-[10px] text-ink-tertiary/70">← {c.prevHash}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="shrink-0 border-t border-border-subtle px-4 py-2 text-[11px] leading-relaxed text-ink-tertiary">
        Illustrative hash chain (FNV-1a over the console&apos;s own event lane) — demonstrates the
        tamper-evident record shape, not a production signing path.
      </div>
    </div>
  );
}

"use client";
import { useState } from "react";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { useEngineFrame } from "@/lib/sim/useEngineFrame";
import { useSimStore } from "@/lib/store/useSimStore";
import { getTagReadings, type TagReading } from "@/lib/sim/tags";
import type { ConnectionState } from "@/types/domain";
import { Panel, PanelHeader } from "@/components/shell/Panel";

const CONNECTION_STATES: ConnectionState[] = ["LIVE", "DEGRADED", "LOST"];

function fmtSimTime(ms: number) {
  const totalS = Math.floor(ms / 1000);
  const h = String(Math.floor(totalS / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalS % 3600) / 60)).padStart(2, "0");
  const s = String(totalS % 60).padStart(2, "0");
  return `T+${h}:${m}:${s}`;
}

function TagRow({ tag }: { tag: TagReading }) {
  const stale = tag.quality !== "GOOD";
  return (
    <tr className={`tnum text-ink-secondary transition-colors hover:bg-bg-hover/40 ${stale ? "quality-stale" : ""}`}>
      <td className="px-3 py-2 font-sans text-ink-primary">{tag.label}</td>
      <td className="px-3 py-2 font-sans text-[11px] text-ink-tertiary">{tag.name}</td>
      <td className="px-3 py-2 text-right">
        {tag.value.toFixed(tag.decimals)}
        <span className="ml-1 text-[11px] text-ink-tertiary">{tag.unit}</span>
      </td>
      <td className="px-3 py-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
            stale ? "bg-alarm-medium/15 text-alarm-medium" : "bg-mode-auto/10 text-mode-auto"
          }`}
        >
          {stale ? <WarningCircle size={11} weight="bold" /> : <CheckCircle size={11} weight="bold" />}
          {tag.quality}
        </span>
      </td>
      <td className="px-3 py-2 font-sans text-[11px] text-ink-tertiary">{fmtSimTime(tag.timestampMs)}</td>
    </tr>
  );
}

export function SignalHealthBoard() {
  const [tags, setTags] = useState<TagReading[]>([]);
  const connection = useSimStore((s) => s.connection);
  const setConnection = useSimStore((s) => s.setConnection);

  useEngineFrame((engine) => {
    setTags(getTagReadings(engine));
  }, 4);

  const staleCount = tags.filter((t) => t.quality !== "GOOD").length;

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Panel>
        <PanelHeader title="Tag quality board">
          <span
            className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
              staleCount === 0 ? "bg-mode-auto/10 text-mode-auto" : "bg-alarm-medium/15 text-alarm-medium"
            }`}
          >
            {staleCount === 0 ? "ALL GOOD" : `${staleCount} STALE`}
          </span>
        </PanelHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 border-b border-border-subtle bg-bg-panel/90 backdrop-blur">
              <tr>
                <th className="eyebrow px-3 py-2 font-medium">Tag</th>
                <th className="eyebrow px-3 py-2 font-medium">OPC-UA node</th>
                <th className="eyebrow px-3 py-2 text-right font-medium">Value</th>
                <th className="eyebrow px-3 py-2 font-medium">Quality</th>
                <th className="eyebrow px-3 py-2 font-medium">Last update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {tags.map((t) => (
                <TagRow key={t.name} tag={t} />
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Console-to-edge link" />
        <div className="flex flex-col gap-3 p-3.5">
          <p className="text-[11px] leading-relaxed text-ink-tertiary">
            Simulated link-health path for local testing. Individual tag STALE windows above are
            independent of this — this control freezes the whole console&apos;s published view.
          </p>
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
                        ? "bg-alarm-medium text-ink-inverse"
                        : "bg-bg-raised text-ink-primary"
                    : "text-ink-tertiary hover:text-ink-secondary"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}

"use client";
import { SignalHealthBoard } from "@/components/signals/SignalHealthBoard";
import { ChartActions } from "@/components/ai/ChartActions";

export default function SignalHealthPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mb-4 flex items-start justify-between border-b border-border-subtle pb-3">
        <div>
          <div className="eyebrow mb-1">S-30 · Signal Health &amp; Integration Diagnostics</div>
          <h1 className="text-lg font-semibold tracking-tight text-ink-primary">Tag-level telemetry health</h1>
          <p className="mt-0.5 text-xs text-ink-tertiary">
            Simulated OPC-UA tag feed — value, quality code, and last-update timestamp per source
            instrument. Phase A read-only; no write path to the plant exists.
          </p>
        </div>
        <ChartActions chartId="signal-health" />
      </div>
      <SignalHealthBoard />
    </div>
  );
}

"use client";
import { Panel, PanelHeader } from "@/components/shell/Panel";
import { AuditExplorer } from "@/components/audit/AuditExplorer";

export default function AuditExplorerPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <div className="mb-4 shrink-0 border-b border-border-subtle pb-3">
        <div className="eyebrow mb-1">S-20 · Audit Explorer</div>
        <h1 className="text-lg font-semibold tracking-tight text-ink-primary">Session event ledger</h1>
        <p className="mt-0.5 text-xs text-ink-tertiary">
          Every operator/system event this session, hash-chained for tamper evidence. Phase A
          read-only — no write path to the plant exists.
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <Panel>
          <PanelHeader title="Event ledger" />
          <div className="min-h-0 flex-1">
            <AuditExplorer />
          </div>
        </Panel>
      </div>
    </div>
  );
}

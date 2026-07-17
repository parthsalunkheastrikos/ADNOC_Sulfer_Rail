import { AlarmListView } from "@/components/alarms/AlarmListView";

export default function AlarmsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border-subtle bg-bg-panel/40 px-4 py-3">
        <div className="eyebrow mb-1">S-02 · Alarm List</div>
        <h1 className="text-lg font-semibold tracking-tight text-ink-primary">
          IEC 62682 alarm lifecycle
        </h1>
        <p className="mt-0.5 text-xs text-ink-tertiary">
          Every alarm carries cause, consequence, and an operator action. Flash is reserved for
          unacknowledged CRITICAL only.
        </p>
      </div>
      <AlarmListView />
    </div>
  );
}

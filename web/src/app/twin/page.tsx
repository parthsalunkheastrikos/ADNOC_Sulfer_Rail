import { TrainScene } from "@/components/twin3d/TrainScene";

export default function TwinPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <div>
          <h1 className="text-sm font-semibold text-ink-primary">Sulfur Loading Digital Twin</h1>
          <p className="text-[11px] text-ink-tertiary">
            Drag to orbit · scroll to zoom · right-drag to pan
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <TrainScene />
      </div>
    </div>
  );
}

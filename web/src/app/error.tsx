"use client";

import { useEffect } from "react";
import { WarningOctagon, ArrowClockwise } from "@phosphor-icons/react";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[ProAI-SLO] route error boundary:", error);
  }, [error]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-bg-base p-8 text-center">
      <WarningOctagon size={40} weight="fill" className="text-alarm-high" aria-hidden />
      <div>
        <h1 className="text-lg font-semibold text-ink-primary">This screen hit an unexpected error</h1>
        <p className="mt-1 max-w-md text-sm text-ink-secondary">
          The simulated engine and plant control are unaffected — this is a UI-layer fault in the demo console
          itself. Try reloading this screen; if it recurs, note the detail below.
        </p>
      </div>
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="flex items-center gap-2 rounded-md bg-mode-auto px-4 py-2 text-sm font-semibold text-mode-auto-ink transition-transform hover:scale-[1.02] active:scale-[0.98]"
      >
        <ArrowClockwise size={15} weight="bold" aria-hidden />
        Try again
      </button>
      <pre className="tnum mt-2 max-w-lg overflow-x-auto rounded-md border border-border-subtle bg-bg-sunken p-3 text-left text-[11px] text-ink-tertiary">
        {error.message}
      </pre>
    </div>
  );
}

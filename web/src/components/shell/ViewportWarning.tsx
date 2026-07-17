"use client";
import { useEffect, useState } from "react";
import { Warning } from "@phosphor-icons/react";

export function ViewportWarning() {
  const [width, setWidth] = useState<number | null>(null);
  const [bypassed, setBypassed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const handleResize = () => setWidth(window.innerWidth);
    handleResize();
    
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (width === null || bypassed || width >= 1200) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-sunken/95 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-md border-2 border-alarm-critical bg-bg-panel p-6 shadow-2xl pulse-border">
        <div className="flex items-center gap-3.5 border-b border-border-subtle pb-4">
          <Warning size={32} className="text-alarm-critical shrink-0" weight="fill" />
          <div>
            <h2 className="text-sm font-semibold tracking-wider text-ink-primary uppercase font-mono">
              Unsupported Operational Viewport Size
            </h2>
            <div className="text-[10px] text-ink-tertiary font-mono mt-0.5">
              ISA-101 Control Room Compliance Alert
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3.5 text-xs">
          <p className="leading-relaxed text-ink-secondary">
            Safety-critical console <strong className="text-ink-primary">S-01 (Loading Console)</strong> is optimized for dedicated control-room screens and requires a minimum viewport width of <span className="font-mono font-medium text-ink-primary">1280px</span> (1440p recommended) to prevent information crowding and label clipping.
          </p>
          
          <div className="rounded border border-border-subtle bg-bg-sunken px-3.5 py-2.5 font-mono text-[11px] space-y-1">
            <div className="flex justify-between">
              <span className="text-ink-tertiary">MINIMUM REQUIRED:</span>
              <span className="text-ink-primary">1280 px</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-tertiary">CURRENT DETECTED:</span>
              <span className="text-alarm-critical font-bold">{width} px</span>
            </div>
          </div>

          <p className="text-ink-tertiary leading-relaxed text-[11px]">
            Operating this interface at non-standard resolutions may obscure critical status readouts, alarms, and the manual takeover control button.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setBypassed(true)}
            className="w-full h-10 rounded border border-border-strong bg-bg-hover text-xs font-semibold text-ink-primary transition-colors hover:bg-border-subtle hover:text-ink-primary focus:outline-none focus:ring-1 focus:ring-alarm-critical"
          >
            Bypass Safety Notice &amp; Proceed
          </button>
        </div>
      </div>
    </div>
  );
}

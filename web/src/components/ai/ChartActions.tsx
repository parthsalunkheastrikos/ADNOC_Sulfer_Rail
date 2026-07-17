"use client";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Info, Sparkle } from "@phosphor-icons/react";
import { useAiStore } from "@/lib/store/useAiStore";
import { CHART_REGISTRY, type ChartId } from "@/lib/ai/chartRegistry";

/**
 * The two-button pattern mounted on every registered chart/tile: a quiet
 * "About" (ⓘ) popover with a hand-written, offline summary, and an "Ask AI"
 * (✦) button that opens the AI Copilot pre-seeded with this chart's live
 * data slice. ISA-101 restraint — gray icons, no color, no motion beyond the
 * popover itself.
 *
 * The root never carries `position: relative` itself — callers position the
 * whole row (static flow inside a header, or `absolute` inside a tile); only
 * the Info button gets its own positioning context for the popover, so the
 * two concerns (row placement vs. popover anchor) never fight over the same
 * `position` value on one element.
 */
export function ChartActions({ chartId, className = "" }: { chartId: ChartId; className?: string }) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [openLeft, setOpenLeft] = useState(false);
  const infoRef = useRef<HTMLDivElement>(null);
  const askAboutChart = useAiStore((s) => s.askAboutChart);
  const streaming = useAiStore((s) => s.streaming);
  const def = CHART_REGISTRY[chartId];

  const toggleAbout = () => {
    if (!aboutOpen && infoRef.current) {
      // Safe boundary calculation to keep popover inside parent panels and viewport
      const rect = infoRef.current.getBoundingClientRect();
      const spaceOnRight = window.innerWidth - rect.right;
      // Align left (extending right) ONLY if there is at least 300px on the right and we are in the left half of the screen
      const shouldOpenRight = spaceOnRight >= 300 && rect.left < window.innerWidth / 2;
      setOpenLeft(!shouldOpenRight);
    }
    setDetailOpen(false);
    setAboutOpen((o) => !o);
  };

  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      <div ref={infoRef} className="relative">
        <button
          type="button"
          onClick={toggleAbout}
          title="About this view"
          aria-label="About this view"
          className="rounded p-1 text-ink-tertiary transition-colors hover:bg-bg-hover hover:text-ink-secondary"
        >
          <Info size={13} weight="regular" />
        </button>

        <AnimatePresence>
          {aboutOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setAboutOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className={`panel-shadow absolute top-full z-50 mt-1.5 w-72 rounded-md border border-border-subtle bg-bg-raised p-3 ${
                  openLeft ? "right-0" : "left-0"
                }`}
              >
                <div className="eyebrow mb-1.5">{def.label}</div>
                <p className="text-[11px] leading-relaxed text-ink-secondary">{def.summary.plain}</p>
                <button
                  type="button"
                  onClick={() => setDetailOpen((o) => !o)}
                  className="mt-2 text-[10px] font-medium text-ink-tertiary underline decoration-dotted underline-offset-2 hover:text-ink-secondary"
                >
                  {detailOpen ? "Hide technical detail" : "Technical detail"}
                </button>
                {detailOpen && (
                  <div className="mt-1.5 space-y-1.5 border-t border-border-subtle pt-1.5 text-[10.5px] leading-relaxed text-ink-tertiary">
                    {def.summary.detail.map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      <button
        type="button"
        onClick={() => void askAboutChart(chartId)}
        disabled={streaming}
        title="Ask AI about this view"
        aria-label="Ask AI about this view"
        className="rounded p-1 text-ink-tertiary transition-colors hover:bg-ai-accent/15 hover:text-ai-accent disabled:opacity-40"
      >
        <Sparkle size={13} weight="regular" />
      </button>
    </div>
  );
}

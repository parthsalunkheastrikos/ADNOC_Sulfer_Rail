"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  X,
  PaperPlaneRight,
  ArrowClockwise,
  Sparkle,
  WarningCircle,
  ChartLineUp,
  Target,
  ShieldWarning,
  ClockCounterClockwise,
} from "@phosphor-icons/react";
import { useAiStore } from "@/lib/store/useAiStore";
import { useSimStore } from "@/lib/store/useSimStore";
import { MarkdownLite } from "./markdownLite";

const QUICK_PROMPTS = [
  { text: "Summarize this session", icon: ChartLineUp },
  { text: "What's driving the gate target?", icon: Target },
  { text: "Explain SPI", icon: ShieldWarning },
  { text: "What happened during the MANUAL stretch?", icon: ClockCounterClockwise },
];

export function AiPanel() {
  const open = useAiStore((s) => s.open);
  const messages = useAiStore((s) => s.messages);
  const streaming = useAiStore((s) => s.streaming);
  const error = useAiStore((s) => s.error);
  const closePanel = useAiStore((s) => s.closePanel);
  const clear = useAiStore((s) => s.clear);
  const send = useAiStore((s) => s.send);
  const kpi = useSimStore((s) => s.kpi);
  const alarmCount = useSimStore((s) => s.alarms.length);

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Console page also has the Mode Authority Bar (68px + 3px underline)
  // beneath the 56px AppShell header — this drawer must clear both there,
  // exactly like the S-03 Override drawer, so it never competes with the
  // spec-mandated TAKE MANUAL button. Elsewhere only the header applies.
  const topOffsetClass = pathname === "/console" ? "top-[127px]" : "top-14";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    void send(text);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: 32, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 32, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          className={`panel-shadow fixed bottom-0 right-0 ${topOffsetClass} z-40 flex w-[440px] flex-col border-l border-t border-border-subtle bg-bg-panel`}
        >
          <div className="relative shrink-0 overflow-hidden border-b border-border-subtle bg-gradient-to-br from-ai-accent/15 via-transparent to-transparent px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ai-accent/20 text-ai-accent">
                  <Sparkle size={13} weight="fill" aria-hidden />
                </span>
                AI Copilot
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={clear}
                  disabled={messages.length === 0}
                  title="Clear conversation"
                  className="rounded p-1.5 text-ink-tertiary transition-colors hover:bg-bg-hover hover:text-ink-primary disabled:opacity-30"
                >
                  <ArrowClockwise size={15} weight="bold" />
                </button>
                <button
                  onClick={closePanel}
                  aria-label="Close"
                  className="rounded p-1.5 text-ink-tertiary transition-colors hover:bg-bg-hover hover:text-ink-primary"
                >
                  <X size={16} weight="bold" />
                </button>
              </div>
            </div>
            <div className="tnum mt-2 flex items-center gap-1.5 text-[10px] text-ink-tertiary">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-ai-accent" aria-hidden />
              Live: KPI snapshot · {kpi.wagonsLoadedToday} wagons · {alarmCount} alarms
            </div>
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-xs leading-relaxed text-ink-tertiary">
                  Ask about any metric, chart, or alarm on this console. Answers are grounded only
                  in this session&apos;s live data — the AI never controls the plant.
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {QUICK_PROMPTS.map(({ text, icon: Icon }) => (
                    <button
                      key={text}
                      onClick={() => void send(text)}
                      className="flex flex-col items-start gap-1.5 rounded-md border border-border-subtle bg-bg-sunken p-2.5 text-left text-[11px] text-ink-secondary transition-colors hover:border-ai-accent/40 hover:bg-ai-accent/10 hover:text-ink-primary"
                    >
                      <Icon size={14} weight="regular" className="text-ai-accent" aria-hidden />
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex items-start gap-2"}>
                {m.role === "model" && (
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ai-accent/15 text-ai-accent">
                    <Sparkle size={10} weight="fill" aria-hidden />
                  </span>
                )}
                <div
                  className={`max-w-[85%] rounded-md px-3 py-2 text-xs leading-relaxed ${
                    m.role === "user"
                      ? "bg-ai-accent/15 text-ink-primary"
                      : "border border-border-subtle bg-bg-raised text-ink-secondary"
                  }`}
                >
                  {m.chartLabel && (
                    <div className="eyebrow mb-1 text-ai-accent">Asked about · {m.chartLabel}</div>
                  )}
                  {m.role === "model" ? (
                    m.text ? (
                      <>
                        <MarkdownLite text={m.text} />
                        {streaming && m === messages[messages.length - 1] && (
                          <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-ai-accent align-middle" aria-hidden />
                        )}
                      </>
                    ) : (
                      <ThinkingDots />
                    )
                  ) : (
                    <p>{m.text}</p>
                  )}
                  {m.role === "model" && m.text && (
                    <div className="mt-2.5 border-t border-border-subtle/60 pt-1.5 text-[9px] text-ink-tertiary font-mono space-y-0.5 select-none leading-none">
                      <div>DATA PROVENANCE: local simulator telemetry feed</div>
                      <div>MODEL CLASSIFICATION: ProAI core config v1.4.2</div>
                      <div>ESTIMATE UNCERTAINTY: ±0.3t (AI) / ±2.5t (Manual)</div>
                      <div className="text-alarm-high font-bold mt-1 uppercase">
                        ⚠️ BOUNDARY: Not sufficient for plant control. Advisory only.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {error && (
              <div className="flex items-start gap-2 rounded-md border border-alarm-high/30 bg-alarm-high/10 px-3 py-2 text-xs text-alarm-high">
                <WarningCircle size={14} weight="fill" className="mt-0.5 shrink-0" aria-hidden />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="border-t border-border-subtle">
            {pathname === "/console" ? (
              <div className="p-3 bg-bg-sunken space-y-2 select-none">
                <div className="text-[10px] uppercase font-mono text-ink-tertiary tracking-wider mb-1">
                  Contextual Recommendation Diagnostics
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  <button
                    onClick={() => void send("Why is the system recommending the current action?")}
                    disabled={streaming}
                    className="w-full text-left rounded border border-border-subtle bg-bg-raised hover:bg-bg-hover text-[11px] px-2.5 py-1.5 text-ink-primary font-medium transition-colors disabled:opacity-40"
                  >
                    Why this recommendation?
                  </button>
                  <button
                    onClick={() => void send("Analyze the current Spill Probability Index (SPI) trend.")}
                    disabled={streaming}
                    className="w-full text-left rounded border border-border-subtle bg-bg-raised hover:bg-bg-hover text-[11px] px-2.5 py-1.5 text-ink-primary font-medium transition-colors disabled:opacity-40"
                  >
                    Explain SPI trend
                  </button>
                  <button
                    onClick={() => void send("Why is the gate planned to reduce or shut? Explain the boundary dead-time calculations.")}
                    disabled={streaming}
                    className="w-full text-left rounded border border-border-subtle bg-bg-raised hover:bg-bg-hover text-[11px] px-2.5 py-1.5 text-ink-primary font-medium transition-colors disabled:opacity-40"
                  >
                    Explain planned gate changes
                  </button>
                  <button
                    onClick={() => void send("Break down the projected final wagon fill mass, the margin of error (uncertainty), and if it is within tolerances.")}
                    disabled={streaming}
                    className="w-full text-left rounded border border-border-subtle bg-bg-raised hover:bg-bg-hover text-[11px] px-2.5 py-1.5 text-ink-primary font-medium transition-colors disabled:opacity-40"
                  >
                    Explain fill projection &amp; uncertainty
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-2.5 flex items-end gap-1.5">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ask about this console…"
                  rows={1}
                  className="max-h-24 min-h-9 flex-1 resize-none rounded-md border border-border-subtle bg-bg-sunken px-2.5 py-2 text-xs text-ink-primary focus:outline-none focus:ring-1 focus:ring-ai-accent"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || streaming}
                  aria-label="Send"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ai-accent text-ai-accent-ink transition-opacity disabled:opacity-30"
                >
                  <PaperPlaneRight size={15} weight="fill" />
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-0.5" aria-label="thinking">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ai-accent" style={{ animationDelay: "0ms" }} />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ai-accent" style={{ animationDelay: "150ms" }} />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ai-accent" style={{ animationDelay: "300ms" }} />
    </span>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "@phosphor-icons/react";
import { useSimStore } from "@/lib/store/useSimStore";

const HOLD_MS = 1500;
const RAMP_MS = 10000;
const REASON_CODES = [
  "Boundary timing concern",
  "Sensor quality doubt",
  "Density / material change",
  "Track / consist anomaly",
  "Weather / visibility",
  "Scheduled maintenance check",
  "Operator training exercise",
  "Other (see note)",
];

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="eyebrow mb-2.5">{children}</h3>;
}

function HoldToArmButton({ onComplete }: { onComplete: () => void }) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);

  const start = () => {
    startRef.current = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - startRef.current) / HOLD_MS);
      setProgress(p);
      if (p >= 1) {
        onComplete();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };
  const cancel = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setProgress(0);
  };

  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      className="relative h-11 w-full select-none overflow-hidden rounded-md border border-border-strong bg-bg-sunken text-sm font-semibold text-ink-primary"
    >
      <span
        className="absolute inset-y-0 left-0 bg-mode-auto/40 transition-none"
        style={{ width: `${progress * 100}%` }}
      />
      <span className="relative">HOLD TO ARM (1.5s)</span>
    </button>
  );
}

export function OverrideDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mode = useSimStore((s) => s.mode);
  const takeoverPhase = useSimStore((s) => s.takeoverPhase);
  const preflight = useSimStore((s) => s.preflight);
  const events = useSimStore((s) => s.events);
  const pendingOverrideReason = useSimStore((s) => s.pendingOverrideReason);
  const openResumeDialog = useSimStore((s) => s.openResumeDialog);
  const closeResumeDialog = useSimStore((s) => s.closeResumeDialog);
  const armResumeComplete = useSimStore((s) => s.armResumeComplete);
  const confirmResume = useSimStore((s) => s.confirmResume);
  const abortRamp = useSimStore((s) => s.abortRamp);
  const submitOverrideReason = useSimStore((s) => s.submitOverrideReason);

  const [reasonCode, setReasonCode] = useState(REASON_CODES[0]);
  const [reasonNote, setReasonNote] = useState("");

  const allPass = preflight.every((c) => c.pass);

  return (
    <AnimatePresence>
      {open && (
        // top offset clears the AppShell header (h-14 = 56px) *and* the Mode
        // Authority Bar (h-[68px] + 3px underline = 71px) so this panel never
        // visually competes with TAKE MANUAL, which spec §3.2 requires to stay
        // unobscured at all times — easier to just not overlap it at all.
        <motion.div
          initial={{ x: 32, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 32, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          className="panel-shadow fixed bottom-0 right-0 top-[127px] z-40 flex w-[380px] flex-col border-l border-t border-border-subtle bg-bg-panel"
        >
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <span className="text-sm font-semibold text-ink-primary">S-03 · Override &amp; Mode</span>
        <button
          onClick={onClose}
          className="rounded p-1 text-ink-tertiary transition-colors hover:bg-bg-hover hover:text-ink-primary"
          aria-label="Close"
        >
          <X size={16} weight="bold" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Resume-to-auto workflow */}
        <div className="border-b border-border-subtle p-4">
          <SectionHeading>Resume auto</SectionHeading>

          {mode !== "MANUAL" && takeoverPhase === "IDLE" && (
            <p className="text-xs text-ink-tertiary">
              Available once the platform is in MANUAL. Current mode: <strong className="text-ink-secondary">{mode}</strong>.
            </p>
          )}

          {mode === "MANUAL" && takeoverPhase === "IDLE" && (
            <button
              type="button"
              onClick={openResumeDialog}
              className="h-10 w-full rounded-md bg-mode-auto text-sm font-semibold text-white transition-transform hover:brightness-110 active:scale-[0.98]"
            >
              RESUME AUTO
            </button>
          )}

          {takeoverPhase === "PREFLIGHT" && (
            <div className="space-y-2">
              <p className="text-xs text-ink-tertiary">Pre-flight envelope check</p>
              <ul className="space-y-1 rounded-md border border-border-subtle bg-bg-sunken p-2">
                {preflight.map((c) => (
                  <li key={c.key} className="flex items-center justify-between text-xs">
                    <span className="text-ink-secondary">{c.label}</span>
                    <span
                      className={`tnum rounded px-1.5 py-0.5 font-semibold ${
                        c.pass ? "text-mode-auto" : "bg-alarm-critical/15 text-alarm-critical"
                      }`}
                    >
                      {c.pass ? "PASS" : "FAIL"}
                    </span>
                  </li>
                ))}
              </ul>
              {allPass ? (
                <HoldToArmButton onComplete={armResumeComplete} />
              ) : (
                <p className="text-xs text-alarm-critical">
                  Resolve failing checks before arming resume.
                </p>
              )}
              <button
                onClick={closeResumeDialog}
                className="h-8 w-full rounded text-xs text-ink-tertiary transition-colors hover:text-ink-primary"
              >
                Cancel
              </button>
            </div>
          )}

          {takeoverPhase === "ARMED" && (
            <div className="space-y-2">
              <p className="text-xs text-mode-auto">Armed — confirm to begin the 10s supervised ramp.</p>
              <button
                onClick={confirmResume}
                className="h-10 w-full rounded-md bg-mode-auto text-sm font-semibold text-white hover:brightness-110"
              >
                CONFIRM
              </button>
              <button
                onClick={closeResumeDialog}
                className="h-8 w-full rounded text-xs text-ink-tertiary hover:text-ink-primary"
              >
                Cancel
              </button>
            </div>
          )}

          {takeoverPhase === "RAMPING" && <RampProgress onAbort={abortRamp} />}
        </div>

        {/* Pending override reason */}
        {pendingOverrideReason && (
          <div className="border-b border-border-subtle bg-mode-manual/10 p-4">
            <h3 className="eyebrow mb-2.5 text-mode-manual">Override reason pending</h3>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              className="mb-2 w-full rounded-md border border-border-subtle bg-bg-sunken px-2 py-1.5 text-xs text-ink-primary focus:outline-none focus:ring-1 focus:ring-mode-auto"
            >
              {REASON_CODES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <textarea
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              placeholder="Optional free-text note"
              rows={2}
              className="mb-2 w-full rounded-md border border-border-subtle bg-bg-sunken px-2 py-1.5 text-xs text-ink-primary focus:outline-none focus:ring-1 focus:ring-mode-auto"
            />
            <button
              onClick={() => submitOverrideReason(reasonCode, reasonNote)}
              className="h-8 w-full rounded-md bg-bg-sunken text-xs font-semibold text-ink-primary transition-colors hover:bg-border-subtle"
            >
              Submit reason
            </button>
          </div>
        )}



        {/* Event lane */}
        <div className="p-4">
          <SectionHeading>Event lane</SectionHeading>
          <ul className="space-y-3">
            {events.slice(0, 40).map((ev) => (
              <li key={ev.id} className="border-l-2 border-border-subtle pl-3 text-xs">
                <div className="tnum text-ink-tertiary">T+{(ev.ts / 1000).toFixed(1)}s</div>
                <div className="text-ink-primary">{ev.label}</div>
                <div className="text-ink-tertiary">{ev.detail}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function RampProgress({ onAbort }: { onAbort: () => void }) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / RAMP_MS);
      setPct(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="space-y-2">
      <p className="text-xs text-mode-auto">Supervised ramp in progress — increments clamped to 25%.</p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-bg-sunken">
        <div className="h-full bg-mode-auto transition-none" style={{ width: `${pct * 100}%` }} />
      </div>
      <button
        onClick={onAbort}
        className="h-10 w-full rounded-md bg-alarm-critical text-sm font-semibold text-white hover:brightness-110"
      >
        ABORT
      </button>
    </div>
  );
}

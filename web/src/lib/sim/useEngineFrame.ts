"use client";
import { useEffect, useRef } from "react";
import { getEngine } from "./singleton";
import type { TwinLiteEngine } from "./engine";
import { useSimStore } from "@/lib/store/useSimStore";

/**
 * Runs `callback` on a rAF loop throttled to `fps`, reading the live engine
 * singleton directly — used by canvas/readout components that need smoother
 * update cadence than the store's throttled React re-render publishes.
 */
export function useEngineFrame(callback: (engine: TwinLiteEngine, dtMs: number) => void, fps = 30) {
  const cbRef = useRef(callback);
  useEffect(() => {
    cbRef.current = callback;
  });

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let loggedError = false;
    const minDelta = 1000 / fps;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = now - last;
      if (dt >= minDelta) {
        last = now;
        // Freeze the visible frame while the link is DEGRADED/LOST (H-2):
        // the simulated plant keeps running underneath (engine.tick() is
        // untouched, driven by useSimStore's own interval), only this
        // console's *view* of it stalls — matching "plant control
        // unaffected" from the degradation-ladder copy.
        if (useSimStore.getState().connection !== "LIVE") return;
        // A throw here must not take the whole page down (M-6) — this runs
        // outside React's render, so no error boundary sees it, and canvas
        // draw callbacks can leave ctx in a corrupt state (unbalanced
        // save/restore) that would otherwise wreck every following frame.
        try {
          cbRef.current(getEngine(), dt);
        } catch (err) {
          if (!loggedError) {
            loggedError = true;
            console.error("[ProAI-SLO] engine frame callback threw:", err);
          }
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fps]);
}

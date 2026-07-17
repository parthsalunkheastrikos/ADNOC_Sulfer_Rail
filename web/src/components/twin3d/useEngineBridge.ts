"use client";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { getEngine } from "@/lib/sim/singleton";
import { WAGON_RATED_PAYLOAD_T } from "@/lib/sim/constants";
import { DWELL_AFTER_FILL_S, SLIDE_DURATION_S } from "./constants";
import { useTwinCycleStore, type SlotStatus } from "./useLoadingCycle";

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Mounted once inside <Canvas> in place of the old LoadingCycleDriver — the
 * single source of truth for the twin's visual state (Phase 2a). Every
 * frame it reads the live TwinLiteEngine singleton (the same one every
 * console page reads via useEngineFrame/useCanvasFrame) and maps it onto
 * the 3-slot GLB illusion instead of inventing its own fill timer:
 *
 *  - engine.activeWagon.fillT / rated payload -> pile height fraction of
 *    whichever slot is "filling".
 *  - engine.activeSeq advancing (a real finalizeActiveWagon() in the
 *    engine) -> the existing dwell/slide transition, then the completed
 *    slot is relabeled with the next wagon's seq (slotSeqs).
 *  - engine.chuteGateOpeningPct -> mirrored into the store so
 *    SulfurParticles can scale its emission rate by it; this is what
 *    actually cuts the stream during the inter-wagon boundary gap (the
 *    chute hard-closes there — see engine.ts stepGateControl), not a
 *    scene-local timer.
 *  - engine.mode / connection -> mirrored for the chute status light and
 *    HUD staleness veil.
 */
export function EngineBridgeDriver() {
  const elapsed = useRef(0);
  const lastActiveSeq = useRef<number | null>(null);
  const pendingNextSeq = useRef<number>(2);

  useFrame((_, delta) => {
    const engine = getEngine();
    const store = useTwinCycleStore.getState();
    elapsed.current += Math.min(delta, 0.1);

    // Cheap scalar mirrors, updated unconditionally every frame regardless
    // of slot-cycle phase.
    useTwinCycleStore.setState({
      mode: engine.mode,
      chuteOpeningPct: engine.chuteGateOpeningPct,
      activeWagonSeq: engine.activeSeq,
      wagonCount: engine.wagonCount,
    });

    if (lastActiveSeq.current === null) {
      lastActiveSeq.current = engine.activeSeq;
      
      const activeSlot = (engine.activeSeq - 1) % 3;
      const S = engine.activeSeq - activeSlot;
      const slotSeqs: [number, number, number] = [S, S + 1, S + 2];
      
      const statuses: SlotStatus[] = ["pending", "pending", "pending"];
      statuses[activeSlot] = "filling";
      for (let i = 0; i < activeSlot; i++) {
        statuses[i] = "complete";
      }
      
      useTwinCycleStore.setState({
        activeSlot,
        slotSeqs,
        statuses,
        phase: "filling",
        emitting: true,
      });
      
      pendingNextSeq.current = engine.activeSeq + 1;
    }

    const fillPct = Math.min(100, Math.max(0, (engine.activeWagon.fillT / WAGON_RATED_PAYLOAD_T) * 100));

    if (store.phase === "filling") {
      store.clock.phaseT = fillPct / 100;
      store.clock.activeFill = fillPct;

      if (engine.activeSeq !== lastActiveSeq.current) {
        // Real wagon boundary crossed (engine already advanced activeSeq +
        // spawned the next wagon in the same tick — see finalizeActiveWagon
        // in engine.ts) — begin the cosmetic dwell/slide transition.
        const statuses = [...store.statuses] as SlotStatus[];
        statuses[store.activeSlot] = "complete";
        pendingNextSeq.current = engine.activeSeq;
        lastActiveSeq.current = engine.activeSeq;
        useTwinCycleStore.setState({ statuses, phase: "dwell", emitting: false });
        elapsed.current = 0;
      }
      return;
    }

    if (store.phase === "dwell") {
      const p = Math.min(1, elapsed.current / DWELL_AFTER_FILL_S);
      store.clock.phaseT = p;
      if (p >= 1) {
        const next = (store.activeSlot + 1) % store.statuses.length;
        const statuses = [...store.statuses] as SlotStatus[];
        if (next === 0) {
          for (let i = 0; i < statuses.length; i++) statuses[i] = "pending";
        } else if (statuses[next] === "complete") {
          statuses[next] = "pending";
        }
        useTwinCycleStore.setState({
          phase: "sliding",
          fromSlot: store.activeSlot,
          activeSlot: next,
          statuses,
        });
        elapsed.current = 0;
      }
      return;
    }

    // sliding
    const dist = Math.abs(store.activeSlot - store.fromSlot) || 1;
    const duration = dist * SLIDE_DURATION_S;
    const p = Math.min(1, elapsed.current / duration);
    store.clock.phaseT = easeInOutCubic(p);
    if (p >= 1) {
      const statuses = [...store.statuses] as SlotStatus[];
      statuses[store.activeSlot] = "filling";
      store.clock.activeFill = fillPct;
      
      const activeSlot = store.activeSlot;
      const activeSeq = engine.activeSeq;
      const S = activeSeq - activeSlot;
      const slotSeqs: [number, number, number] = [S, S + 1, S + 2];
      
      useTwinCycleStore.setState({ phase: "filling", emitting: true, statuses, slotSeqs });
      elapsed.current = 0;
    }
  });

  return null;
}

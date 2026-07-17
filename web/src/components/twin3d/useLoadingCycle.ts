import { create } from "zustand";
import type { PlatformMode, ConnectionState } from "@/types/domain";

export type SlotStatus = "pending" | "filling" | "complete";
export type CyclePhase = "filling" | "dwell" | "sliding";

/**
 * Per-frame values that would be far too expensive to push through React
 * state at 60fps. Mutated directly by LoadingCycleDriver and read directly
 * (via useTwinCycleStore.getState().clock) inside consumers' own useFrame —
 * never through the reactive `useTwinCycleStore(selector)` hook, since
 * mutating this object does not call `set()` and will not trigger React.
 */
export interface CycleClock {
  /** 0..1 progress through the current phase. */
  phaseT: number;
  /** 0..100 fill of whichever slot is currently "filling". */
  activeFill: number;
}

export type CameraCommand =
  | "zoom_in"
  | "zoom_out"
  | "reset"
  | "view_side"
  | "view_top"
  | "view_iso"
  | "follow_chute"
  | "follow_active_wagon"
  | null;

export interface CalibrationConfig {
  hopperX: number;
  hopperY: number;
  hopperZ: number;
  hopperScale: number;
  
  // 4 Concrete pillars (individual X, Z coordinates)
  p1X: number; // Front Left
  p1Z: number;
  p2X: number; // Front Right
  p2Z: number;
  p3X: number; // Back Left
  p3Z: number;
  p4X: number; // Back Right
  p4Z: number;

  pillarY: number; // Shared height
  pillarWidth: number; // Shared width
  pillarLength: number; // Shared length

  // Ladder platform
  ladderX: number;
  ladderY: number;
  ladderZ: number;
  ladderWidth: number;
  ladderLength: number;
  ladderRotation: number;

  // Particle spawn offsets
  particleXOffset: number;
  particleZOffset: number;
}

interface TwinCycleStore {
  activeSlot: number;
  fromSlot: number;
  statuses: SlotStatus[];
  /** Which real (engine) wagon sequence number each of the 3 GLB slots currently represents — the "conveyor of wagons" relabeling illusion (Phase 2a). */
  slotSeqs: [number, number, number];
  phase: CyclePhase;
  emitting: boolean;
  clock: CycleClock;
  cameraCommand: CameraCommand;
  setCameraCommand: (cmd: CameraCommand) => void;
  calibration: CalibrationConfig;
  updateCalibration: (config: Partial<CalibrationConfig>) => void;

  // Live engine-mirrored fields (written every frame by EngineBridgeDriver,
  // useEngineBridge.ts) — read by the chute status light, HUD, and wagon
  // labels without each of them re-reading the engine singleton separately.
  mode: PlatformMode;
  connection: ConnectionState;
  /** engine.chuteGateOpeningPct (0-1) — drives sulfur-stream particle emission rate; naturally falls to ~0 during the inter-wagon boundary gap. */
  chuteOpeningPct: number;
  activeWagonSeq: number;
  wagonCount: number;
  /** Clicked-wagon slot index, for camera focus + a pinned HUD detail card. */
  pinnedSlot: number | null;
  setPinnedSlot: (slot: number | null) => void;
  /** World-space point CameraRig should frame next (consumed once, like cameraCommand). Set by clicking a wagon label. */
  focusTarget: [number, number, number] | null;
  setFocusTarget: (v: [number, number, number] | null) => void;
}

export const useTwinCycleStore = create<TwinCycleStore>((set) => ({
  activeSlot: 0,
  fromSlot: 0,
  statuses: ["filling", "pending", "pending"],
  slotSeqs: [1, 2, 3],
  phase: "filling",
  emitting: true,
  clock: { phaseT: 0, activeFill: 0 },
  cameraCommand: null,
  setCameraCommand: (cmd) => set({ cameraCommand: cmd }),
  mode: "AUTONOMOUS",
  connection: "LIVE",
  chuteOpeningPct: 0,
  activeWagonSeq: 1,
  wagonCount: 110,
  pinnedSlot: null,
  setPinnedSlot: (slot) => set({ pinnedSlot: slot }),
  focusTarget: null,
  setFocusTarget: (v) => set({ focusTarget: v }),
  calibration: {
    hopperX: 2.06,
    hopperY: 5.04,
    hopperZ: 0.64,
    hopperScale: 0.00550,
    p1X: -5.40,
    p1Z: -4.05,
    p2X: 5.00,
    p2Z: -4.15,
    p3X: -5.55,
    p3Z: 4.85,
    p4X: 4.85,
    p4Z: 4.85,
    pillarY: 5.12,
    pillarWidth: 2.20,
    pillarLength: 2.45,
    ladderX: 13.05,
    ladderY: 5.85,
    ladderZ: 8.95,
    ladderWidth: 3.95,
    ladderLength: 4.25,
    ladderRotation: 270,
    particleXOffset: -1.66,
    particleZOffset: 2.28,
  },
  updateCalibration: (config) => set((state) => ({
    calibration: { ...state.calibration, ...config }
  })),
}));

/** Derives the display fill (0-100) for a given slot index from current store state. */
export function slotFillTarget(slotIndex: number): number {
  const s = useTwinCycleStore.getState();
  const status = s.statuses[slotIndex];
  if (status === "complete") return 100;
  if (status === "filling") return s.clock.activeFill;
  return 0;
}

// The autoplay state machine that used to invent fill progress here
// (LoadingCycleDriver, a fixed 9s fill / 1.1s dwell / 2.2s slide loop) has
// been replaced by EngineBridgeDriver (./useEngineBridge.ts), which drives
// this same store from the live TwinLiteEngine instead — see Phase 2a of
// the digital-twin wiring pass. slotFillTarget/CycleClock/statuses/phase
// stay the shared contract between the two; only *what drives them* moved.

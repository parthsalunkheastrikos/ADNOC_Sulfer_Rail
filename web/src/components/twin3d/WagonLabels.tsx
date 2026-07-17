"use client";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { WagonSlot } from "./sceneMath";
import { useTwinCycleStore, slotFillTarget, type SlotStatus } from "./useLoadingCycle";

const STATUS_BORDER: Record<SlotStatus, string> = {
  filling: "border-[#d9a839]",
  complete: "border-[#5b7a99]",
  pending: "border-[#4b5159]/60",
};
const STATUS_DOT: Record<SlotStatus, string> = {
  filling: "bg-[#d9a839]",
  complete: "bg-[#5b7a99]",
  pending: "bg-[#6b7280]",
};

function WagonLabel({
  slotIndex,
  localPosition,
}: {
  slotIndex: number;
  localPosition: [number, number, number];
}) {
  const anchorRef = useRef<THREE.Group>(null);
  const seqRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);

  useFrame((state) => {
    const s = useTwinCycleStore.getState();
    const status = s.statuses[slotIndex];
    const fill = slotFillTarget(slotIndex);
    
    // Calculate distance to camera for dynamic scaling and fade out
    let dist = 16;
    if (anchorRef.current) {
      const worldPos = new THREE.Vector3();
      anchorRef.current.getWorldPosition(worldPos);
      dist = state.camera.position.distanceTo(worldPos);
    }
    
    // Scale down as camera moves away, clamp scale between 0.8 and 2.5 for high legibility
    const scale = Math.max(0.8, Math.min(2.5, 36 / dist));
    
    if (seqRef.current) seqRef.current.textContent = `#${s.slotSeqs[slotIndex] ?? "—"}`;
    if (fillRef.current) fillRef.current.textContent = `${fill.toFixed(0)}%`;
    if (barRef.current) barRef.current.style.width = `${fill}%`;
    if (cardRef.current) {
      cardRef.current.style.transform = `scale(${scale})`;
      // Smoothly fade out opacity between 60m and 80m camera distance
      cardRef.current.style.opacity = dist > 60 ? String(Math.max(0, 1 - (dist - 60) / 20)) : "1";
      cardRef.current.className = `pointer-events-auto flex w-[140px] cursor-pointer flex-col gap-2 rounded-md border bg-bg-raised/95 px-3 py-2.5 shadow-xl backdrop-blur-sm ${STATUS_BORDER[status]}`;
    }
    if (dotRef.current) dotRef.current.className = `h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[status]}`;
  });

  return (
    <group ref={anchorRef} position={localPosition}>
      <Html center distanceFactor={16} occlude={false} zIndexRange={[10, 0]}>
        <div
          ref={cardRef}
          onClick={() => {
            const store = useTwinCycleStore.getState();
            store.setPinnedSlot(slotIndex);
            if (anchorRef.current) {
              const v = new THREE.Vector3();
              anchorRef.current.getWorldPosition(v);
              store.setFocusTarget([v.x, v.y, v.z]);
            }
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span ref={seqRef} className="tnum text-sm font-bold text-ink-primary">
              #—
            </span>
            <span className="flex items-center gap-1.5">
              <span ref={dotRef} className="h-2 w-2 shrink-0 rounded-full bg-ink-tertiary" aria-hidden />
              <span ref={fillRef} className="tnum text-xs font-semibold text-ink-secondary">
                0%
              </span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-bg-sunken">
            <div ref={barRef} className="h-full rounded-full bg-[#d9a839] transition-[width]" style={{ width: "0%" }} />
          </div>
        </div>
      </Html>
    </group>
  );
}

/**
 * Billboarded per-wagon labels above the 3 visible GLB slots (Phase 2c) —
 * wagon number + live fill % + a mini progress bar, color-coded by state.
 * Clicking one pins it in the twin HUD and points the camera at it.
 */
export function WagonLabels({
  slots,
  offset,
  labelHeightM = 1.1,
}: {
  slots: WagonSlot[];
  offset: THREE.Vector3;
  labelHeightM?: number;
}) {
  return (
    <>
      {slots.map((slot, i) => (
        <WagonLabel
          key={i}
          slotIndex={i}
          localPosition={[slot.center.x - offset.x, slot.rimY + labelHeightM - offset.y, slot.center.z - offset.z]}
        />
      ))}
    </>
  );
}

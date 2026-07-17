import * as THREE from "three";
import {
  HOPPER_UNIT_TO_METERS,
  WAGON_FLOOR_FRACTION,
  WAGON_INTERIOR_INSET,
  WAGON_NODE_NAMES,
  WAGON_RIM_FRACTION,
} from "./constants";

export interface WagonSlot {
  node: THREE.Object3D;
  /** World-space center of the wagon's bounding box. */
  center: THREE.Vector3;
  size: THREE.Vector3;
  /** Approximate interior floor height (world Y) sulfur rests on. */
  floorY: number;
  /** Approximate rim/top height (world Y) — freeboard reference. */
  rimY: number;
  /** Half-extents of the usable interior footprint, inset from the hull. */
  interiorHalfX: number;
  interiorHalfZ: number;
}

/** Locates the three named wagon groups and measures each in world space. */
export function computeWagonSlots(scene: THREE.Object3D): WagonSlot[] {
  scene.updateWorldMatrix(true, false);

  const slots: WagonSlot[] = [];
  for (const name of WAGON_NODE_NAMES) {
    const node = scene.getObjectByName(name);
    if (!node) continue;
    const box = new THREE.Box3().setFromObject(node);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const floorY = box.min.y + size.y * WAGON_FLOOR_FRACTION;
    const rimY = box.min.y + size.y * WAGON_RIM_FRACTION;
    slots.push({
      node,
      center,
      size,
      floorY,
      rimY,
      interiorHalfX: (size.x * (1 - WAGON_INTERIOR_INSET)) / 2,
      interiorHalfZ: (size.z * (1 - WAGON_INTERIOR_INSET)) / 2,
    });
  }

  // Deterministic left-to-right order along the track (world Z), regardless
  // of the source file's node-naming order.
  slots.sort((a, b) => a.center.z - b.center.z);
  return slots;
}

export interface HopperMeasure {
  /** Raw (pre-correction, centimeters) local bounding box. */
  box: THREE.Box3;
  /** Bottom-center point of the hopper, in corrected meters, relative to the model's own local origin. */
  bottomLocalM: THREE.Vector3;
}

export function measureHopper(scene: THREE.Object3D): HopperMeasure {
  scene.updateWorldMatrix(true, false);
  const box = new THREE.Box3().setFromObject(scene);
  const bottomLocalM = new THREE.Vector3(
    (box.min.x + box.max.x) / 2,
    box.min.y,
    (box.min.z + box.max.z) / 2,
  ).multiplyScalar(HOPPER_UNIT_TO_METERS);
  return { box, bottomLocalM };
}

/**
 * World position for the hopper's wrapper group (which applies uniform
 * scale HOPPER_UNIT_TO_METERS) so the hopper's discharge outlet
 * (approximated as the bounding-box bottom-center) sits centered above the
 * given wagon slot with `clearanceM` of air gap.
 */
export function hopperTargetPosition(
  slot: WagonSlot,
  measure: HopperMeasure,
  clearanceM: number,
): THREE.Vector3 {
  return new THREE.Vector3(
    slot.center.x - measure.bottomLocalM.x,
    slot.rimY + clearanceM - measure.bottomLocalM.y,
    slot.center.z - measure.bottomLocalM.z,
  );
}

export function computeHopperTargets(
  slots: WagonSlot[],
  measure: HopperMeasure,
  clearanceM: number,
): THREE.Vector3[] {
  return slots.map((slot) => hopperTargetPosition(slot, measure, clearanceM));
}

/** Centers a full assembly's bounding box at the origin and drops it onto y=0. */
export function groundAndCenter(scene: THREE.Object3D): THREE.Vector3 {
  const box = new THREE.Box3().setFromObject(scene);
  const center = box.getCenter(new THREE.Vector3());
  return new THREE.Vector3(-center.x, -box.min.y, -center.z);
}

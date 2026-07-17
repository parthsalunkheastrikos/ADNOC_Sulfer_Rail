"use client";
import { useLayoutEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { WAGON_MODEL_PATH } from "./constants";
import { computeWagonSlots, groundAndCenter, type WagonSlot } from "./sceneMath";
import { useTwinCycleStore, slotFillTarget } from "./useLoadingCycle";
import { SulfurPile } from "./SulfurPile";
import { getEngine } from "@/lib/sim/singleton";
import { WAGON_HOPPER_OPENING_M, INTER_WAGON_GAP_M } from "@/lib/sim/constants";

import { WagonLabels } from "./WagonLabels";



useGLTF.preload(WAGON_MODEL_PATH);

/** Loads the wagon GLB and derives final world-space slot placements once. */
export function useWagonAssembly() {
  const gltf = useGLTF(WAGON_MODEL_PATH);
  const scene = useMemo(() => gltf.scene.clone(), [gltf.scene]);

  const offset = useMemo(() => groundAndCenter(scene), [scene]);
  const slots = useMemo<WagonSlot[]>(() => {
    const raw = computeWagonSlots(scene);
    return raw.map((s) => ({
      ...s,
      center: s.center.clone().add(offset),
      floorY: s.floorY + offset.y,
      rimY: s.rimY + offset.y,
    }));
  }, [scene, offset]);

  return { scene, offset, slots };
}

export function Wagons({
  scene,
  offset,
  slots,
  piles,
}: {
  scene: THREE.Object3D;
  offset: THREE.Vector3;
  slots: WagonSlot[];
  piles: Array<{
    key: number;
    position: [number, number, number];
    halfX: number;
    halfZ: number;
    maxHeight: number;
  }>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const basePositions = useRef<Map<THREE.Object3D, THREE.Vector3>>(new Map());

  useLayoutEffect(() => {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
      if (mat && !Array.isArray(mat) && (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        // Nudge the source "Wagon1Mat" away from its flat rough=1 export
        // default toward a weathered painted-steel response, keeping the
        // baked rust diffuse/specular textures intact.
        mat.roughness = 0.72;
        mat.metalness = 0.5;
        mat.envMapIntensity = 1.0;
      }
    });

    const map = basePositions.current;
    map.clear();
    for (const slot of slots) map.set(slot.node, slot.node.position.clone());
  }, [scene, slots]);

  useFrame((state) => {
    const store = useTwinCycleStore.getState();
    const engine = getEngine();
    const progressFrac = THREE.MathUtils.clamp(
      engine.wagonProgressM / (WAGON_HOPPER_OPENING_M + INTER_WAGON_GAP_M),
      0,
      1,
    );
    
    // Dynamic slot spacing based on GLB centers
    const slotSpacing = slots.length > 1 ? Math.abs(slots[1].center.z - slots[0].center.z) : 13.5;
    const creepZ = THREE.MathUtils.lerp(slotSpacing / 2, -slotSpacing / 2, progressFrac);

    // Dynamically move the train group along Z to align the active wagon with the gantry (z = 0) plus continuous creep
    const group = groupRef.current;
    if (group && slots.length > 0) {
      let zOffset = 0;
      if (store.phase === "sliding") {
        const fromZ = -slots[store.fromSlot].center.z - slotSpacing / 2;
        const toZ = -slots[store.activeSlot].center.z + slotSpacing / 2;
        zOffset = THREE.MathUtils.lerp(fromZ, toZ, store.clock.phaseT);
      } else if (store.phase === "dwell") {
        zOffset = -slots[store.activeSlot].center.z - slotSpacing / 2;
      } else {
        // filling - continuous crawl
        zOffset = -slots[store.activeSlot].center.z + creepZ;
      }
      group.position.set(offset.x, offset.y, offset.z + zOffset);
    }

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const base = basePositions.current.get(slot.node);
      if (!base) continue;
      if (store.statuses[i] === "filling") {
        const t = state.clock.elapsedTime;
        slot.node.position.set(
          base.x + Math.sin(t * 53) * 0.0035,
          base.y + Math.sin(t * 71 + 0.7) * 0.003,
          base.z + Math.cos(t * 45) * 0.0035,
        );
      } else if (!slot.node.position.equals(base)) {
        slot.node.position.copy(base);
      }
    }
  });

  return (
    <group ref={groupRef} position={offset}>
      <primitive object={scene} />
      {piles.map((p) => {
        // Convert to positions relative to the moving train group
        const localPos: [number, number, number] = [
          p.position[0] - offset.x,
          p.position[1] - offset.y,
          p.position[2] - offset.z,
        ];
        return (
          <SulfurPile
            key={p.key}
            position={localPos}
            halfX={p.halfX}
            halfZ={p.halfZ}
            maxHeight={p.maxHeight}
            seed={p.key + 1}
            getFill={() => slotFillTarget(p.key)}
          />
        );
      })}
      <WagonLabels slots={slots} offset={offset} />
    </group>
  );
}

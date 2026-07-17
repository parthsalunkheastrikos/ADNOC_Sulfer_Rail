"use client";
import { useLayoutEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { HOPPER_CLEARANCE_M, HOPPER_MODEL_PATH, HOPPER_UNIT_TO_METERS } from "./constants";
import { hopperTargetPosition, measureHopper, type WagonSlot } from "./sceneMath";
import { useTwinCycleStore } from "./useLoadingCycle";

useGLTF.preload(HOPPER_MODEL_PATH);

// The source Sketchfab export bakes six near-identical flat-orange
// materials; two (material_4, material_7) were deduped away as exact
// color/texture duplicates during optimization, leaving four. Retinted here
// into a real industrial palette — painted safety-yellow structure vs. dark
// galvanized steel for the discharge cone — since the raw asset ships with
// a mirror-bright metal=1/rough=0.1 "toy" finish on everything.
const HOPPER_MATERIAL_OVERRIDES: Record<string, { color: string; roughness: number; metalness: number }> = {
  material_1: { color: "#d1a52c", roughness: 0.5, metalness: 0.35 },
  material_2: { color: "#c79a28", roughness: 0.58, metalness: 0.3 },
  material_5: { color: "#8a8f94", roughness: 0.48, metalness: 0.65 },
  material_6: { color: "#2c2f33", roughness: 0.38, metalness: 0.8 },
};

export function useHopperMeasure() {
  const gltf = useGLTF(HOPPER_MODEL_PATH);
  const scene = useMemo(() => gltf.scene.clone(), [gltf.scene]);
  const measure = useMemo(() => measureHopper(scene), [scene]);
  return { scene, measure };
}

// Frozen mode/connection hexes — must match --mode-* / --alarm-* tokens in
// globals.css exactly (ISA-101 discipline: mode colors carry a fixed
// meaning app-wide, the 3D scene doesn't get to invent its own palette).
const MODE_LIGHT_COLOR: Record<string, string> = {
  AUTONOMOUS: "#1b5faa",
  ADVISORY: "#2c8c86",
  MANUAL: "#e8a13d",
  FALLBACK: "#c0392b",
  MONITOR: "#5b6470",
  SHADOW: "#5b6470",
  OFF: "#5b6470",
};
const STALE_LIGHT_COLOR = "#6b7280";

export function Hopper({
  scene,
  measure,
  slots,
}: {
  scene: THREE.Object3D;
  measure: ReturnType<typeof measureHopper>;
  slots: WagonSlot[];
}) {
  const groupRef = useRef<THREE.Group>(null);
  const lightMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const calibration = useTwinCycleStore((s) => s.calibration);

  useLayoutEffect(() => {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
      if (!mat || Array.isArray(mat)) return;
      const override = HOPPER_MATERIAL_OVERRIDES[mat.name];
      if (override) {
        mat.color.set(override.color);
        mat.roughness = override.roughness;
        mat.metalness = override.metalness;
      }
      mat.envMapIntensity = 1.1;
    });
  }, [scene]);

  useFrame((state) => {
    const group = groupRef.current;
    if (!group) return;
    const store = useTwinCycleStore.getState();
    const cal = store.calibration;

    const scaleRatio = cal.hopperScale / 0.0055;
    let x = -measure.bottomLocalM.x * scaleRatio + cal.hopperX;
    let y = -measure.bottomLocalM.y * scaleRatio + cal.hopperY;
    let z = -measure.bottomLocalM.z * scaleRatio + cal.hopperZ;

    if (store.phase === "filling" && store.emitting) {
      const t = state.clock.elapsedTime;
      x += Math.sin(t * 47) * 0.002;
      y += Math.sin(t * 63 + 1.3) * 0.0015;
      z += Math.cos(t * 39) * 0.002;
    }

    group.position.set(x, y, z);

    if (lightMatRef.current) {
      const color =
        store.connection !== "LIVE" ? STALE_LIGHT_COLOR : MODE_LIGHT_COLOR[store.mode] ?? STALE_LIGHT_COLOR;
      lightMatRef.current.color.set(color);
      lightMatRef.current.emissive.set(color);
    }
  });

  // Top-center of the hopper's own raw bounding box — same local coordinate
  // space the primitive's GLB geometry already lives in (pre hopperScale),
  // so this stays correctly placed regardless of calibration tuning.
  const lightLocalPos: [number, number, number] = [
    (measure.box.min.x + measure.box.max.x) / 2,
    measure.box.max.y + (measure.box.max.y - measure.box.min.y) * 0.05,
    (measure.box.min.z + measure.box.max.z) / 2,
  ];

  return (
    <group ref={groupRef} scale={calibration.hopperScale}>
      <primitive object={scene} />
      {/* Chute status light — tints amber/red/blue/teal with platform mode, dims gray when the console-to-edge link isn't LIVE (Phase 2a). */}
      <mesh position={lightLocalPos}>
        <sphereGeometry args={[45, 12, 12]} />
        <meshStandardMaterial ref={lightMatRef} emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
    </group>
  );
}

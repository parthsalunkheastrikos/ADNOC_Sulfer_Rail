"use client";
import { useMemo } from "react";
import * as THREE from "three";

/** Minimal rail-yard grounding: ballast bed + two rails, low-poly and static. */
export function Ground({ length = 90, gauge = 4.2 }: { length?: number; gauge?: number }) {
  const railGeometry = useMemo(() => new THREE.BoxGeometry(0.16, 0.14, length), []);

  return (
    <group>
      <mesh position={[0, -0.02, 0]} receiveShadow>
        <boxGeometry args={[gauge + 3.4, 0.28, length]} />
        <meshStandardMaterial color="#2c2b28" roughness={0.98} metalness={0} />
      </mesh>
      {[-gauge / 2, gauge / 2].map((x) => (
        <mesh key={x} geometry={railGeometry} position={[x, 0.13, 0]} receiveShadow castShadow>
          <meshStandardMaterial color="#8a8d90" roughness={0.35} metalness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

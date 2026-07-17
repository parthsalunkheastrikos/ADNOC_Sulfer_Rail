"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PARTICLE_COUNT, SULFUR_HIGHLIGHT } from "./constants";

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

export interface SulfurParticlesProps {
  /** World-space spawn point, or null while not discharging. Called every frame. */
  getOrigin: () => THREE.Vector3 | null;
  /** World-space Y at which a falling particle should vanish (the rising pile surface). */
  getTargetY: () => number;
  emissionRate?: number;
  /**
   * Imperative emission-rate getter, read every frame — takes priority over
   * the static `emissionRate` prop when provided. Used to tie the stream's
   * density to the live chute gate opening (engine.chuteGateOpeningPct) so
   * the stream visibly throttles/cuts without triggering a React re-render
   * every tick.
   */
  getEmissionRate?: () => number;
}

const dummy = new THREE.Object3D();
const GRAVITY = 9.8;
const PARK = new THREE.Vector3(0, -9999, 0);

/** GPU-instanced falling-sulfur stream. Fixed pool, no per-frame allocation. */
export function SulfurParticles({ getOrigin, getTargetY, emissionRate = 90, getEmissionRate }: SulfurParticlesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const spawnAccumulator = useRef(0);
  const cursor = useRef(0);

  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: PARTICLE_COUNT }, () => ({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
      })),
    [],
  );

  useFrame((_, rawDelta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const delta = Math.min(rawDelta, 0.05);
    const origin = getOrigin();

    if (origin) {
      const rate = getEmissionRate ? getEmissionRate() : emissionRate;
      spawnAccumulator.current += delta * rate;
      let toSpawn = Math.floor(spawnAccumulator.current);
      spawnAccumulator.current -= toSpawn;
      while (toSpawn-- > 0) {
        const p = particles[cursor.current];
        cursor.current = (cursor.current + 1) % particles.length;
        p.active = true;
        p.x = origin.x + (Math.random() - 0.5) * 0.35;
        p.y = origin.y;
        p.z = origin.z + (Math.random() - 0.5) * 0.35;
        p.vx = (Math.random() - 0.5) * 0.45;
        p.vy = -0.3 - Math.random() * 0.3;
        p.vz = (Math.random() - 0.5) * 0.45;
        p.life = 0;
      }
    }

    const targetY = getTargetY();
    let visible = 0;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (!p.active) continue;
      p.vy -= GRAVITY * delta;
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.z += p.vz * delta;
      p.life += delta;
      if (p.y <= targetY || p.life > 4) {
        p.active = false;
        continue;
      }
      dummy.position.set(p.x, p.y, p.z);
      const growth = Math.min(1, p.life * 5);
      dummy.scale.setScalar((0.8 + 0.35 * growth) * 0.065);
      dummy.rotation.set(p.y * 3, p.x * 3, p.z * 3);
      dummy.updateMatrix();
      mesh.setMatrixAt(visible, dummy.matrix);
      visible++;
    }
    for (let i = visible; i < particles.length; i++) {
      dummy.position.copy(PARK);
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, PARTICLE_COUNT]}
      frustumCulled={false}
    >
      <sphereGeometry args={[1, 6, 5]} />
      <meshStandardMaterial
        color={SULFUR_HIGHLIGHT}
        emissive={SULFUR_HIGHLIGHT}
        emissiveIntensity={0.2}
        roughness={0.55}
        metalness={0}
      />
    </instancedMesh>
  );
}

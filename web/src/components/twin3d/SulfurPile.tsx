"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SULFUR_COLOR, SULFUR_HIGHLIGHT, SULFUR_SHADOW } from "./constants";

const SEGMENTS = 26;

function hash2(x: number, z: number, seed: number) {
  const s = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

function valueNoise(x: number, z: number, seed: number) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi, seed);
  const b = hash2(xi + 1, zi, seed);
  const c = hash2(xi, zi + 1, seed);
  const d = hash2(xi + 1, zi + 1, seed);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, u), THREE.MathUtils.lerp(c, d, u), v);
}

export interface SulfurPileProps {
  position: [number, number, number];
  halfX: number;
  halfZ: number;
  maxHeight: number;
  seed?: number;
  /** Imperative fill getter (0-100) — read every frame, never triggers a React re-render. */
  getFill: () => number;
}

/**
 * Procedurally generated, GPU-cheap sulfur mound: a deformed grid whose
 * per-vertex height/color is recomputed only while its target fill is
 * still changing (idle piles stop touching the GPU entirely).
 */
export function SulfurPile({ position, halfX, halfZ, maxHeight, seed = 1, getFill }: SulfurPileProps) {
  const displayed = useRef(0);
  const lastBuilt = useRef(-1);

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(halfX * 2, halfZ * 2, SEGMENTS, SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    geo.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3),
    );
    return geo;
  }, [halfX, halfZ]);

  const palette = useMemo(
    () => ({
      base: new THREE.Color(SULFUR_COLOR),
      highlight: new THREE.Color(SULFUR_HIGHLIGHT),
      shadow: new THREE.Color(SULFUR_SHADOW),
    }),
    [],
  );

  useFrame((_, delta) => {
    const target = THREE.MathUtils.clamp(getFill(), 0, 100) / 100;
    displayed.current += (target - displayed.current) * Math.min(1, delta * 3.5);
    if (lastBuilt.current >= 0 && Math.abs(displayed.current - lastBuilt.current) < 0.0015) return;
    lastBuilt.current = displayed.current;

    const f = displayed.current;
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    const col = geometry.attributes.color as THREE.BufferAttribute;
    const footprint = THREE.MathUtils.smoothstep(f, 0, 0.18);
    const radiusX = Math.max(0.05, halfX * (0.55 + 0.42 * footprint));
    const radiusZ = Math.max(0.05, halfZ * (0.55 + 0.42 * footprint));
    const { base, highlight, shadow } = palette;
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const rx = x / radiusX;
      const rz = z / radiusZ;
      const r = Math.sqrt(rx * rx + rz * rz);
      const crown = r >= 1 ? 0 : Math.pow(Math.cos(Math.min(1, r) * Math.PI * 0.5), 0.6);
      const edgeFade = THREE.MathUtils.smoothstep(1 - r, 0, 0.4);
      const n = f > 0.03 ? (valueNoise(x * 0.55 + seed * 11, z * 0.55 + seed * 7, seed) - 0.5) * edgeFade : 0;
      const h = Math.max(0, f * maxHeight * crown + n * maxHeight * 0.18);
      pos.setY(i, h);

      const t = THREE.MathUtils.clamp(h / Math.max(0.05, maxHeight), 0, 1);
      tmp.copy(base)
        .lerp(highlight, THREE.MathUtils.smoothstep(t, 0.5, 1))
        .lerp(shadow, 1 - THREE.MathUtils.smoothstep(t, 0, 0.3));
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }

    pos.needsUpdate = true;
    col.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  });

  return (
    <mesh geometry={geometry} position={position} receiveShadow castShadow>
      <meshStandardMaterial vertexColors roughness={0.92} metalness={0.03} />
    </mesh>
  );
}

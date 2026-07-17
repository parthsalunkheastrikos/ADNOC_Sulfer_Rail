"use client";

/**
 * Industrial three-point rig: a soft sky/ground ambient fill, a hard key
 * sun casting the primary shadow, and a cool rim light to separate the
 * wagon silhouette from the dark background. Shadow frustum is sized to
 * the active loading bay (hopper + one wagon), not the full 3-slot span —
 * the flanking wagons rely on ContactShadows instead, which is far cheaper
 * than widening the shadow-mapped key light's coverage.
 */
export function Lighting() {
  return (
    <>
      <hemisphereLight args={["#c7d6e8", "#20211f", 0.55]} />
      <directionalLight
        position={[18, 26, 14]}
        intensity={2.1}
        color="#fff4e0"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-camera-near={1}
        shadow-camera-far={70}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-14, 8, -16]} intensity={0.45} color="#7fb2ff" />
      <ambientLight intensity={0.12} />
    </>
  );
}

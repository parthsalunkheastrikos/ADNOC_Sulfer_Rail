"use client";
import { Environment, ContactShadows } from "@react-three/drei";

/**
 * HDR image-based reflections (invisible as a backdrop) + a cheap blurred
 * ground contact shadow. Fog tuned very slightly warm ("Desert Night" grade,
 * Phase 5d) to match the console's warmed graphite surfaces instead of a
 * flat neutral gray — the actual scene background color lives on
 * TrainScene.tsx's <Canvas> <color> tag, kept in sync with this fog hue.
 */
export function SceneEnvironment() {
  return (
    <>
      <Environment preset="warehouse" environmentIntensity={0.65} background={false} />
      <fog attach="fog" args={["#17151a", 150, 300]} />
      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.55}
        scale={80}
        blur={2.2}
        far={12}
        resolution={1024}
        frames={1}
        color="#000000"
      />
    </>
  );
}

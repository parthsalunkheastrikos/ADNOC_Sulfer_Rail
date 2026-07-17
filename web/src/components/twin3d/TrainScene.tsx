"use client";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";

import { Wagons, useWagonAssembly } from "./Wagons";
import { Hopper, useHopperMeasure } from "./Hopper";
import { SulfurParticles } from "./SulfurParticles";
import { Lighting } from "./Lighting";
import { SceneEnvironment } from "./SceneEnvironment";
import { Ground } from "./Ground";
import { useTwinCycleStore, type CalibrationConfig } from "./useLoadingCycle";
import { EngineBridgeDriver } from "./useEngineBridge";
import { TwinHud } from "./TwinHud";
import { PARTICLE_BASE_EMISSION_RATE } from "./constants";
import { useSimStore } from "@/lib/store/useSimStore";

function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    camera.position.set(30, 22, 34);
    controls.current?.target.set(0, 5, 0);
    controls.current?.update();
  }, [camera]);

  useFrame(() => {
    const store = useTwinCycleStore.getState();
    const ctrl = controls.current;

    if (store.focusTarget && ctrl) {
      const [fx, fy, fz] = store.focusTarget;
      useTwinCycleStore.setState({ focusTarget: null }); // Consume command
      const target = new THREE.Vector3(fx, fy, fz);
      const dir = new THREE.Vector3().subVectors(camera.position, ctrl.target).normalize();
      ctrl.target.copy(target);
      camera.position.copy(target).addScaledVector(dir, 14);
      ctrl.update();
    }

    if (store.cameraCommand) {
      const cmd = store.cameraCommand;
      useTwinCycleStore.setState({ cameraCommand: null }); // Consume command

      if (!ctrl) return;

      const target = new THREE.Vector3().copy(ctrl.target);
      const position = new THREE.Vector3().copy(camera.position);
      const direction = new THREE.Vector3().subVectors(position, target).normalize();
      const distance = camera.position.distanceTo(target);

      if (cmd === "zoom_in") {
        const newDist = Math.max(8, distance - 8);
        camera.position.copy(target).addScaledVector(direction, newDist);
        ctrl.update();
      } else if (cmd === "zoom_out") {
        const newDist = Math.min(130, distance + 8);
        camera.position.copy(target).addScaledVector(direction, newDist);
        ctrl.update();
      } else if (cmd === "reset" || cmd === "view_iso") {
        camera.position.set(30, 22, 34);
        ctrl.target.set(0, 5, 0);
        ctrl.update();
        useTwinCycleStore.setState({ pinnedSlot: null });
      } else if (cmd === "view_side") {
        camera.position.set(0, 8, 48);
        ctrl.target.set(0, 5, 0);
        ctrl.update();
      } else if (cmd === "view_top") {
        camera.position.set(0, 48, 0.1);
        ctrl.target.set(0, 5, 0);
        ctrl.update();
      } else if (cmd === "follow_chute") {
        // Close, chute-centered view — the discharge point sits at world
        // origin (the gantry never moves; the train creeps under it).
        camera.position.set(6, 9, 12);
        ctrl.target.set(0, 6, 0);
        ctrl.update();
      } else if (cmd === "follow_active_wagon") {
        // The scene re-centers the active wagon's slot to z=0 every frame
        // (Wagons.tsx), so "follow" is this fixed low-angle framing rather
        // than a moving-camera track.
        camera.position.set(16, 10, 20);
        ctrl.target.set(0, 4, 0);
        ctrl.update();
      }
    }
  });

  return (
    <OrbitControls
      ref={controls}
      enableDamping
      dampingFactor={0.08}
      minDistance={8}
      maxDistance={130}
      maxPolarAngle={Math.PI * 0.49}
      target={[0, 5, 0]}
    />
  );
}

function ConcreteStairs({
  x,
  y,
  z,
  width,
  length,
  rotation = 0,
  numSteps = 9,
}: {
  x: number;
  y: number;
  z: number;
  width: number;
  length: number;
  rotation?: number;
  numSteps?: number;
}) {
  const steps = useMemo(() => {
    const stepH = y / numSteps;
    const stepL = length / numSteps;
    return Array.from({ length: numSteps }).map((_, i) => {
      const h = (i + 1) * stepH;
      // Steps ascend along Z (from -length/2 to +length/2)
      const stepZ = -length / 2 + (i + 0.5) * stepL;
      const stepY = h / 2;
      return {
        key: i,
        position: [0, stepY, stepZ] as [number, number, number],
        args: [width, h, stepL] as [number, number, number],
      };
    });
  }, [y, width, length, numSteps]);

  return (
    <group position={[x, 0, z]} rotation={[0, THREE.MathUtils.degToRad(rotation), 0]}>
      {steps.map((step) => (
        <mesh key={step.key} position={step.position} castShadow receiveShadow>
          <boxGeometry args={step.args} />
          <meshStandardMaterial color="#3e4045" roughness={0.88} metalness={0.1} />
        </mesh>
      ))}
    </group>
  );
}

function Content() {
  const { scene: wagonScene, offset, slots } = useWagonAssembly();
  const { scene: hopperScene, measure } = useHopperMeasure();
  const calibration = useTwinCycleStore((s) => s.calibration);

  const piles = useMemo(
    () =>
      slots.map((slot, i) => ({
        key: i,
        position: [slot.center.x, slot.floorY, slot.center.z] as [number, number, number],
        halfX: slot.interiorHalfX,
        halfZ: slot.interiorHalfZ,
        maxHeight: Math.max(0.3, (slot.rimY - slot.floorY) * 0.92),
      })),
    [slots],
  );

  // Calculate concrete pillar positions based on individual pillar calibration values
  const concretePillars = useMemo(() => {
    const { p1X, p1Z, p2X, p2Z, p3X, p3Z, p4X, p4Z, pillarY } = calibration;

    return [
      [p1X, pillarY / 2, p1Z] as [number, number, number], // Front Left
      [p2X, pillarY / 2, p2Z] as [number, number, number], // Front Right
      [p3X, pillarY / 2, p3Z] as [number, number, number], // Back Left
      [p4X, pillarY / 2, p4Z] as [number, number, number], // Back Right
    ];
  }, [calibration]);

  const getOrigin = useMemo(
    () => {
      // Particles drop from the exact center of the raised gantry's discharge chute.
      // Math compensates for asymmetrical ladders using negative offsets:
      return () => {
        const s = useTwinCycleStore.getState();
        if (!s.emitting || s.phase !== "filling") return null;
        const cal = s.calibration;
        const scaleRatio = cal.hopperScale / 0.0055;
        return new THREE.Vector3(
          cal.hopperX - 0.58 * scaleRatio + cal.particleXOffset,
          cal.hopperY + 1.54 * scaleRatio,
          cal.hopperZ - 2.36 * scaleRatio + cal.particleZOffset,
        );
      };
    },
    [],
  );

  const getTargetY = useMemo(
    () => () => {
      const s = useTwinCycleStore.getState();
      const slot = slots[s.activeSlot];
      if (!slot) return 0;
      const pile = piles[s.activeSlot];
      const frac = s.clock.activeFill / 100;
      return slot.floorY + frac * pile.maxHeight * 0.85;
    },
    [slots, piles],
  );

  const getEmissionRate = useMemo(
    () => () => PARTICLE_BASE_EMISSION_RATE * useTwinCycleStore.getState().chuteOpeningPct,
    [],
  );

  return (
    <>
      <EngineBridgeDriver />
      <Lighting />
      <SceneEnvironment />
      <Ground length={Math.max(90, slots.length ? (slots[slots.length - 1].center.z - slots[0].center.z) * 1.6 : 90)} />
      
      {/* Support pillars under the hopper gantry legs */}
      {concretePillars.map((pos, idx) => (
        <mesh key={idx} position={pos} castShadow receiveShadow>
          <boxGeometry args={[calibration.pillarWidth, calibration.pillarY, calibration.pillarLength]} />
          <meshStandardMaterial color="#404247" roughness={0.88} metalness={0.1} />
        </mesh>
      ))}

      {/* Concrete stepped staircase under the access ladder */}
      <ConcreteStairs
        x={calibration.ladderX}
        y={calibration.ladderY}
        z={calibration.ladderZ}
        width={calibration.ladderWidth}
        length={calibration.ladderLength}
        rotation={calibration.ladderRotation}
      />

      <Wagons scene={wagonScene} offset={offset} slots={slots} piles={piles} />
      <Hopper scene={hopperScene} measure={measure} slots={slots} />
      <SulfurParticles getOrigin={getOrigin} getTargetY={getTargetY} getEmissionRate={getEmissionRate} />
    </>
  );
}

function SceneFallback() {
  return (
    <Html center>
      <div className="tnum rounded-md border border-border-subtle bg-bg-raised px-3 py-2 text-xs text-ink-secondary shadow-lg">
        Loading digital twin assets…
      </div>
    </Html>
  );
}

export function TrainScene() {
  const setCameraCommand = useTwinCycleStore((s) => s.setCameraCommand);
  const timeMultiplier = useSimStore((s) => s.timeMultiplier);
  const setTimeMultiplier = useSimStore((s) => s.setTimeMultiplier);

  useEffect(() => {
    // Reset pinned slot, focus target, and camera command on mount/unmount to prevent stale state bugs
    useTwinCycleStore.setState({
      pinnedSlot: null,
      focusTarget: null,
      cameraCommand: null,
    });
    return () => {
      useTwinCycleStore.setState({
        pinnedSlot: null,
        focusTarget: null,
        cameraCommand: null,
      });
    };
  }, []);

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-[#17151a]">
      <Canvas
        shadows="soft"
        dpr={[1, 1.75]}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
        camera={{ fov: 34, near: 0.5, far: 300 }}
        className="!h-full !w-full"
      >
        <color attach="background" args={["#17151a"]} />
        <Suspense fallback={<SceneFallback />}>
          <Content />
        </Suspense>
        <CameraRig />
        <EffectComposer multisampling={0}>
          <Bloom
            intensity={0.35}
            luminanceThreshold={0.86}
            luminanceSmoothing={0.25}
            mipmapBlur
            radius={0.5}
          />
          <Vignette eskil={false} offset={0.15} darkness={0.55} />
        </EffectComposer>
      </Canvas>

      {/* Floating Control Panel */}
      <div className="absolute right-4 bottom-4 z-10 flex flex-col gap-2 rounded-lg border border-border-subtle bg-bg-raised/85 p-2 shadow-lg backdrop-blur-md">
        <div className="flex gap-1.5 border-b border-border-subtle/40 pb-2">
          <button
            onClick={() => setCameraCommand("zoom_in")}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md bg-[#252830] text-ink-primary hover:bg-[#323642] active:scale-95 transition-all"
            title="Zoom In"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            onClick={() => setCameraCommand("zoom_out")}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md bg-[#252830] text-ink-primary hover:bg-[#323642] active:scale-95 transition-all"
            title="Zoom Out"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
            </svg>
          </button>
          <button
            onClick={() => setCameraCommand("reset")}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md bg-[#252830] text-ink-primary hover:bg-[#323642] active:scale-95 transition-all"
            title="Reset Camera (ISO)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </button>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setCameraCommand("view_side")}
            className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md bg-[#252830] px-2.5 py-1.5 text-[10px] font-medium text-ink-secondary hover:bg-[#323642] active:scale-95 transition-all"
          >
            <span>Side View</span>
          </button>
          <button
            onClick={() => setCameraCommand("view_top")}
            className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md bg-[#252830] px-2.5 py-1.5 text-[10px] font-medium text-ink-secondary hover:bg-[#323642] active:scale-95 transition-all"
          >
            <span>Top View</span>
          </button>
        </div>
        <div className="flex gap-1.5 border-t border-border-subtle/40 pt-2">
          <button
            onClick={() => setCameraCommand("follow_chute")}
            className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md bg-[#252830] px-2.5 py-1.5 text-[10px] font-medium text-ink-secondary hover:bg-[#323642] active:scale-95 transition-all"
          >
            <span>Follow Chute</span>
          </button>
          <button
            onClick={() => setCameraCommand("follow_active_wagon")}
            className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md bg-[#252830] px-2.5 py-1.5 text-[10px] font-medium text-ink-secondary hover:bg-[#323642] active:scale-95 transition-all"
          >
            <span>Follow Wagon</span>
          </button>
        </div>
        <div className="flex gap-1.5 border-t border-border-subtle/40 pt-2 items-center justify-between text-[10px] text-ink-secondary select-none">
          <span className="font-semibold">Speed:</span>
          <div className="flex gap-1">
            {[1, 4, 10].map((s) => (
              <button
                key={s}
                onClick={() => setTimeMultiplier(s)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                  timeMultiplier === s
                    ? "bg-mode-auto text-white"
                    : "bg-[#252830] text-ink-secondary hover:text-ink-primary hover:bg-[#323642]"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      </div>

      <TwinHud />
    </div>
  );
}

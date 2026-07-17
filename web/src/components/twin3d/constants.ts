// Digital-twin visualization tunables. Distinct from src/lib/sim/constants.ts
// (the PRD/engine constants) — these are purely cosmetic scene knobs (asset
// paths, unit conversions, particle counts). Live behavior (fill %, gate
// opening, wagon advance, train speed) is driven by the real TwinLiteEngine
// via useEngineBridge.ts, not by any timer defined in this file.

export const WAGON_MODEL_PATH = "/models/wagon.glb";
export const HOPPER_MODEL_PATH = "/models/hopper.glb";

// hopper.glb's mesh vertices are authored in centimeters with no
// compensating scale node (unlike wagon.glb, whose FBX-origin scale nodes
// already net out to meters) — confirmed via gltf-transform inspect: raw
// bbox spans ~4611 x 3840 x 3820 units, which is only plausible as a
// loading-gantry structure if read as centimeters.
export const HOPPER_UNIT_TO_METERS = 0.0055;

export const WAGON_NODE_NAMES = ["wagon", "wagon001", "wagon003"] as const;

// Fractions of each wagon's measured world bounding-box height (min..max)
// used to approximate the interior car floor / rim-top, since the source
// model has no dedicated "floor" node. Tuned by visual inspection against
// the reference renders (wheels + underframe occupy the bottom ~45%).
export const WAGON_FLOOR_FRACTION = 0.5;
export const WAGON_RIM_FRACTION = 0.94;
// Interior opening is inset from the outer hull on all sides (wall thickness).
export const WAGON_INTERIOR_INSET = 0.14;

// Vertical clearance between the hopper outlet and the wagon rim, so the
// falling-particle stream reads clearly.
export const HOPPER_CLEARANCE_M = 1.6;

// Loading-cycle timing — the slide/dwell transition between GLB wagon slots
// stays a short cosmetic animation; actual fill duration now comes from the
// engine (real per-wagon dwell time under the chute), not a fixed constant.
export const SLIDE_DURATION_S = 2.2;
export const DWELL_AFTER_FILL_S = 1.1;

export const PARTICLE_COUNT = 260;
export const PARTICLE_BASE_EMISSION_RATE = 90; // particles/sec at full gate opening

export const SULFUR_COLOR = "#e7c545";
export const SULFUR_HIGHLIGHT = "#ffe27a";
export const SULFUR_SHADOW = "#8a6a12";

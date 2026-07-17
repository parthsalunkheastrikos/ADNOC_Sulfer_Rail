# ProAI-SLO Advisory Console (Web Application)

This is the front-end codebase for the **ProAI Closed-Loop Sulfur Loading Optimization Platform (ProAI-SLO)** dashboard. It is a self-contained Next.js application that showcases the interactive operator interface, including the **S-01 Loading Console (with 3D Digital Twin)**, **S-02 Alarm List**, and **S-40 KPI Overview** screens.

For detailed background, architecture, and control theory details, please refer to the main [Root README](../README.md).

---

## 🚀 Getting Started

To run the Next.js dashboard locally:

1. Make sure you have [Node.js](https://nodejs.org/) installed.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🛠️ Key Scripts

- `npm run dev` — Starts the Next.js development server.
- `npm run build` — Bundles the application for production deployment and runs TypeScript compiler checks.
- `npm run lint` — Runs ESLint code style check.
- `npm run test` — Executes the Vitest unit and physics engine regression tests.

---

## 🧬 Simulation & Architecture Notes

- **`src/lib/sim/engine.ts` (`TwinLiteEngine`):** Contains the physics simulation engine that simulates train motion, silo discharge, belt conveyor transport delay (~45 seconds), chute levels, and wagon loading profiles.
- **`src/lib/sim/singleton.ts`:** Manages a single client-side engine instance.
- **`src/lib/store/useSimStore.ts`:** Zustand store that drives the simulation loop on a wall-clock interval and republishes state snapshots for React UI components.
- **High-Performance Canvas Rendering:** Canvas components (e.g., `TrainCanvas`, `PileHeightVisualizer`, `UtilizationChart`) tap directly into the engine's animation frame (`requestAnimationFrame`) loop to avoid expensive React re-renders and achieve smooth 60fps rendering.

# ProAI Closed-Loop Sulfur Loading Optimization Platform (ProAI-SLO)

Welcome to the **ProAI Closed-Loop Sulfur Loading Optimization Platform (ProAI-SLO)** repository. This project is an advanced AI-driven control and advisory dashboard designed to autonomously coordinate granulated sulfur rail-car loading operations at ADNOC (Etihad Rail service).

The system raises wagon payload utilization from the current manual baseline of **96–97%** to **≥ 99%** with **zero spill events**, while remaining strictly subordinate to the plant's existing Safety Instrumented System (SIS) and hardwired emergency stop chain.

---

## 📖 Project Overview & Background

Granulated sulfur loading at peak rates of up to **2,000 t/h** means that approximately **55 kg of material** is discharged from the loading chute **every 100 ms**. Human operators face several inherent challenges:
1. **Perception-Decision Latency:** Irreducible operator latency of 1–2 seconds, during which up to 1.1 tonnes of sulfur is committed to the chute.
2. **Conveyor Transport Delay:** A ~45-second dead time from the silo discharge gate to the chute (conveyor speed of 3.2 m/s over ~145 m). Material released now will only reach the rail-car 45 seconds later.
3. **Multi-Variable Complexity:** Simultaneously monitoring mass flow, train creep speed, wagon boundary approach, and pile geometry is extremely difficult.
4. **Defensive Under-filling:** To avoid costly spills on tracks and inter-wagon gaps, operators throttle the gate early, capping average wagon utilization at 96-97%.

### How ProAI-SLO Closes the Gap
ProAI-SLO executes a **Model Predictive Control (MPC) loop at 10 Hz (100 ms ticks)** with an explicit transport-delay model (Smith-predictor structure) and a learned material-flow response model. Every 100 ms, it re-solves a constrained optimization over a 30-second horizon, shaping the gate command **45 seconds ahead of the physical event**. A Reinforcement-Learning policy (with hard action masking against the safety constraint set) refines the MPC targets from accumulated operational data.

---

## 🛠️ Repository Structure

The project is organized as follows:
- **`web/`**: The web application front-end containing the Next.js interactive dashboard, 3D Digital Twin, loading console, alarm log, and key performance indicator (KPI) screens.
  - **`web/src/`**: React application components, Zustand state management, and Three.js / Canvas visualization systems.
  - **`web/src/lib/sim/`**: The core simulation engines. `TwinLiteEngine` is a client-side physics simulator built to demonstrate the product's value proposition.
- **`docs/`**: Technical specification and architecture design documents:
  - `01_PRD_ProAI_Sulfur_Loading.md`: Product Requirement Document.
  - `02_MVP_Scope_PhaseA.md`: Minimum Viable Product Scope (Phase-A).
  - `03_UIUX_Design_Specification.md`: Detailed UI/UX Layouts and Specifications.
  - `04_Technical_Stack_Design.md`: Layered OT/IT Architecture and Hardware specifications.
  - `05_Database_Schema_Architecture.md`: Historian (TimescaleDB) and configuration schemas.
  - `06_Development_Roadmap.md`: Project schedule and release plan.
- **`assets/`**: Includes the 3D models and specifications for loading chutes and railway hopper cars.

---

## 🚀 Running the Project Locally

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) (v18 or higher recommended) and `npm` installed.

### Start the Console
You can quickly run the development environment using the script in the root directory:

**Windows Command Prompt / PowerShell:**
```bash
run_local_test.bat
```
This batch file will automatically install dependencies on first run, configure the environment, and spin up the dev server.

**Manual Start:**
1. Navigate to the `web` folder:
   ```bash
   cd web
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Next.js development server:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to: **`http://localhost:3000`** (or the port shown in your terminal).

---

## 🧪 Testing the Simulation Engine

We have written Vitest unit and regression tests for the simulation engine to ensure control-law correctness:
```bash
cd web
npm run test
```
The test suite validates that:
- **AI/ADVISORY mode** consistently runs with zero or near-zero spills while exceeding 99% utilization.
- **MANUAL mode** represents typical human behavior, showing under-filling (~96%) and occasional spills when pushed too close to bounds.

---

## 🌐 Deployment & Live Preview

The interactive Next.js application has been deployed to **Vercel** so that anyone can view and interact with the loading console live.

**Live Deployment URL:** [https://web-ruddy-two-80.vercel.app](https://web-ruddy-two-80.vercel.app)

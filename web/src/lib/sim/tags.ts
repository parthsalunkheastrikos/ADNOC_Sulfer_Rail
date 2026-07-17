// OPC-UA-shaped tag dictionary (docs audit 2026-07-16, Phase 5 §1) — exposes
// the engine's internal scalars the way a real ingest would deliver them:
// namespaced tag name + value + unit + timestamp + quality, instead of bare
// numbers with no provenance. Backs S-30 Signal Health & Integration
// Diagnostics.
import type { TwinLiteEngine } from "./engine";
import type { DataQuality } from "@/types/domain";

export interface TagReading {
  name: string;
  label: string;
  value: number;
  unit: string;
  decimals: number;
  quality: DataQuality;
  timestampMs: number;
}

export function getTagReadings(engine: TwinLiteEngine): TagReading[] {
  const t = engine.simTimeMs;
  return [
    {
      name: "slo.belt.weigher.rate",
      label: "Belt weigher — gate rate",
      value: engine.beltRateActualTph,
      unit: "t/h",
      decimals: 0,
      quality: engine.getTagQuality("beltWeigher"),
      timestampMs: t,
    },
    {
      name: "slo.train.speed",
      label: "Train speed encoder",
      value: engine.speedKmh,
      unit: "km/h",
      decimals: 2,
      quality: engine.getTagQuality("trainSpeed"),
      timestampMs: t,
    },
    {
      name: "slo.chute.radar.surgebin_level",
      label: "Chute radar — surge bin level",
      value: engine.surgeBinT,
      unit: "t",
      decimals: 2,
      quality: engine.getTagQuality("chuteRadar"),
      timestampMs: t,
    },
    {
      name: "slo.chute.gate.position",
      label: "Chute gate position",
      value: engine.chuteGateOpeningPct * 100,
      unit: "%",
      decimals: 0,
      quality: engine.getTagQuality("chuteGate"),
      timestampMs: t,
    },
    {
      name: "slo.surgebin.inventory",
      label: "Surge bin inventory / capacity",
      value: engine.surgeBinT,
      unit: "t",
      decimals: 2,
      quality: engine.getTagQuality("surgeBin"),
      timestampMs: t,
    },
    {
      name: "slo.model.spi",
      label: "Spill Probability Index (model)",
      value: engine.spi,
      unit: "",
      decimals: 3,
      quality: "GOOD",
      timestampMs: t,
    },
  ];
}

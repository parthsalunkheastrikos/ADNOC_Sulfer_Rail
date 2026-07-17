import { TwinLiteEngine } from "./engine";

// A single client-side engine instance backs the whole console. Created lazily
// so it never runs during server-side rendering.
let _engine: TwinLiteEngine | null = null;

export function getEngine(): TwinLiteEngine {
  if (!_engine) {
    _engine = new TwinLiteEngine(42);
    _engine.seedDemoSession();
  }
  return _engine;
}

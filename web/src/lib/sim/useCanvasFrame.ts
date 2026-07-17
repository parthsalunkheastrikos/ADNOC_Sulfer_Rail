"use client";
import { useEffect, useRef } from "react";
import { useEngineFrame } from "./useEngineFrame";
import type { TwinLiteEngine } from "./engine";

/**
 * Wires a <canvas> to a DPR-correct backing store sized to its CSS box, and
 * redraws it on a throttled rAF loop against the live engine — decouples
 * canvas render cadence from React's render cycle entirely.
 */
export function useCanvasFrame(
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, engine: TwinLiteEngine) => void,
  fps = 30,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      sizeRef.current = { w: width, h: height };
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      const ctx = canvas.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEngineFrame((engine) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w, h } = sizeRef.current;
    if (w === 0 || h === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // save/restore around the whole draw so a throw mid-frame (caught by
    // useEngineFrame) can't leave an unbalanced clip/transform on the
    // context and corrupt every subsequent frame (M-6).
    ctx.save();
    try {
      draw(ctx, w, h, engine);
    } finally {
      ctx.restore();
    }
  }, fps);

  return canvasRef;
}

"use client";
import { useCanvasFrame } from "@/lib/sim/useCanvasFrame";
import { getCanvasTheme } from "@/lib/sim/canvasTheme";

export function SpiSparkline({ width = 90, height = 24 }: { width?: number; height?: number }) {
  const canvasRef = useCanvasFrame((ctx, w, h, engine) => {
    const theme = getCanvasTheme();
    ctx.clearRect(0, 0, w, h);
    const samples = engine.history.spi.toOrderedArray(120); // last 12s @10Hz
    if (samples.length < 2) return;

    const max = Math.max(0.02, ...Array.from(samples));
    const stepX = w / (samples.length - 1);

    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const x = i * stepX;
      const y = h - (samples[i] / max) * h * 0.92 - 1;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    const last = samples[samples.length - 1];
    ctx.strokeStyle = last > 0.02 ? theme.alarmHigh : last > 0.01 ? theme.alarmMedium : theme.seriesPrimary;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, 10);

  return <canvas ref={canvasRef} style={{ width, height }} className="block" />;
}

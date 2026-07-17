"use client";
import { useCanvasFrame } from "@/lib/sim/useCanvasFrame";
import { canvasMono } from "@/lib/sim/canvasFonts";
import { getCanvasTheme } from "@/lib/sim/canvasTheme";
import type { PlatformMode } from "@/types/domain";

function modeColor(theme: ReturnType<typeof getCanvasTheme>, mode: PlatformMode) {
  switch (mode) {
    case "AUTONOMOUS":
      return theme.modeAuto;
    case "MANUAL":
      return theme.modeManual;
    case "FALLBACK":
      return theme.alarmCritical;
    default:
      return theme.seriesTertiary;
  }
}

/** Full-session mode history across every completed wagon — where AUTONOMOUS vs. MANUAL time actually fell. */
export function ModeTimeline() {
  const canvasRef = useCanvasFrame((ctx, w, h, engine) => {
    const theme = getCanvasTheme();
    ctx.clearRect(0, 0, w, h);

    const wagons = engine.completed;
    if (wagons.length === 0) {
      ctx.fillStyle = theme.inkTertiary;
      ctx.font = canvasMono(12);
      ctx.fillText("Awaiting completed wagons…", 8, h / 2);
      return;
    }

    const barW = w / wagons.length;
    wagons.forEach((wgn, i) => {
      ctx.fillStyle = modeColor(theme, wgn.controlMode);
      ctx.fillRect(i * barW, 4, Math.max(1, barW - 0.5), h - 20);
    });

    // legend
    const legend: [PlatformMode, string][] = [
      ["AUTONOMOUS", "AUTO"],
      ["MANUAL", "MANUAL"],
      ["FALLBACK", "FALLBACK"],
    ];
    let lx = 4;
    ctx.font = canvasMono(10);
    for (const [mode, label] of legend) {
      ctx.fillStyle = modeColor(theme, mode);
      ctx.fillRect(lx, h - 12, 8, 8);
      ctx.fillStyle = theme.inkTertiary;
      ctx.fillText(label, lx + 12, h - 4);
      lx += 12 + ctx.measureText(label).width + 14;
    }
  }, 3);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}

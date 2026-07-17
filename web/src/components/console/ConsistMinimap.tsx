"use client";
import { useCanvasFrame } from "@/lib/sim/useCanvasFrame";
import { getCanvasTheme } from "@/lib/sim/canvasTheme";
import { WAGON_RATED_PAYLOAD_T } from "@/lib/sim/constants";

export function ConsistMinimap() {
  const canvasRef = useCanvasFrame((ctx, w, h, engine) => {
    const theme = getCanvasTheme();
    ctx.clearRect(0, 0, w, h);
    const n = engine.wagonCount;
    const barW = w / n;
    for (let i = 0; i < n; i++) {
      const seq = i + 1;
      let color = theme.borderSubtle;
      let util = 0;
      if (seq === engine.activeSeq) {
        util = (engine.activeWagon.fillT / WAGON_RATED_PAYLOAD_T) * 100;
        color = theme.seriesPrimary;
      } else if (seq < engine.activeSeq) {
        const rec = engine.completed.find((c) => c.seq === seq);
        util = rec?.utilizationPct ?? 0;
        color = rec?.spillFlag || rec?.overloadFlag ? theme.alarmCritical : util < 98.5 ? theme.modeManual : theme.seriesSecondary;
      }
      const barH = seq <= engine.activeSeq ? Math.max(2, (util / 100) * h) : 2;
      ctx.fillStyle = seq > engine.activeSeq ? theme.bgRaised : color;
      ctx.fillRect(i * barW, h - barH, Math.max(1, barW - 0.5), barH);
    }
    // active wagon marker
    const activeX = (engine.activeSeq - 1) * barW;
    ctx.strokeStyle = theme.ink;
    ctx.beginPath();
    ctx.moveTo(activeX, 0);
    ctx.lineTo(activeX, h);
    ctx.stroke();
  }, 4);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}

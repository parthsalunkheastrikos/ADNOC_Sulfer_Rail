"use client";
import { useCanvasFrame } from "@/lib/sim/useCanvasFrame";
import { useCanvasHover, drawTooltip } from "@/lib/sim/useCanvasHover";
import { canvasMono } from "@/lib/sim/canvasFonts";
import { getCanvasTheme, withAlpha } from "@/lib/sim/canvasTheme";

const BINS = [
  { max: 95, label: "<95" },
  { max: 96, label: "95–96" },
  { max: 97, label: "96–97" },
  { max: 98, label: "97–98" },
  { max: 99, label: "98–99" },
  { max: 100, label: "99–100" },
  { max: Infinity, label: "100+" },
];

/** Distribution of completed-wagon utilization %, this train's whole session. */
export function UtilizationHistogram() {
  const canvasRef = useCanvasFrame((ctx, w, h, engine) => {
    const theme = getCanvasTheme();
    ctx.clearRect(0, 0, w, h);

    const counts = new Array(BINS.length).fill(0);
    for (const wgn of engine.completed) {
      const idx = BINS.findIndex((b) => wgn.utilizationPct < b.max);
      counts[idx === -1 ? BINS.length - 1 : idx]++;
    }
    const maxCount = Math.max(1, ...counts);

    const marginB = 26;
    const marginT = 10;
    const plotH = h - marginB - marginT;
    const barGap = 6;
    const barW = (w - barGap * (BINS.length + 1)) / BINS.length;

    const hv = hover.current;
    let hoveredIdx = -1;
    if (hv.active) {
      const i = Math.floor((hv.x - barGap / 2) / (barW + barGap));
      if (i >= 0 && i < BINS.length) hoveredIdx = i;
    }

    counts.forEach((c, i) => {
      const barH = (c / maxCount) * plotH;
      const x = barGap + i * (barW + barGap);
      const y = marginT + plotH - barH;
      ctx.fillStyle = i >= 4 ? theme.seriesSecondary : i >= 2 ? theme.seriesPrimary : theme.modeManual;
      ctx.globalAlpha = hoveredIdx === -1 || hoveredIdx === i ? 1 : 0.45;
      ctx.fillRect(x, y, barW, Math.max(1, barH));
      ctx.globalAlpha = 1;

      if (c > 0) {
        ctx.fillStyle = theme.ink;
        ctx.font = canvasMono(10, true);
        ctx.textAlign = "center";
        ctx.fillText(String(c), x + barW / 2, y - 4);
      }
      ctx.fillStyle = theme.inkTertiary;
      ctx.font = canvasMono(9);
      ctx.textAlign = "center";
      ctx.fillText(BINS[i].label, x + barW / 2, h - 8);
    });
    ctx.textAlign = "left";

    if (engine.completed.length === 0) {
      ctx.fillStyle = theme.inkTertiary;
      ctx.font = canvasMono(12);
      ctx.textAlign = "center";
      ctx.fillText("Awaiting completed wagons…", w / 2, h / 2);
      ctx.textAlign = "left";
    }

    ctx.strokeStyle = withAlpha(theme.inkDim, 0.2);
    ctx.beginPath();
    ctx.moveTo(0, marginT + plotH);
    ctx.lineTo(w, marginT + plotH);
    ctx.stroke();

    if (hoveredIdx !== -1) {
      const x = barGap + hoveredIdx * (barW + barGap) + barW / 2;
      const barH = (counts[hoveredIdx] / maxCount) * plotH;
      const y = marginT + plotH - barH;
      drawTooltip(ctx, {
        x,
        y,
        w: 108,
        canvasW: w,
        bg: theme.bgRaised,
        border: theme.borderSubtle,
        ink: theme.ink,
        inkDim: theme.inkDim,
        font: canvasMono(10.5),
        lines: [`${BINS[hoveredIdx].label}%`, `${counts[hoveredIdx]} wagon${counts[hoveredIdx] === 1 ? "" : "s"}`],
      });
    }
  }, 20);

  const hover = useCanvasHover(canvasRef);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}

"use client";
import { useCanvasFrame } from "@/lib/sim/useCanvasFrame";
import { useCanvasHover, drawTooltip } from "@/lib/sim/useCanvasHover";
import { canvasMono, canvasUi } from "@/lib/sim/canvasFonts";
import { getCanvasTheme, withAlpha } from "@/lib/sim/canvasTheme";
import { clamp } from "@/lib/sim/rng";

const BASELINE_PCT = 96.6;
const TARGET_PCT = 99.0;
const Y_MIN = 92;
const Y_MAX = 102;

export function UtilizationChart() {
  const canvasRef = useCanvasFrame((ctx, w, h, engine) => {
    const theme = getCanvasTheme();
    ctx.clearRect(0, 0, w, h);
    const marginL = 4;
    const marginR = 56;
    const marginT = 10;
    const marginB = 22;
    const plotW = w - marginL - marginR;
    const plotH = h - marginT - marginB;
    // Clamp: badly under-filled manual wagons can fall below Y_MIN, and an
    // unclamped y ran off the bottom of the plot — reconnecting the line
    // from off-screen back into range drew as a vertical "needle" artifact
    // once 60 points got compressed onto a couple hundred px of width.
    const toY = (v: number) => marginT + (1 - (clamp(v, Y_MIN, Y_MAX) - Y_MIN) / (Y_MAX - Y_MIN)) * plotH;

    const wagons = engine.completed.slice(-60);

    // gridlines + reference lines
    ctx.strokeStyle = withAlpha(theme.inkDim, 0.12);
    ctx.lineWidth = 1;
    for (const v of [92, 96, 100]) {
      ctx.beginPath();
      ctx.moveTo(marginL, toY(v));
      ctx.lineTo(marginL + plotW, toY(v));
      ctx.stroke();
      ctx.fillStyle = theme.inkTertiary;
      ctx.font = canvasMono(10);
      ctx.fillText(`${v}%`, marginL + plotW + 6, toY(v) + 3);
    }

    ctx.strokeStyle = theme.seriesTertiary;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(marginL, toY(BASELINE_PCT));
    ctx.lineTo(marginL + plotW, toY(BASELINE_PCT));
    ctx.stroke();
    ctx.fillStyle = theme.seriesTertiary;
    ctx.font = canvasUi(10);
    ctx.fillText("baseline 96.6%", marginL + 4, toY(BASELINE_PCT) - 4);

    ctx.strokeStyle = withAlpha(theme.seriesPrimary, 0.55);
    ctx.beginPath();
    ctx.moveTo(marginL, toY(TARGET_PCT));
    ctx.lineTo(marginL + plotW, toY(TARGET_PCT));
    ctx.stroke();
    ctx.fillStyle = theme.seriesPrimary;
    ctx.fillText("target 99.0%", marginL + 4, toY(TARGET_PCT) - 4);
    ctx.setLineDash([]);

    if (wagons.length < 2) {
      // Sit in the free band between the 92% gridline and the baseline
      // reference line/label so the empty-state message never collides
      // with the baseline or target annotations above it.
      ctx.fillStyle = theme.inkTertiary;
      ctx.font = canvasUi(12);
      ctx.fillText("Awaiting completed wagons…", marginL + 8, toY(94));
      return;
    }

    const stepX = plotW / (wagons.length - 1);
    const isManual = (mode: string) => mode === "MANUAL" || mode === "FALLBACK";
    const points = wagons.map((wg, i) => ({
      x: marginL + i * stepX,
      y: toY(wg.utilizationPct),
      manual: isManual(wg.controlMode),
    }));

    // Line segments colored by control mode — so a mid-session manual dip
    // reads as "operator period", not noise indistinguishable from AI.
    ctx.lineWidth = 2;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      ctx.strokeStyle = b.manual ? theme.modeManual : theme.seriesPrimary;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Small per-wagon dots keep the series legible once 60 points compress
    // onto a couple hundred px of width (a bare 2px line reads as noise).
    for (const pt of points) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = pt.manual ? theme.modeManual : theme.seriesPrimary;
      ctx.fill();
    }

    // markers for out-of-band wagons (status color, not a new categorical hue)
    wagons.forEach((wg, i) => {
      if (!wg.overloadFlag && !wg.spillFlag) return;
      ctx.beginPath();
      ctx.arc(points[i].x, points[i].y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = theme.alarmCritical;
      ctx.fill();
    });

    // direct label on last point
    const last = wagons[wagons.length - 1];
    const lp = points[points.length - 1];
    ctx.fillStyle = theme.ink;
    ctx.font = canvasMono(11, true);
    ctx.fillText(`${last.utilizationPct.toFixed(1)}%`, Math.min(lp.x + 6, w - marginR + 2), lp.y + 4);

    // legend
    const legendY = marginT + 2;
    ctx.font = canvasUi(10);
    ctx.fillStyle = theme.seriesPrimary;
    ctx.fillRect(marginL, legendY, 8, 2);
    ctx.fillStyle = theme.inkTertiary;
    ctx.fillText("AI", marginL + 12, legendY + 4);
    ctx.fillStyle = theme.modeManual;
    ctx.fillRect(marginL + 32, legendY, 8, 2);
    ctx.fillStyle = theme.inkTertiary;
    ctx.fillText("Manual", marginL + 44, legendY + 4);

    // Hover: nearest-point hit test -> crosshair + highlighted dot + tooltip (Phase 4a).
    const hv = hover.current;
    if (hv.active) {
      let nearest = 0;
      let nearestDist = Infinity;
      for (let i = 0; i < points.length; i++) {
        const d = Math.abs(points[i].x - hv.x);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = i;
        }
      }
      if (nearestDist < stepX) {
        const pt = points[nearest];
        const wg = wagons[nearest];
        ctx.strokeStyle = withAlpha(theme.inkDim, 0.35);
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(pt.x, marginT);
        ctx.lineTo(pt.x, marginT + plotH);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = pt.manual ? theme.modeManual : theme.seriesPrimary;
        ctx.fill();
        ctx.strokeStyle = theme.ink;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        drawTooltip(ctx, {
          x: pt.x,
          y: pt.y,
          w: 128,
          canvasW: w,
          bg: theme.bgRaised,
          border: theme.borderSubtle,
          ink: theme.ink,
          inkDim: theme.inkDim,
          font: canvasMono(10.5),
          lines: [
            `Wagon #${wg.seq}  ${wg.utilizationPct.toFixed(2)}%`,
            `${wg.netT.toFixed(2)} t · ${wg.controlMode === "MANUAL" || wg.controlMode === "FALLBACK" ? "manual" : "AI"}`,
            wg.spillFlag || wg.overloadFlag ? `⚠ ${wg.spillFlag ? "spill" : ""}${wg.spillFlag && wg.overloadFlag ? " + " : ""}${wg.overloadFlag ? "overload" : ""}` : "no flags",
          ],
        });
      }
    }
  }, 24);

  const hover = useCanvasHover(canvasRef);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}

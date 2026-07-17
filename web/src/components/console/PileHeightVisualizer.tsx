"use client";
import { useCanvasFrame } from "@/lib/sim/useCanvasFrame";
import { RIM_HEIGHT_M, RIM_FREEBOARD_M, PROFILE_BINS } from "@/lib/sim/constants";
import { canvasMono, canvasUi } from "@/lib/sim/canvasFonts";
import { getCanvasTheme, withAlpha } from "@/lib/sim/canvasTheme";

export function PileHeightVisualizer() {
  const canvasRef = useCanvasFrame((ctx, w, h, engine) => {
    const theme = getCanvasTheme();
    ctx.clearRect(0, 0, w, h);
    const marginTop = 14;
    const marginBottom = 10;
    const plotH = h - marginTop - marginBottom;
    const rimY = marginTop;
    const freeboardY = marginTop + (RIM_FREEBOARD_M / RIM_HEIGHT_M) * plotH;
    const baseY = marginTop + plotH;

    // freeboard hatch band
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, rimY, w, freeboardY - rimY);
    ctx.clip();
    ctx.strokeStyle = withAlpha(theme.alarmHigh, 0.35);
    ctx.lineWidth = 1;
    for (let x = -h; x < w; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x, rimY);
      ctx.lineTo(x + (freeboardY - rimY), freeboardY);
      ctx.stroke();
    }
    ctx.restore();

    // rim line
    ctx.strokeStyle = theme.inkTertiary;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, rimY);
    ctx.lineTo(w, rimY);
    ctx.stroke();
    ctx.fillStyle = theme.inkDim;
    ctx.font = canvasMono(10);
    ctx.fillText("rim", 4, rimY - 3);

    const profile = engine.activeWagon.profile;
    const fillT = engine.activeWagon.fillT;
    const { finalT } = engine.projection();
    const scaleUp = fillT > 0.5 ? Math.min(finalT / fillT, 1.5) : 1;

    const binW = w / PROFILE_BINS;
    const yFor = (heightM: number) => baseY - (Math.min(heightM, RIM_HEIGHT_M * 1.15) / RIM_HEIGHT_M) * plotH;

    // projected final surface (dashed)
    ctx.strokeStyle = theme.seriesPlan;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    for (let i = 0; i < PROFILE_BINS; i++) {
      const x = i * binW + binW / 2;
      const y = yFor(profile[i] * scaleUp);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // measured / model-estimated surface (solid), red where it breaches freeboard
    ctx.beginPath();
    let breach = false;
    for (let i = 0; i < PROFILE_BINS; i++) {
      const x = i * binW + binW / 2;
      const y = yFor(profile[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      if (profile[i] > RIM_HEIGHT_M) breach = true;
    }
    ctx.strokeStyle = breach ? theme.alarmCritical : theme.seriesPrimary;
    ctx.lineWidth = 2;
    ctx.stroke();

    // fill under curve
    ctx.lineTo(w, baseY);
    ctx.lineTo(0, baseY);
    ctx.closePath();
    ctx.fillStyle = breach ? withAlpha(theme.alarmCritical, 0.18) : withAlpha(theme.seriesPrimary, 0.14);
    ctx.fill();

    // watermark — Phase A has no LiDAR, this is model-estimated only
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = theme.inkTertiary;
    ctx.font = canvasUi(11, true);
    ctx.textAlign = "right";
    ctx.fillText("MODEL EST. — NO LIDAR (PHASE A)", w - 6, baseY - 6);
    ctx.restore();
    ctx.textAlign = "left";
  }, 12);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}

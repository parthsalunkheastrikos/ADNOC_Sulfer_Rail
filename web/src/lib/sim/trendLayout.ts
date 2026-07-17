import { TICK_MS } from "./constants";
import { getCanvasTheme, withAlpha } from "./canvasTheme";

export const PAST_S = 120;
export const FUTURE_S = 30;
export const NOW_FRACTION = PAST_S / (PAST_S + FUTURE_S); // 0.8

/**
 * True start offset (seconds, negative) for a history sample array at 10 Hz.
 * Early in a session there are fewer samples than PAST_S covers — the series
 * must occupy only the time it actually represents, not be stretched across
 * the full window.
 */
export function historyStartOffsetS(sampleCount: number): number {
  return -Math.min(PAST_S, ((sampleCount - 1) * TICK_MS) / 1000);
}

/** x-pixel for a time offset in seconds relative to "now" (negative = past). */
export function xForSecondsOffset(w: number, tRel: number): number {
  const pastWidth = w * NOW_FRACTION;
  const futureWidth = w - pastWidth;
  if (tRel <= 0) return pastWidth + (tRel / PAST_S) * pastWidth;
  return pastWidth + (tRel / FUTURE_S) * futureWidth;
}

/** Inverse of xForSecondsOffset: time offset (seconds, negative = past) for an x-pixel. Used by the hover time-cursor (Phase 4a). */
export function secondsOffsetForX(w: number, x: number): number {
  const pastWidth = w * NOW_FRACTION;
  const futureWidth = w - pastWidth;
  if (x <= pastWidth) return ((x - pastWidth) / Math.max(1, pastWidth)) * PAST_S;
  return ((x - pastWidth) / Math.max(1, futureWidth)) * FUTURE_S;
}

/** Nearest-sample value lookup for a hover time offset, matching drawSeries' own index<->time mapping. */
export function sampleAtOffset(
  values: Float32Array,
  startOffsetS: number,
  endOffsetS: number,
  tRel: number,
): number | null {
  const n = values.length;
  if (n < 2 || endOffsetS === startOffsetS) return null;
  const frac = (tRel - startOffsetS) / (endOffsetS - startOffsetS);
  const idx = Math.round(frac * (n - 1));
  if (idx < 0 || idx >= n) return null;
  return values[idx];
}

export function drawTimeAxis(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const theme = getCanvasTheme();
  const nowX = xForSecondsOffset(w, 0);
  ctx.strokeStyle = withAlpha(theme.inkDim, 0.15);
  ctx.lineWidth = 1;
  for (const t of [-120, -90, -60, -30, 0, 30]) {
    const x = xForSecondsOffset(w, t);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  // future zone tint
  ctx.fillStyle = withAlpha(theme.seriesPrimary, 0.04);
  ctx.fillRect(nowX, 0, w - nowX, h);
  // now cursor
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(nowX, 0);
  ctx.lineTo(nowX, h);
  ctx.stroke();
}

export function drawSeries(
  ctx: CanvasRenderingContext2D,
  w: number,
  values: Float32Array,
  startOffsetS: number,
  endOffsetS: number,
  toY: (v: number) => number,
  color: string,
  opts: { dashed?: boolean; lineWidth?: number } = {},
) {
  if (values.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = opts.lineWidth ?? 1.5;
  if (opts.dashed) ctx.setLineDash([4, 3]);
  ctx.beginPath();
  const n = values.length;
  for (let i = 0; i < n; i++) {
    const tRel = startOffsetS + (i / (n - 1)) * (endOffsetS - startOffsetS);
    const x = xForSecondsOffset(w, tRel);
    const y = toY(values[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

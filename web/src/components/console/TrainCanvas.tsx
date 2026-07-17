"use client";
import { useRef, useState } from "react";
import { useCanvasFrame } from "@/lib/sim/useCanvasFrame";
import { getEngine } from "@/lib/sim/singleton";
import { useSimStore } from "@/lib/store/useSimStore";
import {
  WAGON_HOPPER_OPENING_M,
  INTER_WAGON_GAP_M,
  WAGON_LENGTH_OVER_COUPLERS_M,
  WAGON_RATED_PAYLOAD_T,
  PROFILE_BINS,
  RIM_HEIGHT_M,
} from "@/lib/sim/constants";
import type { TwinLiteEngine } from "@/lib/sim/engine";
import { canvasMono } from "@/lib/sim/canvasFonts";
import { getCanvasTheme, withAlpha } from "@/lib/sim/canvasTheme";

const PITCH_M = WAGON_LENGTH_OVER_COUPLERS_M; // hopper + gap
const WHEEL_CIRCUMFERENCE_M = 2 * Math.PI * 0.45;

const reducedMotion =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function wagonRimColor(theme: ReturnType<typeof getCanvasTheme>, overRisk: boolean, emphasized: boolean) {
  if (overRisk) return theme.alarmCritical;
  if (emphasized) return theme.seriesPrimary;
  return theme.borderStrong;
}

/** Shared by the draw pass and the hover/click hit-test so they never drift apart. */
function trackGeometry(w: number, h: number, zoomRadius: number) {
  return {
    chuteX: w * 0.58,
    trackY: h * 0.46,
    trackH: Math.min(120, h * 0.3),
    pxPerM: Math.max(14, Math.min(34, (w * 0.6) / (PITCH_M * (zoomRadius * 2 + 1)))),
  };
}

interface WagonDetail {
  seq: number;
  uid: string | null;
  status: "PENDING" | "FILLING" | "COMPLETE";
  fillT: number | null;
  utilizationPct: number;
  projectedFinalT: number | null;
  freeboardM: number | null;
  spillFlag: boolean;
}

function wagonDetail(engine: TwinLiteEngine, seq: number): WagonDetail | null {
  if (seq === engine.activeSeq) {
    const w = engine.activeWagon;
    return {
      seq,
      uid: w.uid,
      status: w.status,
      fillT: w.fillT,
      utilizationPct: (w.fillT / WAGON_RATED_PAYLOAD_T) * 100,
      projectedFinalT: engine.projection().finalT,
      freeboardM: w.minFreeboardM,
      spillFlag: w.spillFlag,
    };
  }
  if (seq < engine.activeSeq) {
    const rec = engine.completed.find((c) => c.seq === seq);
    if (!rec) return null;
    return {
      seq,
      uid: rec.uid,
      status: "COMPLETE",
      fillT: rec.netT,
      utilizationPct: rec.utilizationPct,
      projectedFinalT: rec.netT,
      freeboardM: null,
      spillFlag: rec.spillFlag,
    };
  }
  return { seq, uid: null, status: "PENDING", fillT: null, utilizationPct: 0, projectedFinalT: null, freeboardM: null, spillFlag: false };
}

/** Trapezoidal hopper-car body fill — drawn *under* the pile so the mound reads as sitting inside the hopper, not painted over it. */
function drawWagonBodyBg(
  ctx: CanvasRenderingContext2D,
  x: number,
  topY: number,
  w: number,
  h: number,
  theme: ReturnType<typeof getCanvasTheme>,
) {
  const underframeInset = w * 0.09;
  const bodyBottomY = topY + h - 12;
  ctx.beginPath();
  ctx.moveTo(x, topY);
  ctx.lineTo(x + w, topY);
  ctx.lineTo(x + w - underframeInset, bodyBottomY);
  ctx.lineTo(x + underframeInset, bodyBottomY);
  ctx.closePath();
  ctx.fillStyle = theme.bgPanel;
  ctx.fill();
}

/**
 * Hopper-car foreground detail: rim outline, top chord, rib lines, two
 * 2-wheel bogies. Drawn *over* the pile fill (drawPile()) so the crisp
 * silhouette and wheels always read on top of the sulfur mound.
 */
function drawWagonBodyFg(
  ctx: CanvasRenderingContext2D,
  x: number,
  topY: number,
  w: number,
  h: number,
  theme: ReturnType<typeof getCanvasTheme>,
  rimColor: string,
  lineWidth: number,
  wheelPhaseRad: number,
) {
  const underframeInset = w * 0.09;
  const bodyBottomY = topY + h - 12;

  ctx.beginPath();
  ctx.moveTo(x, topY);
  ctx.lineTo(x + w, topY);
  ctx.lineTo(x + w - underframeInset, bodyBottomY);
  ctx.lineTo(x + underframeInset, bodyBottomY);
  ctx.closePath();
  ctx.strokeStyle = rimColor;
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  // top chord rail
  ctx.strokeStyle = withAlpha(theme.ink, 0.35);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 1, topY + 2);
  ctx.lineTo(x + w - 1, topY + 2);
  ctx.stroke();

  // rib lines (only where wide enough to read)
  if (w > 46) {
    const ribCount = Math.max(3, Math.round(w / 20));
    ctx.strokeStyle = withAlpha(theme.ink, 0.14);
    ctx.lineWidth = 1;
    for (let i = 1; i < ribCount; i++) {
      const fx = x + (w / ribCount) * i;
      ctx.beginPath();
      ctx.moveTo(fx, topY + 4);
      ctx.lineTo(fx, bodyBottomY - 2);
      ctx.stroke();
    }
  }

  // bogies (2 wheels each) below the underframe
  const wheelY = topY + h - 6;
  const wheelR = Math.min(5, Math.max(2.5, w * 0.03));
  const bogieXs = [x + w * 0.24, x + w * 0.76];
  for (const bx of bogieXs) {
    for (const dx of [-wheelR * 1.6, wheelR * 1.6]) {
      const cx = bx + dx;
      ctx.beginPath();
      ctx.arc(cx, wheelY, wheelR, 0, Math.PI * 2);
      ctx.fillStyle = theme.bgSunken;
      ctx.fill();
      ctx.strokeStyle = theme.inkDim;
      ctx.lineWidth = 1;
      ctx.stroke();
      // a single spoke tick so rotation reads at a glance
      ctx.beginPath();
      ctx.moveTo(cx, wheelY);
      ctx.lineTo(cx + Math.cos(wheelPhaseRad) * wheelR, wheelY + Math.sin(wheelPhaseRad) * wheelR);
      ctx.strokeStyle = theme.inkDim;
      ctx.stroke();
    }
  }
}

/** Sulfur pile cross-section. Uses the engine's real per-bin profile for the active wagon; a parametric crowned mound (no per-bin data survives finalize()) for completed wagons; nothing for pending ones. */
function drawPile(
  ctx: CanvasRenderingContext2D,
  x: number,
  topY: number,
  w: number,
  h: number,
  status: "PENDING" | "FILLING" | "COMPLETE",
  utilizationPct: number,
  profile: Float32Array | null,
  seedHash: number,
  theme: ReturnType<typeof getCanvasTheme>,
) {
  if (status === "PENDING" || w < 6) return;
  const underframeInset = w * 0.09;
  const railY = topY + 3; // rim line, just under the top chord
  const floorY = topY + h - 13;
  const innerLeft = x + underframeInset * 0.4;
  const innerRight = x + w - underframeInset * 0.4;
  const innerW = innerRight - innerLeft;
  const maxLift = floorY - (topY + 6); // pile can rise almost to the rim

  const heights: number[] = [];
  const n = 48;
  if (profile && status === "FILLING") {
    // Profile bin 0 is the wagon's front, which sits at its screen-right edge
    // (the train travels rightward past the fixed chute), so mirror the bin
    // order here: screen-left (i=0) samples the back of the wagon, screen-right
    // (i=n-1) samples the front — keeping the growing pile edge under the chute.
    for (let i = 0; i < n; i++) {
      const binIdx = Math.min(PROFILE_BINS - 1, Math.floor(((n - 1 - i) / n) * PROFILE_BINS));
      heights.push(Math.max(0, Math.min(1, profile[binIdx] / RIM_HEIGHT_M)));
    }
  } else {
    // parametric crowned mound — visual approximation only, no real bin data
    const avg = Math.max(0, Math.min(1.05, utilizationPct / 100));
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const crown = Math.sin(Math.PI * t) ** 0.6; // flatter shoulders, rounded crest
      heights.push(Math.max(0, Math.min(1.05, avg * (0.55 + 0.6 * crown))));
    }
  }

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, railY);
  ctx.lineTo(x + w, railY);
  ctx.lineTo(x + w - underframeInset, floorY);
  ctx.lineTo(x + underframeInset, floorY);
  ctx.closePath();
  ctx.clip();

  ctx.beginPath();
  ctx.moveTo(innerLeft, floorY);
  for (let i = 0; i < n; i++) {
    const px = innerLeft + (i / (n - 1)) * innerW;
    const py = floorY - heights[i] * maxLift;
    ctx.lineTo(px, py);
  }
  ctx.lineTo(innerRight, floorY);
  ctx.closePath();

  const grad = ctx.createLinearGradient(0, topY, 0, floorY);
  grad.addColorStop(0, theme.sulfurHighlight);
  grad.addColorStop(0.55, theme.sulfurBase);
  grad.addColorStop(1, theme.sulfurShadow);
  ctx.fillStyle = grad;
  ctx.fill();

  // granular stipple texture — deterministic per wagon (seedHash), not random-per-frame
  ctx.fillStyle = withAlpha(theme.sulfurShadow, 0.35);
  let s = seedHash || 1;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s % 1000) / 1000;
  };
  const dotCount = Math.round((innerW * maxLift) / 90);
  for (let i = 0; i < dotCount; i++) {
    const fx = rnd();
    const bandIdx = Math.min(n - 1, Math.floor(fx * n));
    const maxH = heights[bandIdx];
    const fy = rnd() * maxH;
    if (fy > maxH) continue;
    const px = innerLeft + fx * innerW;
    const py = floorY - fy * maxLift;
    ctx.fillRect(px, py, 1.2, 1.2);
  }
  ctx.restore();
}

/** Falling-material particle stream from the chute mouth into the active pile. Skipped entirely under prefers-reduced-motion. */
function drawParticleStream(
  ctx: CanvasRenderingContext2D,
  chuteX: number,
  mouthY: number,
  targetY: number,
  intensity: number,
  nowMs: number,
  theme: ReturnType<typeof getCanvasTheme>,
) {
  if (reducedMotion || intensity <= 0) return;
  const count = Math.round(14 + intensity * 30);
  const periodMs = 550;
  const dist = Math.max(4, targetY - mouthY);
  ctx.save();
  ctx.shadowColor = withAlpha(theme.sulfurHighlight, 0.8);
  ctx.shadowBlur = 2;
  for (let i = 0; i < count; i++) {
    const phase = (i / count + (nowMs % periodMs) / periodMs) % 1;
    const seed = (i * 9301 + 49297) % 233280;
    const jitter = ((seed / 233280) - 0.5) * 9;
    const px = chuteX + jitter * (0.4 + phase);
    const py = mouthY + phase * dist;
    const alpha = (0.35 + intensity * 0.55) * (1 - phase * 0.25);
    ctx.fillStyle = withAlpha(theme.sulfurHighlight, alpha);
    ctx.fillRect(px, py, 2, 4 + phase * 2);
  }
  ctx.restore();
}

function drawGantry(
  ctx: CanvasRenderingContext2D,
  chuteX: number,
  trackY: number,
  gateOpeningPct: number,
  theme: ReturnType<typeof getCanvasTheme>,
) {
  const columnHalfSpan = 34;
  const topY = trackY - 96;
  const beamY = topY + 6;
  const mouthY = trackY - 4;
  const sway = reducedMotion ? 0 : (gateOpeningPct - 0.5) * 3;

  ctx.save();
  ctx.strokeStyle = theme.borderStrong;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  // columns
  ctx.beginPath();
  ctx.moveTo(chuteX - columnHalfSpan, mouthY - 6);
  ctx.lineTo(chuteX - columnHalfSpan + sway * 0.3, topY);
  ctx.moveTo(chuteX + columnHalfSpan, mouthY - 6);
  ctx.lineTo(chuteX + columnHalfSpan + sway * 0.3, topY);
  ctx.stroke();
  // trunk beam
  ctx.beginPath();
  ctx.moveTo(chuteX - columnHalfSpan + sway * 0.3, beamY);
  ctx.lineTo(chuteX + columnHalfSpan + sway * 0.3, beamY);
  ctx.lineWidth = 5;
  ctx.stroke();

  // funnel (chute trunk narrowing to the mouth)
  const funnelTopHalf = 20;
  const mouthHalf = Math.max(2, 8 * (0.25 + 0.75 * gateOpeningPct));
  ctx.beginPath();
  ctx.moveTo(chuteX - funnelTopHalf + sway * 0.3, beamY + 4);
  ctx.lineTo(chuteX + funnelTopHalf + sway * 0.3, beamY + 4);
  ctx.lineTo(chuteX + mouthHalf + sway * 0.1, mouthY - 10);
  ctx.lineTo(chuteX - mouthHalf + sway * 0.1, mouthY - 10);
  ctx.closePath();
  ctx.fillStyle = theme.bgPanel;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = theme.borderStrong;
  ctx.stroke();

  // gate flaps at the mouth — opening scales with chuteGateOpeningPct
  ctx.strokeStyle = gateOpeningPct > 0.05 ? theme.seriesPrimary : theme.inkTertiary;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(chuteX - funnelTopHalf * 0.7 + sway * 0.1, mouthY - 10);
  ctx.lineTo(chuteX - mouthHalf + sway * 0.1, mouthY - 4);
  ctx.moveTo(chuteX + funnelTopHalf * 0.7 + sway * 0.1, mouthY - 10);
  ctx.lineTo(chuteX + mouthHalf + sway * 0.1, mouthY - 4);
  ctx.stroke();

  ctx.fillStyle = theme.seriesPrimary;
  ctx.font = canvasMono(10, true);
  ctx.textAlign = "center";
  ctx.fillText("CHUTE", chuteX, topY - 6);
  ctx.textAlign = "left";
  ctx.restore();
}

function drawRailAndBallast(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  railY: number,
  pxPerM: number,
  wagonProgressM: number,
  theme: ReturnType<typeof getCanvasTheme>,
) {
  ctx.save();
  ctx.fillStyle = withAlpha(theme.bgSunken, 0.6);
  ctx.fillRect(0, railY, w, h - railY);

  const sleeperSpacingM = 0.7;
  const spacingPx = sleeperSpacingM * pxPerM;
  const offset = ((wagonProgressM * pxPerM) % spacingPx + spacingPx) % spacingPx;
  ctx.strokeStyle = withAlpha(theme.inkTertiary, 0.35);
  ctx.lineWidth = 3;
  for (let sx = -offset; sx < w; sx += spacingPx) {
    ctx.beginPath();
    ctx.moveTo(sx, railY + 3);
    ctx.lineTo(sx, railY + 12);
    ctx.stroke();
  }

  ctx.strokeStyle = theme.borderStrong;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, railY);
  ctx.lineTo(w, railY);
  ctx.moveTo(0, railY + 4);
  ctx.lineTo(w, railY + 4);
  ctx.stroke();
  ctx.restore();
}

export function TrainCanvas({ zoomRadius }: { zoomRadius: number }) {
  const [hoverSeq, setHoverSeq] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [pinnedPos, setPinnedPos] = useState<{ x: number; y: number } | null>(null);
  const selectedWagonSeq = useSimStore((s) => s.selectedWagonSeq);
  const selectWagon = useSimStore((s) => s.selectWagon);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const canvasRef = useCanvasFrame((ctx, w, h, engine: TwinLiteEngine) => {
    const theme = getCanvasTheme();
    const nowMs = performance.now();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = theme.bgSunken;
    ctx.fillRect(0, 0, w, h);

    const { chuteX, trackY, trackH, pxPerM } = trackGeometry(w, h, zoomRadius);
    const railY = trackY + trackH + 14;

    // Negated: the train travels rightward, so ground texture scrolls leftward beneath it.
    drawRailAndBallast(ctx, w, h, railY, pxPerM, -engine.wagonProgressM, theme);

    // belt strip (gate -> chute in-flight inventory), drawn above the track
    const beltY = trackY - 46;
    const beltH = 20;
    const beltW = Math.max(80, chuteX - 74);
    const beltX0 = 16;
    const cells = engine.belt;
    const samples = 90;
    ctx.save();
    ctx.strokeStyle = theme.borderSubtle;
    ctx.strokeRect(beltX0, beltY, beltW, beltH);
    const maxCell = Math.max(0.02, ...Array.from(cells));
    for (let i = 0; i < samples; i++) {
      const cellIdx = Math.floor((i / samples) * cells.length);
      const v = cells[cellIdx] / maxCell;
      const bx = beltX0 + (i / samples) * beltW;
      const bw = beltW / samples + 0.5;
      ctx.fillStyle = withAlpha(theme.seriesPrimary, 0.15 + v * 0.75);
      ctx.fillRect(bx, beltY, bw, beltH);
    }
    ctx.fillStyle = theme.inkDim;
    ctx.font = canvasMono(10);
    ctx.fillText("gate", beltX0, beltY - 5);
    ctx.textAlign = "right";
    ctx.fillText(`${engine.beltRateActualTph.toFixed(0)} t/h`, beltX0 + beltW, beltY - 5);
    ctx.textAlign = "left";
    ctx.restore();

    drawGantry(ctx, chuteX, trackY, engine.chuteGateOpeningPct, theme);

    // wagons — train travels rightward past the fixed chute: a wagon's front
    // (right) edge sits at chuteX when it first arrives (progress 0) and
    // advances to the right as wagonProgressM grows, so the growing pile
    // edge (always at chuteX) sweeps from the wagon's front toward its back.
    const win = engine.consistWindow(engine.activeSeq, zoomRadius);
    for (const wagon of win) {
      const delta = wagon.seq - engine.activeSeq;
      const rightEdgeM = engine.wagonProgressM - delta * PITCH_M;
      const rightEdgeX = chuteX + rightEdgeM * pxPerM;
      const wagonWidthPx = WAGON_HOPPER_OPENING_M * pxPerM;
      const gapWidthPx = INTER_WAGON_GAP_M * pxPerM;
      const leadingEdgeX = rightEdgeX - wagonWidthPx; // left edge of the wagon box

      const isActive = wagon.seq === engine.activeSeq;
      const overRisk = wagon.status === "FILLING" && wagon.utilizationPct > 100.3;
      const emphasized = hoverSeq === wagon.seq || selectedWagonSeq === wagon.seq;
      const rimColor = wagonRimColor(theme, overRisk, emphasized);
      const wheelPhase = (rightEdgeM / WHEEL_CIRCUMFERENCE_M) * Math.PI * 2;

      const profile = wagon.seq === engine.activeSeq ? engine.activeWagon.profile : null;
      drawWagonBodyBg(ctx, leadingEdgeX, trackY, wagonWidthPx, trackH, theme);
      drawPile(ctx, leadingEdgeX, trackY, wagonWidthPx, trackH, wagon.status, wagon.utilizationPct, profile, wagon.seq * 7919, theme);
      drawWagonBodyFg(ctx, leadingEdgeX, trackY, wagonWidthPx, trackH, theme, rimColor, isActive || emphasized ? 2 : 1, wheelPhase);

      // falling material into the active wagon
      if (isActive && engine.lastDischargeT > 0) {
        const inGap =
          engine.wagonProgressM >= WAGON_HOPPER_OPENING_M &&
          engine.wagonProgressM < WAGON_HOPPER_OPENING_M + INTER_WAGON_GAP_M;
        if (!inGap) {
          const maxDischargeT = 0.02;
          const intensity = Math.max(0, Math.min(1, engine.lastDischargeT / maxDischargeT));
          drawParticleStream(ctx, chuteX, trackY - 14, trackY + trackH - 24, intensity, nowMs, theme);
        }
      }

      // label
      if (wagonWidthPx > 30) {
        ctx.fillStyle = theme.ink;
        ctx.font = canvasMono(12, isActive);
        ctx.textAlign = "center";
        ctx.fillText(`${wagon.seq}`, leadingEdgeX + wagonWidthPx / 2, trackY - 6);
        ctx.fillStyle = theme.inkDim;
        ctx.font = canvasMono(11);
        ctx.fillText(
          wagon.status === "PENDING" ? "—" : `${wagon.utilizationPct.toFixed(1)}%`,
          leadingEdgeX + wagonWidthPx / 2,
          trackY + trackH + 10,
        );
        ctx.textAlign = "left";
      }

      // coupler stub + inter-wagon gap marker
      const gapCenterX = leadingEdgeX + wagonWidthPx + gapWidthPx / 2;
      ctx.strokeStyle = theme.inkDim;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(leadingEdgeX + wagonWidthPx, trackY + trackH - 16);
      ctx.lineTo(leadingEdgeX + wagonWidthPx + gapWidthPx, trackY + trackH - 16);
      ctx.stroke();
      ctx.strokeStyle = withAlpha(theme.inkTertiary, 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gapCenterX, trackY - 4);
      ctx.lineTo(gapCenterX, trackY + trackH + 4);
      ctx.stroke();
    }
  }, 24);

  function hitTest(clientX: number, clientY: number): number | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const { chuteX, trackY, trackH, pxPerM } = trackGeometry(rect.width, rect.height, zoomRadius);
    if (y < trackY - 4 || y > trackY + trackH + 4) return null;
    const engine = getEngine();
    for (const wagon of engine.consistWindow(engine.activeSeq, zoomRadius)) {
      const delta = wagon.seq - engine.activeSeq;
      const rightEdgeX = chuteX + (engine.wagonProgressM - delta * PITCH_M) * pxPerM;
      const wagonWidthPx = WAGON_HOPPER_OPENING_M * pxPerM;
      const leadingEdgeX = rightEdgeX - wagonWidthPx;
      if (x >= leadingEdgeX && x <= leadingEdgeX + wagonWidthPx) return wagon.seq;
    }
    return null;
  }

  const hoverDetail = hoverSeq != null ? wagonDetail(getEngine(), hoverSeq) : null;
  // Pinned (clicked) wagon stays inspectable after the mouse moves off it —
  // this is what actually gives `selectedWagonSeq`/`selectWagon` a consumer
  // (M-3: previously dead store state with no reader).
  const pinnedDetail =
    !hoverDetail && selectedWagonSeq != null ? wagonDetail(getEngine(), selectedWagonSeq) : null;
  const card = hoverDetail ?? pinnedDetail;
  const cardPos = hoverDetail ? hoverPos : pinnedPos;

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="h-full w-full cursor-pointer"
        onMouseMove={(e) => {
          const seq = hitTest(e.clientX, e.clientY);
          setHoverSeq(seq);
          if (seq != null && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setHoverPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
          } else {
            setHoverPos(null);
          }
        }}
        onMouseLeave={() => {
          setHoverSeq(null);
          setHoverPos(null);
        }}
        onClick={(e) => {
          const seq = hitTest(e.clientX, e.clientY);
          if (seq != null && seq === selectedWagonSeq) {
            selectWagon(null);
            setPinnedPos(null);
            return;
          }
          selectWagon(seq);
          if (seq != null && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setPinnedPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
          } else {
            setPinnedPos(null);
          }
        }}
      />
      {card && cardPos && (
        <div
          className="tnum pointer-events-none absolute z-10 min-w-[9rem] -translate-x-1/2 rounded-md border border-border-strong bg-bg-raised px-2.5 py-2 text-[11px] text-ink-secondary shadow-lg"
          style={{ left: cardPos.x, top: Math.max(0, cardPos.y - 12), transform: "translate(-50%, -100%)" }}
        >
          <div className="font-semibold text-ink-primary">
            Wagon {card.seq}
            {card.uid ? ` · ${card.uid}` : ""}
            {pinnedDetail && !hoverDetail ? " · pinned" : ""}
          </div>
          {card.status === "PENDING" ? (
            <div className="text-ink-tertiary">pending — not yet spawned</div>
          ) : (
            <>
              <div>
                fill {card.fillT?.toFixed(1)} t
                {card.status === "FILLING" && card.projectedFinalT != null
                  ? ` → proj ${card.projectedFinalT.toFixed(1)} t`
                  : ""}
                {" "}({card.utilizationPct.toFixed(1)}%)
              </div>
              {card.freeboardM != null && <div>freeboard {card.freeboardM.toFixed(2)} m</div>}
              {card.spillFlag && <div className="text-alarm-critical">● spill flagged</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

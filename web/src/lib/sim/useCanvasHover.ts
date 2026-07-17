"use client";
import { useEffect, useRef } from "react";

export interface HoverState {
  active: boolean;
  x: number;
  y: number;
}

/**
 * Tracks mouse/touch position over a canvas in CSS-pixel coordinates — the
 * same coordinate space a useCanvasFrame draw callback's (w, h) already use
 * (useCanvasFrame applies the DPR transform once via ctx.setTransform, so
 * draw code never deals with device pixels directly).
 *
 * Mutates a ref only, never triggers a React re-render — read `.current`
 * inside your own draw callback to hit-test and render a tooltip/crosshair.
 * Tap-to-hover: a touchstart/touchmove counts as "active" until touchend.
 */
export function useCanvasHover(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const hover = useRef<HoverState>({ active: false, x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const move = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      hover.current = { active: true, x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const leave = () => {
      hover.current.active = false;
    };
    const touchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      const rect = canvas.getBoundingClientRect();
      hover.current = { active: true, x: t.clientX - rect.left, y: t.clientY - rect.top };
    };

    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseleave", leave);
    canvas.addEventListener("touchstart", touchMove, { passive: true });
    canvas.addEventListener("touchmove", touchMove, { passive: true });
    canvas.addEventListener("touchend", leave);
    return () => {
      canvas.removeEventListener("mousemove", move);
      canvas.removeEventListener("mouseleave", leave);
      canvas.removeEventListener("touchstart", touchMove);
      canvas.removeEventListener("touchmove", touchMove);
      canvas.removeEventListener("touchend", leave);
    };
  }, [canvasRef]);

  return hover;
}

/** Canvas-drawn tooltip box (no charting library) — clamps to stay inside [0,w]. Draws a small rounded card with a title line + value lines near (x, y). */
export function drawTooltip(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    y: number;
    w: number;
    lines: string[];
    bg: string;
    border: string;
    ink: string;
    inkDim: string;
    font: string;
    canvasW: number;
  },
) {
  const { x, y, w, lines, bg, border, ink, inkDim, font, canvasW } = opts;
  const lineH = 13;
  const padX = 8;
  const padY = 6;
  const h = lines.length * lineH + padY * 2;
  let boxX = x + 10;
  if (boxX + w > canvasW - 4) boxX = x - w - 10;
  const boxY = Math.max(4, y - h / 2);

  ctx.fillStyle = bg;
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  const r = 4;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, w, h, r);
  ctx.fill();
  ctx.stroke();

  ctx.font = font;
  lines.forEach((line, i) => {
    ctx.fillStyle = i === 0 ? ink : inkDim;
    ctx.fillText(line, boxX + padX, boxY + padY + lineH * i + 9);
  });
}

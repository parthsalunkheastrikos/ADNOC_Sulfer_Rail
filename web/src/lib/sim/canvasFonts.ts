// Canvas 2D `ctx.font` never resolves CSS custom properties (var(...) is
// silently ignored, falling back to the browser default font) — these are
// the literal stacks canvas draw calls must use to stay visually consistent
// with the DOM, which gets IBM Plex via next/font (see app/layout.tsx).
export const CANVAS_FONT_MONO = "'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Consolas, monospace";
export const CANVAS_FONT_UI = "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";

export function canvasMono(px: number, bold = false): string {
  return `${bold ? "600 " : ""}${px}px ${CANVAS_FONT_MONO}`;
}

export function canvasUi(px: number, bold = false): string {
  return `${bold ? "700 " : ""}${px}px ${CANVAS_FONT_UI}`;
}

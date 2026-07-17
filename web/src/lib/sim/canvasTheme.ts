// Theme-aware canvas palette (H-1 fix). Canvas 2D `ctx.fillStyle`/`strokeStyle`
// never resolve CSS custom properties, so every canvas component previously
// hardcoded dark-theme hex values directly — the Day theme toggle had no
// effect on any canvas. This resolves the same tokens globals.css defines
// for [data-theme="light"], read live from computed style, so canvases track
// the active theme like every other surface.
export interface CanvasTheme {
  ink: string;
  inkDim: string;
  inkTertiary: string;
  bgSunken: string;
  bgRaised: string;
  bgPanel: string;
  bgHover: string;
  borderSubtle: string;
  borderStrong: string;
  seriesPrimary: string;
  seriesSecondary: string;
  seriesPlan: string;
  seriesTertiary: string;
  alarmCritical: string;
  alarmHigh: string;
  alarmMedium: string;
  alarmLow: string;
  modeManual: string;
  modeAuto: string;
  sulfurBase: string;
  sulfurHighlight: string;
  sulfurShadow: string;
}

const FALLBACK_DARK: CanvasTheme = {
  ink: "#e8eaed",
  inkDim: "#9aa1ab",
  inkTertiary: "#6b7280",
  bgSunken: "#1a1c20",
  bgRaised: "#2b2f35",
  bgPanel: "#292d33",
  bgHover: "#33383f",
  borderSubtle: "#3a3f47",
  borderStrong: "#4b5159",
  seriesPrimary: "#6fb3e0",
  seriesSecondary: "#3d84b8",
  seriesPlan: "#a9d4f0",
  seriesTertiary: "#8f9bb3",
  alarmCritical: "#c0392b",
  alarmHigh: "#d9822b",
  alarmMedium: "#d3c22a",
  alarmLow: "#7b8391",
  modeManual: "#e8a13d",
  modeAuto: "#1b5faa",
  sulfurBase: "#d9a839",
  sulfurHighlight: "#f0cf74",
  sulfurShadow: "#9c761f",
};

const CSS_VAR_MAP: Record<keyof CanvasTheme, string> = {
  ink: "--ink-primary",
  inkDim: "--ink-secondary",
  inkTertiary: "--ink-tertiary",
  bgSunken: "--bg-sunken",
  bgRaised: "--bg-raised",
  bgPanel: "--bg-panel",
  bgHover: "--bg-hover",
  borderSubtle: "--border-subtle",
  borderStrong: "--border-strong",
  seriesPrimary: "--series-primary",
  seriesSecondary: "--series-secondary",
  seriesPlan: "--series-plan",
  seriesTertiary: "--series-tertiary",
  alarmCritical: "--alarm-critical",
  alarmHigh: "--alarm-high",
  alarmMedium: "--alarm-medium",
  alarmLow: "--alarm-low",
  modeManual: "--mode-manual",
  modeAuto: "--mode-auto",
  sulfurBase: "--sulfur-base",
  sulfurHighlight: "--sulfur-highlight",
  sulfurShadow: "--sulfur-shadow",
};

let cache: { theme: string; palette: CanvasTheme } | null = null;

/** Resolved canvas palette for the currently active theme, cached per theme. */
export function getCanvasTheme(): CanvasTheme {
  if (typeof document === "undefined") return FALLBACK_DARK;
  const theme = document.documentElement.getAttribute("data-theme") ?? "dark";
  if (cache && cache.theme === theme) return cache.palette;

  const style = getComputedStyle(document.documentElement);
  const palette = { ...FALLBACK_DARK };
  for (const key of Object.keys(CSS_VAR_MAP) as (keyof CanvasTheme)[]) {
    const v = style.getPropertyValue(CSS_VAR_MAP[key]).trim();
    if (v) palette[key] = v;
  }
  cache = { theme, palette };
  return palette;
}

/** #rrggbb -> rgba(r,g,b,alpha) for translucent fills/hatches/gridlines. */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

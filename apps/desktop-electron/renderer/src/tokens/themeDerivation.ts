import type { CustomThemeColors } from "./customThemes";

export type ThemeTokenMap = Record<string, string>;

const TOKEN_KEYS = [
  "bg-app",
  "bg-panel",
  "bg-panel-alt",
  "bg-input",
  "bg-toolbar",
  "border-highlight",
  "border-shadow",
  "border-outline",
  "border-light",
  "border-muted",
  "bevel-highlight",
  "bevel-shadow",
  "fg-primary",
  "fg-muted",
  "fg-disabled",
  "fg-inverse",
  "accent-primary",
  "accent-primary-hover",
  "accent-primary-pressed",
  "accent-secondary",
  "accent-secondary-hover",
  "accent-success",
  "accent-warning",
  "accent-danger",
  "accent-info",
  "overlay-header",
  "overlay-backdrop",
  "row-unmatched-bg",
] as const;

export const DERIVED_THEME_TOKEN_KEYS = TOKEN_KEYS;

function clamp(n: number, min = 0, max = 255): number {
  return Math.min(max, Math.max(min, n));
}

export function normalizeHex(hex: string): string {
  const h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  if (h.length === 6) return `#${h}`.toLowerCase();
  throw new Error(`Invalid hex color: ${hex}`);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = normalizeHex(hex).slice(1);
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => clamp(Math.round(v)).toString(16).padStart(2, "0")).join("")}`;
}

export function darken(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const f = 1 - amount;
  return rgbToHex(r * f, g * f, b * f);
}

export function lighten(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function pickContrastText(bgHex: string): string {
  return relativeLuminance(bgHex) > 0.45 ? "#000000" : "#ffffff";
}

export function deriveThemeTokens(colors: CustomThemeColors): ThemeTokenMap {
  const bgApp = normalizeHex(colors.bgApp);
  const bgPanel = normalizeHex(colors.bgPanel);
  const bgInput = normalizeHex(colors.bgInput);
  const fgPrimary = normalizeHex(colors.fgPrimary);
  const fgMuted = normalizeHex(colors.fgMuted);
  const accentPrimary = normalizeHex(colors.accentPrimary);

  const bgToolbar = darken(bgApp, 0.05);
  const bgPanelAlt = darken(bgPanel, 0.08);
  const borderShadow = darken(bgApp, 0.2);
  const borderHighlight = lighten(bgPanel, 0.15);
  const borderLight = lighten(bgPanel, 0.22);
  const borderMuted = darken(bgPanel, 0.12);

  return {
    "bg-app": bgApp,
    "bg-panel": bgPanel,
    "bg-panel-alt": bgPanelAlt,
    "bg-input": bgInput,
    "bg-toolbar": bgToolbar,
    "border-highlight": borderHighlight,
    "border-shadow": borderShadow,
    "border-outline": "#000000",
    "border-light": borderLight,
    "border-muted": borderMuted,
    "bevel-highlight": borderHighlight,
    "bevel-shadow": borderShadow,
    "fg-primary": fgPrimary,
    "fg-muted": fgMuted,
    "fg-disabled": fgMuted,
    "fg-inverse": pickContrastText(accentPrimary),
    "accent-primary": accentPrimary,
    "accent-primary-hover": lighten(accentPrimary, 0.12),
    "accent-primary-pressed": darken(accentPrimary, 0.12),
    "accent-secondary": bgPanelAlt,
    "accent-secondary-hover": lighten(bgPanelAlt, 0.08),
    "accent-success": normalizeHex(colors.accentSuccess),
    "accent-warning": normalizeHex(colors.accentWarning),
    "accent-danger": normalizeHex(colors.accentDanger),
    "accent-info": lighten(accentPrimary, 0.05),
    "overlay-header": "rgba(0, 0, 0, 0.25)",
    "overlay-backdrop": "rgba(0, 0, 0, 0.72)",
    "row-unmatched-bg": darken(normalizeHex(colors.accentDanger), 0.35),
  };
}

export function applyThemeTokensToDocument(tokens: ThemeTokenMap): void {
  const root = document.documentElement;
  for (const key of DERIVED_THEME_TOKEN_KEYS) {
    const value = tokens[key];
    if (value) root.style.setProperty(`--${key}`, value);
  }
}

export function clearThemeTokenOverrides(): void {
  const root = document.documentElement;
  for (const key of DERIVED_THEME_TOKEN_KEYS) {
    root.style.removeProperty(`--${key}`);
  }
}

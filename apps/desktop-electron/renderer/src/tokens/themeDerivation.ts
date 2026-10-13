import type { CustomThemeColors } from "./customThemes";
import { keyTokens, mixHex } from "./keyColourDerive";
import { KEY_TOKEN_KEYS } from "./keyTokenKeys";

type ThemeTokenMap = Record<string, string>;

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
  "border-control",
  "tab-underline-color",
  "bevel-highlight",
  "bevel-shadow",
  "fg-primary",
  "fg-muted",
  "fg-disabled",
  "fg-inverse",
  "fg-on-status",
  "accent-primary",
  "accent-primary-hover",
  "accent-primary-pressed",
  "accent-secondary",
  "accent-secondary-hover",
  "accent-success",
  "accent-warning",
  "accent-danger",
  "accent-info",
  "accent-fill",
  "danger-fill",
  "link",
  "focus-ring-color",
  "color-scheme",
  "overlay-header",
  "overlay-backdrop",
  "row-unmatched-bg",
  "waveform-low",
  "waveform-mid",
  "waveform-high",
  "waveform-mono",
  "waveform-played",
  "waveform-grid",
  "waveform-memory-cue",
] as const;

export const DERIVED_THEME_TOKEN_KEYS: readonly string[] = [...TOKEN_KEYS, ...KEY_TOKEN_KEYS];

/** How much accent the selected fill has: `--bg-selected` in tokens.css, mixed into `--bg-input`. */
export const SELECTED_ACCENT_MIX = 18;

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

/** WCAG's contrast ratio between two colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** The least contrast a waveform band keeps against the panel it is drawn on. */
export const WAVEFORM_MIN_CONTRAST = 3;

/**
 * `hex`, moved towards white or black until it stands at `min` against
 * `background`: towards whichever end the background is further from. A colour
 * already there is kept, so a custom theme's waveform keeps the hue it was
 * given wherever it can.
 */
export function withContrast(hex: string, background: string, min = WAVEFORM_MIN_CONTRAST): string {
  const colour = normalizeHex(hex);
  const towardsWhite = relativeLuminance(background) < 0.18;
  for (let step = 0; step <= 20; step += 1) {
    const candidate = towardsWhite ? lighten(colour, step / 20) : darken(colour, step / 20);
    if (contrastRatio(candidate, background) >= min) return candidate;
  }
  return towardsWhite ? "#ffffff" : "#000000";
}

/**
 * A control's edge: the nearest colour to `lighten(panel, .15)` that stands at 3:1 against both
 * the toolbar and the panel. Steps lighter and darker alternate, so the hue of the start is kept
 * as far as it can be; black or white (whichever clears both by more) is the last resort. One
 * search over both backgrounds, because fixing one by moving towards an end can break the other.
 */
export function controlBorder(panel: string, toolbar: string, min = 3): string {
  const start = lighten(panel, 0.15);
  const holds = (c: string) => contrastRatio(c, toolbar) >= min && contrastRatio(c, panel) >= min;
  for (let step = 0; step <= 20; step += 1) {
    const lighter = lighten(start, step / 20);
    if (holds(lighter)) return lighter;
    const darker = darken(start, step / 20);
    if (holds(darker)) return darker;
  }
  const worst = (c: string) => Math.min(contrastRatio(c, toolbar), contrastRatio(c, panel));
  return worst("#ffffff") >= worst("#000000") ? "#ffffff" : "#000000";
}

/** The least contrast a panel edge (--border-muted) keeps on the panel. */
const BORDER_MUTED_MIN_CONTRAST = 1.5;
/** The least contrast the panel-alt surface keeps against the panel. */
const PANEL_ALT_MIN_CONTRAST = 1.15;

/** Black or white, whichever reads better on `bg`. */
export function betterText(bg: string): string {
  return contrastRatio("#000000", bg) >= contrastRatio("#ffffff", bg) ? "#000000" : "#ffffff";
}

/**
 * `hex`, moved towards white or black until it stands at `min` against every one of
 * `backgrounds`. A colour already there is kept. Otherwise it steps towards the end on its own
 * side of the backgrounds (lighter if it is lighter than they are on average), so its hue and
 * character survive a small nudge; only if that end cannot reach `min` does it go the other way.
 * When neither end reaches `min` (a mid-grey page has no 4.5:1 colour) it returns the end with
 * the better worst case.
 */
export function holdContrast(hex: string, backgrounds: string[], min: number): string {
  const colour = normalizeHex(hex);
  const worst = (c: string) => Math.min(...backgrounds.map((b) => contrastRatio(c, b)));
  if (worst(colour) >= min) return colour;
  const mean = backgrounds.reduce((sum, b) => sum + relativeLuminance(b), 0) / backgrounds.length;
  const lighterSide = relativeLuminance(colour) > mean;
  const ends = lighterSide ? ["#ffffff", "#000000"] : ["#000000", "#ffffff"];
  const end = ends.find((e) => worst(e) >= min);
  if (!end) return worst("#ffffff") >= worst("#000000") ? "#ffffff" : "#000000";
  const towardsWhite = end === "#ffffff";
  for (let step = 1; step <= 40; step += 1) {
    const candidate = towardsWhite ? lighten(colour, step / 40) : darken(colour, step / 40);
    if (worst(candidate) >= min) return candidate;
  }
  return end;
}

/**
 * The panel-alt surface: the panel stepped away from the page until it stands PANEL_ALT_MIN_CONTRAST
 * from the panel, lighter in a dark theme and darker in a light one. If that way runs out (a panel
 * already at white or black), it steps the other way. That is the one exception to "alt is further
 * from the page than the panel": a white panel on a grey page ends with an alt between the two.
 */
function stepAwayFrom(bgApp: string, bgPanel: string, min: number): string {
  const lighter = relativeLuminance(bgPanel) >= relativeLuminance(bgApp);
  const towards = (amount: number, up: boolean) => (up ? lighten(bgPanel, amount) : darken(bgPanel, amount));
  for (const up of [lighter, !lighter]) {
    for (let step = 1; step <= 40; step += 1) {
      const candidate = towards(step / 40, up);
      if (contrastRatio(candidate, bgPanel) >= min) return candidate;
    }
  }
  return towards(1, lighter);
}

/** A colour of the same hue as `hex`, taken `amount` of the way to `towards`. */
function blend(hex: string, towards: string, amount: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(towards);
  return rgbToHex(a.r + (b.r - a.r) * amount, a.g + (b.g - a.g) * amount, a.b + (b.b - a.b) * amount);
}

function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * The waveform's colours for a custom theme (WAVE-05): Rekordbox's three-band
 * hues and the theme's accent, each held at 3:1 against the panel; the played
 * part dimmed by the panel itself; the grid a faint line of the text colour.
 */
function deriveWaveformTokens(colors: {
  bgPanel: string;
  fgPrimary: string;
  fgMuted: string;
  accentPrimary: string;
}): ThemeTokenMap {
  const panel = normalizeHex(colors.bgPanel);
  return {
    "waveform-low": withContrast("#3b82f6", panel),
    "waveform-mid": withContrast("#f59e0b", panel),
    "waveform-high": withContrast(normalizeHex(colors.fgPrimary), panel),
    "waveform-mono": withContrast(normalizeHex(colors.accentPrimary), panel),
    "waveform-played": rgba(panel, 0.6),
    "waveform-grid": rgba(normalizeHex(colors.fgPrimary), 0.16),
    "waveform-memory-cue": withContrast(normalizeHex(colors.fgMuted), panel),
  };
}

export function deriveThemeTokens(colors: CustomThemeColors): ThemeTokenMap {
  const bgApp = normalizeHex(colors.bgApp);
  const bgPanel = normalizeHex(colors.bgPanel);
  const bgInput = normalizeHex(colors.bgInput);
  const fgPrimary = normalizeHex(colors.fgPrimary);
  const fgMuted = normalizeHex(colors.fgMuted);
  const accentPrimary = normalizeHex(colors.accentPrimary);

  const bgToolbar = darken(bgApp, 0.05);
  const bgPanelAlt = stepAwayFrom(bgApp, bgPanel, PANEL_ALT_MIN_CONTRAST);
  const borderShadow = darken(bgApp, 0.2);
  const borderHighlight = lighten(bgPanel, 0.15);
  const borderLight = lighten(bgPanel, 0.22);
  // The hairline divider: the old step below the panel, moved until it holds 1.5:1 on the panel.
  const borderMuted = holdContrast(darken(bgPanel, 0.12), [bgPanel], BORDER_MUTED_MIN_CONTRAST);
  // A control's edge reads at 3:1 against the toolbar and the panel it sits on.
  const borderControl = controlBorder(bgPanel, bgToolbar);

  // Text on the accent: black or white, whichever reads better, so a mid-tone accent keeps its colour.
  const fgInverse = betterText(accentPrimary);
  // Info is the accent a step lighter, and never under 3:1 on the panel where that can be held
  // (it is still the focus outline until the sweep); where black text on it then falls short, the
  // status text below turns white instead.
  const accentInfo = holdContrast(lighten(accentPrimary, 0.05), [bgPanel], 3);
  const accentSuccess = normalizeHex(colors.accentSuccess);
  const accentWarning = normalizeHex(colors.accentWarning);
  const accentDanger = normalizeHex(colors.accentDanger);
  // Text on the four status colours: black while it reads at 4.5:1 on all of them, else whichever
  // of black and white has the better worst case.
  const statuses = [accentSuccess, accentWarning, accentInfo, accentDanger];
  const worstOn = (text: string) => Math.min(...statuses.map((c) => contrastRatio(text, c)));
  const fgOnStatus = worstOn("#000000") >= 4.5 || worstOn("#000000") >= worstOn("#ffffff") ? "#000000" : "#ffffff";
  const link = holdContrast(accentPrimary, [bgApp, bgPanel], 4.5);
  const focusRing = holdContrast(accentPrimary, [bgApp, bgPanel, bgPanelAlt, bgToolbar], 3);

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
    "border-control": borderControl,
    // The active tab's underline is the accent, moved only as far as 3:1 on the toolbar needs.
    "tab-underline-color": withContrast(accentPrimary, bgToolbar, 3),
    "bevel-highlight": borderHighlight,
    "bevel-shadow": borderShadow,
    "fg-primary": fgPrimary,
    "fg-muted": fgMuted,
    // Greyed text: the muted colour dimmed towards the panel, then held at 3:1 on it.
    "fg-disabled": holdContrast(blend(fgMuted, bgPanel, 0.4), [bgPanel], 3),
    "fg-inverse": fgInverse,
    "fg-on-status": fgOnStatus,
    "accent-primary": accentPrimary,
    "accent-primary-hover": lighten(accentPrimary, 0.12),
    "accent-primary-pressed": darken(accentPrimary, 0.12),
    "accent-secondary": bgPanelAlt,
    "accent-secondary-hover": lighten(bgPanelAlt, 0.08),
    "accent-success": accentSuccess,
    "accent-warning": accentWarning,
    "accent-danger": accentDanger,
    "accent-info": accentInfo,
    // Button fills: the accent and the danger colour, moved until the button's text reads at 4.5:1.
    "accent-fill": holdContrast(accentPrimary, [fgInverse], 4.5),
    "danger-fill": holdContrast(accentDanger, [fgPrimary], 4.5),
    "link": link,
    "focus-ring-color": focusRing,
    "color-scheme": betterText(bgApp) === "#000000" ? "light" : "dark",
    "overlay-header": "rgba(0, 0, 0, 0.25)",
    "overlay-backdrop": "rgba(0, 0, 0, 0.72)",
    "row-unmatched-bg": darken(normalizeHex(colors.accentDanger), 0.35),
    ...deriveWaveformTokens(colors),
    // Key chips (R4-2): the 24 key colours, held on this theme's own backgrounds.
    ...keyTokens({
      panel: bgPanel,
      input: bgInput,
      selected: mixHex(accentPrimary, bgInput, SELECTED_ACCENT_MIX),
    }),
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

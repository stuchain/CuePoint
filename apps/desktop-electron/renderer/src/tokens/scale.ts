import { shouldShowOnboarding } from "../components/firstRunMemory";

/**
 * The app's sizes (Phase 1 DS-2; 1.5 added by DEC-161, Small 1.25 by R2-5). Every CSS size that would
 * land on half a pixel at 1.5 is rounded in the stylesheet (`--hairline`), so the
 * pixel style stays crisp at each of them.
 */

export const SCALE_OPTIONS = [1, 1.25, 1.5, 2, 3] as const;
export type ScaleFactor = (typeof SCALE_OPTIONS)[number];

const STORAGE_KEY = "cuepoint-ui-lab-scale";

function isScaleFactor(value: number): value is ScaleFactor {
  return SCALE_OPTIONS.includes(value as ScaleFactor);
}

export const DEFAULT_SCALE: ScaleFactor = 1.5;

const SCALE_NAMES: Record<number, string> = {
  1: "Extra small",
  1.25: "Small",
  1.5: "Medium",
  2: "Large",
  3: "Extra large",
};

/** A size's plain name ("Large"), or "3×" for one with none. */
export function scaleName(scale: number): string {
  return SCALE_NAMES[scale] ?? `${scale}×`;
}

/**
 * An option's words in Settings (SET-4): "Small (1×)", and " — default" on the
 * one that is `DEFAULT_SCALE`. One function for every option, so the select
 * gains a size by `SCALE_OPTIONS` gaining it.
 */
export function scaleOptionLabel(scale: number): string {
  const name = SCALE_NAMES[scale] ?? `${scale}×`;
  const base = SCALE_NAMES[scale] ? `${name} (${scale}×)` : name;
  return scale === DEFAULT_SCALE ? `${base} - default` : base;
}

/**
 * The 1× height the Library needs for four rows (R2-5). A size is "too big for this
 * screen" when the screen's available height divided by the scale is under it. A
 * screen-only rule, not a live row count, so it does not flip as a window is resized.
 */
export const MIN_ROWS_HEIGHT = 560;

/** Under this available height a fresh install opens at Small, otherwise at Medium. */
const COMPACT_BELOW_HEIGHT = 860;

/**
 * How far a size's device pixels (`scale * dpr`) are from a whole number at a screen's ratio. The
 * pixel style is crisp when one of its pixels is a whole number of device pixels (M493, D35).
 */
function pixelBlur(scale: number, dpr: number): number {
  const device = scale * dpr;
  return Math.abs(device - Math.round(device));
}

/** Within this of a whole device pixel reads as crisp: 1.25 × 1.5 = 1.875 is, 1.5 × 1.5 = 2.25 is not. */
const CRISP_WITHIN = 0.15;

/**
 * The size suggested for a screen of this available height (R2-5): Small under 860,
 * else Medium, but never one that is too big for the screen; it steps down to 1.
 *
 * `availHeight` is in CSS pixels, so it already allows for the display's ratio (a 1080-pixel
 * screen at 150% reports 720). At a fractional ratio (Windows at 125% or 150%) a size whose pixels
 * are not whole device pixels blurs the pixel style (M493), so among the sizes that fit the one
 * nearest a whole device pixel is taken when it is within reach of the wanted one: Medium at 150%
 * becomes Small (1.875 device pixels) rather than 2.25. At a whole ratio nothing changes.
 */
export function suggestedScale(availHeight: number, dpr: number = devicePixelRatio()): ScaleFactor {
  const wanted = availHeight < COMPACT_BELOW_HEIGHT ? 1.25 : DEFAULT_SCALE;
  const fits = SCALE_OPTIONS.filter((s) => s <= wanted && availHeight / s >= MIN_ROWS_HEIGHT);
  if (fits.length === 0) return SCALE_OPTIONS[0];
  if (Number.isInteger(dpr)) return fits[fits.length - 1]!;
  const crisp = fits.filter((s) => pixelBlur(s, dpr) <= CRISP_WITHIN);
  const pool = crisp.length > 0 ? crisp : fits;
  return pool[pool.length - 1]!;
}

/** The display's pixel ratio (1 where there is no window, or it says something unusable). */
export function devicePixelRatio(): number {
  const ratio = typeof window === "undefined" ? 1 : window.devicePixelRatio;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

/** The screen's available height, or 0 when it is not known (a test DOM, no screen). */
export function screenAvailHeight(): number {
  const height = typeof screen === "undefined" ? 0 : screen.availHeight;
  return Number.isFinite(height) && height > 0 ? height : 0;
}

export interface ScaleChoice {
  value: ScaleFactor;
  /** The option's words, with what marks it appended. */
  label: string;
  /** Too big for this screen, and not the size in use. */
  disabled: boolean;
  suggested: boolean;
}

/**
 * Every size with its state for a screen: one list for Settings and View → Size. Nothing
 * is disabled or suggested when the height is unknown.
 */
export function scaleChoices(
  current: number,
  availHeight: number,
  dpr: number = devicePixelRatio(),
): ScaleChoice[] {
  const known = availHeight > 0;
  const suggested = known ? suggestedScale(availHeight, dpr) : null;
  return SCALE_OPTIONS.map((value) => {
    const disabled = known && value !== current && availHeight / value < MIN_ROWS_HEIGHT;
    // A greyed size is never the suggested one.
    const isSuggested = value === suggested && !disabled;
    const base = scaleOptionLabel(value);
    return {
      value,
      label: isSuggested ? `${base}, suggested for this screen` : base,
      disabled,
      suggested: isSuggested,
    };
  });
}

/**
 * The remembered scale. Storage that throws — disabled, or a private window —
 * reads as the default: the app must start without it.
 */
export function getStoredScale(): ScaleFactor {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return DEFAULT_SCALE;
  }
  const parsed = raw ? Number(raw) : DEFAULT_SCALE;
  return isScaleFactor(parsed) ? parsed : DEFAULT_SCALE;
}

/**
 * Whether a size was ever chosen (DEC-207): the update note offers **Change size**
 * only to someone who never did. A stored 1.5 counts, because it was picked.
 * Storage that throws reads as not chosen.
 */
export function hasStoredScale(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/** Apply a scale, and remember it where storage allows. */
export function setStoredScale(scale: ScaleFactor): void {
  applyScale(scale);
  try {
    localStorage.setItem(STORAGE_KEY, String(scale));
  } catch {
    // Not remembered across a restart; still applied for this session.
  }
}

function applyScale(scale: ScaleFactor): void {
  document.documentElement.dataset.scale = String(scale);
  document.documentElement.style.setProperty("--scale", String(scale));
  applyDevicePixelRatio();
}

/**
 * Publish the display's pixel ratio as `--dpr`, so a stylesheet can snap a hairline to a whole
 * device pixel instead of a whole CSS pixel, which is a blurred line at 125% and 150% (M493):
 * `max(calc(1px / var(--dpr, 1)), calc(round(down, calc(1px * var(--dpr, 1)), 1px) / var(--dpr, 1)))`,
 * as `--hairline` in tokens.css. It has no `--scale` factor: a hairline is one line at every text size.
 */
export function applyDevicePixelRatio(): number {
  const ratio = devicePixelRatio();
  document.documentElement.style.setProperty("--dpr", String(ratio));
  return ratio;
}

/**
 * Keep `--dpr` right as the ratio changes (a window dragged to another display, or the display's
 * scaling changed). Calls `onChange` with the new ratio; returns the function that stops.
 */
export function watchDevicePixelRatio(onChange?: (ratio: number) => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  let stopped = false;
  let query: MediaQueryList | null = null;
  const listen = (): void => {
    query?.removeEventListener("change", changed);
    query = window.matchMedia(`(resolution: ${devicePixelRatio()}dppx)`);
    query.addEventListener("change", changed);
  };
  function changed(): void {
    if (stopped) return;
    onChange?.(applyDevicePixelRatio());
    listen();
  }
  listen();
  return () => {
    stopped = true;
    query?.removeEventListener("change", changed);
  };
}

/**
 * Applied at start. A fresh install (nothing stored, first-run guide not finished) takes
 * the size suggested for its screen and stores it (R2-5); someone updating, whose guide is
 * done, keeps 1.5 and nothing is written (DEC-207). Storage that throws reads as 1.5.
 */
export function initScale(): ScaleFactor {
  const height = screenAvailHeight();
  if (height > 0 && !hasStoredScale() && shouldShowOnboarding()) {
    const first = suggestedScale(height);
    setStoredScale(first);
    return first;
  }
  const scale = getStoredScale();
  applyScale(scale);
  return scale;
}

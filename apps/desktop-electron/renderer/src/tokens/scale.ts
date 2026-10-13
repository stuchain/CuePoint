import { shouldShowOnboarding } from "../components/firstRunMemory";

/**
 * The app's sizes (Phase 1 DS-2; 1.5 added by DEC-161, Compact 1.25 by R2-5). Every CSS size that would
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
  1: "Small",
  1.25: "Compact",
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
  return scale === DEFAULT_SCALE ? `${base} — default` : base;
}

/**
 * The 1× height the Library needs for four rows (R2-5). A size is "too big for this
 * screen" when the screen's available height divided by the scale is under it. A
 * screen-only rule, not a live row count, so it does not flip as a window is resized.
 */
export const MIN_ROWS_HEIGHT = 560;

/** Under this available height a fresh install opens at Compact, otherwise at Medium. */
const COMPACT_BELOW_HEIGHT = 860;

/**
 * The size suggested for a screen of this available height (R2-5): Compact under 860,
 * else Medium, but never one that is too big for the screen; it steps down to 1.
 */
export function suggestedScale(availHeight: number): ScaleFactor {
  const wanted = availHeight < COMPACT_BELOW_HEIGHT ? 1.25 : DEFAULT_SCALE;
  const fits = SCALE_OPTIONS.filter((s) => s <= wanted && availHeight / s >= MIN_ROWS_HEIGHT);
  return fits.length > 0 ? fits[fits.length - 1]! : SCALE_OPTIONS[0];
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
export function scaleChoices(current: number, availHeight: number): ScaleChoice[] {
  const known = availHeight > 0;
  const suggested = known ? suggestedScale(availHeight) : null;
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

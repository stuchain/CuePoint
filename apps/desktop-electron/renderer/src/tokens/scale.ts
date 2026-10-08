/**
 * The app's sizes (Phase 1 DS-2; 1.5 added by DEC-161). Every CSS size that would
 * land on half a pixel at 1.5 is rounded in the stylesheet (`--hairline`), so the
 * pixel style stays crisp at each of them.
 */

export const SCALE_OPTIONS = [1, 1.5, 2, 3] as const;
export type ScaleFactor = (typeof SCALE_OPTIONS)[number];

const STORAGE_KEY = "cuepoint-ui-lab-scale";

function isScaleFactor(value: number): value is ScaleFactor {
  return SCALE_OPTIONS.includes(value as ScaleFactor);
}

export const DEFAULT_SCALE: ScaleFactor = 1.5;

const SCALE_NAMES: Record<number, string> = {
  1: "Small",
  1.5: "Medium",
  2: "Large",
  3: "Extra large",
};

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

export function initScale(): ScaleFactor {
  const scale = getStoredScale();
  applyScale(scale);
  return scale;
}

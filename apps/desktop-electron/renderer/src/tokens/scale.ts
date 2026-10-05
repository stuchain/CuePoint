/** Integer pixel scale factors for crisp bitmap rendering (Phase 1 DS-2). */

export const SCALE_OPTIONS = [1, 2, 3] as const;
export type ScaleFactor = (typeof SCALE_OPTIONS)[number];

const STORAGE_KEY = "cuepoint-ui-lab-scale";

export function isScaleFactor(value: number): value is ScaleFactor {
  return SCALE_OPTIONS.includes(value as ScaleFactor);
}

export const DEFAULT_SCALE: ScaleFactor = 2;

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
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_SCALE;
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

export function applyScale(scale: ScaleFactor): void {
  document.documentElement.dataset.scale = String(scale);
  document.documentElement.style.setProperty("--scale", String(scale));
}

export function initScale(): ScaleFactor {
  const scale = getStoredScale();
  applyScale(scale);
  return scale;
}

/** Integer pixel scale factors for crisp bitmap rendering (Phase 1 DS-2). */

export const SCALE_OPTIONS = [1, 2, 3] as const;
export type ScaleFactor = (typeof SCALE_OPTIONS)[number];

const STORAGE_KEY = "cuepoint-ui-lab-scale";

export function isScaleFactor(value: number): value is ScaleFactor {
  return SCALE_OPTIONS.includes(value as ScaleFactor);
}

export function getStoredScale(): ScaleFactor {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : 2;
  return isScaleFactor(parsed) ? parsed : 2;
}

export function setStoredScale(scale: ScaleFactor): void {
  localStorage.setItem(STORAGE_KEY, String(scale));
  applyScale(scale);
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

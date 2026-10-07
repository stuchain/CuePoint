/**
 * The source panel's width, remembered (PREP-10, DEC-112): stored as chosen,
 * clamped when read, as the Inspector's is (DEC-018).
 */
export const SOURCE_WIDTH_STORAGE_KEY = "cuepoint-prepare-source-width";
/** Narrower than this and a source row cannot show a title and its reasons. */
export const SOURCE_MIN_WIDTH = 240;
export const SOURCE_DEFAULT_WIDTH = 360;
/** The Set stays the wider pane (DEC-112). */
const SOURCE_MAX_FRACTION = 0.45;
/** How far an arrow key moves the divider. */
export const SOURCE_NUDGE = 16;

export function clampSourceWidth(width: number, paneWidth: number): number {
  const max = Math.max(SOURCE_MIN_WIDTH, Math.floor(paneWidth * SOURCE_MAX_FRACTION));
  if (!Number.isFinite(width)) return Math.min(SOURCE_DEFAULT_WIDTH, max);
  return Math.min(max, Math.max(SOURCE_MIN_WIDTH, Math.round(width)));
}

export function loadSourceWidth(): number {
  try {
    const raw = localStorage.getItem(SOURCE_WIDTH_STORAGE_KEY);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) && value > 0 ? value : SOURCE_DEFAULT_WIDTH;
  } catch {
    return SOURCE_DEFAULT_WIDTH;
  }
}

export function saveSourceWidth(width: number): void {
  try {
    localStorage.setItem(SOURCE_WIDTH_STORAGE_KEY, String(Math.round(width)));
  } catch {
    // A forgotten width is not worth breaking the drag over.
  }
}

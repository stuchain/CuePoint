/**
 * The source panel's width, remembered (PREP-10, DEC-112): stored as chosen,
 * clamped when read, as the Inspector's is (DEC-018).
 */
export const SOURCE_WIDTH_STORAGE_KEY = "cuepoint-prepare-source-width";
/** Narrower than this and a source row cannot show a title and its reasons. In 1x units (C209), drawn times the scale. */
export const SOURCE_MIN_WIDTH = 160;
/** In 1x units too, so a fresh and a migrated person draw the same width at any size. */
export const SOURCE_DEFAULT_WIDTH = 240;
/** The Set stays the wider pane (DEC-112). */
const SOURCE_MAX_FRACTION = 0.45;
/** How far an arrow key moves the divider. */
export const SOURCE_NUDGE = 16;

/** The least and the most the source panel may be, in drawn pixels: the clamp's own bounds, which the divider reports (M359). */
export function sourceWidthBounds(paneWidth: number, scale: number = 1): { min: number; max: number } {
  const min = Math.round(SOURCE_MIN_WIDTH * scale);
  return { min, max: Math.max(min, Math.floor(paneWidth * SOURCE_MAX_FRACTION)) };
}

/** `width` and `paneWidth` are drawn pixels; the floor and the default are 1x units times `scale`. */
export function clampSourceWidth(width: number, paneWidth: number, scale: number = 1): number {
  const { min, max } = sourceWidthBounds(paneWidth, scale);
  if (!Number.isFinite(width)) return Math.min(Math.round(SOURCE_DEFAULT_WIDTH * scale), max);
  return Math.min(max, Math.max(min, Math.round(width)));
}

/**
 * The remembered width in 1x units (C209), so a size change keeps the share of the page.
 * A width saved as pixels by an older version is read as the current scale's pixels;
 * it is converted in memory and never written back on load.
 */
export function loadSourceWidth(scale: number = 1): number {
  try {
    const raw = localStorage.getItem(SOURCE_WIDTH_STORAGE_KEY);
    if (raw === null) return SOURCE_DEFAULT_WIDTH;
    if (raw.trim().startsWith("{")) {
      const parsed = JSON.parse(raw) as { unit?: unknown; width?: unknown };
      const width = Number(parsed.width);
      return parsed.unit === "1x" && Number.isFinite(width) && width > 0 ? width : SOURCE_DEFAULT_WIDTH;
    }
    const pixels = Number(raw);
    return Number.isFinite(pixels) && pixels > 0 ? pixels / scale : SOURCE_DEFAULT_WIDTH;
  } catch {
    return SOURCE_DEFAULT_WIDTH;
  }
}

/** Writes a width in 1x units, only when the person changes it. */
export function saveSourceWidth(width1x: number): void {
  try {
    localStorage.setItem(
      SOURCE_WIDTH_STORAGE_KEY,
      JSON.stringify({ unit: "1x", width: Math.round(width1x) }),
    );
  } catch {
    // A forgotten width is not worth breaking the drag over.
  }
}

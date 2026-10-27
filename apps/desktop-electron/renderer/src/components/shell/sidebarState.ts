/**
 * DEC-022: the sidebar has two states, expanded or an icon-only rail, and
 * remembers which.
 *
 * Two fixed widths rather than a drag handle is the decision, not a shortcut:
 * predictable widths let the rail be drawn at exact pixel sizes, which
 * arbitrary resizing would undermine for pixel art, and it avoids a second
 * draggable edge competing with the Inspector's.
 *
 * Reads follow the shape the rest of the shell uses: never trust storage, and
 * fall back to a default rather than throw.
 */
export const SIDEBAR_COLLAPSED_STORAGE_KEY = "cuepoint-ui-shell-sidebar-collapsed";

export function loadSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    // Storage can throw outright where site data is disabled.
    return false;
  }
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // A forgotten sidebar state is not worth breaking the toggle over.
  }
}

/**
 * Whether the rail draws its tight form (item 2): no gaps between rows, and the closed rail's icons
 * without the padding above and below them. It tightens once the rail would scroll, and loosens
 * only when the window is as tall as the rail needed then, so it never flickers at the edge.
 *
 * @param measure.overflow How far the rail's rows run past its height now.
 * @param measure.height The rail's height now.
 * @param measure.needed The height the loose rail needed when it tightened.
 * @param measure.scale The text size now. The tight rail is for 2x and up (M70): below that the
 *   loose rail keeps its full-size targets and its list scrolls instead. Unknown reads as eligible.
 */
export function railTight(
  tight: boolean,
  measure: { overflow: number; height: number; needed: number; scale?: number },
): boolean {
  if (measure.scale !== undefined && Number.isFinite(measure.scale) && measure.scale < TIGHT_FROM_SCALE) return false;
  return tight ? measure.height < measure.needed : measure.overflow > 1;
}

/**
 * The text size from which the rail may go tight (M70). At 1.5x in 1264x735 the rail used to
 * tighten with 251 px to spare, which made the targets smaller at a larger size.
 */
export const TIGHT_FROM_SCALE = 2;

/**
 * The height the loose rail needed, for the rail as it is drawn now (zoom spot 3A). The open and
 * closed rails, and each text size, need different heights: a height measured for one says
 * nothing about another, so it reads as unknown (0). The rail then loosens, measures itself and
 * tightens again within one layout pass, before anything is painted.
 *
 * @param record What the loose rail needed when it last tightened, and in which mode.
 * @param mode The mode the rail is drawn in now.
 */
export function neededHeightFor(record: { mode: string; height: number } | null, mode: string): number {
  return record && record.mode === mode ? record.height : 0;
}

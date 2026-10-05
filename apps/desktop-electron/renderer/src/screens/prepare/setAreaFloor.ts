/**
 * The Set keeps two whole rows under the lanes and the strip (WAVE-07).
 *
 * DEC-112 gave the Set's area a floor: a window too short for the header and
 * the table scrolls the page rather than leaving the table no rows. The lanes
 * (PREP-11) and the transition strip (DEC-120) sit inside that area, above the
 * rows, so at the default window with the player's bar on screen they could
 * take every row the floor kept. With either open, the area's floor is what
 * they take, plus the table's header, its own edges (a horizontal scrollbar
 * covers a row) and two of its rows; a window shorter than that scrolls the
 * page, and the Set is never left without a row.
 *
 * Nothing changes with both closed, and with either open the floor sits below
 * the height the page has at the default window, so the rows held as the page
 * opens are the same (`e2e/prepare.spec.ts`).
 */
import { useLayoutEffect, useState, type RefObject } from "react";

/** Whole rows the Set keeps under whatever is open above it. */
export const ROWS_KEPT = 2;

/**
 * The area's floor in CSS pixels: what sits above the rows, the table's
 * header and edges (`chrome`), and `ROWS_KEPT` rows. Null with nothing above
 * the rows, where DEC-112's floor stands alone.
 */
export function setAreaFloor(above: readonly number[], chrome: number, rowHeight: number): number | null {
  if (above.length === 0) return null;
  const taken = above.reduce((sum, height) => sum + Math.max(0, height), 0);
  return Math.ceil(taken + Math.max(0, chrome) + ROWS_KEPT * Math.max(0, rowHeight));
}

/**
 * What the rows' area spends that is not rows: the space around the table,
 * its borders, a horizontal scrollbar and its header. The same at any height.
 */
function tableChrome(set: HTMLElement): number {
  const area = set.querySelector<HTMLElement>(".prepare-set__rows");
  const table = set.querySelector<HTMLElement>('[role="table"]');
  const header = set.querySelector<HTMLElement>(".track-table__header");
  const edges = area && table ? area.getBoundingClientRect().height - table.clientHeight : 0;
  return edges + (header?.getBoundingClientRect().height ?? 0);
}

/**
 * `setAreaFloor` for the Set element, measured as it lays out: its children
 * other than the rows, and the table's header and edges. `revision` changes whenever
 * something above the rows opens or closes, or the scale changes.
 */
export function useSetAreaFloor(set: RefObject<HTMLElement | null>, rowHeight: number, revision: string): number | null {
  const [floor, setFloor] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = set.current;
    if (!element) {
      setFloor(null);
      return undefined;
    }
    const above = () =>
      [...element.children].filter((child) => !child.classList.contains("prepare-set__rows")) as HTMLElement[];
    const measure = () => {
      setFloor(
        setAreaFloor(
          above().map((child) => child.getBoundingClientRect().height),
          tableChrome(element),
          rowHeight,
        ),
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    for (const child of above()) observer.observe(child);
    return () => observer.disconnect();
  }, [revision, rowHeight, set]);

  return floor;
}

/**
 * Which form the entry buttons take on the focused row (C15d, DEC-249): measured, not guessed.
 *
 * The five buttons sit at the right end of the row, over its last columns. They may cover those,
 * and the tail of the selected row's title (it ellipsises short of them), never the row's number
 * or the first ~5 characters of the title. So the room is what the Set's scroll area has beside
 * the number column and that small title minimum, not the Title column's current width:
 *
 * - **words** ("↑ ↓ Chapter here Repeat after Remove") when the words fit in the room;
 * - **glyphs** ("↑ ↓ Chapter ↻ ×", the full names kept as the names and the hints) when only those fit;
 * - **actions**: one "Actions ▾" button that opens the entry's context menu, when not even that does.
 *
 * The time columns (Mix in, Mix out, Starts at) are left clear when they are the last columns shown
 * (option 3A): the buttons end just left of them, so a click on a time opens it. What they leave clear
 * is the part of those columns in view, so it follows a column resized or moved and a sideways
 * scroll, and it comes out of the room before the form is chosen.
 *
 * Both groups are measured as hidden copies drawn in the end cell, so the form never depends on the
 * one on show. All the widths are what the browser lays out, so the scale is already in them.
 */
import { useLayoutEffect, useState, type RefObject } from "react";

export type EntryButtonsForm = "words" | "glyphs" | "actions";

/** The least the selected row's title keeps, in px at scale 1 (about 5 characters): the buttons never take it. Small enough for the glyphs to fit at Windows' default window (1264 px inside). */
export const ENTRY_TITLE_KEEP_PX = 32;

/** The columns the buttons leave clear when they come last: the times a click edits. */
export const TIME_COLUMNS: readonly string[] = ["in", "out", "starts_at"];

/** What may sit in the run of times that ends the row: the times and the Fit dot after them. */
const TRAILING_COLUMNS: readonly string[] = [...TIME_COLUMNS, "fit"];

/** The scroll area's room for the buttons: what is left beside the number and the title's small minimum, less the times kept clear. */
export function roomBesideTitle(scrollWidth: number, numberWidth: number, titleMin: number, timesClear = 0): number {
  return scrollWidth - (numberWidth + titleMin + timesClear);
}

/**
 * How much of the scroll area's right end the buttons leave clear: from the left edge of the run of
 * time columns that ends the row to the area's right edge, when any of that run is in view; 0 when
 * the last column shown is not a time, or the times are scrolled out of view to the right.
 */
export function timesClearWidth(cells: ReadonlyArray<{ id: string; left: number; width: number }>, viewRight: number): number {
  let first: { id: string; left: number; width: number } | null = null;
  // Fit may close the run (M199 opens the table on "… Mix in, Fit"): the run still starts at its
  // first time, and Fit's dot is left clear with it. Fit alone is not a time to keep clear.
  for (let at = cells.length - 1; at >= 0 && TRAILING_COLUMNS.includes(cells[at]!.id); at -= 1) {
    if (TIME_COLUMNS.includes(cells[at]!.id)) first = cells[at]!;
  }
  // A cell with no width is no layout (a test DOM, a pane not drawn yet): nothing to keep clear.
  if (!first || first.width <= 0) return 0;
  return Math.max(0, Math.ceil(viewRight - first.left));
}

/** Words if they fit, else glyphs if they fit, else the one Actions button. A width not measured (<= 0) takes the words. */
export function entryButtonsForm(room: number, wordsWidth: number, glyphsWidth: number): EntryButtonsForm {
  if (room <= 0 && wordsWidth <= 0) return "words";
  if (wordsWidth <= room) return "words";
  if (glyphsWidth <= room) return "glyphs";
  return "actions";
}

/** The row's cells in the order they are drawn, with where each starts. */
function cellsOf(row: Element): Array<{ id: string; left: number; width: number }> {
  return [...row.querySelectorAll<HTMLElement>(":scope > [data-column]")].map((cell) => {
    const box = cell.getBoundingClientRect();
    return { id: cell.dataset.column ?? "", left: box.left, width: box.right - box.left };
  });
}

/** The scroll area's right edge in view, inside its vertical scrollbar. */
function viewRightOf(scroll: HTMLElement): number {
  return scroll.getBoundingClientRect().left + scroll.clientLeft + scroll.clientWidth;
}

/**
 * Leave the time columns that end the row clear (option 3A): the row's `--entry-buttons-clear`,
 * which Prepare's sheet makes the end cell's right margin. Returns the width of the scroll area
 * kept clear (from the first time to the view's edge), which comes out of the buttons' room.
 */
export function keepTimesClear(measure: HTMLElement): number {
  const row = measure.closest<HTMLElement>(".track-table__row");
  const scroll = measure.closest<HTMLElement>(".track-table__scroll");
  if (!row || !scroll || scroll.clientWidth <= 0) return 0;
  // The end cell's place is the row's right end (the Columns corner's track included), less its
  // margin; its stickiness holds its border, not its margin, to the view's edge, and only pulls it
  // in when the times are out of view anyway. So the margin is from the row's end to the first time.
  const rowStyle = getComputedStyle(row);
  const rowRight =
    row.getBoundingClientRect().right -
    (Number.parseFloat(rowStyle.borderRightWidth) || 0) -
    (Number.parseFloat(rowStyle.paddingRight) || 0);
  const cells = cellsOf(row);
  const inView = timesClearWidth(cells, viewRightOf(scroll));
  const margin = inView > 0 && rowRight > 0 ? timesClearWidth(cells, rowRight) : 0;
  row.style.setProperty("--entry-buttons-clear", `${margin}px`);
  // What the buttons lose of the scroll area's width: from the first time to the view's edge.
  return Math.min(inView, scroll.clientWidth);
}

function widthOf(row: Element | null, column: string): number {
  const cell = row?.querySelector<HTMLElement>(`:scope > [data-column="${column}"]`);
  return cell ? cell.offsetWidth : 0;
}

/**
 * The form for the end cell `measure` (a hidden copy of the words) is in, or null when the table
 * has no layout to read (a test DOM, a pane not drawn yet).
 */
export function measureForm(measure: HTMLElement, titleMin: number, timesClear = 0): EntryButtonsForm | null {
  const end = measure.closest<HTMLElement>(".track-table__end");
  const row = measure.closest<HTMLElement>(".track-table__row");
  const scroll = measure.closest<HTMLElement>(".track-table__scroll");
  const glyphs = end?.querySelector<HTMLElement>('[data-measure="glyphs"]');
  if (!end || !row || !scroll || !glyphs || scroll.clientWidth <= 0) return null;
  const style = getComputedStyle(end);
  const padding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
  const room = roomBesideTitle(scroll.clientWidth, widthOf(row, "position"), titleMin, timesClear);
  return entryButtonsForm(room, measure.offsetWidth + padding, glyphs.offsetWidth + padding);
}

/**
 * How far the end cell reaches over the title cell, as the row's `--title-cover`: the title's
 * padding takes it, so its text (and its ellipsis) ends before the buttons, never under them.
 */
export function keepTitleClear(measure: HTMLElement): void {
  const row = measure.closest<HTMLElement>(".track-table__row");
  const end = measure.closest<HTMLElement>(".track-table__end");
  const title = row?.querySelector<HTMLElement>(':scope > [data-column="title"]');
  if (!row || !end || !title) return;
  const cover = Math.max(0, Math.ceil(title.getBoundingClientRect().right - end.getBoundingClientRect().left));
  row.style.setProperty("--title-cover", `${cover}px`);
}

/**
 * The form to draw, re-measured after every render (a column dragged, a different scale), when
 * the scroll area is resized (the pane dragged, the window) or scrolled sideways, and when one of
 * the row's cells changes width (a column resized).
 */
export function useEntryButtonsForm(measure: RefObject<HTMLElement | null>, titleMin: number): EntryButtonsForm {
  const [form, setForm] = useState<EntryButtonsForm>("words");
  useLayoutEffect(() => {
    const element = measure.current;
    if (!element) return undefined;
    const row = element.closest<HTMLElement>(".track-table__row");
    const scroll = element.closest(".track-table__scroll");
    const update = () => {
      const clear = keepTimesClear(element);
      setForm(measureForm(element, titleMin, clear) ?? "words");
      keepTitleClear(element);
    };
    update();
    if (!scroll) return undefined;
    scroll.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(scroll);
    row?.querySelectorAll(":scope > [data-column]").forEach((cell) => observer?.observe(cell));
    return () => {
      scroll.removeEventListener("scroll", update);
      observer?.disconnect();
      row?.style.removeProperty("--title-cover");
      row?.style.removeProperty("--entry-buttons-clear");
    };
  });
  return form;
}

/**
 * Which form the entry buttons take on the focused row (C15d, DEC-249): measured, not guessed.
 *
 * The five buttons sit at the right end of the row, over its last columns. They may cover those,
 * and the tail of the selected row's title (it ellipsises short of them), never the row's number
 * or the first ~6 characters of the title. So the room is what the Set's scroll area has beside
 * the number column and that small title minimum, not the Title column's current width:
 *
 * - **words** ("↑ ↓ Chapter here Repeat after Remove") when the words fit in the room;
 * - **glyphs** ("↑ ↓ Chapter ↻ ×", the full names kept as the names and the hints) when only those fit;
 * - **actions**: one "Actions ▾" button that opens the entry's context menu, when not even that does.
 *
 * Both groups are measured as hidden copies drawn in the end cell, so the form never depends on the
 * one on show. All the widths are what the browser lays out, so the scale is already in them.
 */
import { useLayoutEffect, useState, type RefObject } from "react";

export type EntryButtonsForm = "words" | "glyphs" | "actions";

/** The least the selected row's title keeps, in px at scale 1 (about 6 characters): the buttons never take it. */
export const ENTRY_TITLE_KEEP_PX = 40;

/** The scroll area's room for the buttons: what is left beside the number and the title's small minimum. */
export function roomBesideTitle(scrollWidth: number, numberWidth: number, titleMin: number): number {
  return scrollWidth - (numberWidth + titleMin);
}

/** Words if they fit, else glyphs if they fit, else the one Actions button. A width not measured (<= 0) takes the words. */
export function entryButtonsForm(room: number, wordsWidth: number, glyphsWidth: number): EntryButtonsForm {
  if (room <= 0 && wordsWidth <= 0) return "words";
  if (wordsWidth <= room) return "words";
  if (glyphsWidth <= room) return "glyphs";
  return "actions";
}

function widthOf(row: Element | null, column: string): number {
  const cell = row?.querySelector<HTMLElement>(`:scope > [data-column="${column}"]`);
  return cell ? cell.offsetWidth : 0;
}

/**
 * The form for the end cell `measure` (a hidden copy of the words) is in, or null when the table
 * has no layout to read (a test DOM, a pane not drawn yet).
 */
export function measureForm(measure: HTMLElement, titleMin: number): EntryButtonsForm | null {
  const end = measure.closest<HTMLElement>(".track-table__end");
  const row = measure.closest<HTMLElement>(".track-table__row");
  const scroll = measure.closest<HTMLElement>(".track-table__scroll");
  const glyphs = end?.querySelector<HTMLElement>('[data-measure="glyphs"]');
  if (!end || !row || !scroll || !glyphs || scroll.clientWidth <= 0) return null;
  const style = getComputedStyle(end);
  const padding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
  const room = roomBesideTitle(scroll.clientWidth, widthOf(row, "position"), titleMin);
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
 * The form to draw, re-measured after every render (a column dragged, a different scale) and when
 * the scroll area is resized (the pane dragged, the window).
 */
export function useEntryButtonsForm(measure: RefObject<HTMLElement | null>, titleMin: number): EntryButtonsForm {
  const [form, setForm] = useState<EntryButtonsForm>("words");
  useLayoutEffect(() => {
    const element = measure.current;
    if (!element) return undefined;
    const row = element.closest<HTMLElement>(".track-table__row");
    const scroll = element.closest(".track-table__scroll");
    const update = () => {
      setForm(measureForm(element, titleMin) ?? "words");
      keepTitleClear(element);
    };
    update();
    if (!scroll) return undefined;
    scroll.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(scroll);
    return () => {
      scroll.removeEventListener("scroll", update);
      observer?.disconnect();
      row?.style.removeProperty("--title-cover");
    };
  });
  return form;
}

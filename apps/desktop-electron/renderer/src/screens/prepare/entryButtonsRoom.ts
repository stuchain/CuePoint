/**
 * Which form the entry buttons take on the focused row (C15d, DEC-249): measured, not guessed.
 *
 * The five buttons sit at the right end of the row, over its last columns. They may cover those,
 * never the row's number or the least of its title. So the room is what the Set's scroll area has
 * beside the number column and the title column (or the title's minimum, if it is narrower):
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

/** The scroll area's room for the buttons: what is left beside the number and the title (at least its minimum). */
export function roomBesideTitle(scrollWidth: number, numberWidth: number, titleWidth: number, titleMin: number): number {
  return scrollWidth - (numberWidth + Math.max(titleWidth, titleMin));
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
  const room = roomBesideTitle(scroll.clientWidth, widthOf(row, "position"), widthOf(row, "title"), titleMin);
  return entryButtonsForm(room, measure.offsetWidth + padding, glyphs.offsetWidth + padding);
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
    const update = () => setForm(measureForm(element, titleMin) ?? "words");
    update();
    const scroll = element.closest(".track-table__scroll");
    if (!scroll || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(scroll);
    return () => observer.disconnect();
  });
  return form;
}

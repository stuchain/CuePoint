/** The Library toolbar row's line rule (DEC-217, 2026-10-09). */

/**
 * True when the row's controls, the count at its reserved width, do not fit on
 * one line of `room` pixels with `gap` between each.
 */
export function needsTwoLines(widths: readonly number[], gap: number, room: number): boolean {
  const need = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, widths.length - 1);
  return need > room;
}

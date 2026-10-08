/**
 * How many filter chips lie out of sight (FLW-4).
 *
 * The chips share the filter row and scroll sideways. A chip is out of sight
 * when any of it lies beyond the right edge of the list's visible part; the
 * button "+N more" says how many, and scrolls them into view.
 */

/**
 * @param scrollLeft How far the list is scrolled.
 * @param width The list's visible width.
 * @param edges Each chip's right edge, measured from the list's left.
 * @returns The chips at least partly past the visible right edge.
 */
export function hiddenChipCount(scrollLeft: number, width: number, edges: readonly number[]): number {
  // A list squeezed to nothing shows no chip: every chip that has a width is
  // out of sight (a list with no layout has no widths, so it hides nothing).
  const visibleEnd = scrollLeft + width;
  // One pixel of slack: layout rounds, and a chip that fits exactly is in sight.
  return edges.filter((edge) => edge > visibleEnd + 1).length;
}

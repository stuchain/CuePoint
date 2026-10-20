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

/**
 * Whether a row of controls has wrapped onto a second line (item 12).
 *
 * The controls on one line are centred on it, so each one's top is above every other one's bottom;
 * a control on a later line starts at or below the bottom of one on the first. What has no height
 * (nothing drawn, or no layout at all) says nothing.
 */
export function rowWraps(items: readonly { top: number; height: number }[]): boolean {
  const drawn = items.filter((item) => item.height > 0);
  if (drawn.length < 2) return false;
  const lowestTop = Math.max(...drawn.map((item) => item.top));
  const highestBottom = Math.min(...drawn.map((item) => item.top + item.height));
  return lowestTop >= highestBottom;
}

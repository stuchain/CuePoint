import type { ReactNode } from "react";

export interface PlayerRegionProps {
  /**
   * The transport UI. Phase 5 supplies it; nothing does today.
   *
   * Passing children is what makes the region take space, so a filled region
   * can be exercised — and its zero-height promise falsified if it ever breaks
   * — without building any player UI now.
   */
  children?: ReactNode;
}

/**
 * The player's place in the shell (DEC-025).
 *
 * Phase 2 defines where the player will live and nothing else. The region
 * occupies **no space at all** until Phase 5 fills it: not a thin bar, not a
 * disabled transport, not a bordered empty container. DEC-025 chose this over
 * rendering a greyed-out transport now, so the app never ships controls that
 * do nothing.
 *
 * The point of the boundary is that Phase 5 changes this file and nothing else
 * — the grid row, its placement between the content area and the status strip,
 * and its full-width span across sidebar and inspector are all already decided
 * in `AppShellLayout`.
 *
 * The transport pixel icons (`play`, `pause`, `next`, `previous`) already exist
 * from FOUNDATION-14 and are deliberately **not** used here. They are waiting
 * for Phase 5 too.
 */
export function PlayerRegion({ children }: PlayerRegionProps) {
  // Not an empty <div>: an element with a class could pick up a border, a
  // padding or a min-height later and quietly give the region a size, which is
  // exactly what DEC-025 rules out.
  if (!children) return null;

  return <div className="cp-player">{children}</div>;
}

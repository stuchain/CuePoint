/**
 * The smallest the window can be made (Area 51).
 *
 * Below this the three-column layout (sidebar, page, Inspector) and the player bar stop fitting,
 * so the window refuses to shrink further rather than let controls overlap or fall off the edge.
 */
export const WINDOW_MIN_SIZE = { minWidth: 1024, minHeight: 640 } as const;

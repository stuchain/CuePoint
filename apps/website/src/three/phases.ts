/**
 * Where the opening scene's story sits on the scroll (SITE-06). Plain numbers, with no Three.js, so the
 * page can place its three steps from them and the e2e check can read them. The scene (scenes/opening.ts)
 * and the page both follow this one table.
 */
export const PHASES = {
  /** The records lift out of the crate. */
  lift: [0.08, 0.34],
  /** Each record takes its tag. */
  tag: [0.26, 0.5],
  /** The records fly into the wheel, which lights as they land; the crate sinks away. */
  fly: [0.5, 0.82],
  /** The wheel stands up to face the visitor. */
  flat: [0.84, 1],
} as const;

/** The scroll each step of the text covers. A step is centered on the middle of its span. */
export const STEP_SPANS = {
  messy: [0, PHASES.tag[0]],
  matched: [PHASES.tag[0], PHASES.fly[1]],
  ready: [PHASES.fly[1], 1],
} as const;

export type StepId = keyof typeof STEP_SPANS;

/** The middle of a step's span, 0 to 1: where its text sits in the story's scroll. */
export const stepMid = (id: StepId): number => (STEP_SPANS[id][0] + STEP_SPANS[id][1]) / 2;

/** From here the stuck scene cross-fades into the app window's picture (DEC-189: the wheel becomes the window). */
export const HANDOFF_FROM = 0.9;

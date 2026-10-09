/**
 * Where the opening scene's story sits on the scroll (SITE-06). Plain numbers, with no Three.js, so the
 * page can place its steps from them and the e2e check can read them. The scene (scenes/opening.ts) and
 * the page both follow this one table.
 *
 * The opening is one full-screen scene pinned for the whole story. Its first screen is the hero: the
 * headline over the crate and the empty wheel, moving on its own. Then, as the visitor scrolls:
 */
export const PHASES = {
  /** The hero: the camera holds wide on the crate and the empty wheel. */
  hero: [0, 0.14],
  /** The camera dives into the crate and the records lift out past it. */
  lift: [0.14, 0.36],
  /** Each record takes its tag. */
  tag: [0.3, 0.52],
  /** The records fly into the wheel, which lights key by key as they land; the crate sinks away. */
  fly: [0.54, 0.84],
  /** The camera squares up to the lit wheel, and a light runs round it key by key. */
  finale: [0.86, 1],
} as const;

/** The scroll each step of the text covers. A step is centered on the middle of its span. */
export const STEP_SPANS = {
  messy: [0.16, 0.34],
  matched: [0.34, 0.58],
  ready: [0.58, 1],
} as const;

export type StepId = keyof typeof STEP_SPANS;

/** The middle of a step's span, 0 to 1: where its text sits in the story's scroll. */
export const stepMid = (id: StepId): number => (STEP_SPANS[id][0] + STEP_SPANS[id][1]) / 2;

/** From here the pinned scene hands over to the app window's picture (DEC-189: the wheel becomes the window). */
export const HANDOFF_FROM = 0.9;

/**
 * The frames the scene is drawn at for its stills, beside the resting one (progress 0): where 3D does not
 * run, the page shows the frame of the step being read, so the story is told in pictures too.
 */
export const STILL_FRAMES = {
  matched: 0.45,
  ready: 1,
} as const;

export type StillFrame = keyof typeof STILL_FRAMES;

/** Which still frame goes with which step of the text ("rest" is the scene's resting frame). */
export const STEP_FRAME: Readonly<Record<StepId, StillFrame | "rest">> = {
  messy: "rest",
  matched: "matched",
  ready: "ready",
};

/** The frame to show at a progress, where 3D does not run: the frame of the step whose span holds it. */
export function frameAt(progress: number): StillFrame | "rest" {
  if (progress >= STEP_SPANS.ready[0]) return STEP_FRAME.ready;
  if (progress >= STEP_SPANS.matched[0]) return STEP_FRAME.matched;
  return STEP_FRAME.messy;
}

/**
 * A fit score as blocks (R4-8): 0 to 100 becomes 0 to 5, for `FitBar`.
 *
 * Kept beside the bar, so nothing in the charts folder reaches into a screen.
 * A score that is not a number counts as nothing.
 */
export function fitSteps(score: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (!Number.isFinite(score)) return 0;
  return Math.round(Math.min(100, Math.max(0, score)) / 20) as 0 | 1 | 2 | 3 | 4 | 5;
}

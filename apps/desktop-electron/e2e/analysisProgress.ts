/**
 * Wait for the waveform analysis to reach its end, failing when it stops moving.
 *
 * The specs that check the analysis runs to the end give it a few hundred
 * copies of the fixtures, so the strip has a run long enough to count and to
 * pause. How long that takes is the runner's speed times the copies: a packaged
 * Intel Mac analysed about 1.6 tracks a second, and a fixed deadline sized for
 * the fastest runner failed there while the analysis was still going (268 of
 * 300 at three minutes). What these specs check is that it gets to the end, so
 * the limit is on a stall instead: no new track for `stalledMs` fails, however
 * long the whole run takes. The test's own timeout is then only the backstop.
 */
import { expect } from "@playwright/test";

export interface AnalysisProgress {
  state: string;
  analysed: number;
  remaining: number;
  failed?: number;
}

/** How long the analysis may go without finishing another track. */
export const ANALYSIS_STALL_MS = 60_000;

export async function untilAnalysed(
  read: () => Promise<AnalysisProgress>,
  done: (now: AnalysisProgress) => boolean,
  stalledMs = ANALYSIS_STALL_MS,
): Promise<AnalysisProgress> {
  let last = -1;
  let movedAt = Date.now();
  for (;;) {
    const now = await read();
    if (done(now)) return now;
    const progress = now.analysed + (now.failed ?? 0);
    if (progress !== last) {
      last = progress;
      movedAt = Date.now();
    }
    expect(
      Date.now() - movedAt,
      `the analysis stopped: ${now.state}, ${now.analysed} analysed, ${now.failed ?? 0} failed, ${now.remaining} left`,
    ).toBeLessThan(stalledMs);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

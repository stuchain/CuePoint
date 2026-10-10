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
import { execFileSync } from "node:child_process";
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
    const quiet = Date.now() - movedAt;
    expect(
      quiet,
      `the analysis stopped: ${now.state}, ${now.analysed} analysed, ${now.failed ?? 0} failed, ${now.remaining} left` +
        (quiet >= stalledMs ? `\n${decoders()}` : ""),
    ).toBeLessThan(stalledMs);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/**
 * The waveform decoders running now, and on macOS where each one is stuck.
 *
 * A stall with the run still "running" is one decode that has not ended: the
 * analysis decodes one file at a time on a small runner, and a decoder is only
 * killed at its five-minute deadline. What it is doing is the evidence, and it
 * is gone once the app closes, so it is read here, before the test fails.
 */
function decoders(): string {
  if (process.platform === "win32") return "decoders: not listed on Windows";
  try {
    const listed = execFileSync("ps", ["-axo", "pid=,etime=,stat=,command="], { encoding: "utf-8" })
      .split("\n")
      .filter((line) => line.includes("--ao=pcm"));
    if (listed.length === 0) return "decoders: none running";
    const parts = [`decoders running:\n${listed.map((line) => line.slice(0, 160)).join("\n")}`];
    if (process.platform === "darwin") {
      for (const line of listed) {
        const pid = line.trim().split(/\s+/)[0]!;
        try {
          const stacks = execFileSync("sample", [pid, "1"], { encoding: "utf-8", timeout: 15_000 });
          parts.push(`sample ${pid}:\n${stacks.slice(0, 6000)}`);
        } catch (error) {
          parts.push(`sample ${pid} failed: ${String(error).slice(0, 200)}`);
        }
      }
    }
    return parts.join("\n");
  } catch (error) {
    return `decoders: could not be listed: ${String(error).slice(0, 200)}`;
  }
}

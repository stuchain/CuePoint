/**
 * Saying that a playlist's match ended, when nobody is looking at its row (C22).
 *
 * On the Playlists tab the row itself says "9 to check · 15 confirmed". From another
 * page or tab there is nothing to see, so the end of a run started from a row is
 * a toast, "hJ matched · 15 confirmed · 9 to check", with **Review 9** on it. The
 * toast is an ordinary one: it leaves by itself, and only a failure stays until
 * it is closed (C33). The watcher is not a React effect on purpose: a page that
 * is hidden has its effects stopped, and this must outlive that.
 */
import type { MatchRun } from "../../../api/cuepointBridge.types";
import { reportUnexpected } from "../../../reporting/reporting";
import { followJob } from "../../library/followJob";
import type { ToastAction, ToastVariant } from "../../../components/Toast";

/** "hJ matched · 15 confirmed · 9 to check": what the run found, in the words the row uses. */
export function matchDoneLine(label: string, run: Pick<MatchRun, "found" | "waiting">): string {
  const parts = [`${label} matched`];
  if (run.found > 0) parts.push(`${run.found.toLocaleString()} confirmed`);
  if (run.waiting > 0) parts.push(`${run.waiting.toLocaleString()} to check`);
  if (run.found === 0 && run.waiting === 0) parts.push("nothing found");
  return parts.join(" · ");
}

interface WatchOptions {
  jobId: string;
  label: string;
  /** Whether the person is looking at something other than the Playlists tab. */
  away: () => boolean;
  push: (message: string, variant?: ToastVariant, action?: ToastAction) => void;
  /** Review N, from the toast's button. */
  onReview: (run: MatchRun) => void;
}

/** Follow a run to its end and say that it succeeded, in a toast, only if `away` then. */
export function announceRunEnd({ jobId, label, away, push, onReview }: WatchOptions): void {
  void followJob(jobId).finished.then(async (outcome) => {
    // A stop or a failure is said once, by the job follower that started the run (`useCleanJob`).
    if (outcome.state !== "succeeded" || !away()) return;
    let run: MatchRun | undefined;
    try {
      const answer = await window.cuepoint?.getMatchJobs?.({ limit: 20 });
      run = answer?.jobs.find((entry) => entry.job_id === jobId);
    } catch (cause) {
      reportUnexpected(cause);
    }
    if (!run) {
      push(`${label} matched.`, "success");
      return;
    }
    const found = run;
    push(
      matchDoneLine(label, found),
      "success",
      found.waiting > 0
        ? { label: `Review ${found.waiting.toLocaleString()}`, onClick: () => onReview(found) }
        : undefined,
    );
  });
}

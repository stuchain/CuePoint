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

/** What a run that found nothing at all found instead: searches that failed, and searches that ran. */
export interface NothingFound {
  /** Tracks whose search could not finish: nothing is known about them. */
  failed: number;
  /** Tracks whose search ran and found nothing on Beatport. */
  notFound: number;
}

/**
 * A run that found nothing at all, or null when it found or is holding anything. A search that
 * failed is not "not found": the words (and the chip the review opens on) differ.
 */
export function nothingFound(
  run: Pick<MatchRun, "found" | "waiting" | "not_found" | "search_failed">,
): NothingFound | null {
  if (run.found !== 0 || run.waiting !== 0) return null;
  const failed = run.search_failed ?? 0;
  return failed + run.not_found > 0 ? { failed, notFound: run.not_found } : null;
}

/** "hJ: 24 searches failed", "hJ: no Beatport match for 24 tracks", or both said together. */
export function nothingFoundLine(label: string, found: NothingFound): string {
  const searches = `${found.failed.toLocaleString()} ${found.failed === 1 ? "search" : "searches"} failed`;
  const tracks = `no Beatport match for ${found.notFound.toLocaleString()} ${found.notFound === 1 ? "track" : "tracks"}`;
  if (found.failed > 0 && found.notFound > 0) return `${label}: ${searches}, ${tracks}`;
  return `${label}: ${found.failed > 0 ? searches : tracks}`;
}

/** How many tracks the red note offers to show: the failed searches when there are any, else those not found. */
export function nothingFoundCount(found: NothingFound): number {
  return found.failed > 0 ? found.failed : found.notFound;
}

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
  /** Whether the person is somewhere other than Clean's Match: the end is then said in a toast. */
  away: () => boolean;
  push: (message: string, variant?: ToastVariant, action?: ToastAction) => void;
  /** Review N, from the toast's button. */
  onReview: (run: MatchRun) => void;
  /** The person is on Clean and the run found something: land on its review. */
  onLand?: (run: MatchRun) => void;
  /** The run found nothing at all (however it is said): the page shows its red note. */
  onNothing?: (run: MatchRun, found: NothingFound) => void;
  /** Whether that red note is on screen as the run ends: the toast would then say it twice. */
  noteVisible?: () => boolean;
}

/**
 * Follow a run to its end. A stop or a failure is said once, by the job follower that started
 * the run (`useCleanJob`); a run that succeeded is said in a toast when `away`, and lands on its
 * review when not. One that found nothing is the page's red note either way.
 */
export function announceRunEnd({
  jobId,
  label,
  away,
  push,
  onReview,
  onLand,
  onNothing,
  noteVisible,
}: WatchOptions): void {
  void followJob(jobId).finished.then(async (outcome) => {
    if (outcome.state !== "succeeded") return;
    const isAway = away();
    let run: MatchRun | undefined;
    try {
      const answer = await window.cuepoint?.getMatchJobs?.({ limit: 20 });
      run = answer?.jobs.find((entry) => entry.job_id === jobId);
    } catch (cause) {
      reportUnexpected(cause);
    }
    if (!run) {
      if (isAway) push(`${label} matched`, "success");
      return;
    }
    const found = run;
    const nothing = nothingFound(found);
    if (nothing !== null) onNothing?.(found, nothing);
    if (!isAway) {
      if (nothing === null) onLand?.(found);
      return;
    }
    if (nothing !== null) {
      if (noteVisible?.()) return;
      const count = nothingFoundCount(nothing);
      push(nothingFoundLine(label, nothing), "warning", {
        label: `See the ${count.toLocaleString()}`,
        onClick: () => onReview(found),
      });
      return;
    }
    // Every track of a finished run is reviewed, not only the ones to check: Review is always offered.
    // Tracks waiting for a decision keep the toast until it is closed (a warning stays), so a run that
    // finished while you were away is still there when you come back (M507).
    push(matchDoneLine(label, found), found.waiting > 0 ? "warning" : "success", {
      label: "Review",
      onClick: () => onReview(found),
    });
  });
}

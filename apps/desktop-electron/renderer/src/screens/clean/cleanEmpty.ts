/**
 * What each part of the Clean page says when it has nothing to show (CLEAN-12).
 *
 * ORG-13's rule, reapplied: "nothing here" is the same words for different
 * situations, and each sends the reader somewhere different. A queue with
 * nothing to review because nothing was matched is an invitation to match; one
 * with nothing to review because every match was settled is good news. Files
 * never checked are not files found present, and duplicates never looked for
 * are not a library without any.
 *
 * Every branch is decided from what the engine answered — Health's counts and
 * when each detection last ran — and `cleanEmpty.test.ts` renders each from
 * responses the real engine gave (`cleanEmpty.fixture.json`).
 */
import type { LibraryHealth } from "../../api/cuepointBridge.types";
import { formatDay, formatDayTime, formatTimeOfDay, type DateOptions } from "../../format/dates";

/** The one thing an empty state offers to do about itself, when there is one. */
type CleanEmptyOffer = "check_files" | "find_duplicates";

interface CleanEmptyView {
  headline: string;
  hint: string | null;
  offer: CleanEmptyOffer | null;
}

function view(
  headline: string,
  hint: string | null = null,
  offer: CleanEmptyOffer | null = null,
): CleanEmptyView {
  return { headline, hint, offer };
}

/** When a detection last ran: a time, null for never, undefined when not reported. */
export function lastRun(health: LibraryHealth, id: string): string | null | undefined {
  const detection = health.detections.find((run) => run.id === id);
  return detection ? detection.last_run_at : undefined;
}

/** Missing files with no rows. */
export function missingEmptyState(
  health: LibraryHealth | null,
  error: string | null,
): CleanEmptyView {
  if (error) return view(error);
  if (health && lastRun(health, "files") === null) {
    return view(
      "Files have not been checked yet",
      "Check files to find tracks whose files are missing or cannot be read.",
      "check_files",
    );
  }
  const lastChecked = health ? lastRun(health, "files") : null;
  const when = lastChecked ? formatDayTime(lastChecked) || lastChecked : "";
  return view(
    "No missing files",
    when ? `Every file was there when CuePoint last checked, ${when}.` : null,
  );
}

/** Duplicates with no groups. */
export function duplicatesEmptyState(
  health: LibraryHealth | null,
  error: string | null,
  showingDismissed: boolean,
): CleanEmptyView {
  if (error) return view(error);
  if (health && lastRun(health, "duplicates") === null) {
    return view(
      "Duplicates have not been looked for yet",
      "Find duplicates to group tracks that share a file, a Beatport track, or " +
        "an artist, title and length.",
      "find_duplicates",
    );
  }
  return view(
    "No possible duplicates",
    showingDismissed
      ? "Nothing was found, and nothing is marked as not duplicates."
      : "Nothing was found the last time CuePoint looked.",
  );
}

/**
 * Missing files' bar when the last check found nothing: "Checked today, 4:42 PM", "Checked
 * yesterday, 9:05 AM", "Checked Oct 15, 4:42 PM", in the app's date wording. Empty when the time
 * cannot be read, so the bar never says a made-up moment.
 */
export function checkedLine(when: string, options: DateOptions = {}): string {
  const day = formatDay(when, options);
  const time = formatTimeOfDay(when, options);
  if (!day || !time) return "";
  const word = day === "Today" || day === "Yesterday" ? day.toLowerCase() : day;
  return `Checked ${word}, ${time}`;
}

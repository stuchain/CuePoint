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
import { DISPUTED_HINT, formatWhen, trackCount } from "./cleanFormat";
import type { ReviewScope } from "./cleanRules";

/** The one thing an empty state offers to do about itself, when there is one. */
type CleanEmptyOffer = "match_all" | "check_files" | "find_duplicates";

/** A second thing an empty state can offer, beside the first. */
type CleanEmptySecondary = "choose_playlist";

interface CleanEmptyView {
  headline: string;
  hint: string | null;
  offer: CleanEmptyOffer | null;
  secondary: CleanEmptySecondary | null;
}

function view(
  headline: string,
  hint: string | null = null,
  offer: CleanEmptyOffer | null = null,
  secondary: CleanEmptySecondary | null = null,
): CleanEmptyView {
  return { headline, hint, offer, secondary };
}

function countOf(health: LibraryHealth, id: string): number | null {
  return health.counts.find((count) => count.id === id)?.count ?? null;
}

/** When a detection last ran: a time, null for never, undefined when not reported. */
function lastRun(health: LibraryHealth, id: string): string | null | undefined {
  const detection = health.detections.find((run) => run.id === id);
  return detection ? detection.last_run_at : undefined;
}

interface ReviewEmptyInput {
  scope: ReviewScope;
  /** True when the queue is narrowed to a playlist or a Collection. */
  scoped: boolean;
  health: LibraryHealth | null;
  error: string | null;
}

/**
 * The review queue with no rows.
 *
 * "Nothing matched yet" is claimed only for the whole library: Health counts
 * the library, and a playlist can be unmatched inside a library that is not.
 */
export function reviewEmptyState(input: ReviewEmptyInput): CleanEmptyView {
  if (input.error) return view(input.error);

  const health = input.health;
  const nothingMatched =
    !input.scoped &&
    health !== null &&
    health.track_count > 0 &&
    countOf(health, "not_matched") === health.track_count;

  if (nothingMatched && input.scope !== "not_matched") {
    // CLN-2: the first thing Clean shows a new user starts the work, and says
    // what the work is and that it goes online.
    return view(
      "Match your library on Beatport",
      `CuePoint searches Beatport for each of your ${trackCount(health?.track_count ?? 0)} to find the ` +
        "right release, key and label. It runs in the background and can take a while " +
        "for a big library; you can keep using the app.",
      "match_all",
      "choose_playlist",
    );
  }

  const where = input.scoped ? " here" : "";
  switch (input.scope) {
    case "needs_review":
      return view(
        `Nothing is waiting for you${where}.`,
        "Every match was accepted automatically, decided by you, or found nothing.",
      );
    case "disputed":
      return view(`Nothing has changed since you decided${where}.`, DISPUTED_HINT);
    case "accepted":
      return view(`Nothing is accepted${where}.`);
    case "rejected":
      return view(`Nothing is rejected${where}.`);
    case "no_match":
      return view(
        `Beatport had something for every track${where}.`,
        "Tracks Beatport found nothing for are listed here.",
      );
    case "not_matched":
      return view(`Every track${where} has been looked up.`);
  }
}

/** Missing files with no rows. */
export function missingEmptyState(
  health: LibraryHealth | null,
  error: string | null,
): CleanEmptyView {
  if (error) return view(error);
  if (health && lastRun(health, "files") === null) {
    return view(
      "Files have not been checked yet.",
      "Check files to find tracks whose files are missing or cannot be read.",
      "check_files",
    );
  }
  const when = health ? formatWhen(lastRun(health, "files")) : "";
  return view(
    "No missing files.",
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
      "Duplicates have not been looked for yet.",
      "Find duplicates to group tracks that share a file, a Beatport track, or " +
        "an artist, title and length.",
      "find_duplicates",
    );
  }
  return view(
    "No possible duplicates.",
    showingDismissed
      ? "Nothing was found, and nothing is marked as not duplicates."
      : "Nothing was found the last time CuePoint looked.",
  );
}

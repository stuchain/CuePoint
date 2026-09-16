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
import { formatWhen } from "./cleanFormat";
import type { ReviewScope } from "./cleanRules";

/** The one thing an empty state offers to do about itself, when there is one. */
export type CleanEmptyOffer = "show_not_matched" | "check_files" | "find_duplicates";

export interface CleanEmptyView {
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

function countOf(health: LibraryHealth, id: string): number | null {
  return health.counts.find((count) => count.id === id)?.count ?? null;
}

/** When a detection last ran: a time, null for never, undefined when not reported. */
function lastRun(health: LibraryHealth, id: string): string | null | undefined {
  const detection = health.detections.find((run) => run.id === id);
  return detection ? detection.last_run_at : undefined;
}

export interface ReviewEmptyInput {
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
    return view(
      "Nothing is matched yet.",
      "Match the library, a playlist or a Collection on Beatport. Tracks the " +
        "matcher is not sure about wait here for you.",
      "show_not_matched",
    );
  }

  const where = input.scoped ? " here" : "";
  switch (input.scope) {
    case "needs_review":
      return view(
        `Nothing needs review${where}.`,
        "Every match was accepted automatically, decided by you, or found nothing.",
      );
    case "disputed":
      return view(
        `Nothing is disputed${where}.`,
        "A match is disputed when a newer match disagrees with a decision you made.",
      );
    case "accepted":
      return view(`Nothing is accepted${where}.`);
    case "rejected":
      return view(`Nothing is rejected${where}.`);
    case "no_match":
      return view(
        `Every match${where} found something.`,
        "Tracks Beatport found nothing for are listed here.",
      );
    case "not_matched":
      return view(`Every track${where} has been matched.`);
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

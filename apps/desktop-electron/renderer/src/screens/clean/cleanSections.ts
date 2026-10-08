/**
 * The Clean page's four parts, and which one it opens on (CLEAN-12, DEC-072).
 *
 * Tabs rather than sections, the choice DEC-072 left to the specification:
 * each part is a table or a list a person works through, and four of them
 * stacked would put three screens of scrolling between a reviewer and the
 * queue. The part last used is remembered with the existing `localStorage`
 * pattern, so the page reopens where the work was.
 */

import type { LibraryHealth } from "../../api/cuepointBridge.types";

export type CleanSection = "review" | "fix" | "missing" | "duplicates" | "health";

/**
 * The one list of the page's tabs (CLN-3, FLW-12): the screen, the intros and
 * the counts all read it.
 */
export const CLEAN_SECTIONS: ReadonlyArray<{ id: CleanSection; label: string }> = [
  { id: "review", label: "Review matches" },
  { id: "fix", label: "Fix values" },
  { id: "missing", label: "Missing files" },
  { id: "duplicates", label: "Duplicates" },
  { id: "health", label: "Health" },
];

export const CLEAN_SECTION_STORAGE_KEY = "cuepoint-clean-section";

const DEFAULT_CLEAN_SECTION: CleanSection = "review";

function isSection(value: string | null): value is CleanSection {
  return CLEAN_SECTIONS.some((section) => section.id === value);
}

/**
 * The part to open on. Anything stored that is not a part — a renamed id, a
 * hand-edited value, storage that cannot be read — opens on Review.
 */
export function loadCleanSection(): CleanSection {
  try {
    const stored = localStorage.getItem(CLEAN_SECTION_STORAGE_KEY);
    return isSection(stored) ? stored : DEFAULT_CLEAN_SECTION;
  } catch {
    return DEFAULT_CLEAN_SECTION;
  }
}

export function saveCleanSection(section: CleanSection): void {
  try {
    localStorage.setItem(CLEAN_SECTION_STORAGE_KEY, section);
  } catch {
    // Remembering is a convenience; the page works without it.
  }
}

/**
 * One sentence under the title for each part (CLN-1, DEC-132): the page used to
 * explain itself only when the library was empty.
 */
export const CLEAN_INTROS: Record<CleanSection, string> = {
  review:
    "CuePoint looks each track up on Beatport. Sure matches are accepted for you; the rest wait here for a yes or no.",
  fix:
    "Change many tracks at once: edit their key, BPM, genre, label and year, fill them in from Beatport's matches, and save the result into the audio files. Every change is recorded and can be reverted.",
  missing:
    "CuePoint finds files that are not where Rekordbox says, and does not move them. Missing means nothing is at that path; Unreadable means the file is there but CuePoint cannot open it.",
  duplicates:
    "Possible duplicates are grouped by what they share. CuePoint deletes nothing: decide which copy to keep in Rekordbox, or mark a group as not duplicates. The number on the tab counts tracks in those groups, not groups.",
  health:
    "What needs attention in your library, counted. Each number opens the list that fixes it, with exactly that many tracks.",
};

/**
 * Where work waits, for the tabs (CLN-3), from the Health counts the page
 * already loads. A part with nothing waiting has no number, and neither does one
 * whose check has never run: no count of missing files is not "no missing
 * files". Review counts what waits for you plus what changed since you decided.
 */
export function sectionCounts(
  health: LibraryHealth | null,
): Partial<Record<CleanSection, number>> {
  if (!health) return {};
  const count = (id: string) => health.counts.find((entry) => entry.id === id)?.count ?? 0;
  const ran = (id: string) =>
    health.detections.some((detection) => detection.id === id && detection.last_run_at !== null);
  const counts: Partial<Record<CleanSection, number>> = {};
  const review = count("needs_review") + count("disputed");
  if (review > 0) counts.review = review;
  if (ran("files") && count("missing_files") > 0) counts.missing = count("missing_files");
  if (ran("duplicates") && count("duplicates") > 0) counts.duplicates = count("duplicates");
  return counts;
}

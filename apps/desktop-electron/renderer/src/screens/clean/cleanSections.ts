/**
 * The Clean page's five parts, and which one it opens on (CLEAN-12, DEC-072).
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
 * The one list of the page's tabs (CLN-3, FLW-12): the screen and the counts
 * read it. The first keeps its id `review`, so a stored part, a link and
 * Health's counts still reach it (C14); it is called Match.
 */
export const CLEAN_SECTIONS: ReadonlyArray<{ id: CleanSection; label: string }> = [
  { id: "review", label: "Match" },
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
 * Where work waits, for the tabs (CLN-3), from the Health counts the page
 * already loads. A part with nothing waiting has no number, and neither does one
 * whose check has never run: no count of missing files is not "no missing
 * files". Match counts what waits for you plus what changed since you decided.
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

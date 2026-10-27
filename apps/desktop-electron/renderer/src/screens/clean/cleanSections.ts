/**
 * The Clean page's three parts, and which one it opens on (CLEAN-12, DEC-072, K3).
 *
 * Tabs rather than sections, the choice DEC-072 left to the specification:
 * each part is a table or a list a person works through, and stacking them
 * would put screens of scrolling between a reviewer and the queue. Round 2
 * (K3) took the page from five parts to three: Fix values went to the Library,
 * where its actions open in place, and Health went to Statistics. The part
 * last used is remembered with the existing `localStorage` pattern, so the
 * page reopens where the work was; a stored `fix` or `health` from before is
 * read as Match.
 */

import type { LibraryHealth } from "../../api/cuepointBridge.types";
import { formatCount, plural } from "../../format/counts";

export type CleanSection = "review" | "missing" | "duplicates";

/**
 * The one list of the page's tabs (CLN-3, FLW-12): the screen and the counts
 * read it. The first keeps its id `review`, so a stored part, a link and
 * Health's counts still reach it (C14); it is called Match.
 */
export const CLEAN_SECTIONS: ReadonlyArray<{ id: CleanSection; label: string }> = [
  { id: "review", label: "Match" },
  { id: "missing", label: "Missing files" },
  { id: "duplicates", label: "Duplicates" },
];

export const CLEAN_SECTION_STORAGE_KEY = "cuepoint-clean-section";

const DEFAULT_CLEAN_SECTION: CleanSection = "review";

function isSection(value: string | null): value is CleanSection {
  return CLEAN_SECTIONS.some((section) => section.id === value);
}

/**
 * The part to open on. Anything stored that is not a part — a renamed id, a
 * hand-edited value, storage that cannot be read — opens on Review, and so do
 * the two parts K3 removed (`fix`, `health`), which no longer exist here.
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

/** The facts line under the title: how many tracks, and what waits in each part. */
export function factsLine(
  tracks: number | null,
  counts: Partial<Record<CleanSection, number>>,
): string | undefined {
  const parts: string[] = [];
  if (tracks !== null && tracks > 0) parts.push(plural(tracks, "track"));
  if (counts.review) parts.push(`${formatCount(counts.review)} to check`);
  if (counts.missing) parts.push(`${formatCount(counts.missing)} missing`);
  if (counts.duplicates) parts.push(`${plural(counts.duplicates, "possible duplicate")}`);
  if (parts.length === 0) return undefined;
  if (parts.length === 1 && tracks !== null && tracks > 0) parts.push("nothing waiting");
  return parts.join(" · ");
}

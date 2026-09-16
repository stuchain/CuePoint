/**
 * The Clean page's four parts, and which one it opens on (CLEAN-12, DEC-072).
 *
 * Tabs rather than sections, the choice DEC-072 left to the specification:
 * each part is a table or a list a person works through, and four of them
 * stacked would put three screens of scrolling between a reviewer and the
 * queue. The part last used is remembered with the existing `localStorage`
 * pattern, so the page reopens where the work was.
 */

export type CleanSection = "review" | "missing" | "duplicates" | "health";

export const CLEAN_SECTIONS: ReadonlyArray<{ id: CleanSection; label: string }> = [
  { id: "review", label: "Review" },
  { id: "missing", label: "Missing files" },
  { id: "duplicates", label: "Duplicates" },
  { id: "health", label: "Health" },
];

export const CLEAN_SECTION_STORAGE_KEY = "cuepoint-clean-section";

export const DEFAULT_CLEAN_SECTION: CleanSection = "review";

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

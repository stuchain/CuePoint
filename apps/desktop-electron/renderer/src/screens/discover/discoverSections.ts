/**
 * The Discover page's three tabs, and which one it opens on (DISCOVER-10, FLW-15).
 *
 * Setting up a search, reading what past searches found, and the wantlist are
 * three jobs, so they are three tabs (FLW-3). The tab last used is remembered
 * with the same `localStorage` pattern Clean's parts use (CLEAN-12), so the
 * page reopens where the work was. "Run" is the engine's word and is never
 * shown (DSC-2): the ids here are the page's own.
 */

export type DiscoverSection = "new" | "results" | "wantlist";

export const DISCOVER_SECTIONS: ReadonlyArray<{ id: DiscoverSection; label: string }> = [
  { id: "new", label: "New search" },
  { id: "results", label: "Results" },
  { id: "wantlist", label: "Wantlist" },
];

export const DISCOVER_SECTION_STORAGE_KEY = "cuepoint-discover-section";

export const DEFAULT_DISCOVER_SECTION: DiscoverSection = "results";

function isSection(value: string | null): value is DiscoverSection {
  return DISCOVER_SECTIONS.some((section) => section.id === value);
}

/**
 * The tab to open on. Anything stored that is not a tab — the old "runs", a
 * hand-edited value, storage that cannot be read — opens on Results.
 */
export function loadDiscoverSection(): DiscoverSection {
  try {
    const stored = localStorage.getItem(DISCOVER_SECTION_STORAGE_KEY);
    return isSection(stored) ? stored : DEFAULT_DISCOVER_SECTION;
  } catch {
    return DEFAULT_DISCOVER_SECTION;
  }
}

export function saveDiscoverSection(section: DiscoverSection): void {
  try {
    localStorage.setItem(DISCOVER_SECTION_STORAGE_KEY, section);
  } catch {
    // Remembering is a convenience; the page works without it.
  }
}

/**
 * The Discover page's two parts, and which one it opens on (DISCOVER-10).
 *
 * Runs and the wantlist are two tables a person works through, so they are
 * tabs, as Clean's parts are (CLEAN-12). The part last used is remembered with
 * the same `localStorage` pattern, so the page reopens where the work was.
 */

export type DiscoverSection = "runs" | "wantlist";

export const DISCOVER_SECTIONS: ReadonlyArray<{ id: DiscoverSection; label: string }> = [
  { id: "runs", label: "Runs" },
  { id: "wantlist", label: "Wantlist" },
];

export const DISCOVER_SECTION_STORAGE_KEY = "cuepoint-discover-section";

export const DEFAULT_DISCOVER_SECTION: DiscoverSection = "runs";

function isSection(value: string | null): value is DiscoverSection {
  return DISCOVER_SECTIONS.some((section) => section.id === value);
}

/**
 * The part to open on. Anything stored that is not a part — a renamed id, a
 * hand-edited value, storage that cannot be read — opens on Runs.
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

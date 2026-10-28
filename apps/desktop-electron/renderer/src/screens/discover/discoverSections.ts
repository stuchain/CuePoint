/**
 * The Discover page's three tabs, and which one it opens on (DISCOVER-10, FLW-15).
 *
 * Reading what past searches found, setting up a new one, and the wantlist are
 * three jobs, so they are three tabs (FLW-3). Results comes first and is where the page opens
 * (C240), as Clean and Statistics open on their first tab. The tab last used is remembered
 * with the same `localStorage` pattern Clean's parts use (CLEAN-12), so the
 * page reopens where the work was. "Run" is the engine's word and is never
 * shown (DSC-2): the ids here are the page's own.
 */

export type DiscoverSection = "new" | "results" | "wantlist";

export const DISCOVER_SECTIONS: ReadonlyArray<{ id: DiscoverSection; label: string }> = [
  { id: "results", label: "Results" },
  { id: "new", label: "New dig" },
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

// ---------------------------------------------------------------- one dig

const RUN_KEY = "cuepointDiscoverRun";

/** The location state that opens Discover's Results on one dig (M269: an Activity dig row). */
export function discoverRunState(runId: number): Record<string, number> {
  return { [RUN_KEY]: runId };
}

/** The dig to open, and the navigation that asked, so asking twice opens twice. */
export interface DiscoverRunOpening {
  runId: number;
  token: string;
}

/**
 * The dig a location carries, checked before it is used (a location can be pushed by any code in
 * the renderer), or null when it carries none that is valid.
 */
export function discoverRunOpening(location: { state: unknown; key: string }): DiscoverRunOpening | null {
  const state = location.state;
  if (!state || typeof state !== "object") return null;
  const carried = (state as Record<string, unknown>)[RUN_KEY];
  return typeof carried === "number" && Number.isInteger(carried) && carried > 0
    ? { runId: carried, token: location.key }
    : null;
}

/**
 * The Match area's sub-tabs, the one it remembers, and the caption beside them (D13).
 *
 * Two sub-tabs: Playlists and Past searches. A review of a run is not a tab: it is a view inside
 * Playlists, shown only on something that was asked for, so only the two tabs are remembered, the
 * way the Clean page remembers its own tab. A stored value that is no longer a tab (the old
 * "review", One at a time, Table) opens Playlists.
 */
export type MatchTab = "playlists" | "past";

/** What the area is showing: a sub-tab, or a review inside Playlists. */
export type MatchView = MatchTab | "review";

/** The two tabs the area remembers. */
const REMEMBERED_TABS: ReadonlyArray<MatchTab> = ["playlists", "past"];

export const MATCH_TAB_STORAGE_KEY = "cuepoint-clean-match-tab";

export function loadMatchTab(): MatchTab {
  try {
    const stored = localStorage.getItem(MATCH_TAB_STORAGE_KEY);
    return REMEMBERED_TABS.find((entry) => entry === stored) ?? "playlists";
  } catch {
    return "playlists";
  }
}

export function saveMatchTab(tab: MatchTab): void {
  if (!REMEMBERED_TABS.includes(tab)) return;
  try {
    localStorage.setItem(MATCH_TAB_STORAGE_KEY, tab);
  } catch {
    // Remembering is a convenience; the area works without it.
  }
}

/**
 * The caption on the area's one row: which of the three steps this is. Past searches is not a
 * step, so it has none. A review is step 3, named for what it checks; a match that is running is
 * step 2.
 */
export function stepCaption(view: MatchView, matching: boolean, reviewName?: string): string | null {
  if (view === "past") return null;
  if (view === "review") {
    return reviewName ? `Step 3 of 3 · Check and sync ${reviewName}` : "Step 3 of 3 · Check and sync";
  }
  return matching ? "Step 2 of 3 · Matching" : "Step 1 of 3 · Tick playlists";
}

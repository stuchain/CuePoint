/**
 * The Match area's tabs, and the one it remembers.
 *
 * Playlists, the Review of a run (only while one is open, named for it) and Past searches. Review
 * is only ever open on something that was asked for, so only the other two are remembered, the
 * way the Clean page remembers its own tab. A tab that no longer exists (One at a time, Table)
 * opens Playlists.
 */
export type MatchTab = "playlists" | "review" | "past";

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

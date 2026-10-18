/**
 * What the Statistics page says when there is nothing to count yet (STATS-04).
 *
 * The shape is the Library's (PAGES-05): a sentence, a second sentence, and the
 * button that does the next step, which the page wires up. Kept pure, as the
 * Library's and Clean's are, so the words can be checked without rendering.
 */
interface StatisticsEmptyAction {
  id: "import";
  label: string;
}

export interface StatisticsEmptyState {
  title: string;
  hint: string | null;
  action?: StatisticsEmptyAction;
}

/** No library has been imported: nothing to count, and one thing to do about it. */
export function noLibraryState(): StatisticsEmptyState {
  return {
    title: "No library yet",
    hint: "Statistics counts the plays, keys and health of the tracks in your library.",
    action: { id: "import", label: "Import a Rekordbox file…" },
  };
}

/**
 * The Plays section when no refresh has been recorded yet, or null when there is history.
 * The counts Rekordbox already holds still show; only the "since" choices have to wait.
 */
export function noHistoryState(historyFrom: string | null): StatisticsEmptyState | null {
  if (historyFrom !== null) return null;
  return {
    title: "Play history starts at your next refresh",
    hint: "CuePoint notes how play counts move each time you refresh from Rekordbox. Until then, the counts are the ones already in your library.",
  };
}

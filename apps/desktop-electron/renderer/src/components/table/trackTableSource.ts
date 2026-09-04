/**
 * Where a track table's rows come from (LIBUI-04, DEC-040).
 *
 * The table never fetches, never sorts and never filters. It asks a source for
 * the row at an index and tells it which range is on screen; everything else —
 * paging, coalescing, cancelling, the query itself — belongs to whoever
 * implements this.
 *
 * That is the whole reason the interface exists. LIBUI-05 implements the
 * windowed one over the engine, and Phase 7 implements an in-memory one over
 * match results, so `ResultsTable` can converge onto this component without
 * the component growing a special case for either (DEC-041).
 */

export type TrackTableStatus = "idle" | "loading" | "ready" | "error";

export interface TrackTableSource<Row> {
  /**
   * How many rows the query matches — not how many are loaded.
   *
   * The scrollbar is sized from this, so a table over 50,000 tracks scrolls
   * its whole range from the first response rather than growing as windows
   * arrive.
   */
  total: number;

  /**
   * The row at an index, or undefined when it has not been loaded yet.
   *
   * Undefined is normal, not an error: it is what a placeholder row is drawn
   * from, and at 50,000 rows most indices are undefined most of the time.
   */
  getRow(index: number): Row | undefined;

  /**
   * The range currently on screen, including the table's overscan.
   *
   * Called when the range changes, not on every scroll event. A source may
   * ignore it (an in-memory one has nothing to fetch).
   */
  requestWindow?(startIndex: number, endIndex: number): void;

  /** What the source is doing, for the table's empty and error states. */
  status?: TrackTableStatus;

  /** Why the last request failed, when it did. */
  error?: string | null;
}

/**
 * A source over rows already in memory.
 *
 * Used by tests and by any caller that has the whole list — a short playlist,
 * a fixture, a Storybook story. It is deliberately here rather than in a test
 * file: a data-source interface with only one implementation is a shape nobody
 * has checked is implementable twice.
 */
export function inMemorySource<Row>(rows: readonly Row[]): TrackTableSource<Row> {
  return {
    total: rows.length,
    getRow: (index: number) => rows[index],
    status: "ready",
  };
}

/**
 * A source that knows how many rows there are and has none of them.
 *
 * The state a windowed table is in for the moment between asking and
 * answering, and what the placeholder rows are for. Exported because it is
 * also the honest thing to render while a query is in flight.
 */
export function pendingSource<Row>(total: number): TrackTableSource<Row> {
  return {
    total,
    getRow: () => undefined,
    status: "loading",
  };
}

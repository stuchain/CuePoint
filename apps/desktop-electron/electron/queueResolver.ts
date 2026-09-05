import type { LibraryBrowseParams, LibrarySearchResponse } from "./engineClient";
import type { QueueItemInput } from "./playbackQueue";

/**
 * Turning a view into a queue (PLAYER-05, DEC-012).
 *
 * DEC-012 says double-clicking a track loads "the current view" as the queue.
 * DEC-040 made the table windowed, so the renderer holds a hundred rows out of
 * tens of thousands — "the current view" is therefore a *query*, not an array,
 * and the queue is built by re-running that query rather than by reading what
 * happens to be on screen.
 *
 * Resolving happens here, in the main process, rather than in the renderer.
 * The renderer says *which* view (its scope, text, filters and ordering); main
 * asks the engine for it and owns the resulting queue, which is where DEC-050
 * puts it. That also keeps up to fifty thousand rows from crossing the IPC
 * boundary twice — once to the renderer and once back again — for a list the
 * renderer never needs to see.
 */

/**
 * Rows per request while resolving.
 *
 * Not the table's window size: nobody is looking at these, so the trade is
 * purely between request count and payload size. A 50,000-track view resolves
 * in 25 requests at this size, which is bounded and unremarkable; at the
 * table's 100 it would be 500.
 */
export const QUEUE_PAGE_SIZE = 2_000;

/**
 * The most tracks a queue will hold.
 *
 * Matched to the engine's own ceiling for a single projection request
 * (`BROWSE_IDS_LIMIT_MAX`) and to the 50,000-track library LIBUI-01 was
 * measured against, so the cap is "the largest library CuePoint supports"
 * rather than an arbitrary smaller number invented here. Beyond it the queue is
 * truncated and says so — DEC-054's principle that the app does not quietly do
 * less than it was asked.
 */
export const QUEUE_MAX_TRACKS = 50_000;

export interface ResolveQueueOptions {
  /** Overridden in tests. */
  pageSize?: number;
  maxTracks?: number;
}

export interface ResolvedQueue {
  items: QueueItemInput[];
  /** How many tracks the view actually holds, before any cap. */
  total: number;
  /** True when the view was larger than the cap and the queue was cut short. */
  truncated: boolean;
  /** How many requests it took, for diagnostics and tests. */
  requests: number;
}

type BrowseFn = (params: LibraryBrowseParams) => Promise<LibrarySearchResponse>;

/**
 * Resolve a view into playable queue items, in the view's own order.
 *
 * The query is passed through untouched apart from paging: same scope, same
 * filters, same sort and direction the table is showing, because a queue in a
 * different order from the table it came from would play tracks the user did
 * not choose in an order they cannot see.
 */
export async function resolveQueueFromView(
  browse: BrowseFn,
  view: LibraryBrowseParams,
  options: ResolveQueueOptions = {},
): Promise<ResolvedQueue> {
  const pageSize = Math.max(1, options.pageSize ?? QUEUE_PAGE_SIZE);
  const maxTracks = Math.max(1, options.maxTracks ?? QUEUE_MAX_TRACKS);

  const items: QueueItemInput[] = [];
  let requests = 0;
  let total = 0;

  while (items.length < maxTracks) {
    const remaining = maxTracks - items.length;
    const response = await browse({
      ...view,
      fields: "queue",
      limit: Math.min(pageSize, remaining),
      offset: items.length,
    });
    requests += 1;
    total = response.total ?? 0;

    const rows = response.queue_tracks ?? [];
    for (const row of rows) {
      items.push({
        trackId: row.id,
        filePath: row.file_path,
        title: row.title,
        artist: row.artist,
        durationSeconds: row.duration_seconds,
      });
    }

    // A short page is the end of the results. Stopping on it rather than on
    // `total` alone matters: the library can change between pages, and trusting
    // a stale total would loop asking for rows that are not there.
    if (rows.length === 0 || rows.length < Math.min(pageSize, remaining)) break;
    if (items.length >= total) break;
  }

  return {
    items,
    total,
    truncated: total > items.length,
    requests,
  };
}

/**
 * What to tell the user when a view was too big to queue whole.
 *
 * Returns null when nothing was lost, so a caller can show this or say nothing
 * without deciding the wording itself.
 */
export function queueTruncationMessage(resolved: ResolvedQueue): string | null {
  if (!resolved.truncated) return null;
  return (
    `Queued the first ${resolved.items.length.toLocaleString()} of ` +
    `${resolved.total.toLocaleString()} tracks.`
  );
}

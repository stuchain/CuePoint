/**
 * Showing a file a "Find in a folder" job located (DEC-073).
 *
 * The renderer never sends a path for this: it names the find job and the track, and the
 * main process reads the path from that job's own result, which the engine produced. A
 * result that is not a find's, or a track the find did not locate, has no path.
 */

/** The path the find job's result holds for one track, or null when it holds none. */
export function foundFilePath(answer: { result?: unknown } | null | undefined, trackId: unknown): string | null {
  const result = answer?.result;
  if (typeof trackId !== "number" || !Number.isInteger(trackId)) return null;
  if (typeof result !== "object" || result === null) return null;
  const { folder, found } = result as { folder?: unknown; found?: unknown };
  if (typeof folder !== "string" || !Array.isArray(found)) return null;
  for (const hit of found) {
    if (typeof hit !== "object" || hit === null) continue;
    const entry = hit as { track_id?: unknown; path?: unknown };
    if (entry.track_id === trackId && typeof entry.path === "string" && entry.path !== "") {
      return entry.path;
    }
  }
  return null;
}

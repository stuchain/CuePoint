/**
 * The Library's "Loudness" column, apart from its cell (WAVE-08).
 *
 * The query a row reads its loudness through, and the read a copy makes for
 * every row it holds. Kept out of `libraryCells.tsx`, which exports
 * components only.
 */
import type { LibraryTrackRow } from "../../api/cuepointBridge.types";
import { loudnessCopyText } from "../../components/waveform/loudnessWords";
import { readEntries, type WaveformQuery } from "../../components/waveform/waveformCache";

/** What the loudness column asks: no picture, and its loudness followed. */
export const LOUDNESS_QUERY: WaveformQuery = { width: null, marks: false, loudness: true };

/**
 * The loudness of every row a copy holds, as text: "−8.4 LUFS", or why there
 * is none. Read for the rows themselves, 200 at a time, since a copy can hold
 * thousands of rows no view has shown (`gatherText`).
 */
export async function gatherLoudnessText(
  rows: readonly LibraryTrackRow[],
): Promise<(row: LibraryTrackRow) => string> {
  const ids = rows.map((row) => row.id).filter((id): id is number => typeof id === "number");
  const bridge = typeof window === "undefined" ? undefined : window.cuepoint?.waveforms;
  const entries = await readEntries(bridge, ids, LOUDNESS_QUERY);
  return (row) => loudnessCopyText(typeof row.id === "number" ? entries.get(row.id) : null);
}

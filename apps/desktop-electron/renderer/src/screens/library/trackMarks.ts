/**
 * A track's cue points and beat grid, in words (WAVE-04, DEC-118).
 *
 * The Track details panel's Rekordbox record lists every cue, one line each — "A · 0:32.1
 * · Drop" — and says whether the track has a beat grid. The waveform draws
 * them from WAVE-06, and this list stays: a mark is never shown only as a
 * picture. Pure, so the wording is tested here and the component stays thin.
 */
import type {
  TrackBeatGridSummary,
  TrackCue,
  TrackCueKind,
  TrackMarksSummary,
} from "../../api/cuepointBridge.types";

/** Rekordbox's hot cue slots, 0–7. */
const HOT_CUE_LETTERS = "ABCDEFGH";

/** The words for a mark that is not a plain cue. A plain cue needs none. */
const KIND_WORDS: Record<TrackCueKind, string | null> = {
  cue: null,
  fade_in: "Fade-in",
  fade_out: "Fade-out",
  load: "Load point",
  loop: "Loop",
};

/**
 * A position in a track, to a tenth of a second: "0:32.1", "1:02:03.4".
 *
 * Truncated, never rounded, as a playhead reads: a cue at 64.99 s is still in
 * the 64th second, and rounding would put it in the next.
 */
export function cueTime(ms: number): string {
  const tenths = Math.floor(Math.max(0, ms) / 100);
  const seconds = Math.floor(tenths / 10);
  const tenth = tenths % 10;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = String(seconds % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}.${tenth}`
    : `${minutes}:${secs}.${tenth}`;
}

/** "A" to "H" for a hot cue, "Memory" for a memory cue. */
export function cueSlot(cue: Pick<TrackCue, "hot_cue">): string {
  return cue.hot_cue == null ? "Memory" : (HOT_CUE_LETTERS[cue.hot_cue] ?? "?");
}

/** One cue as the Inspector lists it: "A · 0:32.1 · Drop", "B · 2:00.0–2:07.5 · Loop". */
export function cueLine(cue: TrackCue): string {
  const time =
    cue.end_ms == null ? cueTime(cue.start_ms) : `${cueTime(cue.start_ms)}–${cueTime(cue.end_ms)}`;
  return [cueSlot(cue), time, KIND_WORDS[cue.kind], cue.name]
    .filter((part): part is string => part != null && part !== "")
    .join(" · ");
}

/** The cues in the order a track plays them, a hot cue before a memory cue at one spot. */
export function cuesInTrackOrder(cues: readonly TrackCue[]): TrackCue[] {
  return [...cues].sort(
    (a, b) => a.start_ms - b.start_ms || (a.hot_cue ?? 8) - (b.hot_cue ?? 8),
  );
}

/** What the Cue points heading says beside its name: "3 hot, 5 memory", or that there are none. */
export function cuesSummary(marks: TrackMarksSummary): string | null {
  if (marks.cues.length === 0) return marks.read ? "none" : null;
  const parts = [];
  if (marks.hot_cues) parts.push(`${marks.hot_cues} hot`);
  if (marks.memory_cues) parts.push(`${marks.memory_cues} memory`);
  return parts.join(", ");
}

/** The Cue points heading's tooltip: what the two kinds are, and that they are not editable here. */
export const CUES_HINT = "Hot cues (A–H) and memory cues, as set in Rekordbox. Shown here, not editable.";

/** The tooltip of a grid whose tempo changes. */
export const VARIABLE_GRID_HINT = "The tempo changes during the track";

/**
 * Said when the library's marks have not been read yet: a library imported
 * before WAVE-04 whose collection file has changed since. Its cues are not
 * missing, they are waiting, and "No cues" would say otherwise.
 */
export const MARKS_NOT_READ =
  "Cue points and the beat grid are read from Rekordbox. They appear after you Check Rekordbox for changes.";

/** The grid in one line: "Beat grid · 128.00 BPM", or a variable grid's range. */
export function beatGridLine(grid: TrackBeatGridSummary | null, read: boolean): string | null {
  if (grid == null) return read ? "No beat grid" : null;
  if (!grid.variable) return `Beat grid · ${grid.bpm.toFixed(2)} BPM`;
  return `Beat grid · variable, ${grid.min_bpm.toFixed(2)}–${grid.max_bpm.toFixed(2)} BPM`;
}

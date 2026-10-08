/**
 * What the transition strip shows, decided apart from its drawing (WAVE-07, DEC-120).
 *
 * The strip shows the selected entry beside the one after it in the running
 * order: how one track is planned to end and the next to begin. Everything it
 * says in words is decided here, so it is tested without a canvas:
 *
 * - **Each half's times** (DEC-107): "In 0:16 · Out 5:42". An empty in time is
 *   the start of the track, and an entry without an out time has "No out time".
 * - **The words between the halves:** the first entry's out and the next
 *   one's in, "Out 5:42 → In 0:16". "No out time" stands for an out time that
 *   was never typed, and "no times" for a next entry with none planned at all.
 *   The last entry's words are its out alone; its second half reads "End of
 *   Set".
 * - **Its shading:** the planned times in milliseconds, for the drawing's
 *   regions before the in and after the out. Planned times are text as well as
 *   shading, because no picture is the only place a fact appears (DEC-120).
 * - **Its loudness** (WAVE-08): the words gain how much louder the next track
 *   sits than the selected one, "+2.1 LU", when both are measured.
 *   `loudnessWords.ts` says each number.
 */
import type { SetEntry } from "../../api/cuepointBridge.types";
import { formatTime } from "./setTime";

/** What the strip says with no entry selected. */
export const NO_SELECTION_WORDS = "Select an entry to see its transition";

/** The second half when the last entry is selected. */
export const END_OF_SET = "End of Set";

/** One half: an entry, its track and its planned times. */
export interface TransitionHalf {
  entryId: number;
  trackId: number;
  title: string;
  /** Null is the start of the track. */
  inSeconds: number | null;
  /** Null is an untimed entry (DEC-107). */
  outSeconds: number | null;
}

/** The selected entry and the one after it; null after the last. */
interface Transition {
  from: TransitionHalf;
  to: TransitionHalf | null;
}

function halfOf(entry: SetEntry): TransitionHalf {
  return {
    entryId: entry.entry_id,
    trackId: entry.track_id,
    title: entry.track.title?.trim() || "Untitled",
    inSeconds: entry.in_seconds,
    outSeconds: entry.out_seconds,
  };
}

/**
 * The transition out of the selected entry, in the running order as the table
 * shows it, repeats included; null when nothing in the Set is selected.
 */
export function transitionOf(
  entries: readonly SetEntry[],
  selectedEntryId: number | null,
): Transition | null {
  if (selectedEntryId === null) return null;
  const at = entries.findIndex((entry) => entry.entry_id === selectedEntryId);
  if (at < 0) return null;
  const next = entries[at + 1];
  return { from: halfOf(entries[at]!), to: next ? halfOf(next) : null };
}

/** True when an entry has neither time planned. */
function unplanned(half: TransitionHalf): boolean {
  return half.inSeconds === null && half.outSeconds === null;
}

/** What an out time never typed reads as (PRP-3): the count stays honest without a word to decode. */
const NO_OUT_TIME = "No out time";

/** A half's planned times in words: "In 0:16 · Out 5:42", "In 0:16 · no out time", "No out time". */
export function halfTimesWords(half: TransitionHalf): string {
  if (half.outSeconds !== null) {
    return `In ${formatTime(half.inSeconds ?? 0)} · Out ${formatTime(half.outSeconds)}`;
  }
  if (half.inSeconds !== null) return `In ${formatTime(half.inSeconds)} · no out time`;
  return NO_OUT_TIME;
}

/** The out half of the words: "Out 5:42", or "No out time". */
export function outWords(half: TransitionHalf): string {
  return half.outSeconds !== null ? `Out ${formatTime(half.outSeconds)}` : NO_OUT_TIME;
}

/** The in half of the words: "In 0:16", "In 0:00" for a timed entry from its start, or "no times". */
export function inWords(half: TransitionHalf): string {
  if (unplanned(half)) return "no times";
  return `In ${formatTime(half.inSeconds ?? 0)}`;
}

/**
 * The words between the halves, in reading order, ending with the loudness
 * difference when there is one (WAVE-08): "Out 5:42 → In 0:16 · +2.1 LU".
 */
export function transitionWords(transition: Transition, difference: string | null = null): string[] {
  const out = outWords(transition.from);
  if (!transition.to) return [out];
  const words = [out, "→", inWords(transition.to)];
  return difference ? [...words, "·", difference] : words;
}

/** The shading of a half: the planned in and out in milliseconds, or null where nothing is shaded. */
export function shadedTimes(half: TransitionHalf): { inMs: number | null; outMs: number | null } {
  return {
    inMs: half.inSeconds !== null && half.inSeconds > 0 ? half.inSeconds * 1000 : null,
    outMs: half.outSeconds !== null ? half.outSeconds * 1000 : null,
  };
}

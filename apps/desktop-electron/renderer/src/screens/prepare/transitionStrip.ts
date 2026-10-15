/**
 * What the transition strip shows, decided apart from its drawing (WAVE-07, DEC-120).
 *
 * The strip shows the selected entry beside the one after it in the running
 * order: how one track is planned to end and the next to begin. Everything it
 * says in words is decided here, so it is tested without a canvas:
 *
 * - **Each half's times** (DEC-107): "In 0:16 · Out 5:42". An empty in time is
 *   the start of the track, and an entry without an out time has "No out time".
 * - **The last entry's second half** reads "End of Set".
 * - **Its shading:** the planned times in milliseconds, for the drawing's
 *   regions before the in and after the out. Planned times are text as well as
 *   shading, because no picture is the only place a fact appears (DEC-120).
 * - **Its caption** (FLW-19, C15d): the keys, how they relate and the tempo change
 *   in one line of segments, "8A → 9A · next key up · +1.6% BPM", in the key words
 *   everywhere else uses. The planned times are the halves' titles'.
 * - **Its loudness** (WAVE-08): how much louder the next track sits than the
 *   selected one, "+2.1 LU", when both are measured, is in the caption's title.
 *   `loudnessWords.ts` says each number.
 */
import type { SetEntry, SetShape, SetWarning } from "../../api/cuepointBridge.types";
import { formatBpm } from "../../components/format/bpm";
import { formatTempoChange } from "../../format/units";
import { shortWarning } from "./prepareFormat";
import { keyRelationWords } from "./prepareSource";
import { formatLength } from "../../format/durations";

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

/** What an out time never typed reads as (PRP-3): the count stays honest without a word to decode. */
const NO_OUT_TIME = "No out time";

/** A half's planned times in words: "In 0:16 · Out 5:42", "In 0:16 · no out time", "No out time". */
export function halfTimesWords(half: TransitionHalf): string {
  if (half.outSeconds !== null) {
    return `In ${formatLength(half.inSeconds ?? 0)} · Out ${formatLength(half.outSeconds)}`;
  }
  if (half.inSeconds !== null) return `In ${formatLength(half.inSeconds)} · no out time`;
  return NO_OUT_TIME;
}

/** The shading of a half: the planned in and out in milliseconds, or null where nothing is shaded. */
export function shadedTimes(half: TransitionHalf): { inMs: number | null; outMs: number | null } {
  return {
    inMs: half.inSeconds !== null && half.inSeconds > 0 ? half.inSeconds * 1000 : null,
    outMs: half.outSeconds !== null ? half.outSeconds * 1000 : null,
  };
}

/** Said in place of the keys when either track has none: no check was made (DEC-201). */
export const NO_BEATPORT_KEY = "Keys not checked";

/** The whole of it, for the caption's hover: why the keys were not checked. */
export const NO_BEATPORT_KEY_DETAIL = "No Beatport key: key not checked";

/** "next key up" for a step between neighbors on the wheel, in the key words. */
function relationWords(
  relation: SetShape["transitions"][number]["key_relation"],
  from: NonNullable<SetShape["entries"][number]["camelot"]>,
  to: NonNullable<SetShape["entries"][number]["camelot"]>,
): string {
  const words = keyRelationWords(relation).toLowerCase();
  if (relation !== "adjacent") return words;
  return `${words} ${(to.number - from.number + 12) % 12 === 1 ? "up" : "down"}`;
}

/** The change of tempo as the caption says it: "+2.8%", "−12.9%", "0%". */
function tempoChange(from: number, to: number): string {
  return formatTempoChange(from, to);
}

/** "122 → 124 BPM (+1.6%)": the tempos and how far the second is from the first, for a title. */
function tempoWords(from: number, to: number): string {
  const change = tempoChange(from, to);
  return `${formatBpm(from)} → ${formatBpm(to)} BPM (${change})`;
}

/** What the caption says in place of a key relation that is a clash (shown in the warning colour). */
export const KEYS_CLASH = "keys clash";

/** The two entries of a transition in the Set's shape, when both have one. */
function shapeOf(transition: Transition, shape: SetShape | null) {
  const to = transition.to;
  if (!to || !shape) return null;
  const from = shape.entries.find((entry) => entry.entry_id === transition.from.entryId);
  const next = shape.entries.find((entry) => entry.entry_id === to.entryId);
  return from && next ? { from, next } : null;
}

/** The two keys of a transition as Camelot codes ("8A"), or null when either side has none. */
export function captionKeys(transition: Transition, shape: SetShape | null): { from: string; to: string } | null {
  const pair = shapeOf(transition, shape);
  if (!pair?.from.camelot || !pair.next.camelot) return null;
  const code = (c: NonNullable<typeof pair.from.camelot>) => `${c.number}${c.letter}`;
  return { from: code(pair.from.camelot), to: code(pair.next.camelot) };
}

/**
 * The caption's segments, joined with " · " when it is drawn (FLW-19, C15d): the
 * keys and how they relate ("8A → 4A · next key up", or "keys clash"), and the
 * tempo change ("+2.8% BPM"). The planned times are the halves' titles' and the
 * loudness difference the caption's title's, so neither is here. A segment
 * with nothing to say is left out; a missing key is said once, as the reason no
 * key was compared. Without the Set's shape, or after the last entry, nothing.
 */
export function captionSegments(transition: Transition, shape: SetShape | null): string[] {
  const segments: string[] = [];
  const pair = shapeOf(transition, shape);
  if (!pair || !shape) return segments;
  const { from, next } = pair;
  const keys = captionKeys(transition, shape);
  if (from.camelot && next.camelot && keys) {
    const link = shape.transitions.find(
      (step) => step.from_entry_id === from.entry_id && step.to_entry_id === next.entry_id,
    );
    segments.push(`${keys.from} → ${keys.to}`);
    // A clash is said here in the warning colour even when the warning beside the caption says it too:
    // the keys line reads whole, and the warning is the one to accept.
    segments.push(relationWords(link?.key_relation ?? null, from.camelot, next.camelot));
  } else {
    segments.push(NO_BEATPORT_KEY);
  }
  if (from.bpm != null && next.bpm != null && from.bpm > 0) {
    segments.push(tempoChange(from.bpm, next.bpm));
  }
  return segments;
}

/** The whole tempos behind the caption's "+2.8% BPM", for its title; null when it has none. */
export function captionDetail(transition: Transition, shape: SetShape | null): string | null {
  const pair = shapeOf(transition, shape);
  if (!pair || pair.from.bpm == null || pair.next.bpm == null || pair.from.bpm <= 0) return null;
  return tempoWords(pair.from.bpm, pair.next.bpm);
}

/** The order the strip shows a warning in: the clash first, then the tempo's. */
const WARNING_ORDER: SetWarning["kind"][] = ["key_clash", "tempo_jump", "tempo_unknown"];

/**
 * The one warning the caption shows, with Accept (C15d): the first still open in
 * the order key clash, tempo jump, tempo unknown, or, when every one is
 * accepted, the first of them so its Undo stays reachable; every other, accepted
 * or not, is counted in a "+N more" and listed in its title. Only the warnings of a transition are its to show.
 */
export function mainWarning(warnings: readonly SetWarning[]): { shown: SetWarning | null; others: SetWarning[] } {
  const ordered = WARNING_ORDER.flatMap((kind) => warnings.filter((warning) => warning.kind === kind));
  const shown = ordered.find((warning) => !warning.acknowledged) ?? ordered[0] ?? null;
  return { shown, others: ordered.filter((warning) => warning !== shown) };
}

/**
 * A warning in the few words the strip has room for ("Tempo jump", "Keys
 * clash"); its full sentence is the title beside it.
 */
export function stripWarningWords(warning: SetWarning): string {
  switch (warning.kind) {
    case "tempo_jump":
      return "Tempo jump";
    case "key_clash":
      return "Keys clash";
    case "tempo_unknown":
      return "No BPM to compare";
    default:
      return shortWarning(warning);
  }
}

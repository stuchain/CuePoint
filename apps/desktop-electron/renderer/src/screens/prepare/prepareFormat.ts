/**
 * The Prepare page in words (PREP-10, DEC-106, DEC-107).
 *
 * The running time counts timed entries only and says how many are not in its
 * title (DEC-107): "1:34:20 planned", left out while none is typed (PRP-3). A heading states its chapter's
 * time against its target and its BPM range. A transition is summed up in a
 * few words for its cell; the whole sentence, `describeSetWarning`'s, is the
 * cell's title and the Inspector's line.
 */
import type {
  SetAnalysis,
  SetChapterPlan,
  SetRunningTime,
  SetWarning,
} from "../../api/cuepointBridge.types";
import { formatBpm } from "../discover/similarReasons";
import { chapterName } from "./prepareRows";
import { describeFileCheck, describeSetWarning } from "./setWarnings";
import { formatTime } from "./setTime";

function counted(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

/** Said in the track count's title while no time is typed, when "0:00 planned" would read as a plan (PRP-3). */
const NO_TIMES_YET =
  "No times planned yet. Select an entry and type its Mix in and Mix out in the table to plan the Set's length. Times are optional.";

/**
 * "1:34:20 planned"; null while no entry has a time (PRP-3), and for an empty
 * Set, which has nothing to time. How many entries are not timed is
 * `withoutTimesLine`, in the fact's title (DEC-107).
 */
export function runningTimeLine(running: SetRunningTime): string | null {
  if (running.timed === 0 && running.seconds === 0) return null;
  return `${formatTime(running.seconds)} planned`;
}

/** "3 without times"; null when every entry has one. */
export function withoutTimesLine(running: SetRunningTime): string | null {
  return running.untimed > 0 ? `${running.untimed.toLocaleString()} without times` : null;
}

/** The header's count of warnings still open; the accepted ones are `acceptedLine`, in its title. */
export function warningCountLine(analysis: SetAnalysis): string {
  const open = Object.values(analysis.counts).reduce((sum, count) => sum + (count ?? 0), 0);
  return open === 0 ? "No warnings" : counted(open, "warning", "warnings");
}

/** "2 accepted"; null when none is. */
function acceptedLine(analysis: SetAnalysis): string | null {
  return analysis.acknowledged > 0 ? `${analysis.acknowledged.toLocaleString()} accepted` : null;
}

/** One fact in the header's line: its words, a longer title, and whether it is a warning. */
interface HeaderFact {
  text: string;
  title?: string;
  strong?: boolean;
  /**
   * Set when the fact has a button beside it: what it starts, and its words.
   * These sit outside the facts that give way, so they always show (DEC-112).
   */
  action?: "check_files" | "match_keyless";
  actionText?: string;
}

/**
 * Each kind of warning, one and many, as the header's count names it in its
 * title: transitions first, then entries, then chapters, as a Set is read.
 */
const KIND_WORDS: Record<SetWarning["kind"], [string, string]> = {
  tempo_jump: ["tempo jump", "tempo jumps"],
  key_clash: ["key clash", "key clashes"],
  tempo_unknown: ["tempo unknown", "tempos unknown"],
  file_missing: ["file missing", "files missing"],
  file_unreadable: ["file unreadable", "files unreadable"],
  time_outside_track: ["time past a track's end", "times past a track's end"],
  over_target: ["chapter over its target", "chapters over their targets"],
  under_target: ["chapter under its target", "chapters under their targets"],
  bpm_outside_range: ["chapter outside its BPM range", "chapters outside their BPM ranges"],
};

/**
 * The header's one line (DEC-112 keeps it to one): "32 tracks · 9:00 planned ·
 * 19 warnings", the running time only once something is planned, each short,
 * the longer sentence in its title. What the line leaves out is in a title: the
 * untimed entries in the time's, the accepted warnings in the warnings'.
 */
export function headerFacts(
  entryCount: number,
  running: SetRunningTime,
  analysis: SetAnalysis,
): HeaderFact[] {
  const planned = runningTimeLine(running);
  const facts: HeaderFact[] = [
    { text: counted(entryCount, "track", "tracks"), title: planned || entryCount === 0 ? undefined : NO_TIMES_YET },
  ];
  if (planned) facts.push({ text: planned, title: withoutTimesLine(running) ?? undefined });
  const kinds = (Object.keys(KIND_WORDS) as SetWarning["kind"][])
    .filter((kind) => (analysis.counts[kind] ?? 0) > 0)
    .map((kind) => counted(analysis.counts[kind] ?? 0, ...KIND_WORDS[kind]));
  const title = [...kinds, acceptedLine(analysis)].filter(Boolean).join(", ");
  facts.push({
    text: warningCountLine(analysis),
    title: title || undefined,
    strong: kinds.length > 0,
  });
  const files = describeFileCheck(analysis.files);
  if (files) {
    const { unchecked, never_checked: never } = analysis.files;
    facts.push({
      text: never ? "Files not checked" : `${counted(unchecked, "file", "files")} not checked`,
      title: files,
      action: "check_files",
      actionText: "Check now",
    });
  }
  if (analysis.without_key > 0) {
    // Not a warning (DEC-201): said once, with the way to get the keys.
    const count = analysis.without_key;
    facts.push({
      text: `${count.toLocaleString()} without key`,
      title: `${counted(count, "entry", "entries")} ${count === 1 ? "has" : "have"} no Beatport key, so no key check applies. Match the tracks to get theirs.`,
      action: "match_keyless",
      actionText: "Match tracks…",
    });
  }
  return facts;
}

/** A heading's time: "9:00 of 8:00", or "9:00" without a target, and what is untimed. */
export function chapterTimeText(chapter: Pick<SetChapterPlan, "running_time" | "target_seconds">): string {
  const run = formatTime(chapter.running_time.seconds);
  const planned =
    chapter.target_seconds == null ? run : `${run} of ${formatTime(chapter.target_seconds)}`;
  const untimed = chapter.running_time.untimed;
  return untimed > 0 ? `${planned} · ${untimed.toLocaleString()} without times` : planned;
}

/** A chapter's BPM range: "120–123", "from 120", "to 123", or "" with none. */
export function bpmRangeText(chapter: Pick<SetChapterPlan, "bpm_min" | "bpm_max">): string {
  const { bpm_min: min, bpm_max: max } = chapter;
  if (min != null && max != null) return `${formatBpm(min)}–${formatBpm(max)}`;
  if (min != null) return `from ${formatBpm(min)}`;
  if (max != null) return `to ${formatBpm(max)}`;
  return "";
}

/** A warning in a few words, for a cell. */
export function shortWarning(warning: SetWarning): string {
  switch (warning.kind) {
    case "tempo_jump":
      return `${warning.detail === "faster" ? "+" : "−"}${warning.compared.percent}% tempo`;
    case "key_clash":
      return "Key clash";
    case "tempo_unknown":
      return "No BPM";
    case "file_missing":
      return "File missing";
    case "file_unreadable":
      return "Unreadable";
    case "time_outside_track":
      return "Past the end";
    case "over_target":
      return "Over target";
    case "under_target":
      return "Under target";
    case "bpm_outside_range":
      return "Outside BPM range";
  }
  return "Check";
}

/** What a cell draws for a list of warnings. */
interface WarningSummary {
  /** "open" when any is still to accept, "accepted" when all were. */
  tone: "none" | "open" | "accepted";
  text: string;
  /** Every warning as its sentence, for the cell's title. */
  title: string;
}

/**
 * A cell's warnings: the open ones, or "accepted" when all were.
 *
 * Accepted warnings stay visible, muted, because DEC-106 brings one back when
 * its values change and a user should be able to see what they accepted.
 */
export function summarizeWarnings(warnings: readonly SetWarning[]): WarningSummary {
  if (warnings.length === 0) return { tone: "none", text: "", title: "" };
  const open = warnings.filter((warning) => !warning.acknowledged);
  const title = warnings
    .map((warning) => `${describeSetWarning(warning)}${warning.acknowledged ? " (accepted)" : ""}`)
    .join("\n");
  if (open.length > 0) {
    return { tone: "open", text: open.map(shortWarning).join(" · "), title };
  }
  return { tone: "accepted", text: `${warnings.map(shortWarning).join(" · ")} accepted`, title };
}

/** A planned time for a cell: "4:30", or empty when there is none. */
export function timeCell(seconds: number | null): string {
  return seconds == null ? "" : formatTime(seconds);
}

/** A Set's notes as typed, as they are sent: trimmed, and blank is none (PREP-12). */
export function notesToSend(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

/** The facts line's Notes button: a mark once the Set has notes (PRP-10). */
export function notesLinkLabel(notes: string | null): string {
  return notes ? "Notes (1)" : "Notes";
}

/** The header's "Notes" title: the notes themselves, or what the link is for. */
export function notesLinkTitle(notes: string | null): string {
  return notes ?? "Notes for the whole Set: the venue, the times, anything to remember";
}

/** What the page says with no Sets at all (DEC-104). */
export const WHAT_A_SET_IS = "A Set is a running order of tracks.";

/** Said in a shell without the Sets bridge: a browser tab, an older shell. */
export const NO_SETS = "Prepare needs the desktop app with CuePoint's library service running.";

/** An empty Set's table. */
export const EMPTY_SET =
  "This Set is empty. Drag tracks here from the list on the right, or select them and choose Insert here.";

/**
 * What deleting a chapter does, before it is done (DEC-103): its entries join
 * the chapter before it, or the one after for the first, and only the
 * chapter's own name, notes and targets go.
 */
export function deletionLine(chapters: readonly SetChapterPlan[], chapter: SetChapterPlan): string {
  const ordered = [...chapters].sort((a, b) => a.position - b.position);
  const at = ordered.findIndex((candidate) => candidate.id === chapter.id);
  const joins = at > 0 ? ordered[at - 1] : ordered[at + 1];
  const count = chapter.entry_ids.length;
  const entries =
    count === 0
      ? "It holds no entries."
      : `Its ${count === 1 ? "entry joins" : `${count.toLocaleString()} entries join`} “${
          joins ? chapterName(joins) : ""
        }”, with ${count === 1 ? "its" : "their"} times and notes.`;
  return `${entries} The chapter's name, notes and targets are deleted with it.`;
}

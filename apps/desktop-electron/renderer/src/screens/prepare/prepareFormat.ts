/**
 * The Prepare page in words (PREP-10, DEC-106, DEC-107).
 *
 * The running time counts timed entries only and says how many are not
 * (DEC-107): "1:34:20 planned · 3 untimed". A heading states its chapter's
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

/** "1:34:20 planned · 3 untimed"; "0:00 planned" says nothing is timed yet. */
export function runningTimeLine(running: SetRunningTime): string {
  const planned = `${formatTime(running.seconds)} planned`;
  return running.untimed > 0 ? `${planned} · ${running.untimed.toLocaleString()} untimed` : planned;
}

/** The header's count: warnings still open, and how many were accepted. */
export function warningCountLine(analysis: SetAnalysis): string {
  const open = Object.values(analysis.counts).reduce((sum, count) => sum + (count ?? 0), 0);
  const head = open === 0 ? "No warnings" : counted(open, "warning", "warnings");
  return analysis.acknowledged > 0 ? `${head} · ${analysis.acknowledged.toLocaleString()} accepted` : head;
}

/** One fact in the header's line: its words, a longer title, and whether it is a warning. */
interface HeaderFact {
  text: string;
  title?: string;
  strong?: boolean;
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
 * The header's one line (DEC-112 keeps it to one): how many entries, the
 * running time, the warnings, and what the file checks leave unknown, each
 * short, the longer sentence in its title.
 */
export function headerFacts(
  entryCount: number,
  running: SetRunningTime,
  analysis: SetAnalysis,
): HeaderFact[] {
  const facts: HeaderFact[] = [
    { text: counted(entryCount, "entry", "entries") },
    { text: runningTimeLine(running) },
  ];
  const kinds = (Object.keys(KIND_WORDS) as SetWarning["kind"][])
    .filter((kind) => (analysis.counts[kind] ?? 0) > 0)
    .map((kind) => counted(analysis.counts[kind] ?? 0, ...KIND_WORDS[kind]));
  facts.push({
    text: warningCountLine(analysis),
    title: kinds.length > 0 ? kinds.join(", ") : undefined,
    strong: kinds.length > 0,
  });
  const files = describeFileCheck(analysis.files);
  if (files) {
    const { unchecked, never_checked: never } = analysis.files;
    facts.push({
      text: never ? "Files never checked" : `${counted(unchecked, "file", "files")} never checked`,
      title: files,
    });
  }
  if (analysis.without_key > 0) {
    facts.push({
      text: `${counted(analysis.without_key, "entry", "entries")} without a key`,
      title: "No Beatport key, so no key check applies. Match the library in Clean to get keys.",
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
  return untimed > 0 ? `${planned} · ${untimed.toLocaleString()} untimed` : planned;
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

/** The header's "Notes…" title: the notes themselves, or what the link is for. */
export function notesLinkTitle(notes: string | null): string {
  return notes ?? "Notes for the whole Set: the venue, the times, anything to remember";
}

/** What the page says with no Sets at all (DEC-104). */
export const WHAT_A_SET_IS =
  "A Set is a running order: tracks in the order you will play them, in chapters, " +
  "with the times you plan to bring each one in and out. CuePoint checks every " +
  "transition and plays the Set as the queue.";

/** Said in a shell without the Sets bridge: a browser tab, an older shell. */
export const NO_SETS = "Prepare needs the desktop app with CuePoint's library service running.";

/** An empty Set's table. */
export const EMPTY_SET =
  "This Set is empty. Add tracks with “Add to Set…” in the Library, or drop them on the Set in the Collections tree.";

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

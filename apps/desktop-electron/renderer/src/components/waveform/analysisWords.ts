/**
 * The waveform analysis, and a track's waveform, in words (WAVE-03, WAVE-05).
 *
 * Pure, so the sentences are tested once and every place that shows the
 * analysis — the Health view and Settings — says the same thing, as every
 * place that shows a track without its waveform will. The analysis is never
 * shown as an error: a build without the player's decoder says once, in words,
 * why there are no waveforms (fact 2).
 */
import type {
  WaveformAnalysisStatus,
  WaveformTrack,
} from "../../api/cuepointBridge.types";
import { aboutDuration } from "../shell/useActiveJob";
import type { WaveformEntry } from "./waveformCache";

/** What the one button beside the analysis does, if there is one. */
type WaveformAnalysisAction = "pause" | "resume" | "start" | null;

/** What Settings' preview says with nothing in the player (WAVE-05). */
export const PREVIEW_EMPTY_WORDS = "Play a track to preview its waveform here.";

/**
 * The status of an analysis with nothing to analyze (SET-6). Settings adds a
 * link to the Clean page after it; Clean's Health view says it as it is.
 */
export const NOTHING_TO_ANALYZE_WORDS =
  "Nothing to analyze yet: CuePoint analyzes tracks once their files have been found.";

/** The sentence a build without a decoder shows instead of a state. */
export const DECODER_MISSING_WORDS =
  "This version of CuePoint can't draw waveforms.";

function count(value: number): string {
  return value.toLocaleString();
}

/** One line: what the analysis is doing, and how far it has got. */
export function analysisWords(status: WaveformAnalysisStatus): string {
  const done = status.analysed + status.failed;
  const unreadable = status.failed > 0 ? ` · ${count(status.failed)} could not be read` : "";
  switch (status.state) {
    case "unavailable":
      return DECODER_MISSING_WORDS;
    case "paused":
      return status.remaining > 0
        ? `Paused · ${count(status.remaining)} to go`
        : `Paused · all ${count(status.present)} analyzed${unreadable}`;
    case "running": {
      const left =
        typeof status.eta_seconds === "number" && status.eta_seconds > 0
          ? ` · ${aboutDuration(status.eta_seconds)} left`
          : "";
      return `Analyzing · ${count(done)} of ${count(status.present)}${left}`;
    }
    case "idle":
    default:
      if (status.present === 0) return NOTHING_TO_ANALYZE_WORDS;
      if (status.remaining > 0) {
        return (
          `${count(done)} of ${count(status.present)} analyzed` +
          ` · ${count(status.remaining)} waiting`
        );
      }
      return `All ${count(status.present)} analyzed${unreadable}`;
  }
}

/** The action the analysis's one button offers in this state. */
export function analysisAction(status: WaveformAnalysisStatus): WaveformAnalysisAction {
  switch (status.state) {
    case "running":
      return "pause";
    case "paused":
      return "resume";
    case "idle":
      return "start";
    default:
      return null;
  }
}

/** The button's words for an action. */
export const ACTION_LABELS: Record<Exclude<WaveformAnalysisAction, null>, string> = {
  pause: "Pause",
  resume: "Resume",
  start: "Analyze waveforms",
};

/** What a file the decoder could not read says, whatever the code. */
export const UNREADABLE_WORDS = "This file could not be read.";

/**
 * The sentence for each reason code a failed analysis stores (BAR-7). A code
 * the engine adds later, or one this build does not know, reads as the generic
 * sentence; the code itself is never shown.
 */
export const FAILURE_WORDS: Readonly<Record<string, string>> = {
  undecodable: "This file's audio could not be read.",
  no_audio: "This file has no audio to draw.",
  timeout: "This file took too long to read.",
};

function failedWords(reason: string | null | undefined): string {
  return (reason !== null && reason !== undefined && Object.hasOwn(FAILURE_WORDS, reason)
    ? FAILURE_WORDS[reason]
    : undefined) ?? UNREADABLE_WORDS;
}

/**
 * Why a track shows no waveform, in words; empty for a ready one.
 *
 * A waiting track waits for a paused analysis when it is paused, and says so
 * rather than "Waiting" (WAVE-05). A missing file's reason is the file check's.
 */
export function waveformStateWords(
  track: Pick<WaveformTrack, "state" | "reason">,
  paused: boolean,
): string {
  switch (track.state) {
    case "ready":
      return "";
    case "waiting":
      return paused ? "Analysis paused" : "Waveform not drawn yet";
    case "failed":
      return failedWords(track.reason);
    case "missing":
      switch (track.reason) {
        case "no_path":
          return "No file for this track";
        case "unreadable":
          return "File could not be opened";
        case "root_unavailable":
          return "The drive or folder holding this file is not available";
        default:
          return "File missing";
      }
    case "unchecked":
      return "Not checked yet";
    case "unavailable":
    default:
      return DECODER_MISSING_WORDS;
  }
}

/**
 * A track's state as one word, for a cell of the Library's "Waveform" column
 * (WAVE-06); empty for a ready one. The cell's title says it in full.
 */
export function waveformStateWord(
  track: Pick<WaveformTrack, "state" | "reason">,
  paused: boolean,
): string {
  switch (track.state) {
    case "ready":
      return "";
    case "waiting":
      return paused ? "Paused" : "Waiting";
    case "failed":
      return "Unreadable";
    case "missing":
      return "Missing";
    case "unchecked":
      return "Unchecked";
    case "unavailable":
    default:
      return "Unavailable";
  }
}

/** The Inspector's title over a waveform that is a picture only (WAVE-06). */
export const INSPECTOR_PICTURE_TITLE = "The track's waveform. Play the track to seek in it here.";

/** The Inspector's title over the playing track's waveform. */
export const INSPECTOR_SEEK_TITLE = "Click to seek";

/** The words a view shows for an answer that loads, while it loads. */
export const WAVEFORM_LOADING_WORDS = "Reading its waveform…";

/**
 * Why an answer draws no picture, in words (WAVE-06); null when it draws one,
 * and while it loads, which each view says its own way.
 */
export function waveformEntryWords(entry: WaveformEntry | null | undefined): string | null {
  if (!entry || entry.kind === "loading") return null;
  if (entry.kind === "unknown") return "This track is no longer in the library";
  if (entry.kind === "error") return `Its waveform could not be read: ${entry.message}`;
  if (entry.track.state === "ready" && entry.track.data) return null;
  return waveformStateWords(entry.track, entry.paused) || "No waveform yet";
}

/** A size on disk in words: bytes, KB, MB or GB, one decimal above a kilobyte. */
export function sizeWords(bytes: number): string {
  if (!(bytes >= 1024)) return `${Math.max(0, Math.round(bytes)).toLocaleString()} bytes`;
  const units = ["KB", "MB", "GB"] as const;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/**
 * What "Delete waveform data…" asks before it deletes (WAVE-05): the size on
 * disk, the loudness measured with each waveform going with it (WAVE-08), and
 * that the whole library will be analyzed again, with how long that takes when
 * the analysis has a rate to say it by.
 */
export function deleteDataWords(status: WaveformAnalysisStatus | null): string[] {
  const size = status ? sizeWords(status.store_bytes) : "an unknown amount";
  const lines = [
    `This deletes every waveform CuePoint has made, and the loudness measured with each, ${size} on disk. Cue points and beat grids come from Rekordbox and are not affected.`,
  ];
  if (status?.state === "unavailable") {
    lines.push("Waveforms cannot be made again until this build has the player's decoder.");
  } else if (status?.paused) {
    lines.push("The whole library will be analyzed again when the analysis is resumed.");
  } else {
    const rate = status?.rate_per_hour;
    const present = status?.present ?? 0;
    const time =
      typeof rate === "number" && rate > 0 && present > 0
        ? `, which takes ${aboutDuration((present / rate) * 3600)} at the current rate`
        : "";
    lines.push(`The whole library will be analyzed again${time}.`);
  }
  return lines;
}

/** What a deletion did, in one line. */
export function deletedWords(waveforms: number, freedBytes: number): string {
  if (waveforms === 0) return "There was no waveform data to delete.";
  return `Deleted ${count(waveforms)} ${waveforms === 1 ? "waveform" : "waveforms"}, freeing ${sizeWords(freedBytes)}.`;
}

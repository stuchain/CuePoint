/**
 * A track's loudness in words and numbers (WAVE-08, DEC-124).
 *
 * Every place that shows a loudness reads it from here: the Inspector's line,
 * the Library's "Loudness" column and its copy, and Prepare's transition strip.
 * Pure, so each format is tested once.
 *
 * - **One decimal, a true minus sign:** "−8.4 LUFS", "Peak −0.3 dBFS". The
 *   meter reports tenths; nothing here pretends to more.
 * - **A difference in LU,** signed: "+2.1 LU", "−2.1 LU", "0.0 LU".
 * - **Shown, never applied:** nothing here changes what is played.
 */
import type { WaveformLoudness, WaveformTrack } from "../../api/cuepointBridge.types";
import type { WaveformEntry } from "./waveformCache";

/** A ready waveform whose loudness is still to be measured. */
export const LOUDNESS_PENDING_WORDS = "Loudness is measured with the next analysis";

/** Below the meter's floor: silence, or shorter than one 400 ms block. */
export const LOUDNESS_TOO_QUIET_WORDS = "Too quiet or too short to measure";

/** Not one sample above zero. */
export const LOUDNESS_SILENT_WORDS = "Silent";

/** The decoder's log held no reading for this file. */
export const LOUDNESS_NOT_MEASURED_WORDS = "Loudness could not be measured";

const MINUS = "−";

/** One decimal with a true minus sign; never "−0.0". */
export function signedTenths(value: number, plus = false): string {
  const tenths = Math.round(value * 10);
  if (tenths === 0) return "0.0";
  const text = (Math.abs(tenths) / 10).toFixed(1);
  if (tenths < 0) return `${MINUS}${text}`;
  return plus ? `+${text}` : text;
}

/** "−8.4 LUFS". */
export function formatLufs(value: number): string {
  return `${signedTenths(value)} LUFS`;
}

/** "Peak −0.3 dBFS". */
export function formatPeak(value: number): string {
  return `Peak ${signedTenths(value)} dBFS`;
}

/**
 * How much louder the next track sits than the one before it, in LU:
 * "+2.1 LU", "−2.1 LU", or "0.0 LU". Null unless both have a value.
 */
export function loudnessDifference(
  from: WaveformLoudness | null | undefined,
  to: WaveformLoudness | null | undefined,
): string | null {
  const a = from?.integrated_lufs;
  const b = to?.integrated_lufs;
  if (typeof a !== "number" || typeof b !== "number") return null;
  // From the shown tenths, so the difference agrees with the two values shown.
  const tenths = Math.round(b * 10) - Math.round(a * 10);
  return `${signedTenths(tenths / 10, true)} LU`;
}

/** Why a measured track has no value, in words; null when it has one. */
function loudnessReasonWords(loudness: WaveformLoudness): string | null {
  switch (loudness.reason) {
    case null:
      return null;
    case "too_quiet":
      return LOUDNESS_TOO_QUIET_WORDS;
    case "silent":
      return LOUDNESS_SILENT_WORDS;
    case "not_measured":
    default:
      return LOUDNESS_NOT_MEASURED_WORDS;
  }
}

/** A ready track's loudness, or null for a track with no waveform yet. */
function readyLoudness(
  track: Pick<WaveformTrack, "state" | "loudness"> | null | undefined,
): WaveformLoudness | null | undefined {
  if (!track || track.state !== "ready") return undefined;
  return track.loudness;
}

/**
 * The Inspector's line under the waveform: "Loudness −8.4 LUFS · Peak −0.3
 * dBFS", or why there is no value. Null for a track with no waveform, whose
 * box already says why.
 */
export function loudnessLine(
  track: Pick<WaveformTrack, "state" | "loudness"> | null | undefined,
): string | null {
  const loudness = readyLoudness(track);
  if (loudness === undefined) return null;
  if (loudness === null) return LOUDNESS_PENDING_WORDS;
  const peak = typeof loudness.peak_dbfs === "number" ? formatPeak(loudness.peak_dbfs) : null;
  const value =
    typeof loudness.integrated_lufs === "number"
      ? `Loudness ${formatLufs(loudness.integrated_lufs)}`
      : loudnessReasonWords(loudness);
  return [value, peak].filter(Boolean).join(" · ");
}

/** What a Library cell shows: the number alone, or one muted word. */
interface LoudnessCell {
  /** "−8.4", or a word such as "Silent"; empty when there is nothing to say. */
  text: string;
  /** Whether `text` is a value rather than a word. */
  value: boolean;
  /** The cell's title: the line in full, or why it is empty. */
  title: string | null;
}

/** One cell of the Library's "Loudness" column. */
export function loudnessCell(entry: WaveformEntry | null | undefined): LoudnessCell {
  const track = entry?.kind === "track" ? entry.track : null;
  const loudness = readyLoudness(track);
  if (loudness === undefined || loudness === null) {
    return { text: "", value: false, title: loudness === null ? LOUDNESS_PENDING_WORDS : null };
  }
  const title = loudnessLine(track);
  if (typeof loudness.integrated_lufs === "number") {
    return { text: signedTenths(loudness.integrated_lufs), value: true, title };
  }
  const word = loudness.reason === "silent" ? "Silent" : loudness.reason === "too_quiet" ? "Quiet" : "";
  return { text: word, value: false, title };
}

/** A cell's text in a copy: "−8.4 LUFS", the words for a reason, or empty. */
export function loudnessCopyText(entry: WaveformEntry | null | undefined): string {
  const track = entry?.kind === "track" ? entry.track : null;
  const loudness = readyLoudness(track);
  if (!loudness) return "";
  if (typeof loudness.integrated_lufs === "number") return formatLufs(loudness.integrated_lufs);
  return loudnessReasonWords(loudness) ?? "";
}

/** A short form for a strip's title: "−8.4 LUFS", or null without a value. */
export function loudnessShort(
  track: Pick<WaveformTrack, "state" | "loudness"> | null | undefined,
): string | null {
  const loudness = readyLoudness(track);
  return typeof loudness?.integrated_lufs === "number" ? formatLufs(loudness.integrated_lufs) : null;
}

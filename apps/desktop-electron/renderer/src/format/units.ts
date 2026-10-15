/**
 * One way to write each number with a unit (consistency area 47): a match score, a change of
 * tempo, a missing BPM, a file size, loudness and tempo.
 */
import { formatBpm } from "../components/format/bpm";
import { formatLufs } from "../components/waveform/loudnessWords";
import { formatCount } from "./counts";

export { formatBpm, formatLufs };

const MINUS = "−";

/** What a track with no tempo says, wherever it says so. */
export const NO_BPM = "No BPM";

/** "128 BPM", or "No BPM" when the tempo is missing. */
export function formatBpmText(bpm: number | null | undefined): string {
  const text = formatBpm(bpm);
  return text ? `${text} BPM` : NO_BPM;
}

/** A matcher score as a percent: "86%". */
export function formatMatchScore(score: number | null | undefined): string {
  if (score === null || score === undefined || !Number.isFinite(score)) return "";
  return `${Math.round(score)}%`;
}

/** A change of tempo as a percent with a true minus: "+2.8%", "−12.9%", "0%". */
export function formatTempoPercent(percent: number): string {
  const rounded = Math.round(Math.abs(percent) * 10) / 10;
  if (rounded === 0) return "0%";
  return `${percent > 0 ? "+" : MINUS}${rounded}%`;
}

/** The change of tempo from one BPM to the next, or "" when either is unknown. */
export function formatTempoChange(
  from: number | null | undefined,
  to: number | null | undefined,
): string {
  if (!from || !to || from <= 0 || to <= 0) return "";
  return formatTempoPercent(((to - from) / from) * 100);
}

/**
 * A size on disk: "512 bytes", "3.4 KB", "12.5 MB", "1.2 GB". When `other` is a different
 * size that would round to the same text, the exact bytes are shown instead, so two sizes
 * never read as "no change" beside a warning saying there was one.
 */
export function formatFileSize(bytes: number, other?: number | null, locale?: string): string {
  const exact = `${formatCount(Math.max(0, Math.round(bytes)), locale)} bytes`;
  if (!(bytes >= 1024)) return exact;
  const rounded = (value: number) => {
    const units = ["KB", "MB", "GB"] as const;
    let size = value / 1024;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    return `${size.toFixed(1)} ${units[unit]}`;
  };
  if (other != null && other !== bytes && rounded(other) === rounded(bytes)) return exact;
  return rounded(bytes);
}

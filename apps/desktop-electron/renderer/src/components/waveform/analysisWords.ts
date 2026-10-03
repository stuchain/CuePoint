/**
 * The waveform analysis in words (WAVE-03).
 *
 * Pure, so the sentences are tested once and every place that shows the
 * analysis — the Health view now, Settings in WAVE-05 — says the same thing.
 * The analysis is never shown as an error: a build without the player's
 * decoder says once, in words, why there are no waveforms (fact 2).
 */
import type { WaveformAnalysisStatus } from "../../api/cuepointBridge.types";
import { aboutDuration } from "../shell/useActiveJob";

/** What the one button beside the analysis does, if there is one. */
export type WaveformAnalysisAction = "pause" | "resume" | "start" | null;

/** The sentence a build without a decoder shows instead of a state. */
export const DECODER_MISSING_WORDS =
  "Waveforms need the player's decoder, which this build does not include";

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
        : `Paused · all ${count(status.present)} analysed${unreadable}`;
    case "running": {
      const left =
        typeof status.eta_seconds === "number" && status.eta_seconds > 0
          ? ` · ${aboutDuration(status.eta_seconds)} left`
          : "";
      return `Analysing · ${count(done)} of ${count(status.present)}${left}`;
    }
    case "idle":
    default:
      if (status.present === 0) return "No checked files to analyse yet";
      if (status.remaining > 0) {
        return (
          `${count(done)} of ${count(status.present)} analysed` +
          ` · ${count(status.remaining)} waiting`
        );
      }
      return `All ${count(status.present)} analysed${unreadable}`;
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
  start: "Analyse waveforms",
};

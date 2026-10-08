/**
 * The transition strip: the selected entry beside the next (WAVE-07, DEC-120).
 *
 * Under the Set's header, where the lanes are, and opened the same way. One
 * row of titles, each with its entry's planned times in words; under them two
 * waveforms two rows tall, each the whole track with its cues, shaded before
 * its planned in and after its planned out (DEC-107). Between them, in words,
 * how the one goes out and the next comes in. `transitionStrip.ts` decides
 * every word.
 *
 * "Rows" are the Set table's own: the strip reads the height the table lays
 * its rows out at, so it costs the Set three rows at every scale.
 *
 * Clicking a half selects its entry, as clicking a lane's column does, so the
 * strip walks the Set one transition at a time. Both tracks shown are put
 * first in the analysis while they wait for it, as the Inspector's is.
 *
 * **The caption** (FLW-19) sits between the halves over the strip's whole
 * height: the keys and how they relate, the tempos, the planned times and the
 * loudness difference, with a warning on the transition as a sentence at its
 * end and Accept beside it. It takes the strip's own height, so a warning grows
 * the strip by nothing.
 *
 * Loudness (WAVE-08, DEC-124): each title ends with its track's, and the words
 * between the halves gain the difference, "+2.1 LU", when both are measured.
 * Read without pictures for the two tracks, so a title and the words agree
 * whatever each half has drawn. Shown, never applied.
 */
import { useMemo } from "react";

import type {
  SetEntry,
  SetShape,
  SetWarning,
  WaveformAnalysisStatus,
  WaveformLoudness,
} from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { readRowHeight } from "../../components/table/trackTableLayout";
import {
  WAVEFORM_LOADING_WORDS,
  waitingWaveformShort,
  waitingWaveformWords,
  waveformEntryWords,
} from "../../components/waveform/analysisWords";
import { loudnessDifference, loudnessShort, loudnessUnitsTitle } from "../../components/waveform/loudnessWords";
import { useWaveformAnalysis } from "../../components/waveform/useWaveformAnalysis";
import { useWaveform, useWaveforms } from "../../components/waveform/useWaveforms";
import { useWaveformRequest } from "../../components/waveform/useWaveformRequest";
import { WaveformCanvas } from "../../components/waveform/WaveformCanvas";
import type { WaveformEntry } from "../../components/waveform/waveformCache";
import { useWaveformBox } from "../../components/waveform/waveformEnvironment";
import { useScaleFactor } from "../../tokens/ScaleContext";
import { describeSetWarning, isAcknowledgeable } from "./setWarnings";
import {
  END_OF_SET,
  NO_SELECTION_WORDS,
  captionSegments,
  stripWarningWords,
  halfTimesWords,
  shadedTimes,
  transitionOf,
  type TransitionHalf,
} from "./transitionStrip";

interface SetTransitionProps {
  /** The running order, as the table shows it. */
  entries: readonly SetEntry[];
  selectedEntryId: number | null;
  onSelect: (entryId: number) => void;
  /** Opens where the analysis can be followed: a waiting waveform links there (PRP-12). */
  onSeeProgress?: () => void;
  /** The Set's tempo and key, entry by entry: the caption's keys and tempos (FLW-19). */
  shape?: SetShape | null;
  /** The warnings on the transition shown: the selected entry into the next. */
  warnings?: readonly SetWarning[];
  /** Accept a warning, or take the acceptance back. */
  onAccept?: (warning: SetWarning, accept: boolean) => void;
}

interface HalfProps {
  half: TransitionHalf;
  side: "from" | "to";
  onSelect: (entryId: number) => void;
  analysis: WaveformAnalysisStatus | null;
  onSeeProgress?: () => void;
}

function Half({ half, side, onSelect, analysis, onSeeProgress }: HalfProps) {
  const { box, width } = useWaveformBox<HTMLButtonElement>();
  const entry = useWaveform(half.trackId, width, { marks: true, loudness: true });
  useWaveformRequest(half.trackId, entry, { loudness: true });

  const track = entry?.kind === "track" ? entry.track : null;
  const picture = track?.state === "ready" ? track.data : null;
  // A waveform waiting for the analysis says how far it is, in place, and
  // links to where it is followed (PRP-12).
  const waiting = track?.state === "waiting" && analysis?.state !== "unavailable";
  const waitingState = !picture && track?.state === "waiting";
  // The half is narrow: it says the short words, and the sentence is its title.
  const words = picture
    ? null
    : waitingState
      ? waitingWaveformShort(analysis)
      : (waveformEntryWords(entry) ?? WAVEFORM_LOADING_WORDS);
  const sentence = waitingState ? waitingWaveformWords(analysis) : words;
  const { inMs, outMs } = shadedTimes(half);

  return (
    <div className="prepare-transition__cell">
      <button
        ref={box}
        type="button"
        className="prepare-transition__half"
        data-testid={`transition-${side}`}
        data-entry={half.entryId}
        aria-label={`${half.title}, ${halfTimesWords(half)}`}
        title={sentence ?? `Select “${half.title}”`}
        onClick={() => onSelect(half.entryId)}
      >
        {picture ? (
          <WaveformCanvas
            data={picture}
            durationMs={track?.duration_ms ?? 0}
            cues={track?.marks?.cues}
            inMs={inMs}
            outMs={outMs}
          />
        ) : (
          <span className="prepare-transition__state">{words}</span>
        )}
      </button>
      {waiting && onSeeProgress && (
        <button type="button" className="prepare-link prepare-link--inline prepare-transition__progress" onClick={onSeeProgress}>
          See progress
        </button>
      )}
    </div>
  );
}

/** A ready track's loudness from its answer; null when it has none to read. */
function loudnessOf(entry: WaveformEntry | undefined): WaveformLoudness | null {
  return entry?.kind === "track" && entry.track.state === "ready" ? entry.track.loudness : null;
}

function Title({ half, entry }: { half: TransitionHalf; entry: WaveformEntry | undefined }) {
  const track = entry?.kind === "track" ? entry.track : null;
  const loudness = loudnessShort(track);
  const said = [halfTimesWords(half), loudness].filter(Boolean).join(" · ");
  return (
    // Its title holds all of it, for a pane too narrow to show it whole.
    <p className="prepare-transition__title" title={`${half.title}, ${said}`}>
      <span className="prepare-transition__name">{half.title}</span>{" "}
      <span className="prepare-transition__times">
        {halfTimesWords(half)}
        {/* The times' line ends with the loudness, so the title stays two lines. */}
        {loudness ? (
          <span
            className="prepare-transition__loudness"
            data-testid="transition-loudness"
            title={loudnessUnitsTitle(null)}
          >
            {` · ${loudness}`}
          </span>
        ) : null}
      </span>
    </p>
  );
}

export function SetTransition({
  entries,
  selectedEntryId,
  onSelect,
  onSeeProgress,
  shape = null,
  warnings = [],
  onAccept,
}: SetTransitionProps) {
  const { status: analysis } = useWaveformAnalysis();
  const transition = transitionOf(entries, selectedEntryId);
  const scale = useScaleFactor();
  // As the table reads it, and when: the row height derives from the scale.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const rowHeight = useMemo(() => readRowHeight(), [scale]);
  const trackIds = transition
    ? transition.to
      ? [transition.from.trackId, transition.to.trackId]
      : [transition.from.trackId]
    : [];
  const numbers = useWaveforms(trackIds, null, { loudness: true });
  const fromEntry = transition ? numbers.get(transition.from.trackId) : undefined;
  const toEntry = transition?.to ? numbers.get(transition.to.trackId) : undefined;
  const difference = loudnessDifference(loudnessOf(fromEntry), loudnessOf(toEntry));

  return (
    <section
      className="prepare-transition"
      aria-label="Transition"
      style={{ gridTemplateRows: `${rowHeight}px ${rowHeight * 2}px` }}
    >
      {transition ? (
        <>
          <Title half={transition.from} entry={fromEntry} />
          {transition.to ? <Title half={transition.to} entry={toEntry} /> : <span aria-hidden="true" />}
          <Half
            key={transition.from.entryId}
            half={transition.from}
            side="from"
            onSelect={onSelect}
            analysis={analysis}
            onSeeProgress={onSeeProgress}
          />
          <div className="prepare-transition__caption" data-testid="transition-caption">
            <p
              className="prepare-transition__words"
              data-testid="transition-words"
              title={loudnessUnitsTitle(difference)}
            >
              {captionSegments(transition, shape, difference, warnings).map((segment, index) => (
                <span key={segment + index} className="prepare-transition__piece">
                  {index > 0 && <span aria-hidden="true">{" · "}</span>}
                  <span className="prepare-transition__segment" title={segment}>
                    {segment}
                  </span>
                </span>
              ))}
            </p>
            {warnings.filter(isAcknowledgeable).map((warning) => {
              const sentence = `${describeSetWarning(warning)}${warning.acknowledged ? " (accepted)" : ""}`;
              return (
                <p
                  key={`${warning.kind}-${warning.detail}`}
                  className={`prepare-transition__warning${warning.acknowledged ? " prepare-transition__warning--accepted" : ""}`}
                  data-testid="transition-warning"
                >
                  <span className="prepare-transition__sentence" title={sentence}>
                    {`${stripWarningWords(warning)}${warning.acknowledged ? " (accepted)" : ""}`}
                  </span>
                  {onAccept && (
                    <Button
                      variant="secondary"
                      className="prepare-transition__accept"
                      onClick={() => onAccept(warning, !warning.acknowledged)}
                    >
                      {warning.acknowledged ? "Undo accept" : "Accept"}
                    </Button>
                  )}
                </p>
              );
            })}
          </div>
          {transition.to ? (
            <Half
              key={transition.to.entryId}
              half={transition.to}
              side="to"
              onSelect={onSelect}
              analysis={analysis}
              onSeeProgress={onSeeProgress}
            />
          ) : (
            <p className="prepare-transition__end" data-testid="transition-to">
              {END_OF_SET}
            </p>
          )}
        </>
      ) : (
        <p className="prepare-transition__none">{NO_SELECTION_WORDS}</p>
      )}
    </section>
  );
}

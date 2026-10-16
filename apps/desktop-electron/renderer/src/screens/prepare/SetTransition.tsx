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
 * **The caption** (FLW-19, C15d) sits between the halves over the strip's whole
 * height: the keys, drawn as chips (R4-2), and how they relate and the tempo change, with the one main
 * warning on the transition at its end, Accept beside it and any others as
 * "+N more" in a title. The planned times are the halves' titles'; the whole
 * tempos and the loudness difference are the caption's title's. It takes the
 * strip's own height, so a warning grows the strip by nothing.
 *
 * Loudness (WAVE-08, DEC-124): each title ends with its track's, and the words
 * between the halves have the difference, "+2.1 LU", in their title when both are measured.
 * Read without pictures for the two tracks, so a title and the words agree
 * whatever each half has drawn. Shown, never applied.
 */

import type {
  SetEntry,
  SetShape,
  SetWarning,
  WaveformAnalysisStatus,
  WaveformLoudness,
} from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { KeyChip } from "../../components/wheel/KeyChip";
import { useRowHeight } from "../../components/table/trackTableLayout";
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
import { describeSetWarning } from "./setWarnings";
import {
  END_OF_SET,
  KEYS_CLASH,
  NO_BEATPORT_KEY,
  NO_BEATPORT_KEY_DETAIL,
  NO_SELECTION_WORDS,
  captionDetail,
  captionKeys,
  captionSegments,
  mainWarning,
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
        data-hint={sentence ?? `Select “${half.title}”`}
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

/** A warning's whole sentence, for a title. */
const describeShown = (warning: SetWarning) =>
  `${describeSetWarning(warning)}${warning.acknowledged ? " (OK)" : ""}`;

function Title({ half, entry }: { half: TransitionHalf; entry: WaveformEntry | undefined }) {
  const track = entry?.kind === "track" ? entry.track : null;
  const loudness = loudnessShort(track);
  const said = [halfTimesWords(half), loudness].filter(Boolean).join(" · ");
  return (
    // Its hint holds all of it, for a pane too narrow to show it whole.
    <p className="prepare-transition__title" data-hint={`${half.title}, ${said}`}>
      <span className="prepare-transition__name">{half.title}</span>{" "}
      <span className="prepare-transition__times">
        {halfTimesWords(half)}
        {/* The times' line ends with the loudness, so the title stays two lines. */}
        {loudness ? (
          <span
            className="prepare-transition__loudness"
            data-testid="transition-loudness"
            data-hint={loudnessUnitsTitle(null)}
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
  // As the table reads it, and when: the row height derives from the size and the row density.
  const rowHeight = useRowHeight();
  const trackIds = transition
    ? transition.to
      ? [transition.from.trackId, transition.to.trackId]
      : [transition.from.trackId]
    : [];
  const numbers = useWaveforms(trackIds, null, { loudness: true });
  const fromEntry = transition ? numbers.get(transition.from.trackId) : undefined;
  const toEntry = transition?.to ? numbers.get(transition.to.trackId) : undefined;
  const difference = loudnessDifference(loudnessOf(fromEntry), loudnessOf(toEntry));
  const { shown, others } = mainWarning(warnings);
  const segments = transition ? captionSegments(transition, shape) : [];
  const keys = transition ? captionKeys(transition, shape) : null;
  // The whole tempos and the loudness difference are the caption's title's (C15d).
  const tempos = transition ? captionDetail(transition, shape) : null;
  const captionTitle = [tempos, loudnessUnitsTitle(difference)].filter(Boolean).join(". ");

  return (
    <section
      className="prepare-transition"
      aria-label="Transition"
      style={{ gridTemplateRows: `max(${rowHeight}px, calc(2.3 * var(--font-size-xs))) ${rowHeight * 2}px` }}
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
          <div className="prepare-transition__caption" data-testid="transition-caption" data-hint={captionTitle}>
            {segments.length > 0 && (
              <p className="prepare-transition__words" data-testid="transition-words">
                {segments.map((segment, index) => (
                  <span
                    key={segment + index}
                    className={`prepare-transition__piece${segment === KEYS_CLASH ? " prepare-transition__piece--warning" : ""}`}
                  >
                    {index > 0 && <span aria-hidden="true">{" · "}</span>}
                    <span className="prepare-transition__segment" data-hint={segment === NO_BEATPORT_KEY ? NO_BEATPORT_KEY_DETAIL : segment}>
                      {keys && index === 0 ? (
                        <>
                          <KeyChip value={keys.from} />
                          {" → "}
                          <KeyChip value={keys.to} />
                        </>
                      ) : (
                        segment
                      )}
                    </span>
                  </span>
                ))}
              </p>
            )}
            {shown && (
              <p
                className={`prepare-transition__warning${shown.acknowledged ? " prepare-transition__warning--accepted" : ""}`}
                data-testid="transition-warning"
              >
                <span className="prepare-transition__sentence" data-hint={describeShown(shown)}>
                  {`${stripWarningWords(shown)}${shown.acknowledged ? " (OK)" : ""}`}
                </span>
                {onAccept && (
                  <Button
                    variant="secondary"
                    className="prepare-transition__accept"
                    onClick={() => onAccept(shown, !shown.acknowledged)}
                  >
                    {shown.acknowledged ? "Undo Mark OK" : "Mark OK"}
                  </Button>
                )}
                {others.length > 0 && (
                  <span className="prepare-transition__more" data-hint={others.map(describeShown).join(". ")}>
                    {`+${others.length.toLocaleString()} more`}
                  </span>
                )}
              </p>
            )}
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

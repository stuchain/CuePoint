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
 * Loudness (WAVE-08, DEC-124): each title ends with its track's, and the words
 * between the halves gain the difference, "+2.1 LU", when both are measured.
 * Read without pictures for the two tracks, so a title and the words agree
 * whatever each half has drawn. Shown, never applied.
 */
import { useMemo } from "react";

import type { SetEntry, WaveformLoudness } from "../../api/cuepointBridge.types";
import { readRowHeight } from "../../components/table/trackTableLayout";
import { WAVEFORM_LOADING_WORDS, waveformEntryWords } from "../../components/waveform/analysisWords";
import { loudnessDifference, loudnessShort } from "../../components/waveform/loudnessWords";
import { useWaveform, useWaveforms } from "../../components/waveform/useWaveforms";
import { useWaveformRequest } from "../../components/waveform/useWaveformRequest";
import { WaveformCanvas } from "../../components/waveform/WaveformCanvas";
import type { WaveformEntry } from "../../components/waveform/waveformCache";
import { useWaveformBox } from "../../components/waveform/waveformEnvironment";
import { useScaleFactor } from "../../tokens/ScaleContext";
import {
  END_OF_SET,
  NO_SELECTION_WORDS,
  halfTimesWords,
  shadedTimes,
  transitionOf,
  transitionWords,
  type TransitionHalf,
} from "./transitionStrip";

export interface SetTransitionProps {
  /** The running order, as the table shows it. */
  entries: readonly SetEntry[];
  selectedEntryId: number | null;
  onSelect: (entryId: number) => void;
}

function Half({ half, side, onSelect }: { half: TransitionHalf; side: "from" | "to"; onSelect: (entryId: number) => void }) {
  const { box, width } = useWaveformBox<HTMLButtonElement>();
  const entry = useWaveform(half.trackId, width, { marks: true, loudness: true });
  useWaveformRequest(half.trackId, entry, { loudness: true });

  const track = entry?.kind === "track" ? entry.track : null;
  const picture = track?.state === "ready" ? track.data : null;
  const words = picture ? null : (waveformEntryWords(entry) ?? WAVEFORM_LOADING_WORDS);
  const { inMs, outMs } = shadedTimes(half);

  return (
    <button
      ref={box}
      type="button"
      className="prepare-transition__half"
      data-testid={`transition-${side}`}
      data-entry={half.entryId}
      aria-label={`${half.title}, ${halfTimesWords(half)}`}
      title={words ?? `Select “${half.title}”`}
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
          <span className="prepare-transition__loudness" data-testid="transition-loudness">
            {` · ${loudness}`}
          </span>
        ) : null}
      </span>
    </p>
  );
}

export function SetTransition({ entries, selectedEntryId, onSelect }: SetTransitionProps) {
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
          <span aria-hidden="true" />
          {transition.to ? <Title half={transition.to} entry={toEntry} /> : <span aria-hidden="true" />}
          <Half key={transition.from.entryId} half={transition.from} side="from" onSelect={onSelect} />
          <p className="prepare-transition__words" data-testid="transition-words">
            {transitionWords(transition, difference).map((part, index) => (
              <span key={part + index}>
                {index > 0 && " "}
                {part}
              </span>
            ))}
          </p>
          {transition.to ? (
            <Half key={transition.to.entryId} half={transition.to} side="to" onSelect={onSelect} />
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

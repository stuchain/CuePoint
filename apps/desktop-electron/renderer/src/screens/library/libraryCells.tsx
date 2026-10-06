/**
 * Cells that draw more than a value (CLEAN-13).
 *
 * An overridden value carries a small marker whose tooltip names its source,
 * and the artwork column draws a thumbnail through CLEAN-09's guarded route.
 * The waveform column draws each row's waveform (WAVE-06), and the loudness
 * column says each row's loudness (WAVE-08).
 */
import { useEffect, useState } from "react";

import type { LibraryTrackRow, OverrideField } from "../../api/cuepointBridge.types";
import { waveformEntryWords, waveformStateWord } from "../../components/waveform/analysisWords";
import { loudnessCell } from "../../components/waveform/loudnessWords";
import { useWaveform } from "../../components/waveform/useWaveforms";
import { WaveformCanvas } from "../../components/waveform/WaveformCanvas";
import type { WaveformEntry } from "../../components/waveform/waveformCache";
import { useWaveformBox } from "../../components/waveform/waveformEnvironment";
import { useSettled } from "../../components/waveform/waveformSettle";
import { artworkText, effectiveText, overrideMark } from "./libraryClean";
import { LOUDNESS_QUERY } from "./libraryLoudness";

/** A value CuePoint may override, marked when it does. */
export function OverriddenValue({ row, field }: { row: LibraryTrackRow; field: OverrideField }) {
  const value = effectiveText(row, field);
  const mark = overrideMark(row, field);
  if (!mark) return <>{value}</>;
  return (
    <span className="library-cell__overridden" title={mark.title}>
      {value}
      <span
        className={`library-cell__mark library-cell__mark--${mark.source ?? "cuepoint"}`}
        aria-label={mark.title}
        role="img"
      >
        {mark.source === "beatport" ? "B" : "•"}
      </span>
    </span>
  );
}

// ------------------------------------------------------------- artwork

/**
 * How many thumbnails are asked for at once.
 *
 * A table scrolled quickly mounts a hundred rows; each asks the engine to read
 * and shrink a picture. A few at a time keeps the rest of the app answered.
 */
export const ARTWORK_CONCURRENCY = 4;

let active = 0;
const waiting: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < ARTWORK_CONCURRENCY) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function release(): void {
  const next = waiting.shift();
  if (next) next();
  else active -= 1;
}

/**
 * A row's thumbnail, asked for only when the row says there is one to show.
 *
 * The URL holds the picture in memory, so it is released when the row leaves
 * the table — and a request that answers after that releases what it made.
 */
export function RowArtwork({ row }: { row: LibraryTrackRow }) {
  const [url, setUrl] = useState<string | null>(null);
  const shown = row.artwork === "embedded" || row.artwork === "beatport";
  const trackId = row.id;

  useEffect(() => {
    const bridge = window.cuepoint;
    if (!shown || trackId == null || !bridge?.getTrackArtwork) return;
    let cancelled = false;
    let made: string | null = null;
    void acquire().then(async () => {
      try {
        if (cancelled) return;
        const object = await bridge.getTrackArtwork!({ trackId, size: "row" });
        if (cancelled) {
          if (object) bridge.releaseTrackArtwork?.(object);
          return;
        }
        made = object;
        setUrl(object);
      } catch {
        // No picture is what a failed read shows: the column is a convenience.
      } finally {
        release();
      }
    });
    return () => {
      cancelled = true;
      if (made) bridge.releaseTrackArtwork?.(made);
      setUrl(null);
    };
  }, [shown, trackId]);

  if (url) {
    return <img className="library-cell__artwork" src={url} alt={artworkText(row.artwork)} />;
  }
  return <span className="library-cell__artwork-none">{shown ? "" : artworkText(row.artwork)}</span>;
}

// ------------------------------------------------------------- waveform

/** The one muted word a cell without a picture shows; empty while it loads. */
function waveformWord(entry: WaveformEntry | null): string {
  if (!entry || entry.kind === "loading" || entry.kind === "unknown") return "";
  if (entry.kind === "error") return "Error";
  return waveformStateWord(entry.track, entry.paused);
}

/**
 * A row's waveform, at the cell's width (WAVE-06).
 *
 * The picture asked for is the cell's columns rounded up to a multiple of 16,
 * so dragging the column wider asks again every 16 columns, and every row of
 * the column asks at one width, in one batch. A row asks only once it has
 * been on screen for 100 ms (`useSettled`), so a fast scroll asks for nothing
 * it passes; a picture already held is drawn at once. The column never puts a
 * track first in the analysis: forty rows are not a person looking at forty
 * tracks. A cell without a picture shows one muted word, its title the
 * sentence.
 */
export function RowWaveform({ row }: { row: LibraryTrackRow }) {
  const trackId = row.id ?? null;
  const settled = useSettled(trackId);
  const { box, width } = useWaveformBox<HTMLSpanElement>();
  const entry = useWaveform(trackId, width, { ask: settled });
  const track = entry?.kind === "track" ? entry.track : null;
  const picture = track?.state === "ready" ? track.data : null;

  return (
    <span
      ref={box}
      className="library-cell__waveform"
      title={picture ? undefined : (waveformEntryWords(entry) ?? undefined)}
    >
      {picture && track ? (
        <WaveformCanvas data={picture} durationMs={track.duration_ms ?? 0} cueLabels={false} />
      ) : (
        <span className="library-cell__waveform-word">{waveformWord(entry)}</span>
      )}
    </span>
  );
}

// ------------------------------------------------------------- loudness

/**
 * A row's loudness (WAVE-08, DEC-124): the integrated value alone, "−8.4",
 * the line in full in its title, "Loudness −8.4 LUFS · Peak −0.3 dBFS". A
 * reason is one muted word. Read without a picture, so a table of forty rows
 * reads forty numbers, not forty pictures.
 *
 * WAVE-06's rules for a column: a row asks once it has been on screen for
 * 100 ms, and never puts its track first in the analysis.
 */
export function RowLoudness({ row }: { row: LibraryTrackRow }) {
  const trackId = row.id ?? null;
  const settled = useSettled(trackId);
  const entry = useWaveform(trackId, LOUDNESS_QUERY.width, { ask: settled, loudness: true });
  const cell = loudnessCell(entry);
  return (
    <span
      className={`library-cell__loudness${cell.value ? "" : " library-cell__loudness--word"}`}
      title={cell.title ?? waveformEntryWords(entry) ?? undefined}
    >
      {cell.text}
    </span>
  );
}

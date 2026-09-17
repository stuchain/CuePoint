/**
 * Cells that draw more than a value (CLEAN-13).
 *
 * An overridden value carries a small marker whose tooltip names its source,
 * and the artwork column draws a thumbnail through CLEAN-09's guarded route.
 */
import { useEffect, useState } from "react";

import type { LibraryTrackRow, OverrideField } from "../../api/cuepointBridge.types";
import { artworkText, effectiveText, overrideMark } from "./libraryClean";

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

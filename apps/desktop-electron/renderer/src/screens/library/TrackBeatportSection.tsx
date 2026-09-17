/**
 * The Inspector's Beatport zone (CLEAN-13, DEC-047, DEC-066).
 *
 * The third zone beside "Yours" and the imported record: where the track
 * stands with Beatport, the candidate that was decided, and for each of the
 * five fields CuePoint can override what Rekordbox sent, what Beatport has and
 * what a person sees now — with where that last value came from. A field is
 * applied from here one at a time. Everything else about matching is the Clean
 * page's, one link away.
 *
 * The imported record below stays exactly as read-only as Phase 4 made it: the
 * imported value is repeated here for comparison, never made editable.
 */
import { useState } from "react";

import type { LibraryTrackRow, OverrideField } from "../../api/cuepointBridge.types";
import { decisionLine } from "../clean/cleanFormat";
import { useTrackMatches } from "../clean/useTrackMatches";
import { artworkText, beatportFieldRows, fieldSourceText } from "./libraryClean";

export interface TrackBeatportSectionProps {
  track: LibraryTrackRow & { id: number };
  /** Bumped by the panel after any change to the track, so the zone reads again. */
  version: number;
  onApplied: () => void;
  onError: (message: string) => void;
  onOpenInClean?: (trackId: number) => void;
}

function dash(text: string): string {
  return text === "" ? "—" : text;
}

export function TrackBeatportSection({
  track,
  version,
  onApplied,
  onError,
  onOpenInClean,
}: TrackBeatportSectionProps) {
  const matches = useTrackMatches(track.id, version);
  const [applying, setApplying] = useState<OverrideField | null>(null);

  if (matches.unavailable) return null;

  const state = matches.matches?.state ?? null;
  const candidate = matches.matches?.candidate ?? null;
  const rows = beatportFieldRows(track, state, candidate);

  const apply = async (field: OverrideField) => {
    const bridge = window.cuepoint?.applyMatch;
    if (!bridge) return;
    setApplying(field);
    try {
      await bridge({ fields: [field], track_id: track.id });
      onApplied();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setApplying(null);
    }
  };

  return (
    <section className="cp-track-beatport" aria-label="Beatport">
      <h3 className="cp-track-detail__subtitle">Beatport</h3>

      {matches.error && <p className="cp-track-history__note">{matches.error}</p>}
      {!matches.error && !matches.matches && (
        <p className="cp-track-history__note">Reading the match…</p>
      )}

      {state && (
        <p
          className={`cp-track-beatport__state${
            state.disputed ? " cp-track-beatport__state--disputed" : ""
          }`}
        >
          {decisionLine(state)}
        </p>
      )}

      {candidate && (
        <p className="cp-track-beatport__candidate">
          <span className="cp-track-beatport__title">
            {candidate.title ?? "—"}
            {candidate.mix ? ` (${candidate.mix})` : ""}
          </span>
          <span>{candidate.artists ?? "—"}</span>
          <span className="cp-track-beatport__meta">
            {[candidate.label, candidate.release_name, `score ${candidate.score.toFixed(1)}`]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </p>
      )}

      <p className="cp-track-beatport__artwork">Artwork: {dash(artworkText(track.artwork))}</p>

      <dl className="cp-track-beatport__fields">
        {rows.map((row) => (
          <div key={row.field} className="cp-track-beatport__field" data-field={row.field}>
            <dt className="cp-track-detail__label">{row.label}</dt>
            <dd className="cp-track-beatport__values">
              <span>
                <span className="cp-track-beatport__layer">Rekordbox</span> {dash(row.imported)}
              </span>
              <span>
                <span className="cp-track-beatport__layer">Beatport</span> {dash(row.beatport)}
              </span>
              <span className="cp-track-beatport__now">
                <span className="cp-track-beatport__layer">Now</span> {dash(row.effective)}{" "}
                <span className="cp-track-beatport__source">({fieldSourceText(row.source)})</span>
              </span>
              {row.canApply && (
                <button
                  type="button"
                  className="cp-track-detail__reveal"
                  disabled={applying !== null}
                  aria-label={`Apply Beatport's ${row.label}`}
                  onClick={() => void apply(row.field)}
                >
                  {applying === row.field ? "Applying…" : "Apply"}
                </button>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {onOpenInClean && (
        <button
          type="button"
          className="cp-track-detail__reveal"
          onClick={() => onOpenInClean(track.id)}
        >
          Open on the Clean page
        </button>
      )}
    </section>
  );
}

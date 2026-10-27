/**
 * The Beatport tab (CLEAN-13, DEC-047, DEC-066, INS-5, then D16).
 *
 * How strong the match is in words and how it was decided, then a table of Rekordbox's values
 * against Beatport's, with what is used named where it is neither. Reading only: applying Beatport's
 * values is Review's and Fix values' work (FLW-2), and the full side-by-side is Clean's, one link away.
 *
 * A track not looked up yet gets one sentence and one action, not a table of blanks.
 */
import { cleanMatchState } from "../clean/cleanLink";
import { decisionLine } from "../clean/cleanFormat";
import type { TrackMatchesState } from "../clean/useTrackMatches";
import type { LibraryTrackRow } from "../../api/cuepointBridge.types";
import { comparisonRows, matchStrength, matchStrengthTitle } from "./beatportComparison";
import { beatportFieldRows, coverArtText } from "./libraryClean";
import { openOnBeatport } from "../discover/openOnBeatport";
import { Hint } from "../../components/Hint";
import { NO_VALUE } from "../../words";
import { Loading } from "../../components/Loading";
import { RouteButton } from "./RouteButton";

interface TrackBeatportSectionProps {
  track: LibraryTrackRow & { id: number };
  /** The panel's read of the track's match, shared with the key's line. */
  matches: TrackMatchesState;
  onOpenInClean?: (trackId: number) => void;
  /** Where a refused "Open on Beatport" says why. Without it that link is not offered. */
  onError?: (message: string) => void;
}

function dash(text: string): string {
  return text === "" ? NO_VALUE : text;
}

/** Said when the track has not been looked up on Beatport. */
const NOT_LOOKED_UP =
  "Not looked up on Beatport yet. Matching finds this track on Beatport so you can compare its key, BPM, genre, label and year.";

const MATCH_ON_BEATPORT = "Match on Beatport";

/** The button that matches this one track, in Clean's match window. */
export function MatchOnBeatport({ trackId }: { trackId: number }) {
  return (
    <RouteButton
      to="/clean"
      state={cleanMatchState([trackId])}
      className="cp-link"
      title="Matches this one track on Beatport"
    >
      {MATCH_ON_BEATPORT}
    </RouteButton>
  );
}

export function TrackBeatportSection({ track, matches, onOpenInClean, onError }: TrackBeatportSectionProps) {
  const state = matches.matches?.state ?? null;
  const candidate = matches.matches?.candidate ?? null;

  if (matches.error) return <p className="cp-track-history__note">{matches.error}</p>;
  if (!matches.matches) return <Loading what="the match" />;

  if (state?.state === "not_matched") {
    return (
      <div className="cp-track-beatport">
        <p className="cp-track-beatport__state">{NOT_LOOKED_UP}</p>
        <MatchOnBeatport trackId={track.id} />
      </div>
    );
  }

  const rows = comparisonRows(track, candidate, beatportFieldRows(track, candidate));
  const cover = coverArtText(track.artwork);
  const strength = matchStrength(candidate?.score);
  // The match first, in words (M133): "Strong match · Confirmed automatically".
  const statusLine = [strength, state ? decisionLine(state) : ""].filter(Boolean).join(" \u00b7 ");
  const pageUrl = candidate?.url || null;
  const canOpen = Boolean(pageUrl && onError && window.cuepoint?.openBeatportPage);

  return (
    <div className="cp-track-beatport">
      {statusLine !== "" && (
        <p
          className={`cp-track-beatport__state cp-track-beatport__state--lead${
            state?.disputed ? " cp-track-beatport__state--disputed" : ""
          }`}
        >
          <Hint text={matchStrengthTitle(candidate?.score) || undefined} inline>
            <span>{statusLine}</span>
          </Hint>
        </p>
      )}

      {rows.length > 0 && (
        <table className="cp-track-beatport__table" aria-label="Rekordbox against Beatport">
          <thead>
            <tr>
              <td />
              <th scope="col">Rekordbox</th>
              <th scope="col">Beatport</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} data-field={row.id}>
                <th scope="row">{row.label}</th>
                <td>
                  {dash(row.rekordbox)}
                  {row.using !== null && (
                    <span className="cp-track-beatport__using">{`Using ${row.using}`}</span>
                  )}
                </td>
                <td className={row.differs ? "cp-track-beatport__differs" : undefined}>{dash(row.beatport)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {cover !== "" && cover !== NO_VALUE && (
        <p className="cp-track-beatport__also">{`Artwork ${cover}`}</p>
      )}

      <div className="cp-track-beatport__links">
        {onOpenInClean && (
          <button type="button" className="cp-link cp-link--go" onClick={() => onOpenInClean(track.id)}>
            Open in Clean
          </button>
        )}
        {canOpen && (
          <button
            type="button"
            className="cp-link cp-link--go"
            onClick={() => {
              void openOnBeatport([pageUrl as string]).then((refusal) => {
                if (refusal) onError?.(refusal);
              });
            }}
          >
            Open on Beatport
          </button>
        )}
      </div>
    </div>
  );
}

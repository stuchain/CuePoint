/**
 * What Beatport says about this track (CLEAN-13, DEC-047, DEC-066, INS-5).
 *
 * Where the track stands with a match, the candidate that was decided, and for
 * each of the five fields what Rekordbox sent, what Beatport has and what is
 * used now, with where that came from. Reading only: applying Beatport's values
 * is Review's and Fix values' work (FLW-2), and one track's match is Clean's
 * match window, one button away.
 *
 * A track not looked up yet gets one sentence and one action, not a table of
 * blanks.
 */
import { cleanMatchState } from "../clean/cleanLink";
import { decisionLine } from "../clean/cleanFormat";
import type { TrackMatchesState } from "../clean/useTrackMatches";
import type { LibraryTrackRow } from "../../api/cuepointBridge.types";
import { beatportFieldRows, coverArtText, fieldSourceText } from "./libraryClean";
import { RouteButton } from "./RouteButton";

interface TrackBeatportSectionProps {
  track: LibraryTrackRow & { id: number };
  /** The panel's read of the track's match, shared with the key's line. */
  matches: TrackMatchesState;
  onOpenInClean?: (trackId: number) => void;
}

function dash(text: string): string {
  return text === "" ? "—" : text;
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
      className="cp-track-detail__reveal"
      title="Matches this one track on Beatport"
    >
      {MATCH_ON_BEATPORT}
    </RouteButton>
  );
}

export function TrackBeatportSection({ track, matches, onOpenInClean }: TrackBeatportSectionProps) {
  const state = matches.matches?.state ?? null;
  const candidate = matches.matches?.candidate ?? null;

  if (matches.error) return <p className="cp-track-history__note">{matches.error}</p>;
  if (!matches.matches) return <p className="cp-track-history__note">Reading the match…</p>;

  if (state?.state === "not_matched") {
    return (
      <div className="cp-track-beatport">
        <p className="cp-track-beatport__state">{NOT_LOOKED_UP}</p>
        <MatchOnBeatport trackId={track.id} />
      </div>
    );
  }

  const rows = beatportFieldRows(track, candidate);
  const cover = coverArtText(track.artwork);

  return (
    <div className="cp-track-beatport">
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
            {[candidate.label, candidate.release_name].filter(Boolean).join(" · ")}
            {candidate.score != null && (
              <>
                {candidate.label || candidate.release_name ? " · " : ""}
                <span title="How closely Beatport's track matches yours; higher is closer">
                  {`match score ${candidate.score.toFixed(1)}`}
                </span>
              </>
            )}
          </span>
        </p>
      )}

      {cover !== "" && <p className="cp-track-beatport__artwork">Cover art: {cover}</p>}

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
                <span className="cp-track-beatport__layer">Using</span> {dash(row.effective)}{" "}
                <span className="cp-track-beatport__source">({fieldSourceText(row.source)})</span>
              </span>
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
    </div>
  );
}

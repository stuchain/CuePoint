/**
 * The Beatport tab (CLEAN-13, DEC-047, DEC-066, INS-5).
 *
 * The matched release, how the match was decided, the fields that agree on one line, and in
 * full only the fields where what is used is not what Beatport has (with Rekordbox's own value
 * when that is a third thing). Reading only: applying Beatport's values is Review's and Fix
 * values' work (FLW-2), and the full side-by-side is Clean's, one link away.
 *
 * A track not looked up yet gets one sentence and one action, not a table of blanks.
 */
import { cleanMatchState } from "../clean/cleanLink";
import { decisionLine } from "../clean/cleanFormat";
import type { TrackMatchesState } from "../clean/useTrackMatches";
import type { LibraryTrackRow } from "../../api/cuepointBridge.types";
import { agreeLine, compareBeatportRows, joinLabels, releaseLine, scoreWords } from "./beatportComparison";
import { beatportFieldRows, coverArtText, fieldSourceText } from "./libraryClean";
import { NO_VALUE } from "../../words";
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

  const { agree, applied, alsoGenres, differ } = compareBeatportRows(beatportFieldRows(track, candidate));
  const cover = coverArtText(track.artwork);
  const release = candidate ? releaseLine(candidate) : "";
  const agreed = [
    agreeLine(agree.filter((label) => !applied.includes(label))),
    applied.length > 0 ? `${joinLabels(applied)} applied from Beatport` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const statusLine = [state ? decisionLine(state) : "", scoreWords(candidate?.score), cover !== "" && cover !== NO_VALUE ? `cover art ${cover}` : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="cp-track-beatport">
      {release !== "" && <p className="cp-track-beatport__release">{release}</p>}
      {statusLine !== "" && (
        <p
          className={`cp-track-beatport__state${
            state?.disputed ? " cp-track-beatport__state--disputed" : ""
          }`}
        >
          {statusLine}
        </p>
      )}
      {agreed !== "" && (
        <p className="cp-track-beatport__agree">
          <span aria-hidden>{"✓ "}</span>
          {`${agreed.charAt(0).toUpperCase()}${agreed.slice(1)}`}
        </p>
      )}

      {alsoGenres.length > 0 && (
        <p className="cp-track-beatport__also">Beatport also lists {alsoGenres.join(", ")}</p>
      )}

      {differ.length > 0 && (
        <dl className="cp-track-beatport__fields">
          {differ.map((row) => (
            <div key={row.field} className="cp-track-beatport__field" data-field={row.field}>
              <dt className="cp-track-detail__label">{row.label}</dt>
              <dd className="cp-track-beatport__values">
                {row.imported.trim() !== row.effective.trim() && (
                  <span>
                    <span className="cp-track-beatport__layer">Rekordbox</span> {dash(row.imported)}
                  </span>
                )}
                <span className="cp-track-beatport__now">
                  <span className="cp-track-beatport__layer">Using</span> {dash(row.effective)}{" "}
                  <span className="cp-track-beatport__source">({fieldSourceText(row.source)})</span>
                </span>
                <span>
                  <span className="cp-track-beatport__layer">Beatport</span> {dash(row.beatport)}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      )}

      {onOpenInClean && (
        <button
          type="button"
          className="cp-track-detail__reveal"
          onClick={() => onOpenInClean(track.id)}
        >
          Compare all on the Clean page {"›"}
        </button>
      )}
    </div>
  );
}

/**
 * Clean's match window (PAGES-07B, FLW-13, CLN-10).
 *
 * The one place many tracks are matched on Beatport. It asks which tracks (the
 * ones not looked up yet, all of them, the tracks of chosen playlists,
 * Collections or Sets, or the tracks an opener passed in) and whether to look
 * up again the ones that already have a match. The first-visit offer, the
 * Library's Beatport ▸ and notice line, Health, the Keys page and Prepare all
 * open it with their tracks chosen. One track is matched in place from Track
 * details, not here.
 *
 * It says how many tracks the choice will search for before anything starts,
 * counted by the engine from the question it will be asked. Starting hands the
 * page the selection that was shown; the page runs the job.
 */
import { useEffect, useMemo, useState } from "react";

import type { BatchSelection, LibraryHealth } from "../../api/cuepointBridge.types";
import { Modal } from "../../components";
import type { RuleSource } from "../library/filterText";
import { trackCount } from "./cleanFormat";
import {
  NOT_LOOKED_UP_RULE,
  chosenCount,
  isIds,
  libraryQueryOf,
  selectionOf,
  sourcesQuery,
  type CleanTracks,
  type SelectionQuery,
} from "./cleanTracks";
import { PlacePicker } from "./PlacePicker";
import { useCleanSources } from "./useCleanSources";
import { useTrackCount } from "./useTrackCount";

type Which = "not_yet" | "all" | "places" | "given";

interface MatchWindowProps {
  open: boolean;
  /** Tracks an opener passed in; null opens on the tracks not looked up yet. */
  tracks: CleanTracks | null;
  /** Health's counts, which say how many tracks there are and how many were not looked up. */
  health: LibraryHealth | null;
  /** Start matching this selection; `again` looks up tracks that already have a match. */
  onStart: (selection: BatchSelection, again: boolean) => void;
  onClose: () => void;
}

function healthCount(health: LibraryHealth | null, id: string): number | null {
  return health?.counts.find((entry) => entry.id === id)?.count ?? null;
}

export function MatchWindow({ open, tracks, health, onStart, onClose }: MatchWindowProps) {
  const sources = useCleanSources();
  const [which, setWhich] = useState<Which>(tracks ? "given" : "not_yet");
  const [places, setPlaces] = useState<RuleSource[]>([]);
  const [again, setAgain] = useState(false);

  // Each opening starts from what it was asked with, not from the last use.
  useEffect(() => {
    if (!open) return;
    setWhich(tracks ? "given" : "not_yet");
    setPlaces([]);
    setAgain(false);
  }, [open, tracks]);

  const libraryTotal = health?.track_count ?? null;
  const notYetTotal = healthCount(health, "not_matched");

  // The tracks the choice covers, as a described question when it has one.
  const scope: SelectionQuery | null = useMemo(() => {
    if (which === "all") return {};
    if (which === "places") return places.length > 0 ? sourcesQuery(places) : null;
    if (which === "given" && tracks && !isIds(tracks)) return tracks.query;
    return null;
  }, [places, tracks, which]);

  const wholeCount = useTrackCount(
    open && (which === "places" || which === "given") && scope ? libraryQueryOf(scope) : null,
  );
  const notYetInScope = useTrackCount(
    open && (which === "places" || which === "given") && scope
      ? libraryQueryOf(scope, [NOT_LOOKED_UP_RULE])
      : null,
  );

  // How many tracks the choice covers, and how many of them were not looked up.
  let total: number | null = null;
  let notYet: number | null = null;
  if (which === "not_yet") {
    total = notYetTotal;
    notYet = notYetTotal;
  } else if (which === "all") {
    total = libraryTotal;
    notYet = notYetTotal;
  } else if (which === "given" && tracks) {
    // Ids are counted by their length; whether they were looked up is the engine's to say.
    total = chosenCount(tracks);
    if (!isIds(tracks)) notYet = notYetInScope;
  } else if (which === "places") {
    total = wholeCount;
    notYet = notYetInScope;
  }

  const lookedUpAgain = again && which !== "not_yet";
  const searched = lookedUpAgain ? total : notYet;

  const selection = (): BatchSelection | null => {
    if (which === "not_yet") return { query: { filters: { match: "all", rules: [NOT_LOOKED_UP_RULE] } } };
    if (which === "all") return { query: {} };
    if (which === "places") return places.length > 0 ? { query: sourcesQuery(places) } : null;
    return tracks ? selectionOf(tracks) : null;
  };

  const nothingChosen = which === "places" && places.length === 0;
  const nothingToDo = !nothingChosen && searched === 0;

  let sentence: string;
  if (nothingChosen) {
    sentence = "Choose the playlists, Collections or Sets to match.";
  } else if (nothingToDo && which === "not_yet") {
    sentence = "Every track has been looked up.";
  } else if (searched !== null) {
    sentence = `CuePoint will search Beatport for ${trackCount(searched)}.`;
  } else if (total !== null) {
    sentence = `CuePoint will search Beatport for those of the ${trackCount(total)} that have not been looked up yet.`;
  } else {
    sentence = "CuePoint will search Beatport for the tracks you chose.";
  }

  const start = () => {
    const chosen = selection();
    if (!chosen) return;
    onStart(chosen, lookedUpAgain);
    onClose();
  };

  const figure = (value: number | null) =>
    value === null ? null : <span className="clean-match__figure">{value.toLocaleString()}</span>;

  return (
    <Modal
      open={open}
      title="Match tracks"
      size="wide"
      onClose={onClose}
      primaryAction={{
        label: "Start matching",
        onClick: start,
        disabled: nothingChosen || nothingToDo,
      }}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
    >
      <p>
        CuePoint searches Beatport for each track and proposes a match. Sure matches are accepted
        for you; the rest wait in Review matches.
      </p>
      <fieldset className="clean-match-choice">
        <legend className="clean-visually-hidden">Which tracks</legend>
        {tracks && (
          <label>
            <input type="radio" name="clean-match-which" checked={which === "given"} onChange={() => setWhich("given")} />
            {`The ${trackCount(chosenCount(tracks))} you chose`}
          </label>
        )}
        <label>
          <input type="radio" name="clean-match-which" checked={which === "not_yet"} onChange={() => setWhich("not_yet")} />
          Tracks not looked up yet
          {figure(notYetTotal)}
        </label>
        <label>
          <input type="radio" name="clean-match-which" checked={which === "all"} onChange={() => setWhich("all")} />
          All tracks
          {figure(libraryTotal)}
        </label>
        <label>
          <input type="radio" name="clean-match-which" checked={which === "places"} onChange={() => setWhich("places")} />
          Tracks in chosen playlists, Collections or Sets
        </label>
      </fieldset>
      {which === "places" && <PlacePicker sources={sources} chosen={places} onChange={setPlaces} />}

      <div className="clean-match-again">
        <label>
          <input
            type="checkbox"
            checked={lookedUpAgain}
            disabled={which === "not_yet"}
            onChange={(event) => setAgain(event.target.checked)}
          />
          Look up tracks that already have a match again
        </label>
        <p className="clean-fix__hint">
          {notYet !== null
            ? `Left off, only the ${notYet.toLocaleString()} not looked up yet are searched.`
            : "Left off, tracks that already have a match are skipped."}{" "}
          A decision you made is never changed by a new search.
        </p>
      </div>

      <p role="status">
        {sentence} It runs in the background, and you can keep using the app.
      </p>
    </Modal>
  );
}

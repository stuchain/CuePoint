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
import { formatCount, plural } from "../../format/counts";
import { MATCH_ON_BEATPORT, quoted } from "../../format/words";
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
import { useCleanSources, type CleanSource } from "./useCleanSources";
import { useTrackCount } from "./useTrackCount";

type Which = "not_yet" | "all" | "places" | "given";

const PLACE_WORDS = { playlist: "Playlist", collection: "Collection", set: "Set" } as const;

interface MatchWindowProps {
  open: boolean;
  /** Tracks an opener passed in; null opens on the tracks not looked up yet. */
  tracks: CleanTracks | null;
  /** Health's counts, which say how many tracks there are and how many were not looked up. */
  health: LibraryHealth | null;
  /**
   * Start matching this selection; `again` looks up tracks that already have a
   * match. `label` says what was chosen, for Past searches (C14).
   */
  onStart: (selection: BatchSelection, again: boolean, label: string) => void;
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

  /** What this run is called in Past searches: the place, the library, or how many tracks. */
  const runLabel = (): string => {
    if (which === "not_yet") return "Not looked up yet";
    if (which === "all") return "All tracks";
    if (which === "places") {
      const named = places
        .map((place) => sources.find((source) => source.kind === place.kind && source.id === place.id))
        .filter((source): source is CleanSource => source !== undefined);
      if (named.length === 1) return `${PLACE_WORDS[named[0]!.kind]} ${quoted(named[0]!.name)}`;
      return `${formatCount(places.length)} chosen places`;
    }
    const chosenTracks = tracks ? chosenCount(tracks) : 0;
    return `${plural(chosenTracks, "track").replace(/^(\S+) /, "$1 chosen ")}`;
  };

  const nothingChosen = which === "places" && places.length === 0;
  const nothingToDo = !nothingChosen && searched === 0;

  let sentence: string;
  if (nothingChosen) {
    sentence = "Choose the playlists, Collections or Sets to match.";
  } else if (nothingToDo && which === "not_yet") {
    sentence = "Every track has been looked up.";
  } else if (searched !== null) {
    sentence = `CuePoint will match ${trackCount(searched)} on Beatport.`;
  } else if (total !== null) {
    sentence = `CuePoint will match those of the ${trackCount(total)} that have not been looked up yet.`;
  } else {
    sentence = "CuePoint will match the tracks you chose on Beatport.";
  }

  // R3-2: the button says what it will do, with the count the sentence states (the
  // chosen tracks' own count when only that is known), and a greyed one says why.
  // When only the chosen count is known, fewer may be searched, so the button says "the
  // chosen" rather than a number it cannot promise.
  let primaryLabel: string;
  if (searched) {
    primaryLabel = `Match ${trackCount(searched)}${lookedUpAgain ? " again" : ""}`;
  } else if (searched === null && total) {
    primaryLabel = total === 1 ? "Match the chosen track" : `Match the ${formatCount(total)} chosen`;
  } else {
    primaryLabel = MATCH_ON_BEATPORT;
  }
  let reason: string | null = null;
  if (nothingChosen) {
    reason = "Choose which tracks.";
  } else if (nothingToDo) {
    if (lookedUpAgain) reason = "There are no tracks here to match.";
    else if (which === "not_yet") reason = "Every track has been looked up; choose other tracks.";
    else reason = "All of these are already matched; tick “Match tracks that already have a match again”.";
  }

  const start = () => {
    const chosen = selection();
    if (!chosen) return;
    onStart(chosen, lookedUpAgain, runLabel());
    onClose();
  };

  const figure = (value: number | null) =>
    value === null ? null : <span className="clean-match__figure">{formatCount(value)}</span>;

  return (
    <Modal
      open={open}
      title={MATCH_ON_BEATPORT}
      size="large"
      onClose={onClose}
      primaryAction={{
        label: primaryLabel,
        onClick: start,
        disabled: nothingChosen || nothingToDo,
        disabledReason: reason ?? undefined,
      }}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
    >
      <p className="cp-modal__lead">
        CuePoint finds each track on Beatport and proposes a match. Sure matches are confirmed for
        you; the rest wait in Match.
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
          Match tracks that already have a match again
        </label>
        <p className="clean-fix__hint">
          {notYet !== null
            ? `Left off, only the ${formatCount(notYet)} not looked up yet are matched.`
            : "Left off, tracks that already have a match are skipped."}{" "}
          A decision you made is never changed by a new match.
        </p>
      </div>

      <p role="status">
        {sentence} It runs in the background, and you can keep using the app.
      </p>
    </Modal>
  );
}

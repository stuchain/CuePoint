/**
 * Clean's Fix values tab (PAGES-07B, FLW-12, FLW-3).
 *
 * One job: change the values of many tracks. Three buttons, **Edit values…**,
 * **Use Beatport's values…** and **Save changes into the files…**, over the
 * tracks an opener passed in (the Library's Fix ▸, Track details, Health) or a
 * scope picked here: the whole library, or any mix of playlists, Collections
 * and Sets, the places the Library's "In playlist" field names.
 *
 * Nothing is rebuilt here. The three actions are the Library's own dialogs and
 * batch path (`useLibraryClean`): the same preview before anything is written
 * into a file, the same question above 1,000 tracks (LIB-11), the same History
 * and revert. Keeping business rules in Python means this page only chooses
 * which tracks and hands the engine a selection (DEC-045).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { announceLibraryChange } from "../../api/libraryChanges";
import { Button, useToast } from "../../components";
import { BatchConfirmDialog } from "../library/BatchConfirmDialog";
import type { RuleSource } from "../library/filterText";
import { useLibraryBatch } from "../library/useLibraryBatch";
import { useLibraryClean } from "../library/useLibraryClean";
import { trackCount } from "./cleanFormat";
import type { CleanFixOpening, FixAction } from "./cleanLink";
import {
  chosenCount,
  isIds,
  libraryQueryOf,
  selectionOf,
  sourcesQuery,
  type CleanTracks,
} from "./cleanTracks";
import { PlacePicker } from "./PlacePicker";
import { useCleanSources } from "./useCleanSources";
import { useTrackCount } from "./useTrackCount";

interface FixValuesProps {
  /** Tracks an opener passed in, and the action to start; null when none did. */
  opening: CleanFixOpening | null;
  /** The library's track count (Health's), for "The whole library". */
  libraryCount: number | null;
  /** After a change was saved, so the page's counts are read again. */
  onChanged: () => void;
}

type Mode = "given" | "library" | "places";

function targetOf(tracks: CleanTracks) {
  return {
    selection: selectionOf(tracks),
    count: chosenCount(tracks),
    trackId: isIds(tracks) && tracks.ids.length === 1 ? tracks.ids[0]! : null,
  };
}

export function FixValues({ opening, libraryCount, onChanged }: FixValuesProps) {
  const { push } = useToast();
  const sources = useCleanSources();
  const [given, setGiven] = useState<CleanTracks | null>(opening?.tracks ?? null);
  const [mode, setMode] = useState<Mode>(opening ? "given" : "places");
  const [chosen, setChosen] = useState<RuleSource[]>([]);

  const changed = useCallback(() => {
    announceLibraryChange();
    onChanged();
  }, [onChanged]);
  const batch = useLibraryBatch({ onMessage: push, onApplied: changed });
  const clean = useLibraryClean({ batch, onMessage: push, onChanged });

  // Counted by the engine, from the question the batch would be asked.
  const placesQuery = useMemo(
    () => (mode === "places" && chosen.length > 0 ? libraryQueryOf(sourcesQuery(chosen)) : null),
    [chosen, mode],
  );
  const placesCount = useTrackCount(placesQuery);

  const target = useMemo(() => {
    if (mode === "given" && given) return targetOf(given);
    if (mode === "library") {
      return libraryCount === null
        ? null
        : { selection: { query: {} }, count: libraryCount, trackId: null };
    }
    if (mode === "places" && placesCount !== null) {
      return { selection: { query: sourcesQuery(chosen) }, count: placesCount, trackId: null };
    }
    return null;
  }, [chosen, given, libraryCount, mode, placesCount]);

  // An opening names its tracks once per navigation, and may name the action.
  const latest = useRef({ clean });
  latest.current = { clean };
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!opening || opened.current === opening.token) return;
    opened.current = opening.token;
    setGiven(opening.tracks);
    setMode("given");
    const handlers = latest.current.clean.handlersFor(targetOf(opening.tracks));
    const start: Record<FixAction, (() => void) | undefined> = {
      edit: handlers.onEdit,
      beatport: handlers.onApply,
      save: handlers.onWriteTags,
    };
    if (opening.action) start[opening.action]?.();
  }, [opening]);

  const handlers = target ? clean.handlersFor(target) : null;
  const choosing = mode === "places" && chosen.length === 0;

  return (
    <div className="clean-fix">
      <fieldset className="clean-fix__choice">
        <legend className="clean-visually-hidden">Which tracks</legend>
        {given && (
          <label>
            <input type="radio" name="clean-fix-which" checked={mode === "given"} onChange={() => setMode("given")} />
            {`The ${trackCount(chosenCount(given))} you chose`}
          </label>
        )}
        <label>
          <input type="radio" name="clean-fix-which" checked={mode === "library"} onChange={() => setMode("library")} />
          The whole library
        </label>
        <label>
          <input type="radio" name="clean-fix-which" checked={mode === "places"} onChange={() => setMode("places")} />
          Tracks in chosen playlists, Collections or Sets
        </label>
      </fieldset>

      {mode === "places" && <PlacePicker sources={sources} chosen={chosen} onChange={setChosen} />}

      {choosing ? (
        <p className="clean-fix__hint">
          Choose tracks: pick playlists here, or select tracks in the Library and use Fix ▸.
        </p>
      ) : (
        <p className="clean-fix__count" role="status">
          {target ? trackCount(target.count) : "Counting…"}
        </p>
      )}

      <div className="clean-fix__actions">
        <Button
          variant="secondary"
          disabled={!handlers?.onEdit || target?.count === 0}
          onClick={() => handlers?.onEdit?.()}
        >
          Edit values…
        </Button>
        <Button
          variant="secondary"
          disabled={!handlers?.onApply || target?.count === 0}
          onClick={() => handlers?.onApply?.()}
        >
          Use Beatport&apos;s values…
        </Button>
        <Button
          variant="secondary"
          disabled={!handlers?.onWriteTags || target?.count === 0}
          onClick={() => handlers?.onWriteTags?.()}
        >
          Save changes into the files…
        </Button>
      </div>

      {clean.dialogs}
      <BatchConfirmDialog batch={batch} />
    </div>
  );
}

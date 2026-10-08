import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { PixelIcon } from "../PixelIcon";
import type { LibraryTrackRow } from "../../api/cuepointBridge.types";
import { reportUnexpected } from "../../reporting/reporting";
import { useToast } from "../Toast";
import { libraryTrackState } from "../../screens/library/libraryLink";
import { toQueueItem } from "../../screens/library/useLibraryPlayback";
import {
  MIN_QUERY_LENGTH,
  resultSummary,
  trackSubtitle,
  useLibrarySearch,
  useSearchInputRef,
} from "./useLibrarySearch";
import "./GlobalSearch.css";

const LISTBOX_ID = "cp-global-search-results";
const optionId = (index: number) => `cp-global-search-option-${index}`;

/**
 * Global library search (DEC-023).
 *
 * Backed by a real engine query over the Phase 1 `tracks` table from the start,
 * rather than a client-side filter over whatever is on screen. It legitimately
 * finds nothing until the Library phase imports a collection — and says so in
 * those words, because "no library yet" and "no matches" are different problems
 * with different answers.
 *
 * Bound to Ctrl+K, not Ctrl+F: `keyboardShortcuts.ts` already gives Ctrl+F to
 * in-table search, and one key meaning two things depending on focus is worse
 * than two keys meaning one thing each.
 */
export function GlobalSearch() {
  const navigate = useNavigate();
  const { push } = useToast();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const { ref, focus } = useSearchInputRef();
  const { status, response, error } = useLibrarySearch(query);

  const tracks: LibraryTrackRow[] = status === "results" && response ? response.tracks : [];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        focus();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focus]);

  // A press anywhere outside the search closes the panel (HDR-2); focus leaving it does
  // too, below. Listened to only while it is open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  // A new answer starts on its first result.
  useEffect(() => setActive(0), [response]);

  useEffect(() => {
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const onChange = useCallback((value: string) => {
    setQuery(value);
    setOpen(true);
  }, []);

  // HDR-1: Enter or a click opens the Library on the track, selected.
  const openTrack = useCallback(
    (track: LibraryTrackRow | undefined) => {
      if (!track || track.id == null) return;
      setOpen(false);
      navigate("/library", { state: libraryTrackState(track.id) });
    },
    [navigate],
  );

  // Shift+Enter and the row's ▶ play it, through the player the Library plays with.
  const playTrack = useCallback((track: LibraryTrackRow | undefined) => {
    const play = window.cuepoint?.player?.playQueue;
    if (!track || !play) return;
    void play([toQueueItem(track)], 0)
      .then((result) => {
        if (!result.ok) push(result.error, "error");
      })
      .catch(reportUnexpected);
  }, [push]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (tracks.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      // With the panel closed the arrow only brings it back; the next one moves.
      if (!open) {
        setOpen(true);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => Math.min(tracks.length - 1, Math.max(0, current + step)));
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      if (event.shiftKey) playTrack(tracks[active]);
      else openTrack(tracks[active]);
    }
  };

  const trimmed = query.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_QUERY_LENGTH;
  const showPanel = open && (status !== "idle" || tooShort);
  const showList = showPanel && tracks.length > 0;

  return (
    <div
      ref={rootRef}
      className="cp-global-search"
      role="search"
      onBlur={(event) => {
        // Focus left for a control outside (HDR-2). Focus that left for nothing, a press
        // on the bare page, is the pointer listener's.
        const next = event.relatedTarget as Node | null;
        if (next && !rootRef.current?.contains(next)) setOpen(false);
      }}
    >
      <label className="cp-global-search__field">
        <span className="cp-global-search__label">Search library</span>
        <input
          ref={ref}
          type="search"
          className="cp-global-search__input"
          placeholder="Search library…  Ctrl+K"
          value={query}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setOpen(true)}
          // Pressing in a field that already has focus brings the results back (HDR-2).
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          aria-label="Search library"
          // The panel is a listbox of results, so the input owns the
          // expanded/collapsed state for anyone not looking at the screen.
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={showList ? LISTBOX_ID : undefined}
          aria-activedescendant={showList ? optionId(active) : undefined}
          aria-autocomplete="list"
          autoComplete="off"
        />
      </label>

      {showPanel && (
        <div
          className="cp-global-search__panel"
          // A press inside the panel must not take focus from the field, or the panel
          // would close under the click that was meant for a row.
          onMouseDown={(event) => event.preventDefault()}
        >
          {tooShort && (
            <p className="cp-global-search__note">Keep typing: at least {MIN_QUERY_LENGTH} letters</p>
          )}

          {status === "searching" && (
            <p className="cp-global-search__note" role="status">
              Searching…
            </p>
          )}

          {status === "empty-library" && (
            <p className="cp-global-search__note">
              No library yet. Import a Rekordbox collection to search it.
            </p>
          )}

          {status === "no-results" && (
            <p className="cp-global-search__note">No tracks match “{trimmed}”.</p>
          )}

          {status === "unavailable" && (
            <p className="cp-global-search__note">
              Search will work once CuePoint has finished starting.
            </p>
          )}

          {status === "error" && (
            <p
              className="cp-global-search__note cp-global-search__note--error"
              role="alert"
              // What went wrong is for the title; the sentence says what to do.
              title={error ?? undefined}
            >
              Search didn't work. Try again.
            </p>
          )}

          {status === "results" && response && (
            <>
              <p className="cp-global-search__summary">{resultSummary(response)}</p>
              <ul className="cp-global-search__list" role="listbox" id={LISTBOX_ID} aria-label="Search results">
                {response.tracks.map((track, index) => (
                  <li
                    className="cp-global-search__row"
                    key={track.id ?? track.rekordbox_track_id}
                    role="presentation"
                  >
                    <div
                      id={optionId(index)}
                      className={`cp-global-search__option${index === active ? " cp-global-search__option--active" : ""}`}
                      role="option"
                      aria-selected={index === active}
                      onClick={() => openTrack(track)}
                      onMouseMove={() => index !== active && setActive(index)}
                    >
                      <span className="cp-global-search__title">{track.title}</span>
                      <span className="cp-global-search__artist">{track.artist}</span>
                      <span className="cp-global-search__meta">{trackSubtitle(track)}</span>
                    </div>
                    <button
                      type="button"
                      className="cp-global-search__play"
                      aria-label={`Play ${track.title}`}
                      title={`Play ${track.title}`}
                      // Not a tab stop: ↑/↓ and Shift+Enter do this from the field.
                      tabIndex={-1}
                      // Not an option, so out of the listbox's tree: Shift+Enter is the keyboard path.
                      aria-hidden="true"
                      onClick={() => playTrack(track)}
                    >
                      <PixelIcon name="play" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

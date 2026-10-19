import { useCallback, useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Hint } from "../Hint";
import { Modal } from "../Modal";
import { PlayButton } from "../PlayButton";
import { TrackFactsLine } from "../TrackFactsLine";
import { SearchField } from "../SearchField";
import { useShellCommand } from "./shellCommands";
import type { LibraryTrackRow } from "../../api/cuepointBridge.types";
import { reportUnexpected } from "../../reporting/reporting";
import { useToast } from "../Toast";
import { libraryTrackState } from "../../screens/library/libraryLink";
import { matchedLabel } from "../../screens/library/searchMatch";
import { toQueueItem } from "../../screens/library/useLibraryPlayback";
import { sharedTransition } from "../../tokens/sharedTransition";
import { queryShown } from "./pageActive";
import {
  MIN_QUERY_LENGTH,
  resultSummary,
  useLibrarySearch,
  useSearchInputRef,
} from "./useLibrarySearch";
import "./GlobalSearch.css";

const LISTBOX_ID = "cp-global-search-results";
const optionId = (index: number) => `cp-global-search-option-${index}`;

/**
 * Global library search (DEC-023), in a dialog opened from the sidebar (K8, DEC-282; amends
 * DEC-133 and DEC-023: the header band is gone).
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
function SearchBody({ onDone }: { onDone: (how?: { navigated: true }) => void }) {
  const navigate = useNavigate();
  const { push } = useToast();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const { ref, focus } = useSearchInputRef();
  const { status, response, error } = useLibrarySearch(query);

  const tracks: LibraryTrackRow[] = status === "results" && response ? response.tracks : [];

  // After the dialog has taken focus for itself (a layout effect in Modal): the field is where typing starts.
  useEffect(() => focus(), [focus]);

  // A new answer starts on its first result.
  useEffect(() => setActive(0), [response]);

  useEffect(() => {
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  // HDR-1: Enter or a click opens the Library on the track, selected.
  // The dialog closes first, then the page changes. The row clicked moves into the Library's row
  // for the track when Moving between views is on (PAGES-12); with it off, or from the keyboard,
  // the page just changes.
  const openTrack = useCallback(
    (track: LibraryTrackRow | undefined, from?: Element | null) => {
      if (!track || track.id == null) return;
      const id = track.id;
      sharedTransition(
        "cp-shared-result",
        from ?? null,
        () => {
          onDone({ navigated: true });
          navigate("/library", { state: libraryTrackState(id) });
          focusSelectedRow();
        },
        () => queryShown(".track-table__row--selected"),
      );
    },
    [navigate, onDone],
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
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => Math.min(tracks.length - 1, Math.max(0, current + step)));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) playTrack(tracks[active]);
      else openTrack(tracks[active]);
    }
  };

  const trimmed = query.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_QUERY_LENGTH;
  const showPanel = status !== "idle" || tooShort;
  const showList = showPanel && tracks.length > 0;
  // Each new answer pulses once (feedback, DEC-154): the list is a new element for each.
  const [answer, setAnswer] = useState({ response, n: 0 });
  if (answer.response !== response) setAnswer({ response, n: answer.n + 1 });
  const [pulsed, setPulsed] = useState(0);
  useEffect(() => {
    if (!showList) return;
    const timer = window.setTimeout(() => setPulsed(answer.n), 400);
    return () => window.clearTimeout(timer);
  }, [showList, answer.n]);

  return (
    <div className="cp-global-search" role="search">
      <SearchField
        ref={ref}
        thing="library"
        className="cp-global-search__field"
        value={query}
        onValueChange={setQuery}
        onKeyDown={onKeyDown}
        // The results are a listbox, so the input owns the
        // expanded/collapsed state for anyone not looking at the screen.
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={showList ? LISTBOX_ID : undefined}
        aria-activedescendant={showList ? optionId(active) : undefined}
        aria-autocomplete="list"
      />

      {showPanel && (
        <div
          className="cp-global-search__panel"
          // A press inside the panel (a row's ▶) must not take focus from the field.
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
              No library yet. Import a Rekordbox file to search it.
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
            <Hint text={error ?? undefined} portal>
              <p
                className="cp-global-search__note cp-global-search__note--error"
                role="alert"
                // What went wrong is for the hint; the sentence says what to do.
                tabIndex={error ? 0 : undefined}
              >
                Search didn't work. Try again.
              </p>
            </Hint>
          )}

          {status === "results" && response && (
            <>
              <p className="cp-global-search__summary">{resultSummary(response)}</p>
              <ul
                key={answer.n}
                className={`cp-global-search__list${pulsed !== answer.n ? " cp-global-search__list--fresh" : ""}`}
                role="listbox" id={LISTBOX_ID} aria-label="Search results">
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
                      onClick={(event) => openTrack(track, event.currentTarget)}
                      onMouseMove={() => index !== active && setActive(index)}
                    >
                      <span className="cp-global-search__title" data-cut-hint="">
                        {track.title}
                      </span>
                      <span className="cp-global-search__meta" data-cut-hint="">
                        {/* Found by its key or tempo rather than its words (FLW-5). */}
                        {matchedLabel(track) && (
                          <>
                            <strong className="cp-global-search__matched">{matchedLabel(track)}</strong>
                            {" · "}
                          </>
                        )}
                        <TrackFactsLine
                          artist={track.artist}
                          label={track.effective_label ?? track.label}
                          keyValue={track.effective_key}
                          bpm={track.effective_bpm ?? track.bpm}
                          year={track.effective_year ?? track.year}
                        />
                      </span>
                    </div>
                    <PlayButton
                      className="cp-global-search__play"
                      aria-label={`Play ${track.title}`}
                      // Not a tab stop: ↑/↓ and Shift+Enter do this from the field.
                      tabIndex={-1}
                      // Not an option, so out of the listbox's tree: Shift+Enter is the keyboard path.
                      aria-hidden="true"
                      onClick={() => playTrack(track)}
                    />
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

/**
 * After a result opens the Library, focus goes to the selected row's table once the page has
 * drawn it (Esc, by contrast, gives focus back to the opener). Gives up after a few seconds.
 */
function focusSelectedRow(): void {
  let tries = 0;
  const look = window.setInterval(() => {
    const row = queryShown(".track-table__row--selected");
    const target = row?.closest<HTMLElement>("[tabindex]");
    if (target) {
      target.focus({ preventScroll: true });
      window.clearInterval(look);
    } else if (++tries > 40) {
      window.clearInterval(look);
    }
  }, 100);
}

/** Whether some other modal dialog is open: Ctrl+K must not stack a second one on it. */
function otherDialogOpen(): boolean {
  return queryShown('[role="dialog"][aria-modal="true"]') !== null;
}

/**
 * The search dialog and the one window listener that opens it (K8): Ctrl+K from anywhere, a
 * table included, even with the sidebar collapsed. App mounts it once, outside the sidebar's
 * `nav`; the sidebar's Search button opens it with the "open-search" shell command. The dialog's
 * Esc and focus return are Modal's.
 */
export function SearchDialogHost() {
  const [open, setOpen] = useState(false);
  // An opened result moves focus itself, so the dialog must not first return it to the opener.
  const [navigated, setNavigated] = useState(false);

  const show = useCallback(() => {
    setNavigated(false);
    setOpen(true);
  }, []);
  useShellCommand("open-search", show);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (!open && !otherDialogOpen()) show();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, show]);

  const close = useCallback((how?: { navigated: true }) => {
    if (how?.navigated) setNavigated(true);
    setOpen(false);
  }, []);

  return (
    <Modal open={open} title="Search" onClose={() => close()} size="large" restoreFocus={!navigated} noFooter>
      <SearchBody onDone={close} />
    </Modal>
  );
}

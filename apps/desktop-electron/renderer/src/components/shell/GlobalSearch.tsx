import { useCallback, useEffect, useState } from "react";
import {
  resultSummary,
  trackSubtitle,
  useLibrarySearch,
  useSearchInputRef,
} from "./useLibrarySearch";
import "./GlobalSearch.css";

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
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const { ref, focus } = useSearchInputRef();
  const { status, response, error } = useLibrarySearch(query);

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

  const onChange = useCallback((value: string) => {
    setQuery(value);
    setOpen(true);
  }, []);

  const showPanel = open && status !== "idle";

  return (
    <div className="cp-global-search">
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
          aria-label="Search library"
          // The panel is a listbox of results, so the input owns the
          // expanded/collapsed state for anyone not looking at the screen.
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="cp-global-search-results"
          autoComplete="off"
        />
      </label>

      {showPanel && (
        <div
          className="cp-global-search__panel"
          id="cp-global-search-results"
          role="region"
          aria-label="Search results"
        >
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
            <p className="cp-global-search__note">No tracks match “{query.trim()}”.</p>
          )}

          {status === "unavailable" && (
            <p className="cp-global-search__note">
              Search needs the CuePoint engine, which is not connected.
            </p>
          )}

          {status === "error" && (
            <p className="cp-global-search__note cp-global-search__note--error" role="alert">
              Search failed: {error}
            </p>
          )}

          {status === "results" && response && (
            <>
              <p className="cp-global-search__summary">{resultSummary(response)}</p>
              <ul className="cp-global-search__list">
                {response.tracks.map((track) => (
                  <li className="cp-global-search__row" key={track.id ?? track.rekordbox_track_id}>
                    <span className="cp-global-search__title">{track.title}</span>
                    <span className="cp-global-search__artist">{track.artist}</span>
                    <span className="cp-global-search__meta">{trackSubtitle(track)}</span>
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

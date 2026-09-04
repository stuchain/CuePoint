/**
 * What the library holds, where it came from, and the two things you do to it
 * (LIBUI-10, DEC-039).
 *
 * LIBRARY-11 said all of this in two stacked panels, which was right when the
 * page had nothing else on it. The page is now a browser, so the same
 * sentences are compressed into one strip above the tracks — **the same
 * sentences**: every string still comes from `libraryFormat.ts`, because
 * whether a user understands that a refresh's deletions are permanent is
 * decided by those words and not by the layout around them.
 */
import { Badge, Button } from "../../components";
import type { LibrarySummary } from "../../api/cuepointBridge.types";
import { formatWhen, pluralize, sourceState, sourceStateMessage } from "./libraryFormat";
import "./LibraryHeader.css";

export interface LibraryHeaderProps {
  summary: LibrarySummary;
  busy: null | "importing" | "checking" | "applying";
  busyLabel: string | null;
  onCheck: () => void;
  onImport: () => void;
  /** The line the last refresh left behind, if there was one. */
  appliedLine?: string | null;
}

export function LibraryHeader({
  summary,
  busy,
  busyLabel,
  onCheck,
  onImport,
  appliedLine = null,
}: LibraryHeaderProps) {
  const source = summary.source;
  const state = source ? sourceState(source) : null;
  const disabled = busy !== null;

  return (
    <header className="library-header">
      {/* The page keeps its heading. It is small here because the counts beside
          it say more, but a page with no h1 has no name — for a screen reader,
          or for the shell's own navigation. */}
      <h1 className="screen__title library-header__title">Library</h1>

      <div className="library-header__counts">
        <span className="library-header__count" data-testid="library-track-count">
          {pluralize(summary.track_count, "track")}
        </span>
        <span className="library-header__sep">·</span>
        <span>{pluralize(summary.playlist_count, "playlist")}</span>
        <span className="library-header__sep">·</span>
        <span>{pluralize(summary.playlist_entry_count, "entry", "entries")}</span>
      </div>

      {source && state && (
        <div className="library-header__source">
          <Badge
            variant={
              state === "changed" || state === "missing"
                ? "warning"
                : state === "unknown"
                  ? "default"
                  : "success"
            }
          >
            {state === "changed" || state === "missing"
              ? "Out of date"
              : state === "unknown"
                ? "Unverified"
                : "Up to date"}
          </Badge>
          {/* The whole path, not just the file name: two exports called
              collection.xml in two folders are the thing a user most needs to
              tell apart. CSS ellipsizes it; the text stays complete. */}
          <span className="library-header__file" title={source.xml_path}>
            {source.xml_path}
          </span>
          <span className="library-header__imported">
            imported {formatWhen(source.imported_at)}
          </span>
          <span
            className={
              state === "unchanged"
                ? "library-header__state"
                : "library-header__state library-header__state--attention"
            }
            role={state === "unchanged" ? undefined : "status"}
          >
            {sourceStateMessage(state)}
          </span>
        </div>
      )}

      {appliedLine && (
        <p className="library-header__applied" role="status">
          {appliedLine}
        </p>
      )}

      <div className="library-header__actions">
        <Button variant="primary" onClick={onCheck} disabled={disabled}>
          {busy === "checking" || busy === "applying" ? busyLabel : "Check for changes"}
        </Button>
        <Button variant="secondary" onClick={onImport} disabled={disabled}>
          {busy === "importing" ? busyLabel : "Import a different collection…"}
        </Button>
      </div>
    </header>
  );
}

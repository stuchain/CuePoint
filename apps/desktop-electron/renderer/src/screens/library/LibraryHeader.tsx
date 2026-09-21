/**
 * What the library holds, where it came from, and the things you do with its
 * file (LIBUI-10, DEC-039; EXPORT-07, DEC-087).
 *
 * LIBRARY-11 said all of this in two stacked panels, which was right when the
 * page had nothing else on it. The page is now a browser, so the same
 * sentences are compressed into one strip above the tracks — **the same
 * sentences**: every string still comes from `libraryFormat.ts`, because
 * whether a user understands that a refresh's deletions are permanent is
 * decided by those words and not by the layout around them.
 *
 * **Two actions, not three** (EXPORT-07). "Check for changes" is a button;
 * importing another collection and exporting to Rekordbox share one menu,
 * "Collection file", because they are the two ends of the library's
 * relationship with that file (DEC-087) — and because three buttons do not
 * fit. At the default window size and scale the header is about 600 pixels
 * wide and the three labels need over a thousand, so each took a line of its
 * own and the track table was left twenty pixels tall. Measured, in the
 * packaged app, before this was changed.
 */
import { useState, type MouseEvent } from "react";

import { Badge, Button, TrackContextMenu } from "../../components";
import type { LibrarySummary } from "../../api/cuepointBridge.types";
import { formatWhen, pluralize, sourceState, sourceStateMessage } from "./libraryFormat";
import "./LibraryHeader.css";

export interface LibraryHeaderProps {
  summary: LibrarySummary;
  busy: null | "importing" | "checking" | "applying";
  busyLabel: string | null;
  onCheck: () => void;
  onImport: () => void;
  /**
   * "Export to Rekordbox…" (DEC-087, as amended). Beside import, in the same
   * menu, because import and export are the two ends of the library's
   * relationship with its source file; it opens with nothing ticked. Absent,
   * import is a plain button again.
   */
  onExport?: () => void;
  /** The line the last refresh left behind, if there was one. */
  appliedLine?: string | null;
}

export function LibraryHeader({
  summary,
  busy,
  busyLabel,
  onCheck,
  onImport,
  onExport,
  appliedLine = null,
}: LibraryHeaderProps) {
  const source = summary.source;
  const state = source ? sourceState(source) : null;
  const disabled = busy !== null;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  // Under the button that opened it, as a menu button's menu is.
  const openMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    setMenu({ x: box.left, y: box.bottom });
  };

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
        {onExport ? (
          <Button
            variant="secondary"
            onClick={openMenu}
            disabled={disabled}
            aria-haspopup="menu"
            aria-expanded={menu !== null}
          >
            {busy === "importing" ? busyLabel : "Collection file ▾"}
          </Button>
        ) : (
          <Button variant="secondary" onClick={onImport} disabled={disabled}>
            {busy === "importing" ? busyLabel : "Import a different collection…"}
          </Button>
        )}
      </div>

      {menu && onExport && (
        <TrackContextMenu
          x={menu.x}
          y={menu.y}
          label="Collection file"
          onClose={() => setMenu(null)}
          items={[
            { id: "import", label: "Import a different collection…", onSelect: onImport },
            { id: "export", label: "Export to Rekordbox…", onSelect: onExport },
          ]}
        />
      )}
    </header>
  );
}

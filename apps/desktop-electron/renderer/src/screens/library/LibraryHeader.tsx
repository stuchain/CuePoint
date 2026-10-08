/**
 * What the library holds, where it came from, and the things you do with its
 * file (LIBUI-10, DEC-039; EXPORT-07, DEC-087; FLW-11, DEC-208).
 *
 * LIBRARY-11 said all of this in two stacked panels, which was right when the
 * page had nothing else on it. The page is now a browser, so the same
 * sentences are compressed into one strip above the tracks — **the same
 * sentences**: every string still comes from `libraryFormat.ts`, because
 * whether a user understands that a refresh's deletions are permanent is
 * decided by those words and not by the layout around them.
 *
 * **Three buttons, never a menu** (FLW-11). **Check Rekordbox for changes**,
 * **Import another file…** and **Export to Rekordbox…** are the two ends of the
 * library's relationship with its file and the look at what moved, and each is
 * one click. EXPORT-07 had folded import and export into a "Collection file ▾"
 * menu because three did not fit at 2×, where each took a line of its own and
 * the table was left twenty pixels tall. They fit at 1.5×; where they do not
 * (2×, 3×, a narrow window) the visible labels shorten to "Check Rekordbox",
 * "Import…" and "Export…" and the full names stay as the buttons' accessible
 * names (each short label is part of its full name, WCAG 2.5.3). The widths are measured, not guessed: a hidden copy of the full labels
 * is compared with the room the header has on one line.
 *
 * Before the first import there is one button, **Import your Rekordbox
 * collection…**: nothing to check and nothing to export yet.
 */
import { useLayoutEffect, useRef, useState } from "react";

import { Badge, Button } from "../../components";
import type { LibrarySummary } from "../../api/cuepointBridge.types";
import {
  formatWhen,
  pluralize,
  sourceBadge,
  sourceState,
  sourceStateMessage,
} from "./libraryFormat";
import "./LibraryHeader.css";

interface LibraryHeaderProps {
  /** Null before the library has been read, which is the same as before an import. */
  summary: LibrarySummary | null;
  busy: null | "importing" | "checking" | "applying";
  busyLabel: string | null;
  onCheck: () => void;
  onImport: () => void;
  onExport: () => void;
  /** The line the last refresh left behind, if there was one. */
  appliedLine?: string | null;
}

/** The full names, and the shorter ones that stand in where the full ones do not fit. */
const LABELS = {
  check: { full: "Check Rekordbox for changes", short: "Check Rekordbox" },
  import: { full: "Import another file…", short: "Import…" },
  export: { full: "Export to Rekordbox…", short: "Export…" },
} as const;

/** A computed length in pixels, or 0 where there is none to read (no layout). */
function pixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * True when the full labels do not fit on one line of the header.
 *
 * Measured from a hidden copy of the full labels against the header's inner
 * width: the three buttons never wrap among themselves, so the room they can
 * have is a whole line, and when they share the title's line or drop to a line
 * of their own is the header's flex-wrap to decide. A header with no layout (a
 * test DOM, a window not yet drawn) reports nothing, and nothing is read as
 * "fits": the full names are the default.
 */
function useShortLabels(enabled: boolean) {
  const header = useRef<HTMLElement>(null);
  const [short, setShort] = useState(false);

  useLayoutEffect(() => {
    const box = header.current;
    if (!enabled || !box || typeof ResizeObserver === "undefined") return;
    const hidden = box.querySelector<HTMLElement>('[data-slot="library-header-measure"]');
    if (!hidden) return;

    const measure = () => {
      const style = getComputedStyle(box);
      const available =
        box.clientWidth - pixels(style.paddingLeft) - pixels(style.paddingRight);
      setShort(available > 0 && hidden.offsetWidth > available);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(hidden);
    return () => observer.disconnect();
  }, [enabled]);

  return { header, short };
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
  const source = summary?.source ?? null;
  const disabled = busy !== null;
  const { header, short } = useShortLabels(summary !== null && source !== null);

  // Before the first import: the title, what the page is, and the one button.
  if (!summary || !source) {
    return (
      <header className="library-header library-header--first-run" ref={header}>
        <h1 className="screen__title library-header__title">
          Library
        </h1>
        <p className="library-header__subtitle">Your Rekordbox library, as CuePoint sees it.</p>
        <div className="library-header__actions">
          <Button variant="primary" onClick={onImport} disabled={disabled}>
            {busy === "importing" ? busyLabel : "Import your Rekordbox collection…"}
          </Button>
        </div>
      </header>
    );
  }

  /** What a button shows, and the name it keeps whatever it shows. */
  const label = (button: keyof typeof LABELS, working: boolean) => {
    const name = working && busyLabel ? busyLabel : LABELS[button].full;
    return { name, text: working && busyLabel ? busyLabel : short ? LABELS[button].short : name };
  };
  const state = sourceState(source);
  const check = label("check", busy === "checking" || busy === "applying");
  const importing = label("import", busy === "importing");
  const exporting = label("export", false);
  // What the measure copy draws: the full names, with a working button's busy
  // words in place of its own, since those are what the line must hold then.
  const measured = [check.name, importing.name, exporting.name];

  return (
    <header className="library-header" ref={header} data-slot="library-header">
      {/* The page keeps its heading. It is small here because the counts beside
          it say more, but a page with no h1 has no name — for a screen reader,
          or for the shell's own navigation. */}
      <h1 className="screen__title library-header__title">
        Library
      </h1>

      <div className="library-header__counts">
        <span className="library-header__count" data-testid="library-track-count">
          {pluralize(summary.track_count, "track")}
        </span>
        <span className="library-header__sep">·</span>
        <span title={`${pluralize(summary.playlist_entry_count, "track")} across your playlists`}>
          {pluralize(summary.playlist_count, "playlist")}
        </span>
      </div>

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
          {sourceBadge(state)}
        </Badge>
        {/* The whole path, not just the file name: two exports called
            collection.xml in two folders are the thing a user most needs to
            tell apart. CSS ellipsizes it; the text stays complete. */}
        <span className="library-header__file" title={source.xml_path}>
          {source.xml_path}
        </span>
        <span className="library-header__imported">
          last read {formatWhen(source.imported_at)}
        </span>
        {/* "In sync" already says it: the sentence is only for what needs a word. */}
        {state !== "unchanged" && (
          <span className="library-header__state library-header__state--attention" role="status">
            {sourceStateMessage(state)}
          </span>
        )}
      </div>

      {appliedLine && (
        <p className="library-header__applied" role="status">
          {appliedLine}
        </p>
      )}

      <div className="library-header__actions">
        <Button variant="primary" onClick={onCheck} disabled={disabled} aria-label={check.name}>
          {check.text}
        </Button>
        <Button
          variant="secondary"
          onClick={onImport}
          disabled={disabled}
          aria-label={importing.name}
        >
          {importing.text}
        </Button>
        <Button
          variant="secondary"
          onClick={onExport}
          disabled={disabled}
          aria-label={exporting.name}
        >
          {exporting.text}
        </Button>
      </div>

      {/* The full labels, drawn and hidden, so their width can be read whatever the
          visible ones say. The text is a pseudo-element's, so it is not on the page
          for a reader, a search or a test to find twice. */}
      <div className="library-header__measure" aria-hidden="true" data-slot="library-header-measure">
        {measured.map((text, index) => (
          <span key={index} className="cp-btn library-header__measure-label" data-text={text} />
        ))}
      </div>
    </header>
  );
}

/**
 * The Library's header: where you are, what it holds, and the things you do
 * with the export file (LIBUI-10, DEC-039; EXPORT-07, DEC-087; FLW-11,
 * DEC-208; K9, R4-4).
 *
 * It sits on the shared `ScreenHeader`. The title slot names the scope
 * ("All tracks", or the playlist's or Collection's name, with the group it is
 * in above it) while the `<h1>` stays "Library" for a screen reader. The
 * summary line describes the scope and not the search box: tracks, running
 * time, BPM range, keys. The source is one short line, the file's name and its
 * state; the whole path and when it was last read are in the name's hint.
 * **The same sentences**: every string about the file's state still comes from
 * `libraryFormat.ts`, because whether a user understands that a refresh's
 * deletions are permanent is decided by those words and not by the layout.
 *
 * **Two buttons, never a menu** (FLW-11). **Check for changes** and
 * **Export to Rekordbox…** are the library's relationship with its file and
 * the look at what moved, and each is one click. Import a Rekordbox file moved to
 * Settings and the File menu (K9). Check is the primary button only when the
 * file changed or went missing; otherwise it is a secondary like Export. Where
 * the two do not fit with the title the visible labels shorten to "Check
 * Rekordbox" and "Export…" and the full names stay as the buttons' accessible
 * names (each short label is part of its full name, WCAG 2.5.3). The widths are
 * measured, not guessed: ScreenHeader's actions never wrap, and the title and
 * source line need room beside them, so a hidden copy of the full labels is
 * compared with a share of the header's width.
 *
 * Before the first import there is one button, **Import your Rekordbox
 * collection…**: nothing to check and nothing to export yet.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Badge, Button, Hint } from "../../components";
import { ScreenHeader } from "../../components/shell/ScreenHeader";
import type { LibraryQuickFacets, LibrarySummary } from "../../api/cuepointBridge.types";
import {
  fileName,
  formatWhen,
  scopeFactsLine,
  sourceBadge,
  sourceState,
  sourceStateMessage,
} from "./libraryFormat";
import "./LibraryHeader.css";

interface LibraryHeaderProps {
  /** Null before the library has been read, which is the same as before an import. */
  summary: LibrarySummary | null;
  /** The scope's name: "All tracks", or the playlist's, Collection's or Set's. */
  scopeName?: string;
  /** What the left pane calls the group the scope is in; null for All tracks. */
  scopeGroup?: string | null;
  /** What the scope holds; null while it is being read. */
  facts?: LibraryQuickFacets | null;
  /** The scope's track count as far as the page already knows it. */
  fallbackCount?: number;
  busy: null | "importing" | "checking" | "applying";
  busyLabel: string | null;
  onCheck: () => void;
  /** Only the first-run branch has an import button. */
  onImport: () => void;
  onExport: () => void;
  /** The line the last refresh left behind, if there was one. */
  appliedLine?: string | null;
  /** Sits right after the heading, outside the measured actions (the First steps chip). */
  extra?: ReactNode;
}

/** The full names, and the shorter ones that stand in where the full ones do not fit. */
const LABELS = {
  check: { full: "Check for changes", short: "Check" },
  export: { full: "Export to Rekordbox…", short: "Export…" },
} as const;

/** The share of the header the two buttons may take before the labels shorten. */
const ACTIONS_SHARE = 0.6;

/** A computed length in pixels, or 0 where there is none to read (no layout). */
function pixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * True when the full labels would take more of the header than they may.
 *
 * Measured from a hidden copy of the full labels against the header's inner
 * width. A header with no layout (a test DOM, a window not yet drawn) reports
 * nothing, and nothing is read as "fits": the full names are the default.
 */
function useShortLabels(enabled: boolean) {
  const header = useRef<HTMLDivElement>(null);
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
      setShort(available > 0 && hidden.offsetWidth > available * ACTIONS_SHARE);
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
  scopeName = "All tracks",
  scopeGroup = null,
  facts = null,
  fallbackCount = 0,
  busy,
  busyLabel,
  onCheck,
  onImport,
  onExport,
  appliedLine = null,
  extra = null,
}: LibraryHeaderProps) {
  const source = summary?.source ?? null;
  const disabled = busy !== null;
  const { header, short } = useShortLabels(summary !== null && source !== null);

  // Before the first import: the title, and the one button.
  if (!summary || !source) {
    return (
      <div className="library-header library-header--first-run" ref={header}>
        <ScreenHeader
          title="Library"
          actions={
            <Button variant="primary" onClick={onImport} disabled={disabled}>
              {busy === "importing" ? busyLabel : "Import a Rekordbox file…"}
            </Button>
          }
        />
      </div>
    );
  }

  /** What a button shows, and the name it keeps whatever it shows. */
  const label = (button: keyof typeof LABELS, working: boolean) => {
    const name = working && busyLabel ? busyLabel : LABELS[button].full;
    return { name, text: working && busyLabel ? busyLabel : short ? LABELS[button].short : name };
  };
  const state = sourceState(source);
  const needsLook = state === "changed" || state === "missing";
  const check = label("check", busy === "checking" || busy === "applying");
  const exporting = label("export", false);
  // What the measure copy draws: the full names, with a working button's busy
  // words in place of its own, since those are what the line must hold then.
  const measured = [check.name, exporting.name];

  const parts = scopeFactsLine(facts, fallbackCount);

  return (
    <div className="library-header" ref={header} data-slot="library-header">
      <ScreenHeader
        title="Library"
        display={scopeName}
        crumb={scopeGroup}
        beside={
          <>
            <span className="library-header__source">
              <Hint
                text={`${source.xml_path} · last read ${formatWhen(source.imported_at)}`}
                inline
              >
                <span className="library-header__file cp-data" tabIndex={0}>
                  {fileName(source.xml_path)}
                </span>
              </Hint>
              <Badge
                variant={needsLook ? "warning" : state === "unknown" ? "default" : "success"}
              >
                {sourceBadge(state)}
              </Badge>
            </span>
            {extra}
          </>
        }
        summary={[
          <span key="scope" className="library-header__sr-only">
            {scopeName}:{" "}
          </span>,
          ...parts.map((part, index) => (
          <span key={index}>
            {index > 0 && <span className="library-header__sep"> · </span>}
            <span
              className="cp-data"
              data-testid={index === 0 ? "library-track-count" : undefined}
            >
              {part}
            </span>
          </span>
          )),
        ]}
        actions={
          <>
            <Button
              variant={needsLook ? "primary" : "secondary"}
              onClick={onCheck}
              disabled={disabled}
              aria-label={check.name}
            >
              {check.text}
            </Button>
            <Button
              variant="secondary"
              onClick={onExport}
              disabled={disabled}
              aria-label={exporting.name}
            >
              {exporting.text}
            </Button>
          </>
        }
        tabs={
          (state !== "unchanged" || appliedLine) && (
            <div className="library-header__notes">
              {state !== "unchanged" && (
                <span
                  className={`library-header__state${needsLook ? " library-header__state--attention" : ""}`}
                  role="status"
                >
                  {sourceStateMessage(state)}
                </span>
              )}
              {appliedLine && (
                <p className="library-header__applied" role="status">
                  {appliedLine}
                </p>
              )}
            </div>
          )
        }
      />

      {/* The full labels, drawn and hidden, so their width can be read whatever the
          visible ones say. The text is a pseudo-element's, so it is not on the page
          for a reader, a search or a test to find twice. */}
      <div className="library-header__measure" aria-hidden="true" data-slot="library-header-measure">
        {measured.map((text, index) => (
          <span key={index} className="cp-btn library-header__measure-label" data-text={text} />
        ))}
      </div>
    </div>
  );
}

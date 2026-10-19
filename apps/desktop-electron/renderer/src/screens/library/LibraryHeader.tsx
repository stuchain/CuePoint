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
 * file changed or went missing; otherwise it is a secondary like Export. The
 * labels never shorten. Where the title, the source line with its chips and the buttons
 * (with the Details toggle) do not fit one line, the source badge and the First steps chip
 * go, so the header stays one line. The widths are measured, not guessed (`fitsOneLine`).
 *
 * Before the first import there is one button, **Import your Rekordbox
 * collection…**: nothing to check and nothing to export yet.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Badge, Button, Hint } from "../../components";
import { PixelIcon } from "../../components/PixelIcon";
import { CHECK_FOR_CHANGES } from "../../format/words";
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
import { countNoun } from "../../format/counts";
import "./LibraryHeader.css";

interface LibraryHeaderProps {
  /** Null before the library has been read, which is the same as before an import. */
  summary: LibrarySummary | null;
  /** The scope's name: "All tracks", or the playlist's, Collection's or Set's. */
  scopeName?: string;
  /** The trail to the scope ("Playlists", "Gigs 2026"), drawn in the facts line; none on All tracks. */
  scopeTrail?: readonly string[];
  /** A folder is selected: its facts line says what it holds instead of "0 tracks" (R7-5). */
  folder?: { count: number; noun: "playlist" | "Collection" } | null;
  /** First steps is showing its own violet Import, so this one is grey (R7-9). */
  importQuiet?: boolean;
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

/** The buttons' words, always whole. */
const LABELS = {
  check: CHECK_FOR_CHANGES,
  export: "Export to Rekordbox…",
} as const;

/** A computed length in pixels, or 0 where there is none to read (no layout). */
function pixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** The widths of the three things that must share the header's one line, and the room there is. */
export interface HeaderWidths {
  /** The scope's name at its natural width, not cut. */
  title: number;
  /** The source line and the chips after the title; 0 when there are none. */
  beside: number;
  /** The buttons, the divider and the Details toggle, with their gaps, at their full labels. */
  actions: number;
  /** Between two of the three. */
  gap: number;
  /** The inner width of the header's row. */
  available: number;
}

/**
 * True when the title, what sits beside it and the buttons fit one line together. A header with no
 * layout (a test DOM, a window not yet drawn) has no room to measure and nothing is read as "fits".
 */
export function fitsOneLine({ title, beside, actions, gap, available }: HeaderWidths): boolean {
  if (available <= 0) return true;
  const gaps = gap * (beside > 0 ? 2 : 1);
  return title + beside + actions + gaps <= available;
}

/** The sum of a row's children and the gaps between them. */
function rowWidth(row: Element, gap: number): number {
  const widths = [...row.children].map((child) => (child as HTMLElement).offsetWidth);
  return widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, widths.length - 1);
}

/**
 * How much of what sits beside the title goes so the buttons never wrap (A1, round 5):
 * 0 keeps the file's name, its state and the First steps chip; 1 drops the First steps chip;
 * 2 moves the file's name and its state to the end of the facts line, so nothing about the source
 * is lost, only moved.
 */
export type LeanLevel = 0 | 1 | 2;

export function leanLevel(
  widths: Omit<HeaderWidths, "beside"> & { whole: number; source: number },
): LeanLevel {
  const { whole, source, ...rest } = widths;
  if (fitsOneLine({ ...rest, beside: whole })) return 0;
  if (fitsOneLine({ ...rest, beside: source })) return 1;
  return 2;
}

/**
 * The level at which the title, the source line with its chips, and the buttons share one line.
 *
 * Measured, not guessed: the scope's name at its natural width (a cut name still reports the whole
 * of it), the real buttons at their full words (the labels never shorten), and what sits beside
 * the title the last time it was drawn whole, since it is the thing that goes.
 */
function useLean(enabled: boolean) {
  const header = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState<LeanLevel>(0);
  const kept = useRef({ whole: 0, source: 0 });

  useLayoutEffect(() => {
    const box = header.current;
    if (!enabled || !box || typeof ResizeObserver === "undefined") return;
    const main = box.querySelector<HTMLElement>(".cp-screen-header__main");
    const display = box.querySelector<HTMLElement>(".cp-screen-header__display");
    const actions = box.querySelector<HTMLElement>(".cp-screen-header__actions");
    if (!main || !display || !actions) return;

    const measure = () => {
      const style = getComputedStyle(main);
      const available =
        main.clientWidth - pixels(style.paddingLeft) - pixels(style.paddingRight);
      const gap = pixels(style.columnGap);
      const beside = box.querySelector<HTMLElement>(".cp-screen-header__beside");
      const source = box.querySelector<HTMLElement>(".library-header__source");
      // Drawn whole, the widths are the ones to keep; once parts went, the kept widths stand.
      if (beside && source && box.querySelector(".library-header__chip-slot")) {
        kept.current = { whole: beside.offsetWidth, source: source.offsetWidth };
      } else if (beside && source && kept.current.whole === 0) {
        kept.current = { whole: beside.offsetWidth, source: source.offsetWidth };
      }
      setLevel(
        leanLevel({
          title: display.scrollWidth,
          whole: kept.current.whole,
          source: kept.current.source,
          actions: rowWidth(actions, pixels(getComputedStyle(actions).columnGap)),
          gap,
          available,
        }),
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(main);
    observer.observe(display);
    observer.observe(actions);
    return () => observer.disconnect();
  }, [enabled]);

  return { header, level };
}

export function LibraryHeader({
  summary,
  scopeName = "All tracks",
  scopeTrail = [],
  folder = null,
  importQuiet = false,
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
  const { header, level } = useLean(summary !== null && source !== null);

  // Before the first import: the title, and the one button.
  if (!summary || !source) {
    return (
      <div className="library-header library-header--first-run" ref={header}>
        <ScreenHeader
          title="Library"
          actions={
            <Button variant={importQuiet ? "secondary" : "primary"} onClick={onImport} disabled={disabled}>
              {busy === "importing" ? busyLabel : "Import a Rekordbox file…"}
            </Button>
          }
        />
      </div>
    );
  }

  const state = sourceState(source);
  const needsLook = state === "changed" || state === "missing";
  // A button's words never change while it works: it shows the spinner, and the status strip says
  // what is happening (C239).
  const checking = busy === "checking" || busy === "applying";
  const parts = folder
    ? ["Folder", countNoun(folder.count, folder.noun)]
    : scopeFactsLine(facts, fallbackCount);
  // The file's name, with the whole path in its hint, and the file's state.
  const sourceLine = (
    <span className="library-header__source">
      <Hint text={`${source.xml_path} · last read ${formatWhen(source.imported_at)}`} inline>
        <span className="library-header__file cp-data" tabIndex={0}>
          {fileName(source.xml_path)}
        </span>
      </Hint>
      <Badge variant={needsLook ? "warning" : state === "unknown" ? "default" : "success"}>
        {sourceBadge(state)}
      </Badge>
      {/* Nothing needs a look: checking is a quiet refresh icon beside the state. When the file
          changed or went missing, the labelled primary button is in the actions instead. */}
      {!needsLook && (
        <Hint text={checking && busyLabel ? busyLabel : CHECK_FOR_CHANGES}>
          <Button
            variant="quiet"
            size="sm"
            iconOnly
            icon="refresh"
            aria-label={CHECK_FOR_CHANGES}
            loading={checking}
            disabled={disabled}
            onClick={onCheck}
          />
        </Hint>
      )}
    </span>
  );

  return (
    <div className="library-header" ref={header} data-slot="library-header">
      <ScreenHeader
        title="Library"
        display={scopeName}
        beside={
          level >= 2 ? undefined : (
            <>
              {sourceLine}
              {level === 0 && <span className="library-header__chip-slot">{extra}</span>}
            </>
          )
        }
        summary={[
          <span key="scope" className="library-header__sr-only">
            {scopeName}:{" "}
          </span>,
          // The trail to the scope leads the facts: Playlists, then the folders above it (C44).
          scopeTrail.length > 0 ? (
            <span key="trail" className="library-header__trail" data-testid="library-trail">
              {scopeTrail.map((name, index) => (
                <span key={`${index}-${name}`}>
                  {index > 0 && <PixelIcon name="chevron-right-sm" className="cp-pixel-icon--text library-header__trail-arrow" />}
                  {name}
                </span>
              ))}
              <span className="library-header__sep"> · </span>
            </span>
          ) : null,
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
          // Where the title and the buttons leave no room beside the title, the file and its state
          // are here, on the facts line.
          level >= 2 ? (
            <span key="source">
              <span className="library-header__sep"> · </span>
              {sourceLine}
            </span>
          ) : null,
        ]}
        actions={
          <>
            {needsLook && (
              <Button
                variant="primary"
                onClick={onCheck}
                disabled={disabled}
                loading={checking}
                aria-label={LABELS.check}
              >
                {LABELS.check}
              </Button>
            )}
            <Button variant="secondary" onClick={onExport} disabled={disabled} aria-label={LABELS.export}>
              {LABELS.export}
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
    </div>
  );
}

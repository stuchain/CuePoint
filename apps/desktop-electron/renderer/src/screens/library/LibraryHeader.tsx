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
 * **The file is a menu, the state is the check** (D14, amending FLW-11's "never a menu"): on All tracks the
 * file's name opens Check for changes, Import a different file… and Copy path, and "Up to date ⟳" is the
 * check itself; a Collection or a playlist shows neither. Where the trail to the scope is, the facts
 * line starts with it, so the title row never changes height.
 *
 * **Two buttons** (FLW-11). **Check for changes** and
 * **Export to Rekordbox…** are the library's relationship with its file and
 * the look at what moved, and each is one click. Import a Rekordbox file moved to
 * Settings and the File menu (K9). Check is the primary button only when the
 * file changed or went missing; otherwise it is a secondary like Export. The
 * labels never shorten. Where the title, the source line with its chips and the buttons
 * (with the Details toggle) do not fit one line, the source badge and the First steps chip
 * go, so the header stays one line; where even the title and the buttons do not fit (1.5x in a
 * small window, 2x, 3x), the buttons fold into one "more" menu on the title row (M73, D11). The
 * widths are measured, not guessed (`fitsOneLine`).
 *
 * Before the first import there is one button, **Import your Rekordbox
 * collection…**: nothing to check and nothing to export yet.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Button, Hint } from "../../components";
import { PixelIcon } from "../../components/PixelIcon";
import { TrackContextMenu, useMenuButton } from "../../components/TrackContextMenu";
import { CHECK_FOR_CHANGES, opensDialog } from "../../format/words";
import { displayPath } from "../../format/paths";
import { ScreenHeader } from "../../components/shell/ScreenHeader";
import type { LibraryPending, LibraryQuickFacets, LibrarySummary } from "../../api/cuepointBridge.types";
import {
  fileName,
  formatWhen,
  scopeFactsLine,
  sourceBadge,
  sourceState,
  sourceStateMessage,
} from "./libraryFormat";
import { countNoun, formatCount } from "../../format/counts";
import "./LibraryHeader.css";

interface LibraryHeaderProps {
  /** Null before the library has been read, which is the same as before an import. */
  summary: LibrarySummary | null;
  /** The scope's name: "All tracks", or the playlist's, Collection's or Set's. */
  scopeName?: string;
  /** The trail to the scope ("Playlists", "Gigs 2026"), at the start of the facts line (D14); none on All tracks. */
  scopeTrail?: readonly string[];
  /** A folder is selected: its facts line says what it holds instead of "0 tracks" (R7-5). */
  folder?: { count: number; noun: "playlist" | "Collection" } | null;
  /** First steps is showing its own violet Import, so the header shows none: one Import, not two (C146). */
  importInFirstSteps?: boolean;
  /**
   * The file the library was read from is shown on All tracks only (D14, M108): a Collection or a
   * playlist is not "from" a file, so its title row has none. Defaults to true.
   */
  showSource?: boolean;
  /** What is not in the files or not exported yet (M511); the line says nothing when both are 0. */
  pending?: LibraryPending | null;
  /** Copy the file's path; the header has no toast of its own (the page says "Copied"). */
  onCopyPath?: (path: string) => void;
  /** Opens Save to files, from "N values not in files" (M511). Absent, the words are plain text. */
  onSaveToFiles?: () => void;
  /**
   * One more part of the facts line, after the facts (M103): a Set's note and its way to Prepare,
   * which used to be a band of its own between the filter bar and the table.
   */
  scopeNote?: ReactNode;
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
 * is lost, only moved; 3 (M73) folds the buttons into one "more" menu on the title row, when even
 * the title and the buttons alone do not fit.
 */
export type LeanLevel = 0 | 1 | 2 | 3;

export function leanLevel(
  widths: Omit<HeaderWidths, "beside"> & { whole: number; source: number },
): LeanLevel {
  const { whole, source, ...rest } = widths;
  if (fitsOneLine({ ...rest, beside: whole })) return 0;
  if (fitsOneLine({ ...rest, beside: source })) return 1;
  if (fitsOneLine({ ...rest, beside: 0 })) return 2;
  return 3;
}

/**
 * Whether the "last read …" words go before the file and its state leave the title's line: at
 * level 1 without them (`read` is their width with the gap before them), when that is what fits.
 * When it was last read moves into the check's hint, so nothing is lost. The words are the one
 * part of the line whose width changes with the clock ("9:05 AM", "11:15 PM"), and they left the
 * default window's header a pixel short at one time of day and fine at another (CI wave 2 item 5,
 * wave 3 item 3, and wider still on Windows).
 */
export function dropsRead(
  widths: Omit<HeaderWidths, "beside"> & { whole: number; source: number; read: number },
): boolean {
  const { read, ...rest } = widths;
  return read > 0 && leanLevel(rest) >= 2 && fitsOneLine({ ...rest, beside: Math.max(0, rest.source - read) });
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
  const [readGone, setReadGone] = useState(false);
  const kept = useRef({ whole: 0, source: 0, actions: 0, read: 0 });

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
        kept.current = { ...kept.current, whole: beside.offsetWidth, source: source.offsetWidth };
      } else if (beside && source && kept.current.whole === 0) {
        kept.current = { ...kept.current, whole: beside.offsetWidth, source: source.offsetWidth };
      }
      // The "last read …" words with the gap before them, while they are drawn.
      const read = source?.querySelector<HTMLElement>(".library-header__read");
      if (source && read && read.offsetWidth > 0) {
        kept.current = { ...kept.current, read: read.offsetWidth + pixels(getComputedStyle(source).columnGap) };
      }
      // The buttons drawn whole are the width to keep; folded into the menu (M73), the kept width
      // stands, or the header would unfold and fold again on every measure.
      const shownActions = box.querySelector<HTMLElement>(".cp-screen-header__actions");
      if (shownActions && !shownActions.querySelector(".library-header__more")) {
        kept.current = {
          ...kept.current,
          actions: rowWidth(shownActions, pixels(getComputedStyle(shownActions).columnGap)),
        };
      }
      const widths = {
        title: display.scrollWidth,
        whole: kept.current.whole,
        source: kept.current.source,
        actions: kept.current.actions,
        gap,
        available,
      };
      const lean = dropsRead({ ...widths, read: kept.current.read });
      setReadGone(lean);
      setLevel(lean ? 1 : leanLevel(widths));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(main);
    observer.observe(display);
    observer.observe(actions);
    // What sits beside the title can grow while the header's row keeps its size (the pixel face
    // arriving, "last read …" filled in): the title row then wraps inside, which these see, so the
    // buttons are never left on a line of their own (CI wave 2, item 5).
    const titleRow = box.querySelector<HTMLElement>(".cp-screen-header__title-row");
    if (titleRow) observer.observe(titleRow);
    const besideNow = box.querySelector<HTMLElement>(".cp-screen-header__beside");
    if (besideNow) observer.observe(besideNow);
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) measure();
    });
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [enabled]);

  return { header, level, readGone };
}

export function LibraryHeader({
  summary,
  scopeName = "All tracks",
  scopeTrail = [],
  folder = null,
  showSource = true,
  pending = null,
  onCopyPath,
  onSaveToFiles,
  scopeNote = null,
  importInFirstSteps = false,
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
  const { header, level, readGone } = useLean(summary !== null && source !== null);

  const fileMenu = useMenuButton();
  const moreMenu = useMenuButton();
  // Before the first import: the title, and the one button.
  if (!summary || !source) {
    return (
      <div className="library-header library-header--first-run" ref={header}>
        <ScreenHeader
          title="Library"
          actions={
            importInFirstSteps ? undefined : (
              <Button variant="primary" onClick={onImport} disabled={disabled}>
                {busy === "importing" ? busyLabel : "Import a Rekordbox file…"}
              </Button>
            )
          }
        />
      </div>
    );
  }

  const state = sourceState(source);
  const hasPending = !!pending && (pending.values_not_in_files > 0 || pending.changes_not_exported > 0);
  const needsLook = state === "changed" || state === "missing";
  // A button's words never change while it works: it shows the spinner, and the status strip says
  // what is happening (C239).
  const checking = busy === "checking" || busy === "applying";
  const parts = folder
    ? ["Folder", countNoun(folder.count, folder.noun)]
    : scopeFactsLine(facts, fallbackCount);
  // D14: the file is one menu button ("collection.xml ⌄": Check for changes, Import a different
  // file…, Copy path), its state is the refresh button at chip height, and when it was last read is
  // said in words beside them (M106, M107, M108).
  const fileBox = fileMenu.open ? fileMenu.anchor.current?.getBoundingClientRect() : undefined;
  const moreBox = moreMenu.open ? moreMenu.anchor.current?.getBoundingClientRect() : undefined;
  const sourceLine = !showSource ? null : (
    <span className="library-header__source">
      <Button
        variant="quiet"
        size="sm"
        menu
        className="library-header__file-button"
        aria-label={`${fileName(source.xml_path)}, file menu`}
        // The whole path is the "last read" words' hint; with the words gone it is the name's.
        title={readGone ? displayPath(source.xml_path, { keepHome: true }) : undefined}
        {...fileMenu.buttonProps}
      >
        <span className="library-header__file cp-data" data-cut-hint="">
          {fileName(source.xml_path)}
        </span>
      </Button>
      {fileMenu.open && fileBox && (
        <TrackContextMenu
          x={fileBox.left}
          y={fileBox.bottom}
          anchor={fileMenu.anchor}
          onClose={fileMenu.close}
          label={fileName(source.xml_path)}
          items={[
            { id: "check", label: CHECK_FOR_CHANGES, onSelect: onCheck, disabled },
            { id: "import", label: opensDialog("Import a different file"), onSelect: onImport, disabled },
            {
              id: "copy-path",
              label: "Copy path",
              title: source.xml_path,
              onSelect: () => onCopyPath?.(source.xml_path),
              disabled: !onCopyPath,
              separatorBefore: true,
            },
          ]}
        />
      )}
      {/* Nothing needs a look: the state is the check, one button at the chip's height. When the
          file changed or went missing, the labelled primary button is in the actions instead and
          the state is only said here. */}
      {needsLook ? (
        <span className={`cp-badge cp-badge--warning library-header__chip`}>{sourceBadge(state)}</span>
      ) : (
        <Hint
          text={
            checking && busyLabel
              ? busyLabel
              : `Check ${fileName(source.xml_path)} for changes${readGone ? ` · last read ${formatWhen(source.imported_at)}` : ""}`
          }
        >
          <button
            type="button"
            className={`cp-badge cp-badge--${state === "unknown" ? "default" : "success"} library-header__chip library-header__chip--button`}
            aria-label={CHECK_FOR_CHANGES}
            aria-busy={checking || undefined}
            disabled={disabled}
            onClick={onCheck}
          >
            {sourceBadge(state)}
            <PixelIcon name="refresh" className="cp-pixel-icon--text" />
          </button>
        </Hint>
      )}
      {!readGone && (
        <span className="library-header__read" title={displayPath(source.xml_path, { keepHome: true })}>
          last read {formatWhen(source.imported_at)}
        </span>
      )}
    </span>
  );

  return (
    <div className="library-header" ref={header} data-slot="library-header">
      <ScreenHeader
        title="Library"
        display={scopeName}
        beside={
          level >= 2 || !sourceLine ? undefined : (
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
          // D14 (M102): where this is is the facts line's first words, so the title row is the same
          // height on every scope and nothing under it moves when a list is opened.
          scopeTrail.length > 0 ? (
            <nav key="trail" className="library-header__trail" aria-label="Where this is" data-testid="library-trail">
              {scopeTrail.map((name, index) => (
                <span key={`${index}-${name}`} className="library-header__trail-step">
                  {index > 0 && <PixelIcon name="chevron-right-sm" className="cp-pixel-icon--text library-header__trail-arrow" />}
                  {name}
                </span>
              ))}
              <span className="library-header__sep"> · </span>
            </nav>
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
          // M374: before the scope's facts arrive, the places the running time and the BPM range
          // will take are held by quiet bars, so the line does not grow under the eye.
          !folder && facts === null ? (
            // Bars only, no "·": the line says nothing it does not know yet (K9).
            <span key="placeholder" className="library-header__placeholder" aria-hidden="true">
              <span className="library-header__skeleton" />
              <span className="library-header__skeleton" />
            </span>
          ) : null,
          scopeNote ? (
            <span key="note" className="library-header__note">
              <span className="library-header__sep"> · </span>
              {scopeNote}
            </span>
          ) : null,
          // Where the title and the buttons leave no room beside the title, the file and its state
          // are here, on the facts line.
          level >= 2 && sourceLine ? (
            <span key="source">
              <span className="library-header__sep"> · </span>
              {sourceLine}
            </span>
          ) : null,
        ]}
        actions={
          level >= 3 ? (
            <>
              <Button
                variant="quiet"
                iconOnly
                icon="more"
                className="library-header__more"
                aria-label="Library actions"
                {...moreMenu.buttonProps}
              />
              {moreMenu.open && moreBox && (
                <TrackContextMenu
                  x={moreBox.left}
                  y={moreBox.bottom}
                  anchor={moreMenu.anchor}
                  onClose={moreMenu.close}
                  label="Library actions"
                  items={[
                    ...(needsLook ? [{ id: "check", label: LABELS.check, onSelect: onCheck, disabled }] : []),
                    { id: "export", label: LABELS.export, onSelect: onExport, disabled },
                  ]}
                />
              )}
            </>
          ) : (
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
          )
        }
        tabs={
          (state !== "unchanged" || appliedLine || hasPending) && (
            <div className="library-header__notes">
              {/* M511: what is only in CuePoint, what is in the files and what has been exported. */}
              {hasPending && pending && (
                <p className="library-header__pending" data-testid="library-pending">
                  {pending.values_not_in_files > 0 &&
                    (onSaveToFiles ? (
                      // M511: the words are the way to Save to files, as "not exported" is to Export.
                      <button type="button" className="cp-link" onClick={onSaveToFiles} disabled={disabled}>
                        {`${formatCount(pending.values_not_in_files)} ${pending.values_not_in_files === 1 ? "value" : "values"} not in files`}
                      </button>
                    ) : (
                      <span>{`${formatCount(pending.values_not_in_files)} ${pending.values_not_in_files === 1 ? "value" : "values"} not in files`}</span>
                    ))}
                  {pending.values_not_in_files > 0 && pending.changes_not_exported > 0 && (
                    <span className="library-header__sep"> · </span>
                  )}
                  {pending.changes_not_exported > 0 && (
                    <button type="button" className="cp-link" onClick={onExport} disabled={disabled}>
                      {`${formatCount(pending.changes_not_exported)} ${pending.changes_not_exported === 1 ? "change" : "changes"} not exported`}
                    </button>
                  )}
                </p>
              )}
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

/**
 * The Set table's columns (PREP-10, DEC-112).
 *
 * Its own registry, not the Library's: a running order is read by where each
 * entry starts, how long it is planned to play and what the change into it
 * costs. Title, artist, BPM and key are the Library's own cells, effective
 * values and override marks included, so a track reads the same on both pages.
 *
 * A heading row puts each fact about its chapter under the column it is about:
 * its name under Title, its start under Starts at, its time against its target
 * under Plays for, its BPM range under BPM, its warning count under Fit, its
 * own warnings under Transition and its notes under Note. Nothing sorts: the order is the Set.
 *
 * The table opens on #, Title, Artist, Key, BPM, Plays for and Mix in (C246). Fit (a dot
 * for whether the track mixes in from the one before), Mix out, Starts at, Transition and
 * Note are hidden until asked for (View, Columns…). The two times sit together, well left
 * of the selected row's buttons, which stick to the right edge and would cover a time cell
 * at the end of the row.
 *
 * Mix in and Mix out are typed in place and a heading carries its chapter's
 * buttons (FLW-17, FLW-18): both through `prepareEditing`'s context.
 */
import type { TrackColumnDef } from "../../components/table";
import { PixelIcon } from "../../components/PixelIcon";
import { OverriddenValue } from "../library/libraryCells";
import { effectiveText } from "../library/libraryClean";
import { describeSetNotice, describeSetWarning, fitOf } from "./setWarnings";
import { bpmRangeText, chapterTimeText, summarizeWarnings, timeCell } from "./prepareFormat";
import { ChapterButtons, TimeCell } from "./prepareEditing";
import { FitDot, WarningCell } from "./WarningCell";
import { chapterName, type PrepareRow } from "./prepareRows";

// The third layout (C246): #, Title, Artist, Key, BPM, Plays for and Mix in, which fit beside
// Details at the default size; a layout saved under the second key would keep its old order
// and its columns. Everyone is reset once; nothing reads the old key.
export const PREPARE_TABLE_LAYOUT_KEY = "cuepoint-prepare-set-layout-3";

export const PREPARE_COLUMNS: readonly TrackColumnDef<PrepareRow>[] = [
  {
    id: "position",
    header: "#",
    minWidthPx: 40,
    defaultWidthPx: 44,
    align: "right",
    // Pinned with the title, so a row's place stays in view as the table
    // scrolls sideways, and stays first (a pinned column leads).
    sticky: true,
    render: (row) => {
      if (row.kind === "heading") return "";
      const repeat = row.notices[0];
      return (
        <span data-hint={repeat ? describeSetNotice(repeat) : undefined}>
          {repeat && (
            <span className="prepare-repeat" aria-label="Played again">
              <PixelIcon name="repeat-after" className="cp-pixel-icon--text cp-pixel-icon--before" />
            </span>
          )}
          {row.entry.position + 1}
        </span>
      );
    },
    text: (row) => (row.kind === "entry" ? String(row.entry.position + 1) : ""),
  },
  {
    id: "title",
    header: "Title",
    minWidthPx: 120,
    // Pinned, and it takes the most of any spare room (GROW_WEIGHTS). It starts narrow enough
    // that the default columns fit beside the sidebar and the Suggestions pane at the default
    // window (C246), and a chapter heading's name and Edit… button still fit it.
    defaultWidthPx: 130,
    sticky: true,
    render: (row) => {
      if (row.kind === "heading") {
        return (
          <span className="prepare-heading__title">
            <span className="prepare-heading__name">{chapterName(row.chapter)}</span>
            <ChapterButtons row={row} />
          </span>
        );
      }
      const own = row.warnings;
      return (
        <span className="prepare-entry__title">
          {own.length > 0 && (
            <span
              className="prepare-entry__flag"
              data-hint={own.map(describeSetWarning).join(". ")}
              aria-label={own.map(describeSetWarning).join(". ")}
            >
              <PixelIcon name="warning" size="sm" className="cp-pixel-icon--before" />
            </span>
          )}
          {row.entry.track.title}
        </span>
      );
    },
    text: (row) => (row.kind === "heading" ? chapterName(row.chapter) : row.entry.track.title),
  },
  {
    id: "artist",
    header: "Artist",
    minWidthPx: 100,
    defaultWidthPx: 110,
    render: (row) => (row.kind === "entry" ? row.entry.track.artist : ""),
  },
  {
    id: "key",
    header: "Key",
    minWidthPx: 48,
    defaultWidthPx: 56,
    render: (row) =>
      row.kind === "entry" ? <OverriddenValue row={row.entry.track} field="key" /> : "",
    text: (row) => (row.kind === "entry" ? effectiveText(row.entry.track, "key") : ""),
  },
  {
    id: "bpm",
    header: "BPM",
    minWidthPx: 56,
    defaultWidthPx: 64,
    align: "right",
    render: (row) =>
      row.kind === "heading" ? (
        <span data-hint="The chapter's BPM range">{bpmRangeText(row.chapter)}</span>
      ) : (
        <OverriddenValue row={row.entry.track} field="bpm" />
      ),
    text: (row) =>
      row.kind === "heading" ? bpmRangeText(row.chapter) : effectiveText(row.entry.track, "bpm"),
  },
  {
    id: "planned",
    header: "Plays for",
    hint: "How long this track plays in the Set, from its Mix in to its Mix out",
    minWidthPx: 72,
    defaultWidthPx: 72,
    align: "right",
    render: (row) =>
      row.kind === "heading" ? (
        <span data-hint="The chapter's planned time, against its target">
          {chapterTimeText(row.chapter)}
        </span>
      ) : (
        timeCell(row.entry.planned_seconds)
      ),
  },
  {
    id: "in",
    header: "Mix in",
    hint: "When you plan to bring this track in, as m:ss into the track",
    minWidthPx: 48,
    defaultWidthPx: 56,
    align: "right",
    render: (row) => <TimeCell row={row} field="in" />,
    text: (row) => (row.kind === "entry" ? timeCell(row.entry.in_seconds) : ""),
  },
  {
    id: "out",
    header: "Mix out",
    hint: "When you plan to take this track out, as m:ss into the track",
    hiddenByDefault: true,
    minWidthPx: 48,
    defaultWidthPx: 60,
    align: "right",
    render: (row) => <TimeCell row={row} field="out" />,
    text: (row) => (row.kind === "entry" ? timeCell(row.entry.out_seconds) : ""),
  },
  {
    id: "fit",
    hiddenByDefault: true,
    header: "Fit",
    hint: "Whether this track mixes in from the one before: key and tempo",
    minWidthPx: 40,
    defaultWidthPx: 48,
    render: (row) => {
      if (row.kind === "heading") {
        const open = row.warnings.filter((warning) => !warning.acknowledged).length;
        if (open === 0) return "";
        return (
          <span
            className="prepare-fit-count"
            role="img"
            aria-label={`${open} open ${open === 1 ? "warning" : "warnings"} in this chapter`}
            data-hint={`${open} open ${open === 1 ? "warning" : "warnings"} in this chapter`}
          >
            {open}
          </span>
        );
      }
      // The first entry has nothing before it to mix in from.
      if (row.entry.position === 0) return "";
      const fit = fitOf(row.transition);
      return (
        <span
          className={`prepare-fit prepare-fit--${fit.level}`}
          role="img"
          data-hint={fit.level === "fit" ? "Mixes in fine" : fit.open.map(describeSetWarning).join(". ")}
          aria-label={fit.level === "fit" ? "Fits" : fit.open.map(describeSetWarning).join(". ")}
        >
          <FitDot level={fit.level} />
        </span>
      );
    },
    text: (row) => {
      if (row.kind === "heading" || row.entry.position === 0) return "";
      const fit = fitOf(row.transition);
      if (fit.keyOff && fit.tempoOff) return "Key and tempo off";
      if (fit.keyOff) return "Key off";
      if (fit.tempoOff) return "Tempo off";
      return "Fits";
    },
  },
  {
    id: "starts_at",
    hiddenByDefault: true,
    header: "Starts at",
    hint: "When this track starts if every planned time holds, counted from the start of the Set",
    minWidthPx: 56,
    defaultWidthPx: 72,
    align: "right",
    render: (row) =>
      timeCell(row.kind === "heading" ? row.chapter.starts_at : row.entry.starts_at),
  },
  {
    id: "transition",
    header: "Transition",
    hiddenByDefault: true,
    minWidthPx: 100,
    defaultWidthPx: 160,
    render: (row) => (
      <WarningCell warnings={row.kind === "heading" ? row.warnings : row.transition} />
    ),
    text: (row) =>
      summarizeWarnings(row.kind === "heading" ? row.warnings : row.transition).text,
  },
  {
    id: "note",
    header: "Note",
    hiddenByDefault: true,
    minWidthPx: 80,
    defaultWidthPx: 180,
    render: (row) => {
      const note = row.kind === "heading" ? row.chapter.notes : row.entry.note;
      return note ? <span data-hint={note}>{note}</span> : "";
    },
  },
];

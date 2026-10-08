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
 * under Plays for, its BPM range under BPM, its own warnings under Transition and
 * its notes under Note. Nothing sorts: the order is the Set.
 */
import type { TrackColumnDef } from "../../components/table";
import { OverriddenValue } from "../library/libraryCells";
import { effectiveText } from "../library/libraryClean";
import { describeSetNotice, describeSetWarning } from "./setWarnings";
import { bpmRangeText, chapterTimeText, summarizeWarnings, timeCell } from "./prepareFormat";
import { WarningCell } from "./WarningCell";
import { chapterName, type PrepareRow } from "./prepareRows";

export const PREPARE_TABLE_LAYOUT_KEY = "cuepoint-prepare-set-layout";

export const PREPARE_COLUMNS: readonly TrackColumnDef<PrepareRow>[] = [
  {
    id: "position",
    header: "#",
    minWidthPx: 40,
    defaultWidthPx: 48,
    align: "right",
    // Pinned with the title, so a row's place stays in view as the table
    // scrolls sideways, and stays first (a pinned column leads).
    sticky: true,
    render: (row) => {
      if (row.kind === "heading") return "";
      const repeat = row.notices[0];
      return (
        <span title={repeat ? describeSetNotice(repeat) : undefined}>
          {repeat && (
            <span className="prepare-repeat" aria-label="Played again">
              ↻{" "}
            </span>
          )}
          {row.entry.position + 1}
        </span>
      );
    },
    text: (row) => (row.kind === "entry" ? String(row.entry.position + 1) : ""),
  },
  {
    id: "starts_at",
    header: "Starts at",
    hint: "When this track starts if every planned time holds, counted from the start of the Set",
    minWidthPx: 56,
    defaultWidthPx: 72,
    align: "right",
    render: (row) =>
      timeCell(row.kind === "heading" ? row.chapter.starts_at : row.entry.starts_at),
  },
  {
    id: "in",
    header: "Mix in",
    hint: "When you plan to bring this track in, as m:ss into the track",
    minWidthPx: 48,
    defaultWidthPx: 60,
    align: "right",
    render: (row) => (row.kind === "entry" ? timeCell(row.entry.in_seconds) : ""),
  },
  {
    id: "out",
    header: "Mix out",
    hint: "When you plan to take this track out, as m:ss into the track",
    minWidthPx: 48,
    defaultWidthPx: 60,
    align: "right",
    render: (row) => (row.kind === "entry" ? timeCell(row.entry.out_seconds) : ""),
  },
  {
    id: "planned",
    header: "Plays for",
    hint: "How long this track plays in the Set, from its Mix in to its Mix out",
    minWidthPx: 72,
    defaultWidthPx: 84,
    align: "right",
    render: (row) =>
      row.kind === "heading" ? (
        <span title="The chapter's planned time, against its target">
          {chapterTimeText(row.chapter)}
        </span>
      ) : (
        timeCell(row.entry.planned_seconds)
      ),
  },
  {
    id: "title",
    header: "Title",
    minWidthPx: 120,
    defaultWidthPx: 220,
    sticky: true,
    render: (row) => {
      if (row.kind === "heading") {
        return <span className="prepare-heading__name">{chapterName(row.chapter)}</span>;
      }
      const own = row.warnings;
      return (
        <span>
          {own.length > 0 && (
            <span
              className="prepare-entry__flag"
              title={own.map(describeSetWarning).join("\n")}
              aria-label={own.map(describeSetWarning).join(". ")}
            >
              ⚠{" "}
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
    defaultWidthPx: 150,
    render: (row) => (row.kind === "entry" ? row.entry.track.artist : ""),
  },
  {
    id: "bpm",
    header: "BPM",
    minWidthPx: 56,
    defaultWidthPx: 72,
    align: "right",
    render: (row) =>
      row.kind === "heading" ? (
        <span title="The chapter's BPM range">{bpmRangeText(row.chapter)}</span>
      ) : (
        <OverriddenValue row={row.entry.track} field="bpm" />
      ),
    text: (row) =>
      row.kind === "heading" ? bpmRangeText(row.chapter) : effectiveText(row.entry.track, "bpm"),
  },
  {
    id: "key",
    header: "Key",
    minWidthPx: 48,
    defaultWidthPx: 60,
    render: (row) =>
      row.kind === "entry" ? <OverriddenValue row={row.entry.track} field="key" /> : "",
    text: (row) => (row.kind === "entry" ? effectiveText(row.entry.track, "key") : ""),
  },
  {
    id: "transition",
    header: "Transition",
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
    minWidthPx: 80,
    defaultWidthPx: 180,
    render: (row) => {
      const note = row.kind === "heading" ? row.chapter.notes : row.entry.note;
      return note ? <span title={note}>{note}</span> : "";
    },
  },
];

/**
 * The Match table's columns (C14).
 *
 * Library rows, drawn for one job: what Correct would do. A field the proposal
 * would change reads "before → after" (the arrow and the words say it as well
 * as the colour); one it would leave reads as the value. A row Beatport gave
 * no single answer for says what to do about it in the last column, where it
 * has the room. The first column is the tick that chooses a row for "Take
 * ticked values".
 *
 * The columns are static, so the layout a user made is never rebuilt by a
 * click; the tick reads the selection through a context the table provides.
 */
import { createContext, useContext } from "react";

import type { LibraryTrackRow } from "../../../api/cuepointBridge.types";
import type { TrackColumnDef } from "../../../components/table";
import { DISPUTED_HINT, matchStateLabel } from "../cleanFormat";
import { proposalCells, noProposalLine, yoursOf, type CardField } from "./matchCard";

export const MATCH_TABLE_LAYOUT_KEY = "cuepoint-clean-match-table-layout";

/** What the tick column needs from the page: whether a row is ticked, and to tick it. */
interface TickContextValue {
  isTicked: (row: LibraryTrackRow) => boolean;
  toggle: (row: LibraryTrackRow) => void;
}

export const TickContext = createContext<TickContextValue>({
  isTicked: () => false,
  toggle: () => undefined,
});

function TickCell({ row }: { row: LibraryTrackRow }) {
  const { isTicked, toggle } = useContext(TickContext);
  return (
    <input
      type="checkbox"
      className="match-table__tick"
      aria-label={`Take ${row.title}`}
      checked={isTicked(row)}
      // The row's own click would select only this row.
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onChange={() => toggle(row)}
    />
  );
}

/** "126 → 128" where Correct would change it, else the value. */
export function valueCell(row: LibraryTrackRow, field: CardField): string {
  const cells = proposalCells(row);
  const cell = cells?.[field];
  if (cell?.changes) return `${cell.before ?? "—"} → ${cell.after ?? "—"}`;
  return cell?.before ?? cell?.after ?? yoursOf(row)[field] ?? "";
}

function ValueCell({ row, field }: { row: LibraryTrackRow; field: CardField }) {
  const cell = proposalCells(row)?.[field];
  const text = valueCell(row, field);
  if (!cell?.changes) return <>{text}</>;
  return (
    <span className="match-changes" data-changes="true">
      {text}
      <span className="match-visually-hidden"> (Correct would change this)</span>
    </span>
  );
}

/** The Match column: how likely the proposal is, or a dash. */
export function likelyCell(row: LibraryTrackRow): string {
  const score = row.match_proposal?.score ?? row.match_score ?? null;
  if (score == null) return "—";
  return `${Math.round(score)}%`;
}

/** The last column: where the track stands, or what to do about a track with no one answer. */
export function statusCell(row: LibraryTrackRow): string {
  const line = row.match_proposal ? matchStateLabel(row.match_state) : noProposalLine(row);
  return row.match_disputed ? `${line} · changed since you decided` : line;
}

const field = (
  id: CardField,
  header: string,
  extra: Partial<TrackColumnDef<LibraryTrackRow>> = {},
): TrackColumnDef<LibraryTrackRow> => ({
  id,
  header,
  sortKey: id,
  minWidthPx: 70,
  defaultWidthPx: 120,
  render: (row) => <ValueCell row={row} field={id} />,
  text: (row) => valueCell(row, id),
  ...extra,
});

export const MATCH_COLUMNS: readonly TrackColumnDef<LibraryTrackRow>[] = [
  {
    id: "tick",
    header: "Take",
    minWidthPx: 48,
    defaultWidthPx: 52,
    render: (row) => <TickCell row={row} />,
    text: () => "",
  },
  {
    id: "title",
    header: "Title",
    sortKey: "title",
    minWidthPx: 120,
    defaultWidthPx: 220,
    sticky: true,
    render: (row) => row.title,
  },
  {
    id: "artist",
    header: "Artist",
    sortKey: "artist",
    minWidthPx: 100,
    defaultWidthPx: 170,
    render: (row) => row.artist,
  },
  {
    id: "likely",
    header: "Match",
    hint: "How likely the proposed match is.",
    minWidthPx: 64,
    defaultWidthPx: 72,
    align: "right",
    render: likelyCell,
  },
  field("key", "Key", { minWidthPx: 70, defaultWidthPx: 100 }),
  field("bpm", "BPM", { minWidthPx: 90, defaultWidthPx: 120, align: "right" }),
  field("genre", "Genre", { minWidthPx: 110, defaultWidthPx: 200 }),
  field("label", "Label", { minWidthPx: 100, defaultWidthPx: 180 }),
  field("year", "Year", { minWidthPx: 80, defaultWidthPx: 110, align: "right" }),
  {
    id: "status",
    header: "Status",
    hint: `Changed since you decided: ${DISPUTED_HINT}`,
    minWidthPx: 120,
    defaultWidthPx: 300,
    render: statusCell,
  },
];

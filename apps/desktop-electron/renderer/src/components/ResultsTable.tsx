import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { TrackResult } from "../mocks/types";
import {
  DEFAULT_SORT_COLUMN,
  RESULTS_COLUMNS,
  type ResultsColumnDef,
} from "../mocks/resultsColumns";
import { useScale } from "../tokens/ScaleContext";
import {
  buildGridTemplateColumns,
  clampColumnWidths,
  defaultColumnWidths,
  getColMinWidth,
  getColumnMinWidth,
  loadResultsTableLayout,
  patchResultsTableLayout,
  stickyLeftOffset,
  totalTableWidth,
} from "./resultsTableLayout";
import "./ResultsTable.css";

export interface ResultsTableProps {
  rows: TrackResult[];
  selectedIndex?: number | null;
  onSelectRow?: (playlistIndex: number) => void;
  onRowDoubleClick?: (row: TrackResult) => void;
  onToggleWrite?: (playlistIndex: number) => void;
}

type SortDir = "asc" | "desc";

function cellValue(row: TrackResult, col: ResultsColumnDef): string {
  switch (col.id) {
    case "write":
      return row.write ? "✓" : "";
    case "index":
      return String(row.playlist_index);
    case "originalTitle":
      return row.title;
    case "originalArtists":
      return row.artist;
    case "beatportTitle":
      return row.beatport_title ?? "";
    case "beatportArtists":
      return row.beatport_artists ?? "";
    case "key":
      return row.beatport_key ?? "";
    case "camelotKey":
      return row.beatport_key_camelot ?? "";
    case "releaseYear":
      return row.beatport_year ?? "";
    case "label":
      return row.beatport_label ?? "";
    case "matched":
      return row.matched ? "Yes" : "No";
    case "score":
      return row.match_score != null ? row.match_score.toFixed(1) : "";
    case "confidence":
      return row.confidence ?? "";
    case "bpm":
      return row.beatport_bpm ?? "";
    default:
      return "";
  }
}

function compareRows(a: TrackResult, b: TrackResult, col: ResultsColumnDef, dir: SortDir): number {
  const av = cellValue(a, col);
  const bv = cellValue(b, col);
  if (col.id === "index" || col.id === "score" || col.id === "bpm") {
    const an = Number.parseFloat(av) || 0;
    const bn = Number.parseFloat(bv) || 0;
    return dir === "asc" ? an - bn : bn - an;
  }
  const cmp = av.localeCompare(bv, undefined, { sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

function readRowHeight(): number {
  if (typeof document === "undefined") return 36;
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--row-height").trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 36;
}

function useColumnLayoutPersistence(scale: number) {
  const [columnWidths, setColumnWidths] = useState(
    () => loadResultsTableLayout(scale).columnWidths,
  );

  useEffect(() => {
    setColumnWidths((prev) => clampColumnWidths(prev, scale));
  }, [scale]);

  useEffect(() => {
    patchResultsTableLayout(scale, { columnWidths });
  }, [columnWidths, scale]);

  return { columnWidths, setColumnWidths };
}

export function ResultsTable({
  rows,
  selectedIndex = null,
  onSelectRow,
  onRowDoubleClick,
  onToggleWrite,
}: ResultsTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scale } = useScale();
  const [sortCol, setSortCol] = useState(DEFAULT_SORT_COLUMN);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const { columnWidths, setColumnWidths } = useColumnLayoutPersistence(scale);

  const colMin = getColMinWidth(scale);
  const gridTemplate = useMemo(() => buildGridTemplateColumns(columnWidths), [columnWidths]);
  const tableMinWidth = useMemo(() => totalTableWidth(columnWidths), [columnWidths]);
  const writeColWidth = columnWidths[0] ?? colMin;

  const sortedRows = useMemo(() => {
    const col = RESULTS_COLUMNS.find((c) => c.colIndex === sortCol) ?? RESULTS_COLUMNS[1];
    return [...rows].sort((a, b) => compareRows(a, b, col, sortDir));
  }, [rows, sortCol, sortDir]);

  // `scale` looks unused here, but `readRowHeight` reads the `--row-height`
  // CSS variable, which derives from `--scale`. The dependency is what re-reads
  // it after a scale change; drop it and virtualized rows keep the old height.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const rowHeight = useMemo(() => readRowHeight(), [scale]);

  const virtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  });

  const handleSort = (col: ResultsColumnDef) => {
    if (!col.sortable) return;
    if (sortCol === col.colIndex) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col.colIndex);
      setSortDir("asc");
    }
  };

  const startColumnResize = (colIndex: number, startX: number) => {
    const minWidth = getColumnMinWidth(colIndex, scale);
    const startWidth = columnWidths[colIndex] ?? minWidth;

    const onMove = (event: MouseEvent) => {
      const next = Math.max(minWidth, Math.round(startWidth + (event.clientX - startX)));
      setColumnWidths((prev) => {
        const copy = [...prev];
        copy[colIndex] = next;
        return copy;
      });
    };

    const onUp = () => {
      document.body.classList.remove("results-table--resizing");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    document.body.classList.add("results-table--resizing");
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const tableStyle = {
    ["--results-grid-columns" as string]: gridTemplate,
    ["--results-table-min-width" as string]: `${tableMinWidth}px`,
    ["--results-col-write" as string]: `${writeColWidth}px`,
    ["--results-col-index-left" as string]: `${stickyLeftOffset(columnWidths, 1)}px`,
  } as CSSProperties;

  return (
    <div className="results-table" style={tableStyle}>
      <div ref={scrollRef} className="results-table__scroll">
        <div className="results-table__header" role="row">
          {RESULTS_COLUMNS.map((col, colIndex) => (
            <div
              key={col.id}
              className={`results-table__header-cell-wrap ${col.sticky ? "results-table__header-cell-wrap--sticky" : ""}`}
              style={col.sticky ? { left: stickyLeftOffset(columnWidths, colIndex) } : undefined}
              data-col={col.colIndex}
            >
              <button
                type="button"
                className="results-table__header-cell"
                disabled={!col.sortable}
                title={col.label}
                onClick={() => handleSort(col)}
              >
                {col.label}
                {col.sortable && sortCol === col.colIndex && (
                  <span className="results-table__sort" aria-hidden>
                    {sortDir === "asc" ? " ▲" : " ▼"}
                  </span>
                )}
              </button>
              <button
                type="button"
                className="results-table__col-resizer"
                aria-label={`Resize ${col.label} column`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  startColumnResize(colIndex, event.clientX);
                }}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setColumnWidths((prev) => {
                    const copy = [...prev];
                    copy[colIndex] = defaultColumnWidths(scale)[colIndex] ?? colMin;
                    return copy;
                  });
                }}
              />
            </div>
          ))}
        </div>
        <div
          className="results-table__body"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const row = sortedRows[item.index] as TrackResult;
            const selected = selectedIndex === row.playlist_index;
            return (
              <div
                key={row.playlist_index}
                className={`results-table__row ${!row.matched ? "results-table__row--unmatched" : ""} ${selected ? "results-table__row--selected" : ""}`}
                style={{
                  transform: `translateY(${item.start}px)`,
                  height: `${item.size}px`,
                }}
                role="row"
                onClick={() => onSelectRow?.(row.playlist_index)}
                onDoubleClick={() => onRowDoubleClick?.(row)}
              >
                {RESULTS_COLUMNS.map((col, colIndex) => (
                  <div
                    key={col.id}
                    className={`results-table__cell ${col.sticky ? "results-table__cell--sticky" : ""}`}
                    style={col.sticky ? { left: stickyLeftOffset(columnWidths, colIndex) } : undefined}
                    data-col={col.colIndex}
                    title={col.id === "write" ? "Include when syncing tags" : cellValue(row, col)}
                    onClick={
                      col.id === "write"
                        ? (event) => {
                            event.stopPropagation();
                            if (row.error === "FILE_NOT_FOUND") return;
                            onToggleWrite?.(row.playlist_index);
                          }
                        : undefined
                    }
                  >
                    {col.id === "write" ? (
                      <input
                        type="checkbox"
                        checked={Boolean(row.write)}
                        disabled={row.error === "FILE_NOT_FOUND"}
                        aria-label={`Write tags for track ${row.playlist_index}`}
                        onChange={() => onToggleWrite?.(row.playlist_index)}
                        onClick={(event) => event.stopPropagation()}
                      />
                    ) : (
                      cellValue(row, col)
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

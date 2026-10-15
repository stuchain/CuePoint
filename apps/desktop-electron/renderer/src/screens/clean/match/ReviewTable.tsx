/**
 * The review table (the Review tab): every track of one playlist, as one plain table.
 *
 * A **tick** column (the header tick toggles every track that has a match), **Status**
 * (Matched, Check, Not found, Search failed), **Your track**, the **Beatport match** with the part
 * that differs from yours marked, and a ▶ to hear it. A ticked row is synced; an unticked row dims
 * and its match is struck through. Clicking a row, or Enter on it, opens its side panel.
 *
 * It is drawn for thousands of rows: only the rows in view exist (a fixed row height, a spacer
 * above and below), one row is in the tab order and the arrows move it, and Space on the row
 * ticks it (the ticks themselves are out of the tab order). The tab owns what is current and which
 * keys move it; this draws, reports a click and says where the rows end.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { ReviewTrack } from "../../../api/cuepointBridge.types";
import { Button } from "../../../components/Button";
import { useBeatportPreview } from "../../../components/preview/useBeatportPreview";
import { matchParts, statusLabel } from "./reviewList";

/** The row height before it has been measured, and the rows drawn beyond the ones in view. */
const ROW_HEIGHT = 42;
const OVERSCAN = 8;
/** A view not yet measured is taken to be this tall, so the first draw holds a screenful. */
const FALLBACK_VIEW = 800;

interface ReviewTableProps {
  rows: readonly ReviewTrack[];
  /** The row the cursor is on; the panel, when open, shows this one. */
  current: number | null;
  /** Bumped when a key moved the cursor with no panel open: the row takes the keyboard once it is drawn. */
  focusToken: number;
  /** Tracks the review holds that have not been read yet. */
  hasMore: boolean;
  remaining: number;
  onLoadMore: () => void;
  /** A click or Enter on a row: open its panel. */
  onOpen: (row: ReviewTrack) => void;
  onTick: (row: ReviewTrack, ticked: boolean) => void;
  /** The header tick: tick or untick every track with a match. */
  onTickAll: (ticked: boolean) => void;
  /** A tick is being sent: the header tick waits. */
  busy: boolean;
  /** Whether every track with a match is ticked, or some, from the engine's counts for the whole review. */
  allTicked: boolean;
  someTicked: boolean;
  /** Tracks with a match: none, and the header tick has nothing to do. */
  tickable: number;
}

function RowPreview({ row }: { row: ReviewTrack }) {
  const preview = useBeatportPreview(row.candidate ? { kind: "candidate", id: row.candidate.id } : null);
  if (!row.candidate) return null;
  const playing = preview.state === "playing";
  return (
    <button
      type="button"
      className="review-preview"
      aria-label={playing ? `Stop the preview of ${row.title}` : `Play the Beatport preview of ${row.title}`}
      aria-pressed={playing}
      disabled={!preview.canPreview || preview.state === "none" || preview.state === "loading"}
      onClick={preview.toggle}
    >
      <span aria-hidden>{playing ? "■" : "▶"}</span>
    </button>
  );
}

export function ReviewTable({
  rows,
  current,
  focusToken,
  hasMore,
  remaining,
  onLoadMore,
  onOpen,
  onTick,
  onTickAll,
  busy,
  allTicked,
  someTicked,
  tickable,
}: ReviewTableProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const headerTick = useRef<HTMLInputElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewHeight, setViewHeight] = useState(0);
  const [rowHeight, setRowHeight] = useState(ROW_HEIGHT);

  const measure = useCallback(() => {
    const node = tableRef.current;
    if (!node) return;
    setViewHeight(node.clientHeight);
    const first = node.querySelector<HTMLElement>("tbody tr[data-track-id]");
    const height = first?.getBoundingClientRect().height ?? 0;
    if (height > 0) setRowHeight(height);
  }, []);
  useLayoutEffect(() => {
    measure();
    const node = tableRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure]);

  const high = viewHeight > 0 ? viewHeight : FALLBACK_VIEW;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((scrollTop + high) / rowHeight) + OVERSCAN);
  const windowRows = useMemo(() => rows.slice(start, end), [rows, start, end]);

  // The row the cursor is on stays in view as the arrows move it.
  useEffect(() => {
    const node = tableRef.current;
    if (current === null || !node) return;
    const index = rows.findIndex((row) => row.track_id === current);
    if (index < 0) return;
    const top = index * rowHeight;
    if (top < node.scrollTop) node.scrollTop = top;
    else if (top + rowHeight > node.scrollTop + high) node.scrollTop = top + rowHeight - high;
  }, [current, high, rowHeight, rows]);

  // A key that moved the cursor moves the keyboard with it, once the row is drawn.
  const focused = useRef(focusToken);
  useEffect(() => {
    if (focused.current === focusToken || current === null) return;
    const row = tableRef.current?.querySelector<HTMLElement>(`[data-track-id="${current}"]`);
    if (row) {
      focused.current = focusToken;
      row.focus({ preventScroll: true });
    }
  });

  // Some, but not all, ticked: the header tick says so without a word.
  useEffect(() => {
    if (headerTick.current) headerTick.current.indeterminate = someTicked && !allTicked;
  }, [allTicked, someTicked]);

  // One row is in the tab order: the one the cursor is on, or, with it scrolled out of the rows
  // drawn, the first drawn, so the table can always be tabbed into.
  const wanted = current ?? rows[0]?.track_id ?? null;
  const tabStop = windowRows.some((row) => row.track_id === wanted) ? wanted : (windowRows[0]?.track_id ?? null);
  const columns = 5;

  return (
    <div className="review__table" ref={tableRef} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      <table className="review-table" aria-rowcount={rows.length + 1}>
        <caption className="match-visually-hidden">
          Every track of this playlist, what Beatport matched it with, and whether it will be synced
        </caption>
        <thead>
          <tr aria-rowindex={1}>
            <th scope="col" className="review-col--check">
              <input
                ref={headerTick}
                type="checkbox"
                aria-label="Tick every track with a match"
                checked={allTicked}
                disabled={tickable === 0 || busy}
                onChange={() => onTickAll(!allTicked)}
              />
            </th>
            <th scope="col" className="review-col--status">
              Status
            </th>
            <th scope="col">Your track</th>
            <th scope="col">Beatport match</th>
            <th scope="col" className="review-col--preview">
              <span className="match-visually-hidden">Preview</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {start > 0 && (
            <tr role="presentation" aria-hidden style={{ height: start * rowHeight }}>
              <td colSpan={columns} />
            </tr>
          )}
          {windowRows.map((row, offset) => {
            const parts = matchParts(row.candidate, row.differing);
            const off = !row.ticked;
            return (
              <tr
                key={row.track_id}
                data-track-id={row.track_id}
                data-status={row.status}
                aria-rowindex={start + offset + 2}
                className={`review-row${off ? " review-row--off" : ""}${current === row.track_id ? " review-row--current" : ""}`}
                aria-current={current === row.track_id ? "true" : undefined}
                // One row is in the tab order; the arrows move it, and Space on it ticks it, so the
                // table is one tab stop and not a checkbox per track.
                tabIndex={row.track_id === tabStop ? 0 : -1}
                data-owns-space=""
                onClick={(event) => {
                  // A click on a button, a tick or a link inside the row is that control's own.
                  if ((event.target as HTMLElement).closest("button, input, a")) return;
                  onOpen(row);
                }}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget || event.repeat) return;
                  // Enter on the row itself opens it; on a control inside it, the control's own.
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onOpen(row);
                  } else if (event.key === " " && row.tickable && !event.ctrlKey && !event.metaKey && !event.altKey) {
                    event.preventDefault();
                    onTick(row, !row.ticked);
                  }
                }}
              >
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Sync ${row.title} · ${row.artist}`}
                    tabIndex={-1}
                    title={row.tickable ? undefined : "No Beatport match to sync"}
                    checked={row.ticked}
                    disabled={!row.tickable}
                    onChange={(event) => onTick(row, event.target.checked)}
                  />
                </td>
                <td>
                  <span className={`review-status review-status--${row.status}`}>{statusLabel(row.status)}</span>
                  {row.disputed && (
                    <span className="review-row__disputed" title="A newer search found a different best match than the one you chose.">
                      {" "}
                      newer match differs
                    </span>
                  )}
                </td>
                <td className="review-row__yours">
                  {row.title} · {row.artist}
                </td>
                <td className={`review-row__theirs${row.candidate && off ? " review-row__theirs--off" : ""}`}>
                  {parts.length === 0
                    ? "—"
                    : parts.map((part, index) => (
                        <span key={index} className={part.differs ? "review-part--differs" : undefined}>
                          {index > 0 && " "}
                          {part.text}
                        </span>
                      ))}
                </td>
                <td className="review-row__preview">
                  <RowPreview row={row} />
                </td>
              </tr>
            );
          })}
          {end < rows.length && (
            <tr role="presentation" aria-hidden style={{ height: (rows.length - end) * rowHeight }}>
              <td colSpan={columns} />
            </tr>
          )}
        </tbody>
      </table>
      {rows.length === 0 && <p className="review__hint">Nothing here.</p>}
      {hasMore && (
        <div className="review__more">
          <Button variant="secondary" onClick={onLoadMore}>
            {`Show more (${remaining.toLocaleString()} more)`}
          </Button>
        </div>
      )}
    </div>
  );
}

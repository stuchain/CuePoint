import { useCallback, useEffect, useRef, useState } from "react";
import type { QueueItem } from "../../api/cuepointBridge.types";
import { formatTime, formatTrackMeta } from "./playerFormat";
import { useQueueWindow } from "./useQueueWindow";
import "./QueuePanel.css";

/**
 * The queue, visible (PLAYER-08, DEC-013).
 *
 * DEC-052 chose to include this panel for a specific reason: DEC-013 makes
 * "Play Next" and "Add to Queue" first-class actions, and an append whose
 * result cannot be seen is an append the user can neither verify nor undo.
 *
 * Three things shape the implementation:
 *
 * **It is a place, not a stack.** Played entries stay above the current one
 * rather than disappearing, so "what did I just play?" is answerable and
 * jumping back to a track is possible.
 *
 * **It is windowed.** A queue can hold 50,000 tracks; the panel renders the
 * rows in view and asks main for that slice (`useQueueWindow`). Rendering the
 * list would be several thousand nodes and a 14.5 MB push per update.
 *
 * **Every gesture has a keyboard equivalent.** Reordering is a drag, but drag
 * is not the only way to do it: Alt+Up/Alt+Down move a row, Delete removes it,
 * Enter plays it. That is what makes the panel usable without a mouse, and it
 * is also why the behaviour can be tested without simulating drags — the risk
 * PLAYER-08 was flagged for.
 */

/** Height of one row in CSS pixels at 1x, before the scale multiplier. */
export const QUEUE_ROW_HEIGHT = 44;

export interface QueuePanelProps {
  onClose: () => void;
}

const bridge = () => window.cuepoint?.player;

export function QueuePanel({ onClose }: QueuePanelProps) {
  const { items, offset, total, requestRange, refresh } = useQueueWindow();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [rowHeight, setRowHeight] = useState(QUEUE_ROW_HEIGHT);
  const [visible, setVisible] = useState({ start: 0, end: 30 });

  // Row height follows the app's integer scale, so the virtual geometry and
  // what is actually drawn cannot disagree.
  useEffect(() => {
    const scale = Number(document.documentElement.dataset.scale ?? "1") || 1;
    setRowHeight(QUEUE_ROW_HEIGHT * scale);
  }, []);

  const onScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const start = Math.floor(element.scrollTop / rowHeight);
    const end = start + Math.ceil(element.clientHeight / rowHeight) + 1;
    setVisible({ start, end });
    requestRange(start, end);
  }, [requestRange, rowHeight]);

  const play = useCallback(
    async (index: number) => {
      await bridge()?.jumpTo(index);
    },
    [],
  );

  const remove = useCallback(
    async (item: QueueItem) => {
      await bridge()?.removeFromQueue(item.id);
      refresh();
    },
    [refresh],
  );

  const move = useCallback(
    async (from: number, to: number) => {
      if (to < 0 || to >= total) return;
      await bridge()?.moveInQueue(from, to);
      refresh();
    },
    [refresh, total],
  );

  const onRowKeyDown = useCallback(
    (event: React.KeyboardEvent, item: QueueItem, index: number) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void play(index);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        void remove(item);
      } else if (event.altKey && event.key === "ArrowUp") {
        event.preventDefault();
        void move(index, index - 1);
      } else if (event.altKey && event.key === "ArrowDown") {
        event.preventDefault();
        void move(index, index + 1);
      }
    },
    [move, play, remove],
  );

  const dragFrom = useRef<number | null>(null);

  return (
    <aside className="cp-queue" aria-label="Playback queue">
      <header className="cp-queue__header">
        <h2 className="cp-queue__title">
          Queue{total > 0 ? ` · ${total.toLocaleString()}` : ""}
        </h2>
        <button type="button" className="cp-queue__close" onClick={onClose} aria-label="Close queue">
          ×
        </button>
      </header>

      {total === 0 ? (
        <p className="cp-queue__empty">
          Nothing queued. Playing a track fills this with what comes next.
        </p>
      ) : (
        <div
          className="cp-queue__scroll"
          ref={scrollRef}
          onScroll={onScroll}
          role="listbox"
          aria-label="Queued tracks"
          tabIndex={-1}
        >
          {/* A spacer of the full height, so the scrollbar reflects the whole
              queue while only the visible rows exist. */}
          <div className="cp-queue__sizer" style={{ height: total * rowHeight }}>
            {items.map((item, i) => {
              const index = offset + i;
              // Only the rows near the viewport are drawn; the sizer above
              // gives the scrollbar the whole queue's height.
              if (index < visible.start - 30 || index > visible.end + 30) return null;
              const playing = item.status === "playing";
              return (
                <div
                  key={item.id}
                  role="option"
                  aria-selected={playing}
                  tabIndex={0}
                  data-index={index}
                  data-status={item.status}
                  className={`cp-queue__row${playing ? " cp-queue__row--playing" : ""}${
                    item.status === "failed" ? " cp-queue__row--failed" : ""
                  }`}
                  style={{ position: "absolute", top: index * rowHeight, height: rowHeight }}
                  draggable
                  onDragStart={() => {
                    dragFrom.current = index;
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const from = dragFrom.current;
                    dragFrom.current = null;
                    if (from !== null && from !== index) void move(from, index);
                  }}
                  onDoubleClick={() => void play(index)}
                  onKeyDown={(event) => onRowKeyDown(event, item, index)}
                >
                  <span className="cp-queue__position">{index + 1}</span>
                  <span className="cp-queue__text">
                    <span className="cp-queue__row-title">{item.title || "Untitled"}</span>
                    <span className="cp-queue__row-meta">{formatTrackMeta(item)}</span>
                  </span>
                  <span className="cp-queue__duration">{formatTime(item.durationSeconds)}</span>
                  {item.status === "failed" && (
                    // DEC-054: the skip stays visible after the toast is gone.
                    <span className="cp-queue__failed" title="This track could not be played">
                      failed
                    </span>
                  )}
                  <button
                    type="button"
                    className="cp-queue__remove"
                    onClick={() => void remove(item)}
                    aria-label={`Remove ${item.title || "track"} from queue`}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}

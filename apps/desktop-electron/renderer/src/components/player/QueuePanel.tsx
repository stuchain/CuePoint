import { useCallback, useMemo, useRef, useState } from "react";
import type { QueueItem, QueueItemInput } from "../../api/cuepointBridge.types";
import { KEYS } from "../../api/keyboardShortcuts";
import { formatLength } from "../../format/durations";
import { FACTS_SEPARATOR } from "../../format/trackFacts";
import { formatCount } from "../../format/counts";
import { couldNot, quoted, UNDO } from "../../format/words";
import { NO_VALUE } from "../../words";
import { Button } from "../Button";
import { ConfirmDialog } from "../ConfirmDialog";
import { CloseButton, RemoveButton } from "../CloseButton";
import { EmptyState } from "../EmptyState";
import { escapeClosesPanel } from "../shell/shellKeyboard";
import { PixelIcon } from "../PixelIcon";
import { useRowHeight } from "../table/trackTableLayout";
import { useToast } from "../Toast";
import { TrackContextMenu, type TrackContextMenuItem } from "../TrackContextMenu";
import { KeyChip } from "../wheel/KeyChip";
import { useScaleFactor } from "../../tokens/ScaleContext";
import {
  QUEUE_ARTIST_MIN_WIDTH,
  QUEUE_DEFAULT_WIDTH,
  QUEUE_MIN_WIDTH,
  queueMaxPx,
  queueWidthPx,
  setQueueWidth1x,
  useQueueWidth,
  useWindowWidth,
} from "./queueWidth";
import { useLayerStack } from "../../hooks/useLayerStack";
import { useLeaveGhost } from "../../tokens/useLeaveGhost";
import { usePlayerValue } from "./playerStore";
import { useQueueWindow } from "./useQueueWindow";
import "./QueuePanel.css";

/**
 * The queue, visible (PLAYER-08, DEC-013).
 *
 * DEC-052 chose to include this panel for a specific reason: DEC-013 makes
 * "Play Next" and "Add to Queue" first-class actions, and an append whose
 * result cannot be seen is an append the user can neither verify nor undo.
 *
 * Four things shape the implementation:
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
 * Enter plays it, and the arrows walk the rows. A right-click (or Shift+F10)
 * opens a menu with the same four things. That is what makes the panel usable
 * without a mouse, and it is also why the behaviour can be tested without
 * simulating drags — the risk PLAYER-08 was flagged for.
 *
 * **It is as wide as Track details, and can be dragged wider (C204, D11).** The
 * width is `queueWidth.ts`'s; the panel pushes the page the way Track details does.
 */

/** An entry is one of the table's rows, on one line (queue A): title, artist when wide, key, length. */
const TABLE_ROWS_PER_ENTRY = 1;

/** A keyboard nudge of the resize handle, in pixels. */
const NUDGE_PX = 16;

/** What the queue says when a drag that did not start in it is held over it. */
const REFUSAL = "Use Play next or Add to queue";

/** The gestures, in one muted line under the head (D27, M313): a title hint made them reachable only by Tab. */
const GESTURES = "Drag to reorder · Alt+↑/↓ moves · Delete removes · Enter plays";

/** What a queue of one says, under its row (M311). Dragging from a table is refused, so it names the menus. */
const ONE_TRACK = "Add more with Play next or Add to queue.";

/** How long letters typed in the list build one word for type-ahead (M481), in ms. */
const TYPE_AHEAD_MS = 700;

interface QueuePanelProps {
  onClose: () => void;
}

const bridge = () => window.cuepoint?.player;

/** A queued track as the queue takes it in, for Undo of a removal. */
function toInput(queued: QueueItem): QueueItemInput {
  return {
    trackId: queued.trackId,
    filePath: queued.filePath,
    title: queued.title,
    artist: queued.artist,
    key: queued.key,
    bpm: queued.bpm,
    label: queued.label ?? null,
    year: queued.year ?? null,
    durationSeconds: queued.durationSeconds,
  };
}

/** The reason a track did not play, as a sentence of its own: "Could not play. The file is missing." */
function failureLine(failure: string | undefined): string {
  const reason = failure?.trim();
  if (!reason) return couldNot("play this track");
  const sentence = reason.charAt(0).toUpperCase() + reason.slice(1);
  return `${couldNot("play")} ${/[.!?]$/.test(sentence) ? sentence : `${sentence}.`}`;
}

/**
 * A row's artist and label (queue A): one more column of the row's one line, shown only when the panel
 * is wide enough (`QUEUE_ARTIST_MIN_WIDTH`), and cut with "..." before the title is.
 */
function QueueArtist({ item }: { item: QueueItem }) {
  const lead = [item.artist, item.label ?? ""].map((part) => part.trim()).filter((part) => part !== "");
  return (
    <span className="cp-queue__row-meta cp-data" data-cut-hint="">
      {lead.join(FACTS_SEPARATOR)}
    </span>
  );
}

/** The key column (queue A): the chip, or nothing, always the chip's width so the lengths line up. */
function QueueKey({ item }: { item: QueueItem }) {
  const key = (item.key ?? "").trim();
  return <span className="cp-queue__key">{key ? <KeyChip value={key} /> : null}</span>;
}

interface QueueMenu {
  x: number;
  y: number;
  item: QueueItem;
  index: number;
}

export function QueuePanel({ onClose }: QueuePanelProps) {
  const { items, offset, total, requestRange, refresh } = useQueueWindow();
  const scrollRef = useRef<HTMLDivElement>(null);
  // The table's row height, so the queue follows the size and Row density as the
  // tables do (R4-1); measured from the stylesheet, so geometry and drawing agree.
  const rowHeight = useRowHeight() * TABLE_ROWS_PER_ENTRY;
  const [visible, setVisible] = useState({ start: 0, end: 30 });
  // Rows above the playing one were played: they read dimmer, as a table's played rows do (M312).
  const playingIndex = usePlayerValue((state) => (state?.queue.currentItem ? state.queue.currentIndex : -1));

  // The width is kept in 1x units and drawn times the text size (C204).
  const scale = useScaleFactor();
  const width1x = useQueueWidth();
  const windowWidth = useWindowWidth();
  const width = queueWidthPx(width1x, scale, windowWidth);
  const [resizing, setResizing] = useState(false);

  // Escape is the newest layer's (M469): a menu or the Clear question opened over the queue answers it first.
  const isTopLayer = useLayerStack(true);
  // The queue is unmounted when it closes (RightColumn): it leaves as a still copy marked
  // `[data-leaving]`, which plays the side panel's exit (M380).
  const panelRef = useRef<HTMLElement>(null);
  useLeaveGhost(panelRef);

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

  const { push } = useToast();

  // Removing is at once; the toast's Undo puts the track back in the same place (appended, then
  // moved to where it was). A track that was playing comes back as a queued one.
  const remove = useCallback(
    async (item: QueueItem) => {
      const was = items.findIndex((candidate) => candidate.id === item.id);
      const index = was >= 0 ? offset + was : -1;
      const lengthBefore = total;
      await bridge()?.removeFromQueue(item.id);
      refresh();
      if (index < 0) return;
      push(`Removed ${item.title ? quoted(item.title) : "the track"} from the queue`, "success", {
        label: UNDO,
        onClick: () => {
          void (async () => {
            // A refusal is said, not left as an unhandled rejection (M383).
            try {
              await bridge()?.addToQueue([toInput(item)]);
              // Appended last; the queue was one shorter, so it sits at the old length - 1.
              if (index < lengthBefore - 1) await bridge()?.moveInQueue(lengthBefore - 1, index);
            } catch {
              push(`${couldNot("put the track back")}`, "error");
            }
            refresh();
          })();
        },
      });
    },
    [items, offset, push, refresh, total],
  );

  const move = useCallback(
    async (from: number, to: number) => {
      if (to < 0 || to >= total) return;
      await bridge()?.moveInQueue(from, to);
      refresh();
    },
    [refresh, total],
  );

  // The user's own selection (the playing row is marked apart, with aria-current). One row is in
  // the tab order: the selected one, else the playing one, else the first.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rowElements = useRef(new Map<string, HTMLElement>());
  const activeId =
    selectedId ?? items.find((candidate) => candidate.status === "playing")?.id ?? items[0]?.id ?? null;

  /** Selects the row at a queue index and brings focus to it, scrolling it into view. */
  const select = useCallback(
    (index: number) => {
      const target = items[index - offset];
      if (!target) return;
      setSelectedId(target.id);
      const scroller = scrollRef.current;
      if (scroller) {
        const top = index * rowHeight;
        if (top < scroller.scrollTop) scroller.scrollTop = top;
        else if (top + rowHeight > scroller.scrollTop + scroller.clientHeight) {
          scroller.scrollTop = top + rowHeight - scroller.clientHeight;
        }
      }
      rowElements.current.get(target.id)?.focus({ preventScroll: true });
    },
    [items, offset, rowHeight],
  );

  const [menu, setMenu] = useState<QueueMenu | null>(null);
  const openMenu = useCallback((item: QueueItem, index: number, x: number, y: number) => {
    setSelectedId(item.id);
    setMenu({ x, y, item, index });
  }, []);

  const menuItems = useMemo<TrackContextMenuItem[]>(() => {
    if (!menu) return [];
    const { item, index } = menu;
    return [
      { id: "play", label: "Play", shortcut: KEYS.play, onSelect: () => void play(index) },
      {
        id: "up",
        label: "Move up",
        shortcut: "Alt+Up",
        disabled: index === 0,
        reason: "It is the first track",
        onSelect: () => void move(index, index - 1),
      },
      {
        id: "down",
        label: "Move down",
        shortcut: "Alt+Down",
        disabled: index >= total - 1,
        reason: "It is the last track",
        onSelect: () => void move(index, index + 1),
      },
      {
        id: "remove",
        label: "Remove from the queue",
        shortcut: KEYS.remove,
        separatorBefore: true,
        onSelect: () => void remove(item),
      },
    ];
  }, [menu, move, play, remove, total]);

  // Type-ahead (D33, M481): letters build a word that moves to the next loaded row whose title starts with it.
  const typed = useRef({ text: "", timer: 0 });
  const typeAhead = useCallback(
    (letter: string, from: number) => {
      window.clearTimeout(typed.current.timer);
      typed.current.text += letter.toLowerCase();
      typed.current.timer = window.setTimeout(() => {
        typed.current.text = "";
      }, TYPE_AHEAD_MS);
      const word = typed.current.text;
      // One repeated letter cycles through the titles that start with it.
      const key = /^(.)\1+$/.test(word) ? word[0]! : word;
      const start = key.length === 1 ? from + 1 : from;
      for (let step = 0; step < items.length; step += 1) {
        const at = (((start - offset + step) % items.length) + items.length) % items.length;
        if ((items[at]!.title ?? "").toLowerCase().startsWith(key)) {
          select(offset + at);
          return;
        }
      }
    },
    [items, offset, select],
  );

  const onRowKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>, item: QueueItem, index: number) => {
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
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        select(Math.max(0, Math.min(total - 1, index + (event.key === "ArrowDown" ? 1 : -1))));
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        select(event.key === "Home" ? 0 : total - 1);
      } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault();
        const box = event.currentTarget.getBoundingClientRect();
        openMenu(item, index, box.left + box.width / 2, box.bottom);
      } else if (event.key.length === 1 && (event.key !== " " || typed.current.text !== "") && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        typeAhead(event.key, index);
      }
    },
    [move, openMenu, play, remove, select, total, typeAhead],
  );

  const dragFrom = useRef<number | null>(null);
  // Where a drop would land, for the accent line (BAR-8); null when not dragging.
  const [dropAt, setDropAt] = useState<number | null>(null);
  // A drag from somewhere else is over the list: it is refused, and the list says so (C187).
  const [refusing, setRefusing] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const clear = useCallback(async () => {
    setConfirmingClear(false);
    await bridge()?.clearQueue();
    refresh();
  }, [refresh]);

  const startResize = useCallback(
    (startX: number) => {
      const startWidth = width;
      // Dragging the left edge leftwards widens the panel.
      const onMove = (event: MouseEvent) => {
        setQueueWidth1x((startWidth + (startX - event.clientX)) / scale);
      };
      const onUp = () => {
        setResizing(false);
        document.body.classList.remove("cp-queue-resizing");
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      setResizing(true);
      document.body.classList.add("cp-queue-resizing");
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [scale, width],
  );

  const nudge = useCallback(
    (delta: number) => setQueueWidth1x((width + delta) / scale),
    [scale, width],
  );

  return (
    <aside
      ref={panelRef}
      className="cp-queue"
      aria-label="Playback queue"
      style={{ width: `${width}px` }}
      data-width={width}
      data-wide={width >= QUEUE_ARTIST_MIN_WIDTH * scale ? "" : undefined}
      // Escape closes the panel that has focus (C29).
      onKeyDown={(event) => {
        if (onClose && escapeClosesPanel(event) && isTopLayer()) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      {/* A separator role rather than a button: a resize handle that the arrow keys also move. */}
      <div
        className={`cp-queue__handle${resizing ? " cp-queue__handle--active" : ""}`}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the queue"
        aria-valuemin={Math.round(QUEUE_MIN_WIDTH * scale)}
        aria-valuemax={queueMaxPx(scale, windowWidth)}
        aria-valuenow={width}
        tabIndex={0}
        onMouseDown={(event) => {
          event.preventDefault();
          startResize(event.clientX);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            nudge(NUDGE_PX);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            nudge(-NUDGE_PX);
          } else if (event.key === "Enter") {
            // Enter puts the width back, as it does on Track details (M359).
            event.preventDefault();
            setQueueWidth1x(QUEUE_DEFAULT_WIDTH);
          }
        }}
      />

      <header className="cp-panel-header cp-side-head cp-queue__header">
        <h2 className="cp-panel-header__title cp-queue__title">
          <span className="cp-queue__name">Queue</span>
          {/* The name, then its count in grey (area 58): never joined to it with a dot. */}
          {total > 0 && <span className="cp-queue__count cp-data">{formatCount(total)}</span>}
        </h2>
        {/* Quiet (M312): Clear queue is not the loudest control in the panel; it asks before it clears. */}
        {total > 1 && (
          <Button variant="quiet" size="sm" className="cp-queue__clear" onClick={() => setConfirmingClear(true)}>
            Clear queue…
          </Button>
        )}
        <CloseButton onClick={onClose} aria-label="Close the queue" />
        {/* The gestures, once and muted, at the foot of the head (D27, M313; queue H1): in the band the
            page's taller header leaves, so the head's line stays on the page header's line. */}
        {total > 0 && <p className="cp-queue__gestures">{GESTURES}</p>}
      </header>

      <ConfirmDialog
        open={confirmingClear}
        title="Clear queue?"
        confirmLabel="Clear queue"
        danger
        onConfirm={() => void clear()}
        onCancel={() => setConfirmingClear(false)}
      >
        The playing track keeps playing.
      </ConfirmDialog>

      {total === 0 ? (
        <EmptyState
          compact
          headline="Nothing queued"
          description="Playing a track fills this with what comes next."
        />
      ) : (
        <div
          className="cp-queue__scroll"
          ref={scrollRef}
          onScroll={onScroll}
          role="listbox"
          aria-label="Queued tracks"
          tabIndex={-1}
          data-refusing={refusing ? "" : undefined}
          onDragOver={(event) => {
            // A drag that did not start on a queue row is refused over the whole list, the gaps
            // between rows and the space under them included (N1). A row's own drag passes by.
            if (dragFrom.current !== null) return;
            if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
            setRefusing(true);
          }}
          onDragLeave={(event) => {
            // Only leaving the list itself ends the refusal, not crossing from one row to the next.
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setRefusing(false);
          }}
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
              const played = !playing && playingIndex >= 0 && index < playingIndex;
              const selected = item.id === selectedId;
              return (
                <div
                  key={item.id}
                  ref={(element) => {
                    if (element) rowElements.current.set(item.id, element);
                    else rowElements.current.delete(item.id);
                  }}
                  role="option"
                  aria-selected={selected}
                  aria-current={playing ? "true" : undefined}
                  tabIndex={item.id === activeId ? 0 : -1}
                  data-index={index}
                  data-status={item.status}
                  className={`cp-queue__row${playing ? " cp-queue__row--playing" : ""}${played ? " cp-queue__row--played" : ""}${
                    selected ? " cp-queue__row--selected" : ""
                  }${item.status === "failed" ? " cp-queue__row--failed" : ""}`}
                  style={{ position: "absolute", top: index * rowHeight, height: rowHeight }}
                  draggable
                  onClick={() => setSelectedId(item.id)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    openMenu(item, index, event.clientX, event.clientY);
                  }}
                  onDragStart={() => {
                    dragFrom.current = index;
                  }}
                  onDragOver={(event) => {
                    // Not a queue row (a track from a table, or a file): the list refuses it (N1).
                    if (dragFrom.current === null) return;
                    event.preventDefault();
                    if (dragFrom.current !== index) setDropAt(index);
                  }}
                  onDragEnd={() => {
                    dragFrom.current = null;
                    setDropAt(null);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setRefusing(false);
                    const from = dragFrom.current;
                    dragFrom.current = null;
                    setDropAt(null);
                    if (from !== null && from !== index) void move(from, index);
                  }}
                  onDoubleClick={() => void play(index)}
                  onKeyDown={(event) => onRowKeyDown(event, item, index)}
                >
                  {/* The one drag handle (C187): the grip, as in every list that reorders; none on a lone row (M311). */}
                  {total > 1 && (
                    <span className="cp-queue__grip" aria-hidden="true">
                      <PixelIcon name="grip" size="sm" />
                    </span>
                  )}
                  {/* The playing row shows the speaker in place of its number, as a table's mark column does (M310). */}
                  <span className="cp-queue__position">
                    {playing ? <PixelIcon name="volume" size="sm" className="cp-queue__playing-icon" /> : index + 1}
                  </span>
                  <span className="cp-queue__text">
                    {playing && <span className="cp-visually-hidden">Now playing: </span>}
                    <span className="cp-queue__row-title" data-cut-hint="">
                      {item.title || NO_VALUE}
                    </span>
                    {item.status === "failed" ? (
                      // DEC-054: the skip stays visible after the toast is gone,
                      // and BAR-9 says why, as text and not only a title. It
                      // takes the artist's place so the row keeps its height.
                      <span className="cp-queue__row-meta cp-queue__failed">{failureLine(item.failure)}</span>
                    ) : (
                      <QueueArtist item={item} />
                    )}
                  </span>
                  {item.status !== "failed" && <QueueKey item={item} />}
                  <span className="cp-queue__duration">{formatLength(item.durationSeconds)}</span>
                  {/* Not a tab stop (M467): the row is the one control, and Delete removes it. */}
                  <RemoveButton
                    tabIndex={-1}
                    className="cp-queue__remove"
                    onClick={(event) => {
                      event.stopPropagation();
                      void remove(item);
                    }}
                    aria-label={`Remove ${item.title || "track"} from the queue`}
                  />
                </div>
              );
            })}
            {dropAt !== null && dragFrom.current !== null && (
              // Where the dragged row would land (BAR-8): below the row it
              // moves down onto, above the row it moves up onto. No animation.
              <div
                className="cp-queue__drop"
                aria-hidden="true"
                style={{ top: (dropAt > dragFrom.current ? dropAt + 1 : dropAt) * rowHeight }}
              />
            )}
          </div>
          {/* A queue of one has nothing to reorder: it says how tracks get here (M311). */}
          {total === 1 && <p className="cp-queue__one">{ONE_TRACK}</p>}
          {refusing && (
            <div className="cp-queue__refusal" aria-hidden="true">
              {REFUSAL}
            </div>
          )}
        </div>
      )}

      {menu && (
        <TrackContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          label={menu.item.title ? `Queued track ${quoted(menu.item.title)}` : "Queued track"}
          onClose={() => setMenu(null)}
        />
      )}
    </aside>
  );
}

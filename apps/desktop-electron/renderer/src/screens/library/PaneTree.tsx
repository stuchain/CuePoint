/**
 * The tree both sections of the Library pane are drawn with (ORG-09, DEC-062).
 *
 * LIBUI-07 built one tree, for Rekordbox's mirror. ORG-09 adds a second, for
 * CuePoint's own Collections, and the two are the same widget with different
 * affordances: rows, indentation, twisties, a roving tab stop, and the arrow
 * keys that make a tree a tree. Only what a section is *allowed to do* differs
 * — the Rekordbox one passes none of the optional handlers and is therefore
 * exactly as read-only as it was.
 *
 * It is a tree by the ARIA definition and behaves like one: arrows move and
 * open, Enter and Space select, and exactly one row is in the tab order, so a
 * keyboard reaches the tree in one Tab and moves inside it with arrows.
 *
 * Rows are handed in already flattened. Building them from a tree is the
 * caller's, because the two sections identify their nodes differently — a
 * Rekordbox playlist by path, which survives the refresh that renumbers it,
 * and a Collection by id, which survives the rename that moves it.
 */
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { PixelIcon } from "../../components/PixelIcon";
import type { PixelIconName } from "../../components/pixelIcons";
import "./PlaylistPane.css";

export interface PaneTreeRow {
  /** Stable identity: the focus, the selection and the drop target use it. */
  key: string;
  /** What the row is called. */
  name: string;
  icon: PixelIconName;
  /** Indentation, counting from the roots. */
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  /** Shown at the right, when there is a number worth showing. */
  count?: number | null;
  /** Hover text, when the name alone is not the whole truth. */
  title?: string;
  /** `data-kind`, for tests and for CSS that differs per kind. */
  kind?: string;
  /** Drawn after the name — a broken marker, a rule count, a chip. */
  badge?: ReactNode;
  /** Whether this row may be picked up. Off unless a section says otherwise. */
  draggable?: boolean;
  /** Whether this row may be dropped onto right now. */
  droppable?: boolean;
}

export interface PaneTreeProps {
  /** The accessible name of the tree itself. */
  label: string;
  rows: PaneTreeRow[];
  /** The key of the selected row, or null when the selection is elsewhere. */
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onExpand: (key: string, expanded: boolean) => void;

  // ---- everything below is optional; a read-only section passes none ----

  /** The row being renamed, drawn as a text field instead of a name. */
  renamingKey?: string | null;
  onRenameCommit?: (key: string, name: string) => void;
  onRenameCancel?: () => void;
  /** Trailing controls for a row — the section decides what they are. */
  actions?: (row: PaneTreeRow) => ReactNode;
  onRowKeyDown?: (key: string, event: KeyboardEvent<HTMLElement>) => void;
  onDragStart?: (key: string, event: React.DragEvent<HTMLElement>) => void;
  onDragEnd?: () => void;
  onDragOver?: (key: string, event: React.DragEvent<HTMLElement>) => void;
  onDragLeave?: (key: string, event: React.DragEvent<HTMLElement>) => void;
  onDrop?: (key: string, event: React.DragEvent<HTMLElement>) => void;
  /** The row a drop would land on, drawn as the target. */
  dropTargetKey?: string | null;
  /**
   * A row above the tree that is still part of it — "All tracks", which is
   * every scope and none of them. Drawn at level 1 with no indentation, and
   * in the arrow-key order, because a keyboard walking the tree has to be able
   * to walk back out of it to the thing that clears the scope.
   */
  leadingRow?: PaneTreeRow | null;
  /** Rendered after the rows — an empty state, a note. */
  children?: ReactNode;
}

export function PaneTree({
  label,
  rows,
  selectedKey,
  onSelect,
  onExpand,
  renamingKey = null,
  onRenameCommit,
  onRenameCancel,
  actions,
  onRowKeyDown,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  dropTargetKey = null,
  leadingRow = null,
  children,
}: PaneTreeProps) {
  // The row that carries the tab stop. A tree is one stop, not one per node.
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const keys = [
    ...(leadingRow ? [leadingRow.key] : []),
    ...rows.map((row) => row.key),
  ];
  const first = keys[0] ?? null;

  // A folder that closed, or a node a reload removed, can take the tab stop's
  // row with it. Derived rather than corrected in an effect, so the tree is
  // never rendered for even one frame with no way into it.
  const tabStop = focusKey !== null && keys.includes(focusKey) ? focusKey : first;

  const focusRow = (key: string) => {
    setFocusKey(key);
    const selector = `[data-tree-key="${CSS.escape(key)}"]`;
    containerRef.current?.querySelector<HTMLElement>(selector)?.focus();
  };

  const move = (from: string, delta: 1 | -1) => {
    const index = keys.indexOf(from);
    const next = keys[index + delta];
    if (next !== undefined) focusRow(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>, row: PaneTreeRow) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(row.key, 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(row.key, -1);
        break;
      case "ArrowRight":
        event.preventDefault();
        if (row.hasChildren && !row.expanded) onExpand(row.key, true);
        else if (row.hasChildren) move(row.key, 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        if (row.hasChildren && row.expanded) onExpand(row.key, false);
        else move(row.key, -1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        onSelect(row.key);
        break;
      default:
        onRowKeyDown?.(row.key, event);
        break;
    }
  };

  return (
    <div ref={containerRef} className="cp-playlist-pane__tree" role="tree" aria-label={label}>
      {leadingRow && (
        <div
          role="treeitem"
          aria-level={1}
          aria-selected={selectedKey === leadingRow.key}
          data-tree-key={leadingRow.key}
          tabIndex={tabStop === leadingRow.key ? 0 : -1}
          className={`cp-playlist-pane__row${
            selectedKey === leadingRow.key ? " cp-playlist-pane__row--selected" : ""
          }`}
          onClick={() => {
            setFocusKey(leadingRow.key);
            onSelect(leadingRow.key);
          }}
          onKeyDown={(event) => onKeyDown(event, leadingRow)}
        >
          <span className="cp-playlist-pane__twisty" aria-hidden />
          <PixelIcon name={leadingRow.icon} className="cp-playlist-pane__icon" />
          <span className="cp-playlist-pane__name">{leadingRow.name}</span>
          {leadingRow.count != null && (
            <span className="cp-playlist-pane__count">
              {leadingRow.count.toLocaleString()}
            </span>
          )}
        </div>
      )}

      {rows.map((row) => {
        const isSelected = selectedKey === row.key;
        const isTarget = dropTargetKey === row.key;
        const classes = [
          "cp-playlist-pane__row",
          isSelected ? "cp-playlist-pane__row--selected" : "",
          isTarget ? "cp-playlist-pane__row--drop" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <div
            key={row.key}
            role="treeitem"
            aria-level={row.depth + 2}
            aria-selected={isSelected}
            aria-expanded={row.hasChildren ? row.expanded : undefined}
            data-tree-key={row.key}
            data-kind={row.kind}
            tabIndex={tabStop === row.key ? 0 : -1}
            draggable={row.draggable === true}
            style={{ paddingLeft: `calc(var(--space-sm) + ${row.depth} * var(--space-md))` }}
            className={classes}
            onClick={() => {
              setFocusKey(row.key);
              onSelect(row.key);
            }}
            onKeyDown={(event) => onKeyDown(event, row)}
            onDragStart={onDragStart ? (event) => onDragStart(row.key, event) : undefined}
            onDragEnd={onDragEnd}
            onDragOver={onDragOver ? (event) => onDragOver(row.key, event) : undefined}
            onDragLeave={onDragLeave ? (event) => onDragLeave(row.key, event) : undefined}
            onDrop={onDrop ? (event) => onDrop(row.key, event) : undefined}
          >
            {row.hasChildren ? (
              <button
                type="button"
                className="cp-playlist-pane__twisty"
                aria-label={`${row.expanded ? "Collapse" : "Expand"} ${row.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onExpand(row.key, !row.expanded);
                }}
              >
                {row.expanded ? "▾" : "▸"}
              </button>
            ) : (
              <span className="cp-playlist-pane__twisty" aria-hidden />
            )}

            <PixelIcon name={row.icon} className="cp-playlist-pane__icon" />

            {renamingKey === row.key && onRenameCommit ? (
              <RenameField
                initial={row.name}
                onCommit={(name) => onRenameCommit(row.key, name)}
                onCancel={() => onRenameCancel?.()}
              />
            ) : (
              <span className="cp-playlist-pane__name" title={row.title ?? row.name}>
                {row.name}
              </span>
            )}

            {row.badge}

            {row.count != null && (
              <span className="cp-playlist-pane__count">{row.count.toLocaleString()}</span>
            )}

            {actions?.(row)}
          </div>
        );
      })}

      {children}
    </div>
  );
}

/**
 * The inline rename field.
 *
 * Enter commits, Escape abandons, and losing focus commits — because a click
 * elsewhere after typing a name means the name, and throwing it away would be
 * the surprising reading. An unchanged or empty name is abandoned rather than
 * sent: renaming something to what it is called is not a change, and the
 * engine would refuse the empty one anyway.
 */
function RenameField({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);

  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    const name = value.trim();
    if (commit && name && name !== initial) onCommit(name);
    else onCancel();
  };

  return (
    <input
      className="cp-playlist-pane__rename"
      aria-label={`Rename ${initial}`}
      value={value}
      autoFocus
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          finish(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
        }
      }}
    />
  );
}

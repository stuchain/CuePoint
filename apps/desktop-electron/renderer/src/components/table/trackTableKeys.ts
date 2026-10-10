/**
 * What a key press means to a track table, decided without the DOM.
 *
 * The table owns a cursor, not a selection: each move is reported to the screen
 * as the click the same move would have been, so Up/Down is a plain click on the
 * next row and Shift+Up/Down is a Shift-click. That keeps every screen's
 * selection rules, including a range across rows that have not loaded, in one
 * place instead of two.
 */
import { hasShortcutModifier } from "../shell/platformKeys";

/** The modifiers every screen's selection hook reads from a click. */
export interface RowSelectModifiers {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export interface RowKeyEvent extends RowSelectModifiers {
  key: string;
  altKey: boolean;
}

export type RowKeyCommand =
  | { kind: "move"; to: number; extend: boolean }
  | { kind: "toggle" }
  | { kind: "selectAll" }
  | null;

export interface RowKeyContext {
  /** The row the keyboard is on, or null before any key or click. */
  cursor: number | null;
  total: number;
  pageSize: number;
  /** Whether the caller gave the table a Select all to call. */
  canSelectAll: boolean;
}

/**
 * The command a key stands for, or null when the key is not the table's.
 *
 * Ctrl or Cmd with the arrows belongs to the player, Alt with them to
 * reordering, plain Space to play/pause and Escape to the screen; none is
 * claimed here. A move onto the row the cursor is already on is still a move
 * (the table swallows the key so the browser does not scroll) and the table
 * decides it has nothing to report.
 */
export function rowKeyCommand(event: RowKeyEvent, context: RowKeyContext): RowKeyCommand {
  const { cursor, total, pageSize, canSelectAll } = context;
  if (total <= 0 || event.altKey) return null;

  if (event.ctrlKey || event.metaKey) {
    if (!hasShortcutModifier(event) || event.shiftKey) return null;
    if (event.key.toLowerCase() === "a") return canSelectAll ? { kind: "selectAll" } : null;
    if (event.key === " ") return cursor == null ? null : { kind: "toggle" };
    return null;
  }

  const last = total - 1;
  const clamp = (row: number) => Math.min(Math.max(row, 0), last);
  const extend = event.shiftKey;
  switch (event.key) {
    case "ArrowDown":
      return { kind: "move", to: cursor == null ? 0 : clamp(cursor + 1), extend };
    case "ArrowUp":
      return { kind: "move", to: cursor == null ? 0 : clamp(cursor - 1), extend };
    case "Home":
      return { kind: "move", to: 0, extend };
    case "End":
      return { kind: "move", to: last, extend };
    case "PageDown":
      return { kind: "move", to: clamp((cursor ?? 0) + pageSize), extend };
    case "PageUp":
      return { kind: "move", to: clamp((cursor ?? 0) - pageSize), extend };
    default:
      return null;
  }
}

/** Rows to move for Page Up and Page Down: a screenful, less one row of context. */
export function pageSizeFor(viewportHeight: number, headerHeight: number, rowHeight: number): number {
  if (!(rowHeight > 0)) return 1;
  return Math.max(1, Math.floor((viewportHeight - headerHeight) / rowHeight) - 1);
}

/**
 * The scroll offset that brings a row fully into view below the sticky header,
 * or null when it already is.
 *
 * The virtualizer's own scrollToIndex does not know the header sits inside the
 * scroller, so moving down leaves the row about one header's height too low.
 */
export function revealOffset(
  index: number,
  rowHeight: number,
  headerHeight: number,
  scrollTop: number,
  viewportHeight: number,
): number | null {
  const top = headerHeight + index * rowHeight;
  const bottom = top + rowHeight;
  if (top < scrollTop + headerHeight) return Math.max(0, index * rowHeight);
  if (bottom > scrollTop + viewportHeight) return Math.max(0, bottom - viewportHeight);
  return null;
}

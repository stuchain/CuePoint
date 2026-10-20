/**
 * The page's state a Set table cell reaches (FLW-17, FLW-18): the context and
 * its shape, apart from the cells so that file exports only components.
 */
import { createContext } from "react";

import type { SetChapterPlan } from "../../api/cuepointBridge.types";
import type { EntryButton, EntryButtonId } from "./entryActions";
import type { EntryRow } from "./prepareRows";
import type { TimeField, TimeTarget } from "./timeEditing";

/**
 * A double-click's length (shared): the entry buttons let the pointer through to the row for this
 * long after they appear, and hold a mouse click on Remove back for it, so a double-click aimed at
 * the row plays it.
 */
export { DOUBLE_CLICK_MS } from "../../hooks/useDoubleClickGrace";

/** How a save ended: written, nothing to write, or refused. */
export type TimeSaveResult = "saved" | "unchanged" | "refused";

export interface PrepareEditing {
  /** The cell being typed in, if any. */
  editing: TimeTarget | null;
  /** True while the cell typed in holds a time the engine refused. */
  invalid: boolean;
  startTimeEdit: (entryId: number, field: TimeField) => void;
  /**
   * Save what was typed, then move on: to the next cell (1), the one before
   * (-1), or nowhere (0). A refusal leaves the cell as it is.
   */
  commitTime: (entryId: number, field: TimeField, text: string, move: 1 | -1 | 0) => Promise<TimeSaveResult>;
  /**
   * Stop typing without saving; `keepWords` leaves a refusal on the facts line.
   * With `only`, only if that cell is still the one typed in.
   */
  stopTimeEdit: (keepWords: boolean, only?: TimeTarget) => void;
  /**
   * The entry buttons for the selected entries (none with nothing selected), the one entry
   * they are drawn on (the focused one), and what pressing one does (DEC-249).
   */
  entryButtons: {
    buttons: EntryButton[];
    entryId: number | null;
    press: (id: EntryButtonId) => void;
    /** Opens the entry's context menu at a point: what the "Actions ▾" button does when the row has no room for the five. */
    openMenu: (row: EntryRow, anchor: { x: number; y: number }) => void;
    /** The least width the selected row's title keeps (about 5 characters), in px at the current scale: the buttons never take it (DEC-249). */
    titleMinWidth: number;
  };
  /** The chapter heading's Edit… button's action. */
  chapters: {
    edit: (chapter: SetChapterPlan) => void;
  };
}

export const PrepareEditingContext = createContext<PrepareEditing | null>(null);

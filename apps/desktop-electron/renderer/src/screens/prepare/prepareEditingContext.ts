/**
 * The page's state a Set table cell reaches (FLW-17, FLW-18): the context and
 * its shape, apart from the cells so that file exports only components.
 */
import { createContext } from "react";

import type { SetChapterPlan } from "../../api/cuepointBridge.types";
import type { TimeField, TimeTarget } from "./timeEditing";

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
  /** The chapter buttons' actions, and how many chapters there are. */
  chapters: {
    count: number;
    edit: (chapter: SetChapterPlan) => void;
    move: (chapter: SetChapterPlan, delta: -1 | 1) => void;
    remove: (chapter: SetChapterPlan) => void;
  };
}

export const PrepareEditingContext = createContext<PrepareEditing | null>(null);

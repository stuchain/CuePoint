/**
 * What can be done with Beatport rows, by what is selected (DISCOVER-10).
 *
 * One list for both surfaces, as ORG-11 made the Library's: the toolbar under
 * a table draws these as buttons, and a right-click draws the same entries as
 * a menu. A list per surface would be two lists to keep in step, and the
 * second would drift.
 *
 * **Rows from Beatport are not library rows.** Nothing here plays, tags or
 * collects: a track a user does not own has no file and no `tracks` row
 * (DEC-093, DEC-097). What it can do is be wanted, be pushed to a playlist on
 * Beatport, and be opened there.
 */
import type { WantlistRow } from "../../api/cuepointBridge.types";

export type BeatportActionId =
  | "add_to_wantlist"
  | "push"
  | "open"
  | "note"
  | "bought"
  | "unbought"
  | "remove";

export interface BeatportAction {
  id: BeatportActionId;
  label: string;
  disabled: boolean;
  /** Why it is disabled, for the control's hint. */
  reason: string | null;
  /** A few words beside the control: "All 48 shown", "3 selected" (DEC-209). */
  note: string | null;
}

/**
 * The most Beatport pages "Open on Beatport" opens at once.
 *
 * Each is a browser tab. Ten is a handful of tracks to compare; a hundred is a
 * click nobody meant, and the browser pays for it.
 */
export const MAX_OPEN_PAGES = 10;

/** The reason an action that works on rows waits for them. */
const SELECT_FIRST = "Select tracks in the table first.";

interface ActionContext {
  /** Whether Beatport can be asked: a playlist needs a token it accepts. */
  pushable: boolean;
  /** Why a playlist is not offered, when it is not. */
  pushReason: string | null;
  /** Rows the table shows, for a playlist of everything shown. */
  total: number;
}

function action(
  id: BeatportActionId,
  label: string,
  reason: string | null = null,
  note: string | null = null,
): BeatportAction {
  return { id, label, disabled: reason !== null, reason, note };
}

/** What the table's rows are asked to be: needs some selected, or does not mind. */
function needsRows(
  id: BeatportActionId,
  label: string,
  count: number,
  elseReason: string | null = null,
): BeatportAction {
  return action(id, label, count === 0 ? SELECT_FIRST : elseReason);
}

/**
 * "Make a Beatport playlist…" (DSC-7). It stays enabled with nothing selected,
 * and then takes every row the table shows, as the push always did; the note
 * beside it says which it will be.
 */
function push(count: number, context: ActionContext): BeatportAction {
  const label = "Make a Beatport playlist…";
  if (!context.pushable) return action("push", label, context.pushReason);
  if (count === 0 && context.total === 0) {
    return action("push", label, "Nothing to put in a playlist.");
  }
  return action("push", label, null, count > 0 ? `${count} selected` : `All ${context.total} shown`);
}

function open(count: number): BeatportAction {
  return needsRows(
    "open",
    "Open on Beatport",
    count,
    count > MAX_OPEN_PAGES ? `Opens at most ${MAX_OPEN_PAGES} pages at once.` : null,
  );
}

/**
 * A search's table. Always the same three actions (DEC-209): those that need
 * rows are disabled, with the reason, until some are selected.
 */
export function runActions(count: number, context: ActionContext): BeatportAction[] {
  return [
    needsRows("add_to_wantlist", "Add to wantlist", count),
    push(count, context),
    open(count),
  ];
}

/**
 * The wantlist. As a search's table, plus what only a wanted track has: a note,
 * a bought mark, and leaving the list. All are always shown.
 *
 * "Mark bought" becomes "Mark not bought" when everything selected is already
 * marked, so the one button undoes a mistaken mark rather than repeating it.
 */
export function wantlistActions(
  selected: readonly Pick<WantlistRow, "bought_at">[],
  context: ActionContext,
): BeatportAction[] {
  const count = selected.length;
  const allBought = count > 0 && selected.every((row) => row.bought_at !== null);
  return [
    push(count, context),
    open(count),
    action("note", "Edit note…", count === 1 ? null : "Select one track to edit its note."),
    allBought
      ? needsRows("unbought", "Mark not bought", count)
      : needsRows("bought", "Mark bought", count),
    needsRows("remove", "Remove from wantlist", count),
  ];
}

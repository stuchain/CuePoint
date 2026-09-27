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
}

/**
 * The most Beatport pages "Open on Beatport" opens at once.
 *
 * Each is a browser tab. Ten is a handful of tracks to compare; a hundred is a
 * click nobody meant, and the browser pays for it.
 */
export const MAX_OPEN_PAGES = 10;

export interface ActionContext {
  /** Whether Beatport can be asked: a push needs a token it accepts. */
  pushable: boolean;
  /** Why a push is not offered, when it is not. */
  pushReason: string | null;
  /** Rows the table shows, for a push of everything shown. */
  total: number;
}

function action(
  id: BeatportActionId,
  label: string,
  reason: string | null = null,
): BeatportAction {
  return { id, label, disabled: reason !== null, reason };
}

function push(count: number, context: ActionContext): BeatportAction {
  const label = "Push to Beatport playlist…";
  if (!context.pushable) return action("push", label, context.pushReason);
  if (count === 0 && context.total === 0) return action("push", label, "Nothing to push.");
  return action("push", label);
}

function open(count: number): BeatportAction {
  return action(
    "open",
    "Open on Beatport",
    count > MAX_OPEN_PAGES ? `Opens at most ${MAX_OPEN_PAGES} pages at once.` : null,
  );
}

/**
 * A run's table. With nothing selected a push takes every track the table
 * shows, in its order; a selection narrows each action to itself.
 */
export function runActions(count: number, context: ActionContext): BeatportAction[] {
  if (count === 0) return [push(0, context)];
  return [action("add_to_wantlist", "Add to wantlist"), push(count, context), open(count)];
}

/**
 * The wantlist. As a run's table, plus what only a wanted track has: a note,
 * a bought mark, and leaving the list.
 *
 * "Mark bought" becomes "Mark not bought" when everything selected is already
 * marked, so the one button undoes a mistaken mark rather than repeating it.
 */
export function wantlistActions(
  selected: readonly Pick<WantlistRow, "bought_at">[],
  context: ActionContext,
): BeatportAction[] {
  const count = selected.length;
  if (count === 0) return [push(0, context)];
  const allBought = selected.every((row) => row.bought_at !== null);
  const actions: BeatportAction[] = [push(count, context), open(count)];
  if (count === 1) actions.push(action("note", "Edit note…"));
  actions.push(
    allBought ? action("unbought", "Mark not bought") : action("bought", "Mark bought"),
    action("remove", "Remove from wantlist"),
  );
  return actions;
}

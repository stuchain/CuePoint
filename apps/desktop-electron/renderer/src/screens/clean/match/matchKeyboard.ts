/**
 * Moving along the review from the keyboard.
 *
 * Checking thousands of tracks is a keyboard job, so the table and its side panel answer three
 * keys: Up and Down move to the previous or next track (the panel follows), Home and End go to the
 * first or last, and Esc closes the panel. A tick is a checkbox and answers Space as every checkbox does. The keys are bare, which
 * is only safe because of the rules below: a key typed into a field is text, a key pressed inside
 * a dialog belongs to the dialog, and a key held with Ctrl, Alt or the command key belongs to the
 * shell (SHELL-10's shortcuts are all modified). A key pressed inside a widget that moves with
 * keys of its own, the player's queue list, a tree, a menu, belongs to that widget.
 *
 * Enter plays the row and Space ticks it; both are bound on the table's row (`ReviewTable`), not
 * here. **Space is not here.** It is the player's (`usePlayerShortcuts`) except on a tick.
 * A candidate's radio group owns its arrows: they change the pick, not the track.
 */

export type MatchCommand = "previous-track" | "next-track" | "first-track" | "last-track" | "close";

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
}

/** The keys, as the shortcuts dialog lists them. */
export const MATCH_KEYS: Record<
  "previous-track" | "next-track" | "first-track" | "last-track" | "close" | "select-all" | "play" | "tick",
  string
> = {
  "previous-track": "Up",
  "next-track": "Down",
  "first-track": "Home",
  "last-track": "End",
  close: "Esc",
  "select-all": "Ctrl+A",
  // Bound on the row (ReviewTable), not by `matchCommand`.
  play: "Enter",
  tick: "Space",
};

/** Inputs that take no typed text: a tick or a radio is not a field. */
const NOT_TEXT_INPUTS = ["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"];

const OWN_KEYS = '[role="dialog"], [role="menu"], [role="listbox"], [role="tree"], [role="radiogroup"]';

function inTheWay(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement && NOT_TEXT_INPUTS.includes(target.type)) {
    return target.closest(OWN_KEYS) !== null;
  }
  if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable) {
    return true;
  }
  return target.closest(OWN_KEYS) !== null;
}

/** Ctrl or Command with A, outside a field and a dialog: select every track, as in the Library. */
export function isSelectAll(event: KeyLike): boolean {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return false;
  return event.key.toLowerCase() === "a" && !inTheWay(event.target);
}

/** A slider owns the arrows, Home and End: they move its thumb. */
function ownedBySlider(event: KeyLike): boolean {
  const target = event.target;
  if (typeof HTMLInputElement === "undefined" || !(target instanceof HTMLInputElement)) return false;
  return target.type === "range" && ["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key);
}

export function matchCommand(event: KeyLike): MatchCommand | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (inTheWay(event.target) || ownedBySlider(event)) return null;
  switch (event.key) {
    case "ArrowUp":
      return "previous-track";
    case "ArrowDown":
      return "next-track";
    case "Home":
      return "first-track";
    case "End":
      return "last-track";
    case "Escape":
      return "close";
    default:
      return null;
  }
}

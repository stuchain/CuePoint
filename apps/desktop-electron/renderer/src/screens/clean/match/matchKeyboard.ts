/**
 * Moving along the review from the keyboard (the Review tab).
 *
 * Checking thousands of tracks is a keyboard job, so the table and its side panel answer three
 * keys: Up and Down move to the previous or next track (the panel follows), and Esc closes the
 * panel. A tick is a checkbox and answers Space as every checkbox does. The keys are bare, which
 * is only safe because of the rules below: a key typed into a field is text, a key pressed inside
 * a dialog belongs to the dialog, and a key held with Ctrl, Alt or the command key belongs to the
 * shell (SHELL-10's shortcuts are all modified). A key pressed inside a widget that moves with
 * keys of its own, the player's queue list, a tree, a menu, belongs to that widget.
 *
 * **Space is not here.** It is the player's (`usePlayerShortcuts`) except on a tick.
 */

export type MatchCommand = "previous-track" | "next-track" | "close";

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
}

/** The keys, as the shortcuts dialog lists them. */
export const MATCH_KEYS: Record<MatchCommand, string> = {
  "previous-track": "Up",
  "next-track": "Down",
  close: "Esc",
};

/** Inputs that take no typed text: a tick or a radio is not a field. */
const NOT_TEXT_INPUTS = ["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"];

const OWN_KEYS = '[role="dialog"], [role="menu"], [role="listbox"], [role="tree"]';

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

export function matchCommand(event: KeyLike): MatchCommand | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (inTheWay(event.target)) return null;
  switch (event.key) {
    case "ArrowUp":
      return "previous-track";
    case "ArrowDown":
      return "next-track";
    case "Escape":
      return "close";
    default:
      return null;
  }
}

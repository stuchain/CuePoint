/**
 * Reviewing from the keyboard (CLEAN-12).
 *
 * Reviewing 3,000 tracks is a keyboard job, so the queue moves and decides
 * without a mouse. The keys are bare letters and arrows, which is only safe
 * because of the rules below: a key typed into a field is text, a key pressed
 * inside a dialog belongs to the dialog, and a key held with Ctrl, Alt or the
 * command key belongs to the shell (SHELL-10's shortcuts are all modified).
 * A key pressed inside a widget that moves with keys of its own — the player's
 * queue list, a tree, a menu — belongs to that widget.
 */

export type ReviewCommand =
  | "previous-track"
  | "next-track"
  | "previous-candidate"
  | "next-candidate"
  | "accept"
  | "reject"
  | "skip";

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
}

/** The keys, as the shortcuts dialog lists them. */
export const REVIEW_KEYS: Record<ReviewCommand, string> = {
  "previous-track": "Up",
  "next-track": "Down",
  "previous-candidate": "Left",
  "next-candidate": "Right",
  accept: "A",
  reject: "R",
  skip: "N",
};

function inTheWay(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable) {
    return true;
  }
  return (
    target.closest('[role="dialog"], [role="menu"], [role="listbox"], [role="tree"]') !== null
  );
}

export function reviewCommand(event: KeyLike): ReviewCommand | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (inTheWay(event.target)) return null;
  switch (event.key) {
    case "ArrowUp":
      return "previous-track";
    case "ArrowDown":
      return "next-track";
    case "ArrowLeft":
      return "previous-candidate";
    case "ArrowRight":
      return "next-candidate";
  }
  // Letters without Shift: a capital typed by accident is not a decision.
  if (event.shiftKey) return null;
  switch (event.key) {
    case "a":
      return "accept";
    case "r":
      return "reject";
    case "n":
      return "skip";
    default:
      return null;
  }
}

/**
 * Matching from the keyboard (CLEAN-12, C14).
 *
 * Checking 3,000 tracks is a keyboard job, so the Review's details panel decides without a mouse:
 * Enter corrects, N is Not this track (or Leave unmatched), S skips, the arrows move between
 * tracks and results. The keys are bare letters, Enter and arrows, which is only safe because of
 * the rules below: a key typed into a field is text, a key pressed inside a dialog belongs to the
 * dialog, and a key held with Ctrl, Alt or the command key belongs to the shell (SHELL-10's
 * shortcuts are all modified). A key pressed inside a widget that moves with keys of its own, the
 * player's queue list, a tree, a menu, belongs to that widget. With no panel open the list answers
 * only Up and Down.
 *
 * **Space is not here.** It is the player's (`usePlayerShortcuts`): play or
 * pause. Playing the track's file is Y, and the Beatport preview is B.
 */

export type MatchCommand =
  | "previous-track"
  | "next-track"
  | "previous-candidate"
  | "next-candidate"
  | "correct"
  | "not-this"
  | "skip"
  | "play-preview"
  | "play-file"
  | "stop-preview";

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  /** A key held down repeats; a decision is made once, never by the repeats. */
  repeat?: boolean;
  target: EventTarget | null;
}

/** The keys, as the shortcuts dialog lists them. */
export const MATCH_KEYS: Record<MatchCommand, string> = {
  "previous-track": "Up",
  "next-track": "Down",
  "previous-candidate": "Left",
  "next-candidate": "Right",
  correct: "Enter",
  "not-this": "N",
  skip: "S",
  "play-preview": "B",
  "play-file": "Y",
  "stop-preview": "Esc",
};

/** Inputs that take no typed text: a tick or a radio is not a field, so N still means Not this track there. */
const NOT_TEXT_INPUTS = ["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"];

function inTheWay(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement && NOT_TEXT_INPUTS.includes(target.type)) {
    return (
      target.closest('[role="dialog"], [role="menu"], [role="listbox"], [role="tree"]') !== null
    );
  }
  if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable) {
    return true;
  }
  return (
    target.closest('[role="dialog"], [role="menu"], [role="listbox"], [role="tree"]') !== null
  );
}

/**
 * Anything that takes focus for a purpose of its own: Enter pressed on it is theirs, not Correct.
 * Only the page itself and the card's own regions (not focusable) leave Enter to Correct.
 */
const OWN_ENTER =
  'button, a[href], summary, select, input, textarea, [tabindex]:not([tabindex="-1"]), ' +
  '[role="button"], [role="tab"], [role="link"], [role="slider"], [role="option"], [role="menuitem"], ' +
  '[role="menuitemcheckbox"], [role="menuitemradio"], [role="switch"], [role="checkbox"], [role="radio"], ' +
  '[role="gridcell"], [role="row"], [role="treeitem"], [role="combobox"], [role="spinbutton"]';

function pressesItself(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  return target.closest(OWN_ENTER) !== null;
}

export function matchCommand(event: KeyLike): MatchCommand | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (inTheWay(event.target)) return null;
  if (event.key === "Escape") return "stop-preview";
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
  // A held key decides once: Enter, N and S never repeat.
  if (event.repeat && (event.key === "Enter" || event.key === "n" || event.key === "s")) return null;
  // Enter corrects, unless it is pressed on a button, which it presses.
  if (event.key === "Enter") return pressesItself(event.target) ? null : "correct";
  switch (event.key) {
    case "n":
      return "not-this";
    case "s":
      return "skip";
    case "b":
      return "play-preview";
    case "y":
      return "play-file";
    default:
      return null;
  }
}

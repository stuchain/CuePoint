import {
  DEFAULT_SCALE,
  SCALE_OPTIONS,
  scaleChoices,
  screenAvailHeight,
  type ScaleFactor,
} from "../tokens/scale";

/**
 * The commands the native menu sends the renderer (FLW-20, DEC-204): a fixed list of ids,
 * plus `size:<value>` for a size picked in View → Size. `electron/appMenu.ts` holds the
 * same list; `desktopContract.test.ts` compares the two.
 */
export const MENU_COMMAND_IDS = [
  "settings",
  "getting-started",
  "shortcuts",
  "privacy",
  "get-help",
  "diagnostics",
  "log-viewer",
  "rekordbox-help",
  "about",
  "import",
  "check-rekordbox",
  "export-rekordbox",
  "undo",
  "toggle-inspector",
  "toggle-sidebar",
  "search-library",
  "activity",
  "size-bigger",
  "size-smaller",
  "size-default",
] as const;

const NO_TYPED_TEXT = ["button", "checkbox", "radio", "range", "color", "file", "image", "reset", "submit"];

/**
 * What Ctrl+Z and Edit → Undo should undo: a typed edit when a text field has the focus, else the
 * newest change (M456). The menu takes Ctrl+Z from the page, so the page decides which it was.
 */
export function undoTarget(active: Element | null | undefined): "text" | "change" {
  if (!active) return "change";
  if (active.tagName === "TEXTAREA") return "text";
  if (active.tagName === "INPUT") {
    return NO_TYPED_TEXT.includes((active as HTMLInputElement).type) ? "change" : "text";
  }
  const editable = active.getAttribute("contenteditable");
  const editing = (active as HTMLElement).isContentEditable === true || ["", "true", "plaintext-only"].includes(editable ?? "no");
  return editing ? "text" : "change";
}

/**
 * The size a size command asks for, or null when the command is not one or names no size.
 * Bigger and Smaller step through `SCALE_OPTIONS`, skipping a size too big for the screen
 * (R2-5), and stop at the ends; Default size is
 * `DEFAULT_SCALE`; `size:<value>` must be one of the options. These keys step the Size
 * setting and never zoom the page.
 */
export function sizeAfterCommand(
  command: string,
  current: ScaleFactor,
  availHeight: number = screenAvailHeight(),
): ScaleFactor | null {
  if (command === "size-default") return DEFAULT_SCALE;
  if (command === "size-bigger" || command === "size-smaller") {
    const step = command === "size-bigger" ? 1 : -1;
    const choices = scaleChoices(current, availHeight);
    for (let at = SCALE_OPTIONS.indexOf(current) + step; at >= 0 && at < choices.length; at += step) {
      if (!choices[at]!.disabled) return choices[at]!.value;
    }
    return current;
  }
  if (command.startsWith("size:")) {
    const value = command.slice("size:".length);
    if (value.trim() === "") return null;
    return SCALE_OPTIONS.find((option) => option === Number(value)) ?? null;
  }
  return null;
}

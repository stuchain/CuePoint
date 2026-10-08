import { DEFAULT_SCALE, SCALE_OPTIONS, type ScaleFactor } from "../tokens/scale";

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
  "report-problem",
  "diagnostics",
  "log-viewer",
  "support-bundle",
  "rekordbox-help",
  "about",
  "import",
  "check-rekordbox",
  "toggle-inspector",
  "toggle-sidebar",
  "size-bigger",
  "size-smaller",
  "size-default",
] as const;

/**
 * The size a size command asks for, or null when the command is not one or names no size.
 * Bigger and Smaller step through `SCALE_OPTIONS` and stop at the ends; Default size is
 * `DEFAULT_SCALE`; `size:<value>` must be one of the options. These keys step the Size
 * setting and never zoom the page.
 */
export function sizeAfterCommand(command: string, current: ScaleFactor): ScaleFactor | null {
  if (command === "size-default") return DEFAULT_SCALE;
  if (command === "size-bigger" || command === "size-smaller") {
    const at = SCALE_OPTIONS.indexOf(current);
    const next = at + (command === "size-bigger" ? 1 : -1);
    return SCALE_OPTIONS[Math.min(SCALE_OPTIONS.length - 1, Math.max(0, next))] ?? current;
  }
  if (command.startsWith("size:")) {
    const value = command.slice("size:".length);
    if (value.trim() === "") return null;
    return SCALE_OPTIONS.find((option) => option === Number(value)) ?? null;
  }
  return null;
}

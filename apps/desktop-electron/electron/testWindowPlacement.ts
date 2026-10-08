/**
 * Where an end-to-end run puts the window, so it does not get in the way.
 *
 * The suite launches the whole app dozens of times. Each launch opened its
 * window on the primary monitor and took focus, which pulls whatever the person
 * at the machine is doing (a game, a call) out from under them, and, through
 * PLAYER-12's focus handler, takes the machine's media keys too.
 *
 * With `CUEPOINT_E2E_DISPLAY` set, the window opens on the display it names and
 * is shown without being focused. `playwright.config.ts` sets it to `left` for
 * every run; a person never sets it, and without it nothing changes. Playwright
 * drives the page through the DevTools protocol, which needs neither focus nor
 * a particular screen.
 *
 * The window also keeps its full size on a screen smaller than it. A CI Mac's
 * screen is 1024x768, and macOS shrank the 1280x800 window to fit, so the
 * Library collapsed and its rows sat under the header and the status strip,
 * where no click reached them. `enableLargerThanScreen` only acts on macOS.
 */

/** The environment variable that asks for a placement. */
export const E2E_DISPLAY_ENV = "CUEPOINT_E2E_DISPLAY";

type DisplayChoice = "left" | "right" | "primary";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayLike {
  workArea: Rect;
}

/** Where the window goes; it is shown inactive wherever it is. */
interface Placement {
  x: number;
  y: number;
}

/** The window options a test run adds: shown later without focus, and never shrunk to the screen. */
export function testWindowOptions(placement: Placement): Placement & {
  show: false;
  enableLargerThanScreen: true;
} {
  return { ...placement, show: false, enableLargerThanScreen: true };
}

/** The choice an environment value makes, or null for none (or one not understood). */
export function displayChoice(value: string | undefined): DisplayChoice | null {
  const choice = value?.trim().toLowerCase();
  return choice === "left" || choice === "right" || choice === "primary" ? choice : null;
}

/**
 * The window's top-left corner on the chosen display: the display's work area,
 * centred when the window fits and at its corner when it does not.
 */
export function testWindowPlacement(
  choice: DisplayChoice,
  displays: readonly DisplayLike[],
  primary: DisplayLike,
  size: { width: number; height: number },
): Placement {
  const byX = [...displays].sort((a, b) => a.workArea.x - b.workArea.x);
  const display =
    choice === "primary" || byX.length === 0
      ? primary
      : choice === "left"
        ? byX[0]!
        : byX[byX.length - 1]!;
  const area = display.workArea;
  return {
    x: Math.round(area.x + Math.max(0, (area.width - size.width) / 2)),
    y: Math.round(area.y + Math.max(0, (area.height - size.height) / 2)),
  };
}

/**
 * The window's size and where it goes (Area 51, M491).
 *
 * - **The smallest it can be.** Below this the three-column layout (sidebar, page, Inspector) and
 *   the player bar stop fitting, so the window refuses to shrink further rather than let controls
 *   overlap or fall off the edge.
 * - **Where it opens.** The size and place the window had when it was last closed, and whether it
 *   was maximised, come back at the next launch. A first launch takes about 80% of the work area
 *   (never under the smallest), so the Size the screen suggests has the room it was chosen for.
 * - **Never off the screen.** A saved place on a display that is no longer there, or a saved size
 *   bigger than the screen now is, is not trusted: the size is brought inside the work area and
 *   the place is dropped, so the window opens centred and reachable.
 *
 * Pure and Electron-free, so each rule can be tested; `main.ts` hands it the displays.
 */
export const WINDOW_MIN_SIZE = { minWidth: 1024, minHeight: 640 } as const;

/** The size an end-to-end run's window is made at (`testWindowPlacement.ts`); a person's is `placeWindow`'s. */
export const DEFAULT_WINDOW_SIZE = { width: 1280, height: 800 } as const;

/** What a first launch takes of the work area, each way. */
const FIRST_LAUNCH_SHARE = 0.8;

/** A bound far beyond any display, so a hand-edited number cannot ask for a window nobody can reach. */
const MAX_DIMENSION = 20_000;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What is remembered about the window. `x` and `y` are null when it has no place to go back to. */
export interface WindowState {
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  maximized: boolean;
}

/** What the window is made with. `x` and `y` are left out to let the system centre it. */
export interface WindowPlacement {
  width: number;
  height: number;
  x?: number;
  y?: number;
  /** Maximise once it is shown. */
  maximized: boolean;
}

function whole(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= min && rounded <= max ? rounded : null;
}

/**
 * The saved window state, or null when it is not one. The file is hand-editable and is not
 * trusted: a size under the smallest, a number that is not whole or is absurd, and a place with
 * only one of its two coordinates are each dropped, never repaired into something else.
 */
export function parseWindowState(value: unknown): WindowState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const width = whole(record.width, WINDOW_MIN_SIZE.minWidth, MAX_DIMENSION);
  const height = whole(record.height, WINDOW_MIN_SIZE.minHeight, MAX_DIMENSION);
  if (width === null || height === null) return null;
  const x = whole(record.x, -MAX_DIMENSION, MAX_DIMENSION);
  const y = whole(record.y, -MAX_DIMENSION, MAX_DIMENSION);
  const placed = x !== null && y !== null;
  return {
    width,
    height,
    x: placed ? x : null,
    y: placed ? y : null,
    maximized: record.maximized === true,
  };
}

/** The window as `BrowserWindow` reports it: the bounds it has when not maximised or full screen. */
export interface WindowLike {
  getNormalBounds: () => Rect;
  isMaximized: () => boolean;
}

/** What to remember of a window now. */
export function captureWindowState(win: WindowLike): WindowState | null {
  return parseWindowState({ ...win.getNormalBounds(), maximized: win.isMaximized() });
}

/** The smallest part of the window that must be on a display for the person to reach it. */
const REACHABLE = { width: 120, height: 80 };

function overlap(a: Rect, b: Rect): { width: number; height: number } {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return { width: Math.max(0, width), height: Math.max(0, height) };
}

/** Whether a window here could be grabbed by its title bar: enough of it is on a display. */
function reachable(rect: Rect, workAreas: readonly Rect[]): boolean {
  return workAreas.some((area) => {
    const shared = overlap(rect, area);
    // The title bar is at the top: it must be inside the area, not above it.
    return (
      shared.width >= Math.min(REACHABLE.width, rect.width) &&
      shared.height >= Math.min(REACHABLE.height, rect.height) &&
      rect.y >= area.y - 8 &&
      rect.y <= area.y + area.height - 40
    );
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Where and how big to open the window.
 *
 * `saved` is what the last close remembered (null on a first launch); `workAreas` are every
 * display's usable area; `primary` is the one a window with no place goes to.
 */
export function placeWindow(
  saved: WindowState | null,
  workAreas: readonly Rect[],
  primary: Rect,
): WindowPlacement {
  const fit = (area: Rect, width: number, height: number) => ({
    width: clamp(width, WINDOW_MIN_SIZE.minWidth, Math.max(WINDOW_MIN_SIZE.minWidth, area.width)),
    height: clamp(height, WINDOW_MIN_SIZE.minHeight, Math.max(WINDOW_MIN_SIZE.minHeight, area.height)),
  });

  if (!saved) {
    return {
      ...fit(
        primary,
        Math.round(primary.width * FIRST_LAUNCH_SHARE),
        Math.round(primary.height * FIRST_LAUNCH_SHARE),
      ),
      maximized: false,
    };
  }

  if (saved.x !== null && saved.y !== null) {
    const rect = { x: saved.x, y: saved.y, width: saved.width, height: saved.height };
    if (reachable(rect, workAreas)) {
      // Still on a display; only a size bigger than that display is brought in.
      const home =
        workAreas.find((area) => overlap(rect, area).width >= REACHABLE.width) ?? primary;
      const size = fit(home, saved.width, saved.height);
      return { ...size, x: saved.x, y: saved.y, maximized: saved.maximized };
    }
  }
  // Nowhere to go back to: the saved size, brought inside the primary display, centred by the system.
  return { ...fit(primary, saved.width, saved.height), maximized: saved.maximized };
}

/** What the saver needs from outside it, handed in so a test can stand in. */
export interface WindowStateSaverDeps {
  window: WindowLike;
  save: (state: WindowState) => void;
  /** How long after the last resize or move before it is written. */
  delayMs?: number;
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}

/**
 * Remembers the window as it is moved and resized, without writing on every pixel: `schedule`
 * writes once the window has been still for a moment, `flush` writes at once (on close).
 * A write that fails is not worth failing the window for, so it is swallowed.
 */
export function createWindowStateSaver({
  window: win,
  save,
  delayMs = 500,
  setTimer = (run, ms) => setTimeout(run, ms),
  clearTimer = (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
}: WindowStateSaverDeps) {
  let timer: unknown = null;

  const write = (): void => {
    timer = null;
    try {
      const state = captureWindowState(win);
      if (state) save(state);
    } catch {
      // Where the window opens next time is a convenience, never a reason to fail a close.
    }
  };

  return {
    schedule(): void {
      if (timer !== null) clearTimer(timer);
      timer = setTimer(write, delayMs);
    },
    flush(): void {
      if (timer !== null) clearTimer(timer);
      write();
    },
  };
}

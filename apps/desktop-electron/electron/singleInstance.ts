/**
 * One copy of CuePoint at a time (DIST-06, Phase 16 fact 8).
 *
 * Main asks for the lock before it sets anything else up. A second copy, started
 * while the first installs an update, would hold the files the installer is
 * replacing and would run a second engine on the same library; so a second copy
 * quits at once, and the first one comes forward instead.
 *
 * End-to-end runs each pass their own `--user-data-dir`, and Electron keys the
 * lock on that folder, so parallel runs do not meet each other here.
 */

export interface SingleInstanceWindow {
  isMinimized: () => boolean;
  restore: () => void;
  focus: () => void;
  show: () => void;
  isDestroyed: () => boolean;
}

/** What `enforceSingleInstance` needs of Electron's `app`. */
export interface SingleInstanceApp {
  requestSingleInstanceLock: () => boolean;
  /** `app.exit`: leaves at once, running none of the quit handlers. */
  exit: (code: number) => void;
  on: (event: "second-instance", listener: () => void) => unknown;
}

/**
 * Answers whether this is the first copy. False means a copy is already
 * running: the app has been told to exit and the caller must start nothing.
 */
export function enforceSingleInstance(
  app: SingleInstanceApp,
  firstWindow: () => SingleInstanceWindow | null,
): boolean {
  if (!app.requestSingleInstanceLock()) {
    // Not `quit()`: that would run the quit handlers (and their cleanup) of a copy that
    // started nothing. Main asks for the lock before it sets anything else up.
    app.exit(0);
    return false;
  }
  app.on("second-instance", () => {
    const win = firstWindow();
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  return true;
}

/**
 * Wraps work that starts things (the window, the engine) so it does nothing in a
 * second copy, whatever event calls it, for the moment between `exit(0)` and the
 * process going away.
 */
export function onlyIfFirst<A extends unknown[]>(first: boolean, work: (...args: A) => void): (...args: A) => void {
  return (...args) => {
    if (first) work(...args);
  };
}

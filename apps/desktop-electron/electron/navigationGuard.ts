/**
 * Which pages the main window may show: only the app's own (DIST-07 review).
 *
 * The window carries the preload, so a page from anywhere else loaded into it would hold the
 * bridge. A link in release notes (untrusted text), a drag-drop or a script must not be able to
 * navigate it away. Main denies new windows and cancels any navigation this rule refuses; the
 * system browser is reached only through the narrow `openExternal` helpers.
 */
export interface OwnPages {
  /** The dev server's address in development, else null. */
  devUrl: string | null;
  /** The packaged app's `index.html` as a `file:` URL. */
  indexUrl: string;
}

/** True when `target` is the app's own page (its hash and query may change: the router uses them). */
export function isOwnPage(target: unknown, own: OwnPages): boolean {
  if (typeof target !== "string" || target === "") return false;
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return false;
  }
  if (own.devUrl !== null) {
    try {
      return url.origin !== "null" && url.origin === new URL(own.devUrl).origin;
    } catch {
      return false;
    }
  }
  if (url.protocol !== "file:") return false;
  url.hash = "";
  url.search = "";
  return url.href === own.indexUrl;
}

/**
 * Loads the app's page, where a load another navigation cut short is not a failure.
 *
 * `loadFile` and `loadURL` reject with `ERR_ABORTED` (-3) when a newer navigation of the same
 * window replaces the one they started: a reload (Ctrl+R, the error screen's Reload, a test's
 * `window.reload()`) pressed before the first load finished. The newer load shows the page, so
 * nothing went wrong, but the rejection reached Sentry as an unhandled one (ELECTRON-2). Any
 * other failure still rejects.
 */
export async function loadOwnPage(load: () => Promise<void>): Promise<void> {
  try {
    await load();
  } catch (error) {
    if (isAbortedLoad(error)) return;
    throw error;
  }
}

/** True for Electron's `ERR_ABORTED` load failure. */
export function isAbortedLoad(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, errno } = error as { code?: unknown; errno?: unknown };
  return code === "ERR_ABORTED" || errno === -3;
}

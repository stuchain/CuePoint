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

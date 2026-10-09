/**
 * The one kind of page the renderer may open in the browser (DISCOVER-10).
 *
 * "Open on Beatport" hands a URL the engine built to the system browser. The
 * renderer is never trusted to open anything it likes: `shell.openExternal`
 * with an arbitrary string can start a `file:` URL, a custom protocol handler,
 * or a page that impersonates something else, and a renderer that has been
 * compromised would ask for exactly that. So the main process opens only an
 * `https` page on Beatport's own website, and refuses everything else by
 * returning null — the page says so rather than guessing.
 *
 * Every Beatport URL CuePoint shows is built by the engine on
 * `https://www.beatport.com` (a track, a chart, the user's playlist), so the
 * rule is exact rather than a pattern: that host, or the bare domain Beatport
 * redirects from, over https, on the default port, with no credentials.
 */

/** The hosts a Beatport page may be on. */
const BEATPORT_HOSTS: readonly string[] = ["www.beatport.com", "beatport.com"];

/** The longest URL opened. A track page's is under 200 characters. */
export const MAX_URL_LENGTH = 2048;

/**
 * The URL to open, normalized, or null when it is not a Beatport page.
 */
export function beatportPageUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_URL_LENGTH) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!BEATPORT_HOSTS.includes(url.hostname)) return null;
  if (url.port !== "" || url.username !== "" || url.password !== "") return null;
  return url.toString();
}

/**
 * The links a release's notes may open (DIST-07). The notes are untrusted text from the network,
 * so a link in them opens only over https, with no credentials or port, on GitHub or CuePoint's
 * own site.
 */
const NOTE_LINK_HOSTS: readonly string[] = ["usecuepoint.com", "www.usecuepoint.com"];

/** The URL to open, normalized, or null when a release's notes may not link there. */
export function releaseNoteLinkUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_URL_LENGTH) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.port !== "" || url.username !== "" || url.password !== "") return null;
  const host = url.hostname;
  if (host !== "github.com" && !host.endsWith(".github.com") && !NOTE_LINK_HOSTS.includes(host)) {
    return null;
  }
  return url.toString();
}

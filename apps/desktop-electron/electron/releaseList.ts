/**
 * Reading GitHub's list of CuePoint releases (DIST-05, DEC-169).
 *
 * The rule in `updateRule.ts` needs every published release, not just the one
 * GitHub calls latest, so this reads the list over HTTPS and maps each entry to
 * the rule's shape. Anonymous requests are limited to 60 an hour per address;
 * the app asks at most once every 4 hours plus the button. A refused or failed
 * read is "could not check" — never "up to date" — so the caller can say so.
 */
import { tagVersion, type Release, type ReleaseAsset } from "./updateRule";

/** The one place the repository is named, so a fork or a move changes one line. */
export const RELEASES_REPOSITORY = "stuchain/CuePoint";

export const RELEASES_URL = `https://api.github.com/repos/${RELEASES_REPOSITORY}/releases?per_page=100`;

/**
 * How many pages of 100 a read follows. GitHub lists newest first, so five
 * pages (500 releases) is far more than the rule ever needs.
 */
export const MAX_RELEASE_PAGES = 5;

/** How long a read waits before giving up. */
export const RELEASES_TIMEOUT_MS = 15_000;

export type ReleaseListResult =
  | { ok: true; releases: Release[] }
  | { ok: false; reason: "could-not-check"; detail: string };

export interface FetchReleasesOptions {
  /** The running app's version, sent in the user agent. */
  appVersion: string;
  url?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function couldNotCheck(detail: string): ReleaseListResult {
  return { ok: false, reason: "could-not-check", detail };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/** The `rel="next"` target of a Link header, or null. */
function nextLink(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const match = /^\s*<([^>]*)>\s*;(.*)$/.exec(part);
    if (match && /;?\s*rel="?next"?\s*(;|$)/.test(`;${match[2]}`)) return match[1];
  }
  return null;
}

function mapAsset(raw: unknown): ReleaseAsset | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.name !== "string" || typeof raw.browser_download_url !== "string") return null;
  const asset: ReleaseAsset = { name: raw.name, url: raw.browser_download_url };
  if (typeof raw.size === "number") asset.size = raw.size;
  return asset;
}

/**
 * One GitHub release to the rule's shape, or null when it is malformed. The
 * version is the tag's, parsed by the rule's own scheme, or null outside it.
 */
export function mapRelease(raw: unknown): Release | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.tag_name !== "string") return null;
  if (typeof raw.draft !== "boolean") return null;
  const tag = raw.tag_name;
  const assets = Array.isArray(raw.assets) ? raw.assets : [];
  return {
    tag,
    version: tagVersion(tag),
    draft: raw.draft,
    prerelease: raw.prerelease === true,
    notes: typeof raw.body === "string" ? raw.body : "",
    publishedAt: typeof raw.published_at === "string" ? raw.published_at : null,
    htmlUrl: httpsUrl(raw.html_url),
    assets: assets.map(mapAsset).filter((asset): asset is ReleaseAsset => asset !== null),
  };
}

export async function fetchReleases({
  appVersion,
  url = RELEASES_URL,
  fetchImpl = fetch,
  timeoutMs = RELEASES_TIMEOUT_MS,
}: FetchReleasesOptions): Promise<ReleaseListResult> {
  const all: unknown[] = [];
  let next: string | null = url;
  for (let page = 0; next !== null && page < MAX_RELEASE_PAGES; page += 1) {
    const result: PageResult = await fetchPage(next, appVersion, fetchImpl, timeoutMs);
    if (!result.ok) return result;
    all.push(...result.body);
    next = result.next;
  }
  const releases = all.map(mapRelease).filter((release): release is Release => release !== null);
  if (all.length > 0 && releases.length === 0) {
    return couldNotCheck("None of GitHub's releases could be read.");
  }
  return { ok: true, releases };
}

type PageResult =
  | { ok: true; body: unknown[]; next: string | null }
  | { ok: false; reason: "could-not-check"; detail: string };

async function fetchPage(
  url: string,
  appVersion: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<PageResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return couldNotCheck("The release list address is not a URL.") as PageResult;
  }
  if (parsed.protocol !== "https:") {
    return couldNotCheck("The release list must be read over HTTPS.") as PageResult;
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetchImpl(parsed.href, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `CuePoint/${appVersion}`,
      },
      signal: controller.signal,
      redirect: "error",
    });
    if (!response.ok) {
      return couldNotCheck(`GitHub answered ${response.status}.`) as PageResult;
    }
    const body: unknown = await response.json();
    if (!Array.isArray(body)) {
      return couldNotCheck("GitHub's answer was not a list of releases.") as PageResult;
    }
    return { ok: true, body, next: nextLink(response.headers.get("Link")) };
  } catch (error) {
    if (timedOut) return couldNotCheck(`Timed out after ${timeoutMs} ms.`) as PageResult;
    return couldNotCheck(error instanceof Error ? error.message : String(error)) as PageResult;
  } finally {
    clearTimeout(timer);
  }
}

#!/usr/bin/env node
/**
 * Reads GitHub's release list at build and writes `src/data/releases.json` (SITE-07, fact 9).
 *
 *   { release: { version, tag, publishedAt, notesUrl } | null,
 *     files: [{ name, system, chip, size, sha256, url }],
 *     fetchedAt }
 *
 * The page shows the newest NORMAL release (DEC-194): never a draft, never GitHub's pre-release,
 * never a `-test.N` version, and nothing below 1.0.0, since every version before it belongs to the
 * retired app. Until 1.0.0 is out there is none, and the file holds the "none yet" state.
 *
 * Files are kept only when they match DIST-03's names, and only the ones a person installs from
 * (the Windows setup, the two Mac disk images, the AppImage); the Mac zips are the updater's.
 * SHA-256 comes from the release's `SHA256SUMS-*.txt` files.
 *
 * It never breaks the build and never writes a partial file: if the read fails, or the newest
 * release is incomplete (no installer, an installer with no checksum), the last committed data is
 * kept and the log says so. `RELEASES_JSON` (a path to a fixture) means the page is built from that
 * file, so there is nothing to fetch.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = "stuchain/CuePoint";
export const LIST_URL = `https://api.github.com/repos/${REPO}/releases`;
export const OUTPUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "releases.json");
const TIMEOUT_MS = 15_000;
const MAX_PAGES = 5;

export const NONE_YET = (fetchedAt) => ({ release: null, files: [], fetchedAt });

// ---- DIST-05's version rule (a small copy of apps/desktop-electron/electron/updateRule.ts) --------
// `X.Y.Z` or `X.Y.Z-test.N`, with an optional leading v for tags; anything else is outside the scheme.

const NUMBER = "(0|[1-9]\\d*)";
const VERSION_PATTERN = new RegExp(`^v?${NUMBER}\\.${NUMBER}\\.${NUMBER}(?:-test\\.([1-9]\\d*))?$`);

export function parseVersion(text) {
  if (typeof text !== "string") return null;
  const match = VERSION_PATTERN.exec(text);
  if (!match) return null;
  const numbers = match.slice(1, 5).map((part) => (part === undefined ? null : Number(part)));
  if (numbers.some((n) => n !== null && n > Number.MAX_SAFE_INTEGER)) return null;
  const [major, minor, patch, test] = numbers;
  return { major, minor, patch, test };
}

/** SemVer precedence: negative when `a` is older. A test version is below its normal version. */
export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) throw new Error(`Not a CuePoint version: ${left ? b : a}`);
  return (
    left.major - right.major ||
    left.minor - right.minor ||
    left.patch - right.patch ||
    compareTest(left.test, right.test)
  );
}

function compareTest(a, b) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

// ---- Which release, which files -------------------------------------------------------------------

/** A release the site may offer: published, normal, in the scheme, and 1.0.0 or later. */
export function isOfferable(release) {
  if (release.draft || release.prerelease) return false;
  const version = parseVersion(release.tag_name);
  if (!version || version.test !== null) return false;
  return version.major >= 1;
}

/** The highest offerable release by version (not by date or position), or null. */
export function pickRelease(list) {
  let best = null;
  for (const release of list) {
    if (!isOfferable(release)) continue;
    if (best === null || compareVersions(release.tag_name, best.tag_name) > 0) best = release;
  }
  return best;
}

/** DIST-03's names, for the files a person installs from. Null for anything else. */
export function fileInfo(name, version) {
  const table = {
    [`CuePoint-${version}-win-x64-setup.exe`]: { system: "windows", chip: "x64" },
    [`CuePoint-${version}-mac-arm64.dmg`]: { system: "macos", chip: "arm64" },
    [`CuePoint-${version}-mac-x64.dmg`]: { system: "macos", chip: "x64" },
    [`CuePoint-${version}-linux-x86_64.AppImage`]: { system: "linux", chip: "x64" },
  };
  return Object.hasOwn(table, name) ? { ...table[name] } : null;
}

const ORDER = ["windows", "macos", "linux"];
const REQUIRED = [
  ["windows", "x64"],
  ["macos", "arm64"],
  ["macos", "x64"],
  ["linux", "x64"],
];

/** `hash  name` lines (generate_sha256_sums.py), with the `*` of binary mode tolerated. */
export function parseChecksums(text) {
  const map = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    const match = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line);
    if (match) map.set(match[2], match[1].toLowerCase());
  }
  return map;
}

/**
 * The data for the newest normal release in `list`, or the none-yet state. Throws when the release
 * is incomplete, so the caller keeps the last data instead of writing half of a release.
 */
export async function buildReleaseData(list, { fetchText, now = () => new Date() }) {
  const fetchedAt = now().toISOString();
  const release = pickRelease(list);
  if (!release) return NONE_YET(fetchedAt);

  const version = release.tag_name.replace(/^v/, "");
  const assets = Array.isArray(release.assets) ? release.assets : [];

  const sums = new Map();
  for (const asset of assets.filter((a) => /^SHA256SUMS.*\.txt$/.test(a.name))) {
    for (const [name, hash] of parseChecksums(await fetchText(asset.browser_download_url))) sums.set(name, hash);
  }

  const files = [];
  for (const asset of assets) {
    const info = fileInfo(asset.name, version);
    if (!info) continue;
    const sha256 = sums.get(asset.name);
    if (!sha256) throw new Error(`${release.tag_name}: no checksum for ${asset.name}`);
    if (!Number.isSafeInteger(asset.size) || asset.size <= 0) throw new Error(`${release.tag_name}: no size for ${asset.name}`);
    if (!/^https:\/\//.test(asset.browser_download_url)) throw new Error(`${release.tag_name}: ${asset.name} has no https url`);
    files.push({ name: asset.name, ...info, size: asset.size, sha256, url: asset.browser_download_url });
  }
  // DIST-03's four installers, or the release is not complete yet (a leg's upload is missing): the page
  // must never offer a Mac download and no Windows one.
  const missing = REQUIRED.filter(([system, chip]) => !files.some((f) => f.system === system && f.chip === chip));
  if (missing.length > 0) {
    throw new Error(`${release.tag_name}: missing installer(s) ${missing.map((m) => m.join("-")).join(", ")}`);
  }
  files.sort((a, b) => ORDER.indexOf(a.system) - ORDER.indexOf(b.system) || a.chip.localeCompare(b.chip));

  return {
    release: {
      version,
      tag: release.tag_name,
      publishedAt: release.published_at ?? null,
      notesUrl: release.html_url,
    },
    files,
    fetchedAt,
  };
}

// ---- Reading GitHub -------------------------------------------------------------------------------

function headers(env) {
  const h = { Accept: "application/vnd.github+json", "User-Agent": "cuepoint-website-build", "X-GitHub-Api-Version": "2022-11-28" };
  if (env.GITHUB_TOKEN) h.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  return h;
}

async function get(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}

const API_HOST = "api.github.com";

/**
 * The release list, following GitHub's next-page links (up to 5 pages of 100). The token is sent only
 * to api.github.com; a token GitHub refuses (401) is dropped and the public read is tried without it.
 */
export async function listReleases(env = process.env, fetchImpl = fetch) {
  const all = [];
  let url = `${LIST_URL}?per_page=100`;
  let useToken = Boolean(env.GITHUB_TOKEN);
  for (let page = 0; page < MAX_PAGES && url; page += 1) {
    if (new URL(url).hostname !== API_HOST) throw new Error(`refusing a next page outside ${API_HOST}: ${url}`);
    let response = await getJson(url, useToken, env, fetchImpl);
    if (response.status === 401 && useToken) {
      useToken = false;
      response = await getJson(url, false, env, fetchImpl);
    }
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body)) throw new Error(`${url}: not a list`);
    all.push(...body);
    url = /<([^>]+)>;\s*rel="next"/.exec(response.headers.get("link") ?? "")?.[1] ?? null;
  }
  return all;
}

function getJson(url, useToken, env, fetchImpl) {
  return fetchImpl(url, { headers: headers(useToken ? env : {}), signal: AbortSignal.timeout(TIMEOUT_MS) });
}

/** A release asset's text. The download address is public, so no token is sent to it. */
export async function fetchText(url) {
  if (!/^https:\/\//.test(url)) throw new Error(`refusing a non-HTTPS address: ${url}`);
  const response = await get(url, { headers: { "User-Agent": "cuepoint-website-build" } });
  return response.text();
}

// ---- The run --------------------------------------------------------------------------------------

function readExisting(output) {
  try {
    return JSON.parse(readFileSync(output, "utf8"));
  } catch {
    return null;
  }
}

function strip(data) {
  const { fetchedAt: _ignored, ...rest } = data;
  return JSON.stringify(rest);
}

function writeAtomic(output, data) {
  mkdirSync(dirname(output), { recursive: true });
  const temp = `${output}.tmp`;
  writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(temp, output);
}

/** CI and public builds: CI or PUBLIC set to something other than "", "0" or "false". */
export function isStrict(env) {
  return [env.CI, env.PUBLIC].some((v) => v !== undefined && !["", "0", "false"].includes(String(v).toLowerCase()));
}

/**
 * Reads the list and writes the data. Returns { status } and never throws on a failed read:
 * "updated", "unchanged" (only the time would differ, so the file is left alone), "kept" (the last
 * data stays), "failed" (strict builds only: CI or PUBLIC) or "fixture" (RELEASES_JSON is set, nothing to read).
 */
export async function run({
  output = OUTPUT,
  listReleases: list = listReleases,
  fetchText: text = fetchText,
  now = () => new Date(),
  log = console.log,
  env = process.env,
} = {}) {
  if (env.RELEASES_JSON) {
    log(`fetch-releases: RELEASES_JSON is set (${env.RELEASES_JSON}); building from that file, not reading GitHub.`);
    return { status: "fixture" };
  }
  try {
    const releases = await list(env);
    if (!Array.isArray(releases)) throw new Error("GitHub's answer was not a list of releases");
    const data = await buildReleaseData(releases, { fetchText: text, now });
    const existing = readExisting(output);
    if (existing && strip(existing) === strip(data)) {
      log(`fetch-releases: no change (${data.release ? `release ${data.release.version}` : "no normal release yet"}).`);
      return { status: "unchanged", data: existing };
    }
    writeAtomic(output, data);
    log(`fetch-releases: wrote ${data.release ? `release ${data.release.version} with ${data.files.length} files` : "the none-yet state (no normal release)"}.`);
    return { status: "updated", data };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    // A deploy (CI, or PUBLIC set) must not quietly ship last time's download page: it fails instead.
    // A developer's offline build falls back to the committed data.
    if (isStrict(env)) {
      log(`::error::fetch-releases: could not read the releases (${reason}). A CI or public build does not fall back to the committed data.`);
      return { status: "failed", reason };
    }
    const existing = readExisting(output);
    if (existing) {
      log(`::warning::fetch-releases: could not read the releases (${reason}); keeping the last data (${existing.release ? `release ${existing.release.version}` : "none yet"}).`);
      return { status: "kept", data: existing };
    }
    const none = NONE_YET(now().toISOString());
    writeAtomic(output, none);
    log(`::warning::fetch-releases: could not read the releases (${reason}) and there is no earlier data; wrote the none-yet state.`);
    return { status: "kept", data: none };
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { status } = await run();
  if (status === "failed") process.exitCode = 1;
}

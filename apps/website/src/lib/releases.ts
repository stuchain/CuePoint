import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The release data the download page and the header's button are built from (SITE-07).
 * `scripts/fetch-releases.mjs` writes `src/data/releases.json` before each build; RELEASES_JSON
 * (a path, relative to the website folder) points a build at a fixture instead, which is how the
 * e2e suite builds the page for a release that does not exist yet. Build-time only: nothing here
 * ships to the browser.
 */
export type System = "windows" | "macos" | "linux";
export type Chip = "x64" | "arm64";

export interface ReleaseFile {
  name: string;
  system: System;
  chip: Chip;
  size: number;
  sha256: string;
  url: string;
}

export interface ReleaseInfo {
  version: string;
  tag: string;
  publishedAt: string | null;
  /** The release's page on GitHub, where its notes are. */
  notesUrl: string;
}

export interface ReleaseData {
  release: ReleaseInfo | null;
  files: ReleaseFile[];
  fetchedAt: string;
}

const SYSTEMS: readonly string[] = ["windows", "macos", "linux"];
const CHIPS: readonly string[] = ["x64", "arm64"];

/** Throws, naming the problem, when the data is not the shape the pages rely on. */
export function parseReleaseData(raw: unknown): ReleaseData {
  const fail = (why: string): never => {
    throw new Error(`releases data: ${why}`);
  };
  if (typeof raw !== "object" || raw === null) return fail("not an object");
  const data = raw as Record<string, unknown>;
  if (typeof data["fetchedAt"] !== "string") fail("fetchedAt is missing");
  const files = data["files"];
  if (!Array.isArray(files)) return fail("files is not a list");
  const release = data["release"];
  if (release === null) {
    if (files.length > 0) fail("files without a release");
    return { release: null, files: [], fetchedAt: data["fetchedAt"] as string };
  }
  if (typeof release !== "object") return fail("release is not an object");
  const info = release as Record<string, unknown>;
  for (const key of ["version", "tag", "notesUrl"]) if (typeof info[key] !== "string") fail(`release.${key} is missing`);
  if (files.length === 0) fail("a release with no files");
  for (const f of files as Record<string, unknown>[]) {
    if (typeof f["name"] !== "string") fail("a file has no name");
    if (!SYSTEMS.includes(f["system"] as string)) fail(`${String(f["name"])}: unknown system`);
    if (!CHIPS.includes(f["chip"] as string)) fail(`${String(f["name"])}: unknown chip`);
    if (typeof f["size"] !== "number" || f["size"] <= 0) fail(`${String(f["name"])}: no size`);
    if (typeof f["sha256"] !== "string" || !/^[0-9a-f]{64}$/.test(f["sha256"])) fail(`${String(f["name"])}: bad sha256`);
    if (typeof f["url"] !== "string" || !f["url"].startsWith("https://")) fail(`${String(f["name"])}: url is not https`);
  }
  return {
    release: {
      version: info["version"] as string,
      tag: info["tag"] as string,
      publishedAt: typeof info["publishedAt"] === "string" ? info["publishedAt"] : null,
      notesUrl: info["notesUrl"] as string,
    },
    files: files as ReleaseFile[],
    fetchedAt: data["fetchedAt"] as string,
  };
}

export function loadReleases(): ReleaseData {
  const path = resolve(process.cwd(), process.env["RELEASES_JSON"] || "src/data/releases.json");
  return parseReleaseData(JSON.parse(readFileSync(path, "utf8")));
}

/** True once the data holds a normal release: the download buttons and the file list turn on. */
export function hasRelease(data: ReleaseData = loadReleases()): boolean {
  return data.release !== null;
}

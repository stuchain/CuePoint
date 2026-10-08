/**
 * Which release a computer is offered (DIST-05, DEC-145).
 *
 * One pure function of the installed version and the published releases. A
 * test build (`1.4.0-test.2`) is offered the highest version newer than
 * itself, test or normal; a normal build (`1.4.0`) is offered the highest
 * normal release newer than itself. Nothing else decides: not the publish
 * date, not GitHub's "latest" or "pre-release" flags, not a channel name. That
 * is why `electron-updater`'s own channels are not used to choose (DEC-169):
 * they take the newest-published release, so a `1.4.1` hotfix published after
 * `1.5.0-test.1` would be offered to a `1.5.0-test.1` build. Here it is not,
 * because `1.4.1` is lower.
 *
 * This file has no Electron or network code; `releaseList.ts` reads the list
 * and DIST-06 wires the two together.
 */

/** The four builds CuePoint ships (DEC-129, DEC-174). */
export type UpdateTarget = "win-x64" | "mac-arm64" | "mac-x64" | "linux-x64";

/** `test` is N of `X.Y.Z-test.N`, or null for a normal version. */
export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  test: number | null;
}

export interface ReleaseAsset {
  name: string;
  url: string;
  size?: number;
}

export interface Release {
  /** The git tag, for example `v1.4.0-test.2`. */
  tag: string;
  /** The tag's version without the `v`, or null when it is outside the scheme. */
  version: string | null;
  draft: boolean;
  prerelease: boolean;
  notes: string;
  publishedAt: string | null;
  /** The release's web page (https only), for a Download link on Linux. */
  htmlUrl: string | null;
  assets: ReleaseAsset[];
}

/** The update manifest each target reads (electron-builder's names). */
export const MANIFEST_FOR_TARGET: Record<UpdateTarget, string> = {
  "win-x64": "latest.yml",
  "mac-arm64": "latest-mac.yml",
  "mac-x64": "latest-mac.yml",
  "linux-x64": "latest-linux.yml",
};

// A number with no leading zeros; `test.N` starts at 1.
const NUMBER = "(0|[1-9]\\d*)";
const VERSION_PATTERN = new RegExp(
  `^v?${NUMBER}\\.${NUMBER}\\.${NUMBER}(?:-test\\.([1-9]\\d*))?$`,
);

/**
 * Reads `X.Y.Z` or `X.Y.Z-test.N`, with an optional leading `v` for tags.
 * Anything else is null, including the old `1.0.0-feb1-test1` names,
 * `1.0.0-test1`, other prereleases, build metadata and stray whitespace.
 */
export function parseVersion(text: string): ParsedVersion | null {
  if (typeof text !== "string") return null;
  const match = VERSION_PATTERN.exec(text);
  if (!match) return null;
  const numbers = match.slice(1, 5).map((part) => (part === undefined ? null : Number(part)));
  // Past this a number loses precision and could compare wrongly.
  if (numbers.some((n) => n !== null && n > Number.MAX_SAFE_INTEGER)) return null;
  const [major, minor, patch, test] = numbers as [number, number, number, number | null];
  return { major, minor, patch, test };
}

export function isTestVersion(text: string): boolean {
  return parseVersion(text)?.test != null;
}

/**
 * SemVer precedence on two version strings: negative when `a` is older, zero
 * when equal, positive when `a` is newer. `X.Y.Z-test.N` is below `X.Y.Z`, and
 * test numbers compare as numbers, so `test.10` follows `test.9`. Throws on a
 * string outside the scheme, so a bad version can never quietly compare equal.
 */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) {
    throw new Error(`Not a CuePoint version: ${left ? b : a}`);
  }
  return (
    left.major - right.major ||
    left.minor - right.minor ||
    left.patch - right.patch ||
    compareTest(left.test, right.test)
  );
}

// A normal version outranks any test of the same X.Y.Z.
function compareTest(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/**
 * The file a target downloads, per DIST-03's names. A Mac updates from the zip,
 * not the dmg.
 */
export function targetFileName(version: string, target: UpdateTarget): string {
  switch (target) {
    case "win-x64":
      return `CuePoint-${version}-win-x64-setup.exe`;
    case "mac-arm64":
      return `CuePoint-${version}-mac-arm64.zip`;
    case "mac-x64":
      return `CuePoint-${version}-mac-x64.zip`;
    case "linux-x64":
      return `CuePoint-${version}-linux-x86_64.AppImage`;
  }
}

export function targetFileMatches(name: string, version: string, target: UpdateTarget): boolean {
  return name === targetFileName(version, target);
}

/** The version in a release tag, without the `v`; null outside the scheme. */
export function tagVersion(tag: string): string | null {
  return parseVersion(tag) ? tag.replace(/^v/, "") : null;
}

/** True when the release holds the target's manifest and the target's file. */
export function hasManifestFor(release: Release, target: UpdateTarget): boolean {
  const version = tagVersion(release.tag);
  if (version === null) return false;
  const manifest = MANIFEST_FOR_TARGET[target];
  return (
    release.assets.some((asset) => asset.name === manifest) &&
    release.assets.some((asset) => targetFileMatches(asset.name, version, target))
  );
}

/**
 * The release to offer this computer, or null. Drafts, releases whose tag is
 * outside the scheme and releases without the target's manifest and file are
 * dropped; a normal installed version keeps only normal releases; of those
 * strictly higher than the installed version, the highest wins. An installed
 * version outside the scheme gets nothing.
 */
export function pickUpdate(
  installed: string,
  releases: Release[],
  target: UpdateTarget,
): Release | null {
  const current = parseVersion(installed);
  if (!current) return null;
  const installedVersion = installed.replace(/^v/, "");

  let best: Release | null = null;
  let bestVersion = installedVersion;
  for (const release of releases) {
    if (release.draft) continue;
    const version = tagVersion(release.tag);
    if (version === null) continue;
    if (current.test === null && isTestVersion(version)) continue;
    if (!hasManifestFor(release, target)) continue;
    if (compareVersions(version, bestVersion) <= 0) continue;
    best = release;
    bestVersion = version;
  }
  return best;
}

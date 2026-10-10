import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PUBLIC } from "../../site.config";
import { GITHUB_URL } from "../data/site";

/**
 * docs/release/CHANGELOG.md (Keep a Changelog) as data for /changelog/ (SITE-10). The file is read
 * at build time and never edited from here. The heading rule matches scripts/validate_changelog.py:
 * `## [X.Y.Z] - YYYY-MM-DD` or `## [Unreleased]`; any other `## ` heading ("Release Notes Format")
 * ends the last version.
 */

export interface ChangelogSection {
  /** "Added", "Changed", "Fixed", ... */
  title: string;
  /** One entry per bullet, wrapped lines joined; Markdown inline syntax is left as written. */
  items: string[];
}

export interface ChangelogVersion {
  /** "1.2.0", or "Unreleased". */
  version: string;
  /** YYYY-MM-DD; null for Unreleased. */
  date: string | null;
  /** The id on the page: "v1-2-0", or "unreleased". */
  anchor: string;
  unreleased: boolean;
  /** A version with a prerelease suffix ("1.0.0-test.1"); test builds are not shown in production. */
  prerelease: boolean;
  /** A version of the retired Qt app (before 1.0.0 or on or before the cut-off); shown in preview builds only, badged. */
  retired: boolean;
  /** The GitHub release for the version; null unless the version is in the `releases` set given to the parser. */
  releaseUrl: string | null;
  sections: ChangelogSection[];
}

/**
 * Only versions released after this date belong to the new app. Everything in CHANGELOG.md before it
 * is the retired Qt app (DEC-176: the new app starts at 1.0.0-test.1 and normal users are offered
 * 1.0.0 and later; DEC-194: no download until 1.0.0). YYYY-MM-DD.
 */
export const NEW_APP_CUTOFF = "2026-10-01";

/** The GitHub release for a version. The tag is `v` + the version (DIST-04). */
export function releaseUrl(version: string): string {
  return `${GITHUB_URL}/releases/tag/v${version}`;
}

const VERSION_HEADING = /^##\s+\[([^\]]+)\]\s*(?:-\s*(\S+))?\s*$/;
const BRACKET_HEADING = /^##\s+\[/;
const ANY_H2 = /^##\s/;
const SECTION_HEADING = /^###\s+(.+?)\s*$/;
const BULLET = /^[-*]\s+(.*)$/;
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

const isRealDate = (s: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
};

interface Semver {
  core: [number, number, number];
  pre: string[];
}

function parseSemver(v: string): Semver | null {
  const m = SEMVER.exec(v);
  if (!m) return null;
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split(".") : [] };
}

/** SemVer 2.0 precedence: cores numerically; a release outranks its prereleases; identifiers as the spec says. */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) throw new Error(`compareSemver: not a version: "${!pa ? a : b}"`);
  for (let i = 0; i < 3; i++) {
    const diff = pa.core[i]! - pb.core[i]!;
    if (diff !== 0) return diff;
  }
  if (pa.pre.length === 0 || pb.pre.length === 0) return pb.pre.length - pa.pre.length;
  for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
    const x = pa.pre[i];
    const y = pb.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) {
      const diff = Number(x) - Number(y);
      if (diff !== 0) return diff;
    } else if (xn !== yn) {
      return xn ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Parses the changelog, keeping the file's order (newest first). Throws on a version heading it
 * cannot read, a repeated version, a missing date, or dates that rise down the shown list.
 * Production shows only new-app normal versions (1.0.0 or later, no prerelease suffix, dated after
 * NEW_APP_CUTOFF), so it can show none. A preview build also shows Unreleased (first), test builds
 * and the retired app's versions, each badged by the page.
 * `releases` lists the versions that have a real GitHub release; only those get a release link.
 */
export function parseChangelog(
  text: string,
  options: { preview: boolean; releases?: ReadonlySet<string> },
): ChangelogVersion[] {
  const versions: ChangelogVersion[] = [];
  const seen = new Set<string>();
  let current: ChangelogVersion | null = null;
  let section: ChangelogSection | null = null;
  let item: string[] | null = null;

  const endItem = () => {
    if (section && item) section.items.push(item.join(" "));
    item = null;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const heading = VERSION_HEADING.exec(rawLine);
    if (BRACKET_HEADING.test(rawLine) && !heading) {
      throw new Error(`CHANGELOG.md: cannot read the version heading "${rawLine}" (expected "## [X.Y.Z] - YYYY-MM-DD")`);
    }
    if (heading || ANY_H2.test(rawLine)) {
      endItem();
      section = null;
      current = null;
      if (!heading) continue;
      const version = heading[1]!.trim();
      const unreleased = version.toLowerCase() === "unreleased";
      const semver = unreleased ? null : parseSemver(version);
      if (!unreleased && !semver) throw new Error(`CHANGELOG.md: "${version}" is not a version (X.Y.Z)`);
      const date = unreleased ? null : (heading[2] ?? null);
      if (!unreleased && (date === null || !isRealDate(date))) {
        throw new Error(`CHANGELOG.md: version ${version} needs a date written YYYY-MM-DD, got "${date ?? ""}"`);
      }
      const name = unreleased ? "Unreleased" : version;
      if (seen.has(name)) throw new Error(`CHANGELOG.md: version ${name} appears twice`);
      seen.add(name);
      current = {
        version: name,
        date,
        anchor: unreleased ? "unreleased" : `v${version.replace(/[^0-9A-Za-z]+/g, "-")}`,
        unreleased,
        prerelease: (semver?.pre.length ?? 0) > 0,
        retired: !unreleased && (semver!.core[0] < 1 || (date ?? "") <= NEW_APP_CUTOFF),
        releaseUrl: !unreleased && options.releases?.has(version) ? releaseUrl(version) : null,
        sections: [],
      };
      versions.push(current);
      continue;
    }
    if (!current) continue;

    const sectionHeading = SECTION_HEADING.exec(rawLine);
    if (sectionHeading) {
      endItem();
      const title = sectionHeading[1]!;
      section = current.sections.find((s) => s.title === title) ?? null;
      if (!section) {
        section = { title, items: [] };
        current.sections.push(section);
      }
      continue;
    }
    if (!section) continue;

    const bullet = BULLET.exec(rawLine);
    if (bullet) {
      endItem();
      item = [bullet[1]!.trim()];
    } else if (rawLine.trim() === "" || rawLine.trim() === "---") {
      endItem();
    } else if (item && /^\s+/.test(rawLine)) {
      item.push(rawLine.trim());
    } else {
      endItem();
    }
  }
  endItem();

  const shown = versions.filter((v) => (options.preview ? true : !v.unreleased && !v.retired && !v.prerelease));
  // The file runs newest first; a date that rises down the list means a version is out of place.
  let previous: ChangelogVersion | undefined;
  for (const v of shown) {
    if (v.date === null) continue;
    if (previous?.date && v.date > previous.date) {
      throw new Error(
        `CHANGELOG.md: ${v.version} (${v.date}) is dated after ${previous.version} (${previous.date}) above it; versions must run newest first`,
      );
    }
    previous = v;
  }
  return shown;
}

/** The newest version a normal user is offered (never Unreleased, a test build or the retired app), for the download page to link. */
export function newestReleasedVersion(versions: readonly ChangelogVersion[]): ChangelogVersion | undefined {
  return versions.find((v) => !v.unreleased && !v.retired && !v.prerelease);
}

/** Where the changelog lives, from apps/website (where the build and the tests run). */
const CHANGELOG_PATH = resolve(process.cwd(), "..", "..", "docs", "release", "CHANGELOG.md");

/** The real changelog; `preview` defaults to the site's flag (PUBLIC false means a preview build). */
export function loadChangelog(options: { preview?: boolean; releases?: ReadonlySet<string> } = {}): ChangelogVersion[] {
  return parseChangelog(readFileSync(CHANGELOG_PATH, "utf8"), {
    preview: options.preview ?? !PUBLIC,
    ...(options.releases ? { releases: options.releases } : {}),
  });
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ESCAPES[c]!);

/** One line of Markdown as safe HTML: code spans are taken out first, the rest is escaped, then **bold**, then the code goes back. */
export function renderInline(text: string, base: string = import.meta.env.BASE_URL): string {
  const codes: string[] = [];
  const withoutCode = text.replace(/`([^`]+)`/g, (_, code: string) => {
    codes.push(escapeHtml(code));
    return `\u0000${codes.length - 1}\u0000`;
  });
  return escapeHtml(withoutCode.replace(/\u0000/g, "\u0001"))
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_whole, label: string, target: string) => {
      const href = linkTarget(target, base);
      return href ? `<a href="${href}">${label}</a>` : label;
    })
    .replace(/\u0001(\d+)\u0001/g, (_, i: string) => `<code>${codes[Number(i)]}</code>`);
}

/**
 * Where a changelog link points on the site. The changelog is written for GitHub: a guide link is
 * `../user-guide/<page>.md#part` and becomes that guide page here; an https link is kept as it is
 * (the text was escaped already, so quotes cannot break out of the attribute); anything else (a
 * repository path, a bare file) has no page here and is shown as plain text.
 */
export function linkTarget(target: string, base: string): string | undefined {
  const guide = /^(?:\.\.\/)?(?:docs\/)?user-guide\/([a-z0-9-]+)\.md(#[A-Za-z0-9_-]+)?$/.exec(target);
  if (guide) {
    const b = base.endsWith("/") ? base : `${base}/`;
    return `${b}guide/${guide[1]}/${guide[2] ?? ""}`;
  }
  if (/^https:\/\/[^"'<>\s]+$/.test(target)) return target;
  return undefined;
}

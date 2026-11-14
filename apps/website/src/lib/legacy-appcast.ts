import type { ReleaseData, ReleaseFile, System } from "./releases";

/**
 * The update feed the retired app (the old Qt CuePoint, 0.0.x) still reads (Sentry PYTHON-1G).
 *
 * 0.0.3 asks `https://stuchain.github.io/CuePoint/updates/<system>/stable/appcast.xml`, a fixed
 * address. GitHub sends that address to this site since the site moved here (SITE-13), and the
 * file was gone, so every start showed "Unable to check for updates: Network error: Not Found".
 * This writes the same Sparkle-style feed the old app was built to read, with one item: the newest
 * normal release, so an old copy offers the new app and installs it with its own updater.
 *
 * Only the old app reads it. CuePoint 1.0 updates from GitHub's release list and the release's own
 * `latest*.yml`, never from this site.
 *
 * What 0.0.3 needs from an item (its `update_checker.py`): `sparkle:shortVersionString` (the
 * version it compares; `sparkle:version` must be there too), an `enclosure` with an https `url`,
 * `length` and `sparkle:sha256`, and optionally `sparkle:releaseNotesLink` and a `description` it
 * shows. A Mac copy mounts the disk image and replaces `/Applications/CuePoint.app`; a Windows copy
 * runs the setup.
 *
 * The Mac feed has no item for now (2026-11-14): the old Mac updater deletes
 * `/Applications/CuePoint.app` before it copies the new one in, and it cannot read a minimum macOS
 * version, so a Mac below macOS 15 (which 1.0 needs) would be left with no app that opens. With no
 * item, an old Mac copy says it is up to date instead of showing the error. Should the Mac ever be
 * offered one, it must be the Intel (x64) image: the old app was one build for every Mac, the Intel
 * build opens on both chips, and 1.0's own updater moves a copy running under Rosetta to the Apple
 * Silicon build at its next update.
 */

export const SPARKLE_NS = "http://www.andymatuschak.org/xml-namespaces/sparkle";

/** The file each system's old copy is offered. */
const OFFERED: Record<"windows" | "macos", { system: System; chip: ReleaseFile["chip"] } | null> = {
  windows: { system: "windows", chip: "x64" },
  macos: null,
};

const NOTES =
  "CuePoint 1.0 is a new app that replaces this one. Installing it does not change your Rekordbox " +
  "collection. When it is installed, open your Rekordbox collection.xml in it, then remove the old CuePoint " +
  "0.0 from your computer's list of apps.";

function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** RFC 822 date, as Sparkle's `pubDate` is written. */
function rfc822(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toUTCString().replace("GMT", "+0000");
}

/**
 * The feed for one system's old copies. With no normal release, or none for that system, the
 * channel has no item, which the old app reads as "no update".
 */
export function legacyAppcast(data: ReleaseData, system: "windows" | "macos"): string {
  const wanted = OFFERED[system];
  const file =
    data.release && wanted ? data.files.find((f) => f.system === wanted.system && f.chip === wanted.chip) : undefined;
  const lines = [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<rss version="2.0" xmlns:sparkle="${SPARKLE_NS}">`,
    `  <channel>`,
    `    <title>CuePoint Updates</title>`,
    `    <link>https://usecuepoint.com/</link>`,
    `    <description>Updates for the retired CuePoint 0.0 app</description>`,
    `    <language>en</language>`,
  ];
  if (data.release && file) {
    const version = escape(data.release.version);
    const date = rfc822(data.release.publishedAt);
    lines.push(
      `    <item>`,
      `      <title>CuePoint ${version}</title>`,
      ...(date ? [`      <pubDate>${date}</pubDate>`] : []),
      `      <sparkle:version>${version}</sparkle:version>`,
      `      <sparkle:shortVersionString>${version}</sparkle:shortVersionString>`,
      `      <sparkle:releaseNotesLink>${escape(data.release.notesUrl)}</sparkle:releaseNotesLink>`,
      `      <description>${escape(NOTES)}</description>`,
      `      <enclosure url="${escape(file.url)}" length="${file.size}" type="application/octet-stream" ` +
        `sparkle:version="${version}" sparkle:shortVersionString="${version}" sparkle:sha256="${file.sha256}" />`,
      `    </item>`,
    );
  }
  lines.push(`  </channel>`, `</rss>`, ``);
  return lines.join("\n");
}

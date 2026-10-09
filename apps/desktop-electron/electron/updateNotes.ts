/**
 * The notes of a release, kept for "What's new" (DIST-06, DEC-172).
 *
 * When an update reaches `ready` (or `manual`) the updater writes its notes to
 * `userData/updates/<version>/notes.md`. After the update installs, the new
 * version reads them back, so "What's new" works offline and shows exactly what
 * the person was told about. When that file is missing (a version installed by
 * hand), the release list's notes for `v<version>` are used, and failing that
 * there are none.
 *
 * "What's new" is offered once per version: `lastSeenVersion` in main's settings
 * is the version it was last shown for. A first install, or the first build with
 * the updater, has none, so it is set to the running version and nothing is
 * offered (nobody wants a notice for the version they just installed).
 *
 * This file also holds the one rule for which pages the app opens in the browser
 * for an update: GitHub's CuePoint releases, never an address the page sends.
 */
import fs from "node:fs";
import path from "node:path";

import { releaseNoteLinkUrl } from "./externalLinks";
import { RELEASES_REPOSITORY } from "./releaseList";
import { compareVersions, parseVersion, tagVersion, type Release } from "./updateRule";

/** What the page is shown for a version's release. */
export interface ReleaseNotes {
  version: string;
  /** Markdown as the release was written, or null when none could be found. */
  notes: string | null;
  releaseUrl: string | null;
}

const RELEASE_PAGE_PREFIX = `https://github.com/${RELEASES_REPOSITORY}/releases/`;

/** The page for a version's tag; fixed text built from the repository name. */
export function releasePageFor(version: string): string {
  return `${RELEASE_PAGE_PREFIX}tag/v${version}`;
}

/** The address when it is one of CuePoint's release pages on GitHub, else null. */
export function releasePageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.host !== "github.com" || parsed.username || parsed.password) {
    return null;
  }
  return parsed.href.startsWith(RELEASE_PAGE_PREFIX) ? parsed.href : null;
}

/**
 * Opens a release page in the system browser, and only after `releasePageUrl`
 * has passed it. Answers whether it opened. `opener` is Electron's `shell`;
 * main has no other place that opens an address.
 */
export async function openReleasePage(
  address: unknown,
  opener: { openExternal: (url: string) => Promise<void> },
): Promise<boolean> {
  const page = releasePageUrl(address);
  if (page === null) return false;
  await opener.openExternal(page);
  return true;
}

/**
 * Opens a link from a release's notes (DIST-07), only when `releaseNoteLinkUrl` allows it.
 * Answers whether it opened; a refused link is refused quietly.
 */
export async function openNoteLink(
  address: unknown,
  opener: { openExternal: (url: string) => Promise<void> },
): Promise<boolean> {
  const page = releaseNoteLinkUrl(address);
  if (page === null) return false;
  await opener.openExternal(page);
  return true;
}

export function notesPath(updatesDir: string, version: string): string {
  return path.join(updatesDir, version, "notes.md");
}

/** Writes a version's notes; a failure only loses "What's new", so it is swallowed. */
export function writeNotes(updatesDir: string, version: string, notes: string): void {
  try {
    const file = notesPath(updatesDir, version);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, notes, "utf8");
  } catch {
    // Nothing depends on the file but the notes link.
  }
}

export function readNotes(updatesDir: string, version: string): string | null {
  try {
    return fs.readFileSync(notesPath(updatesDir, version), "utf8");
  } catch {
    return null;
  }
}

/**
 * Removes what an installed update left (the zip and the unpacked app), keeping
 * `notes.md`, for every version at or below the running one. Called at launch.
 * Anything it cannot remove is left for next time.
 */
export function pruneInstalledUpdates(
  updatesDir: string,
  currentVersion: string,
  isAtOrBelow: (version: string, current: string) => boolean,
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(updatesDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || tagVersion(`v${entry.name}`) === null) continue;
    if (!isAtOrBelow(entry.name, currentVersion)) continue;
    const folder = path.join(updatesDir, entry.name);
    try {
      for (const name of fs.readdirSync(folder)) {
        if (name !== "notes.md") fs.rmSync(path.join(folder, name), { recursive: true, force: true });
      }
    } catch {
      // Left for the next launch.
    }
  }
}

export interface UpdateNotesDeps {
  updatesDir: string;
  currentVersion: string;
  settings: {
    read: () => { lastSeenVersion: string | null };
    update: (patch: { lastSeenVersion: string | null }) => unknown;
  };
  /** The release list, or null when it could not be read. */
  releases: () => Promise<Release[] | null>;
}

export class UpdateNotes {
  constructor(private readonly deps: UpdateNotesDeps) {}

  /**
   * At launch: a first install, or the first build with the updater, has seen
   * nothing yet, so it is marked as seen and nothing is offered (DEC-172).
   */
  noteLaunch(): void {
    try {
      if (this.deps.settings.read().lastSeenVersion === null) {
        this.deps.settings.update({ lastSeenVersion: this.deps.currentVersion });
      }
    } catch {
      // Without the file "What's new" is simply not offered.
    }
  }

  /** The running version's notes, to show once after an update; null when there is nothing to show. */
  async getWhatsNew(): Promise<ReleaseNotes | null> {
    let seen: string | null;
    try {
      seen = this.deps.settings.read().lastSeenVersion;
    } catch {
      return null;
    }
    if (seen === null || seen === this.deps.currentVersion) return null;
    // An older build than the one last seen (a downgrade by hand) has nothing new to say.
    if (parseVersion(this.deps.currentVersion) && compareVersions(this.deps.currentVersion, seen) < 0) {
      this.dismissWhatsNew();
      return null;
    }
    return this.getNotes();
  }

  dismissWhatsNew(): void {
    try {
      this.deps.settings.update({ lastSeenVersion: this.deps.currentVersion });
    } catch {
      // It is offered again next launch, which is harmless.
    }
  }

  /** The running version's notes: the saved file, else the release list's, else none. */
  async getNotes(): Promise<ReleaseNotes> {
    const version = this.deps.currentVersion;
    const saved = readNotes(this.deps.updatesDir, version);
    let release: Release | undefined;
    if (saved === null) {
      try {
        release = (await this.deps.releases())?.find((candidate) => tagVersion(candidate.tag) === version);
      } catch {
        release = undefined;
      }
    }
    const notes = saved ?? (release && release.notes.trim() !== "" ? release.notes : null);
    return { version, notes, releaseUrl: releasePageUrl(release?.htmlUrl) ?? releasePageFor(version) };
  }
}

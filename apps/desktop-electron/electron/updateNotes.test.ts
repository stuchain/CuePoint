import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  UpdateNotes,
  notesPath,
  openNoteLink,
  openReleasePage,
  pruneInstalledUpdates,
  readNotes,
  releasePageFor,
  releasePageUrl,
  writeNotes,
} from "./updateNotes";
import { compareVersions, type Release } from "./updateRule";

/** "What's new" (DIST-06, DEC-172) and the pages the app opens for an update. */

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});
function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cuepoint-notes-"));
  made.push(dir);
  return dir;
}

function listed(version: string, notes: string, htmlUrl: string | null = releasePageFor(version)): Release {
  return { tag: `v${version}`, version, draft: false, prerelease: false, notes, publishedAt: null, htmlUrl, assets: [] };
}

function setup(options: { seen: string | null; current?: string; releases?: Release[] | null }) {
  const updatesDir = tempDir();
  const settings = { lastSeenVersion: options.seen };
  const releases = vi.fn(async () => options.releases ?? null);
  const notes = new UpdateNotes({
    updatesDir,
    currentVersion: options.current ?? "1.5.0",
    settings: {
      read: () => ({ ...settings }),
      update: (patch) => {
        Object.assign(settings, patch);
      },
    },
    releases,
  });
  return { notes, settings, updatesDir, releases };
}

describe("release pages", () => {
  it("opens only CuePoint's releases on GitHub", () => {
    const ok = "https://github.com/stuchain/CuePoint/releases/tag/v1.5.0";
    expect(releasePageUrl(ok)).toBe(ok);
    expect(releasePageUrl("https://github.com/stuchain/CuePoint/releases/")).not.toBeNull();
  });

  it.each([
    ["another repository", "https://github.com/someone/else/releases/tag/v1"],
    ["a look-alike host", "https://github.com.evil.test/stuchain/CuePoint/releases/tag/v1"],
    ["plain http", "http://github.com/stuchain/CuePoint/releases/tag/v1"],
    ["an address with a login", "https://x@github.com/stuchain/CuePoint/releases/tag/v1"],
    ["a different page of the repository", "https://github.com/stuchain/CuePoint/issues/1"],
    ["a file address", "file:///etc/passwd"],
    ["not text", 5],
    ["null", null],
  ])("refuses %s", (_what, value) => {
    expect(releasePageUrl(value)).toBeNull();
  });
});

describe("opening a release page", () => {
  it("opens a CuePoint release page and says so", async () => {
    const openExternal = vi.fn(async () => undefined);
    await expect(openReleasePage(releasePageFor("1.5.0"), { openExternal })).resolves.toBe(true);
    expect(openExternal).toHaveBeenCalledWith("https://github.com/stuchain/CuePoint/releases/tag/v1.5.0");
  });

  it("opens nothing else", async () => {
    const openExternal = vi.fn(async () => undefined);
    await expect(openReleasePage("https://evil.test/", { openExternal })).resolves.toBe(false);
    await expect(openReleasePage(null, { openExternal })).resolves.toBe(false);
    expect(openExternal).not.toHaveBeenCalled();
  });
});

describe("opening a link from the notes", () => {
  it("opens an allowed link and says so", async () => {
    const openExternal = vi.fn(async () => undefined);
    await expect(openNoteLink("https://github.com/stuchain/CuePoint/pull/3", { openExternal })).resolves.toBe(true);
    expect(openExternal).toHaveBeenCalledWith("https://github.com/stuchain/CuePoint/pull/3");
  });

  it("opens nothing else, quietly", async () => {
    const openExternal = vi.fn(async () => undefined);
    await expect(openNoteLink("https://evil.test/", { openExternal })).resolves.toBe(false);
    await expect(openNoteLink("javascript:alert(1)", { openExternal })).resolves.toBe(false);
    await expect(openNoteLink(undefined, { openExternal })).resolves.toBe(false);
    expect(openExternal).not.toHaveBeenCalled();
  });
});

describe("saved notes", () => {
  it("round-trip through userData/updates/<version>/notes.md", () => {
    const dir = tempDir();
    writeNotes(dir, "1.5.0", "# Hello");
    expect(readNotes(dir, "1.5.0")).toBe("# Hello");
    expect(notesPath(dir, "1.5.0")).toBe(path.join(dir, "1.5.0", "notes.md"));
  });

  it("read as none when missing, and a failed write is swallowed", () => {
    const dir = tempDir();
    expect(readNotes(dir, "1.5.0")).toBeNull();
    fs.writeFileSync(path.join(dir, "1.5.0"), "a file where the folder goes");
    expect(() => writeNotes(dir, "1.5.0", "x")).not.toThrow();
  });
});

describe("What's new (DEC-172)", () => {
  it("offers nothing on a first install, and marks the version seen", async () => {
    const s = setup({ seen: null });
    s.notes.noteLaunch();
    expect(s.settings.lastSeenVersion).toBe("1.5.0");
    expect(await s.notes.getWhatsNew()).toBeNull();
  });

  it("offers nothing when the version is the one last seen", async () => {
    const s = setup({ seen: "1.5.0" });
    s.notes.noteLaunch();
    expect(await s.notes.getWhatsNew()).toBeNull();
  });

  it("offers the running version's saved notes after an update", async () => {
    const s = setup({ seen: "1.4.0" });
    writeNotes(s.updatesDir, "1.5.0", "What changed");
    s.notes.noteLaunch();
    expect(s.settings.lastSeenVersion).toBe("1.4.0"); // not overwritten
    expect(await s.notes.getWhatsNew()).toEqual({
      version: "1.5.0",
      notes: "What changed",
      releaseUrl: "https://github.com/stuchain/CuePoint/releases/tag/v1.5.0",
    });
    expect(s.releases).not.toHaveBeenCalled();
  });

  it("falls back to the release list's notes for the tag", async () => {
    const s = setup({
      seen: "1.4.0",
      releases: [listed("1.4.0", "old"), listed("1.5.0", "From GitHub")],
    });
    expect(await s.notes.getWhatsNew()).toMatchObject({ version: "1.5.0", notes: "From GitHub" });
  });

  it("has no notes when neither is there", async () => {
    const s = setup({ seen: "1.4.0", releases: null });
    expect(await s.notes.getWhatsNew()).toEqual({
      version: "1.5.0",
      notes: null,
      releaseUrl: "https://github.com/stuchain/CuePoint/releases/tag/v1.5.0",
    });
  });

  it("treats an empty release body as no notes", async () => {
    const s = setup({ seen: "1.4.0", releases: [listed("1.5.0", "  \n")] });
    expect((await s.notes.getWhatsNew())?.notes).toBeNull();
  });

  it("never opens an address the release list holds that is not a release page", async () => {
    const s = setup({ seen: "1.4.0", releases: [listed("1.5.0", "x", "https://evil.test/")] });
    expect((await s.notes.getWhatsNew())?.releaseUrl).toBe(releasePageFor("1.5.0"));
  });

  it("offers nothing to a build older than the one last seen, and lowers the mark", async () => {
    const s = setup({ seen: "1.6.0", current: "1.5.0" });
    writeNotes(s.updatesDir, "1.5.0", "Older");
    expect(await s.notes.getWhatsNew()).toBeNull();
    expect(s.settings.lastSeenVersion).toBe("1.5.0");
  });

  it("dismissing marks the running version seen", async () => {
    const s = setup({ seen: "1.4.0" });
    s.notes.dismissWhatsNew();
    expect(s.settings.lastSeenVersion).toBe("1.5.0");
    expect(await s.notes.getWhatsNew()).toBeNull();
  });

  it("still gives the running version's notes for Settings' link", async () => {
    const s = setup({ seen: "1.5.0" });
    writeNotes(s.updatesDir, "1.5.0", "Notes");
    expect(await s.notes.getNotes()).toMatchObject({ version: "1.5.0", notes: "Notes" });
  });

  it("survives a settings file that cannot be read or written", async () => {
    const notes = new UpdateNotes({
      updatesDir: tempDir(),
      currentVersion: "1.5.0",
      settings: {
        read: () => {
          throw new Error("no");
        },
        update: () => {
          throw new Error("no");
        },
      },
      releases: async () => {
        throw new Error("offline");
      },
    });
    expect(() => notes.noteLaunch()).not.toThrow();
    expect(() => notes.dismissWhatsNew()).not.toThrow();
    expect(await notes.getWhatsNew()).toBeNull();
    expect((await notes.getNotes()).notes).toBeNull();
  });
});

describe("pruning what an installed update left", () => {
  it("removes the zip and the unpacked app of versions at or below the running one, keeping the notes", () => {
    const dir = tempDir();
    for (const version of ["1.4.0", "1.5.0", "1.6.0"]) {
      fs.mkdirSync(path.join(dir, version, "unpacked"), { recursive: true });
      fs.writeFileSync(path.join(dir, version, `CuePoint-${version}-mac-arm64.zip`), "zip");
      fs.writeFileSync(path.join(dir, version, "notes.md"), "n");
    }
    fs.writeFileSync(path.join(dir, "install.sh"), "#!/bin/sh");
    pruneInstalledUpdates(dir, "1.5.0", (version, current) => compareVersions(version, current) <= 0);

    expect(fs.readdirSync(path.join(dir, "1.4.0"))).toEqual(["notes.md"]);
    expect(fs.readdirSync(path.join(dir, "1.5.0"))).toEqual(["notes.md"]);
    expect(fs.readdirSync(path.join(dir, "1.6.0")).sort()).toEqual(["CuePoint-1.6.0-mac-arm64.zip", "notes.md", "unpacked"]);
    expect(fs.existsSync(path.join(dir, "install.sh"))).toBe(true);
  });

  it("does nothing when the folder is missing", () => {
    expect(() => pruneInstalledUpdates(path.join(tempDir(), "nope"), "1.5.0", () => true)).not.toThrow();
  });
});

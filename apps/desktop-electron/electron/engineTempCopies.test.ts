import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ENGINE_MARKER, STALE_ENGINE_COPY_MS, staleEngineCopies, sweepEngineCopies } from "./engineTempCopies";

const NOW = 1_700_000_000_000;
const OLD = NOW - STALE_ENGINE_COPY_MS - 1;

describe("which leftover engine copies are taken (B6)", () => {
  it("takes CuePoint's own copies older than a minute, and nothing else", () => {
    expect(
      staleEngineCopies(
        [
          { name: "_MEI1001", mtimeMs: OLD, engine: true },
          { name: "_MEI1002", mtimeMs: NOW - 5_000, engine: true }, // this start's, still unpacking
          { name: "_MEI1003", mtimeMs: OLD, engine: false }, // another program's
          { name: "_MEI1004.cuepoint-old", mtimeMs: NOW, engine: false }, // a delete cut short
          { name: "other", mtimeMs: OLD, engine: true },
        ],
        NOW,
      ),
    ).toEqual(["_MEI1001", "_MEI1004.cuepoint-old"]);
  });
});

describe("sweeping the temp folder (B6)", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  function temp(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-engine-copies-"));
    dirs.push(dir);
    return dir;
  }

  function copy(dir: string, name: string, marker: boolean, ageMs: number): void {
    const folder = path.join(dir, name);
    fs.mkdirSync(path.join(folder, "lib"), { recursive: true });
    fs.writeFileSync(path.join(folder, "lib", "python311.dll"), "x");
    if (marker) fs.writeFileSync(path.join(folder, ENGINE_MARKER), "{}");
    const when = new Date(NOW - ageMs);
    fs.utimesSync(folder, when, when);
  }

  it("deletes an old CuePoint copy on Windows and keeps a fresh one and another program's", async () => {
    const dir = temp();
    copy(dir, "_MEI2001", true, STALE_ENGINE_COPY_MS * 10);
    copy(dir, "_MEI2002", true, 1_000);
    copy(dir, "_MEI2003", false, STALE_ENGINE_COPY_MS * 10);
    expect(await sweepEngineCopies(dir, NOW, "win32")).toEqual(["_MEI2001"]);
    expect(fs.readdirSync(dir).sort()).toEqual(["_MEI2002", "_MEI2003"]);
  });

  it("does nothing off Windows, where the engine is not a one-file build", async () => {
    const dir = temp();
    copy(dir, "_MEI3001", true, STALE_ENGINE_COPY_MS * 10);
    expect(await sweepEngineCopies(dir, NOW, "darwin")).toEqual([]);
    expect(fs.readdirSync(dir)).toEqual(["_MEI3001"]);
  });

  it("never rejects on a temp folder it cannot read", async () => {
    expect(await sweepEngineCopies(path.join(os.tmpdir(), "cp-no-such-folder-xyz"), NOW, "win32")).toEqual([]);
  });
});

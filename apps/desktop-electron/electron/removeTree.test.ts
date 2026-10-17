import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { removeTree } from "./removeTree";

describe("removeTree", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deletes a folder and everything in it", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "remove-tree-"));
    const resources = path.join(root, "CuePoint.app", "Contents", "Resources");
    fs.mkdirSync(resources, { recursive: true });
    fs.writeFileSync(path.join(resources, "app.asar"), "archive");
    removeTree(root);
    expect(fs.existsSync(root)).toBe(false);
  });

  it("is quiet about a path that is not there", () => {
    expect(() => removeTree(path.join(os.tmpdir(), "remove-tree-never-made"))).not.toThrow();
  });

  // Regression: in the packaged app the recursive delete read app.asar as a folder and threw
  // ENOTDIR, so a refused Mac update was reported as a failed download and left on disk.
  it("turns asar support off for the delete and back as it was after", () => {
    const seen: unknown[] = [];
    vi.spyOn(fs, "rmSync").mockImplementation(() => {
      seen.push(process.noAsar);
    });
    const before = process.noAsar;
    removeTree("/somewhere");
    expect(seen).toEqual([true]);
    expect(process.noAsar).toBe(before);
  });

  it("puts asar support back even when the delete throws", () => {
    vi.spyOn(fs, "rmSync").mockImplementation(() => {
      throw new Error("EBUSY");
    });
    process.noAsar = false;
    expect(() => removeTree("/somewhere")).toThrow("EBUSY");
    expect(process.noAsar).toBe(false);
  });
});

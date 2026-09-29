import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { MAIN_SETTINGS_FILE, MainSettingsStore, parseMainSettings } from "./mainSettings";

/**
 * What the main process remembers for itself (PREP-08).
 *
 * A file in the user-data folder that reading never fails on and writing
 * replaces whole. Its one setting today is where set lists go.
 */

const made: string[] = [];

afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function settingsFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cuepoint-main-"));
  made.push(dir);
  return path.join(dir, MAIN_SETTINGS_FILE);
}

const GIGS = path.resolve("/music/gigs");

describe("reading", () => {
  it("answers the defaults before anything was written", () => {
    expect(new MainSettingsStore(settingsFile()).read()).toEqual({ setListFolder: null });
  });

  it.each([
    ["not JSON", "{nope"],
    ["an array", "[1, 2]"],
    ["null", "null"],
    ["a folder that is not text", JSON.stringify({ setListFolder: 7 })],
    ["a folder that is not absolute", JSON.stringify({ setListFolder: "music/gigs" })],
  ])("reads %s as the default", (_what, text) => {
    expect(parseMainSettings(text)).toEqual({ setListFolder: null });
  });

  it("keeps an absolute folder, and ignores what it does not know", () => {
    expect(parseMainSettings(JSON.stringify({ setListFolder: GIGS, theme: "dark" }))).toEqual({
      setListFolder: GIGS,
    });
  });

  it("reads a file that cannot be opened as the defaults", () => {
    const file = settingsFile();
    fs.mkdirSync(file); // a folder where the file should be
    expect(new MainSettingsStore(file).read()).toEqual({ setListFolder: null });
  });
});

describe("writing", () => {
  it("writes the file whole, and reads it back", () => {
    const file = settingsFile();
    const store = new MainSettingsStore(file);

    expect(store.update({ setListFolder: GIGS })).toEqual({ setListFolder: GIGS });

    expect(new MainSettingsStore(file).read()).toEqual({ setListFolder: GIGS });
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ setListFolder: GIGS });
  });

  it("leaves no temporary file behind", () => {
    const file = settingsFile();
    new MainSettingsStore(file).update({ setListFolder: GIGS });
    expect(fs.readdirSync(path.dirname(file))).toEqual([MAIN_SETTINGS_FILE]);
  });

  it("makes the folder it lives in", () => {
    const file = path.join(path.dirname(settingsFile()), "deeper", MAIN_SETTINGS_FILE);
    new MainSettingsStore(file).update({ setListFolder: GIGS });
    expect(new MainSettingsStore(file).read().setListFolder).toBe(GIGS);
  });

  it("keeps the old settings when a write fails, and says so", () => {
    const file = settingsFile();
    const store = new MainSettingsStore(file);
    store.update({ setListFolder: GIGS });
    // A folder in the temporary file's place makes the write itself fail.
    fs.mkdirSync(`${file}.${process.pid}.tmp`);

    expect(() => store.update({ setListFolder: path.resolve("/elsewhere") })).toThrow();
    expect(store.read()).toEqual({ setListFolder: GIGS });
  });
});

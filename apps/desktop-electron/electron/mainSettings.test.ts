import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { MAIN_SETTINGS_FILE, MainSettingsStore, parseMainSettings } from "./mainSettings";

/**
 * What the main process remembers for itself (PREP-08).
 *
 * A file in the user-data folder that reading never fails on and writing
 * replaces whole. It holds where set lists go and the error-reporting
 * choice (REPORT-01, DEC-128).
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
const DEFAULTS = { setListFolder: null, errorReporting: true, lastCheckedAt: null, lastSeenVersion: null, pendingInstall: null };

describe("reading", () => {
  it("answers the defaults before anything was written", () => {
    expect(new MainSettingsStore(settingsFile()).read()).toEqual({ ...DEFAULTS });
  });

  it.each([
    ["not JSON", "{nope"],
    ["an array", "[1, 2]"],
    ["null", "null"],
    ["a folder that is not text", JSON.stringify({ setListFolder: 7 })],
    ["a folder that is not absolute", JSON.stringify({ setListFolder: "music/gigs" })],
  ])("reads %s as the default", (_what, text) => {
    expect(parseMainSettings(text)).toEqual({ ...DEFAULTS });
  });

  it("keeps an absolute folder, and ignores what it does not know", () => {
    expect(parseMainSettings(JSON.stringify({ setListFolder: GIGS, theme: "dark" }))).toEqual({
      ...DEFAULTS,
      setListFolder: GIGS,
    });
  });

  it("reads a file that cannot be opened as the defaults", () => {
    const file = settingsFile();
    fs.mkdirSync(file); // a folder where the file should be
    expect(new MainSettingsStore(file).read()).toEqual({ ...DEFAULTS });
  });
});

describe("the error-reporting choice (REPORT-01, DEC-128)", () => {
  it("reads as on when there is no file", () => {
    expect(new MainSettingsStore(settingsFile()).read().errorReporting).toBe(true);
  });

  it("reads as on when the key is missing", () => {
    expect(parseMainSettings(JSON.stringify({ setListFolder: GIGS })).errorReporting).toBe(true);
  });

  it.each([
    ["a string", JSON.stringify({ errorReporting: "false" })],
    ["a number", JSON.stringify({ errorReporting: 0 })],
    ["null", JSON.stringify({ errorReporting: null })],
    ["garbage text", "{nope"],
  ])("reads %s as on", (_what, text) => {
    expect(parseMainSettings(text).errorReporting).toBe(true);
  });

  it("keeps off through a round trip", () => {
    const file = settingsFile();
    new MainSettingsStore(file).update({ errorReporting: false });
    expect(new MainSettingsStore(file).read().errorReporting).toBe(false);
  });

  it("keeps off when the set list folder is updated", () => {
    const file = settingsFile();
    const store = new MainSettingsStore(file);
    store.update({ errorReporting: false });
    expect(store.update({ setListFolder: GIGS })).toEqual({
      ...DEFAULTS,
      setListFolder: GIGS,
      errorReporting: false,
    });
    expect(new MainSettingsStore(file).read().errorReporting).toBe(false);
  });
});

describe("writing", () => {
  it("writes the file whole, and reads it back", () => {
    const file = settingsFile();
    const store = new MainSettingsStore(file);

    expect(store.update({ setListFolder: GIGS })).toEqual({ ...DEFAULTS, setListFolder: GIGS });

    expect(new MainSettingsStore(file).read()).toEqual({ ...DEFAULTS, setListFolder: GIGS });
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ ...DEFAULTS, setListFolder: GIGS });
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
    expect(store.read()).toEqual({ ...DEFAULTS, setListFolder: GIGS });
  });
});

describe("the update fields (DIST-06, DEC-172)", () => {
  const WHEN = "2026-10-08T12:30:00.000Z";

  it("round-trip through a write and a read", () => {
    const file = settingsFile();
    new MainSettingsStore(file).update({ lastCheckedAt: WHEN, lastSeenVersion: "1.5.0-test.2" });
    const read = new MainSettingsStore(file).read();
    expect(read.lastCheckedAt).toBe(WHEN);
    expect(read.lastSeenVersion).toBe("1.5.0-test.2");
  });

  it("keep their values when another setting is updated", () => {
    const store = new MainSettingsStore(settingsFile());
    store.update({ lastCheckedAt: WHEN, lastSeenVersion: "1.4.0" });
    expect(store.update({ errorReporting: false })).toMatchObject({
      lastCheckedAt: WHEN,
      lastSeenVersion: "1.4.0",
    });
  });

  it.each([
    ["a number", 5],
    ["text that is not a date", "yesterday"],
    ["an empty string", ""],
    ["a date without a time zone offset in a loose format", "10/08/2026"],
  ])("read %s as no check yet", (_what, value) => {
    expect(parseMainSettings(JSON.stringify({ lastCheckedAt: value })).lastCheckedAt).toBeNull();
  });

  it.each([
    ["a number", 1.5],
    ["a version outside the scheme", "1.0.0-feb1"],
    ["an old test name", "1.0.0-test1"],
    ["a tag with its v", "v1.4.0"],
    ["null", null],
  ])("read %s as no version seen", (_what, value) => {
    expect(parseMainSettings(JSON.stringify({ lastSeenVersion: value })).lastSeenVersion).toBeNull();
  });

  it("keep the version an install was handed off for, and read a bad one as none", () => {
    const file = settingsFile();
    new MainSettingsStore(file).update({ pendingInstall: "1.5.0" });
    expect(new MainSettingsStore(file).read().pendingInstall).toBe("1.5.0");
    expect(parseMainSettings(JSON.stringify({ pendingInstall: "v1.5.0" })).pendingInstall).toBeNull();
    expect(parseMainSettings(JSON.stringify({ pendingInstall: 3 })).pendingInstall).toBeNull();
    new MainSettingsStore(file).update({ pendingInstall: null });
    expect(new MainSettingsStore(file).read().pendingInstall).toBeNull();
  });

  it("still drop a key they do not know", () => {
    const read = parseMainSettings(JSON.stringify({ lastSeenVersion: "1.4.0", lastCheckedAt: WHEN, theme: "dark" }));
    expect(read).toEqual({ ...DEFAULTS, lastSeenVersion: "1.4.0", lastCheckedAt: WHEN });
  });
});

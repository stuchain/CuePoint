import { describe, expect, it } from "vitest";

import { LONG_PATH_LIMIT, osPath } from "./longPath";

const LONG = `C:\\Music\\${"d\\".repeat(150)}a.mp3`;

describe("the path mpv is given", () => {
  it("is prefixed on Windows when it is longer than 259 characters", () => {
    expect(LONG.length).toBeGreaterThan(LONG_PATH_LIMIT);
    expect(osPath(LONG, "win32")).toBe(`\\\\?\\${LONG}`);
  });

  it("is left alone on macOS and Linux, however long", () => {
    const posix = `/music/${"d/".repeat(150)}a.mp3`;
    expect(osPath(posix, "linux")).toBe(posix);
    expect(osPath(posix, "darwin")).toBe(posix);
    expect(osPath(LONG, "darwin")).toBe(LONG);
  });

  it("is left alone at 259 characters and prefixed at 260", () => {
    const at = (n: number) => `C:\\Music\\${"a".repeat(n - 13)}.mp3`;
    expect(at(259)).toHaveLength(259);
    expect(osPath(at(259), "win32")).toBe(at(259));
    expect(osPath(at(260), "win32")).toBe(`\\\\?\\${at(260)}`);
  });

  it("turns forward slashes into backslashes and collapses dot segments once prefixed", () => {
    const path = `C:/Music/./x/../${"a".repeat(300)}.mp3`;
    expect(osPath(path, "win32")).toBe(`\\\\?\\C:\\Music\\${"a".repeat(300)}.mp3`);
  });

  it("gives a network share the UNC prefix", () => {
    const expected = `\\\\?\\UNC\\server\\share\\${"a".repeat(300)}.mp3`;
    expect(osPath(`\\\\server\\share\\${"a".repeat(300)}.mp3`, "win32")).toBe(expected);
    expect(osPath(`//server/share/${"a".repeat(300)}.mp3`, "win32")).toBe(expected);
  });

  it("never climbs above the share or the drive with ..", () => {
    const tail = "a".repeat(300);
    expect(osPath(`\\\\server\\share\\..\\..\\${tail}`, "win32")).toBe(
      `\\\\?\\UNC\\server\\share\\${tail}`,
    );
    expect(osPath(`C:\\..\\..\\${tail}`, "win32")).toBe(`\\\\?\\C:\\${tail}`);
  });

  it("is not prefixed twice, and a relative path is never prefixed", () => {
    const prefixed = `\\\\?\\${LONG}`;
    expect(osPath(prefixed, "win32")).toBe(prefixed);
    const relative = `music\\${"a".repeat(300)}`;
    expect(osPath(relative, "win32")).toBe(relative);
  });

  it("leaves a short Windows path as it is", () => {
    expect(osPath("C:\\Music\\a.mp3", "win32")).toBe("C:\\Music\\a.mp3");
  });
});

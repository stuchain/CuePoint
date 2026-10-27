import { describe, expect, it } from "vitest";

import { displayPath, displayPathNameFirst, isWindowsPath, pathParts } from "./paths";

describe("displayPath (M500)", () => {
  it("writes a Windows path with backslashes and the home folder as ~", () => {
    expect(displayPath("C:/Users/dj/Music/rekordbox/collection.xml")).toBe(
      "~\\Music\\rekordbox\\collection.xml",
    );
    expect(displayPath("c:\\Users\\dj\\Music\\a.xml")).toBe("~\\Music\\a.xml");
  });

  it("keeps a Windows path outside the home folder, with backslashes", () => {
    expect(displayPath("D:/Sets/friday.txt")).toBe("D:\\Sets\\friday.txt");
  });

  it("writes macOS and Linux paths with slashes and ~", () => {
    expect(displayPath("/Users/dj/Music/a.xml")).toBe("~/Music/a.xml");
    expect(displayPath("/home/dj/Music/a.xml")).toBe("~/Music/a.xml");
    expect(displayPath("/Volumes/Gig/a.xml")).toBe("/Volumes/Gig/a.xml");
  });

  it("shows the home folder itself as ~", () => {
    expect(displayPath("/Users/dj")).toBe("~");
  });

  it("does not take another folder that merely starts alike for the home folder", () => {
    expect(displayPath("/Users")).toBe("/Users");
    expect(displayPath("/homework/a.xml")).toBe("/homework/a.xml");
  });

  it("can keep the home folder as written", () => {
    expect(displayPath("/Users/dj/a.xml", { keepHome: true })).toBe("/Users/dj/a.xml");
  });

  it("keeps a network path's two leading backslashes", () => {
    expect(displayPath("\\\\nas\\music\\a.xml")).toBe("\\\\nas\\music\\a.xml");
  });

  it("collapses doubled separators", () => {
    expect(displayPath("/Users/dj//Music///a.xml")).toBe("~/Music/a.xml");
  });

  it.each([null, undefined, "", "   "])("is empty for %j", (value) => {
    expect(displayPath(value)).toBe("");
  });

  it("reads which system wrote a path", () => {
    expect(isWindowsPath("C:\\a")).toBe(true);
    expect(isWindowsPath("C:/a")).toBe(true);
    expect(isWindowsPath("\\\\nas\\a")).toBe(true);
    expect(isWindowsPath("/a/b")).toBe(false);
    expect(isWindowsPath("relative.xml")).toBe(false);
  });
});

describe("pathParts and the file name first", () => {
  it("splits the name from its folder, in display form", () => {
    expect(pathParts("C:/Users/dj/Music/a.xml")).toEqual({ name: "a.xml", folder: "~\\Music" });
    expect(pathParts("/Volumes/Gig/a.xml")).toEqual({ name: "a.xml", folder: "/Volumes/Gig" });
  });

  it("is a name alone when there is no folder", () => {
    expect(pathParts("a.xml")).toEqual({ name: "a.xml", folder: "" });
  });

  it("keeps a root as a folder", () => {
    expect(pathParts("/a.xml")).toEqual({ name: "a.xml", folder: "/" });
    expect(pathParts("C:\\a.xml")).toEqual({ name: "a.xml", folder: "C:\\" });
  });

  it("ignores a trailing separator", () => {
    expect(pathParts("/Volumes/Gig/")).toEqual({ name: "Gig", folder: "/Volumes" });
  });

  it("puts the name first", () => {
    expect(displayPathNameFirst("/Users/dj/Music/rekordbox/collection.xml")).toBe(
      "collection.xml — ~/Music/rekordbox",
    );
    expect(displayPathNameFirst("collection.xml")).toBe("collection.xml");
    expect(displayPathNameFirst("")).toBe("");
  });
});

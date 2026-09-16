import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CLEAN_SECTIONS,
  CLEAN_SECTION_STORAGE_KEY,
  loadCleanSection,
  saveCleanSection,
} from "./cleanSections";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("the Clean page's parts", () => {
  it("are the four DEC-072 names, in order", () => {
    expect(CLEAN_SECTIONS.map((section) => section.label)).toEqual([
      "Review",
      "Missing files",
      "Duplicates",
      "Health",
    ]);
  });

  it("open on Review the first time", () => {
    expect(loadCleanSection()).toBe("review");
  });

  it("reopen on the part last used", () => {
    saveCleanSection("duplicates");
    expect(localStorage.getItem(CLEAN_SECTION_STORAGE_KEY)).toBe("duplicates");
    expect(loadCleanSection()).toBe("duplicates");
  });

  it("open on Review when what was stored is not a part", () => {
    localStorage.setItem(CLEAN_SECTION_STORAGE_KEY, "inkey");
    expect(loadCleanSection()).toBe("review");
  });

  it("work when storage cannot be used", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(loadCleanSection()).toBe("review");
    expect(() => saveCleanSection("health")).not.toThrow();
  });
});

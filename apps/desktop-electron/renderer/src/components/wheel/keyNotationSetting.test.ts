import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  KEY_NOTATION_STORAGE_KEY,
  applyKeyNotation,
  loadKeyNotation,
  resetKeyNotationForTests,
  saveKeyNotation,
} from "./keyNotationSetting";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.keyNotation;
  resetKeyNotationForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the Keys written as setting (K1)", () => {
  it("is Camelot until another is chosen", () => {
    expect(loadKeyNotation()).toBe("camelot");
  });

  it("remembers Musical, Both and Camelot again", () => {
    for (const notation of ["musical", "both", "camelot"] as const) {
      saveKeyNotation(notation);
      expect(localStorage.getItem(KEY_NOTATION_STORAGE_KEY)).toBe(notation);
      expect(loadKeyNotation()).toBe(notation);
    }
  });

  it("reads anything it does not know as Camelot", () => {
    localStorage.setItem(KEY_NOTATION_STORAGE_KEY, "solfege");
    expect(loadKeyNotation()).toBe("camelot");
  });

  it("reads storage that throws as Camelot", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadKeyNotation()).toBe("camelot");
  });

  it("still applies a choice storage refuses to keep", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    saveKeyNotation("musical");
    expect(document.documentElement.dataset.keyNotation).toBe("musical");
  });
});

describe("the page attribute", () => {
  it("is data-key-notation when not Camelot, and gone for Camelot", () => {
    saveKeyNotation("both");
    expect(document.documentElement.dataset.keyNotation).toBe("both");
    saveKeyNotation("camelot");
    expect(document.documentElement.dataset.keyNotation).toBeUndefined();
  });

  it("is set at start from what is stored", () => {
    localStorage.setItem(KEY_NOTATION_STORAGE_KEY, "musical");
    applyKeyNotation();
    expect(document.documentElement.dataset.keyNotation).toBe("musical");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  KEY_COLOURS_STORAGE_KEY,
  applyKeyColours,
  loadKeyColours,
  resetKeyColoursForTests,
  saveKeyColours,
} from "./keyColourSetting";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.keyColours;
  resetKeyColoursForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the Colour keys setting", () => {
  it("is on until it is switched off", () => {
    expect(loadKeyColours()).toBe(true);
  });

  it("remembers off, and on again", () => {
    saveKeyColours(false);
    expect(localStorage.getItem(KEY_COLOURS_STORAGE_KEY)).toBe("off");
    expect(loadKeyColours()).toBe(false);
    saveKeyColours(true);
    expect(localStorage.getItem(KEY_COLOURS_STORAGE_KEY)).toBe("on");
    expect(loadKeyColours()).toBe(true);
  });

  it("reads anything it does not know as on", () => {
    localStorage.setItem(KEY_COLOURS_STORAGE_KEY, "maybe");
    expect(loadKeyColours()).toBe(true);
  });

  it("reads storage that throws as on", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadKeyColours()).toBe(true);
  });

  it("still applies a choice storage refuses to keep", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    saveKeyColours(false);
    expect(document.documentElement.dataset.keyColours).toBe("off");
  });
});

describe("the page attribute", () => {
  it("is data-key-colours=off when off, and gone when on", () => {
    saveKeyColours(false);
    expect(document.documentElement.dataset.keyColours).toBe("off");
    saveKeyColours(true);
    expect(document.documentElement.dataset.keyColours).toBeUndefined();
  });

  it("is applied from storage at start", () => {
    localStorage.setItem(KEY_COLOURS_STORAGE_KEY, "off");
    applyKeyColours();
    expect(document.documentElement.dataset.keyColours).toBe("off");
  });
});

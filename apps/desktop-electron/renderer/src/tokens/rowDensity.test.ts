import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ROW_DENSITY_STORAGE_KEY,
  applyRowDensity,
  loadRowDensity,
  resetRowDensityForTests,
  saveRowDensity,
} from "./rowDensity";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.rowDensity;
  resetRowDensityForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the Row density setting", () => {
  it("is compact until roomy is chosen", () => {
    expect(loadRowDensity()).toBe("compact");
  });

  it("remembers roomy, and compact again", () => {
    saveRowDensity("roomy");
    expect(localStorage.getItem(ROW_DENSITY_STORAGE_KEY)).toBe("roomy");
    expect(loadRowDensity()).toBe("roomy");
    saveRowDensity("compact");
    expect(localStorage.getItem(ROW_DENSITY_STORAGE_KEY)).toBe("compact");
    expect(loadRowDensity()).toBe("compact");
  });

  it("reads anything it does not know as compact", () => {
    localStorage.setItem(ROW_DENSITY_STORAGE_KEY, "huge");
    expect(loadRowDensity()).toBe("compact");
  });

  it("reads storage that throws as compact", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadRowDensity()).toBe("compact");
  });

  it("still applies a choice storage refuses to keep", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    saveRowDensity("roomy");
    expect(document.documentElement.dataset.rowDensity).toBe("roomy");
  });
});

describe("the page attribute", () => {
  it("is data-row-density=roomy when roomy, and gone when compact", () => {
    saveRowDensity("roomy");
    expect(document.documentElement.dataset.rowDensity).toBe("roomy");
    saveRowDensity("compact");
    expect(document.documentElement.dataset.rowDensity).toBeUndefined();
  });

  it("is applied from storage at start", () => {
    localStorage.setItem(ROW_DENSITY_STORAGE_KEY, "roomy");
    applyRowDensity();
    expect(document.documentElement.dataset.rowDensity).toBe("roomy");
  });
});

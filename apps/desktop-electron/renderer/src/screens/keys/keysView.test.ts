import { afterEach, describe, expect, it, vi } from "vitest";

import keysCss from "./keys.css?raw";
import { KEYS_VIEW_STORAGE_KEY, loadView, saveView } from "./keysView";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("the remembered Keys view (K15)", () => {
  it("starts on the wheel", () => {
    expect(loadView()).toBe("wheel");
  });

  it("is remembered under cuepoint-keys-view", () => {
    saveView("list");
    expect(KEYS_VIEW_STORAGE_KEY).toBe("cuepoint-keys-view");
    expect(localStorage.getItem("cuepoint-keys-view")).toBe("list");
    expect(loadView()).toBe("list");
    saveView("wheel");
    expect(loadView()).toBe("wheel");
  });

  it("reads anything else as the wheel", () => {
    localStorage.setItem("cuepoint-keys-view", "grid");
    expect(loadView()).toBe("wheel");
  });

  it("works when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadView()).toBe("wheel");
    expect(() => saveView("list")).not.toThrow();
  });
});

describe("the counts list's key column", () => {
  it("is wider than three characters, so a 10A or 10B chip never runs into the key name", () => {
    const css = keysCss;
    const row = /\.keys-counts__row\s*\{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(row).toContain("grid-template-columns");
    expect(row).not.toMatch(/grid-template-columns:\s*3ch/);
    expect(row).toMatch(/grid-template-columns:\s*calc\(4ch \+ 2 \* var\(--key-chip-pad/);
  });

  it("leaves no gap of its own between the header and the top row", () => {
    const css = keysCss;
    const top = /\.keys-page__top\s*\{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(top).toMatch(/padding:\s*0 0 var\(--space-lg\)/);
  });
});

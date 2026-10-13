import { afterEach, describe, expect, it, vi } from "vitest";

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

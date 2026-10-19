import { describe, expect, it } from "vitest";

import { NEEDS_DESKTOP, needsDesktopApp } from "./userMessage";

describe("needsDesktopApp (C162)", () => {
  it("is the one sentence when no feature is named", () => {
    expect(needsDesktopApp()).toBe(NEEDS_DESKTOP);
    expect(NEEDS_DESKTOP).toBe("This needs the CuePoint desktop app.");
  });

  it("names a feature at the start of the same sentence", () => {
    expect(needsDesktopApp("Reading the keys")).toBe("Reading the keys needs the CuePoint desktop app.");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { hasShortcutModifier } from "./platformKeys";

afterEach(() => vi.restoreAllMocks());

describe("hasShortcutModifier", () => {
  it("is Ctrl on every platform", () => {
    for (const name of ["MacIntel", "Win32", "Linux x86_64"]) {
      vi.spyOn(navigator, "platform", "get").mockReturnValue(name);
      expect(hasShortcutModifier({ ctrlKey: true, metaKey: false })).toBe(true);
    }
  });

  it("is Cmd on macOS only", () => {
    const platform = vi.spyOn(navigator, "platform", "get");
    platform.mockReturnValue("MacIntel");
    expect(hasShortcutModifier({ ctrlKey: false, metaKey: true })).toBe(true);
    platform.mockReturnValue("Win32");
    expect(hasShortcutModifier({ ctrlKey: false, metaKey: true })).toBe(false);
  });

  it("is false with neither", () => {
    expect(hasShortcutModifier({ ctrlKey: false, metaKey: false })).toBe(false);
  });
});

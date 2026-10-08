import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScaleProvider, useScale } from "./ScaleContext";
import { ThemeProvider, useTheme } from "./ThemeContext";
import { getStoredScale, setStoredScale } from "./scale";
import { DEFAULT_THEME, getStoredThemeId, persistThemeId, setTheme } from "./theme";

/**
 * The scale and the theme with storage that throws on every call: disabled,
 * full, or a private window. Both are read as the app starts, so a read that
 * threw left nothing on screen. Each now reads as its default, and a choice is
 * applied for the session even when it cannot be remembered.
 */
beforeEach(() => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("storage disabled");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("storage disabled");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-scale");
  document.documentElement.removeAttribute("style");
});

describe("storage that throws", () => {
  it("reads the scale and the theme as their defaults", () => {
    expect(getStoredScale()).toBe(1.5);
    expect(getStoredThemeId()).toBe(DEFAULT_THEME);
  });

  it("still applies a scale and a theme it cannot remember", () => {
    expect(() => setStoredScale(3)).not.toThrow();
    expect(document.documentElement.dataset.scale).toBe("3");
    expect(() => persistThemeId("retro16")).not.toThrow();
    setTheme("retro16");
    expect(document.documentElement.dataset.theme).toBe("retro16");
  });

  it("lets the app's providers start, and change", () => {
    render(
      <ThemeProvider>
        <ScaleProvider>
          <p>started</p>
        </ScaleProvider>
      </ThemeProvider>,
    );
    expect(screen.getByText("started")).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe(DEFAULT_THEME);
    expect(document.documentElement.dataset.scale).toBe("1.5");

    const scale = renderHook(() => useScale(), { wrapper: ScaleProvider });
    act(() => scale.result.current.setScale(1));
    expect(scale.result.current.scale).toBe(1);

    const theme = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    act(() => theme.result.current.setTheme("clubNeon"));
    expect(theme.result.current.activeThemeId).toBe("clubNeon");
    expect(document.documentElement.dataset.theme).toBe("clubNeon");
  });
});

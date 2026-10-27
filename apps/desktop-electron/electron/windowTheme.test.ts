import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_WINDOW_THEME,
  applyWindowTheme,
  normalizeHexColour,
  parseWindowTheme,
} from "./windowTheme";

describe("the colour", () => {
  it.each([
    ["#18181b", "#18181b"],
    ["#ABC", "#aabbcc"],
    ["  #1E1E1E ", "#1e1e1e"],
  ])("reads %j as %j", (value, expected) => {
    expect(normalizeHexColour(value)).toBe(expected);
  });

  it.each(["", "18181b", "#12345", "#gggggg", "red", "rgb(0,0,0)", "#18181bff", null, 5, {}])(
    "refuses %j",
    (value) => {
      expect(normalizeHexColour(value)).toBeNull();
    },
  );
});

describe("the theme the page sends", () => {
  it("is a colour and one of the two schemes", () => {
    expect(parseWindowTheme({ background: "#1E1E1E", scheme: "dark" })).toEqual({
      background: "#1e1e1e",
      scheme: "dark",
    });
    expect(parseWindowTheme({ background: "#fff", scheme: "light" })).toEqual({
      background: "#ffffff",
      scheme: "light",
    });
  });

  it.each([
    null,
    "dark",
    [],
    {},
    { background: "#000" },
    { scheme: "dark" },
    { background: "#000", scheme: "system" },
    { background: "url(x)", scheme: "dark" },
  ])("refuses %j", (value) => {
    expect(parseWindowTheme(value)).toBeNull();
  });

  it("starts at Neo dark, the app's own default", () => {
    expect(DEFAULT_WINDOW_THEME).toEqual({ background: "#18181b", scheme: "dark" });
  });
});

describe("applying it", () => {
  function targets() {
    const setBackgroundColor = vi.fn();
    const remember = vi.fn();
    const nativeTheme = { themeSource: "system" as "system" | "light" | "dark" };
    const t = {
      nativeTheme,
      window: () => ({ setBackgroundColor, isDestroyed: () => false }),
      remember,
    };
    return { t, setBackgroundColor, remember, nativeTheme };
  }

  it("sets the system theme source, the window colour, and remembers it", () => {
    const { t, setBackgroundColor, remember, nativeTheme } = targets();
    expect(applyWindowTheme(t, { background: "#0A0A0F", scheme: "dark" })).toBe(true);
    expect(nativeTheme.themeSource).toBe("dark");
    expect(setBackgroundColor).toHaveBeenCalledWith("#0a0a0f");
    expect(remember).toHaveBeenCalledWith({ background: "#0a0a0f", scheme: "dark" });
  });

  it("follows a light theme", () => {
    const { t, nativeTheme } = targets();
    applyWindowTheme(t, { background: "#ffffff", scheme: "light" });
    expect(nativeTheme.themeSource).toBe("light");
  });

  it("changes nothing for what is not a theme", () => {
    const { t, setBackgroundColor, remember, nativeTheme } = targets();
    expect(applyWindowTheme(t, { background: "javascript:1", scheme: "dark" })).toBe(false);
    expect(nativeTheme.themeSource).toBe("system");
    expect(setBackgroundColor).not.toHaveBeenCalled();
    expect(remember).not.toHaveBeenCalled();
  });

  it("is not failed by a window that is gone or a file that cannot be written", () => {
    const { nativeTheme } = targets();
    const t = {
      nativeTheme,
      window: () => ({
        setBackgroundColor: () => {
          throw new Error("destroyed");
        },
        isDestroyed: () => false,
      }),
      remember: () => {
        throw new Error("read-only");
      },
    };
    expect(applyWindowTheme(t, { background: "#18181b", scheme: "dark" })).toBe(true);
    expect(nativeTheme.themeSource).toBe("dark");
  });

  it("skips a destroyed window and one that does not exist", () => {
    const setBackgroundColor = vi.fn();
    const { nativeTheme } = targets();
    applyWindowTheme(
      { nativeTheme, window: () => ({ setBackgroundColor, isDestroyed: () => true }), remember: () => undefined },
      { background: "#18181b", scheme: "dark" },
    );
    applyWindowTheme(
      { nativeTheme, window: () => null, remember: () => undefined },
      { background: "#18181b", scheme: "dark" },
    );
    expect(setBackgroundColor).not.toHaveBeenCalled();
  });
});

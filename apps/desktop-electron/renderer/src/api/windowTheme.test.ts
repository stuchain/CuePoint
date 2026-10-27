import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cssColourToHex, readWindowTheme, startWindowThemeSync, windowTitle } from "./windowTheme";

describe("windowTitle (M501)", () => {
  it("is the page and CuePoint", () => {
    expect(windowTitle("Library")).toBe("Library — CuePoint");
  });

  it("is the playing track while one plays", () => {
    expect(windowTitle("Library", { title: "Strobe", artist: "deadmau5" })).toBe("Strobe — deadmau5 — CuePoint");
    expect(windowTitle("Library", { title: "Strobe" })).toBe("Strobe — CuePoint");
    expect(windowTitle("Library", { title: "  ", artist: null })).toBe("Library — CuePoint");
  });

  it("is CuePoint alone with nothing to say", () => {
    expect(windowTitle(null)).toBe("CuePoint");
    expect(windowTitle("", null)).toBe("CuePoint");
  });

  it("cleans control characters and spaces, and cuts a long name", () => {
    expect(windowTitle("Li\u0000brary\n\n  Two")).toBe("Li brary Two — CuePoint");
    const long = windowTitle("x".repeat(500));
    expect(long.length).toBeLessThanOrEqual(120 + " — CuePoint".length);
    expect(long).toContain("…");
  });
});

describe("cssColourToHex", () => {
  it.each([
    ["#18181b", "#18181b"],
    ["#ABC", "#aabbcc"],
    ["#18181bcc", "#18181b"],
    ["rgb(24, 24, 27)", "#18181b"],
    ["rgb(24 24 27)", "#18181b"],
    ["rgba(24, 24, 27, 0.5)", "#18181b"],
    ["rgb(24 24 27 / 50%)", "#18181b"],
    ["  #FFFFFF ", "#ffffff"],
  ])("reads %j as %j", (text, expected) => {
    expect(cssColourToHex(text)).toBe(expected);
  });

  it.each(["", "red", "color-mix(in srgb, red, blue)", "rgb(300, 0, 0)", "#12", "var(--x)"])(
    "does not read %j",
    (text) => {
      expect(cssColourToHex(text)).toBeNull();
    },
  );
});

describe("readWindowTheme", () => {
  function root(vars: Record<string, string>): HTMLElement {
    const el = document.createElement("div");
    for (const [name, value] of Object.entries(vars)) el.style.setProperty(name, value);
    document.body.appendChild(el);
    return el;
  }
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("is the page's --bg-app and --color-scheme", () => {
    expect(readWindowTheme(root({ "--bg-app": "#1e1e1e", "--color-scheme": "dark" }))).toEqual({
      background: "#1e1e1e",
      scheme: "dark",
    });
    expect(readWindowTheme(root({ "--bg-app": "#fafafa", "--color-scheme": "light" }))).toEqual({
      background: "#fafafa",
      scheme: "light",
    });
  });

  it("reads the scheme from the background when the theme does not say", () => {
    expect(readWindowTheme(root({ "--bg-app": "#fafafa" }))!.scheme).toBe("light");
    expect(readWindowTheme(root({ "--bg-app": "#101010" }))!.scheme).toBe("dark");
    expect(readWindowTheme(root({ "--bg-app": "#101010", "--color-scheme": "dark light" }))!.scheme).toBe("dark");
  });

  it("is none when the page has no background colour", () => {
    expect(readWindowTheme(root({}))).toBeNull();
  });
});

describe("startWindowThemeSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  function page(vars: Record<string, string>) {
    const el = document.createElement("div");
    for (const [name, value] of Object.entries(vars)) el.style.setProperty(name, value);
    document.body.appendChild(el);
    return el;
  }

  it("sends the theme at once", () => {
    const send = vi.fn();
    const stop = startWindowThemeSync(page({ "--bg-app": "#18181b", "--color-scheme": "dark" }), send);
    expect(send).toHaveBeenCalledWith({ background: "#18181b", scheme: "dark" });
    stop();
  });

  it("sends again once a change has settled, and not for a change that changes nothing", async () => {
    const send = vi.fn();
    const el = page({ "--bg-app": "#18181b", "--color-scheme": "dark" });
    const stop = startWindowThemeSync(el, send);
    expect(send).toHaveBeenCalledTimes(1);

    el.style.setProperty("--bg-app", "#202020");
    el.style.setProperty("--bg-app", "#242424");
    await Promise.resolve();
    vi.advanceTimersByTime(200);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith({ background: "#242424", scheme: "dark" });

    el.setAttribute("data-theme", "other");
    await Promise.resolve();
    vi.advanceTimersByTime(200);
    expect(send).toHaveBeenCalledTimes(2);
    stop();
  });

  it("stops sending once stopped", async () => {
    const send = vi.fn();
    const el = page({ "--bg-app": "#18181b", "--color-scheme": "dark" });
    const stop = startWindowThemeSync(el, send);
    stop();
    el.style.setProperty("--bg-app", "#ffffff");
    await Promise.resolve();
    vi.advanceTimersByTime(500);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("is not failed by main refusing", async () => {
    const send = vi.fn(() => Promise.reject(new Error("no")));
    const stop = startWindowThemeSync(page({ "--bg-app": "#18181b" }), send);
    await Promise.resolve();
    expect(send).toHaveBeenCalled();
    stop();
  });

  it("does nothing without the shell", () => {
    const stop = startWindowThemeSync(page({ "--bg-app": "#18181b" }));
    stop();
  });
});

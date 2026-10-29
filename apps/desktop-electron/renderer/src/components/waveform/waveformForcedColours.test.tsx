import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PAINT_TOKENS, resolvePaint } from "./waveformPaint";
import { FORCED_PAINTS, themeTokens, useThemeRevision } from "./waveformEnvironment";

/**
 * Windows high contrast and the waveform (HARDEN-08, DEC-186). A canvas's pixels are not recoloured by
 * forced colours, so the playhead, drawn in the theme's near-white, would be invisible on a light
 * high-contrast page. While forced colours are on the paints are system colours; otherwise nothing changes.
 */

type Listener = () => void;

function forced(active: boolean) {
  const listeners = new Set<Listener>();
  const list = {
    get matches() {
      return active;
    },
    media: "(forced-colors: active)",
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
  };
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => (query.includes("forced-colors") ? list : { matches: false, addEventListener() {}, removeEventListener() {} })),
  });
  return {
    turn(on: boolean) {
      active = on;
      listeners.forEach((each) => each());
    },
  };
}

afterEach(() => {
  Reflect.deleteProperty(window, "matchMedia");
  document.documentElement.style.removeProperty("--fg-primary");
  document.documentElement.style.removeProperty("--waveform-mid");
});

describe("the waveform's paints in forced colours", () => {
  it("names a system colour for every waveform paint and the playhead", () => {
    for (const token of Object.values(PAINT_TOKENS)) expect(FORCED_PAINTS[token], token).toBeDefined();
    expect(FORCED_PAINTS["--fg-primary"]).toBe("Highlight");
  });

  it("draws the playhead, the bars and the played half in system colours while forced colours are on", () => {
    forced(true);
    document.documentElement.style.setProperty("--fg-primary", "#fafafa");
    document.documentElement.style.setProperty("--waveform-mid", "#22cc88");
    expect(resolvePaint("playhead", themeTokens)).toBe("Highlight");
    expect(resolvePaint("mid", themeTokens)).toBe("CanvasText");
    expect(resolvePaint("played", themeTokens)).toBe("GrayText");
  });

  it("changes nothing in normal mode: the paints are the theme's own tokens", () => {
    forced(false);
    document.documentElement.style.setProperty("--fg-primary", "#fafafa");
    document.documentElement.style.setProperty("--waveform-mid", "#22cc88");
    expect(resolvePaint("playhead", themeTokens)).toBe("#fafafa");
    expect(resolvePaint("mid", themeTokens)).toBe("#22cc88");
  });

  it("changes nothing where there is no media query to ask", () => {
    document.documentElement.style.setProperty("--fg-primary", "#fafafa");
    expect(resolvePaint("playhead", themeTokens)).toBe("#fafafa");
  });

  it("repaints when forced colours are turned on or off", () => {
    const media = forced(false);
    const { result } = renderHook(() => useThemeRevision());
    const before = result.current;
    act(() => media.turn(true));
    expect(result.current).toBeGreaterThan(before);
  });
});

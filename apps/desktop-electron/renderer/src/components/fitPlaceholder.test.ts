import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, useRef } from "react";
import { render } from "@testing-library/react";

import { placeholderFor, useFitPlaceholder } from "./fitPlaceholder";

describe("placeholderFor", () => {
  const full = "Search these tracks…";
  it("keeps the full hint while it fits", () => {
    expect(placeholderFor(full, 120, 140)).toBe(full);
    expect(placeholderFor(full, 140, 140)).toBe(full);
  });
  it("says Search… when the box is too narrow for it", () => {
    expect(placeholderFor(full, 160, 100)).toBe("Search…");
  });
  it("keeps the full hint where there is no layout to measure", () => {
    expect(placeholderFor(full, 160, 0)).toBe(full);
  });
});

describe("useFitPlaceholder re-measures once the fonts are ready (N9)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (document as unknown as Record<string, unknown>).fonts;
  });

  function Probe() {
    const ref = useRef<HTMLInputElement>(null);
    useFitPlaceholder(ref, "Search these tracks…");
    return createElement("input", { ref, "data-testid": "box" });
  }

  it("measures again after document.fonts.ready", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    let release: () => void = () => {};
    Object.defineProperty(document, "fonts", { configurable: true, value: { ready: new Promise<void>((r) => (release = r)) } });
    const width = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(100);
    const measureText = vi.fn(() => ({ width: 500 }));
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => ({ measureText })) as never;
    try {
      const view = render(createElement(Probe));
      const calls = measureText.mock.calls.length;
      release();
      await Promise.resolve();
      await Promise.resolve();
      expect(measureText.mock.calls.length).toBeGreaterThan(calls);
      expect((view.getByTestId("box") as HTMLInputElement).placeholder).toBe("Search…");
    } finally {
      HTMLCanvasElement.prototype.getContext = original;
      width.mockRestore();
    }
  });

  it("copes with no document.fonts", () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    expect(() => render(createElement(Probe))).not.toThrow();
  });
});

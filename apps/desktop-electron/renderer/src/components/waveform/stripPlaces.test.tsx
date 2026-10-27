import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { STRIP_MAX_SCALE, STRIP_PAGES, useContentEdge, useStripPage } from "./stripPlaces";

/** D27, D11, M315, M318: where the zoomed strip is drawn. */
afterEach(() => {
  window.location.hash = "";
  document.body.innerHTML = "";
});

describe("the pages that show the zoomed strip", () => {
  it("are Library, Prepare and Keys, and it collapses from 2x", () => {
    expect(STRIP_PAGES).toEqual(["library", "prepare", "keys"]);
    expect(STRIP_MAX_SCALE).toBe(2);
  });

  it.each([
    ["#/library", true],
    ["#/prepare", true],
    ["#/prepare/set/4", true],
    ["#/keys", true],
    ["#/clean", false],
    ["#/discover", false],
    ["#/discover/artist/x", false],
    ["#/statistics", false],
    ["#/settings", false],
    ["", true],
  ])("%s -> %s", (hash, shown) => {
    window.location.hash = hash;
    const { result } = renderHook(() => useStripPage());
    expect(result.current).toBe(shown);
  });

  it("follows the route when it changes", () => {
    window.location.hash = "#/library";
    const { result } = renderHook(() => useStripPage());
    expect(result.current).toBe(true);
    act(() => {
      window.location.hash = "#/settings";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(result.current).toBe(false);
  });
});

describe("the content edge", () => {
  it("is 0 with no shell, and the content's left with one", () => {
    expect(renderHook(() => useContentEdge()).result.current).toBe(0);
    const content = document.createElement("div");
    content.className = "app-shell__content";
    content.getBoundingClientRect = () => ({ left: 187.4 }) as DOMRect;
    document.body.append(content);
    expect(renderHook(() => useContentEdge()).result.current).toBe(187);
  });
});

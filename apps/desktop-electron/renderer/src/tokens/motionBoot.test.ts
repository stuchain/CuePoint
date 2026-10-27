/**
 * The motion boot script in index.html (M381): it writes `data-motion-<kind>` before React runs,
 * by the same rule MotionProvider follows, so the first frame knows which kinds move. These tests
 * run the script itself and hold its kinds and storage keys to tokens/motion.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import html from "../../index.html?raw";
import { MOTION_FOLLOW_SYSTEM_KEY, MOTION_KINDS, MOTION_STORAGE_KEY } from "./motion";

const script = /<script id="boot-motion">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";

function boot(reduced = false) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduced && query.includes("reduce") }));
  new Function(script)();
}

function written(): string[] {
  return MOTION_KINDS.map((kind) => kind.id).filter((id) => document.documentElement.getAttribute(`data-motion-${id}`) === "on");
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  for (const kind of MOTION_KINDS) document.documentElement.removeAttribute(`data-motion-${kind.id}`);
});

describe("the motion boot script (M381)", () => {
  it("is in index.html, before the app's module script", () => {
    expect(script).not.toBe("");
    expect(html.indexOf('id="boot-motion"')).toBeLessThan(html.indexOf('type="module"'));
  });

  it("names every kind and the storage keys tokens/motion.ts uses", () => {
    expect(script).toContain(JSON.stringify(MOTION_STORAGE_KEY));
    expect(script).toContain(JSON.stringify(MOTION_FOLLOW_SYSTEM_KEY));
    for (const kind of MOTION_KINDS) expect(script).toContain(JSON.stringify(kind.id));
  });

  it("turns every kind on by default", () => {
    boot();
    expect(written()).toEqual(MOTION_KINDS.map((kind) => kind.id));
  });

  it("leaves off a kind the user switched off", () => {
    localStorage.setItem(MOTION_STORAGE_KEY, JSON.stringify({ hover: false, page: true }));
    boot();
    expect(written()).not.toContain("hover");
    expect(written()).toContain("page");
  });

  it("writes none under reduced motion while Follow system is chosen, and the switches when it is not", () => {
    boot(true);
    expect(written()).toEqual([]);
    localStorage.setItem(MOTION_FOLLOW_SYSTEM_KEY, "false");
    boot(true);
    expect(written()).toEqual(MOTION_KINDS.map((kind) => kind.id));
  });

  it("survives storage that throws or holds rubbish", () => {
    localStorage.setItem(MOTION_STORAGE_KEY, "{not json");
    boot();
    expect(written()).toEqual(MOTION_KINDS.map((kind) => kind.id));
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => new Function(script)()).not.toThrow();
  });
});

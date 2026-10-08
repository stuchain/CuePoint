import { act, render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MotionProvider, useMotion } from "./MotionContext";
import { MOTION_KINDS, MOTION_STORAGE_KEY } from "./motion";

/** A controllable `prefers-reduced-motion` query. */
function mockMatchMedia(initial: boolean, legacy = false) {
  let matches = initial;
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const mql: Record<string, unknown> = {
    get matches() {
      return matches;
    },
    media: "(prefers-reduced-motion: reduce)",
  };
  if (legacy) {
    mql.addListener = vi.fn((l) => listeners.add(l));
    mql.removeListener = vi.fn((l) => listeners.delete(l));
  } else {
    mql.addEventListener = vi.fn((_t, l) => listeners.add(l));
    mql.removeEventListener = vi.fn((_t, l) => listeners.delete(l));
  }
  window.matchMedia = vi.fn(() => mql) as unknown as typeof window.matchMedia;
  return {
    mql,
    listeners,
    set(next: boolean) {
      matches = next;
      act(() => listeners.forEach((l) => l({ matches })));
    },
  };
}

const wrapper = ({ children }: { children: ReactNode }) => <MotionProvider>{children}</MotionProvider>;
const html = document.documentElement;
const attrs = () => MOTION_KINDS.filter((k) => html.hasAttribute(`data-motion-${k.id}`)).map((k) => k.id);

beforeEach(() => {
  localStorage.clear();
  mockMatchMedia(false);
});
afterEach(() => {
  localStorage.clear();
  for (const k of MOTION_KINDS) html.removeAttribute(`data-motion-${k.id}`);
  Reflect.deleteProperty(window, "matchMedia");
});

describe("MotionProvider", () => {
  it("writes an attribute for every kind that is on", () => {
    render(<MotionProvider>x</MotionProvider>);
    expect(attrs()).toHaveLength(10);
    expect(html.getAttribute("data-motion-micro")).toBe("on");
  });

  it("follows a switch, and remembers only the changed kind", () => {
    const { result } = renderHook(() => useMotion(), { wrapper });
    act(() => result.current.setKind("hover", false));
    expect(html).not.toHaveAttribute("data-motion-hover");
    expect(html).toHaveAttribute("data-motion-micro");
    expect(JSON.parse(localStorage.getItem(MOTION_STORAGE_KEY)!)).toEqual({ hover: false });
    expect(result.current.switches.hover).toBe(false);
  });

  it("turns all off and all on, writing all ten", () => {
    const { result } = renderHook(() => useMotion(), { wrapper });
    act(() => result.current.setAll(false));
    expect(attrs()).toEqual([]);
    expect(Object.keys(JSON.parse(localStorage.getItem(MOTION_STORAGE_KEY)!))).toHaveLength(10);
    act(() => result.current.setAll(true));
    expect(attrs()).toHaveLength(10);
  });

  it("resets to the defaults and hands back an undo", () => {
    const { result } = renderHook(() => useMotion(), { wrapper });
    act(() => result.current.setKind("page", false));
    let undo = () => {};
    act(() => {
      undo = result.current.reset();
    });
    expect(result.current.switches.page).toBe(true);
    expect(localStorage.getItem(MOTION_STORAGE_KEY)).toBeNull();
    act(() => undo());
    expect(result.current.switches.page).toBe(false);
    expect(html).not.toHaveAttribute("data-motion-page");
  });

  it("writes none while the system asks for reduced motion, and restores them when it clears", () => {
    const media = mockMatchMedia(true);
    const { result } = renderHook(() => useMotion(), { wrapper });
    expect(attrs()).toEqual([]);
    expect(result.current.systemReduced).toBe(true);
    // The switches keep their value; only the attributes go.
    expect(result.current.switches.micro).toBe(true);
    media.set(false);
    expect(attrs()).toHaveLength(10);
    expect(result.current.systemReduced).toBe(false);
    media.set(true);
    expect(attrs()).toEqual([]);
  });

  it("adds its listener and removes it on unmount", () => {
    const media = mockMatchMedia(false);
    const { unmount } = render(<MotionProvider>x</MotionProvider>);
    expect(media.listeners.size).toBe(1);
    unmount();
    expect(media.listeners.size).toBe(0);
  });

  it("falls back to addListener on an older query", () => {
    const media = mockMatchMedia(false, true);
    const { unmount } = render(<MotionProvider>x</MotionProvider>);
    expect(media.listeners.size).toBe(1);
    unmount();
    expect(media.listeners.size).toBe(0);
  });

  it("starts when matchMedia is missing", () => {
    Reflect.deleteProperty(window, "matchMedia");
    const { result } = renderHook(() => useMotion(), { wrapper });
    expect(result.current.systemReduced).toBe(false);
    expect(attrs()).toHaveLength(10);
  });

  it("throws outside a provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useMotion())).toThrow(/MotionProvider/);
    spy.mockRestore();
  });
});

describe("useMotion(kind)", () => {
  it("is whether the kind may move: on, off, and under reduced motion", () => {
    const { result } = renderHook(() => ({ motion: useMotion(), micro: useMotion("micro"), hover: useMotion("hover") }), { wrapper });
    expect(result.current.micro).toBe(true);
    act(() => result.current.motion.setKind("hover", false));
    expect(result.current.hover).toBe(false);
    expect(result.current.micro).toBe(true);
  });

  it("is false while the system asks for reduced motion, whatever the switches say", () => {
    const media = mockMatchMedia(true);
    const { result } = renderHook(() => useMotion("state"), { wrapper });
    expect(result.current).toBe(false);
    media.set(false);
    expect(result.current).toBe(true);
  });

  it("is false outside a provider, so a component alone shows its still state", () => {
    const { result } = renderHook(() => useMotion("page"));
    expect(result.current).toBe(false);
  });

  it("still throws for the switches outside a provider", () => {
    expect(() => renderHook(() => useMotion())).toThrow();
  });
});

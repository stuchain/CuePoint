import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  delete (window as { cuepoint?: unknown }).cuepoint;
});

describe("the panels told to the menu (M497)", () => {
  it("sends both halves, and only when one changes", async () => {
    const setViewState = vi.fn(() => Promise.resolve());
    (window as { cuepoint?: unknown }).cuepoint = { menu: { setViewState } };
    const { reportViewState } = await import("./menuViewState");
    reportViewState({ sidebar: true });
    reportViewState({ inspector: true });
    reportViewState({ inspector: true });
    expect(setViewState.mock.calls).toEqual([[{ inspector: false, sidebar: true }], [{ inspector: true, sidebar: true }]]);
  });

  it("does nothing without the desktop bridge", async () => {
    const { reportViewState } = await import("./menuViewState");
    expect(() => reportViewState({ sidebar: false })).not.toThrow();
  });
});

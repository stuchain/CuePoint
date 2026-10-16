import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import settingsCss from "./settings.css?raw";
import { useSectionInView } from "./useSectionInView";

class FakeObserver {
  static last: FakeObserver | null = null;
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    FakeObserver.last = this;
  }
  observe() {}
  disconnect() {}
}

function Probe({ ids, requested = null }: { ids: readonly string[]; requested?: { id: string; n: number } | null }) {
  const current = useSectionInView(ids, requested);
  return <output role="status">{current ?? "none"}</output>;
}

afterEach(() => vi.unstubAllGlobals());

describe("the section the side menu marks", () => {
  it("starts its band below the sticky header, so the section above a clicked one (still behind the header) is not current", () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    const ids = ["a", "b"] as const;
    render(
      <div className="app-main">
        <div className="screen" style={{ ["--screen-header-height" as string]: "64px" }}>
          <section id="a" />
          <section id="b" />
          <Probe ids={ids} />
        </div>
      </div>,
    );
    expect(FakeObserver.last?.options?.rootMargin).toBe("-64px 0px -66% 0px");
  });

  it("has no header offset where there is no header", () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    render(
      <div className="app-main">
        <section id="a" />
        <Probe ids={["a"]} />
      </div>,
    );
    expect(FakeObserver.last?.options?.rootMargin).toBe("0px 0px -66% 0px");
  });
});

describe("a section that was asked for", () => {
  function setup(requested: { id: string; n: number } | null) {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    const view = render(
      <div className="app-main" data-testid="scroller">
        <section id="a" />
        <section id="b" />
        <Probe ids={["a", "b"]} requested={requested} />
      </div>,
    );
    // Both are in the band: the page cannot scroll the second to the top.
    act(() => {
      FakeObserver.last!.callback(
        ["a", "b"].map((id) => ({ isIntersecting: true, target: document.getElementById(id)! }) as unknown as IntersectionObserverEntry),
        FakeObserver.last as unknown as IntersectionObserver,
      );
    });
    return view;
  }

  it("without an ask, the first section in the band is marked", () => {
    setup(null);
    expect(screen.getByRole("status")).toHaveTextContent("a");
  });

  it("with an ask, that section is marked rather than the first in the band", () => {
    setup({ id: "b", n: 1 });
    expect(screen.getByRole("status")).toHaveTextContent("b");
  });

  it("stays marked until the person scrolls, then the band decides again", () => {
    setup({ id: "b", n: 1 });
    expect(screen.getByRole("status")).toHaveTextContent("b");
    fireEvent.wheel(screen.getByTestId("scroller"));
    expect(screen.getByRole("status")).toHaveTextContent("a");
  });
});

describe("Settings sheet", () => {
  it("is not centred, adds no gap under the header, and its checkbox rows are 24px with the hit area kept", () => {
    const page = /\.settings-page\s*\{[^}]*\}/.exec(settingsCss)?.[0] ?? "";
    expect(page).toContain("gap: 0;");
    expect(page).toContain("margin: 0;");
    const check = /\.settings-check\s*\{[^}]*\}/.exec(settingsCss)?.[0] ?? "";
    expect(check).toContain("min-height: calc(24px * var(--scale));");
    expect(settingsCss).toMatch(/\.settings-check::before\s*\{[^}]*inset: calc\(-10px \* var\(--scale\)\) 0;/);
    const option = /\.settings-option\s*\{[^}]*\}/.exec(settingsCss)?.[0] ?? "";
    expect(option).toContain("gap: var(--space-xs);");
  });
});

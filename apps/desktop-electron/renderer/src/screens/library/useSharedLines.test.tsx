import { fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSharedLines } from "./useSharedLines";

const disconnect = vi.fn();

beforeEach(() => {
  disconnect.mockClear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect = disconnect;
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

function Body({
  withHeader = true,
  startFolded = false,
  wrap = 0,
}: {
  withHeader?: boolean;
  startFolded?: boolean;
  wrap?: number;
}) {
  const ref = useSharedLines();
  const [folded, setFolded] = useState(startFolded);
  return (
    <div data-testid="body" ref={ref}>
      <div className="cp-library-pane__scroll" data-client={300}>
        <div className="cp-library-pane__all" data-h={30} />
        <div className="cp-collections">
          <button type="button" className="cp-playlist-pane__fold" aria-expanded={!folded} onClick={() => setFolded(!folded)} />
        </div>
        <div className="cp-playlist-pane">
          <div className="cp-playlist-pane__head" data-h={30} />
        </div>
      </div>
      <div className="cp-filter-bar__row">
        <span data-top={0} data-h={24} />
        <span data-top={wrap} data-h={24} />
        {/* A hidden item: an empty box, which is not a line. */}
        <span data-top={-500} />
      </div>
      {withHeader && <div className="track-table__header" data-bottom={headerBottom} />}
    </div>
  );
}
let headerBottom = 120;

function stubRects() {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const h = Number(this.getAttribute("data-h") ?? 0);
    const bottom = this.getAttribute("data-bottom") != null ? Number(this.getAttribute("data-bottom")) : h;
    const top = Number(this.getAttribute("data-top") ?? 0);
    return { height: h, width: 0, top, left: 0, right: 0, bottom, x: 0, y: 0, toJSON() {} };
  };
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return Number(this.getAttribute("data-client") ?? 0);
    },
  });
  return () => {
    Element.prototype.getBoundingClientRect = original;
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
  };
}

describe("useSharedLines", () => {
  it("gives the Collections section the room that puts its rule on the table header's, when the pane can hold it", () => {
    const restore = stubRects();
    try {
      headerBottom = 120;
      const view = render(<Body />);
      // 120 (header's bottom) - 30 (All tracks) = 90; 90 + the Playlists heading (30) fits in 300.
      expect(view.getByTestId("body").style.getPropertyValue("--library-collections-min")).toBe("90px");
      view.unmount();
      expect(disconnect).toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("keeps the pane's own height when the filter bar wraps to a second line (C198)", () => {
    const restore = stubRects();
    try {
      // The bar's second line pushes the header 33 down; the section is not made 33 taller.
      headerBottom = 153;
      const view = render(<Body wrap={33} />);
      expect(view.getByTestId("body").style.getPropertyValue("--library-collections-min")).toBe("90px");
    } finally {
      restore();
    }
  });

  it("writes nothing when the header sits too far down for the pane (never a blank band)", () => {
    const restore = stubRects();
    try {
      headerBottom = 400;
      const view = render(<Body />);
      expect(view.getByTestId("body").style.getPropertyValue("--library-collections-min")).toBe("");
    } finally {
      restore();
    }
  });

  it("writes nothing without a table header", () => {
    const restore = stubRects();
    try {
      const view = render(<Body withHeader={false} />);
      expect(view.getByTestId("body").style.getPropertyValue("--library-collections-min")).toBe("");
    } finally {
      restore();
    }
  });

  it("writes nothing while the Collections section is folded, and again once it is opened (M5)", async () => {
    const restore = stubRects();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    try {
      headerBottom = 120;
      const view = render(<Body startFolded />);
      const body = view.getByTestId("body");
      expect(body.style.getPropertyValue("--library-collections-min")).toBe("");
      fireEvent.click(view.getByRole("button"));
      frames.splice(0).forEach((cb) => cb(0));
      expect(body.style.getPropertyValue("--library-collections-min")).toBe("90px");
      fireEvent.click(view.getByRole("button"));
      frames.splice(0).forEach((cb) => cb(0));
      expect(body.style.getPropertyValue("--library-collections-min")).toBe("");
    } finally {
      restore();
    }
  });

  it("watches direct children only, never the whole subtree (M6)", () => {
    const restore = stubRects();
    const observe = vi.fn();
    vi.stubGlobal(
      "MutationObserver",
      class {
        observe = observe;
        disconnect() {}
      },
    );
    try {
      render(<Body />);
      expect(observe).toHaveBeenCalled();
      for (const call of observe.mock.calls) expect(call[1]).toEqual({ childList: true });
    } finally {
      restore();
    }
  });

  it("does not rewrite the property when its value is unchanged (M6)", () => {
    const restore = stubRects();
    const set = vi.spyOn(CSSStyleDeclaration.prototype, "setProperty");
    try {
      headerBottom = 120;
      const view = render(<Body />);
      const before = set.mock.calls.filter((c) => c[0] === "--library-collections-min").length;
      // A resize that measures the same.
      view.rerender(<Body />);
      expect(set.mock.calls.filter((c) => c[0] === "--library-collections-min").length).toBe(before);
    } finally {
      set.mockRestore();
      restore();
    }
  });
});

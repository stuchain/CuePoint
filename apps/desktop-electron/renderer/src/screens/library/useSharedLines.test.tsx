import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import { useSharedLines } from "./useSharedLines";

let callback: (() => void) | null = null;
const disconnect = vi.fn();

beforeEach(() => {
  callback = null;
  disconnect.mockClear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb: () => void) {
        callback = cb;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

function Body({ search, toolbar }: { search: number; toolbar: number }) {
  const searchRef = useRef<HTMLDivElement>(null);
  const ref = useSharedLines(searchRef);
  return (
    <div data-testid="body" ref={ref}>
      <div
        ref={searchRef}
        data-h={search}
      />
      <div className="library-toolbar" data-h={toolbar} />
    </div>
  );
}

describe("useSharedLines", () => {
  it("writes the measured heights onto the body, in whole pixels, and clears them on unmount", () => {
    const rects = new Map<string, number>();
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const h = Number(this.getAttribute("data-h") ?? 0) + (rects.get("extra") ?? 0);
      return { height: h, width: 0, top: 0, left: 0, right: 0, bottom: h, x: 0, y: 0, toJSON() {} };
    };
    try {
      const view = render(<Body search={204.4} toolbar={241} />);
      const body = view.getByTestId("body");
      expect(body.style.getPropertyValue("--library-line-1")).toBe("204px");
      expect(body.style.getPropertyValue("--library-line-2")).toBe("241px");
      rects.set("extra", 10);
      callback?.();
      expect(body.style.getPropertyValue("--library-line-1")).toBe("214px");
      view.unmount();
      expect(disconnect).toHaveBeenCalled();
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
  });
});
